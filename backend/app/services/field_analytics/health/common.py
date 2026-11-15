"""Shared helpers: provenance labels, field lookup, centroid, unavailable blocks."""

from typing import Any, Dict, Optional, Tuple

from shapely.geometry import shape

from app.services.user_farms_repository import user_farms_repo

#: Provenance classes shown to the farmer next to every value.
MEASURED = "measured"            # direct instrument observation (e.g. SMAP L3 retrieval)
OBSERVED = "observed"            # satellite reflectance / index (e.g. Sentinel-2 NDVI)
SATELLITE_ESTIMATE = "satellite_estimate"  # retrieval from satellite inputs (e.g. IMERG rain)
MODELLED = "modelled"            # model output (e.g. SMAP L4, Open-Meteo forecast)
DERIVED = "derived"              # our calculation from cited inputs
FARMER_INPUT = "farmer_input"    # value typed in by the farmer
UNAVAILABLE = "unavailable"


def get_field(field_id: str) -> Dict[str, Any]:
    field = user_farms_repo.get_field(field_id)
    if not field:
        raise ValueError(f"Field '{field_id}' not found.")
    return field


def centroid(field: Dict[str, Any]) -> Tuple[float, float]:
    c = shape(field["geometry"]).centroid
    return round(c.y, 5), round(c.x, 5)


def unavailable(reason: str, **extra: Any) -> Dict[str, Any]:
    return {"available": False, "provenance": UNAVAILABLE, "reason": reason, **extra}


def source(name: str, product: Optional[str] = None, resolution: Optional[str] = None, provenance: str = DERIVED) -> Dict[str, Any]:
    return {"name": name, "product": product, "resolution": resolution, "provenance": provenance}
