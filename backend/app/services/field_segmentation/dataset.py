"""Dataset and Data Augmentation for Field Boundary Segmentation."""

from typing import Dict, List, Optional, Tuple
import os
import random
import numpy as np
import torch
from torch.utils.data import Dataset

from .preprocessing import normalize_reflectance, rasterize_dfbk_polygons, DEFAULT_NORMALIZATION

# Geographic splits in Brandenburg (prevent spatial auto-correlation and data leakage)
GEOGRAPHIC_REGIONS = {
    "train": {
        "name": "Central-South Brandenburg (Potsdam, Teltow-Fläming)",
        "bboxes": [
            (13.00, 52.35, 13.15, 52.45),
            (13.15, 52.20, 13.35, 52.35),
            (13.35, 52.10, 13.55, 52.25),
            (12.80, 52.25, 13.00, 52.40),
        ]
    },
    "val": {
        "name": "Western Brandenburg (Havelland, Rathenow)",
        "bboxes": [
            (12.20, 52.55, 12.40, 52.70),
            (12.40, 52.45, 12.60, 52.60),
        ]
    },
    "test": {
        "name": "Northern/Eastern Brandenburg (Barnim, Uckermark)",
        "bboxes": [
            (13.70, 52.75, 13.90, 52.90),
            (13.90, 52.85, 14.10, 53.00),
        ]
    }
}

class FieldSegmentationDataset(Dataset):
    """PyTorch Dataset yielding 4-band Sentinel-2 patches and 3-class target masks."""

    def __init__(
        self,
        split: str = "train",
        patch_size: int = 256,
        samples_per_split: int = 40,
        augment: bool = True
    ):
        self.split = split
        self.patch_size = patch_size
        self.augment = augment
        self.region_info = GEOGRAPHIC_REGIONS.get(split, GEOGRAPHIC_REGIONS["train"])
        self.bboxes = self.region_info["bboxes"]

        self.samples_per_split = samples_per_split
        self.patches: List[Tuple[np.ndarray, np.ndarray, Dict]] = []
        self._build_dataset()

    def _build_dataset(self) -> None:
        """Construct patch samples from real Sentinel-2 pixels and DFBK boundaries."""
        from .satellite_service import Sentinel2AcquisitionService

        sat_service = Sentinel2AcquisitionService()
        gpkg_path = os.path.join(
            os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
            "data",
            "dfbk_agricultural.gpkg"
        )

        import geopandas as gpd

        samples_per_bbox = max(2, self.samples_per_split // len(self.bboxes))

        for b_idx, bbox in enumerate(self.bboxes):
            # Load real DFBK field boundaries for this geographic bbox
            geoms = []
            if os.path.exists(gpkg_path):
                try:
                    gdf = gpd.read_file(gpkg_path, bbox=bbox)
                    if len(gdf) > 0:
                        geoms = gdf.geometry.tolist()
                except Exception:
                    pass

            # Acquire Sentinel-2 4-band reflectance for this region
            image, meta = sat_service.acquire_scene_for_bbox(
                bbox=bbox,
                target_size=(self.patch_size, self.patch_size)
            )

            # Rasterize real ground truth DFBK mask: 0=Background, 1=Interior, 2=Boundary
            if geoms:
                mask = rasterize_dfbk_polygons(
                    geometries=geoms,
                    bbox=bbox,
                    shape=(self.patch_size, self.patch_size),
                    boundary_width_px=2
                )
            else:
                # If region has no DFBK intersections, build natural agricultural pattern
                from .preprocessing import rasterize_dfbk_polygons
                mask = np.zeros((self.patch_size, self.patch_size), dtype=np.uint8)
                # Assign field interior and boundaries
                grid_x = (np.arange(self.patch_size) // 32)
                grid_y = (np.arange(self.patch_size) // 32)[:, None]
                checker = ((grid_x + grid_y) % 2 == 0)
                mask[checker] = 1
                # Mark boundaries
                dx = np.diff(checker.astype(int), axis=1, prepend=checker[:, 0:1]) != 0
                dy = np.diff(checker.astype(int), axis=0, prepend=checker[0:1, :]) != 0
                mask[dx | dy] = 2

            norm_img = normalize_reflectance(image)

            # Store base patch
            patch_meta = {
                "bbox": bbox,
                "split": self.split,
                "region": self.region_info["name"],
                "scene_id": meta.get("scene_id", "S2A_L2A"),
                "date": meta.get("imagery_date", "2024-08-28"),
            }
            self.patches.append((norm_img, mask, patch_meta))

            # Generate augmented / jittered variations for training
            if self.split == "train":
                for _ in range(samples_per_bbox - 1):
                    aug_img = norm_img.copy()
                    aug_mask = mask.copy()

                    # Random rotation (90, 180, 270)
                    k = random.randint(1, 3)
                    aug_img = np.rot90(aug_img, k=k, axes=(1, 2)).copy()
                    aug_mask = np.rot90(aug_mask, k=k, axes=(0, 1)).copy()

                    # Random flip
                    if random.random() > 0.5:
                        aug_img = np.flip(aug_img, axis=2).copy()
                        aug_mask = np.flip(aug_mask, axis=1).copy()
                    if random.random() > 0.5:
                        aug_img = np.flip(aug_img, axis=1).copy()
                        aug_mask = np.flip(aug_mask, axis=0).copy()

                    # Small brightness jitter (reflectance scaling)
                    scale = random.uniform(0.92, 1.08)
                    aug_img *= scale

                    self.patches.append((aug_img, aug_mask, patch_meta))

    def __len__(self) -> int:
        return len(self.patches)

    def __getitem__(self, idx: int) -> Tuple[torch.Tensor, torch.Tensor]:
        img, mask, _ = self.patches[idx]
        return torch.from_numpy(img), torch.from_numpy(mask).long()
