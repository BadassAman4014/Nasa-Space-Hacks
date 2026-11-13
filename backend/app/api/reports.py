from fastapi import APIRouter
router = APIRouter(tags=['reports'])
@router.get('/reports/{recommendation_id}')
def get_report(recommendation_id: str) -> dict:
    return {'recommendation_id': recommendation_id, 'status': 'report generation service not connected'}
