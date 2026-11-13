"""Script to run end-to-end field inference on a bounding box."""

import sys
import os
import json

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.services.field_segmentation.service import AIFieldDetectionService
from app.services.field_segmentation.schemas import ScanRequest

def main():
    service = AIFieldDetectionService.get_instance()

    # Umred, Maharashtra coordinates
    req = ScanRequest(
        bbox=(79.31, 20.83, 79.37, 20.87),
        zoom=14.0,
        min_confidence=0.40,
        min_field_area_ha=0.20
    )

    print(f"Submitting AI Field Detection scan for bbox: {req.bbox}")
    job = service.start_scan(req)
    print(f"Created job: {job.job_id}, status: {job.status}")

    # Wait for completion
    import time
    for _ in range(40):
        time.sleep(0.5)
        status = service.get_job_status(job.job_id)
        print(f"  Stage: {status.stage} ({status.progress}%)")
        if status.status in ["completed", "failed", "cancelled"]:
            break

    preds = service.get_predictions(job.job_id)
    if preds:
        features = preds.get("features", [])
        meta = preds.get("metadata", {})
        print(f"\nScan completed successfully!")
        print(f"Total fields detected: {len(features)}")
        print(f"Total area: {meta.get('total_area_ha')} ha")
        print(f"Mean confidence: {meta.get('mean_confidence')}")
        print(f"Region: {meta.get('geographic_region')}")
        print(f"Experimental: {meta.get('experimental')}")

if __name__ == "__main__":
    main()
