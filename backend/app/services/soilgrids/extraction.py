"""
Spatial raster extraction service for SoilGrids.
Reprojects field geometries to Homolosine, intersects with raster tiles,
masks pixels, handles MultiPolygons and subpixel fields, and extracts weighted measurements.
"""

from typing import Any, Optional
import numpy as np
import pyproj
import shapely
from shapely.geometry import Polygon, MultiPolygon, Point, box, shape
from app.services.soilgrids.client import soilgrids_client, SoilGridsClient
from app.services.soilgrids.raster_loader import raster_loader, LoadedRasterTile, RasterLoader

# Homolosine projection used by SoilGrids v2.0
HOMOLOSINE_PROJ = "+proj=igh +lat_0=0 +lon_0=0 +datum=WGS84 +units=m +no_defs"
_crs_wgs84 = pyproj.CRS("EPSG:4326")
_crs_homo = pyproj.CRS(HOMOLOSINE_PROJ)
_transformer = pyproj.Transformer.from_crs(_crs_wgs84, _crs_homo, always_xy=True)
_trans_func = lambda coords: np.column_stack(_transformer.transform(coords[:, 0], coords[:, 1]))

class ExtractionResult:
    def __init__(
        self,
        property_name: str,
        depth: str,
        values: list[float],
        weights: list[float],
        field_area_m2: float,
        covered_area_m2: float,
        is_subpixel: bool = False,
    ):
        self.property_name = property_name
        self.depth = depth
        self.values = values
        self.weights = weights
        self.field_area_m2 = field_area_m2
        self.covered_area_m2 = covered_area_m2
        self.is_subpixel = is_subpixel

    @property
    def valid_pixel_count(self) -> int:
        return len(self.values)

    @property
    def coverage_percentage(self) -> float:
        if self.field_area_m2 <= 0:
            return 0.0
        pct = (self.covered_area_m2 / self.field_area_m2) * 100.0
        return min(100.0, max(0.0, pct))

class SoilGridsExtractor:
    def __init__(
        self,
        client: Optional[SoilGridsClient] = None,
        loader: Optional[RasterLoader] = None,
    ):
        self.client = client or soilgrids_client
        self.loader = loader or raster_loader

    def to_homolosine(self, geom: Any) -> Any:
        """Reproject geometry from WGS84 (lon, lat) to SoilGrids Homolosine projection (meters)."""
        if isinstance(geom, dict):
            geom = shape(geom)
        return shapely.transform(geom, _trans_func)

    def extract_property_at_depth(
        self,
        geom_wgs84: Any,
        property_name: str,
        depth: str,
    ) -> Optional[ExtractionResult]:
        """
        Extract raster values for a specific soil property and depth interval
        over the given field geometry.
        """
        try:
            poly_homo = self.to_homolosine(geom_wgs84)
            if not poly_homo.is_valid:
                poly_homo = poly_homo.buffer(0)
            if poly_homo.is_empty:
                return None
        except Exception:
            return None

        field_area_m2 = poly_homo.area
        minx, miny, maxx, maxy = poly_homo.bounds

        # Check subpixel status (250m x 250m = 62,500 m2 = 6.25 ha)
        is_subpixel = field_area_m2 < 62500.0

        # Find intersecting tiles
        tiles_info = self.client.find_intersecting_tiles(minx, miny, maxx, maxy)
        if not tiles_info:
            return None

        extracted_values: list[float] = []
        extracted_weights: list[float] = []
        total_covered_m2 = 0.0

        for t_info in tiles_info:
            tile_path = self.client.get_tile_file(property_name, depth, t_info)
            if not tile_path or not tile_path.exists():
                continue

            try:
                tile = self.loader.load_tile(tile_path, fallback_tile_info=t_info)
            except Exception:
                continue

            # Determine col/row bounding box for the polygon in this tile
            col_min = max(0, int((minx - tile.origin_x) / tile.pixel_size_x))
            col_max = min(tile.width - 1, int((maxx - tile.origin_x) / tile.pixel_size_x))
            row_min = max(0, int((tile.origin_y - maxy) / tile.pixel_size_y))
            row_max = min(tile.height - 1, int((tile.origin_y - miny) / tile.pixel_size_y))

            if col_min > col_max or row_min > row_max:
                # Field might be entirely within a single cell or boundary
                centroid = poly_homo.centroid
                c, r = tile.world_to_pixel(centroid.x, centroid.y)
                val = tile.get_pixel_value(c, r)
                if val is not None:
                    extracted_values.append(val)
                    extracted_weights.append(field_area_m2)
                    total_covered_m2 += field_area_m2
                continue

            for r in range(row_min, row_max + 1):
                for c in range(col_min, col_max + 1):
                    val = tile.get_pixel_value(c, r)
                    if val is None:
                        continue

                    px_minx = tile.origin_x + c * tile.pixel_size_x
                    px_maxx = px_minx + tile.pixel_size_x
                    px_maxy = tile.origin_y - r * tile.pixel_size_y
                    px_miny = px_maxy - tile.pixel_size_y
                    cell = box(px_minx, px_miny, px_maxx, px_maxy)

                    if poly_homo.intersects(cell):
                        inter = poly_homo.intersection(cell)
                        inter_area = inter.area
                        if inter_area > 0:
                            extracted_values.append(val)
                            extracted_weights.append(inter_area)
                            total_covered_m2 += inter_area

        # Fallback for very small polygons if no intersection area accumulated
        if not extracted_values and tiles_info:
            centroid = poly_homo.centroid
            for t_info in tiles_info:
                tile_path = self.client.get_tile_file(property_name, depth, t_info)
                if tile_path and tile_path.exists():
                    try:
                        tile = self.loader.load_tile(tile_path, fallback_tile_info=t_info)
                        c, r = tile.world_to_pixel(centroid.x, centroid.y)
                        val = tile.get_pixel_value(c, r)
                        if val is not None:
                            extracted_values.append(val)
                            extracted_weights.append(field_area_m2)
                            total_covered_m2 = field_area_m2
                            is_subpixel = True
                            break
                    except Exception:
                        pass

        if not extracted_values:
            return None

        return ExtractionResult(
            property_name=property_name,
            depth=depth,
            values=extracted_values,
            weights=extracted_weights,
            field_area_m2=field_area_m2,
            covered_area_m2=total_covered_m2,
            is_subpixel=is_subpixel,
        )

soilgrids_extractor = SoilGridsExtractor()

