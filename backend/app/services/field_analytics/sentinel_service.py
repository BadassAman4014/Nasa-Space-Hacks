"""
Sentinel-2 L2A observation discovery and field-level NDVI statistics.

Every observation returned here is backed by a real STAC item and real B04/B08
surface-reflectance pixels read over HTTP. There is deliberately no synthetic
fallback: when the catalogue, the assets or the GDAL stack are unavailable, the
service raises ``RasterUnavailable`` so the API can report the limitation.
"""

from __future__ import annotations

import base64
import hashlib
import io
import json
import math
from datetime import date, datetime, timedelta
from typing import Any, Dict, Iterable, List, Optional, Tuple

import numpy as np
from PIL import Image
from shapely.geometry import Point, shape

from app.services.field_analytics import s2_capability
from app.services.field_analytics import s2_raster
from app.services.field_analytics.s2_raster import RasterUnavailable, _ramp_colour

#: Minimum valid-pixel fraction for an observation to enter the time series.
MIN_VALID_PIXEL_PERCENT = 30.0

#: Default historical window. Sentinel-2 L2A global coverage starts mid-2015;
#: 2016 is used as a conservative start for the CDSE/Earth Search archive.
DEFAULT_HISTORY_START = f"{date.today().year - 3}-01-01"

#: Parallel scene reads (each scene is ~5-15 s of HTTP range requests).
SCENE_WORKERS = 6


