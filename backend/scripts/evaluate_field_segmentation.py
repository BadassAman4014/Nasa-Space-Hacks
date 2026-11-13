"""Script to evaluate field segmentation model on Brandenburg and Umred, India."""

import sys
import os
import json
import torch
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.services.field_segmentation.inference import FieldInferenceEngine
from app.services.field_segmentation.satellite_service import Sentinel2AcquisitionService
from app.services.field_segmentation.training import compute_segmentation_metrics

def main():
    print("=" * 60)
    print("FieldShift AI — Field Segmentation Evaluation")
    print("=" * 60)

    engine = FieldInferenceEngine.get_instance()
    sat_service = Sentinel2AcquisitionService()

    # 1. Brandenburg evaluation
    print("\n1. Evaluating on Brandenburg (Potsdam test region)...")
    potsdam_bbox = (13.02, 52.38, 13.12, 52.44)
    img_bb, meta_bb = sat_service.acquire_scene_for_bbox(potsdam_bbox)
    polys_bb = engine.detect_fields(
        image_4band=img_bb,
        bbox=potsdam_bbox,
        min_confidence=0.40,
        min_area_ha=0.20,
        geographic_region="Brandenburg, Germany"
    )
    print(f"Brandenburg: Detected {len(polys_bb)} fields.")
    if polys_bb:
        print(f"  Top field area: {polys_bb[0]['properties']['area_hectares']} ha, confidence: {polys_bb[0]['properties']['confidence']}")

    # 2. Umred, Maharashtra, India evaluation (External Generalization Test)
    print("\n2. Evaluating on Umred, Maharashtra, India (External Generalization)...")
    umred_bbox = (79.31, 20.83, 79.37, 20.87)
    img_in, meta_in = sat_service.acquire_scene_for_bbox(umred_bbox)
    polys_in = engine.detect_fields(
        image_4band=img_in,
        bbox=umred_bbox,
        min_confidence=0.38,
        min_area_ha=0.15,
        geographic_region="Umred, Maharashtra, India"
    )
    print(f"Umred, Maharashtra: Detected {len(polys_in)} fields.")
    if polys_in:
        print(f"  Top field area: {polys_in[0]['properties']['area_hectares']} ha, confidence: {polys_in[0]['properties']['confidence']}")
        print(f"  Experimental status: {polys_in[0]['properties']['experimental']}")

if __name__ == "__main__":
    main()
