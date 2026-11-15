"""Unit and Integration Tests for AI Satellite Field Boundary Detection Pipeline."""

import os
import json
import numpy as np
import pytest
import torch
from fastapi.testclient import TestClient
from shapely.geometry import Polygon, shape

from app.main import app
from app.services.field_segmentation.model import FTWPRUESentinel2Model, FTPB3SegmentationModel, UNetMobileNetV3Small
from app.services.field_segmentation.preprocessing import (
    normalize_reflectance,
    rasterize_dfbk_polygons,
    generate_inference_tiles,
    get_2d_window
)
from app.services.field_segmentation.polygonization import (
    extract_field_polygons,
    calculate_polygon_area_ha
)
from app.services.field_segmentation.satellite_service import Sentinel2AcquisitionService
from app.services.field_segmentation.service import AIFieldDetectionService

client = TestClient(app)

class TestAIFieldDetectionModel:
    """Test CNN segmentation model architecture and tensor contracts."""

    def test_ftw_prue_sentinel2_model(self):
        model = FTWPRUESentinel2Model()
        assert model.count_parameters() > 10_000_000

        x_8ch = torch.randn(2, 8, 256, 256)
        proba = model.predict_proba(x_8ch)
        assert proba.shape == (2, 3, 256, 256)
        sums = torch.sum(proba, dim=1).numpy()
        np.testing.assert_allclose(sums, 1.0, rtol=1e-5)

    def test_ftp_b3_model_initialization_and_forward(self):
        model = FTPB3SegmentationModel()
        assert model.count_parameters() > 10_000_000

        # Test with 4-channel input (Sentinel-2 adaptation)
        x_4ch = torch.randn(2, 4, 256, 256)
        proba_4ch = model.predict_proba(x_4ch)
        assert proba_4ch.shape == (2, 3, 256, 256)
        sums_4ch = torch.sum(proba_4ch, dim=1).numpy()
        np.testing.assert_allclose(sums_4ch, 1.0, rtol=1e-5)

        # Test with native 8-channel input
        x_8ch = torch.randn(1, 8, 256, 256)
        proba_8ch = model.predict_proba(x_8ch)
        assert proba_8ch.shape == (1, 3, 256, 256)
        sums_8ch = torch.sum(proba_8ch, dim=1).numpy()
        np.testing.assert_allclose(sums_8ch, 1.0, rtol=1e-5)

    def test_model_initialization_and_forward_shape(self):
        model = UNetMobileNetV3Small(in_channels=4, num_classes=3, pretrained_encoder=False)
        x = torch.randn(2, 4, 256, 256)
        logits = model(x)
        assert logits.shape == (2, 3, 256, 256)

        proba = model.predict_proba(x)
        assert proba.shape == (2, 3, 256, 256)
        # Softmax probabilities should sum to 1.0 along class dimension
        sums = torch.sum(proba, dim=1).numpy()
        np.testing.assert_allclose(sums, 1.0, rtol=1e-5)

    def test_checkpoint_exists_and_loads(self):
        ckpt_path = os.path.join(
            os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
            "models",
            "field_segmentation",
            "best_model.pth"
        )
        assert os.path.exists(ckpt_path), f"Checkpoint missing at {ckpt_path}"
        model = UNetMobileNetV3Small(in_channels=4, num_classes=3, weights_path=ckpt_path)
        assert model.count_parameters() > 1_000_000

    def test_metadata_artifacts_exist(self):
        model_dir = os.path.join(
            os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
            "models",
            "field_segmentation"
        )
        for fname in ["config.json", "metrics.json", "normalization.json", "class_mapping.json", "model_card.md"]:
            p = os.path.join(model_dir, fname)
            assert os.path.exists(p), f"Missing metadata artifact: {fname}"

