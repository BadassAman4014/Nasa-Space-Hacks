"""
Master Field Analytics & Historical Satellite Report Service.
Coordinates Sentinel-2, NASA POWER, Copernicus DEM, and SoilGrids integrations
to generate the comprehensive OneSoil Yield-inspired analytics experience.
"""

from datetime import datetime, timezone
import json
from typing import Any, Dict, List, Optional
from shapely.geometry import shape

from app.services.user_farms_repository import user_farms_repo
from app.services.soilgrids.service import soilgrids_service

from app.services.field_analytics.schemas import (
    CorrelationResponse,
    CurrentWeather,
    ElevationResponse,
    FieldStatusSummary,
    FullFieldReportResponse,
    GDDTimeSeriesResponse,
    NDVITimeSeriesResponse,
    PlantingDateUpdate,
    PrecipitationTimeSeriesResponse,
    ProductivityReportResponse,
    ProductivityZone,
    SatelliteObservation,
    SoilBrightnessResponse,
)
from app.services.field_analytics.repository import analytics_repo
from app.services.field_analytics.sentinel_service import sentinel_service
from app.services.field_analytics.weather_service import weather_service
from app.services.field_analytics.elevation_service import elevation_service, ElevationUnavailable
from app.services.field_analytics.soil_brightness_service import soil_brightness_service, SoilBrightnessUnavailable
from app.services.field_analytics.productivity_service import productivity_service
from app.services.field_analytics.correlation_service import correlation_service, CorrelationUnavailable
from app.services.field_analytics.s2_raster import RasterUnavailable

