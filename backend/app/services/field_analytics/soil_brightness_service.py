"""
Sentinel-2 bare-soil brightness for field polygons.

Soil brightness is an indirect remote-sensing indicator derived from real
Sentinel-2 L2A surface reflectance during bare-soil periods. It is NOT a
laboratory soil measurement and must not be interpreted as organic matter,
moisture or nutrient content.

Method (fully documented, reproducible):

1. Candidate scene selection - scenes intersecting the field are screened and
   only those meeting ALL of the following are used:

   * scene-level cloud cover <= ``max_cloud_cover``;
   * field-level NDVI <= ``max_ndvi`` (0.30) so the soil surface dominates the
     signal;
   * field-level valid-pixel fraction >= ``min_valid_percent`` (60 %).

2. Brightness index - on valid bare-soil pixels, with surface reflectance
   ``rho`` rescaled to 0-1 from the L2A integer values:

       BI = sqrt( (rho_B02^2 + rho_B03^2 + rho_B04^2 + rho_B08^2) / 4 )

   This is the brightness component of the Kauth-Thomas (Tasselled Cap)
   transform family applied per-pixel; the Blue/Green/Red/NIR set is used
   because L2A provides all four at 10/20 m. Higher BI means a brighter,
   generally sandier / lower-organic-matter surface; lower BI means a darker,
   generally more organic surface. Both directions are indirect.

3. Composites - the median BI across all qualifying scenes is reported, which
   suppresses residual non-soil contamination better than a mean.

If no scene qualifies, ``SoilBrightnessUnavailable`` is raised: an unavailable
state is correct, a synthetic map is not.
"""

from __future__ import annotations

import base64
import io
from typing import Any, Dict, List, Optional

import numpy as np
from PIL import Image

from app.services.field_analytics import s2_capability
from app.services.field_analytics.s2_raster import RasterUnavailable


class SoilBrightnessUnavailable(RuntimeError):
    """Raised when no suitable bare-soil observation exists for the field."""


