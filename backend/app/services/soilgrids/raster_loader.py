"""
Raster loader for SoilGrids GeoTIFF files using tifffile and numpy.
Reads GeoTIFF metadata, coordinate geotransforms, nodata masks, and raster arrays.
"""

from pathlib import Path
from typing import Any, Optional
import numpy as np
import tifffile

class LoadedRasterTile:
    def __init__(
        self,
        data: np.ndarray,
        origin_x: float,
        origin_y: float,
        pixel_size_x: float = 250.0,
        pixel_size_y: float = 250.0,
        nodata: int = -32768,
        file_path: Optional[Path] = None,
    ):
        self.data = data
        self.height, self.width = data.shape
        self.origin_x = origin_x
        self.origin_y = origin_y
        self.pixel_size_x = pixel_size_x
        self.pixel_size_y = pixel_size_y
        self.nodata = nodata
        self.file_path = file_path

        # Bounding box in Homolosine meters
        self.min_x = origin_x
        self.max_x = origin_x + self.width * pixel_size_x
        self.max_y = origin_y
        self.min_y = origin_y - self.height * pixel_size_y

    def world_to_pixel(self, x: float, y: float) -> tuple[int, int]:
        """Convert world coordinates (Homolosine meters) to pixel (col, row)."""
        col = int((x - self.origin_x) / self.pixel_size_x)
        row = int((self.origin_y - y) / self.pixel_size_y)
        return col, row

    def pixel_to_world(self, col: int, row: int) -> tuple[float, float]:
        """Convert pixel (col, row) to world coordinates of pixel center."""
        x = self.origin_x + (col + 0.5) * self.pixel_size_x
        y = self.origin_y - (row + 0.5) * self.pixel_size_y
        return x, y

    def get_pixel_value(self, col: int, row: int) -> Optional[float]:
        """Get value at pixel, returning None if nodata or out of bounds."""
        if 0 <= col < self.width and 0 <= row < self.height:
            val = self.data[row, col]
            if val != self.nodata and val != -32768:
                return float(val)
        return None

class RasterLoader:
    @staticmethod
    def load_tile(file_path: Path, fallback_tile_info: Optional[dict[str, Any]] = None) -> LoadedRasterTile:
        """
        Load a SoilGrids GeoTIFF file, extracting pixel data and GeoTransform tags.
        """
        with tifffile.TiffFile(str(file_path)) as tif:
            page = tif.pages[0]
            data = page.asarray()

            # Extract tiepoint and scale
            origin_x = 0.0
            origin_y = 0.0
            scale_x = 250.0
            scale_y = 250.0
            nodata = -32768

            if "ModelTiepointTag" in page.tags:
                tp = page.tags["ModelTiepointTag"].value
                # (I, J, K, X, Y, Z)
                if len(tp) >= 5:
                    origin_x = float(tp[3])
                    origin_y = float(tp[4])
            elif fallback_tile_info:
                origin_x = fallback_tile_info.get("x_min", 0.0)
                origin_y = fallback_tile_info.get("y_max", 0.0)

            if "ModelPixelScaleTag" in page.tags:
                ps = page.tags["ModelPixelScaleTag"].value
                if len(ps) >= 2:
                    scale_x = float(ps[0])
                    scale_y = float(ps[1])

            if "GDAL_NODATA" in page.tags:
                try:
                    nodata = int(page.tags["GDAL_NODATA"].value)
                except Exception:
                    nodata = -32768

            return LoadedRasterTile(
                data=data,
                origin_x=origin_x,
                origin_y=origin_y,
                pixel_size_x=scale_x,
                pixel_size_y=scale_y,
                nodata=nodata,
                file_path=file_path,
            )

raster_loader = RasterLoader()

