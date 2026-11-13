"""
NASA GPM IMERG (V07B) 0.1° (~10 km) Precipitation spatial extractor.
Extracts daily accumulated precipitation (mm) for field polygons from NetCDF4/HDF5 datasets.
"""

from pathlib import Path
from typing import Any, Optional
import h5py
import numpy as np
import shapely
from shapely.geometry import box, shape, Polygon, MultiPolygon
from app.services.nasa.common import (
    calculate_spatial_statistics,
    get_coarse_resolution_warning,
)

# GPM IMERG Global 0.1° Grid Parameters (EPSG:4326)
# Lat: -90.0 to 90.0 (1800 cells), Lon: -180.0 to 180.0 (3600 cells)
# Pixel size: 0.1 degrees (~11.1 km at equator, ~10 km in Brandenburg)
IMERG_CELL_DEG = 0.1
IMERG_ORIGIN_LON = -180.0
IMERG_ORIGIN_LAT = -90.0
IMERG_ROWS = 1800
IMERG_COLS = 3600

class GpmExtractor:
    def __init__(self):
        pass

    def extract_from_hdf5_or_netcdf(
        self,
        file_path: Path,
        field_geom_wgs84: Any,
        field_area_ha: float,
    ) -> Optional[dict[str, Any]]:
        """
        Extract daily precipitation (mm) from a GPM IMERG NetCDF4/HDF5 file.
        Properly distinguishes precipitation rate (mm/hr) vs accumulation (mm).
        """
        if not file_path.exists():
            return None

        if isinstance(field_geom_wgs84, dict):
            poly_wgs84 = shape(field_geom_wgs84)
        else:
            poly_wgs84 = field_geom_wgs84

        if not poly_wgs84.is_valid:
            poly_wgs84 = poly_wgs84.buffer(0)
        if poly_wgs84.is_empty:
            return None

        min_lon, min_lat, max_lon, max_lat = poly_wgs84.bounds
        total_poly_area_deg2 = poly_wgs84.area

        try:
            with h5py.File(str(file_path), "r") as f:
                # Find precipitation dataset
                precip_dset = None
                is_rate = False # if True, multiply by 24 for daily accumulation

                # Standard IMERG V07 hierarchy: /Grid/precipitation or /Grid/precipitationCal
                if "Grid" in f:
                    grid_grp = f["Grid"]
                    if "precipitation" in grid_grp:
                        precip_dset = grid_grp["precipitation"]
                    elif "precipitationCal" in grid_grp:
                        precip_dset = grid_grp["precipitationCal"]
                        # In half-hourly product it's mm/hr; in daily it's mm/day
                        units = str(precip_dset.attrs.get("units", ""))
                        if "mm/hr" in units or "mm/h" in units:
                            is_rate = True
                elif "precipitation" in f:
                    precip_dset = f["precipitation"]
                elif "precipitationCal" in f:
                    precip_dset = f["precipitationCal"]

                if precip_dset is None:
                    return None

                data_shape = precip_dset.shape
                # IMERG arrays can be (lon, lat) or (lat, lon) or (time, lon, lat)
                # Standard is (lon, lat) = (3600, 1800)
                is_transposed = False
                if len(data_shape) == 2:
                    if data_shape == (1800, 3600):
                        is_transposed = True # (lat, lon)
                elif len(data_shape) == 3:
                    # (time, lon, lat) or (time, lat, lon)
                    if data_shape[1:] == (1800, 3600):
                        is_transposed = True

                col_min = max(0, int((min_lon - IMERG_ORIGIN_LON) / IMERG_CELL_DEG))
                col_max = min(IMERG_COLS - 1, int((max_lon - IMERG_ORIGIN_LON) / IMERG_CELL_DEG))
                row_min = max(0, int((min_lat - IMERG_ORIGIN_LAT) / IMERG_CELL_DEG))
                row_max = min(IMERG_ROWS - 1, int((max_lat - IMERG_ORIGIN_LAT) / IMERG_CELL_DEG))

                if col_min > col_max or row_min > row_max:
                    c = max(0, min(IMERG_COLS - 1, int((poly_wgs84.centroid.x - IMERG_ORIGIN_LON) / IMERG_CELL_DEG)))
                    r = max(0, min(IMERG_ROWS - 1, int((poly_wgs84.centroid.y - IMERG_ORIGIN_LAT) / IMERG_CELL_DEG)))
                    col_min, col_max = c, c
                    row_min, row_max = r, r

                values: list[float] = []
                weights: list[float] = []
                total_covered_deg2 = 0.0

                for r in range(row_min, row_max + 1):
                    for c in range(col_min, col_max + 1):
                        if is_transposed:
                            raw_val = precip_dset[r, c] if len(data_shape) == 2 else precip_dset[0, r, c]
                        else:
                            raw_val = precip_dset[c, r] if len(data_shape) == 2 else precip_dset[0, c, r]

                        val = float(raw_val)
                        # Filter nodata (e.g. -9999.9) and negative values
                        if val < 0.0 or val > 1500.0:
                            continue

                        # Convert mm/hr rate to daily accumulation if applicable
                        if is_rate:
                            val = val * 24.0

                        cell_minx = IMERG_ORIGIN_LON + c * IMERG_CELL_DEG
                        cell_maxx = cell_minx + IMERG_CELL_DEG
                        cell_miny = IMERG_ORIGIN_LAT + r * IMERG_CELL_DEG
                        cell_maxy = cell_miny + IMERG_CELL_DEG
                        cell_geom = box(cell_minx, cell_miny, cell_maxx, cell_maxy)

                        if poly_wgs84.intersects(cell_geom):
                            inter = poly_wgs84.intersection(cell_geom)
                            area = inter.area
                            if area > 0:
                                values.append(val)
                                weights.append(area)
                                total_covered_deg2 += area

                # Centroid fallback
                if not values:
                    c = max(0, min(IMERG_COLS - 1, int((poly_wgs84.centroid.x - IMERG_ORIGIN_LON) / IMERG_CELL_DEG)))
                    r = max(0, min(IMERG_ROWS - 1, int((poly_wgs84.centroid.y - IMERG_ORIGIN_LAT) / IMERG_CELL_DEG)))
                    if is_transposed:
                        val = float(precip_dset[r, c] if len(data_shape) == 2 else precip_dset[0, r, c])
                    else:
                        val = float(precip_dset[c, r] if len(data_shape) == 2 else precip_dset[0, c, r])
                    if val >= 0.0:
                        if is_rate: val *= 24.0
                        values.append(val)
                        weights.append(total_poly_area_deg2)
                        total_covered_deg2 = total_poly_area_deg2

                if not values:
                    return None

                stats = calculate_spatial_statistics(
                    values=values,
                    weights=weights,
                    total_polygon_area_m2=total_poly_area_deg2,
                    covered_area_m2=total_covered_deg2,
                )

                warning = get_coarse_resolution_warning(
                    source="NASA GPM IMERG (10 km / 0.1°)",
                    field_area_ha=field_area_ha,
                    pixel_resolution_km=10.0,
                    intersecting_pixels=len(values),
                )

                return {
                    **stats,
                    "unit": "mm",
                    "product_run": "Final",
                    "is_coarse_resolution": True,
                    "resolution_limitation": warning,
                    "quality_status": "good",
                }

        except Exception:
            return None

gpm_extractor = GpmExtractor()

