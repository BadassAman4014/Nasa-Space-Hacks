"""
Context assembly for the floating AI Advisor.

Every block is tagged with the data source it came from so the model can cite it,
and anything the platform cannot supply is listed explicitly as NOT AVAILABLE so
the model never fills the gap with a guess.
"""

from datetime import date, timedelta
from typing import Any, Optional

from app.services.ai_assistant.schemas import FieldContextResponse
from app.services.field_analytics.weather_service import weather_service
from app.services.nasa.service import nasa_environmental_service
from app.services.soilgrids.service import soilgrids_service
from app.services.user_farms_repository import user_farms_repo
from app.services.weather_station_service import weather_station_service

SRC_FIELD = "Your field records (DFBK parcel boundary)"
SRC_SOIL = "ISRIC SoilGrids v2.0"
SRC_SMAP = "NASA SMAP soil moisture (9 km resolution)"
SRC_METEO = "Open-Meteo"
SRC_POWER = "NASA POWER"
SRC_DWD = "Deutscher Wetterdienst (DWD) warnings"


def _moisture_label(sm: float) -> str:
    # SMAP surface moisture (m3/m3). Rough agronomic bands for mineral soils.
    if sm < 0.12:
        return "very dry"
    if sm < 0.20:
        return "dry"
    if sm < 0.30:
        return "adequate"
    return "wet"


