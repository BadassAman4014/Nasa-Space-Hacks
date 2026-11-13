"""
FastAPI endpoints for field-level SoilGrids data extraction and soil profiles.
"""

from fastapi import APIRouter, HTTPException, Path, BackgroundTasks
from app.services.soilgrids.service import soilgrids_service
from app.services.soilgrids.schemas import (
    SoilProfileResponse,
    ExtractionStatusResponse,
    SupportedVariablesResponse,
)

router = APIRouter(tags=["soil"])

@router.get("/fields/{field_id}/soil", response_model=SoilProfileResponse)
def get_field_soil(field_id: str = Path(..., description="Stable field identifier")):
    """
    Retrieve the latest available soil profile and depth measurements for a saved field.
    """
    try:
        profile = soilgrids_service.get_field_soil_profile(field_id)
        if not profile:
            raise HTTPException(status_code=404, detail=f"Field '{field_id}' not found in saved records.")
        return profile
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to retrieve soil profile: {e}")

@router.post("/fields/{field_id}/soil/extract", response_model=SoilProfileResponse)
def extract_field_soil(field_id: str = Path(..., description="Stable field identifier")):
    """
    Trigger SoilGrids raster extraction for a saved field.
    Returns existing profile if already completed, or runs extraction.
    """
    try:
        profile = soilgrids_service.extract_field_soil(field_id, force_refresh=False)
        return profile
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Soil extraction failed: {e}")

@router.post("/fields/{field_id}/soil/refresh", response_model=SoilProfileResponse)
def refresh_field_soil(field_id: str = Path(..., description="Stable field identifier")):
    """
    Force re-extraction of soil properties for a field, recalculating metrics and updating persistence.
    """
    try:
        profile = soilgrids_service.extract_field_soil(field_id, force_refresh=True)
        return profile
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Soil refresh failed: {e}")

@router.get("/fields/{field_id}/soil/status", response_model=ExtractionStatusResponse)
def get_field_soil_status(field_id: str = Path(..., description="Stable field identifier")):
    """
    Retrieve the current soil extraction status (not_started, processing, completed, partial, failed).
    """
    try:
        return soilgrids_service.get_extraction_status(field_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get extraction status: {e}")

@router.get("/soilgrids/variables", response_model=SupportedVariablesResponse)
def get_soilgrids_variables():
    """
    Retrieve supported SoilGrids soil properties, units, scale factors, and depth intervals.
    """
    try:
        return soilgrids_service.get_supported_variables()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get SoilGrids metadata: {e}")
