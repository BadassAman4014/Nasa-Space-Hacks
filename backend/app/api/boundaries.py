"""
FastAPI endpoints for Brandenburg agricultural boundary discovery.
Integrates Digitales Feldblockkataster (DFBK) and InVeKoS public data.
"""

import threading
import time
from typing import Annotated, Optional

import requests
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from app.services.field_boundaries.boundary_provider import boundary_provider

router = APIRouter(prefix="/boundaries", tags=["boundaries"])

class BoundaryStatusResponse(BaseModel):
    providers: list[dict]
    dataset_version: str
    active_records: int
    total_agricultural_hectares: float
    primary_provider: str
    last_updated: str

@router.get("/status", response_model=BoundaryStatusResponse)
def get_boundaries_status():
    """Return status of official Brandenburg boundary providers and dataset metadata."""
    try:
        return boundary_provider.get_status()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to check boundary providers: {e}")

@router.get("/viewport")
def get_boundaries_viewport(
    west: Annotated[float, Query(description="Western longitude (WGS84, e.g. 13.00)")],
    south: Annotated[float, Query(description="Southern latitude (WGS84, e.g. 52.40)")],
    east: Annotated[float, Query(description="Eastern longitude (WGS84, e.g. 13.15)")],
    north: Annotated[float, Query(description="Northern latitude (WGS84, e.g. 52.48)")],
    source: Annotated[str, Query(description="Boundary source (DFBK or INVEKOS)")] = "DFBK",
    land_use_category: Annotated[Optional[str], Query(description="Category filter (AL, GL, DK, etc.)")] = None,
    min_area: Annotated[Optional[float], Query(ge=0, description="Minimum area in hectares")] = None,
    max_area: Annotated[Optional[float], Query(ge=0, description="Maximum area in hectares")] = None,
    limit: Annotated[int, Query(ge=1, le=2000, description="Maximum number of polygons to return")] = 150,
    zoom: Annotated[float, Query(ge=1.0, le=22.0, description="Current map zoom level for simplification")] = 14.0
):
    """
    Return qualifying agricultural field polygons intersecting the map viewport.
    Supports real-time map panning with sub-100ms response time.
    """
    try:
        return boundary_provider.get_viewport_boundaries(
            west=west,
            south=south,
            east=east,
            north=north,
            source=source,
            land_use_category=land_use_category,
            min_area=min_area,
            max_area=max_area,
            limit=limit,
            zoom=zoom
        )
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except FileNotFoundError as fe:
        raise HTTPException(status_code=503, detail=str(fe))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error querying boundaries: {e}")

@router.get("/nearby")
def get_boundaries_nearby(
    lat: Annotated[float, Query(ge=-90, le=90, description="Latitude")],
    lon: Annotated[float, Query(ge=-180, le=180, description="Longitude")],
    radius: Annotated[float, Query(ge=100, le=50000, description="Radius in meters")] = 3000.0,
    source: Annotated[str, Query(description="Boundary source (DFBK or INVEKOS)")] = "DFBK",
    land_use_category: Annotated[Optional[str], Query(description="Category filter")] = None,
    min_area: Annotated[Optional[float], Query(ge=0)] = None,
    max_area: Annotated[Optional[float], Query(ge=0)] = None,
    limit: Annotated[int, Query(ge=1, le=1000)] = 50
):
    """Return agricultural field blocks near a specific coordinate."""
    try:
        return boundary_provider.get_nearby_boundaries(
            lat=lat,
            lon=lon,
            radius=radius,
            source=source,
            land_use_category=land_use_category,
            min_area=min_area,
            max_area=max_area,
            limit=limit
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/search")
def search_boundaries(
    location: Annotated[Optional[str], Query(description="Municipality name (e.g. Potsdam, Cottbus, Havelland)")] = None,
    lat: Annotated[Optional[float], Query(ge=-90, le=90)] = None,
    lon: Annotated[Optional[float], Query(ge=-180, le=180)] = None,
    radius: Annotated[float, Query(ge=100, le=50000)] = 3000.0,
    source: Annotated[str, Query()] = "DFBK",
    land_use_category: Annotated[Optional[str], Query()] = None,
    min_area: Annotated[Optional[float], Query(ge=0)] = None,
    max_area: Annotated[Optional[float], Query(ge=0)] = None,
    limit: Annotated[int, Query(ge=1, le=1000)] = 50
):
    """Search agricultural boundaries by location/municipality name or coordinates."""
    try:
        return boundary_provider.search_boundaries(
            location=location,
            lat=lat,
            lon=lon,
            radius=radius,
            source=source,
            land_use_category=land_use_category,
            min_area=min_area,
            max_area=max_area,
            limit=limit
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

_GEOCODE_CACHE: dict[str, tuple[float, list[dict]]] = {}
_GEOCODE_LOCK = threading.Lock()
_GEOCODE_LAST_CALL = [0.0]
_GEOCODE_UA = "FieldShiftAI/1.0 (agricultural field boundary search)"


@router.get("/geocode")
def geocode_place(q: Annotated[str, Query(min_length=3, max_length=100, description="Postal code or place name in Germany")]):
    """
    Resolve a German postal code or place name to coordinates (OpenStreetMap Nominatim).
    Results are cached for a day and requests are spaced out to respect Nominatim's 1 request/second policy.
    """
    key = q.strip().lower()
    now = time.time()
    with _GEOCODE_LOCK:
        hit = _GEOCODE_CACHE.get(key)
        if hit and now - hit[0] < 86400:
            return hit[1]
        wait = 1.1 - (now - _GEOCODE_LAST_CALL[0])
        if wait > 0:
            time.sleep(wait)
        _GEOCODE_LAST_CALL[0] = time.time()
    try:
        resp = requests.get(
            "https://nominatim.openstreetmap.org/search",
            params={"q": q, "countrycodes": "de", "format": "jsonv2", "limit": 5, "addressdetails": 0},
            headers={"User-Agent": _GEOCODE_UA},
            timeout=10,
        )
        resp.raise_for_status()
        raw = resp.json()
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Place lookup unavailable: {type(e).__name__}")
    results = []
    for x in raw:
        bb = x.get("boundingbox") or []
        results.append({
            "title": x.get("name") or x["display_name"].split(",")[0],
            "display_name": x["display_name"],
            "lat": float(x["lat"]),
            "lon": float(x["lon"]),
            "bounds": [[float(bb[0]), float(bb[2])], [float(bb[1]), float(bb[3])]] if len(bb) == 4 else None,
            "type": x.get("type"),
        })
    with _GEOCODE_LOCK:
        _GEOCODE_CACHE[key] = (time.time(), results)
    return results


@router.get("/{boundary_id}")
def get_boundary_by_id(boundary_id: str):
    """Fetch detailed boundary information and GeoJSON by external ID."""
    boundary = boundary_provider.get_boundary_by_id(boundary_id)
    if not boundary:
        raise HTTPException(status_code=404, detail=f"Boundary '{boundary_id}' not found.")
    return boundary
