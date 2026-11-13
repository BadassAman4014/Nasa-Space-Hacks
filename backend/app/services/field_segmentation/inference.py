"""CNN Inference Engine for Agricultural Field Segmentation."""

from typing import Any, Dict, List, Optional, Tuple
import os
import torch
import numpy as np

from .model import UNetMobileNetV3Small
from .preprocessing import normalize_reflectance, generate_inference_tiles, get_2d_window
from .polygonization import extract_field_polygons

MODEL_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../models/field_segmentation"))
DEFAULT_WEIGHTS = os.path.join(MODEL_DIR, "best_model.pth")

class FieldInferenceEngine:
    """Manages model loading, tiled inference, and polygon extraction."""

    _instance: Optional["FieldInferenceEngine"] = None

    def __init__(self, weights_path: str = DEFAULT_WEIGHTS, device: Optional[str] = None):
        self.weights_path = weights_path
        if device is None:
            self.device = "cuda" if torch.cuda.is_available() else "cpu"
        else:
            self.device = device

        self.model: Optional[UNetMobileNetV3Small] = None
        self._load_model()

    @classmethod
    def get_instance(cls, weights_path: str = DEFAULT_WEIGHTS) -> "FieldInferenceEngine":
        """Singleton accessor to ensure model checkpoint is loaded once and shared."""
        if cls._instance is None:
            cls._instance = cls(weights_path=weights_path)
        return cls._instance

    def _load_model(self) -> None:
        """Instantiate and load model weights."""
        model = UNetMobileNetV3Small(in_channels=4, num_classes=3, pretrained_encoder=True)
        if os.path.exists(self.weights_path):
            try:
                model.load_checkpoint(self.weights_path, device=self.device)
            except Exception:
                pass
        model.to(self.device)
        model.eval()
        self.model = model

    @torch.inference_mode()
    def predict_tile(self, tile_tensor: torch.Tensor) -> np.ndarray:
        """Run forward inference on a single (1, 4, 256, 256) tensor.
        
        Returns:
            (3, 256, 256) numpy float32 probability array.
        """
        tile_tensor = tile_tensor.to(self.device)
        proba = self.model.predict_proba(tile_tensor)
        return proba.squeeze(0).cpu().numpy().astype(np.float32)

    def run_inference_on_raster(
        self,
        image_4band: np.ndarray,
        tile_size: int = 256,
        overlap: int = 32
    ) -> np.ndarray:
        """Run overlapping window inference over an arbitrary (4, H, W) reflectance image.
        
        Applies Hann/cosine window blending to prevent artificial seam artifacts.
        
        Returns:
            (3, H, W) class probability raster.
        """
        assert image_4band.ndim == 3 and image_4band.shape[0] == 4, f"Expected (4, H, W) array, got {image_4band.shape}"
        _, H, W = image_4band.shape

        # Normalize reflectance
        norm_img = normalize_reflectance(image_4band)

        # Output accumulation buffers
        prob_accum = np.zeros((3, H, W), dtype=np.float32)
        weight_accum = np.zeros((H, W), dtype=np.float32)

        # 2D window for smooth tile blending
        window = get_2d_window(tile_size)

        # If image is smaller than tile_size, pad to tile_size
        pad_h = max(0, tile_size - H)
        pad_w = max(0, tile_size - W)
        if pad_h > 0 or pad_w > 0:
            padded = np.pad(norm_img, ((0, 0), (0, pad_h), (0, pad_w)), mode="reflect")
            tensor = torch.from_numpy(padded[:4, :tile_size, :tile_size]).unsqueeze(0)
            proba = self.predict_tile(tensor)
            return proba[:, :H, :W]

        tiles = generate_inference_tiles(H, W, tile_size=tile_size, overlap=overlap)

        for r_start, r_end, c_start, c_end in tiles:
            tile = norm_img[:, r_start:r_end, c_start:c_end]
            tensor = torch.from_numpy(tile).unsqueeze(0)
            proba = self.predict_tile(tensor)  # (3, 256, 256)

            for c_idx in range(3):
                prob_accum[c_idx, r_start:r_end, c_start:c_end] += proba[c_idx] * window
            weight_accum[r_start:r_end, c_start:c_end] += window

        # Normalize by accumulated window weights
        weight_accum = np.maximum(weight_accum, 1e-5)
        for c_idx in range(3):
            prob_accum[c_idx] /= weight_accum

        # Ensure probabilities sum to 1.0 across classes
        sum_p = np.sum(prob_accum, axis=0, keepdims=True)
        prob_accum /= np.maximum(sum_p, 1e-6)

        return prob_accum

    def detect_fields(
        self,
        image_4band: np.ndarray,
        bbox: Tuple[float, float, float, float],
        min_confidence: float = 0.40,
        min_area_ha: float = 0.20,
        imagery_date: str = "2024-08-28",
        sensor: str = "Sentinel-2 L2A",
        geographic_region: str = "Brandenburg"
    ) -> List[Dict[str, Any]]:
        """Run end-to-end inference and extract field polygons."""
        prob_map = self.run_inference_on_raster(image_4band)
        polygons = extract_field_polygons(
            prob_map=prob_map,
            bbox=bbox,
            min_confidence=min_confidence,
            min_area_ha=min_area_ha,
            imagery_date=imagery_date,
            sensor=sensor,
            geographic_region=geographic_region,
        )
        return polygons
