from fastapi import APIRouter
from app.schemas.common import Recommendation, RecommendationRequest
router = APIRouter(tags=['recommendations'])
@router.post('/recommendations/generate', response_model=Recommendation)
def generate_recommendation(request: RecommendationRequest) -> Recommendation:
    raise NotImplementedError('Validated crop data and optimisation services must be connected before generating recommendations.')
@router.get('/recommendations/{recommendation_id}', response_model=Recommendation)
def get_recommendation(recommendation_id: str) -> Recommendation:
    raise NotImplementedError('Recommendation persistence is not connected in the skeleton.')
@router.post('/recommendations/compare')
def compare_recommendations(payload: dict) -> dict:
    return {'recommendation_ids': payload.get('ids', []), 'status': 'awaiting model service'}
@router.get('/recommendations/{recommendation_id}/evidence')
def recommendation_evidence(recommendation_id: str) -> list[dict]:
    return []