class FieldReportService:
    def get_field_status_summary(self, field_id: str) -> FieldStatusSummary:
        """Retrieves top-level status summary for a saved field."""
        field = user_farms_repo.get_field(field_id)
        if not field:
            raise ValueError(f"Field '{field_id}' not found in saved records.")

        farm = user_farms_repo.get_farm(field["farm_id"])
        farm_name = farm["name"] if farm else "My Farm"

        # Check planting date
        pd_record = analytics_repo.get_planting_date(field_id)
        planting_date = pd_record.get("planting_date") if pd_record else None
        harvest_date = pd_record.get("harvest_date") if pd_record else None

        days_since_planting = None
        if planting_date:
            try:
                p_dt = datetime.strptime(planting_date, "%Y-%m-%d")
                days_since_planting = max(0, (datetime.now() - p_dt).days)
            except Exception:
                pass

        # Field centroid for weather
        poly = shape(field["geometry"])
        minx, miny, maxx, maxy = poly.bounds
        lat = (miny + maxy) / 2.0
        lon = (minx + maxx) / 2.0

        current_w = weather_service.get_current_weather(lat, lon)

        return FieldStatusSummary(
            field_id=field_id,
            name=field["name"],
            farm_id=field["farm_id"],
            farm_name=farm_name,
            area_ha=round(float(field["area_hectares"]), 2),
            current_crop=field.get("current_crop"),
            planting_date=planting_date,
            harvest_date=harvest_date,
            days_since_planting=days_since_planting,
            location=farm.get("location") if farm and farm.get("location") else "Brandenburg, Germany",
            boundary_source=field.get("boundary_source", "DFBK"),
            analysis_status="Verified Satellite Analytics",
            current_weather=current_w,
            geometry=field.get("geometry"),
            bounds=[float(minx), float(miny), float(maxx), float(maxy)]
        )

    def update_planting_date(self, field_id: str, payload: PlantingDateUpdate) -> Dict[str, Any]:
        """Saves custom planting date and updates persistence."""
        field = user_farms_repo.get_field(field_id)
        if not field:
            raise ValueError(f"Field '{field_id}' not found.")

        record = analytics_repo.upsert_planting_date(
            field_id=field_id,
            planting_date=payload.planting_date,
            harvest_date=payload.harvest_date,
            crop=field.get("current_crop")
        )
        # Invalidate report cache to refresh dependent calculations
        analytics_repo.invalidate_report_cache(field_id)
        return record

    def get_ndvi_time_series(
        self,
        field_id: str,
        force_refresh: bool = False,
        limit: Optional[int] = None,
        offset: int = 0,
        order: str = "desc"
    ) -> NDVITimeSeriesResponse:
        """Retrieves historical Sentinel-2 observations and NDVI time series in progressive batches (newest first)."""
        field = user_farms_repo.get_field(field_id)
        if not field:
            raise ValueError(f"Field '{field_id}' not found.")

        # Check existing observation count in repo
        total_in_db = analytics_repo.count_observations(field_id)
        unavailable_note = None
        if total_in_db == 0 or force_refresh:
            poly_geom = field["geometry"]
            try:
                raw_extracted = sentinel_service.build_time_series(field_id, poly_geom)
            except RasterUnavailable as exc:
                raw_extracted = []
                unavailable_note = str(exc)
            analytics_repo.save_observations(field_id, raw_extracted)
            total_in_db = analytics_repo.count_observations(field_id)
        # Retrieve the requested batch (default newest first: order="desc")
        obs_batch = analytics_repo.get_observations(
            field_id,
            order=order,
            limit=limit,
            offset=offset
        )

        has_more = (offset + len(obs_batch)) < total_in_db if limit is not None else False

        # Calculate overall Latest & Previous valid NDVI across database (newest first)
        newest_obs = analytics_repo.get_observations(field_id, order="desc", limit=10)
        valid_obs = [
            o for o in newest_obs
            if o.get("is_included", True) and o.get("mean_ndvi") is not None
        ]
        latest_ndvi = None
        latest_date = None
        prev_ndvi = None
        prev_date = None
        change_pct = None

        if valid_obs:
            latest = valid_obs[0]
            latest_ndvi = latest["mean_ndvi"]
            latest_date = latest["acquisition_date"]
            if len(valid_obs) >= 2:
                prev = valid_obs[1]
                prev_ndvi = prev["mean_ndvi"]
                prev_date = prev["acquisition_date"]
                if prev_ndvi and prev_ndvi > 0 and latest_ndvi is not None:
                    change_pct = round(((latest_ndvi - prev_ndvi) / prev_ndvi) * 100.0, 1)

        sat_models = []
        for o in obs_batch:
            sat_models.append(SatelliteObservation(
                id=o["id"],
                scene_id=o.get("scene_id", "S2"),
                acquisition_date=o.get("acquisition_date") or "",
                sensor=o.get("sensor", "Sentinel-2 L2A"),
                cloud_cover_percent=float(o.get("cloud_cover_percent", o.get("cloud_cover", 0.0))),
                mean_ndvi=o.get("mean_ndvi"),
                median_ndvi=o.get("median_ndvi"),
                min_ndvi=o.get("min_ndvi"),
                max_ndvi=o.get("max_ndvi"),
                std_ndvi=o.get("std_ndvi"),
                valid_pixel_percent=float(o.get("valid_pixel_percent", 100.0)),
                valid_pixel_count=int(o.get("valid_pixel_count", 0)),
                is_included=bool(o.get("is_included", True)),
                season=o.get("season", (o.get("acquisition_date") or "")[:4]),
                rgb_preview_url=o.get("rgb_preview_url"),
                ndvi_preview_url=o.get("ndvi_preview_url")
            ))

        return NDVITimeSeriesResponse(
            field_id=field_id,
            field_name=field["name"],
            area_ha=round(float(field["area_hectares"]), 2),
            observations=sat_models,
            latest_ndvi=latest_ndvi,
            latest_date=latest_date,
            previous_ndvi=prev_ndvi,
            previous_date=prev_date,
            change_percent=change_pct,
            unavailable_note=unavailable_note,
            total_count=total_in_db,
            has_more=has_more,
            batch_offset=offset,
            batch_limit=limit
        )

    def get_precipitation_series(self, field_id: str) -> PrecipitationTimeSeriesResponse:
        field = user_farms_repo.get_field(field_id)
        if not field:
            raise ValueError(f"Field '{field_id}' not found.")

        poly = shape(field["geometry"])
        minx, miny, maxx, maxy = poly.bounds
        lat = (miny + maxy) / 2.0
        lon = (minx + maxx) / 2.0

        return weather_service.get_precipitation_series(field_id, lat, lon)

    def get_gdd_series(self, field_id: str, base_temp: Optional[float] = None) -> GDDTimeSeriesResponse:
        field = user_farms_repo.get_field(field_id)
        if not field:
            raise ValueError(f"Field '{field_id}' not found.")

        poly = shape(field["geometry"])
        minx, miny, maxx, maxy = poly.bounds
        lat = (miny + maxy) / 2.0
        lon = (minx + maxx) / 2.0
        crop = field.get("current_crop") or ""

        return weather_service.get_gdd_series(field_id, crop, lat, lon, base_temperature_c=base_temp)

    def get_full_report(self, field_id: str, force_refresh: bool = False) -> FullFieldReportResponse:
        """
        Builds or loads the full comprehensive Field Report combining Productivity Zones,
        Soil Brightness, Elevation, Spatial Correlations, and SoilGrids Analysis.
        """
        field = user_farms_repo.get_field(field_id)
        if not field:
            raise ValueError(f"Field '{field_id}' not found.")

        if not force_refresh:
            cached = analytics_repo.get_report_cache(field_id)
            if cached:
                try:
                    return FullFieldReportResponse(**cached)
                except Exception:
                    pass

        poly = shape(field["geometry"])
        area_ha = float(field["area_hectares"])

        # 1. Summary
        status_summary = self.get_field_status_summary(field_id)

        # 2. Observations (keep existing database toggles)
        obs_res = self.get_ndvi_time_series(field_id, force_refresh=False)
        # Fetch raw dict observations to get grids
        raw_obs = analytics_repo.get_observations(field_id)
        if not raw_obs:
            try:
                raw_obs = sentinel_service.build_time_series(field_id, field["geometry"])
            except RasterUnavailable:
                raw_obs = []
            analytics_repo.save_observations(field_id, raw_obs)

        # 3. Productivity Zones
        crop = field.get("current_crop") or ""
        try:
            prod_data = productivity_service.calculate_productivity_report(
                field_id, area_ha, raw_obs, crop=crop
            )
        except Exception as exc:  # noqa: BLE001
            prod_data = {
                "available": False,
                "reason": "Productivity analysis failed unexpectedly.",
                "detail": str(exc),
                "seasons_used": [],
                "seasons_total": 0,
                "zones": [],
                "stability": None,
                "map_url": None,
            }

        zone_color = {"high": "#1fa35b", "medium": "#eab308", "low": "#ef4444"}
        zone_label = {"high": "High", "medium": "Medium", "low": "Low"}
        zones = [
            ProductivityZone(
                zone_id=z["zone"],
                label=zone_label.get(z["zone"], z["zone"].title()),
                color=zone_color.get(z["zone"], "#78716c"),
                area_ha=round(float(z["area_ha"]), 3),
                area_percent=round(float(z["percent_of_field"]), 2),
                mean_ndvi=None,
            )
            for z in prod_data.get("zones", [])
        ]

        stability = prod_data.get("stability") or {}
        stable_pct = float(stability.get("stable_percent_of_comparable", 0.0))
        stable_ha = float(stability.get("stable_area_ha", 0.0))
        if stable_pct >= 70.0:
            rating = "High"
        elif stable_pct >= 40.0:
            rating = "Moderate"
        else:
            rating = "Variable"

        prod_res = ProductivityReportResponse(
            field_id=field_id,
            seasons_included=prod_data.get("seasons_used", []),
            total_seasons_analyzed=int(prod_data.get("seasons_total", 0)),
            zones=zones,
            stable_area_ha=round(stable_ha, 3),
            stable_area_percent=round(stable_pct, 2),
            stability_rating=rating,
            methodology=prod_data.get("method") or prod_data.get("reason") or "",
            min_observations_met=bool(prod_data.get("available", False)),
            status_note=prod_data.get("reason") or prod_data.get("detail") or (
                f"Computed from {len(prod_data.get('seasons_used', []))} season(s)."
            ),
            productivity_map_url=prod_data.get("map_url"),
        )

        # 4. Elevation
        elev_grid = None
        try:
            elev_data = elevation_service.get_elevation_for_polygon(field_id, poly)
            elev_res = ElevationResponse(
                field_id=field_id,
                data_source=elev_data["data_source"],
                min_elevation_m=elev_data["min_elevation_m"],
                max_elevation_m=elev_data["max_elevation_m"],
                mean_elevation_m=elev_data["mean_elevation_m"],
                elevation_range_m=elev_data["elevation_range_m"],
                mean_slope_deg=elev_data["mean_slope_deg"],
                map_url=elev_data.get("map_url"),
            )
            elev_grid = elev_data.get("elevation_grid")
        except (ElevationUnavailable, RasterUnavailable) as exc:
            elev_res = ElevationResponse(
                field_id=field_id,
                is_available=False,
                status_note=str(exc),
            )

        # 5. Soil Brightness
        bright_grid = None
        try:
            bright_data = soil_brightness_service.get_soil_brightness_for_polygon(field_id, poly)
            bright_res = SoilBrightnessResponse(
                field_id=field_id,
                observation_date=bright_data.get("observation_date", ""),
                sensor=bright_data.get("sensor", "Sentinel-2 L2A"),
                mean_brightness=bright_data["mean_brightness"],
                min_brightness=bright_data["min_brightness"],
                max_brightness=bright_data["max_brightness"],
                unit=bright_data["unit"],
                methodology=bright_data["methodology"],
                is_available=True,
                status_note=None,
                map_url=bright_data.get("map_url"),
            )
            bright_grid = bright_data.get("brightness_grid")
        except (SoilBrightnessUnavailable, RasterUnavailable) as exc:
            bright_res = SoilBrightnessResponse(
                field_id=field_id,
                observation_date="",
                mean_brightness=0.0,
                min_brightness=0.0,
                max_brightness=0.0,
                unit="Surface Reflectance Brightness Index",
                methodology="Not computed.",
                is_available=False,
                status_note=str(exc),
                map_url=None,
            )

        # 6. Spatial Correlations
        score_grid = prod_data.get("score_grid") if prod_data.get("available") else None
        prod_mask = prod_data.get("mask") if prod_data.get("available") else None
        if score_grid is None:
            corr_res = CorrelationResponse(
                field_id=field_id,
                grid_resolution_m=10.0,
                sample_pixel_count=0,
                effective_sample_size=None,
                lag1_autocorrelation=None,
                productivity_vs_elevation=None,
                productivity_vs_brightness=None,
                spatial_autocorrelation_note=(
                    "Productivity zones are unavailable, so spatial correlations "
                    "cannot be computed for this field."
                ),
                scientific_disclaimer=(
                    "Correlations describe empirical spatial association within a "
                    "single field. They do not identify causes."
                ),
            )
        else:
            try:
                corr_res = correlation_service.compute_correlations(
                    field_id=field_id,
                    productivity_grid=score_grid,
                    brightness_grid=bright_grid,
                    elevation_grid=elev_grid,
                    mask=prod_mask,
                )
            except (CorrelationUnavailable, ValueError) as exc:
                corr_res = CorrelationResponse(
                    field_id=field_id,
                    grid_resolution_m=10.0,
                    sample_pixel_count=0,
                    effective_sample_size=None,
                    lag1_autocorrelation=None,
                    productivity_vs_elevation=None,
                    productivity_vs_brightness=None,
                    spatial_autocorrelation_note=f"Correlation unavailable: {exc}",
                    scientific_disclaimer=(
                        "Correlations describe empirical spatial association within a "
                        "single field. They do not identify causes."
                    ),
                )

        # 7. SoilGrids v2.0 Profile
        soil_profile_dict = None
        try:
            profile = soilgrids_service.get_field_soil_profile(field_id)
            if not profile:
                profile = soilgrids_service.extract_field_soil(field_id)
            if profile:
                soil_profile_dict = profile.dict() if hasattr(profile, "dict") else dict(profile)
        except Exception:
            pass

        full_rep = FullFieldReportResponse(
            field_id=field_id,
            field_summary=status_summary,
            productivity=prod_res,
            soil_brightness=bright_res,
            elevation=elev_res,
            correlation=corr_res,
            historical_observations=obs_res.observations,
            soil_profile=soil_profile_dict,
            generated_at=datetime.now(timezone.utc).isoformat()
        )

        # Save cache
        analytics_repo.set_report_cache(field_id, full_rep.dict())
        return full_rep

    def toggle_observation(self, field_id: str, observation_id: str, is_included: bool) -> FullFieldReportResponse:
        """Toggles an observation and recalculates dependent productivity analyses."""
        analytics_repo.toggle_observation(field_id, observation_id, is_included)
        analytics_repo.invalidate_report_cache(field_id)
        return self.get_full_report(field_id, force_refresh=True)

report_service = FieldReportService()
