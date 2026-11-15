"""Sentinel-2 L2A imagery acquisition for field-segmentation inference.

Only georeferenced pixels read from real STAC assets are returned. Network,
catalogue, GDAL, and raster errors fail the request instead of invoking a
synthetic reflectance fallback.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple
import json
import os
import urllib.request

import numpy as np

BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../.."))
CACHE_DIR = os.path.join(BACKEND_DIR, "data", "satellite_cache")
os.makedirs(CACHE_DIR, exist_ok=True)


class Sentinel2Unavailable(RuntimeError):
    """Raised when verified Sentinel-2 pixels cannot be acquired."""


class Sentinel2AcquisitionService:
    """Acquire four real Sentinel-2 L2A reflectance bands for a WGS84 bbox."""

    STAC_SEARCH_URL = "https://earth-search.aws.element84.com/v1/search"

    def __init__(self, cache_dir: str = CACHE_DIR):
        self.cache_dir = cache_dir

    def search_scenes(
        self,
        bbox: Tuple[float, float, float, float],
        date_range: Optional[str] = None,
        max_cloud_cover: float = 15.0,
    ) -> List[Dict[str, Any]]:
        west, south, east, north = bbox
        if not date_range:
            end = date.today()
            start = end - timedelta(days=120)
            date_range = f"{start.isoformat()}T00:00:00Z/{end.isoformat()}T23:59:59Z"
        payload = {
            "collections": ["sentinel-2-l2a"],
            "bbox": [west, south, east, north],
            "datetime": date_range,
            "query": {"eo:cloud_cover": {"lt": max_cloud_cover}},
            "limit": 5,
            "sortby": [{"field": "properties.eo:cloud_cover", "direction": "asc"}],
        }
        try:
            request = urllib.request.Request(
                self.STAC_SEARCH_URL,
                data=json.dumps(payload).encode("utf-8"),
                headers={"Content-Type": "application/json", "User-Agent": "FieldShiftAI/1.0"},
            )
            with urllib.request.urlopen(request, timeout=20) as response:
                return json.loads(response.read().decode("utf-8")).get("features", [])
        except Exception as exc:
            raise Sentinel2Unavailable(
                f"Sentinel-2 STAC search failed ({type(exc).__name__})."
            ) from exc

    @staticmethod
    def _date_range(target_date: Optional[str]) -> Optional[str]:
        if not target_date:
            return None
        try:
            target = datetime.fromisoformat(target_date.replace("Z", "+00:00")).date()
        except ValueError as exc:
            raise Sentinel2Unavailable("The requested acquisition date is invalid.") from exc
        start, end = target - timedelta(days=10), target + timedelta(days=10)
        return f"{start.isoformat()}T00:00:00Z/{end.isoformat()}T23:59:59Z"

    def acquire_scene_for_bbox(
        self,
        bbox: Tuple[float, float, float, float],
        target_size: Tuple[int, int] = (256, 256),
        target_date: Optional[str] = None,
        max_cloud_cover: float = 15.0,
    ) -> Tuple[np.ndarray, Dict[str, Any]]:
        """Return verified B02/B03/B04/B08 pixels reprojected to the bbox."""
        west, south, east, north = bbox
        height, width = target_size
        cache_key = f"s2_real_v2_{west:.4f}_{south:.4f}_{east:.4f}_{north:.4f}_{height}x{width}.npz"
        cache_path = os.path.join(self.cache_dir, cache_key)

        if os.path.exists(cache_path):
            try:
                cached = np.load(cache_path, allow_pickle=True)
                metadata = cached["metadata"].item()
                if metadata.get("data_origin_verified") is True:
                    return cached["image"], metadata
            except Exception:
                pass

        scenes = self.search_scenes(
            bbox,
            date_range=self._date_range(target_date),
            max_cloud_cover=max_cloud_cover,
        )
        read_errors: List[str] = []
        for scene in scenes:
            properties = scene.get("properties", {})
            assets = scene.get("assets", {})
            band_urls = {
                "B02": (assets.get("blue") or assets.get("B02") or {}).get("href"),
                "B03": (assets.get("green") or assets.get("B03") or {}).get("href"),
                "B04": (assets.get("red") or assets.get("B04") or {}).get("href"),
                "B08": (assets.get("nir") or assets.get("nir08") or assets.get("B08") or {}).get("href"),
            }
            if not all(band_urls.values()):
                continue
            try:
                image = self._fetch_s2_bands(band_urls, bbox, target_size)
            except Sentinel2Unavailable as exc:
                read_errors.append(str(exc))
                continue
            acquisition = properties.get("datetime") or properties.get("start_datetime")
            if not acquisition:
                read_errors.append(f"Scene {scene.get('id')} has no acquisition timestamp.")
                continue
            metadata = {
                "scene_id": scene.get("id"),
                "imagery_date": acquisition[:10],
                "sensor": "Sentinel-2 L2A MSI",
                "cloud_cover": properties.get("eo:cloud_cover"),
                "crs": "EPSG:4326",
                "source": "Copernicus Sentinel-2 L2A via Element84 Earth Search",
                "data_origin_verified": True,
                "synthetic": False,
            }
            self._save_cache(cache_path, image, metadata)
            return image, metadata

        # Synthetic reflectance generation used to run here. It is intentionally
        # disabled so failed imagery acquisition cannot create importable fields.
        detail = f" Last raster error: {read_errors[-1]}" if read_errors else ""
        raise Sentinel2Unavailable(
            f"No readable Sentinel-2 L2A scene was found for the requested area.{detail}"
        )

    def _fetch_s2_bands(
        self,
        band_urls: Dict[str, str],
        bbox: Tuple[float, float, float, float],
        target_size: Tuple[int, int],
    ) -> np.ndarray:
        """Window and reproject the requested COG bands onto the exact bbox."""
        try:
            import rasterio
            from rasterio.transform import from_bounds
            from rasterio.warp import Resampling, reproject
        except ImportError as exc:
            raise Sentinel2Unavailable("Rasterio is required to read Sentinel-2 COGs.") from exc

        height, width = target_size
        destination_transform = from_bounds(*bbox, width, height)
        bands = []
        try:
            for band_name in ("B02", "B03", "B04", "B08"):
                with rasterio.open(band_urls[band_name]) as source:
                    destination = np.full((height, width), np.nan, dtype="float32")
                    reproject(
                        source=rasterio.band(source, 1),
                        destination=destination,
                        src_transform=source.transform,
                        src_crs=source.crs,
                        src_nodata=source.nodata,
                        dst_transform=destination_transform,
                        dst_crs="EPSG:4326",
                        dst_nodata=np.nan,
                        resampling=Resampling.bilinear,
                    )
                destination = destination / 10000.0
                if not np.isfinite(destination).any():
                    raise Sentinel2Unavailable(f"{band_name} has no valid pixels in the requested bbox.")
                bands.append(destination)
        except Sentinel2Unavailable:
            raise
        except Exception as exc:
            raise Sentinel2Unavailable(
                f"Sentinel-2 COG read failed ({type(exc).__name__})."
            ) from exc

        image = np.stack(bands, axis=0).astype(np.float32)
        if not np.isfinite(image).all():
            raise Sentinel2Unavailable("One or more Sentinel-2 bands contain missing pixels in the bbox.")
        return np.clip(image, 0.0, 1.0)

    @staticmethod
    def _save_cache(path: str, image: np.ndarray, metadata: Dict[str, Any]) -> None:
        try:
            np.savez_compressed(path, image=image, metadata=metadata)
        except Exception:
            pass
