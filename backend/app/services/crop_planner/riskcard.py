"""
Field risk and bare-soil diagnostic card: slope erosion risk, summer heat stress and bare-soil days, each with the
source that was actually used.

Erosion uses the same points rule as the existing Farmily Field Health screen (slope, heavy-rain days, bare soil):
a screening rule, not a DIN 19708 assessment. Heat stress uses ECOSTRESS ESI; if no summer overpass is stored, the
mean number of hot days (Tmax >= 30 deg C, DWD 'Hitzetag') from NASA POWER is shown instead and the card says so.
"""

from __future__ import annotations

from statistics import mean
from typing import Any, Dict, List, Optional

from app.services.crop_planner.store import PlannerStore
from app.services.nasa.real.store import point_key

NA = "unavailable"
HOT_DAY_C = 30.0


def _level_from_points(p: int) -> str:
    return "red" if p >= 3 else "yellow" if p == 2 else "green"


def erosion_item(signals: Dict[str, Dict[str, Any]], weights: Dict[str, Any]) -> Dict[str, Any]:
    slope, rain, bare = signals["slope"], signals["rain_extremes"], signals["bare_soil"]
    if slope["provenance"] == NA:
        return {"id": "erosion", "label": "Slope erosion risk", "level": NA, "reading": f"Not assessed: {slope['reason']}", "factors": [], "sources": [slope["source"]], "method": None}
    pts = 0
    factors = []
    deg = slope["value"]
    p = 2 if deg >= 5 else 1 if deg >= 2 else 0
    pts += p
    factors.append({"factor": "Slope", "value": f"{deg:.1f}° mean ({slope['detail']['mean_slope_pct']:.1f} %), {slope['detail']['max_slope_deg']:.1f}° max", "points": p, "provenance": slope["provenance"], "as_of": slope["as_of"], "source": slope["source"]})
    if rain["provenance"] != NA:
        p = 1 if rain["value"] >= 3 else 0
        pts += p
        factors.append({"factor": "Heavy-rain days", "value": f"{rain['value']} days >= {weights['heavy_rain_mm_day']['value']:g} mm in 12 months", "points": p, "provenance": rain["provenance"], "as_of": rain["as_of"], "source": rain["source"]})
    else:
        factors.append({"factor": "Heavy-rain days", "value": "unavailable", "points": None, "reason": rain["reason"], "source": rain["source"]})
    if bare["provenance"] != NA:
        p = 1 if bare["value"] >= 0.3 * 365 else 0
        pts += p
        factors.append({"factor": "Bare soil", "value": f"{bare['value']} days/yr", "points": p, "provenance": bare["provenance"], "as_of": bare["as_of"], "source": bare["source"]})
    else:
        factors.append({"factor": "Bare soil", "value": "unavailable", "points": None, "reason": bare["reason"], "source": bare["source"]})
    missing = [f["factor"] for f in factors if f["points"] is None]
    level = _level_from_points(pts)
    reading = {
        "green": "Little water-erosion pressure from slope, storms and bare soil.",
        "yellow": "Moderate water-erosion pressure. Cover over the stormy months matters.",
        "red": "High water-erosion pressure. Keep the soil covered in heavy-rain months and avoid row crops on the slope.",
    }[level]
    if missing:
        reading += f" Based on available factors only (missing: {', '.join(missing)}); the real risk may be higher."
    return {"id": "erosion", "label": "Slope erosion risk", "level": level, "points": pts, "reading": reading, "factors": factors,
            "sources": sorted({f["source"] for f in factors}), "method": "Points per factor: slope >= 5° 2, >= 2° 1; >= 3 heavy-rain days 1; >= 30 % of the year bare 1. Total 0-1 green, 2 yellow, >= 3 red. Same screening rule as Farmily Field Health."}


def power_hot_days(lat: float, lon: float, years: List[int], store: PlannerStore) -> Optional[Dict[str, Any]]:
    key = point_key(lat, lon)
    counts = []
    for y in years:
        rows = store.power_range(key, f"{y}-06-01", f"{y}-08-31")
        if len(rows) < 85:
            continue
        counts.append(sum(1 for r in rows if r["tmax"] is not None and r["tmax"] >= HOT_DAY_C))
    return None if not counts else {"mean_hot_days": round(mean(counts), 1), "years": len(counts)}