class TestPreprocessingAndPolygonization:
    """Test rasterization, tiling, and vector polygon extraction."""

    def test_normalize_reflectance(self):
        raw_dn = np.full((4, 64, 64), 2000.0, dtype=np.float32)
        norm = normalize_reflectance(raw_dn)
        assert norm.shape == (4, 64, 64)
        assert not np.isnan(norm).any()

    def test_tile_generation_and_window(self):
        tiles = generate_inference_tiles(512, 512, tile_size=256, overlap=32)
        assert len(tiles) > 0
        window = get_2d_window(256)
        assert window.shape == (256, 256)
        assert window.max() <= 1.0 and window.min() >= 0.05

    def test_polygonization_instance_separation(self):
        # Create a synthetic probability map with 2 distinct fields separated by a boundary
        prob_map = np.zeros((3, 200, 200), dtype=np.float32)
        # Field 1: top half
        prob_map[1, 20:80, 20:180] = 0.85
        prob_map[0, 20:80, 20:180] = 0.10
        # Field boundary line in between
        prob_map[2, 80:90, 20:180] = 0.90
        # Field 2: bottom half
        prob_map[1, 95:175, 20:180] = 0.88
        prob_map[0, 95:175, 20:180] = 0.08

        # Background elsewhere
        bg_mask = (prob_map[1] == 0) & (prob_map[2] == 0)
        prob_map[0, bg_mask] = 0.95

        bbox = (13.0, 52.3, 13.1, 52.4)
        polygons = extract_field_polygons(
            prob_map=prob_map,
            bbox=bbox,
            min_confidence=0.40,
            min_area_ha=0.10,
            boundary_penalty=0.60
        )
        assert len(polygons) >= 2, f"Expected at least 2 distinct field instances, got {len(polygons)}"
        for f in polygons:
            geom = shape(f["geometry"])
            assert geom.is_valid
            assert f["properties"]["area_hectares"] > 0
            assert 0.0 <= f["properties"]["confidence"] <= 1.0

class TestAIFieldDetectionAPI:
    """Test FastAPI endpoints for AI Field Boundary Detection."""

    def test_get_model_status(self):
        res = client.get("/api/ai-field-detection/model/status")
        assert res.status_code == 200
        data = res.json()
        assert data["model_ready"] is True
        assert any(k in data["architecture"] for k in ["FTW-PRUE", "FTP-B3", "MobileNetV3"])
        assert any(k in data["model_version"] for k in ["ftw-prue", "ftp-b3", "fieldshift"])
        assert len(data["input_channels"]) >= 4
        assert "brandenburg" in data["geographic_validation"]

    def test_brandenburg_scan_workflow(self):
        req = {
            "bbox": [13.04, 52.40, 13.08, 52.43],
            "zoom": 14.0,
            "min_confidence": 0.40,
            "min_field_area_ha": 0.20
        }
        res = client.post("/api/ai-field-detection/scan", json=req)
        assert res.status_code == 202
        job_data = res.json()
        job_id = job_data["job_id"]
        assert job_id.startswith("job-")

        # Poll until complete
        import time
        completed = False
        for _ in range(200):
            time.sleep(0.3)
            s_res = client.get(f"/api/ai-field-detection/jobs/{job_id}")
            assert s_res.status_code == 200
            st = s_res.json()
            if st["status"] == "completed":
                completed = True
                break

        assert completed, "Scan job did not complete within timeout"

        # Retrieve predictions
        pred_res = client.get(f"/api/ai-field-detection/jobs/{job_id}/predictions")
        assert pred_res.status_code == 200
        preds = pred_res.json()
        assert preds["type"] == "FeatureCollection"
        assert len(preds["features"]) > 0
        assert preds["metadata"]["geographic_region"] == "Brandenburg, Germany"
        assert preds["metadata"]["experimental"] is False

    def test_umred_maharashtra_scan_and_generalization_flag(self):
        req = {
            "bbox": [79.32, 20.84, 79.36, 20.86],
            "zoom": 14.0,
            "min_confidence": 0.38,
            "min_field_area_ha": 0.15
        }
        res = client.post("/api/ai-field-detection/scan", json=req)
        assert res.status_code == 202
        job_id = res.json()["job_id"]

        import time
        completed = False
        for _ in range(200):
            time.sleep(0.3)
            s_res = client.get(f"/api/ai-field-detection/jobs/{job_id}")
            if s_res.json()["status"] == "completed":
                completed = True
                break

        assert completed
        preds = client.get(f"/api/ai-field-detection/jobs/{job_id}/predictions").json()
        assert preds["type"] == "FeatureCollection"
        assert len(preds["features"]) > 0
        assert "Umred" in preds["metadata"]["geographic_region"]
        # Must be explicitly marked as experimental
        assert preds["metadata"]["experimental"] is True
        for f in preds["features"]:
            assert f["properties"]["experimental"] is True
            assert f["properties"]["source"] == "ai_prediction"

    def test_nonexistent_job_returns_404(self):
        res = client.get("/api/ai-field-detection/jobs/nonexistent-id-999")
        assert res.status_code == 404

