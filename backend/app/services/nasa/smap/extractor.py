"""
NASA SMAP (SPL3SMP_E.006) 9 km EASE-Grid Soil Moisture spatial extractor.
Extracts volumetric surface soil moisture (m³/m³) for field polygons using HDF5 datasets.
"""

from pathlib import Path
from typing import Any, Optional
import h5py
import numpy as np
import shapely
from shapely.geometry import box, shape, Polygon, MultiPolygon
from app.services.nasa.common import (
    reproject_geometry_to_ease,
    calculate_spatial_statistics,
    get_coarse_resolution_warning,
)

# EASE-Grid 2.0 Global 9 km Grid Parameters (EPSG:6933)
# Global extent: X in [-17367530.45, 17367530.45], Y in [-7314540.83, 7314540.83]
# Array dimensions: 1624 rows x 3856 cols
EASE2_CELL_SIZE = 9008.05521015625 # meters
EASE2_ORIGIN_X = -17367530.45
EASE2_ORIGIN_Y = 7314540.83
EASE2_ROWS = 1624
EASE2_COLS = 3856

class SmapExtractor:
    def __init__(self):
        pass

    def extract_from_hdf5(
        self,
        h5_path: Path,
        field_geom_wgs84: Any,
        field_area_ha: float,
    ) -> Optional[dict[str, Any]]:
        """
        Extract volumetric soil moisture (m³/m³) from a SMAP SPL3SMP_E HDF5 file.
        Filters nodata (-9999.0) and uses retrieval_qual_flag bit 0 (0 = recommended).
        """
        if not h5_path.exists():
            return None

        # Reproject field polygon to EASE-Grid 2.0
        poly_ease = reproject_geometry_to_ease(field_geom_wgs84)
        if not poly_ease.is_valid:
            poly_ease = poly_ease.buffer(0)
        if poly_ease.is_empty:
            return None

        minx, miny, maxx, maxy = poly_ease.bounds
        total_poly_area_m2 = poly_ease.area

        try:
            with h5py.File(str(h5_path), "r") as f:
                # Read AM (morning) pass first, fallback to PM if empty
                sm_dset = None
                qf_dset = None
                for pass_prefix in ["Soil_Moisture_Retrieval_Data_AM", "Soil_Moisture_Retrieval_Data_PM"]:
                    if pass_prefix in f:
                        grp = f[pass_prefix]
                        if "soil_moisture" in grp:
                            sm_dset = grp["soil_moisture"]
                            qf_dset = grp.get("retrieval_qual_flag")
                            break

                if sm_dset is None:
                    # Synthetic or simplified test structure support
                    if "soil_moisture" in f:
                        sm_dset = f["soil_moisture"]
                        qf_dset = f.get("retrieval_qual_flag")
                    else:
                        return None

                # Determine row/col bounding box in EASE-Grid 2.0
                col_min = max(0, int((minx - EASE2_ORIGIN_X) / EASE2_CELL_SIZE))
                col_max = min(EASE2_COLS - 1, int((maxx - EASE2_ORIGIN_X) / EASE2_CELL_SIZE))
                row_min = max(0, int((EASE2_ORIGIN_Y - maxy) / EASE2_CELL_SIZE))
                row_max = min(EASE2_ROWS - 1, int((EASE2_ORIGIN_Y - miny) / EASE2_CELL_SIZE))

                # Handle single-cell / centroid fallback when field is completely within 1 cell
                if col_min > col_max or row_min > row_max:
                    centroid = poly_ease.centroid
                    c = max(0, min(EASE2_COLS - 1, int((centroid.x - EASE2_ORIGIN_X) / EASE2_CELL_SIZE)))
                    r = max(0, min(EASE2_ROWS - 1, int((EASE2_ORIGIN_Y - centroid.y) / EASE2_CELL_SIZE)))
                    col_min, col_max = c, c
                    row_min, row_max = r, r

                values: list[float] = []
                weights: list[float] = []
                total_covered_m2 = 0.0

                for r in range(row_min, row_max + 1):
                    for c in range(col_min, col_max + 1):
                        val = float(sm_dset[r, c])
                        # Filter nodata (-9999.0) and unphysical values (soil moisture is between 0.0 and 0.9 m3/m3)
                        if val < 0.0 or val > 1.0:
                            continue

                        # Check quality flag (bit 0 = 0 recommended retrieval)
                        if qf_dset is not None:
                            qf_val = int(qf_dset[r, c])
                            if (qf_val & 1) != 0: # Bit 0 set means retrieval not recommended
                                continue

                        # Calculate cell bounding box in meters
                        cell_minx = EASE2_ORIGIN_X + c * EASE2_CELL_SIZE
                        cell_maxx = cell_minx + EASE2_CELL_SIZE
                        cell_maxy = EASE2_ORIGIN_Y - r * EASE2_CELL_SIZE
                        cell_miny = cell_maxy - EASE2_CELL_SIZE
                        cell_geom = box(cell_minx, cell_miny, cell_maxx, cell_maxy)

                        if poly_ease.intersects(cell_geom):
                            inter = poly_ease.intersection(cell_geom)
                            area = inter.area
                            if area > 0:
                                values.append(val)
                                weights.append(area)
                                total_covered_m2 += area

                # If polygon didn't catch due to edge boundary, fallback to centroid
                if not values:
                    centroid = poly_ease.centroid
                    c = max(0, min(EASE2_COLS - 1, int((centroid.x - EASE2_ORIGIN_X) / EASE2_CELL_SIZE)))
                    r = max(0, min(EASE2_ROWS - 1, int((EASE2_ORIGIN_Y - centroid.y) / EASE2_CELL_SIZE)))
                    val = float(sm_dset[r, c])
                    if 0.0 <= val <= 1.0:
                        values.append(val)
                        weights.append(total_poly_area_m2)
                        total_covered_m2 = total_poly_area_m2

                if not values:
                    return None

                stats = calculate_spatial_statistics(
                    values=values,
                    weights=weights,
                    total_polygon_area_m2=total_poly_area_m2,
                    covered_area_m2=total_covered_m2,
                )

                warning = get_coarse_resolution_warning(
                    source="NASA SMAP (9 km)",
                    field_area_ha=field_area_ha,
                    pixel_resolution_km=9.0,
                    intersecting_pixels=len(values),
                )

                return {
                    **stats,
                    "unit": "m³/m³",
                    "is_coarse_resolution": True,
                    "resolution_limitation": warning,
                    "quality_status": "good" if stats["coverage_pct"] >= 80 else "partial",
                }

        except Exception as e:
            return None

smap_extractor = SmapExtractor()

