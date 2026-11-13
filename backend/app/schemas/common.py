from pydantic import BaseModel, Field as PydanticField
from typing import Literal

class Farm(BaseModel):
    id: str
    name: str
    location: str
    area_ha: float
    field_count: int

class FieldGeometry(BaseModel):
    type: Literal['Polygon']
    coordinates: list[list[list[float]]]

class Field(BaseModel):
    id: str
    farm_id: str
    name: str
    area_ha: float
    current_crop: str
    geometry: FieldGeometry

class SoilProfile(BaseModel):
    organic_carbon_pct: float
    ph: float
    sand_pct: float
    clay_pct: float
    silt_pct: float
    texture: str

class ClimateScenario(BaseModel):
    rainfall_change_pct: float = PydanticField(ge=-100, le=100)
    temperature_change_c: float = PydanticField(ge=-5, le=10)
    heat_exposure_days: int = PydanticField(ge=0, le=365)

class FarmerPreferences(BaseModel):
    water_conservation: int = PydanticField(ge=0, le=100)
    soil_health: int = PydanticField(ge=0, le=100)
    drought_resilience: int = PydanticField(ge=0, le=100)
    nitrogen_contribution: int = PydanticField(ge=0, le=100)
    erosion_reduction: int = PydanticField(ge=0, le=100)
    profitability: int = PydanticField(ge=0, le=100)
    crop_diversity: int = PydanticField(ge=0, le=100)

class RecommendationRequest(BaseModel):
    field_id: str

class Recommendation(BaseModel):
    id: str
    field_id: str
    confidence: Literal['low', 'moderate', 'high']
    strategies: list[dict]
