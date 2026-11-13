from fastapi import APIRouter
from app.schemas.common import FarmerPreferences
router = APIRouter(tags=['farmer'])
@router.post('/farmer/preferences', response_model=FarmerPreferences)
def save_preferences(preferences: FarmerPreferences) -> FarmerPreferences:
    return preferences
