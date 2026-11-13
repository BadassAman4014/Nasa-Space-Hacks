"""
Real Sentinel-2 L2A surface-reflectance ingestion and NDVI computation.

Reads the actual B04 (red) and B08 (NIR) Cloud-Optimised GeoTIFF assets and the
SCL scene-classification layer from the Element84 Earth Search STAC catalogue,
resamples them onto a common UTM grid clipped to the field polygon, applies the
Sentinel-2 quality mask, and returns field-level zonal statistics.

No value produced here is synthesised. If the scene, the asset or the required
GDAL stack is unavailable, this module raises ``RasterUnavailable`` and the
caller must surface an explicit unavailable state to the client.

References
----------
- Sentinel-2 L2A product specification (SCL classes):
  https://sentinels.copernicus.eu/web/sentinel/technical-guides/sentinel-2-msi/level-2a/algorithm
- NDVI, Rouse et al. 1974, using B08 (NIR, 842 nm) and B04 (red, 665 nm).
"""

from __future__ import annotations

import base64
import io
import math
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Sequence, Tuple

import numpy as np
import requests
from PIL import Image

from app.services.field_analytics import s2_capability


class RasterUnavailable(RuntimeError):
    """Raised when real satellite rasters cannot be produced for a field."""


STAC_SEARCH_URL = "https://earth-search.aws.element84.com/v1/search"

#: Sentinel-2 L2A Scene Classification (SCL) classes rejected before NDVI.
#: 1 = saturated/defective, 3 = cloud shadow, 6 = water, 8/9 = cloud medium/high
#: probability, 10 = thin cirrus, 11 = snow/ice, 0 = no data.
SCL_EXCLUDED_CLASSES: Tuple[int, ...] = (0, 1, 3, 6, 8, 9, 10, 11)

#: SCL classes retained as valid vegetation analysis pixels.
SCL_VALID_CLASSES: Tuple[int, ...] = (2, 4, 5, 7)

DEFAULT_RESOLUTION_M = 10.0


@dataclass
class FieldGrid:
    """A north-up UTM target grid covering one field polygon."""

    crs: str
    transform: Any
    shape: Tuple[int, int]
    mask: np.ndarray
    bounds: Tuple[float, float, float, float]

    @property
    def valid_pixel_count(self) -> int:
        return int(np.count_nonzero(self.mask))


