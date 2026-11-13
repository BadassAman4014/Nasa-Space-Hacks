"""FastAPI Router for AI Satellite Field Boundary Detection."""

from typing import Any, Dict
from fastapi import APIRouter, HTTPException, Query, status

from app.services.field_segmentation.service import AIFieldDetectionService
from app.services.field_segmentation.schemas import (
    ScanRequest,
    ScanJobStatus,
    PredictionCollection,
    ModelStatusResponse
)

router = APIRouter(prefix="/ai-field-detection", tags=["AI Field Detection"])

@router.get("/model/status", response_model=ModelStatusResponse)
def get_model_status() -> ModelStatusResponse:
    """Return model checkpoint readiness, parameters count, and validation metrics."""
    service = AIFieldDetectionService.get_instance()
    return service.get_model_status()

@router.post("/scan", response_model=ScanJobStatus, status_code=status.HTTP_202_ACCEPTED)
def start_scan(request: ScanRequest) -> ScanJobStatus:
    """Queue an asynchronous satellite field boundary detection scan for a bounding box."""
    service = AIFieldDetectionService.get_instance()
    try:
        return service.start_scan(request)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to initiate field boundary scan: {str(e)}"
        )

@router.get("/jobs/{job_id}", response_model=ScanJobStatus)
def get_job_status(job_id: str) -> ScanJobStatus:
    """Retrieve live processing status and progress for a scan job."""
    service = AIFieldDetectionService.get_instance()
    job = service.get_job_status(job_id)
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Scan job with id '{job_id}' not found."
        )
    return job

@router.get("/jobs/{job_id}/predictions")
def get_predictions(job_id: str) -> Dict[str, Any]:
    """Retrieve predicted GeoJSON FeatureCollection for a completed scan job."""
    service = AIFieldDetectionService.get_instance()
    job = service.get_job_status(job_id)
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Scan job with id '{job_id}' not found."
        )

    if job.status == "failed":
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Scan job failed: {job.error_details or 'Unknown error'}"
        )

    if job.status in ["pending", "running"]:
        raise HTTPException(
            status_code=status.HTTP_202_ACCEPTED,
            detail=f"Scan job is still in progress (stage: '{job.stage}', {job.progress}%)."
        )

    predictions = service.get_predictions(job_id)
    if not predictions:
        return {
            "type": "FeatureCollection",
            "features": [],
            "metadata": {
                "job_id": job_id,
                "total_fields": 0,
                "status": "completed_zero_fields"
            }
        }
    return predictions

@router.post("/jobs/{job_id}/cancel")
def cancel_scan(job_id: str) -> Dict[str, Any]:
    """Cancel an active scan job."""
    service = AIFieldDetectionService.get_instance()
    success = service.cancel_scan(job_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Scan job '{job_id}' could not be cancelled or does not exist."
        )
    return {"status": "cancelled", "job_id": job_id}