class SoilBrightnessService:
    """Derives a bare-soil brightness index from real Sentinel-2 reflectance."""

    max_ndvi = 0.30
    min_valid_percent = 60.0
    max_cloud_cover = 10.0
    formula = "BI = sqrt((B02^2 + B03^2 + B04^2 + B08^2) / 4) on L2A surface reflectance"

    def get_soil_brightness_for_polygon(
        self,
        field_id: str,
        polygon,
        candidates: Optional[List[Dict[str, Any]]] = None,
        start_date: str = "2020-01-01",
        end_date: Optional[str] = None,
        resolution_m: float = 10.0,
    ) -> Dict[str, Any]:
        """
        Screen real Sentinel-2 scenes for bare-soil conditions and compute the
        field-level brightness composite.
        """
        if not s2_capability.AVAILABLE:
            raise SoilBrightnessUnavailable(s2_capability.reason)

        from app.services.field_analytics import s2_raster
        from app.services.field_analytics.sentinel_service import sentinel_service

        if candidates is None:
            candidates = sentinel_service.discover_observations(
                field_id,
                _polygon_dict(polygon),
                start_date=start_date,
                end_date=end_date,
                max_cloud_cover=self.max_cloud_cover,
            )

        if not candidates:
            raise SoilBrightnessUnavailable(
                "No Sentinel-2 acquisition fell below the cloud threshold for this field."
            )

        grid = s2_raster.build_field_grid(polygon, resolution_m)
        qualifying: List[Dict[str, Any]] = []
        per_scene_bi: List[np.ndarray] = []

        for scene in candidates:
            try:
                red = s2_raster._read_asset_on_grid(scene["red_href"], grid)
                nir = s2_raster._read_asset_on_grid(scene["nir_href"], grid)
                green = s2_raster._read_asset_on_grid(scene["green_href"], grid)
                blue = s2_raster._read_asset_on_grid(scene["blue_href"], grid)
            except Exception:  # noqa: BLE001 - skip unreadable scene
                continue

            scl = None
            if scene.get("scl_href"):
                try:
                    scl = s2_raster._read_scl_on_grid(scene["scl_href"], grid)
                except Exception:  # noqa: BLE001
                    scl = None

            valid, _ = s2_raster.quality_mask(red, nir, scl, grid.mask)
            ndvi = s2_raster.compute_ndvi(red, nir, valid)
            stats = s2_raster.ndvi_statistics(ndvi, valid)

            if stats["mean_ndvi"] is None:
                continue
            if stats["mean_ndvi"] > self.max_ndvi:
                continue
            if stats["valid_pixel_percent"] < self.min_valid_percent:
                continue

            with np.errstate(invalid="ignore"):
                bi = np.sqrt(
                    (
                        np.square(blue) / 1e8
                        + np.square(green) / 1e8
                        + np.square(red) / 1e8
                        + np.square(nir) / 1e8
                    )
                    / 4.0
                )
            bi = np.where(valid, bi, np.nan)
            per_scene_bi.append(bi)
            qualifying.append(
                {
                    "scene_id": scene.get("scene_id"),
                    "acquisition_date": scene.get("acquisition_date"),
                    "mean_ndvi": stats["mean_ndvi"],
                    "valid_pixel_percent": stats["valid_pixel_percent"],
                    "cloud_cover_percent": scene.get("cloud_cover_percent"),
                }
            )

        if not per_scene_bi:
            raise SoilBrightnessUnavailable(
                "No cloud-free Sentinel-2 scene had low enough vegetation cover "
                f"(field NDVI <= {self.max_ndvi} and >= {self.min_valid_percent}% "
                "valid pixels) to represent bare soil. Soil brightness is "
                "therefore unavailable - it has not been estimated."
            )

        stack = np.stack(per_scene_bi, axis=0)
        with np.errstate(invalid="ignore"):
            composite = np.nanmedian(stack, axis=0)

        composite = np.where(grid.mask, composite, np.nan)
        values = composite[np.isfinite(composite)]
        if values.size == 0:
            raise SoilBrightnessUnavailable(
                "Bare-soil pixels were masked out across every candidate scene."
            )

        return {
            "field_id": field_id,
            "mean_brightness": round(float(np.mean(values)), 4),
            "median_brightness": round(float(np.median(values)), 4),
            "min_brightness": round(float(np.min(values)), 4),
            "max_brightness": round(float(np.max(values)), 4),
            "std_brightness": round(
                float(np.std(values, ddof=1)) if values.size > 1 else 0.0, 4
            ),
            "valid_pixel_count": int(values.size),
            "scene_count": len(qualifying),
            "scenes_used": qualifying,
            "formula": self.formula,
            "method_notes": (
                "Indirect remote-sensing indicator of bare-soil surface "
                "brightness. Not a laboratory measurement of organic matter, "
                "moisture or nutrients."
            ),
            "grid_crs": grid.crs,
            "grid_shape": list(grid.shape),
            "grid_bounds": list(grid.bounds),
            "resolution_m": resolution_m,
            "data_source": "Copernicus Sentinel-2 L2A surface reflectance",
            "brightness_grid": np.where(np.isfinite(composite), composite, -1.0)
            .round(5)
            .tolist(),
            "mask": grid.mask.tolist(),
            "map_url": _render_brightness(composite),
            "legend": {
                "min": round(float(np.min(values)), 3),
                "max": round(float(np.max(values)), 3),
                "unit": "unitless brightness index",
            },
        }


def _polygon_dict(polygon) -> Dict[str, Any]:
    from shapely.geometry import mapping

    return mapping(polygon)


def _render_brightness(brightness: np.ndarray) -> str:
    finite = brightness[np.isfinite(brightness)]
    if finite.size == 0:
        return ""
    lo, hi = np.percentile(finite, (2, 98))
    if hi <= lo:
        hi = lo + 1e-6

    height, width = brightness.shape
    canvas = np.zeros((height, width, 4), dtype=np.uint8)
    for row in range(height):
        for col in range(width):
            value = brightness[row, col]
            if not np.isfinite(value):
                continue
            t = max(0.0, min(1.0, (value - lo) / (hi - lo)))
            canvas[row, col] = (
                int(60 + t * 175),
                int(45 + t * 160),
                int(35 + t * 115),
                255,
            )
    image = Image.fromarray(canvas, mode="RGBA")
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buffer.getvalue()).decode()


soil_brightness_service = SoilBrightnessService()
