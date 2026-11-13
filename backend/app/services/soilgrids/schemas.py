"""
Pydantic schemas and typed models for ISRIC SoilGrids extraction and soil profiles.
"""

from datetime import datetime
from typing import Any, Literal, Optional
from pydantic import BaseModel, Field

# Supported SoilGrids variables
SoilVariableKey = Literal[
    "phh2o",    # Soil pH in water
    "soc",      # Soil organic carbon
    "clay",     # Clay content
    "sand",     # Sand content
    "silt",     # Silt content
    "bdod",     # Bulk density
    "cec",      # Cation exchange capacity
    "nitrogen", # Total nitrogen
]

# Supported standard GlobalSoilMap depth intervals
SoilDepthKey = Literal[
    "0-5cm",
    "5-15cm",
    "15-30cm",
    "30-60cm",
    "60-100cm",
    "100-200cm",
]

class VariableMetadata(BaseModel):
    key: str
    name: str
    mapped_unit: str
    conventional_unit: str
    scale_factor: float
    description: str

class SoilMeasurement(BaseModel):
    property_name: str
    depth_interval: str
    mean_value: float
    minimum_value: float
    maximum_value: float
    unit: str
    raw_mean: Optional[float] = None
    valid_pixel_count: int
    coverage_percentage: float

class TopsoilSummary(BaseModel):
    depth_interval: str = "0-30cm"
    ph: float
    organic_carbon_g_kg: float
    organic_carbon_pct: float
    clay_pct: float
    sand_pct: float
    silt_pct: float
    texture_class: str
    bulk_density_g_cm3: float
    cec_mmol_kg: float
    total_nitrogen_g_kg: float
    valid_pixel_count: int
    is_subpixel: bool = False
    resolution_limitation: Optional[str] = None

class SoilProfileResponse(BaseModel):
    field_id: str
    status: Literal["not_started", "processing", "completed", "partial", "failed"]
    source: str = "ISRIC SoilGrids"
    dataset_version: str = "2.0.0"
    spatial_resolution: str = "250m"
    extraction_date: Optional[str] = None
    coverage_percentage: float = 0.0
    field_area_ha: float = 0.0
    is_subpixel: bool = False
    resolution_limitation: Optional[str] = None
    topsoil_summary: Optional[TopsoilSummary] = None
    measurements: list[SoilMeasurement] = []
    depth_intervals: list[str] = []
    supported_properties: list[str] = []
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    message: Optional[str] = None

class ExtractionStatusResponse(BaseModel):
    field_id: str
    status: Literal["not_started", "processing", "completed", "partial", "failed"]
    progress_percentage: int = 0
    message: str = ""
    last_updated: Optional[str] = None

class SupportedVariablesResponse(BaseModel):
    source: str = "ISRIC SoilGrids"
    dataset_version: str = "2.0.0"
    spatial_resolution: str = "250m"
    supported_properties: list[VariableMetadata]
    depth_intervals: list[str]
    notes: list[str]

