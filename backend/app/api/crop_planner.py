"""Crop planner API: sourced crop table, policy checks, field signals, risk card, farmer inputs, vulnerability timeline."""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from app.services.crop_planner import generator, planner, profiles
from app.services.policy import cap, dbe, gloez

router = APIRouter(tags=["crop-planner"])


def _wrap(fn, *a, **kw):
    try:
        return fn(*a, **kw)
    except planner.FieldNotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except generator.PlanInputError as exc:
        raise HTTPException(status_code=422, detail={"message": "More input is needed.", "problems": exc.problems}) from exc
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/crops")
def list_crops() -> Dict[str, Any]:
    """Every crop with every attribute, its source document and verify flag."""
    return profiles.public_table()


@router.get("/policy/rules")
def policy_rules() -> Dict[str, Any]:
    return profiles.load_policy()


class HistoryEntry(BaseModel):
    year: int
    crop: str


class ValidateRequest(BaseModel):
    history: List[HistoryEntry] = Field(default_factory=list)
    plan: List[HistoryEntry]
    farm_yield_5yr_avg: Optional[float] = None
    nmin_kg_ha: Optional[float] = None
    humus_pct: Optional[float] = None


@router.post("/policy/validate")
def validate_policy(req: ValidateRequest) -> Dict[str, Any]:
    """GLÖZ 7 verdict and the DüV fertiliser requirement for a crop sequence, with the previous-crop deduction carried forward."""
    known = set(profiles.crop_ids()) | {"fallow_or_grass", "other"}
    for e in [*req.history, *req.plan]:
        if e.crop not in known:
            raise HTTPException(status_code=422, detail=f"Unknown crop '{e.crop}'.")
    entries = [e.model_dump() for e in [*req.history, *req.plan]]
    plan_entries = [e.model_dump() for e in req.plan]
    prev = req.history[-1].crop if req.history else None
    return {
        "gloez7": gloez.validate_sequence(entries),
        "dbe": dbe.plan(plan_entries, previous_crop_before_first=prev, farm_yield_5yr_avg=req.farm_yield_5yr_avg, nmin_kg_ha=req.nmin_kg_ha, humus_pct=req.humus_pct),
        "eco_scheme": [cap.field_contribution(e["crop"]) | {"year": e["year"]} for e in plan_entries],
    }


class PlannerInputs(BaseModel):
    history: List[HistoryEntry] = Field(default_factory=list)
    soil_texture: Optional[str] = None
    priority: Optional[str] = None
    irrigation: Optional[str] = None


@router.get("/fields/{field_id}/planner-inputs")
def get_planner_inputs(field_id: str) -> Dict[str, Any]:
    return _wrap(planner.get_inputs, field_id)


@router.put("/fields/{field_id}/planner-inputs")
def put_planner_inputs(field_id: str, body: PlannerInputs) -> Dict[str, Any]:
    _wrap(planner.save_inputs, field_id, [h.model_dump() for h in body.history], body.soil_texture, body.priority, body.irrigation)
    return _wrap(planner.get_inputs, field_id)


@router.get("/fields/{field_id}/signals")
def get_signals(field_id: str, refresh: bool = Query(False), network: bool = Query(True)) -> Dict[str, Any]:
    """Every NASA-derived metric for the field, tagged live / cached (with its real date) / unavailable."""
    return _wrap(planner.field_signals, field_id, refresh, network)


@router.get("/fields/{field_id}/risk-card")
def get_risk_card(field_id: str, refresh: bool = Query(False), network: bool = Query(True)) -> Dict[str, Any]:
    return _wrap(planner.risk_card, field_id, refresh, network)


@router.get("/fields/{field_id}/score")
def score_crop(field_id: str, crop: str, previous: Optional[str] = None) -> Dict[str, Any]:
    """Four-axis score of one crop on this field with every factor and its source. Reads stored data only."""
    return _wrap(planner.score_one_crop, field_id, crop, previous)


@router.get("/fields/{field_id}/vulnerability-timeline")
def get_timeline(field_id: str, recommendation_id: str, year_index: int = 0) -> Dict[str, Any]:
    return _wrap(planner.vulnerability_timeline, field_id, recommendation_id, year_index)
