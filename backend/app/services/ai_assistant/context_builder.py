"""Build AI context from persisted or live platform data without placeholders."""

from __future__ import annotations

from typing import Any, Optional

from app.services.ai_assistant.advisor_context import advisor_context_builder
from app.services.ai_assistant.schemas import AssistantCategory, FieldContextResponse
from app.services.field_analytics.report_service import report_service
from app.services.soilgrids.service import soilgrids_service
from app.services.user_farms_repository import user_farms_repo
from app.services.weather_station_service import weather_station_service


class FieldContextBuilder:
    """Retrieve sourced agricultural data and mark missing inputs explicitly."""

    @staticmethod
    def get_registered_fields() -> list[dict[str, Any]]:
        return [
            {
                "id": field.get("id"),
                "name": field.get("name"),
                "farm_id": field.get("farm_id"),
                "farm_name": field.get("farm_name") or "Unassigned farm",
                "area_ha": round(float(field.get("area_hectares") or 0.0), 2),
                "current_crop": field.get("current_crop"),
                "land_use_category": field.get("land_use_category"),
                "boundary_source": field.get("boundary_source"),
            }
            for field in user_farms_repo.list_fields()
        ]

    def build_context(
        self, category: AssistantCategory, field_id: Optional[str] = None
    ) -> FieldContextResponse:
        if category == "advisor":
            return advisor_context_builder.build(field_id)
        if category == "general" or not field_id or field_id.lower() == "general":
            return self._build_general_context()
        if category == "all" or field_id.lower() == "all":
            return self._build_all_fields_context()

        field = user_farms_repo.get_field(field_id)
        if not field:
            return FieldContextResponse(
                field_id=field_id,
                category=category,
                context_text=f"Field '{field_id}' was not found. No field measurements are available.",
                structured_data={"field_id": field_id, "available": False},
            )
        return self._build_field_context(field, category)

    @staticmethod
    def _soil(field_id: str) -> Optional[dict[str, Any]]:
        try:
            profile = soilgrids_service.get_field_soil_profile(field_id)
            if not profile or not profile.topsoil_summary:
                profile = soilgrids_service.extract_field_soil(field_id, force_refresh=False)
            top = profile.topsoil_summary if profile else None
            if not top:
                return None
            return {
                "ph": round(top.ph, 2),
                "organic_carbon_g_kg": round(top.organic_carbon_g_kg, 2),
                "organic_carbon_pct": round(top.organic_carbon_pct, 2),
                "clay_pct": round(top.clay_pct, 1),
                "sand_pct": round(top.sand_pct, 1),
                "silt_pct": round(top.silt_pct, 1),
                "texture": top.texture_class,
                "bulk_density_g_cm3": round(top.bulk_density_g_cm3, 2),
                "cec_mmol_kg": round(top.cec_mmol_kg, 1),
                "total_nitrogen_g_kg": round(top.total_nitrogen_g_kg, 2),
                "depth": top.depth_interval,
                "source": profile.source,
                "dataset_version": profile.dataset_version,
                "extraction_date": profile.extraction_date,
            }
        except Exception:
            return None

    @staticmethod
    def _ndvi(field_id: str) -> list[dict[str, Any]]:
        try:
            series = report_service.get_ndvi_time_series(
                field_id, force_refresh=False, limit=5, offset=0, order="desc"
            )
            return [
                {
                    "date": observation.acquisition_date,
                    "mean_ndvi": round(observation.mean_ndvi, 3),
                    "cloud_cover_pct": round(observation.cloud_cover_percent, 1),
                    "sensor": observation.sensor,
                }
                for observation in series.observations
                if observation.mean_ndvi is not None
            ]
        except Exception:
            return []

    @staticmethod
    def _weather(field_id: str) -> Optional[dict[str, Any]]:
        try:
            response = weather_station_service.get_field_weather_data(field_id)
            current = response.get("current") if response else None
            if not current:
                return None
            return {
                key: current.get(key)
                for key in (
                    "temperature_c",
                    "condition",
                    "precipitation_mm",
                    "humidity_percent",
                    "wind_speed_ms",
                    "observation_time",
                )
                if current.get(key) is not None
            }
        except Exception:
            return None

    def _build_field_context(
        self, field: dict[str, Any], category: AssistantCategory
    ) -> FieldContextResponse:
        field_id = field["id"]
        area = round(float(field.get("area_hectares") or 0.0), 2)
        soil = self._soil(field_id)
        ndvi = self._ndvi(field_id)
        weather = self._weather(field_id)
        data = {
            "field_id": field_id,
            "field_name": field.get("name"),
            "farm_name": field.get("farm_name"),
            "area_ha": area,
            "current_crop": field.get("current_crop"),
            "boundary_source": field.get("boundary_source"),
            "soil": soil,
            "satellite_observations": ndvi,
            "weather": weather,
        }

        lines = [
            f"### Sourced field context: {field.get('name') or 'Unnamed field'}",
            f"- Area from saved field record: {area} ha",
            f"- Current crop from saved field record: {field.get('current_crop') or 'NOT AVAILABLE'}",
            f"- Boundary source: {field.get('boundary_source') or 'NOT AVAILABLE'}",
        ]
        if soil:
            lines.extend([
                f"- Soil source: {soil['source']} {soil['dataset_version']}, {soil['depth']}",
                f"- Texture: {soil['texture']} (sand {soil['sand_pct']}%, silt {soil['silt_pct']}%, clay {soil['clay_pct']}%)",
                f"- pH: {soil['ph']}; SOC: {soil['organic_carbon_g_kg']} g/kg; total N: {soil['total_nitrogen_g_kg']} g/kg",
                f"- Bulk density: {soil['bulk_density_g_cm3']} g/cm³; CEC: {soil['cec_mmol_kg']} mmol(c)/kg",
            ])
        else:
            lines.append("- SoilGrids profile: NOT AVAILABLE")
        if ndvi:
            lines.append("- Real Sentinel-2 observations:")
            lines.extend(
                f"  - {item['date']}: mean NDVI {item['mean_ndvi']}, cloud {item['cloud_cover_pct']}%"
                for item in ndvi
            )
        else:
            lines.append("- Sentinel-2 NDVI: NOT AVAILABLE")
        if weather:
            weather_values = ", ".join(f"{key}={value}" for key, value in weather.items())
            lines.append(f"- Current weather from platform weather service: {weather_values}")
        else:
            lines.append("- Current weather: NOT AVAILABLE")
        lines.append(
            "- Legal nitrogen need/ceiling and official red-zone status: NOT AVAILABLE; use the farm's official Düngebedarfsermittlung."
        )
        return FieldContextResponse(
            field_id=field_id,
            category=category,
            context_text="\n".join(lines),
            structured_data=data,
        )

    def _build_all_fields_context(self) -> FieldContextResponse:
        fields = user_farms_repo.list_fields()
        rows = []
        structured = []
        for field in fields:
            soil = self._soil(field["id"])
            area = round(float(field.get("area_hectares") or 0.0), 2)
            rows.append(
                f"- {field.get('name') or 'Unnamed field'}: {area} ha; "
                f"crop {field.get('current_crop') or 'NOT AVAILABLE'}; "
                f"soil {soil['texture'] if soil else 'NOT AVAILABLE'}"
            )
            structured.append({
                "field_id": field["id"],
                "name": field.get("name"),
                "farm_name": field.get("farm_name"),
                "area_ha": area,
                "current_crop": field.get("current_crop"),
                "soil": soil,
            })
        text = "### Saved fields\n" + ("\n".join(rows) if rows else "No saved fields are registered.")
        return FieldContextResponse(
            field_id="all", category="all", context_text=text,
            structured_data={"fields": structured},
        )

    @staticmethod
    def _build_general_context() -> FieldContextResponse:
        return FieldContextResponse(
            field_id=None,
            category="general",
            context_text=(
                "No field is selected. No field measurements have been loaded. "
                "Answer only from general agronomic knowledge and label it as such."
            ),
            structured_data={"field_measurements_available": False},
        )


context_builder = FieldContextBuilder()
