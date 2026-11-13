"""
High-level SoilGrids service orchestrator.
Manages extraction workflows, asynchronous job status, concurrency locking,
and database persistence for field soil profiles.
"""

import json
import threading
from datetime import datetime, timezone
from typing import Any, Optional
from app.services.soilgrids.client import soilgrids_client, SOILGRIDS_VARIABLES, SUPPORTED_DEPTHS
from app.services.soilgrids.extraction import soilgrids_extractor
from app.services.soilgrids.statistics import soil_stats_processor
from app.services.soilgrids.soil_repository import soil_repository
from app.services.soilgrids.schemas import (
    SoilProfileResponse,
    TopsoilSummary,
    SoilMeasurement,
    ExtractionStatusResponse,
    SupportedVariablesResponse,
)
from app.services.user_farms_repository import user_farms_repo

class SoilGridsService:
    def __init__(self):
        self.client = soilgrids_client
        self.extractor = soilgrids_extractor
        self.stats = soil_stats_processor
        self.repo = soil_repository
        self.user_repo = user_farms_repo

        # In-memory status and concurrency locking
        self._active_jobs: dict[str, dict[str, Any]] = {}
        self._lock = threading.Lock()

    def get_supported_variables(self) -> SupportedVariablesResponse:
        """Return available SoilGrids properties, units, and depth intervals."""
        return SupportedVariablesResponse(
            source="ISRIC SoilGrids",
            dataset_version="2.0.0",
            spatial_resolution="250m",
            supported_properties=self.client.get_supported_variables(),
            depth_intervals=SUPPORTED_DEPTHS,
            notes=[
                "Global digital soil property maps by ISRIC - World Soil Information",
                "Spatial resolution: 250 meters. Standard depth intervals: 0-5, 5-15, 15-30, 30-60, 60-100, 100-200 cm",
                "Topsoil summary represents depth-weighted average of 0-30cm layers",
                "Texture class derived according to the standard USDA Soil Texture Triangle",
            ],
        )

    def get_extraction_status(self, field_id: str) -> ExtractionStatusResponse:
        """Get current extraction status for a field."""
        with self._lock:
            if field_id in self._active_jobs:
                job = self._active_jobs[field_id]
                return ExtractionStatusResponse(
                    field_id=field_id,
                    status=job.get("status", "processing"),
                    progress_percentage=job.get("progress", 50),
                    message=job.get("message", "Extraction in progress"),
                    last_updated=job.get("updated_at"),
                )

        profile = self.repo.get_soil_profile(field_id)
        if profile:
            return ExtractionStatusResponse(
                field_id=field_id,
                status=profile.get("status", "completed"),
                progress_percentage=100,
                message="Soil profile extracted and available",
                last_updated=profile.get("updated_at"),
            )

        return ExtractionStatusResponse(
            field_id=field_id,
            status="not_started",
            progress_percentage=0,
            message="No soil extraction has been performed for this field",
            last_updated=None,
        )

    def get_field_soil_profile(self, field_id: str) -> Optional[SoilProfileResponse]:
        """
        Retrieve the latest persistent soil profile for a saved field.
        """
        field = self.user_repo.get_field(field_id)
        if not field:
            return None

        profile_data = self.repo.get_soil_profile(field_id)
        if not profile_data:
            return SoilProfileResponse(
                field_id=field_id,
                status="not_started",
                field_area_ha=field.get("area_hectares", 0.0),
                message="Soil data is not currently available for this field.",
            )

        # Convert measurements to schemas
        measurements: list[SoilMeasurement] = [
            SoilMeasurement(
                property_name=m["property_name"],
                depth_interval=m["depth_interval"],
                mean_value=m["mean_value"],
                minimum_value=m["minimum_value"],
                maximum_value=m["maximum_value"],
                unit=m["unit"],
                raw_mean=m.get("raw_mean"),
                valid_pixel_count=m["valid_pixel_count"],
                coverage_percentage=m["coverage_percentage"],
            )
            for m in profile_data.get("measurements", [])
        ]

        # Calculate topsoil summary
        topsoil = self.stats.compute_topsoil_summary(
            measurements=measurements,
            field_area_ha=field.get("area_hectares", 0.0),
            is_subpixel=bool(profile_data.get("is_subpixel", False)),
        )

        return SoilProfileResponse(
            field_id=field_id,
            status=profile_data["status"],
            source=profile_data["source"],
            dataset_version=profile_data["dataset_version"],
            spatial_resolution=profile_data["spatial_resolution"],
            extraction_date=profile_data["extraction_date"],
            coverage_percentage=profile_data["coverage_percentage"],
            field_area_ha=field.get("area_hectares", 0.0),
            is_subpixel=bool(profile_data.get("is_subpixel", False)),
            resolution_limitation=profile_data.get("resolution_limitation"),
            topsoil_summary=topsoil,
            measurements=measurements,
            depth_intervals=SUPPORTED_DEPTHS,
            supported_properties=list(SOILGRIDS_VARIABLES.keys()),
            created_at=profile_data["created_at"],
            updated_at=profile_data["updated_at"],
        )

    def extract_field_soil(self, field_id: str, force_refresh: bool = False) -> SoilProfileResponse:
        """
        Execute full soil property extraction across all depths for a saved field.
        """
        field = self.user_repo.get_field(field_id)
        if not field:
            raise ValueError(f"Field '{field_id}' not found in saved farm records.")

        geom = field.get("geometry")
        if not geom:
            raise ValueError(f"Field '{field_id}' has no valid geometry coordinates.")

        # Check existing profile unless force_refresh
        if not force_refresh:
            existing = self.get_field_soil_profile(field_id)
            if existing and existing.status in ("completed", "partial"):
                return existing

        # Concurrency check
        with self._lock:
            if field_id in self._active_jobs and self._active_jobs[field_id]["status"] == "processing":
                return SoilProfileResponse(
                    field_id=field_id,
                    status="processing",
                    field_area_ha=field.get("area_hectares", 0.0),
                    message="Soil extraction is already running for this field.",
                )
            self._active_jobs[field_id] = {
                "status": "processing",
                "progress": 10,
                "message": "Starting SoilGrids raster extraction...",
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }

        try:
            measurements: list[SoilMeasurement] = []
            is_subpixel = False
            total_coverage = 0.0
            coverage_samples = 0

            # Priority 0-30cm depths first, then deeper
            props_to_extract = list(SOILGRIDS_VARIABLES.keys())
            total_steps = len(props_to_extract) * len(SUPPORTED_DEPTHS)
            step_count = 0

            for prop in props_to_extract:
                for depth in SUPPORTED_DEPTHS:
                    step_count += 1
                    with self._lock:
                        self._active_jobs[field_id]["progress"] = int((step_count / total_steps) * 90)
                        self._active_jobs[field_id]["message"] = f"Extracting {prop} ({depth})..."

                    ext_result = self.extractor.extract_property_at_depth(
                        geom_wgs84=geom,
                        property_name=prop,
                        depth=depth,
                    )

                    if ext_result:
                        m = self.stats.calculate_measurement(ext_result)
                        if m:
                            measurements.append(m)
                            total_coverage += m.coverage_percentage
                            coverage_samples += 1
                            if ext_result.is_subpixel:
                                is_subpixel = True

            final_coverage = round(total_coverage / coverage_samples, 1) if coverage_samples > 0 else 0.0
            field_area_ha = field.get("area_hectares", 0.0)
            if field_area_ha < 6.25:
                is_subpixel = True

            resolution_note = None
            if is_subpixel:
                resolution_note = (
                    f"Field area ({field_area_ha:.2f} ha) is smaller than the 250m raster resolution (6.25 ha/pixel). "
                    f"Values represent modelled SoilGrids grid cell predictions."
                )

            status = "completed" if len(measurements) >= (len(props_to_extract) * len(SUPPORTED_DEPTHS) * 0.7) else (
                "partial" if measurements else "failed"
            )

            # Persist to database
            self.repo.save_soil_profile(
                field_id=field_id,
                status=status,
                coverage_percentage=final_coverage,
                is_subpixel=is_subpixel,
                resolution_limitation=resolution_note,
                measurements=measurements,
            )

            with self._lock:
                self._active_jobs.pop(field_id, None)

            return self.get_field_soil_profile(field_id) or SoilProfileResponse(
                field_id=field_id,
                status="completed",
                field_area_ha=field_area_ha,
            )

        except Exception as e:
            with self._lock:
                self._active_jobs.pop(field_id, None)
            raise e

soilgrids_service = SoilGridsService()

