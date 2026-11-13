from fastapi import APIRouter
from app.schemas.common import ClimateScenario
router = APIRouter(tags=['scenarios'])
@router.post('/scenarios/simulate')
def simulate_scenario(scenario: ClimateScenario) -> dict:
    return {'scenario': scenario.model_dump(), 'status': 'awaiting calibrated scenario service'}
