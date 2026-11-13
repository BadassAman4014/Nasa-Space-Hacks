"""
Common geospatial, coordinate transformation, and statistical utilities for NASA datasets.
"""

from typing import Any, Optional, Tuple
import numpy as np
import pyproj
import shapely
from shapely.geometry import shape, box, Polygon, MultiPolygon, Point

# Geographical bounds of Brandenburg, Germany (WGS84)
BRANDENBURG_BBOX = (11.26, 51.36, 14.77, 53.56) # min_lon, min_lat, max_lon, max_lat

# NASA Coordinate Projections
CRS_WGS84 = pyproj.CRS("EPSG:4326")
CRS_EASE_GRID_9KM = pyproj.CRS("EPSG:6933") # EASE-Grid 2.0 Global
CRS_MODIS_SINU = pyproj.CRS("+proj=sinu +lon_0=0 +x_0=0 +y_0=0 +a=6371007.181 +b=6371007.181 +units=m +no_defs")

# Cached coordinate transformers
_transformer_to_ease = pyproj.Transformer.from_crs(CRS_WGS84, CRS_EASE_GRID_9KM, always_xy=True)
_transformer_to_sinu = pyproj.Transformer.from_crs(CRS_WGS84, CRS_MODIS_SINU, always_xy=True)

def reproject_geometry_to_ease(geom: Any) -> Any:
    """Reproject WGS84 GeoJSON or Shapely geometry to SMAP EASE-Grid 2.0 (meters)."""
    if isinstance(geom, dict):
        geom = shape(geom)
    trans_func = lambda coords: np.column_stack(_transformer_to_ease.transform(coords[:, 0], coords[:, 1]))
    return shapely.transform(geom, trans_func)

def reproject_geometry_to_sinu(geom: Any) -> Any:
    """Reproject WGS84 GeoJSON or Shapely geometry to MODIS Sinusoidal projection (meters)."""
    if isinstance(geom, dict):
        geom = shape(geom)
    trans_func = lambda coords: np.column_stack(_transformer_to_sinu.transform(coords[:, 0], coords[:, 1]))
    return shapely.transform(geom, trans_func)

def calculate_spatial_statistics(
    values: list[float],
    weights: Optional[list[float]] = None,
    total_polygon_area_m2: float = 0.0,
    covered_area_m2: float = 0.0,
) -> dict[str, Any]:
    """
    Calculate area-weighted mean, min, max, std, valid count and coverage.
    """
    if not values:
        return {
            "mean": 0.0,
            "min": 0.0,
            "max": 0.0,
            "std": 0.0,
            "valid_count": 0,
            "coverage_pct": 0.0,
        }

    val_arr = np.array(values, dtype=np.float64)
    if weights and len(weights) == len(values) and sum(weights) > 0:
        w_arr = np.array(weights, dtype=np.float64)
        weighted_mean = float(np.sum(val_arr * w_arr) / np.sum(w_arr))
        # Weighted variance
        weighted_var = float(np.sum(w_arr * (val_arr - weighted_mean) ** 2) / np.sum(w_arr))
        weighted_std = float(np.sqrt(max(0.0, weighted_var)))
    else:
        weighted_mean = float(np.mean(val_arr))
        weighted_std = float(np.std(val_arr))

    coverage_pct = 100.0
    if total_polygon_area_m2 > 0 and covered_area_m2 > 0:
        coverage_pct = min(100.0, max(0.0, (covered_area_m2 / total_polygon_area_m2) * 100.0))

    return {
        "mean": round(weighted_mean, 4),
        "min": round(float(np.min(val_arr)), 4),
        "max": round(float(np.max(val_arr)), 4),
        "std": round(weighted_std, 4),
        "valid_count": len(values),
        "coverage_pct": round(coverage_pct, 1),
    }

def get_coarse_resolution_warning(
    source: str,
    field_area_ha: float,
    pixel_resolution_km: float,
    intersecting_pixels: int,
) -> str:
    """
    Generate an explicit, scientifically accurate resolution disclaimer for coarse products.
    """
    pixel_area_ha = (pixel_resolution_km * 1000) ** 2 / 10000.0
    return (
        f"At ~{pixel_resolution_km:.0f} km spatial resolution (~{pixel_area_ha:.0f} ha/pixel), "
        f"this field ({field_area_ha:.2f} ha) intersects {intersecting_pixels} regional satellite pixel(s). "
        f"Values represent regional {source} observations covering the field area, "
        f"not within-field micro-spatial variation."
    )