class AdvisorContextBuilder:
    def _build_general(self) -> FieldContextResponse:
        return FieldContextResponse(
            field_id="general",
            category="advisor",
            context_text=(
                "[Source: general regional knowledge, not the farmer's own data]\n"
                "- The farmer chose a general question, so no field data is loaded.\n"
                "- Region: Brandenburg, Germany. Mostly sandy, free-draining soils, about 500 to 620 mm rain a year, "
                "early-summer drought risk (May to June), late frost possible until mid-May.\n"
                "Answer in general terms. If the answer depends on a specific field, tell the farmer to pick a field."
            ),
            structured_data={"sources": ["general regional knowledge"], "unavailable": ["all field-specific data (general question)"]},
        )

    def _build_all(self) -> FieldContextResponse:
        fields = user_farms_repo.list_fields()
        if not fields:
            return FieldContextResponse(
                field_id="all", category="advisor",
                context_text="The farmer has no registered fields, so there is nothing to compare.",
                structured_data={"sources": [], "unavailable": ["all field data (no registered fields)"]},
            )
        lines = [f"[Source: {SRC_FIELD}; {SRC_SOIL}]"]
        rows = []
        for f in fields[:12]:
            soil = None
            try:
                prof = soilgrids_service.get_field_soil_profile(f["id"])
                soil = prof.topsoil_summary if prof else None
            except Exception:
                pass
            soil_txt = (
                f"{soil.texture_class}, pH {round(soil.ph, 1)}, organic carbon {round(soil.organic_carbon_pct, 2)} %"
                if soil else "soil data not available"
            )
            lines.append(
                f"- {f.get('name')} ({f.get('farm_name', 'My Farm')}): {round(float(f.get('area_hectares') or 0), 2)} ha, "
                f"crop {f.get('current_crop') or 'not assigned'}, {soil_txt}"
            )
            rows.append(f.get("name"))
        unavailable = [
            "weather, soil moisture and season data (not loaded when comparing all fields; ask the farmer to pick one field)",
            "legal nitrogen ceiling and Red Zone status (policy engine not built yet)",
            "crop history for 2024 and 2025 (not recorded in the platform yet)",
        ]
        lines.append("")
        lines.append("NOT AVAILABLE (never guess these; say they are missing if asked):")
        lines.extend(f"- {u}" for u in unavailable)
        return FieldContextResponse(
            field_id="all", category="advisor", context_text="\n".join(lines),
            structured_data={"sources": [SRC_FIELD, SRC_SOIL], "unavailable": unavailable, "fields": rows},
        )

    def build(self, field_id: Optional[str]) -> FieldContextResponse:
        if field_id == "general":
            return self._build_general()
        if field_id == "all":
            return self._build_all()
        field = user_farms_repo.get_field(field_id) if field_id and field_id not in ("all", "general") else None
        if not field:
            return FieldContextResponse(
                field_id=field_id,
                category="advisor",
                context_text=(
                    "No field is selected, so no field data is available. Answer only with general, "
                    "region-level guidance for Brandenburg and say that a field must be selected for "
                    "field-specific advice."
                ),
                structured_data={"sources": [], "unavailable": ["all field data (no field selected)"]},
            )

        fid = field["id"]
        lines: list[str] = []
        sources: list[str] = []
        unavailable: list[str] = []
        data: dict[str, Any] = {"field_id": fid}

        # --- Field -------------------------------------------------------
        area = round(float(field.get("area_hectares") or 0.0), 2)
        crop = field.get("current_crop") or None
        farm = user_farms_repo.get_farm(field["farm_id"]) if field.get("farm_id") else None
        location = (farm or {}).get("location") or "NOT AVAILABLE"
        lat = lon = None
        try:
            lat, lon = weather_station_service._calculate_centroid(field.get("geometry"))
        except Exception:
            pass
        lines.append(f"[Source: {SRC_FIELD}]")
        lines.append(f"- Field name: {field.get('name')} (farm: {field.get('farm_name', 'My Farm')})")
        lines.append(f"- Area: {area} ha")
        lines.append(f"- Location: {location}")
        lines.append(f"- Current crop: {crop or 'not assigned'}")
        sources.append(SRC_FIELD)
        data.update({"field_name": field.get("name"), "area_ha": area, "location": location, "current_crop": crop})

        # --- Soil --------------------------------------------------------
        try:
            profile = soilgrids_service.get_field_soil_profile(fid)
            top = profile.topsoil_summary if profile else None
            if top:
                lines.append(f"[Source: {SRC_SOIL}]")
                lines.append(f"- Soil texture: {top.texture_class}")
                lines.append(f"- Topsoil pH: {round(top.ph, 1)}")
                lines.append(f"- Organic carbon: {round(top.organic_carbon_pct, 2)} %")
                sources.append(SRC_SOIL)
                data["soil"] = {
                    "texture": top.texture_class,
                    "ph": round(top.ph, 1),
                    "organic_carbon_pct": round(top.organic_carbon_pct, 2),
                }
            else:
                unavailable.append("soil texture, pH and organic carbon (SoilGrids not yet extracted for this field)")
        except Exception:
            unavailable.append("soil texture, pH and organic carbon (SoilGrids lookup failed)")
        unavailable.append("plant-available water capacity (not computed by the platform yet)")

        # --- Moisture ----------------------------------------------------
        try:
            env = nasa_environmental_service.get_field_environmental_data(fid, dataset="smap_soil_moisture")
            smap = env.smap if env else None
            if smap and smap.latest_soil_moisture is not None:
                label = _moisture_label(smap.latest_soil_moisture)
                lines.append(f"[Source: {SRC_SMAP}, observation {smap.latest_observation_date}]")
                lines.append(f"- Soil moisture status: {label} (raw value {round(smap.latest_soil_moisture, 2)} m3/m3, do not quote the raw value)")
                lines.append("- Note: SMAP is coarse (about 9 km), so it shows the regional moisture trend, not this exact field.")
                sources.append(SRC_SMAP)
                data["soil_moisture"] = {"status": label, "date": smap.latest_observation_date}
            else:
                unavailable.append("SMAP soil moisture (no observations stored for this field)")
        except Exception:
            unavailable.append("SMAP soil moisture (lookup failed)")

        # --- Weather (Open-Meteo + DWD) ---------------------------------
        if lat is not None:
            try:
                w = weather_station_service.get_field_weather_data(fid)
                cur = w["current"]
                days7 = w.get("forecast_daily", [])[:7]
                rain7 = round(sum(d["precipitation_mm"] for d in days7), 1)
                min7 = min((d["temp_min_c"] for d in days7), default=None)
                frost_days = [d["day_name"] + " " + d["date_label"] for d in days7 if d["temp_min_c"] <= 0.0]
                lines.append(f"[Source: {SRC_METEO}]")
                lines.append(f"- Current temperature: {cur['temperature_c']} C, {cur['condition']}")
                lines.append(f"- Expected rain over the next 7 days: {rain7} mm")
                if min7 is not None:
                    lines.append(
                        "- Frost in the 7-day forecast: "
                        + (f"yes, on {', '.join(frost_days)} (lowest {min7} C)" if frost_days else f"no (lowest night {min7} C)")
                    )
                sources.append(SRC_METEO)
                data["weather"] = {"temperature_c": cur["temperature_c"], "rain_7d_mm": rain7, "frost_days": frost_days}

                alerts = w.get("alerts") or {}
                if alerts.get("available"):
                    active = alerts.get("alerts", [])
                    lines.append(f"[Source: {SRC_DWD}, region {alerts.get('region')}]")
                    if active:
                        for a in active:
                            lines.append(f"- {a['label']} warning ({a['level_label']}) {a['start']} to {a['end']}: {a.get('description')}")
                    else:
                        lines.append("- No active official warnings.")
                    sources.append(SRC_DWD)
                    data["dwd_alerts"] = [a["label"] for a in active]
            except Exception:
                unavailable.append("current weather and 7-day forecast (Open-Meteo unreachable)")

            try:
                rain = weather_station_service.get_recent_rain(lat, lon)
                ds = rain["days_since_rain"]
                lines.append(f"[Source: {SRC_METEO}, past 14 days]")
                lines.append(
                    f"- Days since last rain of at least {rain['threshold_mm']} mm: "
                    + (f"{ds}" if ds is not None else f"more than {rain['window_days']}")
                )
                lines.append(f"- Rain in the past {rain['window_days']} days: {rain['rain_total_mm']} mm")
                data["days_since_rain"] = ds
            except Exception:
                unavailable.append("days since last rain (Open-Meteo unreachable)")

            # --- Season: GDD + frost (NASA POWER) -----------------------
            try:
                today = date.today()
                gdd = weather_service.get_gdd_series(
                    field_id=fid,
                    crop=crop or "",
                    lat=lat,
                    lon=lon,
                    start_date=f"{today.year}-01-01",
                    end_date=(today - timedelta(days=2)).isoformat(),
                )
                frost_so_far = sum(1 for r in gdd.daily_records if r.tmin_c <= 0.0)
                lines.append(f"[Source: {SRC_POWER}, since 1 January through {gdd.daily_records[-1].date}]")
                lines.append(f"- Growing degree days accumulated (base {gdd.base_temperature_c} C): {round(gdd.total_accumulated_gdd)}")
                lines.append(f"- Frost nights so far this year: {frost_so_far}")
                sources.append(SRC_POWER)
                data["season"] = {"gdd": round(gdd.total_accumulated_gdd), "frost_nights": frost_so_far}
            except Exception:
                unavailable.append("growing degree days and frost history (NASA POWER returned no data)")
        else:
            unavailable.append("weather, rain history and growing degree days (field has no location)")

        # --- Not yet built -----------------------------------------------
        unavailable.append("legal nitrogen ceiling for this season and Red Zone status (policy engine not built yet)")
        unavailable.append("crop history for 2024 and 2025 (not recorded in the platform yet)")

        lines.append("")
        lines.append("NOT AVAILABLE (never guess these; say they are missing if asked):")
        lines.extend(f"- {u}" for u in unavailable)

        data["sources"] = sources
        data["unavailable"] = unavailable
        return FieldContextResponse(
            field_id=fid,
            category="advisor",
            context_text="\n".join(lines),
            structured_data=data,
        )


advisor_context_builder = AdvisorContextBuilder()
