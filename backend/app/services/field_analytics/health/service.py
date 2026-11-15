"""Compose the Field Map summary, the field card and the Field Health Trend."""

from __future__ import annotations

import threading
import time
from datetime import date
from typing import Any, Callable, Dict, List, Optional

from pyproj import Transformer
from shapely.geometry import shape

from app.services.field_analytics.health import nitrogen as nitro
from app.services.field_analytics.health import overlays, risks
from app.services.field_analytics.health.common import DERIVED, get_field, unavailable
from app.services.field_analytics.health.ndvi_history import vegetation_trend
from app.services.field_analytics.health.soil import soil_health_score
from app.services.field_analytics.productivity_service import productivity_service
from app.services.field_analytics.repository import analytics_repo
from app.services.field_analytics.s2_raster import build_field_grid
from app.services.user_farms_repository import user_farms_repo

_CACHE: Dict[str, tuple] = {}
_LOCK = threading.Lock()
TTL_S = 600


def _cached(key: str, fn: Callable[[], Any], refresh: bool = False, ttl: int = TTL_S) -> Any:
    now = time.time()
    with _LOCK:
        hit = _CACHE.get(key)
        if hit and not refresh and now - hit[0] < ttl:
            return hit[1]
    value = fn()
    with _LOCK:
        _CACHE[key] = (now, value)
    return value


def invalidate(field_id: str) -> None:
    with _LOCK:
        for k in [k for k in _CACHE if field_id in k]:
            _CACHE.pop(k, None)


# ---------------------------------------------------------------- map
def map_summary(refresh: bool = False) -> List[Dict[str, Any]]:
    out = []
    for f in user_farms_repo.list_fields():
        fid = f["id"]
        moisture = _cached(f"moist:{fid}", lambda: risks.moisture_status(fid), refresh)
        rain = _cached(f"rain:{fid}", lambda: risks.rain_summary(fid), refresh)
        out.append({
            "field_id": fid, "name": f["name"], "farm_name": f.get("farm_name"),
            "area_ha": round(float(f.get("area_hectares") or 0), 2), "crop": f.get("current_crop") or None,
            "geometry": f["geometry"],
            "moisture": moisture,
            "days_since_rain": rain.get("days_since_rain") if rain.get("available") else None,
            "rain_as_of": rain.get("as_of"),
        })
    return out


def _weather(field_id: str) -> Dict[str, Any]:
    from app.services.weather_station_service import weather_station_service

    try:
        w = weather_station_service.get_field_weather_data(field_id)
    except Exception as exc:
        return unavailable(f"Open-Meteo unavailable ({type(exc).__name__}).")
    cur = w["current"]
    return {
        "available": True, "provenance": "modelled", "source": "Open-Meteo forecast model; warnings from DWD",
        "current": {k: cur.get(k) for k in ("temperature_c", "feels_like_c", "humidity_percent", "wind_speed_ms", "wind_compass", "precipitation_mm", "condition", "icon", "observation_time")},
        "forecast_3d": [{k: d.get(k) for k in ("date", "day_name", "temp_min_c", "temp_max_c", "precipitation_mm", "precipitation_probability", "wind_speed_ms", "condition", "icon")} for d in w.get("forecast_daily", [])[:3]],
        "alerts": w.get("alerts"),
    }


def field_card(field_id: str, refresh: bool = False) -> Dict[str, Any]:
    field = get_field(field_id)
    soil = _cached(f"soil:{field_id}", lambda: soil_health_score(field_id), refresh, ttl=86400)
    humus = None
    if soil.get("available"):
        soc = next((c["value"] for c in soil["components"] if c["name"] == "Organic carbon"), None)
        humus = soc * 1.72 if soc is not None else None
    return {
        "field_id": field_id, "name": field["name"], "area_ha": round(float(field.get("area_hectares") or 0), 2),
        "crop": field.get("current_crop") or None,
        "geometry": field["geometry"],
        "moisture": _cached(f"moist:{field_id}", lambda: risks.moisture_status(field_id), refresh),
        "rain": _cached(f"rain:{field_id}", lambda: risks.rain_summary(field_id), refresh),
        "soil_health": soil,
        "nitrogen": nitro.nitrogen_estimate(field_id, humus),
        "weather": _cached(f"wx:{field_id}", lambda: _weather(field_id), refresh),
        "generated_at": date.today().isoformat(),
    }


