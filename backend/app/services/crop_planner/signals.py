"""
Field signals: every NASA / satellite / soil metric the planner uses, each with its source, date and provenance.

provenance
  live         fetched from the provider during this request
  cached       read from the local store of an earlier real fetch; `as_of` is the true observation date
  unavailable  no real observation exists. `value` is None and `reason` says why. Nothing is guessed.

A failed live fetch falls back to the last real stored observation (marked cached, with its true date), never
to a default value. Axes that depend on an unavailable signal are 'not scored' by the scorer.
"""

from __future__ import annotations

import math
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FutureTimeout
from datetime import date, timedelta
from statistics import mean
from typing import Any, Dict, List, Optional

from shapely.geometry import shape

from app.services.crop_planner import climate, soilwater
from app.services.crop_planner.profiles import load_weights
from app.services.crop_planner.store import PlannerStore, planner_store

LIVE, CACHED, UNAVAILABLE = "live", "cached", "unavailable"


def make_signal(name: str, label: str, *, value: Any = None, unit: Optional[str] = None, source: str = "", provenance: str = UNAVAILABLE,
                as_of: Optional[str] = None, resolution_note: Optional[str] = None, reason: Optional[str] = None, detail: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    return {"name": name, "label": label, "value": value, "unit": unit, "source": source, "provenance": provenance, "as_of": as_of,
            "resolution_note": resolution_note, "reason": reason, "detail": detail or {}}


def unavailable_signal(name: str, label: str, source: str, reason: str, resolution_note: Optional[str] = None) -> Dict[str, Any]:
    return make_signal(name, label, source=source, provenance=UNAVAILABLE, reason=reason, resolution_note=resolution_note)


def _run_with_timeout(fn, timeout: float):
    ex = ThreadPoolExecutor(max_workers=1)
    fut = ex.submit(fn)
    try:
        return fut.result(timeout=timeout)
    finally:
        ex.shutdown(wait=False)


def _centroid(field: Dict[str, Any]) -> tuple[float, float]:
    c = shape(field["geometry"]).centroid
    return round(c.y, 5), round(c.x, 5)


# --------------------------------------------------------------------------------------- slope
def slope_signal(field: Dict[str, Any], store: PlannerStore, network: bool, refresh: bool = False) -> Dict[str, Any]:
    name, label, src = "slope", "Field slope", "Copernicus DEM GLO-30 (30 m)"
    cached = store.get_signal(field["id"], name)
    if cached and not refresh:
        return _as_cached(cached, name, label, src)
    if network:
        try:
            from app.services.field_analytics.elevation_service import elevation_service

            e = _run_with_timeout(lambda: elevation_service.get_elevation_for_polygon(field["id"], shape(field["geometry"])), 60.0)
            payload = {"mean_slope_deg": float(e["mean_slope_deg"]), "max_slope_deg": float(e["max_slope_deg"]),
                       "mean_elevation_m": float(e["mean_elevation_m"]), "as_of": date.today().isoformat()}
            store.put_signal(field["id"], name, payload)
            return _slope_out(payload, LIVE, name, label, src)
        except Exception as exc:  # noqa: BLE001
            if cached:
                s = _as_cached(cached, name, label, src)
                s["detail"]["live_error"] = str(exc)
                return s
            return unavailable_signal(name, label, src, f"The elevation model could not be read: {exc}")
    if cached:
        return _as_cached(cached, name, label, src)
    return unavailable_signal(name, label, src, "No elevation reading is stored for this field yet.")


def _slope_out(p: Dict[str, Any], prov: str, name: str, label: str, src: str, as_of: Optional[str] = None) -> Dict[str, Any]:
    return make_signal(name, label, value=round(p["mean_slope_deg"], 2), unit="deg", source=src, provenance=prov, as_of=as_of or p.get("as_of"),
                       resolution_note="30 m elevation model, mean over the field polygon",
                       detail={"max_slope_deg": round(p["max_slope_deg"], 2), "mean_slope_pct": round(math.tan(math.radians(p["mean_slope_deg"])) * 100, 1), "mean_elevation_m": round(p.get("mean_elevation_m", 0.0), 1)})


def _as_cached(cached: Dict[str, Any], name: str, label: str, src: str) -> Dict[str, Any]:
    if name == "slope":
        return _slope_out(cached, CACHED, name, label, src, as_of=(cached.get("as_of") or cached["_fetched_at"][:10]))
    raise KeyError(name)


# --------------------------------------------------------------------------------------- rain extremes (IMERG)
def rain_signal(field: Dict[str, Any], network: bool, refresh: bool = False) -> Dict[str, Any]:
    from app.services.nasa.real import imerg
    from app.services.nasa.real.store import real_store

    name, label = "rain_extremes", "Heavy rain days (GPM IMERG)"
    src = "NASA GPM IMERG Late Run daily (GPM_3IMERGDL.07), 0.1° cell"
    lat, lon = _centroid(field)
    heavy = float(load_weights()["heavy_rain_mm_day"]["value"])
    end = date.today() - timedelta(days=1)
    start = end - timedelta(days=364)
    lon_i, lat_i = imerg.cell_index(lat, lon)
    cell_key = f"{lon_i}_{lat_i}"

    live_note = None
    if network and refresh:
        try:
            imerg.daily_precipitation(lat, lon, start.isoformat(), end.isoformat())
            live_note = "refreshed"
        except Exception as exc:  # noqa: BLE001
            live_note = f"refresh failed: {exc}"
    rows = real_store.get_imerg(cell_key, start.isoformat(), end.isoformat())
    vals = {d: r["precip_mm"] for d, r in rows.items() if r["precip_mm"] is not None}
    if len(vals) < 0.8 * 365:
        return unavailable_signal(name, label, src, f"Only {len(vals)} of 365 days of IMERG are stored for this cell. Run scripts/prefetch_field_data.py to fetch them.", "0.1° cell, about 10 km")
    last = max(vals)
    return make_signal(
        name, label, value=sum(1 for v in vals.values() if v >= heavy), unit=f"days >= {heavy:g} mm in 12 months", source=src,
        provenance=LIVE if live_note == "refreshed" else CACHED, as_of=last, resolution_note="0.1° cell, about 10 km. Point rainfall inside the cell can differ.",
        detail={"rain_365d_mm": round(sum(vals.values()), 1), "days_covered": len(vals), "cell": {"lat": round(-90 + (lat_i + 0.5) * 0.1, 2), "lon": round(-180 + (lon_i + 0.5) * 0.1, 2)}, "refresh": live_note},
    )


# --------------------------------------------------------------------------------------- bare soil (Sentinel-2 NDVI)
def bare_soil_from_observations(obs: List[Dict[str, Any]], threshold: float, today: Optional[date] = None, max_gap_days: int = 45) -> Dict[str, Any]:
    """
    Days per year with NDVI below `threshold`, by linear interpolation between consecutive clear scenes.
    A stretch between two scenes more than `max_gap_days` apart is not counted at all (unknown, not bare).
    """
    today = today or date.today()
    pts = sorted(((date.fromisoformat(o["acquisition_date"][:10]), float(o["mean_ndvi"])) for o in obs), key=lambda p: p[0])
    per_year: Dict[int, Dict[str, int]] = {}
    per_month_bare: Dict[int, int] = {m: 0 for m in range(1, 13)}
    per_month_cov: Dict[int, int] = {m: 0 for m in range(1, 13)}
    for (d0, v0), (d1, v1) in zip(pts, pts[1:]):
        span = (d1 - d0).days
        if span <= 0 or span > max_gap_days:
            continue
        for i in range(span):
            d = d0 + timedelta(days=i)
            v = v0 + (v1 - v0) * i / span
            yr = per_year.setdefault(d.year, {"bare": 0, "covered": 0})
            yr["covered"] += 1
            per_month_cov[d.month] += 1
            if v < threshold:
                yr["bare"] += 1
                per_month_bare[d.month] += 1
    years = {}
    for y, c in sorted(per_year.items()):
        days_in_year = 366 if (y % 4 == 0 and (y % 100 != 0 or y % 400 == 0)) else 365
        complete = y < today.year
        years[y] = {"bare_days": c["bare"], "covered_days": c["covered"], "coverage_share": round(c["covered"] / days_in_year, 2), "complete_year": complete,
                    "bare_days_scaled_to_year": round(c["bare"] / c["covered"] * days_in_year) if c["covered"] >= 0.6 * days_in_year else None}
    months = {m: (None if per_month_cov[m] == 0 else round(per_month_bare[m] / per_month_cov[m], 2)) for m in range(1, 13)}
    return {"years": years, "month_bare_share": months, "n_scenes": len(pts)}


def bare_soil_signal(field: Dict[str, Any], network: bool, refresh: bool = False) -> Dict[str, Any]:
    from app.services.field_analytics.repository import analytics_repo

    name, label, src = "bare_soil", "Bare-soil days per year (Sentinel-2 NDVI)", "ESA Sentinel-2 L2A NDVI, 10-20 m, interpolated between clear scenes"
    live = False
    obs = analytics_repo.get_observations(field["id"])
    if network and (refresh or not obs):
        try:
            from app.services.field_analytics.health.ndvi_history import ensure_ndvi_history

            res = _run_with_timeout(lambda: ensure_ndvi_history(field["id"]), 240.0)
            live = bool(res.get("added"))
            obs = analytics_repo.get_observations(field["id"])
        except Exception:  # noqa: BLE001
            pass
    good = [o for o in obs if o.get("is_included") and o.get("mean_ndvi") is not None and (o.get("valid_pixel_percent") or 0) >= 60]
    if len(good) < 6:
        return unavailable_signal(name, label, src, f"Only {len(good)} clear Sentinel-2 scenes are stored for this field. Run scripts/prefetch_field_data.py ndvi.", "10-20 m")
    thr = float(load_weights()["bare_ndvi_threshold"]["value"])
    r = bare_soil_from_observations(good, thr)
    full = [(y, v) for y, v in r["years"].items() if v["complete_year"] and v["bare_days_scaled_to_year"] is not None]
    if not full:
        return unavailable_signal(name, label, src, "No complete year has enough clear scenes (60 % of the year) to count bare-soil days.", "10-20 m")
    latest_year, latest = full[-1]
    last_scene = max(o["acquisition_date"][:10] for o in good)
    return make_signal(
        name, label, value=latest["bare_days_scaled_to_year"], unit=f"days/yr with NDVI < {thr:g} ({latest_year})", source=src,
        provenance=LIVE if live else CACHED, as_of=last_scene, resolution_note="Days between scenes are interpolated. Gaps longer than 45 days are not counted.",
        detail={"years": r["years"], "month_bare_share": r["month_bare_share"], "n_scenes": r["n_scenes"], "threshold": thr},
    )


# --------------------------------------------------------------------------------------- ECOSTRESS evaporative stress
def esi_signal(field: Dict[str, Any], min_share: float = 0.6) -> Dict[str, Any]:
    from app.services.nasa.real.store import real_store

    name, label = "evaporative_stress", "Summer evaporative stress (ECOSTRESS ESI)"
    src = "NASA ECOSTRESS L4 ESI (ECO_L4T_ESI.002), 70 m, via AppEEARS"
    rows = real_store.get_rasters(field["id"], "ECO_L4T_ESI.002")
    good = [r for r in rows if r.get("total_pixels") and r["valid_pixels"] / r["total_pixels"] >= min_share and r.get("mean") is not None]
    summer = [r for r in good if r["obs_date"][5:7] in ("06", "07", "08")]
    if not summer:
        tasks = real_store.tasks_for("area", field["id"])
        pend = next((t for t in tasks if t["status"] not in ("ingested", "error", "deleted")), None)
        why = "ECOSTRESS extraction is still running at NASA AppEEARS." if pend else "No ECOSTRESS overpass in June-August with enough cloud-free field pixels is stored."
        return unavailable_signal(name, label, src, why, "70 m, sparse overpasses, cloud gaps")
    m = mean(float(r["mean"]) for r in summer)
    return make_signal(name, label, value=round(m, 3), unit="ESI (1 = no stress, 0 = severe)", source=src, provenance=CACHED, as_of=max(r["obs_date"][:10] for r in summer),
                       resolution_note="Few overpasses per summer; the mean is over the overpasses listed.",
                       detail={"overpasses": [{"date": r["obs_date"][:10], "mean": round(float(r["mean"]), 3), "valid_share": round(r["valid_pixels"] / r["total_pixels"], 2)} for r in summer]})


# --------------------------------------------------------------------------------------- SMAP L4 root-zone moisture
def smap_signal(field: Dict[str, Any]) -> Dict[str, Any]:
    from app.services.nasa.real import series
    from app.services.nasa.real.store import point_key, real_store

    name, label = "root_zone_moisture", "Root-zone soil moisture (SMAP L4)"
    src = "NASA SMAP L4 (SPL4SMGP.008) root-zone soil moisture, 9 km, modelled with SMAP assimilation"
    lat, lon = _centroid(field)
    key = point_key(lat, lon)
    lo, hi = real_store.point_coverage(key, series.L4)
    if not lo:
        return unavailable_signal(name, label, src, "No SMAP L4 values are stored for this location. Run scripts/prefetch_field_data.py submit.", "9 km cell")
    rows = series.smap_modelled(lat, lon, lo, hi)
    by_m: Dict[int, List[float]] = {m: [] for m in range(1, 13)}
    for r in rows:
        by_m[int(r["date"][5:7])].append(r["rootzone_m3m3"])
    monthly = {m: (round(mean(v), 4) if len(v) >= 5 else None) for m, v in by_m.items()}
    known = [v for v in monthly.values() if v is not None]
    latest = rows[-1] if rows else None
    if len(known) < 12:
        return unavailable_signal(name, label, src, f"Fewer than 5 days stored in {12 - len(known)} calendar months, so no seasonal pattern can be drawn.", "9 km cell")
    lo_v, hi_v = min(known), max(known)
    dryness = {m: (None if monthly[m] is None else round(1 - (monthly[m] - lo_v) / (hi_v - lo_v), 3) if hi_v > lo_v else None) for m in monthly}
    return make_signal(name, label, value=latest["rootzone_m3m3"] if latest else None, unit="m3/m3 (latest day)", source=src, provenance=CACHED, as_of=latest["date"] if latest else hi,
                       resolution_note="9 km cell; modelled, not measured at the field.",
                       detail={"monthly_mean_m3m3": monthly, "monthly_dryness_index": dryness, "latest_percentile": latest["rootzone_percentile"] if latest else None, "period": [lo, hi]})


# --------------------------------------------------------------------------------------- soil
def soil_signal(field: Dict[str, Any], network: bool, farmer_texture: Optional[str]) -> Dict[str, Any]:
    from app.services.soilgrids.service import soilgrids_service

    name, label, src = "soil", "Soil texture by depth (SoilGrids)", "ISRIC SoilGrids v2.0, 250 m"
    prof = None
    try:
        prof = soilgrids_service.get_field_soil_profile(field["id"])
    except Exception:  # noqa: BLE001
        prof = None
    live = False
    if (not prof or not prof.measurements) and network:
        try:
            prof = _run_with_timeout(lambda: soilgrids_service.extract_field_soil(field["id"], force_refresh=False), 120.0)
            live = True
        except Exception:  # noqa: BLE001
            prof = None
    if not prof or not prof.measurements:
        return unavailable_signal(name, label, src, "SoilGrids layers are not stored for this field and could not be fetched.", "250 m")
    layers = soilwater.layers_from_measurements(prof.measurements)
    topsoil_class = next((L["usda_class"] for L in layers if L.get("usda_class") and L["depth"] == "15-30cm"), None) or next((L.get("usda_class") for L in layers if L.get("usda_class")), None)
    return make_signal(
        name, label, value=topsoil_class, unit="USDA class (15-30 cm)", source=src, provenance=LIVE if live else CACHED,
        as_of=(prof.extraction_date or "")[:10] or None, resolution_note=prof.resolution_limitation or "250 m pixels; field may be smaller than a pixel.",
        detail={"layers": layers, "texture_check": soilwater.texture_check(farmer_texture, topsoil_class), "farmer_texture": farmer_texture,
                "topsoil_sand_pct": next((L.get("sand_pct") for L in layers if L["depth"] == "15-30cm"), None)},
    )


# --------------------------------------------------------------------------------------- climate (POWER)
def climate_signal(field: Dict[str, Any], store: PlannerStore, network: bool, years: Optional[List[int]] = None, fetcher=None) -> Dict[str, Any]:
    name, label, src = "climate", "Daily weather, 10 years (NASA POWER)", climate.SOURCE
    lat, lon = _centroid(field)
    years = years or climate.climate_years(int(load_weights()["climate_window"]["years"]))
    # winter crops need the autumn of the year before the first harvest year
    fetch_years = [years[0] - 1] + years
    if network:
        state = climate.ensure_power(lat, lon, fetch_years, store=store, fetcher=fetcher)
    else:
        from app.services.nasa.real.store import point_key

        have = store.power_years_cached(point_key(lat, lon))
        state = {"years_available": sorted(y for y in fetch_years if y in have), "years_fetched_now": [], "years_failed": {}, "fetched_at": store.power_fetched_at(point_key(lat, lon))}
    avail = state["years_available"]
    if len(avail) < 5:
        return unavailable_signal(name, label, src, f"Only {len(avail)} complete years of NASA POWER are stored" + (f" (fetch errors: {list(state['years_failed'].values())[:1]})" if state["years_failed"] else "") + ". At least 5 are needed.", "0.5° x 0.625° grid cell")
    return make_signal(name, label, value=len(avail), unit="complete years stored", source=src, provenance=LIVE if state["years_fetched_now"] else CACHED,
                       as_of=(state["fetched_at"] or "")[:10] or None, resolution_note="Coarse grid; a field's own microclimate is not resolved.",
                       detail={"years": avail, "years_failed": state["years_failed"], "years_requested": fetch_years, "lat": lat, "lon": lon})


# --------------------------------------------------------------------------------------- bundle
def get_field_signals(field: Dict[str, Any], store: Optional[PlannerStore] = None, network: bool = True, refresh: bool = False, farmer_texture: Optional[str] = None, climate_fetcher=None) -> Dict[str, Dict[str, Any]]:
    store = store or planner_store
    return {
        "slope": slope_signal(field, store, network, refresh),
        "rain_extremes": rain_signal(field, network, refresh),
        "bare_soil": bare_soil_signal(field, network, refresh),
        "evaporative_stress": esi_signal(field),
        "root_zone_moisture": smap_signal(field),
        "soil": soil_signal(field, network, farmer_texture),
        "climate": climate_signal(field, store, network, fetcher=climate_fetcher),
    }
