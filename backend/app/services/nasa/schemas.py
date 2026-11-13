"""
Pydantic schemas and models for NASA Earth Observation data integration
(NASA SMAP, NASA GPM IMERG, NASA MODIS).
"""

from datetime import datetime
from typing import Any, Literal, Optional
from pydantic import BaseModel, Field

DatasetType = Literal["smap", "gpm", "modis"]

class EnvironmentalDatasetInfo(BaseModel):
    id: str
    source: str
    product_id: str
    product_version: str
    variable_name: str
    native_unit: str
    spatial_resolution: str
    temporal_resolution: str
    description: str
    is_coarse_resolution: bool
    effective_resolution_note: str

class EnvironmentalObservationItem(BaseModel):
    id: str
    field_id: str
    dataset_id: str
    source: str
    variable_name: str
    observation_date: str # YYYY-MM-DD
    period_start: str
    period_end: str
    mean_value: float
    minimum_value: float
    maximum_value: float
    standard_deviation: float = 0.0
    unit: str
    valid_pixel_count: int
    coverage_percentage: float
    quality_status: str
    source_granule: str
    is_coarse_resolution: bool = False
    resolution_limitation: Optional[str] = None
    metadata: dict[str, Any] = {}
    created_at: Optional[str] = None

class EnvironmentalSummaryItem(BaseModel):
    id: str
    field_id: str
    dataset_id: str
    aggregation_type: str
    period_start: str
    period_end: str
    metric_name: str
    metric_value: float
    unit: str
    coverage_percentage: float = 100.0

class SmapFieldReport(BaseModel):
    dataset_info: EnvironmentalDatasetInfo
    latest_soil_moisture: Optional[float] = None
    latest_observation_date: Optional[str] = None
    unit: str = "m³/m³"
    is_coarse_resolution: bool = True
    resolution_limitation: str
    observations: list[EnvironmentalObservationItem] = []
    weekly_means: list[dict[str, Any]] = []
    monthly_means: list[dict[str, Any]] = []
    seasonal_mean: Optional[float] = None

class GpmFieldReport(BaseModel):
    dataset_info: EnvironmentalDatasetInfo
    latest_precipitation_mm: Optional[float] = None
    latest_observation_date: Optional[str] = None
    unit: str = "mm"
    product_run: str = "Final"
    is_coarse_resolution: bool = True
    resolution_limitation: str
    observations: list[EnvironmentalObservationItem] = []
    monthly_accumulation_mm: list[dict[str, Any]] = []
    total_seasonal_accumulation_mm: Optional[float] = None
    rainy_days_count: int = 0
    heavy_rain_events_count: int = 0

class ModisFieldReport(BaseModel):
    dataset_info: EnvironmentalDatasetInfo
    latest_ndvi: Optional[float] = None
    latest_evi: Optional[float] = None
    latest_composite_date: Optional[str] = None
    is_subpixel: bool = False
    resolution_limitation: Optional[str] = None
    observations: list[EnvironmentalObservationItem] = []
    seasonal_max_ndvi: Optional[float] = None
    seasonal_mean_ndvi: Optional[float] = None
    seasonal_mean_evi: Optional[float] = None
    valid_coverage_pct: float = 100.0

class FieldEnvironmentalResponse(BaseModel):
    field_id: str
    field_name: str
    field_area_ha: float
    query_start_date: str
    query_end_date: str
    smap: Optional[SmapFieldReport] = None
    gpm: Optional[GpmFieldReport] = None
    modis: Optional[ModisFieldReport] = None
    summaries: list[EnvironmentalSummaryItem] = []
    last_updated: Optional[str] = None
    message: Optional[str] = None

class EnvironmentalExtractionRequest(BaseModel):
    start_date: Optional[str] = None # YYYY-MM-DD
    end_date: Optional[str] = None   # YYYY-MM-DD
    datasets: list[DatasetType] = ["smap", "gpm", "modis"]
    force_refresh: bool = False

class EnvironmentalExtractionStatus(BaseModel):
    field_id: str
    status: Literal["not_started", "processing", "completed", "partial", "failed"]
    progress_percentage: int = 0
    current_dataset: Optional[str] = None
    message: str = ""
    last_updated: Optional[str] = None
