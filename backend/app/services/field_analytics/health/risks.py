"""
Moisture status, moisture trend, erosion risk, leaching risk and seeding window.
Every rule is written out in the response so the farmer can see why a light is red.
"""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any, Dict, List, Optional

import requests
from shapely.geometry import shape

from app.services.field_analytics.health.common import (
    DERIVED, MEASURED, MODELLED, SATELLITE_ESTIMATE, centroid, get_field, unavailable,
)
from app.services.nasa.real import series as nasa_series
from app.services.nasa.real import smap_l4
from app.services.nasa.real.imerg import ImergUnavailable, daily_precipitation, days_since_rain

#: Root-zone percentile classes. The 20th percentile matches the US Drought Monitor's
#: D1 "moderate drought" boundary; 40 marks the lower edge of the normal range.
RED_PCTL, YELLOW_PCTL = 20.0, 40.0


# ---------------------------------------------------------------- moisture
def moisture_status(field_id: str) -> Dict[str, Any]:
    field = get_field(field_id)
    lat, lon = centroid(field)
    try:
        latest = smap_l4.latest_available_day()
        pc = smap_l4.percentile_for(lat, lon, latest)
    except smap_l4.SmapUnavailable as exc:
        return unavailable(f"NASA SMAP L4 soil moisture unavailable: {exc}")
    except Exception as exc:  # network / OPeNDAP problems
        return unavailable(f"NASA SMAP L4 soil moisture could not be read ({type(exc).__name__}).")
    p = pc["percentile"]
    cls = "red" if p < RED_PCTL else "yellow" if p < YELLOW_PCTL else "green"
    label = {"red": "Low moisture, possible stress", "yellow": "Moderate moisture", "green": "Sufficient moisture"}[cls]
    return {
        "available": True,
        "class": cls,
        "label": label,
        "percentile": p,
        "rootzone_m3m3": pc["rootzone_m3m3"],
        "date": pc["date"],
        "provenance": MODELLED,
        "source": "NASA SMAP L4 (SPL4SMGP.008) root zone 0-100 cm, 9 km cell",
        "rule": (f"Rank of today's value among {pc['climatology_samples']} values for the same cell within +-15 days of this date in "
                 f"{pc['climatology_years']}: < {RED_PCTL:g} red, {RED_PCTL:g}-{YELLOW_PCTL:g} yellow, >= {YELLOW_PCTL:g} green"),
        "climatology_median_m3m3": pc["climatology_median_m3m3"],
        "climatology_p10_m3m3": pc["climatology_p10_m3m3"],
        "climatology_p90_m3m3": pc["climatology_p90_m3m3"],
        "climatology_samples": pc["climatology_samples"],
        "climatology_years": pc["climatology_years"],
        "scale_note": "The 9 km cell is larger than the field; this is the moisture situation around the field.",
        "source_ref": pc["source_ref"],
    }


