"""Post-Processing and Vector Polygonization of 3-Class Segmentation Outputs."""

from typing import Any, Dict, List, Optional, Tuple
import uuid
import numpy as np
from scipy.ndimage import distance_transform_edt, label as nd_label
from skimage.measure import find_contours
from skimage.segmentation import watershed
from shapely.geometry import Polygon, MultiPolygon, mapping
from shapely.ops import transform
import pyproj

_transformer_to_metric = pyproj.Transformer.from_crs("EPSG:4326", "EPSG:3857", always_xy=True)

def calculate_polygon_area_ha(geom: Polygon | MultiPolygon) -> Tuple[float, float]:
    """Calculate projected geodesic area in hectares and perimeter in meters."""
    try:
        projected = transform(_transformer_to_metric.transform, geom)
        area_m2 = projected.area
        perimeter_m = projected.length
        return float(area_m2 / 10000.0), float(perimeter_m)
    except Exception:
        # Fallback approximation for WGS84
        bounds = geom.bounds
        mid_lat = (bounds[1] + bounds[3]) / 2.0
        m_per_deg_lat = 111320.0
        m_per_deg_lon = 111320.0 * np.cos(np.radians(mid_lat))
        area_deg2 = geom.area
        area_m2 = area_deg2 * m_per_deg_lat * m_per_deg_lon
        return float(area_m2 / 10000.0), float(geom.length * ((m_per_deg_lat + m_per_deg_lon) / 2.0))

def extract_field_polygons(
    prob_map: np.ndarray,
    bbox: Tuple[float, float, float, float],
    min_confidence: float = 0.40,
    min_area_ha: float = 0.20,
    boundary_penalty: float = 0.60,
    max_fields: int = 150,
    model_version: str = "fieldshift-unet-v1.0",
    imagery_date: str = "2024-08-28",
    sensor: str = "Sentinel-2 L2A",
    geographic_region: str = "Brandenburg"
) -> List[Dict[str, Any]]:
    """Separate and polygonize field instances from 3-class segmentation probabilities.
    
    Args:
        prob_map: (3, H, W) array of softmax probabilities:
                  [0]=Background, [1]=Field Interior, [2]=Field Boundary.
        bbox: (west, south, east, north) in EPSG:4326.
        min_confidence: Minimum interior probability required to retain a field.
        min_area_ha: Minimum field area in hectares.
        boundary_penalty: Weight given to boundary probability when separating adjacent fields.
        max_fields: Maximum number of fields to return.
        model_version: Provenance model tag.
        imagery_date: Sentinel-2 capture date.
        sensor: Imagery sensor name.
        geographic_region: Region label (e.g. 'Brandenburg', 'Umred, Maharashtra').
        
    Returns:
        List of GeoJSON Feature dicts with properties and metadata.
    """
    west, south, east, north = bbox
    _, height, width = prob_map.shape
    x_res = (east - west) / width
    y_res = (north - south) / height

    # 1. Compute interior score penalized by boundary probability
    p_bg = prob_map[0]
    p_interior = prob_map[1]
    p_boundary = prob_map[2]

    # Effective interior signal: strong interior and weak boundary/background
    effective_interior = p_interior - (boundary_penalty * p_boundary)
    interior_mask = (effective_interior > 0.15) & (p_interior > min_confidence) & (p_interior > p_bg)

    if not np.any(interior_mask):
        return []

    # 2. Watershed / Distance-transform instance separation
    # Touching fields often share a thin boundary; distance transform on interior_mask
    # creates distinct local maxima (seeds) for each individual field.
    dist = distance_transform_edt(interior_mask)
    
    # Identify seed markers where distance peaks
    from skimage.feature import peak_local_max
    min_distance = max(4, int(min(height, width) * 0.015))
    local_maxi = peak_local_max(dist, min_distance=min_distance, labels=interior_mask)

    markers = np.zeros((height, width), dtype=int)
    if len(local_maxi) > 0:
        for idx, (r, c) in enumerate(local_maxi, start=1):
            markers[r, c] = idx
        # Watershed with negative distance surface
        labeled_instances = watershed(-dist, markers, mask=interior_mask)
    else:
        # Fallback to standard connected components
        labeled_instances, num_features = nd_label(interior_mask)

    unique_labels = np.unique(labeled_instances)
    unique_labels = unique_labels[unique_labels != 0]

    features = []
    field_counter = 1

    for lbl in unique_labels:
        field_mask = (labeled_instances == lbl)
        pixel_count = np.count_nonzero(field_mask)
        if pixel_count < 20:  # Skip tiny noise specs
            continue

        # Extract contour curves from the field instance
        contours = find_contours(field_mask.astype(float), 0.5)
        for contour in contours:
            if len(contour) < 4:
                continue

            # Convert (row, col) pixel coordinates to (lon, lat)
            r = contour[:, 0]
            c = contour[:, 1]
            lons = west + (c * x_res)
            lats = north - (r * y_res)
            coords = list(zip(lons, lats))

            # Close polygon if not closed
            if coords[0] != coords[-1]:
                coords.append(coords[0])

            try:
                poly = Polygon(coords)
                if not poly.is_valid:
                    poly = poly.buffer(0)
                if poly.is_empty or not poly.is_valid:
                    continue

                # Simplify gently to remove raster staircase effect (~5 meters)
                tol = max(x_res, y_res) * 0.65
                poly = poly.simplify(tol, preserve_topology=True)
                if poly.is_empty:
                    continue

                # Area & perimeter calculation
                area_ha, perimeter_m = calculate_polygon_area_ha(poly)
                if area_ha < min_area_ha:
                    continue

                # Calculate confidence statistics for the pixels within this field
                field_probs = p_interior[field_mask]
                mean_conf = float(np.mean(field_probs))
                min_conf = float(np.min(field_probs)) if len(field_probs) > 0 else mean_conf

                if mean_conf < min_confidence:
                    continue

                field_id = f"pred-{uuid.uuid4().hex[:10]}"
                field_name = f"Detected Field {field_counter}"
                field_counter += 1

                is_experimental = geographic_region.lower() != "brandenburg"

                feature = {
                    "type": "Feature",
                    "id": field_id,
                    "geometry": mapping(poly),
                    "properties": {
                        "id": field_id,
                        "name": field_name,
                        "area_hectares": round(area_ha, 2),
                        "confidence": round(mean_conf, 3),
                        "min_confidence": round(min_conf, 3),
                        "perimeter_m": round(perimeter_m, 1),
                        "model_version": model_version,
                        "imagery_date": imagery_date,
                        "sensor": sensor,
                        "source": "ai_prediction",
                        "geographic_region": geographic_region,
                        "quality_status": "High" if mean_conf >= 0.70 else ("Moderate" if mean_conf >= 0.50 else "Low"),
                        "experimental": is_experimental,
                    }
                }
                features.append(feature)

                if len(features) >= max_fields:
                    break

            except Exception:
                continue

        if len(features) >= max_fields:
            break

    # Sort detected fields by area descending
    features.sort(key=lambda f: f["properties"]["area_hectares"], reverse=True)
    return features
