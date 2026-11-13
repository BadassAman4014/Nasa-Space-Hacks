"""
NASA MODIS (MOD13Q1.061) 250 m Sinusoidal Vegetation Indices spatial extractor.
Extracts 16-day composite NDVI and EVI with pixel reliability quality filtering.
"""

from pathlib import Path
from typing import Any, Optional
import h5py
import numpy as np
import shapely
from shapely.geometry import box, shape, Polygon, MultiPolygon
from app.services.nasa.common import (
    reproject_geometry_to_sinu,
    calculate_spatial_statistics,
)

# MODIS Sinusoidal Grid Tile Parameters (h18v03 covers Brandenburg/Germany)
# Global Earth circumference = 40075016.6855785 m (-20015008.34 to 20015008.34)
# 36 horizontal tiles x 18 vertical tiles
# Each tile width & height = 1111950.5197 m (4800 x 4800 pixels at 250m, cell size = 231.656358 m)
MODIS_TILE_WIDTH_M = 1111950.5197
MODIS_PIXEL_SIZE_M = 231.6563582639
MODIS_CELLS_PER_TILE = 4800
H_TILE = 18
V_TILE = 3
TILE_ORIGIN_X = -20015008.34 + H_TILE * MODIS_TILE_WIDTH_M
TILE_ORIGIN_Y = 10007504.17 - V_TILE * MODIS_TILE_WIDTH_M

MODIS_SCALE_FACTOR = 0.0001
MODIS_FILL_VALUE = -3000