def moisture_trend(field_id: str, days: int = 30) -> Dict[str, Any]:
    field = get_field(field_id)
    lat, lon = centroid(field)
    end = date.today().isoformat()
    start = (date.today() - timedelta(days=days)).isoformat()
    try:
        smap_l4.ensure_days(lat, lon, [date.today() - timedelta(days=k) for k in range(days + 4, 3, -1)])
    except Exception:
        pass  # fall back to whatever is cached
    modelled = nasa_series.smap_modelled(lat, lon, start, end)
    measured = nasa_series.smap_measured(lat, lon, start, end)
    if not modelled and not measured:
        st = nasa_series.ensure_point_data(lat, lon, f"{date.today().year - 3}-01-01", end)
        return unavailable("SMAP data is still being extracted." if st.get("pending_task") else "No SMAP data for the last 30 days.",
                           pending_task=st.get("pending_task"))
    usual = None
    if modelled:
        try:
            pc = smap_l4.percentile_for(lat, lon, date.fromisoformat(modelled[-1]["date"]))
            modelled[-1]["rootzone_percentile"] = pc["percentile"]
            usual = {"p10": pc["climatology_p10_m3m3"], "median": pc["climatology_median_m3m3"], "p90": pc["climatology_p90_m3m3"],
                     "years": pc["climatology_years"], "samples": pc["climatology_samples"], "window": "same date +-15 days"}
        except Exception:
            pass
    out: Dict[str, Any] = {
        "available": True,
        "period": [start, end],
        "usual_range": usual,
        "modelled": modelled,
        "measured": measured,
        "sources": {
            "modelled": {"name": "NASA SMAP L4 (SPL4SMGP.008)", "provenance": MODELLED, "depth": "root zone 0-100 cm and surface 0-5 cm", "resolution": "9 km, 3-hourly averaged to daily"},
            "measured": {"name": "NASA SMAP L3 Enhanced (SPL3SMP_E.006)", "provenance": MEASURED, "depth": "surface ~0-5 cm", "resolution": "9 km, one value per satellite pass",
                         "filter": "Only retrievals with quality flag 'recommended' and 0.02-0.60 m³/m³ are used"},
        },
        "events": [],
    }
    if len(modelled) >= 2:
        first, last = modelled[0], modelled[-1]
        delta = round(last["rootzone_m3m3"] - first["rootzone_m3m3"], 4)
        out["change_m3m3"] = delta
        if first["rootzone_percentile"] is not None and last["rootzone_percentile"] is not None:
            out["change_percentile_points"] = round(last["rootzone_percentile"] - first["rootzone_percentile"], 1)
        if abs(delta) >= 0.02:
            out["events"].append({"type": "wetting" if delta > 0 else "drying",
                                  "text": f"Root-zone moisture {'rose' if delta > 0 else 'fell'} by {abs(delta):.3f} m³/m³ over {days} days."})
        # largest 3-day rise = rain event
        for a, b in zip(modelled, modelled[3:]):
            if b["rootzone_m3m3"] - a["rootzone_m3m3"] >= 0.015:
                out["events"].append({"type": "rain_response", "date": b["date"],
                                      "text": f"Sharp wetting around {b['date']} (+{b['rootzone_m3m3'] - a['rootzone_m3m3']:.3f} m³/m³ in 3 days)."})
                break
        if last["rootzone_percentile"] is not None and last["rootzone_percentile"] < RED_PCTL:
            out["events"].append({"type": "stress", "text": "Drier than usual for this time of year."})
    rejected = [m for m in measured if not m["used"]]
    if rejected:
        out["rejected_measurements"] = len(rejected)
    return out


# ---------------------------------------------------------------- rain
def rain_summary(field_id: str, days: int = 365) -> Dict[str, Any]:
    field = get_field(field_id)
    lat, lon = centroid(field)
    end = (date.today() - timedelta(days=1)).isoformat()
    start = (date.today() - timedelta(days=days)).isoformat()
    try:
        s = daily_precipitation(lat, lon, start, end)
    except ImergUnavailable as exc:
        return unavailable(f"GPM IMERG unavailable: {exc}")
    vals = [d for d in s["days"] if d["precip_mm"] is not None]
    if not vals:
        return unavailable("No IMERG days available for this cell.")
    as_of = vals[-1]["date"]
    since = days_since_rain(s, 1.0)
    last7 = round(sum(d["precip_mm"] for d in vals if d["date"] > (date.fromisoformat(as_of) - timedelta(days=7)).isoformat()), 1)
    last30 = round(sum(d["precip_mm"] for d in vals if d["date"] > (date.fromisoformat(as_of) - timedelta(days=30)).isoformat()), 1)
    return {
        "available": True,
        "provenance": SATELLITE_ESTIMATE,
        "source": "NASA GPM IMERG Late Run daily (GPM_3IMERGDL.07), 0.1° cell",
        "cell": s["cell"],
        "as_of": as_of,
        "days_since_rain": since,
        "days_since_rain_rule": "Days since the last day with >= 1 mm",
        "rain_7d_mm": last7,
        "rain_30d_mm": last30,
        "rain_365d_mm": round(sum(d["precip_mm"] for d in vals), 1),
        "heavy_days_365d": sum(1 for d in vals if d["precip_mm"] >= 20.0),
        "daily": vals[-60:],
        "missing_days": len(s["missing_days"]),
    }


# ---------------------------------------------------------------- forecast helpers
def _forecast(lat: float, lon: float) -> Optional[Dict[str, Any]]:
    try:
        r = requests.get(
            "https://api.open-meteo.com/v1/forecast",
            params={"latitude": lat, "longitude": lon, "timezone": "auto", "forecast_days": 7,
                    "daily": "precipitation_sum,temperature_2m_min", "hourly": "soil_temperature_0_to_7cm"},
            timeout=10,
        )
        r.raise_for_status()
        return r.json()
    except Exception:
        return None