def overlay(field_id: str, kind: str, refresh: bool = False) -> Dict[str, Any]:
    if kind == "moisture":
        return _cached(f"ov-moist:{field_id}", lambda: overlays.moisture_gradient(field_id), refresh)
    if kind == "nitrogen":
        return _cached(f"ov-n:{field_id}", lambda: overlays.nitrogen_zones(field_id), refresh)
    if kind == "leaching":
        h = _cached(f"leach:{field_id}", lambda: _leaching(field_id), refresh)
        return {"available": h.get("available", False), "level": h.get("level"), "vulnerability": h.get("vulnerability"),
                "scope": "field", "note": "SoilGrids is 250 m, so leaching risk is assessed for the whole field, not zones inside it.",
                "reason": h.get("reason")}
    raise ValueError(f"Unknown overlay '{kind}'.")


# ---------------------------------------------------------------- health trend
def _leaching(field_id: str) -> Dict[str, Any]:
    soil = _cached(f"soil:{field_id}", lambda: soil_health_score(field_id), ttl=86400)
    rain = _cached(f"rain:{field_id}", lambda: risks.rain_summary(field_id))
    return risks.leaching_risk(field_id, soil, rain, nitro.get_inputs(field_id))


def _wgs84_bounds(field: Dict[str, Any]) -> Optional[List[List[float]]]:
    grid = build_field_grid(shape(field["geometry"]), 10.0)
    minx, miny, maxx, maxy = grid.bounds
    t = Transformer.from_crs(grid.crs, "EPSG:4326", always_xy=True)
    xs, ys = zip(*[t.transform(x, y) for x, y in ((minx, miny), (minx, maxy), (maxx, miny), (maxx, maxy))])
    return [[min(ys), min(xs)], [max(ys), max(xs)]]


def yield_zones(field_id: str) -> Dict[str, Any]:
    field = get_field(field_id)
    obs = analytics_repo.get_observations(field_id)
    if not obs:
        return unavailable("No Sentinel-2 history stored yet for this field.")
    rep = productivity_service.calculate_productivity_report(
        field_id, float(field["area_hectares"]), obs, crop=field.get("current_crop") or "", min_seasons=2
    )
    if not rep.get("available"):
        return unavailable(rep.get("detail") or rep.get("reason") or "Productivity zones could not be built.",
                           seasons_used=rep.get("seasons_used"))
    keep = ("zones", "stability", "seasons_used", "seasons_total", "observations_used", "season_window", "method", "caveat", "legend", "map_url", "data_source")
    out = {k: rep.get(k) for k in keep}
    out.update({"available": True, "provenance": DERIVED, "bounds": _wgs84_bounds(field)})
    return out


def _fmt_utc(iso: Optional[str]) -> str:
    if not iso:
        return "?"
    from datetime import datetime

    try:
        return datetime.fromisoformat(iso).strftime("%d %b %H:%M UTC")
    except ValueError:
        return iso