class ModisExtractor:
    def __init__(self):
        pass

    def extract_from_hdf_or_raster(
        self,
        file_path: Path,
        field_geom_wgs84: Any,
        field_area_ha: float,
    ) -> Optional[dict[str, Any]]:
        """
        Extract scaled NDVI and EVI from MOD13Q1 dataset with pixel reliability quality filtering.
        Pixel Reliability: 0 = Good, 1 = Marginal (accepted). 2 = Snow/Ice, 3 = Cloudy (filtered out).
        """
        if not file_path.exists():
            return None

        poly_sinu = reproject_geometry_to_sinu(field_geom_wgs84)
        if not poly_sinu.is_valid:
            poly_sinu = poly_sinu.buffer(0)
        if poly_sinu.is_empty:
            return None

        minx, miny, maxx, maxy = poly_sinu.bounds
        total_poly_area_m2 = poly_sinu.area

        try:
            with h5py.File(str(file_path), "r") as f:
                # Find datasets in HDF/HDF5 hierarchy
                ndvi_dset = None
                evi_dset = None
                qa_dset = None

                for k in f.keys():
                    if "NDVI" in k or "ndvi" in k:
                        ndvi_dset = f[k]
                    elif "EVI" in k or "evi" in k:
                        evi_dset = f[k]
                    elif "reliability" in k or "pixel_reliability" in k or "QA" in k:
                        qa_dset = f[k]

                # Support standard MODIS EOS HDF group structures
                if ndvi_dset is None and "MODIS_Grid_16DAY_250m_VI" in f:
                    grp = f["MODIS_Grid_16DAY_250m_VI"]["Data Fields"]
                    ndvi_dset = grp.get("250m 16 days NDVI")
                    evi_dset = grp.get("250m 16 days EVI")
                    qa_dset = grp.get("250m 16 days pixel reliability")

                if ndvi_dset is None:
                    return None

                col_min = max(0, int((minx - TILE_ORIGIN_X) / MODIS_PIXEL_SIZE_M))
                col_max = min(MODIS_CELLS_PER_TILE - 1, int((maxx - TILE_ORIGIN_X) / MODIS_PIXEL_SIZE_M))
                row_min = max(0, int((TILE_ORIGIN_Y - maxy) / MODIS_PIXEL_SIZE_M))
                row_max = min(MODIS_CELLS_PER_TILE - 1, int((TILE_ORIGIN_Y - miny) / MODIS_PIXEL_SIZE_M))

                if col_min > col_max or row_min > row_max:
                    c = max(0, min(MODIS_CELLS_PER_TILE - 1, int((poly_sinu.centroid.x - TILE_ORIGIN_X) / MODIS_PIXEL_SIZE_M)))
                    r = max(0, min(MODIS_CELLS_PER_TILE - 1, int((TILE_ORIGIN_Y - poly_sinu.centroid.y) / MODIS_PIXEL_SIZE_M)))
                    col_min, col_max = c, c
                    row_min, row_max = r, r

                ndvi_values: list[float] = []
                evi_values: list[float] = []
                weights: list[float] = []
                total_covered_m2 = 0.0

                for r in range(row_min, row_max + 1):
                    for c in range(col_min, col_max + 1):
                        # Check pixel reliability quality flag
                        if qa_dset is not None:
                            qa_val = int(qa_dset[r, c])
                            # Only accept 0 (Good) or 1 (Marginal); reject snow (2) and cloudy (3)
                            if qa_val > 1 or qa_val < 0:
                                continue

                        raw_ndvi = int(ndvi_dset[r, c])
                        if raw_ndvi <= MODIS_FILL_VALUE or raw_ndvi < -2000 or raw_ndvi > 10000:
                            continue

                        scaled_ndvi = round(raw_ndvi * MODIS_SCALE_FACTOR, 4)

                        scaled_evi = None
                        if evi_dset is not None:
                            raw_evi = int(evi_dset[r, c])
                            if raw_evi > MODIS_FILL_VALUE and -2000 <= raw_evi <= 10000:
                                scaled_evi = round(raw_evi * MODIS_SCALE_FACTOR, 4)

                        cell_minx = TILE_ORIGIN_X + c * MODIS_PIXEL_SIZE_M
                        cell_maxx = cell_minx + MODIS_PIXEL_SIZE_M
                        cell_maxy = TILE_ORIGIN_Y - r * MODIS_PIXEL_SIZE_M
                        cell_miny = cell_maxy - MODIS_PIXEL_SIZE_M
                        cell_geom = box(cell_minx, cell_miny, cell_maxx, cell_maxy)

                        if poly_sinu.intersects(cell_geom):
                            inter = poly_sinu.intersection(cell_geom)
                            area = inter.area
                            if area > 0:
                                ndvi_values.append(scaled_ndvi)
                                if scaled_evi is not None:
                                    evi_values.append(scaled_evi)
                                weights.append(area)
                                total_covered_m2 += area

                # Centroid fallback
                if not ndvi_values:
                    c = max(0, min(MODIS_CELLS_PER_TILE - 1, int((poly_sinu.centroid.x - TILE_ORIGIN_X) / MODIS_PIXEL_SIZE_M)))
                    r = max(0, min(MODIS_CELLS_PER_TILE - 1, int((TILE_ORIGIN_Y - poly_sinu.centroid.y) / MODIS_PIXEL_SIZE_M)))
                    raw_ndvi = int(ndvi_dset[r, c])
                    if raw_ndvi > MODIS_FILL_VALUE:
                        scaled_ndvi = round(raw_ndvi * MODIS_SCALE_FACTOR, 4)
                        ndvi_values.append(scaled_ndvi)
                        weights.append(total_poly_area_m2)
                        total_covered_m2 = total_poly_area_m2
                        if evi_dset is not None:
                            raw_evi = int(evi_dset[r, c])
                            if raw_evi > MODIS_FILL_VALUE:
                                evi_values.append(round(raw_evi * MODIS_SCALE_FACTOR, 4))

                if not ndvi_values:
                    return None

                ndvi_stats = calculate_spatial_statistics(
                    values=ndvi_values,
                    weights=weights,
                    total_polygon_area_m2=total_poly_area_m2,
                    covered_area_m2=total_covered_m2,
                )

                evi_mean = round(float(np.mean(evi_values)), 4) if evi_values else None

                is_subpixel = field_area_ha < 6.25
                res_note = None
                if is_subpixel:
                    res_note = (
                        f"Field area ({field_area_ha:.2f} ha) is smaller than the 250 m MODIS pixel (6.25 ha/pixel). "
                        f"Values represent the dominant 250 m cell covering the centroid."
                    )

                return {
                    "ndvi": ndvi_stats,
                    "evi_mean": evi_mean,
                    "is_subpixel": is_subpixel,
                    "resolution_limitation": res_note,
                    "quality_status": "good" if ndvi_stats["coverage_pct"] >= 80 else "marginal",
                }

        except Exception:
            return None

modis_extractor = ModisExtractor()

