"""
ISRIC SoilGrids integration package for FieldShift AI.
Provides field-level soil property extraction, depth profiling,
unit conversions, and persistent storage.
"""

from app.services.soilgrids.service import soilgrids_service
from app.services.soilgrids.client import soilgrids_client, SOILGRIDS_VARIABLES, SUPPORTED_DEPTHS
from app.services.soilgrids.extraction import soilgrids_extractor
from app.services.soilgrids.statistics import soil_stats_processor, get_usda_texture
from app.services.soilgrids.soil_repository import soil_repository
from app.services.soilgrids.schemas import (
    SoilProfileResponse,
    TopsoilSummary,
    SoilMeasurement,
    ExtractionStatusResponse,
    SupportedVariablesResponse,
)

__all__ = [
    "soilgrids_service",
    "soilgrids_client",
    "soilgrids_extractor",
    "soil_stats_processor",
    "soil_repository",
    "get_usda_texture",
    "SOILGRIDS_VARIABLES",
    "SUPPORTED_DEPTHS",
    "SoilProfileResponse",
    "TopsoilSummary",
    "SoilMeasurement",
    "ExtractionStatusResponse",
    "SupportedVariablesResponse",
]

