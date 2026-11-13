"""
FastAPI router for NASA Earth Observation environmental data:
NASA SMAP (Soil moisture), NASA GPM IMERG (Precipitation), and NASA MODIS (Vegetation indices).
"""

from typing import Optional
from fastapi import APIRouter, HTTPException, Query, BackgroundTasks
from app.services.nasa.service import nasa_environmental_service
from app.services.nasa.schemas import (
    EnvironmentalDatasetInfo,
    FieldEnvironmentalResponse,
    EnvironmentalExtractionRequest,
    EnvironmentalExtractionStatus,
    EnvironmentalSummaryItem,
)

router = APIRouter(tags=["environment"])

@router.get("/nasa/datasets", response_model=list[EnvironmentalDatasetInfo])
def get_nasa_datasets():
    """Return all supported NASA Earth Observation datasets and metadata."""
    return nasa_environmental_service.list_datasets()

@router.get("/fields/{field_id}/environmental/status", response_model=EnvironmentalExtractionStatus)
def get_field_environmental_status(field_id: str):
    """Get extraction status and progress for a field."""
    return nasa_environmental_service.get_extraction_status(field_id)

@router.get("/fields/{field_id}/environmental", response_model=FieldEnvironmentalResponse)
def get_field_environmental_data(
    field_id: str,
    dataset: Optional[str] = Query(None, description="Filter by dataset ID: smap_soil_moisture, gpm_precipitation, modis_vegetation"),
    start_date: Optional[str] = Query(None, description="Start date YYYY-MM-DD"),
    end_date: Optional[str] = Query(None, description="End date YYYY-MM-DD"),
):
    """Retrieve persistent NASA environmental observations and temporal metrics for a field."""
    d_val = dataset if isinstance(dataset, str) else None
    s_val = start_date if isinstance(start_date, str) else None
    e_val = end_date if isinstance(end_date, str) else None

    data = nasa_environmental_service.get_field_environmental_data(
        field_id=field_id,
        start_date=s_val,
        end_date=e_val,
        dataset=d_val,
    )
    if not data:
        raise HTTPException(status_code=404, detail=f"Field '{field_id}' not found.")
    return data

@router.post("/fields/{field_id}/environmental/extract", response_model=FieldEnvironmentalResponse)
def extract_field_environmental_data(
    field_id: str,
    request: Optional[EnvironmentalExtractionRequest] = None,
):
    """Trigger NASA environmental extraction for a saved field across SMAP, GPM, and MODIS."""
    req = request or EnvironmentalExtractionRequest()
    try:
        return nasa_environmental_service.extract_field_environmental_data(
            field_id=field_id,
            start_date=req.start_date,
            end_date=req.end_date,
            datasets=req.datasets,
            force_refresh=req.force_refresh,
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Environmental extraction failed: {e}")

@router.post("/fields/{field_id}/environmental/refresh", response_model=FieldEnvironmentalResponse)
def refresh_field_environmental_data(
    field_id: str,
    request: Optional[EnvironmentalExtractionRequest] = None,
):
    """Force refresh of NASA satellite observations for a saved field."""
    req = request or EnvironmentalExtractionRequest()
    try:
        return nasa_environmental_service.extract_field_environmental_data(
            field_id=field_id,
            start_date=req.start_date,
            end_date=req.end_date,
            datasets=req.datasets,
            force_refresh=True,
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Refresh failed: {e}")

@router.get("/fields/{field_id}/environmental/summary", response_model=list[EnvironmentalSummaryItem])
def get_field_environmental_summaries(
    field_id: str,
    dataset: Optional[str] = Query(None, description="Filter by dataset ID"),
):
    """Retrieve stored temporal summaries for a field."""
    d_val = dataset if isinstance(dataset, str) else None
    return nasa_environmental_service.storage.get_field_summaries(field_id, d_val)

# Backward-compatibility routes
@router.get("/fields/{field_id}/environment")
def get_legacy_environment(field_id: str):
    data = nasa_environmental_service.get_field_environmental_data(field_id)
    if not data:
        raise HTTPException(status_code=404, detail=f"Field '{field_id}' not found.")
    return data
