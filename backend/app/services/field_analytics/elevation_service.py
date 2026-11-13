"""
Copernicus DEM GLO-30 elevation extraction for field polygons.

Reads the real 30 m Copernicus Digital Surface Model from the public AWS Open
Data mirror (``copernicus-dem-30m``), reprojects it onto the field's UTM grid and
derives elevation statistics and slope.

If the DEM tile or the GDAL stack is unavailable, ``ElevationUnavailable`` is
raised. Elevation is never interpolated from coordinates or generated randomly.

Reference
---------
Copernicus DEM GLO-30, © DLR e.V. / ESA, distributed via the Copernicus
Programme and the AWS Open Data Registry.
"""

from __future__ import annotations

import base64
import io
import math
from typing import Any, Dict, Optional

import numpy as np
from PIL import Image

from app.services.field_analytics import s2_capability

DEM_BASE_URL = "https://copernicus-dem-30m.s3.amazonaws.com"


class ElevationUnavailable(RuntimeError):
    """Raised when real DEM data cannot be obtained for the field."""


def dem_tile_name(lat: float, lon: float) -> str:
    """Build the Copernicus DEM GLO-30 tile name for a 1-degree cell."""
    ns = "N" if lat >= 0 else "S"
    ew = "E" if lon >= 0 else "W"
    return (
        f"Copernicus_DSM_COG_10_{ns}{abs(int(math.floor(lat))):02d}_00_"
        f"{ew}{abs(int(math.floor(lon))):03d}_00_DEM"
    )


def dem_tile_url(lat: float, lon: float) -> str:
    name = dem_tile_name(lat, lon)
    return f"{DEM_BASE_URL}/{name}/{name}.tif"


def _elevation_colour(normalised: float) -> tuple:
    """Hypsometric tint from low (green) to high (brown)."""
    t = max(0.0, min(1.0, normalised))
    return (
        int(70 + t * 165),
        int(120 + t * 60),
        int(80 - t * 30),
    )


class ElevationService:
    data_source = "Copernicus DEM GLO-30 (30 m, DLR/ESA via AWS Open Data)"
    native_resolution_m = 30.0

    def get_elevation_for_polygon(
        self,
        field_id: str,
        polygon,
        resolution_m: float = 10.0,
    ) -> Dict[str, Any]:
        """Sample the real DEM on the field grid and derive terrain metrics."""
        if not s2_capability.AVAILABLE:
            raise ElevationUnavailable(s2_capability.reason)

        import rasterio
        from rasterio.warp import Resampling, reproject

        from app.services.field_analytics import s2_raster

        grid = s2_raster.build_field_grid(polygon, resolution_m)
        lon, lat = polygon.centroid.x, polygon.centroid.y
        url = dem_tile_url(lat, lon)

        try:
            with rasterio.open(url) as src:
                elevation = np.full(grid.shape, np.nan, dtype="float32")
                reproject(
                    source=rasterio.band(src, 1),
                    destination=elevation,
                    dst_transform=grid.transform,
                    dst_crs=grid.crs,
                    dst_nodata=np.nan,
                    resampling=Resampling.bilinear,
                    src_nodata=src.nodata,
                )
        except Exception as exc:  # noqa: BLE001
            raise ElevationUnavailable(
                f"Copernicus DEM tile could not be read ({exc.__class__.__name__})."
            ) from exc

        elevation = np.where(grid.mask, elevation, np.nan)
        values = elevation[np.isfinite(elevation)]
        if values.size == 0:
            raise ElevationUnavailable(
                "Copernicus DEM has no valid cells inside this field polygon."
            )

        cell_x = abs(grid.transform.a)
        cell_y = abs(grid.transform.e)
        filled = np.where(np.isfinite(elevation), elevation, np.nanmean(values))
        dy, dx = np.gradient(filled, cell_y, cell_x)
        slope_deg = np.degrees(np.arctan(np.hypot(dx, dy)))
        slope_values = slope_deg[np.isfinite(elevation)]

        minimum = float(np.min(values))
        maximum = float(np.max(values))
        span = maximum - minimum

        return {
            "field_id": field_id,
            "min_elevation_m": round(minimum, 2),
            "max_elevation_m": round(maximum, 2),
            "mean_elevation_m": round(float(np.mean(values)), 2),
            "elevation_range_m": round(span, 2),
            "std_elevation_m": round(
                float(np.std(values, ddof=1)) if values.size > 1 else 0.0, 3
            ),
            "mean_slope_deg": round(float(np.mean(slope_values)), 3),
            "max_slope_deg": round(float(np.max(slope_values)), 3),
            "valid_pixel_count": int(values.size),
            "grid_crs": grid.crs,
            "grid_shape": list(grid.shape),
            "grid_bounds": list(grid.bounds),
            "resolution_m": resolution_m,
            "dem_native_resolution_m": self.native_resolution_m,
            "dem_tile": dem_tile_name(lat, lon),
            "data_source": self.data_source,
            "elevation_grid": np.where(
                np.isfinite(elevation), elevation, -9999.0
            ).round(2).tolist(),
            "mask": grid.mask.tolist(),
            "map_url": self._render(elevation, grid.mask, minimum, span),
            "legend": {
                "min_m": round(minimum, 1),
                "max_m": round(maximum, 1),
                "unit": "m above sea level",
            },
        }

    def _render(
        self, elevation: np.ndarray, mask: np.ndarray, minimum: float, span: float
    ) -> str:
        height, width = elevation.shape
        canvas = np.zeros((height, width, 4), dtype=np.uint8)
        for row in range(height):
            for col in range(width):
                value = elevation[row, col]
                if not mask[row, col] or not np.isfinite(value):
                    continue
                normalised = (value - minimum) / (span + 1e-6)
                red, green, blue = _elevation_colour(normalised)
                canvas[row, col] = (red, green, blue, 255)
        image = Image.fromarray(canvas, mode="RGBA")
        buffer = io.BytesIO()
        image.save(buffer, format="PNG")
        return "data:image/png;base64," + base64.b64encode(buffer.getvalue()).decode()


elevation_service = ElevationService()