# ---------------------------------------------------------------- erosion
def erosion_risk(field_id: str, soil: Dict[str, Any], rain: Dict[str, Any], ndvi: Dict[str, Any]) -> Dict[str, Any]:
    from app.services.field_analytics.elevation_service import elevation_service

    field = get_field(field_id)
    factors: List[Dict[str, Any]] = []
    water = wind = 0
    try:
        elev = elevation_service.get_elevation_for_polygon(field_id, shape(field["geometry"]))
        slope = float(elev["mean_slope_deg"])
        pts = 2 if slope >= 5 else 1 if slope >= 2 else 0
        water += pts
        factors.append({"factor": "Slope", "value": f"{slope:.1f}° mean, {float(elev['max_slope_deg']):.1f}° max",
                        "effect": ["flat, little runoff", "gentle, some runoff", "steep, strong runoff"][pts],
                        "source": "Copernicus DEM GLO-30", "points": pts, "type": "water"})
    except Exception as exc:
        factors.append({"factor": "Slope", "value": "unavailable", "effect": f"DEM could not be read ({type(exc).__name__})", "points": 0, "type": "water"})

    if soil.get("available"):
        sand, silt = soil["sand_pct"], soil["silt_pct"]
        soc = next((c["value"] for c in soil["components"] if c["name"] == "Organic carbon"), None)
        s_pts = 2 if sand >= 70 else 1 if sand >= 50 else 0
        wind += s_pts
        factors.append({"factor": "Sandy topsoil", "value": f"{sand:.0f} % sand", "effect": ["low wind erosion risk", "moderate wind erosion risk", "high wind erosion risk"][s_pts],
                        "source": "SoilGrids v2.0", "points": s_pts, "type": "wind"})
        if silt >= 40:
            water += 1
            factors.append({"factor": "Silty topsoil", "value": f"{silt:.0f} % silt", "effect": "easily detached by rain", "source": "SoilGrids v2.0", "points": 1, "type": "water"})
        if soc is not None and soc < 1.0:
            wind += 1
            factors.append({"factor": "Low organic carbon", "value": f"{soc:.2f} %", "effect": "weak soil aggregates", "source": "SoilGrids v2.0", "points": 1, "type": "wind"})

    if rain.get("available"):
        heavy = rain["heavy_days_365d"]
        if heavy >= 3:
            water += 1
        factors.append({"factor": "Heavy rain days", "value": f"{heavy} days >= 20 mm in 12 months", "effect": "erosive rain" if heavy >= 3 else "few erosive storms",
                        "source": "NASA GPM IMERG Late", "points": 1 if heavy >= 3 else 0, "type": "water"})

    bare_share = None
    if ndvi.get("available"):
        cutoff = (date.today() - timedelta(days=365)).isoformat()
        recent = [s for s in ndvi["series"] if s["date"] >= cutoff]
        if recent:
            bare_share = sum(1 for s in recent if s["mean_ndvi"] < 0.25) / len(recent)
            pts = 1 if bare_share >= 0.3 else 0
            water += pts
            wind += pts
            factors.append({"factor": "Bare soil", "value": f"{round(bare_share * 100)} % of clear scenes in 12 months had NDVI < 0.25",
                            "effect": "unprotected soil" if pts else "mostly covered", "source": "Sentinel-2 NDVI", "points": pts, "type": "both"})

    score = max(water, wind)
    level = "red" if score >= 3 else "yellow" if score == 2 else "green"
    dominant = "wind" if wind > water else "water"
    if level == "green":
        rec = "No action needed. Keep soil covered over winter."
    elif dominant == "wind":
        rec = "Keep the soil covered: cover crop after harvest, leave stubble."
    else:
        rec = "Work across the slope, keep residue on top, add a grass strip at the low edge."
    return {
        "available": True, "level": level, "score": score, "water_points": water, "wind_points": wind, "dominant": dominant,
        "factors": factors, "recommendation": rec, "provenance": DERIVED,
        "method": "Points per factor; the higher of water and wind totals sets the light: 0-1 green, 2 yellow, >= 3 red. A Farmily screening rule, not a DIN 19708 assessment.",
    }


