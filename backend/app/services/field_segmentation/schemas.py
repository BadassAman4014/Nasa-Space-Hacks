"""Pydantic schemas and data contracts for AI Field Boundary Segmentation."""

from typing import Any, Dict, List, Literal, Optional, Tuple
from pydantic import BaseModel, Field

JobStatusType = Literal["pending", "running", "completed", "failed", "cancelled"]

class ScanRequest(BaseModel):
    bbox: Tuple[float, float, float, float] = Field(
        ...,
        description="Bounding box [west, south, east, north] in WGS84 EPSG:4326"
    )
    zoom: float = Field(14.0, ge=8.0, le=20.0, description="Map zoom level")
    acquisition_date: Optional[str] = Field(
        None,
        description="Target satellite acquisition date (YYYY-MM-DD), or latest if None"
    )
    max_cloud_cover: float = Field(15.0, ge=0.0, le=100.0, description="Maximum allowed cloud cover %")
    min_confidence: float = Field(0.40, ge=0.1, le=1.0, description="Minimum mean confidence threshold")
    min_field_area_ha: float = Field(0.20, ge=0.05, le=50.0, description="Minimum field area in hectares")

class ScanJobStatus(BaseModel):
    job_id: str
    status: JobStatusType
    stage: str
    progress: int = Field(0, ge=0, le=100)
    created_at: str
    updated_at: str
    error_details: Optional[str] = None
    prediction_count: int = 0
    bbox: Tuple[float, float, float, float]
    scene_id: Optional[str] = None
    imagery_date: Optional[str] = None
    sensor: Optional[str] = None

class PredictionFeatureProperties(BaseModel):
    id: str
    name: str
    area_hectares: float
    confidence: float
    min_confidence: float
    perimeter_m: float
    model_version: str
    imagery_date: str
    sensor: str
    source: str = "ai_prediction"
    geographic_region: str
    quality_status: str
    experimental: bool = True

class PredictionFeature(BaseModel):
    type: Literal["Feature"] = "Feature"
    id: str
    geometry: Dict[str, Any]
    properties: PredictionFeatureProperties

class PredictionCollection(BaseModel):
    type: Literal["FeatureCollection"] = "FeatureCollection"
    features: List[PredictionFeature]
    metadata: Dict[str, Any] = Field(default_factory=dict)

class ModelStatusResponse(BaseModel):
    model_ready: bool
    model_version: str
    architecture: str
    parameters_count: int
    input_channels: List[str]
    input_resolution_m: float
    device: str
    training_readiness: str
    validation_metrics: Dict[str, Any]
    geographic_validation: Dict[str, Any]
    checkpoint_path: str
