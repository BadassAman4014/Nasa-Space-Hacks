"""Field Map and Field Health Trend endpoints (real data only)."""

from typing import Any, Dict, Optional

from fastapi import APIRouter, Body, HTTPException, Query
from pydantic import BaseModel, Field

from app.services.field_analytics.health import nitrogen as nitro
from app.services.field_analytics.health import service
from app.services.nasa.real.appeears import appeears
from app.services.nasa.real.store import real_store

router = APIRouter(prefix="/field-health", tags=["field-health"])


def _wrap(fn, *args, **kwargs):
    try:
        return fn(*args, **kwargs)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.get("/map")
def field_map(refresh: bool = Query(False)):
    """All fields with moisture class (SMAP L4) and days since rain (GPM IMERG)."""
    return service.map_summary(refresh=refresh)


@router.get("/fields/{field_id}/card")
def field_card(field_id: str, refresh: bool = Query(False)):
    return _wrap(service.field_card, field_id, refresh=refresh)


@router.get("/fields/{field_id}/overlay/{kind}")
def field_overlay(field_id: str, kind: str, refresh: bool = Query(False)):
    if kind not in ("moisture", "nitrogen", "leaching"):
        raise HTTPException(status_code=400, detail="kind must be moisture, nitrogen or leaching")
    return _wrap(service.overlay, field_id, kind, refresh=refresh)


@router.get("/fields/{field_id}/trend")
def field_trend(field_id: str, refresh: bool = Query(False)):
    return _wrap(service.health_trend, field_id, refresh=refresh)


class FarmerInputs(BaseModel):
    crop: Optional[str] = None
    yield_target: Optional[float] = Field(None, ge=0, le=2000)
    previous_crop: Optional[str] = None
    nmin_kg_ha: Optional[float] = Field(None, ge=0, le=500)
    organic_n_last_year_kg_ha: Optional[float] = Field(None, ge=0, le=500)
    last_n_application_date: Optional[str] = None
    last_n_application_kg_ha: Optional[float] = Field(None, ge=0, le=500)


@router.get("/fields/{field_id}/inputs")
def get_inputs(field_id: str):
    return nitro.get_inputs(field_id)


@router.put("/fields/{field_id}/inputs")
def put_inputs(field_id: str, payload: FarmerInputs = Body(...)):
    try:
        saved = nitro.save_inputs(field_id, payload.model_dump())
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    service.invalidate(field_id)
    return saved


@router.get("/data-status")
def data_status() -> Dict[str, Any]:
    """AppEEARS task states, so the UI can say when NASA data is still processing."""
    with real_store._conn() as c:
        rows = [dict(r) for r in c.execute("SELECT task_id, kind, target_key, start_date, end_date, status, detail, submitted_at, completed_at FROM appeears_tasks ORDER BY submitted_at DESC LIMIT 50")]
    return {"earthdata_configured": appeears.configured(), "tasks": rows}


@router.post("/poll")
def poll_now():
    """Check AppEEARS immediately instead of waiting for the background worker."""
    return appeears.poll_once()
