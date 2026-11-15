"""
Read SMAP and MODIS series from the AppEEARS cache, and request missing data.

SMAP L3 Enhanced (SPL3SMP_E.006): measured surface soil moisture (top ~5 cm), 9 km grid.
  Kept only when the retrieval quality flag bit 0 is 0 ("recommended quality") and the
  value is physically plausible for mineral soils (0.02-0.60 m3/m3).
SMAP L4 (SPL4SMGP.008): model output that assimilates SMAP brightness temperatures,
  3-hourly, 9 km. Root zone = 0-100 cm. Percentile is relative to the L4 climatology.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import date, timedelta
from typing import Any, Dict, List, Optional

from app.services.nasa.real.appeears import AppeearsError, appeears
from app.services.nasa.real.store import point_key, real_store

L3 = "SPL3SMP_E.006"
L4 = "SPL4SMGP.008"
MODIS = "MOD13Q1.061"
PLAUSIBLE_SM = (0.02, 0.60)


def ensure_point_data(lat: float, lon: float, start: str, end: str) -> Dict[str, Any]:
    """
    Make sure an AppEEARS point task covers [start, end] for this location.
    Returns the data state; never blocks on AppEEARS processing.
    """
    key = point_key(lat, lon)
    lo, hi = real_store.point_coverage(key, L4)
    # SMAP L4 is published ~3 days after observation; treat that as "up to date".
    target_hi = min(end, (date.today() - timedelta(days=4)).isoformat())
    covered = lo is not None and lo <= start and hi is not None and hi >= target_hi
    tasks = real_store.tasks_for("point", key)
    open_task = next((t for t in tasks if t["status"] not in ("ingested", "error", "deleted")), None)
    state = {"covered": covered, "coverage": [lo, hi], "pending_task": open_task["task_id"] if open_task else None}
    if covered or open_task:
        return state
    # A task finished in the last 24 h means NASA simply has not published newer days yet.
    recent = next((t for t in tasks if t["status"] == "ingested" and (t.get("completed_at") or "") >= (date.today() - timedelta(days=1)).isoformat()), None)
    if recent and lo is not None:
        state["covered"] = True
        state["note"] = f"Latest available SMAP L4 day is {hi}."
        return state
    if not appeears.configured():
        state["error"] = "Earthdata credentials are not configured."
        return state
    # Request only the missing part when we already have older data.
    req_start = start if lo is None or lo > start else (date.fromisoformat(hi) + timedelta(days=1)).isoformat()
    try:
        state["pending_task"] = appeears.submit_point(lat, lon, req_start, end)
    except AppeearsError as exc:
        state["error"] = str(exc)
    return state


def _daily(values: List[Dict[str, Any]]) -> Dict[str, List[float]]:
    out: Dict[str, List[float]] = defaultdict(list)
    for v in values:
        if v["value"] is not None:
            out[v["obs_time"][:10]].append(float(v["value"]))
    return out


def smap_measured(lat: float, lon: float, start: str, end: str) -> List[Dict[str, Any]]:
    """Quality-filtered SMAP L3E surface soil moisture, one value per pass."""
    key = point_key(lat, lon)
    rows = []
    for sm_var, qf_var, pass_name in (
        ("Soil_Moisture_Retrieval_Data_AM_soil_moisture", "Soil_Moisture_Retrieval_Data_AM_retrieval_qual_flag", "AM (06:00 local)"),
        ("Soil_Moisture_Retrieval_Data_PM_soil_moisture_pm", "Soil_Moisture_Retrieval_Data_PM_retrieval_qual_flag_pm", "PM (18:00 local)"),
    ):
        sm = {r["obs_time"][:10]: r for r in real_store.get_point_values(key, L3, sm_var, start, end)}
        qf = {r["obs_time"][:10]: r["value"] for r in real_store.get_point_values(key, L3, qf_var, start, end)}
        for day, r in sm.items():
            v = r["value"]
            if v is None:
                continue
            flag = qf.get(day)
            recommended = flag is not None and (int(flag) & 1) == 0
            plausible = PLAUSIBLE_SM[0] <= v <= PLAUSIBLE_SM[1]
            rows.append(
                {
                    "date": day,
                    "pass": pass_name,
                    "value_m3m3": round(v, 4),
                    "quality": "recommended" if recommended and plausible else ("implausible" if not plausible else ("no quality flag" if flag is None else "not recommended")),
                    "used": bool(recommended and plausible),
                    "source_ref": r["source_ref"],
                }
            )
    rows.sort(key=lambda x: (x["date"], x["pass"]))
    return rows


def smap_modelled(lat: float, lon: float, start: str, end: str) -> List[Dict[str, Any]]:
    """Daily means of SMAP L4 root-zone and surface soil moisture and the root-zone percentile."""
    key = point_key(lat, lon)
    rz = _daily(real_store.get_point_values(key, L4, "Geophysical_Data_sm_rootzone", start, end))
    sf = _daily(real_store.get_point_values(key, L4, "Geophysical_Data_sm_surface", start, end))
    pc = _daily(real_store.get_point_values(key, L4, "Geophysical_Data_sm_rootzone_pctl", start, end))
    ref = real_store.get_point_values(key, L4, "Geophysical_Data_sm_rootzone", start, end)
    src = ref[-1]["source_ref"] if ref else None
    out = []
    for day in sorted(rz):
        out.append(
            {
                "date": day,
                "rootzone_m3m3": round(sum(rz[day]) / len(rz[day]), 4),
                "surface_m3m3": round(sum(sf[day]) / len(sf[day]), 4) if sf.get(day) else None,
                "rootzone_percentile": round(sum(pc[day]) / len(pc[day]), 1) if pc.get(day) else None,
                "samples": len(rz[day]),
                "source_ref": src,
            }
        )
    return out


def modis_ndvi(lat: float, lon: float, start: str, end: str) -> List[Dict[str, Any]]:
    """MOD13Q1 16-day NDVI at 250 m; kept when pixel reliability is 0 (good) or 1 (marginal)."""
    key = point_key(lat, lon)
    nd = {r["obs_time"][:10]: r for r in real_store.get_point_values(key, MODIS, "_250m_16_days_NDVI", start, end)}
    rel = {r["obs_time"][:10]: r["value"] for r in real_store.get_point_values(key, MODIS, "_250m_16_days_pixel_reliability", start, end)}
    out = []
    for day in sorted(nd):
        v = nd[day]["value"]
        if v is None:
            continue
        if abs(v) > 1.5:  # unscaled integer (scale factor 0.0001)
            v = v * 0.0001
        r = rel.get(day)
        out.append(
            {
                "date": day,
                "ndvi": round(v, 4),
                "reliability": None if r is None else int(r),
                "used": r is not None and int(r) in (0, 1),
                "source_ref": nd[day]["source_ref"],
            }
        )
    return out