class SentinelService:
    """Discovers real Sentinel-2 L2A scenes and derives field-level NDVI."""

    max_resolution_m = 10.0

    def __init__(self) -> None:
        self.capability = s2_capability

    # ------------------------------------------------------------------
    # Observation discovery
    # ------------------------------------------------------------------
    def discover_observations(
        self,
        field_id: str,
        geom: Dict[str, Any],
        start_date: str = DEFAULT_HISTORY_START,
        end_date: Optional[str] = None,
        max_cloud_cover: float = 20.0,
    ) -> List[Dict[str, Any]]:
        """
        Find real Sentinel-2 L2A acquisitions over the field polygon.

        Returns scene records only (no NDVI yet), so callers can filter cheaply
        before paying the cost of reading rasters.
        """
        polygon = shape(geom)
        if polygon.is_empty:
            raise RasterUnavailable("Field geometry is empty.")

        end_date = end_date or date.today().isoformat()
        try:
            scenes = s2_raster.search_scenes(
                polygon,
                start_date=start_date,
                end_date=end_date,
                max_cloud_cover=max_cloud_cover,
            )
            for scene in scenes:
                scene["field_id"] = field_id
                scene["season"] = (scene.get("acquisition_date") or "")[:4]
            return scenes
        except RasterUnavailable:
            raise
        except Exception as exc:
            raise RasterUnavailable(f"Sentinel-2 scene search failed: {type(exc).__name__}") from exc

    # ------------------------------------------------------------------
    # NDVI computation
    # ------------------------------------------------------------------
    def compute_observation(
        self,
        field_id: str,
        geom: Dict[str, Any],
        scene: Dict[str, Any],
        grid: Optional[s2_raster.FieldGrid] = None,
        render_previews: bool = True,
    ) -> Optional[Dict[str, Any]]:
        """
        Read B04/B08/SCL for one scene, mask by quality, and compute NDVI.
        Returns None when the scene cannot be read or has too few valid field pixels;
        nothing is synthesised.
        """
        if not s2_capability.AVAILABLE or not scene.get("red_href") or not scene.get("nir_href"):
            return None

        try:
            polygon = shape(geom)
            field_grid = grid or s2_raster.build_field_grid(polygon, self.max_resolution_m)

            red = s2_raster._read_asset_on_grid(scene["red_href"], field_grid)
            nir = s2_raster._read_asset_on_grid(scene["nir_href"], field_grid)

            scl = None
            if scene.get("scl_href"):
                try:
                    scl = s2_raster._read_scl_on_grid(scene["scl_href"], field_grid)
                except Exception:
                    scl = None

            valid, reasons = s2_raster.quality_mask(red, nir, scl, field_grid.mask)
            ndvi = s2_raster.compute_ndvi(red, nir, valid)
            stats = s2_raster.ndvi_statistics(ndvi, valid)

            if stats["valid_pixel_count"] == 0 or stats["valid_pixel_percent"] < MIN_VALID_PIXEL_PERCENT:
                return None

            ndvi_grid = np.where(
                valid & np.isfinite(ndvi), ndvi, -9999.0
            ).round(4).tolist()

            quality_flags: List[str] = []
            if scl is None:
                quality_flags.append("scl_unavailable")

            obs: Dict[str, Any] = {
                "id": f"obs_{field_id[:8]}_{(scene['acquisition_date'] or '').replace('-', '')}",
                "field_id": field_id,
                "scene_id": scene["scene_id"],
                "acquisition_date": scene["acquisition_date"],
                "sensor": "Sentinel-2 L2A",
                "platform": scene.get("platform"),
                "processing_baseline": scene.get("processing_baseline"),
                "cloud_cover_percent": round(float(scene.get("cloud_cover_percent") or 0.0), 2),
                "scene_cloud_pixels": reasons["cloud_pixels"],
                "nodata_pixels": reasons["nodata_pixels"],
                "field_pixel_count": reasons["field_pixels"],
                "quality_flags": quality_flags,
                "grid_crs": field_grid.crs,
                "grid_shape": list(field_grid.shape),
                "grid_bounds": list(field_grid.bounds),
                "resolution_m": self.max_resolution_m,
                "ndvi_grid": ndvi_grid,
                "is_included": True,
                "season": (scene["acquisition_date"] or "")[:4],
                **{k: v for k, v in stats.items()},
            }

            if render_previews:
                obs["ndvi_preview_url"] = s2_raster.render_ndvi_png(ndvi)
                try:
                    green = s2_raster._read_asset_on_grid(
                        scene.get("green_href") or scene["red_href"], field_grid
                    )
                    blue = s2_raster._read_asset_on_grid(
                        scene.get("blue_href") or scene["red_href"], field_grid
                    )
                    obs["rgb_preview_url"] = s2_raster.render_true_colour_png(
                        np.where(field_grid.mask, red, np.nan),
                        np.where(field_grid.mask, green, np.nan),
                        np.where(field_grid.mask, blue, np.nan),
                    )
                except Exception:
                    obs["rgb_preview_url"] = None

            return obs
        except Exception:
            return None

    def build_time_series(
        self,
        field_id: str,
        geom: Dict[str, Any],
        start_date: str = DEFAULT_HISTORY_START,
        end_date: Optional[str] = None,
        max_cloud_cover: float = 20.0,
        limit: Optional[int] = None,
        skip_scene_ids: Optional[set] = None,
    ) -> List[Dict[str, Any]]:
        """
        Discover real scenes and compute NDVI for each, in parallel.
        Scenes that cannot be read or are mostly cloud inside the field are dropped.
        Raises RasterUnavailable when the catalogue or GDAL stack is unavailable.
        """
        from concurrent.futures import ThreadPoolExecutor

        scenes = self.discover_observations(field_id, geom, start_date, end_date, max_cloud_cover)
        if skip_scene_ids:
            scenes = [sc for sc in scenes if sc.get("scene_id") not in skip_scene_ids]
        if limit:
            scenes = scenes[:limit]
        if not scenes:
            return []
        grid = s2_raster.build_field_grid(shape(geom), self.max_resolution_m)
        with ThreadPoolExecutor(max_workers=SCENE_WORKERS) as pool:
            results = list(pool.map(lambda sc: self.compute_observation(field_id, geom, sc, grid=grid), scenes))
        return [r for r in results if r is not None]

    def latest_valid(
        self, observations: Iterable[Dict[str, Any]]
    ) -> Tuple[Optional[Dict[str, Any]], Optional[Dict[str, Any]]]:
        """Return the latest and previous valid observations, newest first."""
        valid = [
            o
            for o in observations
            if o.get("is_included")
            and o.get("mean_ndvi") is not None
            and o.get("valid_pixel_count", 0) > 0
        ]
        valid.sort(key=lambda o: o.get("acquisition_date") or "", reverse=True)
        latest = valid[0] if valid else None
        previous = valid[1] if len(valid) > 1 else None
        return latest, previous


sentinel_service = SentinelService()

