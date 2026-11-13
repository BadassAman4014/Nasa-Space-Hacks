from enum import Enum
from typing import Any, Optional
from pydantic import BaseModel, Field

class DatasetCategory(str, Enum):
    SOIL = "soil"
    CLIMATE = "climate"
    SATELLITE = "satellite"
    TOPOGRAPHY = "topography"
    ECOLOGY = "ecology"
    WATER = "water"
    ECONOMICS = "economics"

class ChallengeDatasetInfo(BaseModel):
    id: str = Field(..., description="Unique dataset identifier")
    name: str = Field(..., description="Full dataset name")
    agency: str = Field(..., description="Sponsoring agency (NASA, USDA, USGS, ESA, ECMWF, FAO, USFS)")
    category: DatasetCategory = Field(..., description="Disciplinary domain")
    spatial_resolution: str = Field(..., description="Spatial resolution / scale")
    temporal_cadence: str = Field(..., description="Revisit rate or temporal aggregation")
    official_url: str = Field(..., description="Official landing page / resource URL")
    api_endpoint: Optional[str] = Field(None, description="Public API endpoint or access portal")
    description: str = Field(..., description="Description of sensor, physics, and observations")
    agricultural_application: str = Field(..., description="How data supports crop rotation and sustainable management")
    supported_parameters: list[str] = Field(default_factory=list, description="Available query parameters or bands")
    is_live_queryable: bool = Field(True, description="Whether live API queries are supported")

class DatasetQueryRequest(BaseModel):
    dataset_id: str
    lat: float
    lon: float
    year: Optional[int] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    extra_params: Optional[dict[str, Any]] = None

class DatasetQueryResponse(BaseModel):
    dataset_id: str
    name: str
    agency: str
    category: DatasetCategory
    query_timestamp: str
    location: dict[str, float]
    status: str
    data: dict[str, Any]
    summary: str
    source_url: str
    metadata: dict[str, Any] = Field(default_factory=dict)

class FieldMultiQueryRequest(BaseModel):
    dataset_ids: Optional[list[str]] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None

class FieldMultiQueryResponse(BaseModel):
    field_id: str
    field_name: str
    farm_name: str
    area_ha: float
    centroid: dict[str, float]
    bbox: list[float]
    queried_at: str
    results: dict[str, DatasetQueryResponse]