def utm_epsg_for(polygon) -> str:
    """Pick the UTM CRS for the polygon centroid (Sentinel-2 is distributed in UTM)."""
    lon, lat = polygon.centroid.x, polygon.centroid.y
    zone = int((lon + 180.0) // 6.0) + 1
    zone = max(1, min(60, zone))
    return f"EPSG:{32600 + zone if lat >= 0 else 32700 + zone}"


def build_field_grid(polygon, resolution_m: float = DEFAULT_RESOLUTION_M) -> FieldGrid:
    """Build a UTM grid + polygon mask aligned to the field's actual geometry."""
    if not s2_capability.AVAILABLE:
        raise RasterUnavailable(s2_capability.reason)

    from pyproj import Transformer
    from rasterio.features import rasterize
    from rasterio.transform import from_origin
    from shapely.ops import transform as shp_transform

    epsg = utm_epsg_for(polygon)
    project = Transformer.from_crs("EPSG:4326", epsg, always_xy=True).transform
    projected = shp_transform(project, polygon)
    if projected.is_empty:
        raise RasterUnavailable("Field geometry is empty after reprojection.")

    minx, miny, maxx, maxy = projected.bounds
    width = max(1, int(math.ceil((maxx - minx) / resolution_m)))
    height = max(1, int(math.ceil((maxy - miny) / resolution_m)))

    # Clamp to a sane raster size so a large field cannot exhaust memory.
    max_side = 256
    if max(width, height) > max_side:
        scale = max_side / float(max(width, height))
        width = max(1, int(width * scale))
        height = max(1, int(height * scale))

    transform = from_origin(minx, maxy, (maxx - minx) / width, (maxy - miny) / height)
    mask = rasterize(
        [(projected, 1)],
        out_shape=(height, width),
        transform=transform,
        fill=0,
        all_touched=False,
        dtype="uint8",
    ).astype(bool)

    if not mask.any():
        raise RasterUnavailable(
            "Field polygon is smaller than one raster cell at 10 m resolution."
        )

    return FieldGrid(
        crs=epsg,
        transform=transform,
        shape=(height, width),
        mask=mask,
        bounds=(minx, miny, maxx, maxy),
    )


def search_scenes(
    polygon,
    start_date: str,
    end_date: str,
    max_cloud_cover: float = 20.0,
    limit: int = 100,
    timeout: int = 30,
) -> List[Dict[str, Any]]:
    """Query the STAC catalogue for real Sentinel-2 L2A acquisitions over the field."""
    minx, miny, maxx, maxy = polygon.bounds
    payload = {
        "collections": ["sentinel-2-l2a"],
        "bbox": [minx, miny, maxx, maxy],
        "datetime": f"{start_date}T00:00:00Z/{end_date}T23:59:59Z",
        "query": {"eo:cloud_cover": {"lt": float(max_cloud_cover)}},
        "limit": min(limit, 1000),
        "sortby": [{"field": "properties.datetime", "direction": "asc"}],
    }
    try:
        response = requests.post(
            STAC_SEARCH_URL,
            json=payload,
            headers={"User-Agent": "FieldShiftAI/1.0"},
            timeout=timeout,
        )
        response.raise_for_status()
        features = response.json().get("features", [])
    except requests.RequestException as exc:
        raise RasterUnavailable(
            f"Sentinel-2 STAC catalogue unreachable: {exc.__class__.__name__}"
        ) from exc

    scenes: List[Dict[str, Any]] = []
    for feature in features:
        props = feature.get("properties", {})
        assets = feature.get("assets", {})
        if "red" not in assets or "nir" not in assets:
            continue
        scenes.append(
            {
                "scene_id": feature.get("id"),
                "acquisition_date": (props.get("datetime") or "")[:10],
                "datetime": props.get("datetime"),
                "cloud_cover_percent": float(props.get("eo:cloud_cover") or 0.0),
                "platform": props.get("platform") or props.get("constellation"),
                "processing_baseline": props.get("s2:processing_baseline"),
                "red_href": assets["red"]["href"],
                "nir_href": assets["nir"]["href"],
                "green_href": assets.get("green", {}).get("href"),
                "blue_href": assets.get("blue", {}).get("href"),
                "scl_href": assets.get("scl", {}).get("href"),
            }
        )
    return scenes


def _read_asset_on_grid(href: str, grid: FieldGrid, timeout: int = 60) -> np.ndarray:
    """Read one COG asset, reprojected and resampled onto the field grid."""
    import rasterio
    from rasterio.warp import Resampling, reproject

    with rasterio.open(href) as src:
        destination = np.full(grid.shape, np.nan, dtype="float32")
        reproject(
            source=rasterio.band(src, 1),
            destination=destination,
            dst_transform=grid.transform,
            dst_crs=grid.crs,
            dst_nodata=np.nan,
            resampling=Resampling.bilinear,
            src_nodata=src.nodata,
        )
    return destination


def _read_scl_on_grid(href: str, grid: FieldGrid, timeout: int = 60) -> np.ndarray:
    """Read the SCL class layer onto the field grid using nearest-neighbour."""
    import rasterio
    from rasterio.warp import Resampling, reproject

    with rasterio.open(href) as src:
        destination = np.zeros(grid.shape, dtype="uint8")
        reproject(
            source=rasterio.band(src, 1),
            destination=destination,
            dst_transform=grid.transform,
            dst_crs=grid.crs,
            resampling=Resampling.nearest,
        )
    return destination


def compute_ndvi(
    red: np.ndarray,
    nir: np.ndarray,
    valid_mask: np.ndarray,
) -> np.ndarray:
    """
    NDVI = (NIR - RED) / (NIR + RED) on L2A surface reflectance.

    Sentinel-2 L2A reflectance is scaled by 10000; the ratio is scale
    invariant, so raw integers are used directly. Pixels outside the field,
    outside the valid mask, or with a non-positive denominator become NaN -
    they are never coerced to zero.
    """
    with np.errstate(divide="ignore", invalid="ignore"):
        denominator = nir.astype("float64") + red.astype("float64")
        ndvi = np.where(denominator > 0, (nir - red) / denominator, np.nan)

    ndvi = np.clip(ndvi, -1.0, 1.0)
    ndvi = np.where(valid_mask, ndvi, np.nan)
    return ndvi


def quality_mask(
    red: np.ndarray,
    nir: np.ndarray,
    scl: Optional[np.ndarray],
    field_mask: np.ndarray,
) -> Tuple[np.ndarray, Dict[str, int]]:
    """
    Build the combined valid-pixel mask.

    A pixel is valid when it lies inside the field polygon, has finite
    reflectance in both bands, and - when the SCL layer is present - falls in a
    vegetation-safe SCL class. Excluded-pixel reasons are counted so the report
    can state exactly why data was dropped.
    """
    inside = field_mask.copy()
    finite = np.isfinite(red) & np.isfinite(nir) & (red > 0) & (nir > 0)

    counts = {
        "field_pixels": int(np.count_nonzero(inside)),
        "nodata_pixels": int(np.count_nonzero(inside & ~finite)),
        "cloud_pixels": 0,
        "invalid_class_pixels": 0,
    }

    valid = inside & finite
    if scl is not None:
        scl_on_field = scl[inside]
        excluded = np.isin(scl_on_field, SCL_EXCLUDED_CLASSES)
        counts["cloud_pixels"] = int(
            np.count_nonzero(np.isin(scl_on_field, (3, 8, 9, 10)))
        )
        counts["invalid_class_pixels"] = int(
            np.count_nonzero(np.isin(scl_on_field, (0, 1, 11)))
        )
        class_ok = np.isin(scl, SCL_VALID_CLASSES)
        valid = valid & class_ok

    return valid, counts


def ndvi_statistics(ndvi: np.ndarray, valid_mask: np.ndarray) -> Dict[str, Any]:
    """Zonal NDVI statistics over valid pixels inside the field polygon."""
    values = ndvi[valid_mask & np.isfinite(ndvi)]
    field_pixels = int(np.count_nonzero(valid_mask))

    if values.size == 0:
        return {
            "mean_ndvi": None,
            "median_ndvi": None,
            "min_ndvi": None,
            "max_ndvi": None,
            "std_ndvi": None,
            "valid_pixel_count": 0,
            "valid_pixel_percent": 0.0,
            "p10_ndvi": None,
            "p90_ndvi": None,
        }

    return {
        "mean_ndvi": round(float(np.mean(values)), 4),
        "median_ndvi": round(float(np.median(values)), 4),
        "min_ndvi": round(float(np.min(values)), 4),
        "max_ndvi": round(float(np.max(values)), 4),
        "std_ndvi": round(float(np.std(values, ddof=1)) if values.size > 1 else 0.0, 4),
        "valid_pixel_count": int(values.size),
        "valid_pixel_percent": round(
            100.0 * values.size / max(1, field_pixels), 2
        ),
        "p10_ndvi": round(float(np.percentile(values, 10)), 4),
        "p90_ndvi": round(float(np.percentile(values, 90)), 4),
    }


#: NDVI colour ramp used by the client legend (value, r, g, b).
NDVI_RAMP: Sequence[Tuple[float, int, int, int]] = (
    (0.00, 215, 25, 28),
    (0.15, 237, 118, 14),
    (0.30, 253, 190, 60),
    (0.45, 217, 224, 92),
    (0.60, 122, 190, 84),
    (0.75, 43, 140, 62),
    (0.90, 15, 92, 40),
)


def _ramp_colour(value: float) -> Tuple[int, int, int]:
    if not np.isfinite(value):
        return (0, 0, 0)
    lo = NDVI_RAMP[0]
    hi = NDVI_RAMP[-1]
    if value <= lo[0]:
        return (lo[1], lo[2], lo[3])
    if value >= hi[0]:
        return (hi[1], hi[2], hi[3])
    for (v0, r0, g0, b0), (v1, r1, g1, b1) in zip(NDVI_RAMP, NDVI_RAMP[1:]):
        if v0 <= value <= v1:
            t = (value - v0) / (v1 - v0)
            return (
                int(round(r0 + (r1 - r0) * t)),
                int(round(g0 + (g1 - g0) * t)),
                int(round(b0 + (b1 - b0) * t)),
            )
    return (hi[1], hi[2], hi[3])


def _to_data_uri(array: np.ndarray, rgba_map) -> str:
    """Encode a 2-D array to a transparent PNG data URI (row 0 = north)."""
    height, width = array.shape
    canvas = np.zeros((height, width, 4), dtype=np.uint8)
    for r in range(height):
        for c in range(width):
            value = array[r, c]
            if not np.isfinite(value):
                continue
            red, green, blue = rgba_map(float(value))
            canvas[r, c] = (red, green, blue, 255)
    image = Image.fromarray(canvas, mode="RGBA")
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buffer.getvalue()).decode()


