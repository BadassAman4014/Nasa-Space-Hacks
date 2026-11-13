"""
Main orchestrator for NASA Earth Observation Environmental Data Integration.
Coordinates extraction, persistence, temporal aggregations, and status tracking
for NASA SMAP, NASA GPM IMERG, and NASA MODIS across user fields.
"""

import json
import threading
from datetime import datetime, timezone, timedelta
from typing import Any, Optional
from shapely.geometry import shape

from app.services.nasa.schemas import (
    DatasetType,
    EnvironmentalDatasetInfo,
    EnvironmentalObservationItem,
    EnvironmentalSummaryItem,
    FieldEnvironmentalResponse,
    SmapFieldReport,
    GpmFieldReport,
    ModisFieldReport,
    EnvironmentalExtractionStatus,
)
from app.services.nasa.storage import nasa_storage, NasaStorageRepository
from app.services.nasa.smap import smap_client, smap_extractor, smap_processor
from app.services.nasa.gpm import gpm_client, gpm_extractor, gpm_processor
from app.services.nasa.modis import modis_client, modis_extractor, modis_processor
from app.services.nasa.common import get_coarse_resolution_warning
from app.services.user_farms_repository import user_farms_repo

class NasaEnvironmentalService:
    def __init__(self, storage: Optional[NasaStorageRepository] = None):
        self.storage = storage or nasa_storage
        self.user_repo = user_farms_repo
        self.smap_client = smap_client
        self.smap_extractor = smap_extractor
        self.smap_processor = smap_processor

        self.gpm_client = gpm_client
        self.gpm_extractor = gpm_extractor
        self.gpm_processor = gpm_processor

        self.modis_client = modis_client
        self.modis_extractor = modis_extractor
        self.modis_processor = modis_processor

        self._active_jobs: dict[str, dict[str, Any]] = {}
        self._lock = threading.Lock()

    def list_datasets(self) -> list[EnvironmentalDatasetInfo]:
        """Return metadata for all supported NASA datasets."""
        return self.storage.list_datasets()

    def get_extraction_status(self, field_id: str) -> EnvironmentalExtractionStatus:
        """Get live or stored extraction status for a field."""
        with self._lock:
            if field_id in self._active_jobs:
                job = self._active_jobs[field_id]
                return EnvironmentalExtractionStatus(
                    field_id=field_id,
                    status=job.get("status", "processing"),
                    progress_percentage=job.get("progress", 50),
                    current_dataset=job.get("current_dataset"),
                    message=job.get("message", "Extraction in progress"),
                    last_updated=job.get("updated_at"),
                )

        obs = self.storage.get_field_observations(field_id)
        if obs:
            return EnvironmentalExtractionStatus(
                field_id=field_id,
                status="completed",
                progress_percentage=100,
                message=f"Environmental data available ({len(obs)} observations)",
                last_updated=obs[-1].period_end if obs else None,
            )

        return EnvironmentalExtractionStatus(
            field_id=field_id,
            status="not_started",
            progress_percentage=0,
            message="No environmental data has been extracted for this field",
        )

    def get_field_environmental_data(
        self,
        field_id: str,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        dataset: Optional[str] = None,
    ) -> Optional[FieldEnvironmentalResponse]:
        """
        Retrieve persistent NASA environmental observations and temporal summaries for a field.
        """
        field = self.user_repo.get_field(field_id)
        if not field:
            return None

        # Default query window: past 90 days
        now = datetime.now(timezone.utc)
        resolved_end = end_date or now.strftime("%Y-%m-%d")
        resolved_start = start_date or (now - timedelta(days=90)).strftime("%Y-%m-%d")

        all_obs = self.storage.get_field_observations(
            field_id=field_id,
            dataset_id=dataset,
            start_date=resolved_start,
            end_date=resolved_end,
        )

        all_summaries = self.storage.get_field_summaries(field_id=field_id, dataset_id=dataset)

        datasets_map = {d.id: d for d in self.storage.list_datasets()}

        smap_report: Optional[SmapFieldReport] = None
        gpm_report: Optional[GpmFieldReport] = None
        modis_report: Optional[ModisFieldReport] = None

        # Build SMAP report if requested/present
        if dataset is None or dataset == "smap_soil_moisture":
            smap_info = datasets_map.get("smap_soil_moisture")
            if smap_info:
                smap_obs = [o for o in all_obs if o.dataset_id == "smap_soil_moisture"]
                latest_sm = smap_obs[-1].mean_value if smap_obs else None
                latest_date = smap_obs[-1].observation_date if smap_obs else None

                obs_dicts = [o.model_dump() for o in smap_obs]
                weekly = self.smap_processor.calculate_weekly_means(obs_dicts)
                monthly = self.smap_processor.calculate_monthly_means(obs_dicts)
                seasonal = self.smap_processor.calculate_seasonal_mean(obs_dicts).get("seasonal_mean")

                warning = get_coarse_resolution_warning(
                    source="NASA SMAP (9 km)",
                    field_area_ha=field.get("area_hectares", 0.0),
                    pixel_resolution_km=9.0,
                    intersecting_pixels=1,
                )

                smap_report = SmapFieldReport(
                    dataset_info=smap_info,
                    latest_soil_moisture=latest_sm,
                    latest_observation_date=latest_date,
                    unit="m³/m³",
                    is_coarse_resolution=True,
                    resolution_limitation=warning,
                    observations=smap_obs,
                    weekly_means=weekly,
                    monthly_means=monthly,
                    seasonal_mean=seasonal,
                )

        # Build GPM report if requested/present
        if dataset is None or dataset == "gpm_precipitation":
            gpm_info = datasets_map.get("gpm_precipitation")
            if gpm_info:
                gpm_obs = [o for o in all_obs if o.dataset_id == "gpm_precipitation"]
                latest_precip = gpm_obs[-1].mean_value if gpm_obs else None
                latest_date = gpm_obs[-1].observation_date if gpm_obs else None

                obs_dicts = [o.model_dump() for o in gpm_obs]
                monthly = self.gpm_processor.calculate_monthly_accumulation(obs_dicts)
                summary_metrics = self.gpm_processor.calculate_summary_metrics(obs_dicts)

                warning = get_coarse_resolution_warning(
                    source="NASA GPM IMERG (10 km / 0.1°)",
                    field_area_ha=field.get("area_hectares", 0.0),
                    pixel_resolution_km=10.0,
                    intersecting_pixels=1,
                )

                gpm_report = GpmFieldReport(
                    dataset_info=gpm_info,
                    latest_precipitation_mm=latest_precip,
                    latest_observation_date=latest_date,
                    unit="mm",
                    product_run="Final",
                    is_coarse_resolution=True,
                    resolution_limitation=warning,
                    observations=gpm_obs,
                    monthly_accumulation_mm=monthly,
                    total_seasonal_accumulation_mm=summary_metrics.get("total_accumulation_mm"),
                    rainy_days_count=summary_metrics.get("rainy_days_count", 0),
                    heavy_rain_events_count=summary_metrics.get("heavy_rain_events_count", 0),
                )

        # Build MODIS report if requested/present
        if dataset is None or dataset == "modis_vegetation":
            modis_info = datasets_map.get("modis_vegetation")
            if modis_info:
                modis_obs = [o for o in all_obs if o.dataset_id == "modis_vegetation"]
                latest_ndvi = modis_obs[-1].mean_value if modis_obs else None
                latest_evi = (
                    modis_obs[-1].metadata.get("evi_mean")
                    if (modis_obs and modis_obs[-1].metadata)
                    else None
                )
                latest_date = modis_obs[-1].observation_date if modis_obs else None

                obs_dicts = [o.model_dump() for o in modis_obs]
                seasonal = self.modis_processor.calculate_seasonal_metrics(obs_dicts)

                is_sub = field.get("area_hectares", 0.0) < 6.25
                sub_note = None
                if is_sub:
                    sub_note = (
                        f"Field area ({field.get('area_hectares', 0.0):.2f} ha) is smaller than the 250 m MODIS pixel (6.25 ha/pixel). "
                        f"Values represent the dominant 250 m cell covering the centroid."
                    )

                modis_report = ModisFieldReport(
                    dataset_info=modis_info,
                    latest_ndvi=latest_ndvi,
                    latest_evi=latest_evi,
                    latest_composite_date=latest_date,
                    is_subpixel=is_sub,
                    resolution_limitation=sub_note,
                    observations=modis_obs,
                    seasonal_max_ndvi=seasonal.get("seasonal_max_ndvi"),
                    seasonal_mean_ndvi=seasonal.get("seasonal_mean_ndvi"),
                    seasonal_mean_evi=seasonal.get("seasonal_mean_evi"),
                    valid_coverage_pct=100.0,
                )

        last_updated = all_obs[-1].created_at if all_obs else None

        return FieldEnvironmentalResponse(
            field_id=field_id,
            field_name=field["name"],
            field_area_ha=field["area_hectares"],
            query_start_date=resolved_start,
            query_end_date=resolved_end,
            smap=smap_report,
            gpm=gpm_report,
            modis=modis_report,
            summaries=all_summaries,
            last_updated=last_updated,
        )

    def extract_field_environmental_data(
        self,
        field_id: str,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        datasets: list[DatasetType] = ["smap", "gpm", "modis"],
        force_refresh: bool = False,
    ) -> FieldEnvironmentalResponse:
        """
        Execute spatial extraction and temporal aggregation across requested NASA datasets.
        """
        field = self.user_repo.get_field(field_id)
        if not field:
            raise ValueError(f"Field '{field_id}' not found in saved farm records.")

        geom_wgs84 = field.get("geometry")
        if not geom_wgs84:
            raise ValueError(f"Field '{field_id}' has no valid geometry coordinates.")

        poly_shapely = shape(geom_wgs84)
        centroid = poly_shapely.centroid
        lat = centroid.y
        lon = centroid.x
        area_ha = field.get("area_hectares", 1.0)

        # Default analysis window: past 90 days if unspecified
        now = datetime.now(timezone.utc)
        resolved_end = end_date or now.strftime("%Y-%m-%d")
        resolved_start = start_date or (now - timedelta(days=90)).strftime("%Y-%m-%d")

        # Concurrency check
        with self._lock:
            if field_id in self._active_jobs and self._active_jobs[field_id]["status"] == "processing":
                resp = self.get_field_environmental_data(field_id, resolved_start, resolved_end)
                if resp:
                    resp.message = "Environmental extraction is already in progress for this field."
                    return resp

            self._active_jobs[field_id] = {
                "status": "processing",
                "progress": 5,
                "current_dataset": None,
                "message": "Starting NASA Earth observation extraction...",
                "updated_at": now.isoformat(),
            }

        try:
            total_datasets = len(datasets)
            step = 0

            # -------------------------------------------------------------
            # 1. NASA SMAP (Soil Moisture)
            # -------------------------------------------------------------
            if "smap" in datasets:
                step += 1
                with self._lock:
                    self._active_jobs[field_id]["progress"] = int((step / (total_datasets + 1)) * 90)
                    self._active_jobs[field_id]["current_dataset"] = "NASA SMAP"
                    self._active_jobs[field_id]["message"] = "Extracting NASA SMAP 9 km soil moisture..."

                # Query daily observations
                smap_obs_items = self.smap_client.fetch_open_smap_daily(
                    lat=lat,
                    lon=lon,
                    start_date=resolved_start,
                    end_date=resolved_end,
                )

                for obs in smap_obs_items:
                    obs["field_id"] = field_id
                    obs["dataset_id"] = "smap_soil_moisture"
                    self.storage.save_observation(obs)

                # Compute temporal summaries
                if smap_obs_items:
                    weekly = self.smap_processor.calculate_weekly_means(smap_obs_items)
                    monthly = self.smap_processor.calculate_monthly_means(smap_obs_items)
                    seasonal = self.smap_processor.calculate_seasonal_mean(smap_obs_items)

                    summary_rows = []
                    for w in weekly:
                        summary_rows.append({
                            "aggregation_type": "weekly_mean",
                            "period_start": w["period"],
                            "period_end": w["period"],
                            "metric_name": "mean_soil_moisture",
                            "metric_value": w["mean_soil_moisture"],
                            "unit": "m³/m³",
                        })
                    for m in monthly:
                        summary_rows.append({
                            "aggregation_type": "monthly_mean",
                            "period_start": f"{m['month']}-01",
                            "period_end": f"{m['month']}-28",
                            "metric_name": "mean_soil_moisture",
                            "metric_value": m["mean_soil_moisture"],
                            "unit": "m³/m³",
                        })
                    if seasonal and "seasonal_mean" in seasonal:
                        summary_rows.append({
                            "aggregation_type": "seasonal_mean",
                            "period_start": resolved_start,
                            "period_end": resolved_end,
                            "metric_name": "seasonal_mean_soil_moisture",
                            "metric_value": seasonal["seasonal_mean"],
                            "unit": "m³/m³",
                        })
                    self.storage.save_summaries(field_id, "smap_soil_moisture", summary_rows)

            # -------------------------------------------------------------
            # 2. NASA GPM IMERG (Precipitation)
            # -------------------------------------------------------------
            if "gpm" in datasets:
                step += 1
                with self._lock:
                    self._active_jobs[field_id]["progress"] = int((step / (total_datasets + 1)) * 90)
                    self._active_jobs[field_id]["current_dataset"] = "NASA GPM IMERG"
                    self._active_jobs[field_id]["message"] = "Extracting NASA GPM IMERG precipitation..."

                gpm_obs_items = self.gpm_client.fetch_open_gpm_daily(
                    lat=lat,
                    lon=lon,
                    start_date=resolved_start,
                    end_date=resolved_end,
                )

                for obs in gpm_obs_items:
                    obs["field_id"] = field_id
                    obs["dataset_id"] = "gpm_precipitation"
                    self.storage.save_observation(obs)

                if gpm_obs_items:
                    monthly_precip = self.gpm_processor.calculate_monthly_accumulation(gpm_obs_items)
                    gpm_summaries = self.gpm_processor.calculate_summary_metrics(gpm_obs_items)

                    summary_rows = []
                    for mp in monthly_precip:
                        summary_rows.append({
                            "aggregation_type": "monthly_accumulation",
                            "period_start": f"{mp['month']}-01",
                            "period_end": f"{mp['month']}-28",
                            "metric_name": "accumulated_precipitation_mm",
                            "metric_value": mp["accumulated_precipitation_mm"],
                            "unit": "mm",
                        })
                    summary_rows.append({
                        "aggregation_type": "seasonal_accumulation",
                        "period_start": resolved_start,
                        "period_end": resolved_end,
                        "metric_name": "total_seasonal_precipitation_mm",
                        "metric_value": gpm_summaries["total_accumulation_mm"],
                        "unit": "mm",
                    })
                    summary_rows.append({
                        "aggregation_type": "rainy_days_count",
                        "period_start": resolved_start,
                        "period_end": resolved_end,
                        "metric_name": "rainy_days_count",
                        "metric_value": float(gpm_summaries["rainy_days_count"]),
                        "unit": "days",
                    })
                    summary_rows.append({
                        "aggregation_type": "heavy_rain_events",
                        "period_start": resolved_start,
                        "period_end": resolved_end,
                        "metric_name": "heavy_rain_events_count",
                        "metric_value": float(gpm_summaries["heavy_rain_events_count"]),
                        "unit": "events",
                    })
                    self.storage.save_summaries(field_id, "gpm_precipitation", summary_rows)

            # -------------------------------------------------------------
            # 3. NASA MODIS (Vegetation Indices)
            # -------------------------------------------------------------
            if "modis" in datasets:
                step += 1
                with self._lock:
                    self._active_jobs[field_id]["progress"] = int((step / (total_datasets + 1)) * 90)
                    self._active_jobs[field_id]["current_dataset"] = "NASA MODIS"
                    self._active_jobs[field_id]["message"] = "Extracting NASA MODIS 16-day NDVI/EVI..."

                modis_obs_items = self.modis_client.fetch_open_modis_composites(
                    lat=lat,
                    lon=lon,
                    start_date=resolved_start,
                    end_date=resolved_end,
                )

                for obs in modis_obs_items:
                    obs["field_id"] = field_id
                    obs["dataset_id"] = "modis_vegetation"
                    self.storage.save_observation(obs)

                if modis_obs_items:
                    monthly_modis = self.modis_processor.calculate_monthly_summaries(modis_obs_items)
                    modis_metrics = self.modis_processor.calculate_seasonal_metrics(modis_obs_items)

                    summary_rows = []
                    for mm in monthly_modis:
                        if mm["mean_ndvi"] is not None:
                            summary_rows.append({
                                "aggregation_type": "monthly_mean",
                                "period_start": f"{mm['month']}-01",
                                "period_end": f"{mm['month']}-28",
                                "metric_name": "mean_ndvi",
                                "metric_value": mm["mean_ndvi"],
                                "unit": "index",
                            })
                    if modis_metrics["seasonal_max_ndvi"] is not None:
                        summary_rows.append({
                            "aggregation_type": "seasonal_max",
                            "period_start": resolved_start,
                            "period_end": resolved_end,
                            "metric_name": "seasonal_max_ndvi",
                            "metric_value": modis_metrics["seasonal_max_ndvi"],
                            "unit": "index",
                        })
                    if modis_metrics["seasonal_mean_ndvi"] is not None:
                        summary_rows.append({
                            "aggregation_type": "seasonal_mean",
                            "period_start": resolved_start,
                            "period_end": resolved_end,
                            "metric_name": "seasonal_mean_ndvi",
                            "metric_value": modis_metrics["seasonal_mean_ndvi"],
                            "unit": "index",
                        })
                    self.storage.save_summaries(field_id, "modis_vegetation", summary_rows)

            with self._lock:
                self._active_jobs.pop(field_id, None)

            result = self.get_field_environmental_data(field_id, resolved_start, resolved_end)
            if not result:
                raise RuntimeError(f"Failed to load newly extracted environmental data for {field_id}")
            return result

        except Exception as e:
            with self._lock:
                self._active_jobs.pop(field_id, None)
            raise e

nasa_environmental_service = NasaEnvironmentalService()

