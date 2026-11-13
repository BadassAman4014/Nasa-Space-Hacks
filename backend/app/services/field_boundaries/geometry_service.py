"""
Geometry utilities for Brandenburg agricultural field boundaries.
Handles CRS conversion (EPSG:25833 UTM Zone 33N <-> EPSG:4326 WGS84),
geometry validation and repair, non-agricultural exclusion subtraction,
metric area calculation in hectares, and GeoJSON formatting.
"""

from typing import Any, Optional, Union
import shapely
from shapely.geometry import shape, mapping, Polygon, MultiPolygon, GeometryCollection
from shapely.validation import make_valid
from shapely.ops import transform
import pyproj

# EPSG:25833 = ETRS89 / UTM zone 33N (Official metric projection for Brandenburg)
# EPSG:4326 = WGS 84 (Standard for GeoJSON and Web Maps)
CRS_BRANDENBURG_METRIC = "EPSG:25833"
CRS_WGS84 = "EPSG:4326"

_transformer_to_wgs84 = pyproj.Transformer.from_crs(CRS_BRANDENBURG_METRIC, CRS_WGS84, always_xy=True)
_transformer_to_metric = pyproj.Transformer.from_crs(CRS_WGS84, CRS_BRANDENBURG_METRIC, always_xy=True)

def transform_to_wgs84(geom: Union[Polygon, MultiPolygon]) -> Union[Polygon, MultiPolygon]:
    """Transform geometry from EPSG:25833 (UTM 33N) to EPSG:4326 (WGS84 lon, lat)."""
    return transform(_transformer_to_wgs84.transform, geom)

def transform_to_metric(geom: Union[Polygon, MultiPolygon]) -> Union[Polygon, MultiPolygon]:
    """Transform geometry from EPSG:4326 (WGS84 lon, lat) to EPSG:25833 (UTM 33N)."""
    return transform(_transformer_to_metric.transform, geom)

def ensure_valid_polygon(geom: Any) -> Optional[Union[Polygon, MultiPolygon]]:
    """
    Validate and repair geometry if necessary.
    Ensures returned geometry is a Polygon or MultiPolygon with positive area.
    """
    if geom is None or geom.is_empty:
        return None
        
    if not geom.is_valid:
        geom = make_valid(geom)

    if isinstance(geom, (Polygon, MultiPolygon)):
        if geom.is_empty or geom.area <= 0:
            return None
        return geom

    # If make_valid produced GeometryCollection, extract only 2D polygonal parts
    if isinstance(geom, GeometryCollection):
        polys = [g for g in geom.geoms if isinstance(g, (Polygon, MultiPolygon)) and not g.is_empty and g.area > 0]
        if not polys:
            return None
        combined = shapely.unary_union(polys)
        if isinstance(combined, (Polygon, MultiPolygon)) and not combined.is_empty:
            return combined

    return None

def calculate_area_hectares(geom: Union[Polygon, MultiPolygon], is_wgs84: bool = False) -> float:
    """
    Calculate area in hectares.
    If geometry is in WGS84, it is reprojected to EPSG:25833 first for accurate planar metrics.
    1 hectare = 10,000 square meters.
    """
    if geom is None or geom.is_empty:
        return 0.0

    if is_wgs84:
        geom = transform_to_metric(geom)

    sq_meters = geom.area
    hectares = round(sq_meters / 10_000.0, 4)
    return max(0.0, hectares)

def subtract_exclusions(
    base_geom: Union[Polygon, MultiPolygon],
    exclusion_geoms: list[Union[Polygon, MultiPolygon]]
) -> Union[Polygon, MultiPolygon]:
    """
    Subtract non-agricultural feature (NBF) geometries from field block.
    Preserves valid polygonal geometry. If subtraction removes everything or is invalid,
    safely falls back to base geometry.
    """
    if not exclusion_geoms:
        return base_geom

    try:
        combined_exclusions = shapely.unary_union([g for g in exclusion_geoms if g is not None and not g.is_empty])
        if combined_exclusions.is_empty:
            return base_geom

        difference = base_geom.difference(combined_exclusions)
        valid_diff = ensure_valid_polygon(difference)
        
        # Guard against accidental complete removal or micro-slivers
        if valid_diff is not None and valid_diff.area > (base_geom.area * 0.05):
            return valid_diff
        return base_geom
    except Exception:
        return base_geom

def simplify_for_zoom(geom_wgs84: Union[Polygon, MultiPolygon], zoom: float) -> Union[Polygon, MultiPolygon]:
    """
    Simplify geometry for display at lower zoom levels while preserving topology.
    Does not modify original stored geometry.
    """
    if zoom >= 14:
        return geom_wgs84
    # Douglas-Peucker tolerance in degrees
    tolerance = 0.0001 if zoom >= 12 else 0.0005 if zoom >= 10 else 0.002
    simplified = geom_wgs84.simplify(tolerance, preserve_topology=True)
    valid_simp = ensure_valid_polygon(simplified)
    return valid_simp or geom_wgs84

def to_geojson_feature(
    boundary_id: str,
    geom_wgs84: Union[Polygon, MultiPolygon],
    properties: dict[str, Any]
) -> dict[str, Any]:
    """Format polygon into standard GeoJSON Feature."""
    return {
        "type": "Feature",
        "id": boundary_id,
        "properties": properties,
        "geometry": mapping(geom_wgs84)
    }