def render_ndvi_png(ndvi: np.ndarray) -> str:
    """Colourise NDVI using the documented ramp; NaN stays transparent."""
    return _to_data_uri(ndvi, _ramp_colour)


def render_true_colour_png(red: np.ndarray, green: np.ndarray, blue: np.ndarray) -> str:
    """
    Contrast-stretched true-colour composite from B04/B03/B02 surface
    reflectance. This is real imagery, not a stylised rendering of NDVI.
    """
    height, width = red.shape
    canvas = np.zeros((height, width, 4), dtype=np.uint8)

    def stretch(band: np.ndarray) -> np.ndarray:
        finite = np.isfinite(band) & (band > 0)
        if not finite.any():
            return np.zeros_like(band)
        lo, hi = np.percentile(band[finite], (2, 98))
        if hi <= lo:
            hi = lo + 1.0
        scaled = (band - lo) / (hi - lo)
        return np.clip(scaled, 0.0, 1.0)

    r_s, g_s, b_s = stretch(red), stretch(green), stretch(blue)
    for row in range(height):
        for col in range(width):
            if not (np.isfinite(red[row, col]) and np.isfinite(green[row, col])):
                continue
            canvas[row, col] = (
                int(r_s[row, col] * 255),
                int(g_s[row, col] * 255),
                int(b_s[row, col] * 255),
                255,
            )
    image = Image.fromarray(canvas, mode="RGBA")
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buffer.getvalue()).decode()
