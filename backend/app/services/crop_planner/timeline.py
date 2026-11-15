"""
Critical vulnerability timeline: for each month, how strong the drought, heavy-rain erosion and frost hazards are for this
field (from real data), and how much of the month a given rotation keeps the soil covered.

Hazard sources
  drought   SMAP L4 root-zone soil moisture: how dry the month is compared with the field's own wettest and driest month
  erosion   NASA POWER: mean heavy-rain days (>= 20 mm) per month, scaled to the field's own maximum month
  frost     NASA POWER: share of years with at least one night below 0 deg C in that month
A month with no data is 'unavailable', not zero.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from app.services.crop_planner import rotation


def _level(v: Optional[float], bands: Dict[str, float]) -> Optional[str]:
    if v is None:
        return None
    return "high" if v >= bands["high_from"] else "medium" if v >= bands["medium_from"] else "low"


def hazards(ctx: Dict[str, Any], signals: Dict[str, Dict[str, Any]]) -> Dict[str, Any]:
    bands = ctx["weights"]["timeline"]["hazard_bands"]
    monthly = ctx["monthly"]
    out: Dict[int, Dict[str, Any]] = {}
    heavy_max = 0.0
    if monthly["available"]:
        heavy_max = max((r["heavy_rain_days"] for r in monthly["months"].values() if r), default=0.0)
    smap = signals["root_zone_moisture"]
    dry = smap["detail"].get("monthly_dryness_index") if smap["provenance"] != "unavailable" else None
    for m in range(1, 13):
        rec = monthly["months"].get(m) if monthly["available"] else None
        d_val = None if dry is None else dry.get(m, dry.get(str(m)))
        e_val = None if rec is None or heavy_max == 0 else round(rec["heavy_rain_days"] / heavy_max, 3)
        f_val = None if rec is None else rec["frost_month_share"]
        out[m] = {
            "drought": {"value": d_val, "level": _level(d_val, bands), "source": "SMAP L4 root zone"},
            "erosion": {"value": e_val, "level": _level(e_val, bands), "heavy_rain_days": None if rec is None else rec["heavy_rain_days"], "source": "NASA POWER daily precipitation"},
            "frost": {"value": f_val, "level": _level(f_val, bands), "source": "NASA POWER daily minimum temperature"},
        }
    note = []
    if not monthly["available"]:
        note.append(f"Erosion and frost hazards unavailable: {monthly.get('reason')}")
    if dry is None:
        note.append(f"Drought hazard unavailable: {smap['reason']}")
    return {"months": out, "notes": note, "years_used": monthly.get("years_used") if monthly["available"] else []}


def cover_for_strategy(strategy: Dict[str, Any], year_index: int = 0) -> Dict[int, Optional[float]]:
    years = strategy["years"]
    y = years[year_index]
    crop = y["crop"]
    from app.services.crop_planner import profiles

    if crop not in profiles.eligible_crop_ids():
        return {m: None for m in range(1, 13)}
    nxt = years[year_index + 1]["crop"] if year_index + 1 < len(years) else None
    occ = rotation.occupancy_year(crop, nxt, bool(y["catch_crop_after"]))
    return rotation.month_shares(occ)


def build(ctx: Dict[str, Any], signals: Dict[str, Dict[str, Any]], strategies: List[Dict[str, Any]], year_index: int = 0) -> Dict[str, Any]:
    W = ctx["weights"]["timeline"]
    cb = W["cover_bands"]
    hz = hazards(ctx, signals)

    def state(share: Optional[float]) -> Optional[str]:
        if share is None:
            return None
        return "shielded" if share >= cb["shielded_from"] else "partly" if share >= cb["partly_from"] else "exposed"

    per_strategy = {}
    for s in strategies:
        cov = cover_for_strategy(s, year_index)
        months = []
        unprotected, drought_overlap = [], []
        for m in range(1, 13):
            h = hz["months"][m]
            st = state(cov[m])
            soil_hazard = [k for k in ("erosion", "frost") if h[k]["level"] in ("medium", "high")]
            if st == "exposed" and soil_hazard:
                unprotected.append(m)
            if cov[m] is not None and cov[m] >= cb["partly_from"] and h["drought"]["level"] == "high":
                drought_overlap.append(m)
            months.append({"month": m, "cover_share": None if cov[m] is None else round(cov[m], 2), "cover_state": st, "hazards": h})
        per_strategy[s["id"]] = {"strategy_id": s["id"], "crop": s["years"][year_index]["crop"], "year": s["years"][year_index]["year"],
                                 "months": months, "unprotected_hazard_months": unprotected, "crop_in_high_drought_months": drought_overlap}
    return {"year_index": year_index, "hazards": hz, "strategies": per_strategy, "bands": W,
            "method": "Cover share is the part of each month the crop (and a catch crop, where the plan has one) occupies the field, from the sourced crop calendar. Hazard levels compare each month with this field's own strongest month."}
