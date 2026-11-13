"""
FastAPI endpoints for Field Analytics & Historical Satellite Report pipeline.
Inspired by OneSoil Yield, providing full multi-sensor field intelligence:
Sentinel-2 L2A NDVI history, NASA POWER precipitation & GDD,
Productivity Zones, Soil Brightness, Digital Elevation, and SoilGrids v2.0.
"""

from typing import Optional
from fastapi import APIRouter, HTTPException, Path, Query, Body

from app.services.field_analytics.schemas import (
    CorrelationResponse,
    ElevationResponse,
    FieldStatusSummary,
    FullFieldReportResponse,
    GDDTimeSeriesResponse,
    NDVITimeSeriesResponse,
    ObservationToggleRequest,
    PlantingDateUpdate,
    PrecipitationTimeSeriesResponse,
    ProductivityReportResponse,
    SoilBrightnessResponse,
)
from app.services.field_analytics.report_service import report_service

router = APIRouter(prefix="/fields/{field_id}/analytics", tags=["field-analytics"])

@router.get("/summary", response_model=FieldStatusSummary)
def get_field_analytics_summary(field_id: str = Path(..., description="Target field ID")):
    """Get field status header summary including crop, area, planting date, and current weather."""
    try:
        return report_service.get_field_status_summary(field_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to load field summary: {e}")

@router.put("/planting-date")
def update_field_planting_date(
    field_id: str = Path(..., description="Target field ID"),
    payload: PlantingDateUpdate = Body(...)
):
    """Update and persist field planting date."""
    try:
        return report_service.update_planting_date(field_id, payload)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update planting date: {e}")

@router.get("/ndvi", response_model=NDVITimeSeriesResponse)
def get_field_ndvi_time_series(
    field_id: str = Path(..., description="Target field ID"),
    refresh: bool = Query(False, description="Force re-query of Sentinel-2 scenes"),
    limit: Optional[int] = Query(None, description="Batch size for progressive pagination"),
    offset: int = Query(0, description="Offset index for batch"),
    order: str = Query("desc", description="Sort order: 'desc' for newest first, 'asc' for oldest first")
):
    """Retrieve historical Sentinel-2 NDVI time series in progressive batches (newest first)."""
    try:
        return report_service.get_ndvi_time_series(
            field_id, force_refresh=refresh, limit=limit, offset=offset, order=order
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to retrieve NDVI history: {e}")

@router.get("/weather", response_model=PrecipitationTimeSeriesResponse)
def get_field_precipitation(field_id: str = Path(..., description="Target field ID")):
    """Retrieve daily and accumulated precipitation from NASA POWER (PRECTOTCORR)."""
    try:
        return report_service.get_precipitation_series(field_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to retrieve precipitation series: {e}")

@router.get("/gdd", response_model=GDDTimeSeriesResponse)
def get_field_gdd(
    field_id: str = Path(..., description="Target field ID"),
    base_temp: Optional[float] = Query(None, description="Optional custom base temperature in °C")
):
    """Retrieve daily and cumulative Growing Degree Days (GDD) based on crop and NASA POWER temperatures."""
    try:
        return report_service.get_gdd_series(field_id, base_temp=base_temp)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to calculate GDD: {e}")

@router.get("/report", response_model=FullFieldReportResponse)
def get_full_field_report(
    field_id: str = Path(..., description="Target field ID"),
    refresh: bool = Query(False, description="Force re-computation of full report")
):
    """Retrieve full comprehensive Field Report including productivity zones, soil brightness, elevation, and correlations."""
    try:
        return report_service.get_full_report(field_id, force_refresh=refresh)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate field report: {e}")

@router.post("/observations/{observation_id}/toggle", response_model=FullFieldReportResponse)
def toggle_observation_and_recalculate(
    field_id: str = Path(..., description="Target field ID"),
    observation_id: str = Path(..., description="Satellite observation ID"),
    payload: ObservationToggleRequest = Body(...)
):
    """Include or exclude a satellite observation from calculations and rebuild productivity analysis."""
    try:
        return report_service.toggle_observation(field_id, observation_id, payload.is_included)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to toggle observation: {e}")

@router.post("/analyze", response_model=FullFieldReportResponse)
def run_or_refresh_field_analysis(field_id: str = Path(..., description="Target field ID")):
    """Trigger complete end-to-end field analytics pipeline."""
    try:
        return report_service.get_full_report(field_id, force_refresh=True)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Field analysis failed: {e}")
