"""CNN Inference Engine for Agricultural Field Segmentation using Fields of the World (FTW-PRUE+ Sentinel-2 Native)."""

from typing import Any, Dict, List, Optional, Tuple, Union
import os
import torch
import numpy as np

from .model import FTWPRUESentinel2Model, FTPB3SegmentationModel, UNetMobileNetV3Small, LOCAL_FTW_PRUE_WEIGHTS
from .preprocessing import normalize_reflectance, generate_inference_tiles, get_2d_window
from .polygonization import extract_field_polygons

MODEL_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../models/field_segmentation"))
FTW_PRUE_WEIGHTS = os.path.join(MODEL_DIR, "ftw-prue", "prue_efnetb3_ccby-b35d59a6.pth")
LEGACY_WEIGHTS = os.path.join(MODEL_DIR, "best_model.pth")


class FieldInferenceEngine:
    """Manages model loading, tiled inference, and polygon extraction using FTW-PRUE+ (Sentinel-2 Native)."""

    _instance: Optional["FieldInferenceEngine"] = None

    def __init__(self, weights_path: Optional[str] = None, device: Optional[str] = None):
        self.weights_path = weights_path or (FTW_PRUE_WEIGHTS if os.path.exists(FTW_PRUE_WEIGHTS) else LOCAL_FTW_PRUE_WEIGHTS)
        if device is None:
            self.device = "cuda" if torch.cuda.is_available() else "cpu"
        else:
            self.device = device

        self.model: Optional[Union[FTWPRUESentinel2Model, FTPB3SegmentationModel, UNetMobileNetV3Small]] = None
        self.active_architecture = "Fields of the World (FTW-PRUE+) EfficientNet-B3 U-Net (Sentinel-2 10m Native)"
        self._load_model()

    @classmethod
    def get_instance(cls, weights_path: Optional[str] = None) -> "FieldInferenceEngine":
        """Singleton accessor to ensure model checkpoint is loaded once and shared."""
        if cls._instance is None:
            cls._instance = cls(weights_path=weights_path)
        return cls._instance

    def _load_model(self) -> None:
        """Instantiate and load the FTW-PRUE+ Sentinel-2 segmentation model."""
        try:
            model = FTWPRUESentinel2Model(
                weights_path=self.weights_path,
                in_channels=8,
                num_classes=3,
                device=self.device
            )
            model.to(self.device)
            model.eval()
            self.model = model
            self.active_architecture = "Fields of the World (FTW-PRUE+) EfficientNet-B3 U-Net (Sentinel-2 10m Native)"
        except Exception:
            # Fallback to lightweight U-Net MobileNetV3 if weights cannot be loaded
            model = UNetMobileNetV3Small(in_channels=4, num_classes=3, pretrained_encoder=False)
            if os.path.exists(LEGACY_WEIGHTS):
                try:
                    model.load_checkpoint(LEGACY_WEIGHTS, device=self.device)
                except Exception:
                    pass
            model.to(self.device)
            model.eval()
            self.model = model
            self.active_architecture = "U-Net MobileNetV3-Small (Fallback)"

    def prepare_ftw_tensor(self, image_4band: np.ndarray) -> np.ndarray:
        """Format 4-band Sentinel-2 reflectance into 8-band FTW input layout.
        
        Input image_4band: (4, H, W) [B02 Blue, B03 Green, B04 Red, B08 NIR] in [0.0, 1.0].
        Output: (8, H, W) [B04, B03, B02, B08, B04, B03, B02, B08] scaled by 10000/3000.
        """
        assert image_4band.ndim == 3 and image_4band.shape[0] >= 4, f"Expected (4, H, W) array, got {image_4band.shape}"
        
        # Scaling factor: FTW-PRUE expects reflectance in [0, 1000] range
        scale = 1000.0 if np.nanmax(image_4band) <= 2.0 else 0.1
        b02 = np.clip(image_4band[0], 0.0, 1.0) * scale
        b03 = np.clip(image_4band[1], 0.0, 1.0) * scale
        b04 = np.clip(image_4band[2], 0.0, 1.0) * scale
        b08 = np.clip(image_4band[3], 0.0, 1.0) * scale

        # Stack into [B04, B03, B02, B08, B04, B03, B02, B08] (Red, Green, Blue, NIR)
        return np.stack([b04, b03, b02, b08, b04, b03, b02, b08], axis=0).astype(np.float32)

    @torch.inference_mode()
    def predict_tile(self, tile_tensor: torch.Tensor) -> np.ndarray:
        """Run forward inference on a single tensor."""
        tile_tensor = tile_tensor.to(self.device)
        proba = self.model.predict_proba(tile_tensor)
        return proba.squeeze(0).cpu().numpy().astype(np.float32)

    def run_inference_on_raster(
        self,
        image_4band: np.ndarray,
        tile_size: int = 256,
        overlap: int = 32
    ) -> np.ndarray:
        """Run overlapping window inference over an arbitrary (4, H, W) reflectance image."""
        assert image_4band.ndim == 3 and image_4band.shape[0] in [3, 4, 8], (
            f"Expected (3, H, W), (4, H, W), or (8, H, W) array, got {image_4band.shape}"
        )
        _, H, W = image_4band.shape

        # Format input bands according to active model specification
        if isinstance(self.model, FTWPRUESentinel2Model):
            norm_img = self.prepare_ftw_tensor(image_4band)
        elif isinstance(self.model, FTPB3SegmentationModel):
            norm_img = np.clip(image_4band.astype(np.float32), 0.0, 1.0)
            if np.nanmax(norm_img) > 10.0:
                norm_img /= 10000.0
        else:
            norm_img = normalize_reflectance(image_4band)

        # Output accumulation buffers
        prob_accum = np.zeros((3, H, W), dtype=np.float32)
        weight_accum = np.zeros((H, W), dtype=np.float32)

        # 2D window for smooth tile blending
        window = get_2d_window(tile_size)

        pad_h = max(0, tile_size - H)
        pad_w = max(0, tile_size - W)
        if pad_h > 0 or pad_w > 0:
            padded = np.pad(norm_img, ((0, 0), (0, pad_h), (0, pad_w)), mode="reflect")
            tensor = torch.from_numpy(padded[:, :tile_size, :tile_size]).unsqueeze(0)
            proba = self.predict_tile(tensor)
            return proba[:, :H, :W]

        tiles = generate_inference_tiles(H, W, tile_size=tile_size, overlap=overlap)

        for r_start, r_end, c_start, c_end in tiles:
            tile = norm_img[:, r_start:r_end, c_start:c_end]
            tensor = torch.from_numpy(tile).unsqueeze(0)
            proba = self.predict_tile(tensor)

            for c_idx in range(3):
                prob_accum[c_idx, r_start:r_end, c_start:c_end] += proba[c_idx] * window
            weight_accum[r_start:r_end, c_start:c_end] += window

        weight_accum = np.maximum(weight_accum, 1e-5)
        for c_idx in range(3):
            prob_accum[c_idx] /= weight_accum

        sum_p = np.sum(prob_accum, axis=0, keepdims=True)
        prob_accum /= np.maximum(sum_p, 1e-6)

        return prob_accum

    def detect_fields(
        self,
        image_4band: np.ndarray,
        bbox: Tuple[float, float, float, float],
        min_confidence: float = 0.35,
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
            model_version="fieldsoftheworld/ftw-prue-ccby",
            imagery_date=imagery_date,
            sensor=sensor,
            geographic_region=geographic_region,
        )
        return polygons
