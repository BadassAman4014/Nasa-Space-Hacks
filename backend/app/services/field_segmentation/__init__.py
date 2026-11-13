"""Field Boundary Segmentation and Satellite AI Service Module."""

from .model import UNetMobileNetV3Small
from .inference import FieldInferenceEngine
from .satellite_service import Sentinel2AcquisitionService
from .polygonization import extract_field_polygons
from .service import AIFieldDetectionService
from .schemas import (
    ScanRequest,
    ScanJobStatus,
    PredictionCollection,
    PredictionFeature,
    ModelStatusResponse
)

__all__ = [
    "UNetMobileNetV3Small",
    "FieldInferenceEngine",
    "Sentinel2AcquisitionService",
    "extract_field_polygons",
    "AIFieldDetectionService",
    "ScanRequest",
    "ScanJobStatus",
    "PredictionCollection",
    "PredictionFeature",
    "ModelStatusResponse",
]
