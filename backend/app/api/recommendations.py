from typing import Any, Dict

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services.crop_planner import generator, planner

router = APIRouter(tags=['recommendations'])


class GenerateRequest(BaseModel):
    field_id: str
    refresh: bool = False


@router.post('/recommendations/generate')
def generate_recommendation(request: GenerateRequest) -> Dict[str, Any]:
    """
    Three five-year rotation strategies for a field: the farmer's current path, a resilience/soil-building rotation and a
    diversified rotation. Needs the farmer inputs (crop history, priority, irrigation). Every score comes from real signals.
    """
    try:
        return planner.recommend(request.field_id, refresh=request.refresh)
    except planner.FieldNotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except generator.PlanInputError as exc:
        raise HTTPException(status_code=422, detail={'message': 'More input is needed.', 'problems': exc.problems}) from exc


@router.get('/recommendations/{recommendation_id}')
def get_recommendation(recommendation_id: str) -> Dict[str, Any]:
    rec = planner.get_recommendation(recommendation_id)
    if not rec:
        raise HTTPException(status_code=404, detail='Recommendation not found.')
    return rec


@router.get('/recommendations/{recommendation_id}/evidence')
def recommendation_evidence(recommendation_id: str) -> Dict[str, Any]:
    rec = planner.get_recommendation(recommendation_id)
    if not rec:
        raise HTTPException(status_code=404, detail='Recommendation not found.')
    return {
        'signals': rec['signals'],
        'strategies': [{'id': s['id'], 'explanation': s['explanation']} for s in rec['strategies']],
    }