def _actions(card: Dict[str, Any], trend: Dict[str, Any], erosion: Dict[str, Any], leach: Dict[str, Any], moist: Dict[str, Any]) -> List[Dict[str, Any]]:
    cards: List[Dict[str, Any]] = []

    def add(priority: int, title: str, body: str, evidence: List[str]):
        cards.append({"priority": priority, "title": title, "body": body, "evidence": evidence})

    for a in leach.get("alerts", []):
        if a["level"] in ("red", "yellow"):
            add(1 if a["level"] == "red" else 2, "Nitrate leaching risk", a["text"],
                [f["factor"] + ": " + f["value"] for f in leach.get("factors", [])])
    sw = leach.get("seeding_window", {})
    if sw.get("available") and sw["status"] == "open":
        add(2, "Good window to sow a cover crop", sw["text"], ["Open-Meteo forecast"])
    if erosion.get("level") in ("red", "yellow"):
        top = sorted(erosion["factors"], key=lambda f: -f.get("points", 0))[:2]
        add(1 if erosion["level"] == "red" else 2, f"{'High' if erosion['level'] == 'red' else 'Moderate'} {erosion['dominant']} erosion risk",
            erosion["recommendation"], [f"{f['factor']}: {f['value']} ({f.get('source', '')})" for f in top])
    if moist.get("available") and moist["class"] == "red":
        add(1, "Soil drier than usual", "Root zone is below the usual range for this time of year. Avoid sowing into a dry seedbed.",
            [f"{moist['source']}, {moist['date']}"])
    if trend.get("available") and trend["trend"].get("available") and trend["trend"]["status"] == "declining":
        add(2, "Spring green-up is weaker", trend["trend"]["explanation"], ["Sentinel-2 peak-season NDVI per year"])
    soil = card.get("soil_health", {})
    if soil.get("available"):
        ph = next((c for c in soil["components"] if c["name"].startswith("Soil reaction")), None)
        soc = next((c for c in soil["components"] if c["name"] == "Organic carbon"), None)
        if ph and ph["value"] < 5.8:
            add(2, "Check lime need", f"Topsoil pH about {ph['value']}. Confirm with a soil test before liming.", ["SoilGrids v2.0 pH (250 m)"])
        if soc and soc["value"] < 1.5:
            add(3, "Build organic matter", f"Organic carbon about {soc['value']} %. Cover crops, straw and manure help.", ["SoilGrids v2.0 organic carbon"])
    if trend.get("available"):
        recent = [s for s in trend["series"] if s["date"] >= f"{date.today().year}-10-01"]
        if recent and recent[-1]["mean_ndvi"] < 0.25 and erosion.get("dominant") == "wind":
            add(2, "Field is bare going into winter", f"NDVI {recent[-1]['mean_ndvi']} on {recent[-1]['date']}. Bare sandy soil loses nitrate and topsoil over winter.",
                ["Sentinel-2 NDVI", "SoilGrids sand content"])
    w = card.get("weather", {})
    for a in (w.get("alerts") or {}).get("alerts", []) if w.get("available") else []:
        if a.get("category") in ("frost", "rain", "wind", "thunderstorm", "hail", "snow"):
            add(1, f"DWD warning: {a['label']}", a.get("description") or a.get("headline") or "",
                [f"Deutscher Wetterdienst (official text in German), {_fmt_utc(a.get('start'))} to {_fmt_utc(a.get('end'))}"])
    for a in leach.get("alerts", []):
        if a["level"] == "info":
            add(3, "Fertiliser blocking period", a["text"], ["DüV § 6 (8)"])
    cards.sort(key=lambda c: c["priority"])
    return cards


def health_trend(field_id: str, refresh: bool = False) -> Dict[str, Any]:
    if refresh:
        invalidate(field_id)
    card = field_card(field_id)
    trend = _cached(f"trend:{field_id}", lambda: vegetation_trend(field_id), refresh)
    zones = _cached(f"zones:{field_id}", lambda: yield_zones(field_id), refresh, ttl=3600)
    erosion = _cached(f"erosion:{field_id}", lambda: risks.erosion_risk(field_id, card["soil_health"], card["rain"], trend), refresh, ttl=3600)
    leach = _cached(f"leach:{field_id}", lambda: _leaching(field_id), refresh)
    moist_trend = _cached(f"mtrend:{field_id}", lambda: risks.moisture_trend(field_id), refresh)
    return {
        "field_id": field_id,
        "vegetation_trend": trend,
        "yield_zones": zones,
        "erosion": erosion,
        "leaching": leach,
        "moisture_trend": moist_trend,
        "actions": _actions(card, trend, erosion, leach, card["moisture"]),
        "card": card,
    }
