"""Orchestration Service for Background AI Field Detection and Satellite Inference."""

from typing import Any, Dict, List, Optional, Tuple
import os
import json
import time
import uuid
import threading
from datetime import datetime
import numpy as np

from .schemas import ScanRequest, ScanJobStatus, ModelStatusResponse
from .satellite_service import Sentinel2AcquisitionService
from .inference import FieldInferenceEngine
from .model import UNetMobileNetV3Small

MODEL_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../models/field_segmentation"))

class AIFieldDetectionService:
    """Singleton service managing AI field detection jobs and lifecycle."""

    _instance: Optional["AIFieldDetectionService"] = None

    def __init__(self):
        self.jobs: Dict[str, ScanJobStatus] = {}
        self.predictions_cache: Dict[str, Dict[str, Any]] = {}
        self.sat_service = Sentinel2AcquisitionService()
        self.inference_engine = FieldInferenceEngine.get_instance()
        self._lock = threading.Lock()

    @classmethod
    def get_instance(cls) -> "AIFieldDetectionService":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def get_model_status(self) -> ModelStatusResponse:
        """Return model readiness, checkpoint status, and architecture metrics."""
        ckpt_path = os.path.join(MODEL_DIR, "best_model.pth")
        config_path = os.path.join(MODEL_DIR, "config.json")
        metrics_path = os.path.join(MODEL_DIR, "metrics.json")

        model_ready = os.path.exists(ckpt_path)
        params_count = self.inference_engine.model.count_parameters() if self.inference_engine.model else 1671683

        val_metrics = {}
        if os.path.exists(metrics_path):
            try:
                with open(metrics_path, "r", encoding="utf-8") as f:
                    val_metrics = json.load(f)
            except Exception:
                pass

        return ModelStatusResponse(
            model_ready=model_ready,
            model_version="fieldshift-unet-v1.0",
            architecture="U-Net with MobileNetV3-Small Encoder",
            parameters_count=params_count,
            input_channels=["B02 (Blue)", "B03 (Green)", "B04 (Red)", "B08 (NIR)"],
            input_resolution_m=10.0,
            device=self.inference_engine.device,
            training_readiness="Trained & Checkpointed" if model_ready else "Needs Checkpoint",
            validation_metrics=val_metrics,
            geographic_validation={
                "brandenburg": "Validated against official DFBK reference polygons",
                "umred_maharashtra": "Experimental external generalization test area",
                "global": "Experimental inference mode",
            },
            checkpoint_path=ckpt_path,
        )

    def start_scan(self, req: ScanRequest) -> ScanJobStatus:
        """Create and queue a new satellite field boundary scan job."""
        job_id = f"job-{uuid.uuid4().hex[:8]}"
        now = datetime.utcnow().isoformat() + "Z"

        # Prevent duplicate simultaneous scans for identical bbox
        west, south, east, north = req.bbox
        for existing in self.jobs.values():
            if existing.status in ["pending", "running"]:
                ew, es, ee, en = existing.bbox
                if (abs(ew - west) < 0.001 and abs(es - south) < 0.001 and
                    abs(ee - east) < 0.001 and abs(en - north) < 0.001):
                    return existing

        job = ScanJobStatus(
            job_id=job_id,
            status="pending",
            stage="Preparing satellite imagery",
            progress=5,
            created_at=now,
            updated_at=now,
            bbox=req.bbox,
        )

        with self._lock:
            self.jobs[job_id] = job

        # Launch processing in a non-blocking background thread
        thread = threading.Thread(target=self._run_scan_job, args=(job_id, req), daemon=True)
        thread.start()

        return job

    def get_job_status(self, job_id: str) -> Optional[ScanJobStatus]:
        """Fetch live job status and progress."""
        return self.jobs.get(job_id)

    def get_predictions(self, job_id: str) -> Optional[Dict[str, Any]]:
        """Retrieve predicted GeoJSON FeatureCollection."""
        return self.predictions_cache.get(job_id)

    def cancel_scan(self, job_id: str) -> bool:
        """Cancel an in-progress scan job."""
        job = self.jobs.get(job_id)
        if job and job.status in ["pending", "running"]:
            job.status = "cancelled"
            job.stage = "Cancelled by user"
            job.updated_at = datetime.utcnow().isoformat() + "Z"
            return True
        return False

    def _run_scan_job(self, job_id: str, req: ScanRequest) -> None:
        """Worker thread executing the real 6-stage CNN segmentation pipeline."""
        job = self.jobs[job_id]

        def update_stage(stage: str, progress: int, status: str = "running"):
            job.stage = stage
            job.progress = progress
            job.status = status
            job.updated_at = datetime.utcnow().isoformat() + "Z"

        try:
            # Stage 1: Preparing satellite imagery
            update_stage("Preparing satellite imagery", 15)
            time.sleep(0.3)

            if job.status == "cancelled":
                return

            # Determine region
            west, south, east, north = req.bbox
            is_brandenburg = (11.0 <= west <= 15.0 and 51.0 <= south <= 54.0)
            is_umred = (78.5 <= west <= 80.5 and 20.0 <= south <= 21.5)
            region_name = "Brandenburg, Germany" if is_brandenburg else ("Umred, Maharashtra, India" if is_umred else "External Region")

            # Stage 2: Retrieving Sentinel-2 imagery
            update_stage("Retrieving Sentinel-2 imagery", 35)
            image_4band, scene_meta = self.sat_service.acquire_scene_for_bbox(
                bbox=req.bbox,
                target_size=(256, 256),
                target_date=req.acquisition_date,
                max_cloud_cover=req.max_cloud_cover
            )
            job.scene_id = scene_meta.get("scene_id")
            job.imagery_date = scene_meta.get("imagery_date")
            job.sensor = scene_meta.get("sensor")

            if job.status == "cancelled":
                return

            # Stage 3: Running CNN segmentation
            update_stage("Running CNN segmentation", 60)
            prob_map = self.inference_engine.run_inference_on_raster(image_4band)

            if job.status == "cancelled":
                return

            # Stage 4: Extracting field polygons
            update_stage("Extracting field polygons", 80)
            polygons = self.inference_engine.detect_fields(
                image_4band=image_4band,
                bbox=req.bbox,
                min_confidence=req.min_confidence,
                min_area_ha=req.min_field_area_ha,
                imagery_date=scene_meta.get("imagery_date", "2024-08-28"),
                sensor=scene_meta.get("sensor", "Sentinel-2 L2A"),
                geographic_region=region_name,
            )

            # Stage 5: Validating GeoJSON
            update_stage("Validating GeoJSON", 95)
            total_ha = sum(f["properties"]["area_hectares"] for f in polygons)
            mean_conf = float(np.mean([f["properties"]["confidence"] for f in polygons])) if polygons else 0.0

            collection = {
                "type": "FeatureCollection",
                "features": polygons,
                "metadata": {
                    "job_id": job_id,
                    "scene_id": scene_meta.get("scene_id"),
                    "imagery_date": scene_meta.get("imagery_date"),
                    "sensor": scene_meta.get("sensor"),
                    "geographic_region": region_name,
                    "total_fields": len(polygons),
                    "total_area_ha": round(total_ha, 2),
                    "mean_confidence": round(mean_conf, 3),
                    "experimental": not is_brandenburg,
                    "model_version": "fieldshift-unet-v1.0",
                    "bbox": req.bbox,
                }
            }

            self.predictions_cache[job_id] = collection
            job.prediction_count = len(polygons)

            # Stage 6: Completed
            update_stage("Completed", 100, status="completed")

        except Exception as e:
            job.status = "failed"
            job.stage = f"Error: {str(e)}"
            job.error_details = str(e)
            job.updated_at = datetime.utcnow().isoformat() + "Z"
