"""Preprocessing, Geospatial Rasterization and Tile Manipulation for Field Segmentation."""

from typing import Dict, List, Optional, Tuple
import math
import numpy as np
from shapely.geometry import Polygon, MultiPolygon
from shapely import ops
import pyproj

# Standard Sentinel-2 L2A Band Index Mapping
BAND_NAMES = ["B02", "B03", "B04", "B08"]

# Default Normalization Statistics (Computed across cloud-filtered Sentinel-2 L2A agricultural scenes)
DEFAULT_NORMALIZATION: Dict[str, Dict[str, float]] = {
    "B02": {"mean": 0.082, "std": 0.054},  # Blue (10m)
    "B03": {"mean": 0.108, "std": 0.062},  # Green (10m)
    "B04": {"mean": 0.115, "std": 0.076},  # Red (10m)
    "B08": {"mean": 0.312, "std": 0.142},  # Near-Infrared (10m)
}

def normalize_reflectance(
    image: np.ndarray,
    stats: Optional[Dict[str, Dict[str, float]]] = None
) -> np.ndarray:
    """Normalize 4-band Sentinel-2 reflectance array to zero-mean unit-variance.
    
    Args:
        image: Array of shape (4, H, W) or (B, 4, H, W). Reflectance values in range 0.0 - 1.0
               (or scaled 0 - 10000).
        stats: Per-band mean and standard deviation.
        
    Returns:
        Normalized float32 array of same shape.
    """
    stats = stats or DEFAULT_NORMALIZATION
    norm_img = image.astype(np.float32).copy()

    # If raw DN values (0 - 10000+), scale to 0.0 - 1.0 surface reflectance
    if np.nanmax(norm_img) > 10.0:
        norm_img /= 10000.0

    # Clip negative or spurious reflectance
    norm_img = np.clip(norm_img, 0.0, 1.0)

    for i, band in enumerate(BAND_NAMES):
        mean = stats[band]["mean"]
        std = stats[band]["std"]
        if norm_img.ndim == 3:
            norm_img[i] = (norm_img[i] - mean) / (std + 1e-6)
        elif norm_img.ndim == 4:
            norm_img[:, i] = (norm_img[:, i] - mean) / (std + 1e-6)

    return norm_img

def rasterize_dfbk_polygons(
    geometries: List[Polygon | MultiPolygon],
    bbox: Tuple[float, float, float, float],
    shape: Tuple[int, int],
    boundary_width_px: int = 2
) -> np.ndarray:
    """Rasterize vector polygons into a 3-class segmentation mask.
    
    Classes:
    0: Background (non-agricultural)
    1: Field Interior
    2: Field Boundary (margins, hedgerows, and shared borders)
    
    Args:
        geometries: List of Shapely Polygon or MultiPolygon in EPSG:4326.
        bbox: (west, south, east, north) in EPSG:4326.
        shape: (height, width) of output raster.
        boundary_width_px: Width of the boundary zone in pixels.
        
    Returns:
        uint8 array of shape (height, width) with values {0, 1, 2}.
    """
    from scipy.ndimage import binary_dilation, binary_erosion
    from skimage.draw import polygon as draw_polygon

    west, south, east, north = bbox
    height, width = shape
    mask = np.zeros((height, width), dtype=np.uint8)

    x_res = (east - west) / width
    y_res = (north - south) / height

    # 1. Rasterize each field individually to separate touching boundaries
    interior_mask = np.zeros((height, width), dtype=bool)
    boundary_mask = np.zeros((height, width), dtype=bool)

    for geom in geometries:
        if geom is None or geom.is_empty:
            continue
        polys = geom.geoms if isinstance(geom, MultiPolygon) else [geom]
        for poly in polys:
            if poly.is_empty or not poly.is_valid:
                continue

            # Convert exterior coordinates to pixel coordinates
            ext_coords = np.array(poly.exterior.coords)
            c_px = (ext_coords[:, 0] - west) / x_res
            r_px = (north - ext_coords[:, 1]) / y_res

            # Clip coords to raster boundaries
            c_px = np.clip(c_px, 0, width - 1)
            r_px = np.clip(r_px, 0, height - 1)

            rr, cc = draw_polygon(r_px, c_px, shape=(height, width))
            if len(rr) == 0:
                continue

            field_patch = np.zeros((height, width), dtype=bool)
            field_patch[rr, cc] = True

            # Subtract holes (interiors)
            for interior in poly.interiors:
                int_coords = np.array(interior.coords)
                int_c = np.clip((int_coords[:, 0] - west) / x_res, 0, width - 1)
                int_r = np.clip((north - int_coords[:, 1]) / y_res, 0, height - 1)
                irr, icc = draw_polygon(int_r, int_c, shape=(height, width))
                field_patch[irr, icc] = False

            # Delineate boundary of this specific field
            if boundary_width_px > 0:
                eroded = binary_erosion(field_patch, iterations=boundary_width_px)
                field_boundary = field_patch & ~eroded
                boundary_mask |= field_boundary
                interior_mask |= eroded
            else:
                interior_mask |= field_patch

    # Combined 3-class assignment:
    # 0 = Background
    # 1 = Interior
    # 2 = Boundary (takes priority where adjacent fields touch or meet margins)
    mask[interior_mask] = 1
    mask[boundary_mask] = 2

    return mask

def generate_inference_tiles(
    height: int,
    width: int,
    tile_size: int = 256,
    overlap: int = 32
) -> List[Tuple[int, int, int, int]]:
    """Generate bounding row/col slices for overlapping tile inference.
    
    Args:
        height: Total image height in pixels.
        width: Total image width in pixels.
        tile_size: Square tile dimension (default 256).
        overlap: Overlap in pixels between adjacent tiles (default 32).
        
    Returns:
        List of (r_start, r_end, c_start, c_end) pixel coordinate tuples.
    """
    step = tile_size - overlap
    rows = []
    r = 0
    while r < height:
        r_end = min(r + tile_size, height)
        r_start = max(0, r_end - tile_size)
        rows.append((r_start, r_end))
        if r_end == height:
            break
        r += step

    cols = []
    c = 0
    while c < width:
        c_end = min(c + tile_size, width)
        c_start = max(0, c_end - tile_size)
        cols.append((c_start, c_end))
        if c_end == width:
            break
        c += step

    tiles = []
    for r_start, r_end in rows:
        for c_start, c_end in cols:
            tiles.append((r_start, r_end, c_start, c_end))
    return tiles

def get_2d_window(tile_size: int = 256) -> np.ndarray:
    """Compute a 2D cosine window for smooth tile blending without edge seams."""
    h = np.hanning(tile_size)
    window = np.outer(h, h)
    # Ensure center is flat and edges taper smoothly
    window = np.clip(window, 0.05, 1.0)
    return window.astype(np.float32)