def heat_item(signals: Dict[str, Dict[str, Any]], weights: Dict[str, Any], lat: float, lon: float, years: List[int], store: PlannerStore) -> Dict[str, Any]:
    esi = signals["evaporative_stress"]
    bands = weights["traffic_light"]["heat_stress_esi"]
    if esi["provenance"] != NA:
        v = esi["value"]
        level = "red" if v < bands["red_below"] else "yellow" if v < bands["yellow_below"] else "green"
        n = len(esi["detail"]["overpasses"])
        return {"id": "heat_stress", "label": "Summer heat and water stress", "level": level, "value": v, "source_used": "ECOSTRESS ESI", "as_of": esi["as_of"],
                "reading": f"Over {n} summer overpass(es) ECOSTRESS measured a mean evaporative stress index of {v:.2f} (1 = no stress). " + {"green": "The crop kept transpiring normally.", "yellow": "Some water stress showed in summer.", "red": "Strong water and heat stress showed in summer."}[level],
                "sources": [esi["source"]], "detail": esi["detail"], "method": f"ESI < {bands['red_below']} red, < {bands['yellow_below']} yellow (display bands)."}
    hot = power_hot_days(lat, lon, years, store)
    if hot:
        return {"id": "heat_stress", "label": "Summer heat and water stress", "level": "info", "value": hot["mean_hot_days"], "source_used": "NASA POWER hot days (fallback)", "as_of": None,
                "reading": f"No ECOSTRESS overpass is stored ({esi['reason']}). Instead: on average {hot['mean_hot_days']:.0f} hot days (>= {HOT_DAY_C:g} deg C) per summer over {hot['years']} years in the NASA POWER grid cell.",
                "sources": ["NASA POWER daily T2M_MAX"], "detail": hot, "method": "Hot day = daily maximum >= 30 deg C (DWD 'Hitzetag'). No traffic light is given for this fallback."}
    return {"id": "heat_stress", "label": "Summer heat and water stress", "level": NA, "source_used": None, "reading": f"Not assessed: {esi['reason']} NASA POWER summer data are not stored either.", "sources": [esi["source"]], "method": None}


def bare_item(signals: Dict[str, Dict[str, Any]], weights: Dict[str, Any]) -> Dict[str, Any]:
    b = signals["bare_soil"]
    bands = weights["traffic_light"]["bare_days"]
    if b["provenance"] == NA:
        return {"id": "bare_soil", "label": "Bare soil", "level": NA, "reading": f"Not assessed: {b['reason']}", "sources": [b["source"]], "method": None}
    v = b["value"]
    level = "red" if v >= bands["red_from"] else "yellow" if v >= bands["yellow_from"] else "green"
    yrs = {y: d for y, d in b["detail"]["years"].items() if d["bare_days_scaled_to_year"] is not None}
    months = b["detail"]["month_bare_share"]
    worst = sorted(((m, s) for m, s in months.items() if s), key=lambda t: -t[1])[:3]
    return {"id": "bare_soil", "label": "Bare soil", "level": level, "value": v, "as_of": b["as_of"], "provenance": b["provenance"],
            "reading": f"Satellite images show the soil uncovered (NDVI < {b['detail']['threshold']:g}) on about {v} days a year. " + ("Most bare in months " + ", ".join(str(m) for m, _ in worst) + "." if worst else ""),
            "per_year": yrs, "month_bare_share": months, "sources": [b["source"]], "method": f"Display bands: >= {bands['yellow_from']} days yellow, >= {bands['red_from']} days red."}


def build(field: Dict[str, Any], signals: Dict[str, Dict[str, Any]], weights: Dict[str, Any], lat: float, lon: float, years: List[int], store: PlannerStore) -> Dict[str, Any]:
    items = [erosion_item(signals, weights), heat_item(signals, weights, lat, lon, years, store), bare_item(signals, weights)]
    return {"field_id": field["id"], "field_name": field["name"], "area_ha": field["area_hectares"], "items": items,
            "signals": {k: {kk: vv for kk, vv in v.items() if kk != "detail"} for k, v in signals.items()}}