# ---------------------------------------------------------------- leaching
def leaching_risk(field_id: str, soil: Dict[str, Any], rain: Dict[str, Any], inputs: Dict[str, Any]) -> Dict[str, Any]:
    field = get_field(field_id)
    lat, lon = centroid(field)
    fc = _forecast(lat, lon)
    alerts: List[Dict[str, Any]] = []
    factors: List[Dict[str, Any]] = []

    vuln = 0
    if soil.get("available"):
        sand = soil["sand_pct"]
        cec = next((c["value"] for c in soil["components"] if c["name"].startswith("Nutrient")), None)
        vuln = 2 if sand >= 70 else 1 if sand >= 50 else 0
        if cec is not None and cec < 100:
            vuln = min(2, vuln + 1)
        factors.append({"factor": "Soil", "value": f"{soil['texture']}, {sand:.0f} % sand, CEC {cec:.0f} mmol(c)/kg" if cec is not None else soil["texture"],
                        "effect": ["water held well", "moderate drainage", "fast drainage, nitrate moves down quickly"][vuln], "source": "SoilGrids v2.0"})
    fc_rain_3d = None
    if fc:
        daily = fc.get("daily", {})
        fc_rain_3d = round(sum(v or 0 for v in daily.get("precipitation_sum", [])[:3]), 1)
        factors.append({"factor": "Rain forecast", "value": f"{fc_rain_3d} mm in the next 3 days", "source": "Open-Meteo forecast"})
    if rain.get("available"):
        factors.append({"factor": "Recent rain", "value": f"{rain['rain_7d_mm']} mm in 7 days to {rain['as_of']}", "source": "NASA GPM IMERG Late"})

    app_date = inputs.get("last_n_application_date")
    if app_date:
        days_ago = (date.today() - date.fromisoformat(app_date)).days
        factors.append({"factor": "Last N application", "value": f"{app_date} ({days_ago} days ago)" + (f", {inputs['last_n_application_kg_ha']:g} kg N/ha" if inputs.get("last_n_application_kg_ha") else ""), "source": "Farmer input"})
        if 0 <= days_ago <= 14 and vuln >= 1:
            rain_since = None
            if rain.get("available"):
                rain_since = round(sum(d["precip_mm"] for d in rain["daily"] if d["date"] >= app_date), 1)
            if (rain_since or 0) >= 20 or (fc_rain_3d or 0) >= 20:
                alerts.append({"level": "red", "text": f"Heavy rain {'since' if (rain_since or 0) >= 20 else 'due after'} your N on {app_date}: high leaching risk."})
    if (fc_rain_3d or 0) >= 20 and vuln >= 1 and not alerts:
        alerts.append({"level": "yellow", "text": f"{fc_rain_3d} mm rain due in 3 days. Hold off nitrogen."})

    today = date.today()
    if today.month >= 10 or today.month == 1:
        alerts.append({"level": "info", "text": "No nitrogen on arable land until 31 January (DüV blocking period)."})

    level = "red" if any(a["level"] == "red" for a in alerts) else ("yellow" if vuln == 2 or any(a["level"] == "yellow" for a in alerts) else ("yellow" if vuln == 1 else "green"))

    # Seeding window for winter cereals / cover crops: topsoil warm enough and no heavy rain.
    seeding = unavailable("Forecast unavailable.")
    if fc:
        temps = [t for t in fc.get("hourly", {}).get("soil_temperature_0_to_7cm", [])[:72] if t is not None]
        if temps:
            mean_t = round(sum(temps) / len(temps), 1)
            open_ = mean_t >= 8.0 and (fc_rain_3d or 0) < 20
            seeding = {
                "available": True, "status": "open" if open_ else "closed", "soil_temp_3d_mean_c": mean_t,
                "rain_3d_mm": fc_rain_3d, "provenance": MODELLED,
                "text": (f"Soil {mean_t} °C, {fc_rain_3d} mm rain due: good time to sow a cover crop." if open_ else
                         "Not a sowing window: " + ", ".join(
                             ([f"soil {mean_t} °C, needs 8 °C"] if mean_t < 8 else []) + ([f"{fc_rain_3d} mm rain due"] if (fc_rain_3d or 0) >= 20 else []))),
                "rule": "Open when forecast 0-7 cm soil temperature averages >= 8 °C over 72 h and forecast rain < 20 mm.",
                "source": "Open-Meteo forecast",
            }
    return {
        "available": True, "level": level, "vulnerability": ["low", "medium", "high"][vuln], "alerts": alerts,
        "factors": factors, "seeding_window": seeding, "provenance": DERIVED,
        "method": "Soil vulnerability from sand and CEC; alert when >= 20 mm rain falls or is forecast within 14 days after an N application on medium/high-vulnerability soil.",
    }
