"""
FastAPI endpoints for Brandenburg agricultural boundary discovery.
Integrates Digitales Feldblockkataster (DFBK) and InVeKoS public data.
"""

from typing import Annotated, Optional
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

@router.get("/{boundary_id}")
def get_boundary_by_id(boundary_id: str):
    """Fetch detailed boundary information and GeoJSON by external ID."""
    boundary = boundary_provider.get_boundary_by_id(boundary_id)
    if not boundary:
        raise HTTPException(status_code=404, detail=f"Boundary '{boundary_id}' not found.")
    return boundary
