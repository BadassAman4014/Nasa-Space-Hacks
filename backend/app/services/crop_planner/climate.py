"""
NASA POWER daily weather for the crop planner (T2M, T2M_MAX, T2M_MIN, PRECTOTCORR, EVLAND), cached in SQLite.

POWER is fetched one calendar year at a time. A year that is already cached is never fetched again. When the
network call fails, only years already stored are used and the shortfall is reported, so a signal built from
fewer years says so. Nothing is filled in.
"""

from __future__ import annotations

import time
from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta
from statistics import mean
from typing import Any, Callable, Dict, List, Optional, Tuple

import requests

from app.services.crop_planner.store import PlannerStore, planner_store
from app.services.nasa.real.store import point_key

POWER_URL = "https://power.larc.nasa.gov/api/temporal/daily/point"
PARAMS = "T2M,T2M_MAX,T2M_MIN,PRECTOTCORR,EVLAND"
FILL = -999.0
SOURCE = "NASA POWER daily (MERRA-2 based, community AG), 0.5° x 0.625° grid"

Fetcher = Callable[[float, float, int], List[Tuple[str, Optional[float], Optional[float], Optional[float], Optional[float], Optional[float]]]]


def _val(x: Any) -> Optional[float]:
    try:
        v = float(x)
    except (TypeError, ValueError):
        return None
    return None if v == FILL else v


def fetch_year(lat: float, lon: float, year: int, timeout: float = 45.0) -> List[Tuple[str, Optional[float], Optional[float], Optional[float], Optional[float], Optional[float]]]:
    """One calendar year of POWER daily values. Raises on any network or API failure."""
    params = {
        "parameters": PARAMS, "community": "AG", "longitude": round(lon, 4), "latitude": round(lat, 4),
        "start": f"{year}0101", "end": f"{year}1231", "format": "JSON",
    }
    last: Optional[Exception] = None
    for attempt in range(2):
        try:
            r = requests.get(POWER_URL, params=params, timeout=timeout)
            r.raise_for_status()
            p = r.json()["properties"]["parameter"]
            days = sorted(p["T2M"].keys())
            rows = []
            for d in days:
                rows.append((f"{d[:4]}-{d[4:6]}-{d[6:]}", _val(p["T2M"].get(d)), _val(p["T2M_MAX"].get(d)), _val(p["T2M_MIN"].get(d)), _val(p["PRECTOTCORR"].get(d)), _val(p["EVLAND"].get(d))))
            return rows
        except Exception as exc:  # noqa: BLE001 - surfaced to the caller as a failed year
            last = exc
            time.sleep(1.5)
    raise RuntimeError(f"NASA POWER request for {year} failed: {last}")


def ensure_power(lat: float, lon: float, years: List[int], store: Optional[PlannerStore] = None, fetcher: Optional[Fetcher] = None) -> Dict[str, Any]:
    """Make sure the given complete years are in the cache. Never raises; reports what is missing."""
    store = store or planner_store
    fetch = fetcher or (lambda la, lo, y: fetch_year(la, lo, y))
    key = point_key(lat, lon)
    have = store.power_years_cached(key)
    need = [y for y in years if y not in have]
    live, failed = [], {}

    def one(y: int):
        try:
            return y, fetch(lat, lon, y), None
        except Exception as exc:  # noqa: BLE001
            return y, None, str(exc)

    if need:
        with ThreadPoolExecutor(max_workers=3) as ex:
            for y, rows, err in ex.map(one, need):
                if rows:
                    store.save_power_year(key, y, rows)
                    live.append(y)
                else:
                    failed[y] = err
    have = store.power_years_cached(key)
    return {
        "key": key,
        "years_requested": years,
        "years_available": sorted(y for y in years if y in have),
        "years_fetched_now": sorted(live),
        "years_failed": failed,
        "fetched_at": store.power_fetched_at(key),
    }


def last_complete_year(today: Optional[date] = None) -> int:
    t = today or date.today()
    return t.year - 1


def climate_years(n: int, today: Optional[date] = None) -> List[int]:
    end = last_complete_year(today)
    return list(range(end - n + 1, end + 1))


def doy_to_date(year: int, doy: float) -> date:
    return date(year, 1, 1) + timedelta(days=int(round(doy)) - 1)


def season_window(cal: Dict[str, Any], harvest_year: int) -> Tuple[date, date]:
    """Calendar dates of a crop's occupancy of the field for the crop year ending at `harvest_year`."""
    sow = doy_to_date(harvest_year - 1 if cal["winter_sown"] else harvest_year, cal["sow_median_doy"])
    harvest = doy_to_date(harvest_year, cal["harvest_median_doy"])
    return sow, harvest


def _percentile(values: List[float], q: float) -> float:
    s = sorted(values)
    if not s:
        raise ValueError("empty")
    k = (len(s) - 1) * q
    f = int(k)
    c = min(f + 1, len(s) - 1)
    return s[f] + (s[c] - s[f]) * (k - f)


def heat_suitability(t_mean: float, topmx: float, tmax: float) -> float:
    """EcoCrop upper temperature side: 1 up to the optimum maximum, falling linearly to 0 at the absolute maximum."""
    if t_mean <= topmx:
        return 1.0
    if t_mean >= tmax:
        return 0.0
    return (tmax - t_mean) / (tmax - topmx)


def trapezoid(x: float, absolute_min: float, opt_min: float, opt_max: float, absolute_max: float) -> float:
    if x <= absolute_min or x >= absolute_max:
        return 0.0
    if x < opt_min:
        return (x - absolute_min) / (opt_min - absolute_min)
    if x <= opt_max:
        return 1.0
    return (absolute_max - x) / (absolute_max - opt_max)


def crop_climate(lat: float, lon: float, crop: Dict[str, Any], years: List[int], store: Optional[PlannerStore] = None) -> Dict[str, Any]:
    """
    Season statistics of one crop at one location from cached POWER daily data.
    crop: {"calendar": {...}, "ecocrop": {...}}
    Returns per-year values and the aggregates the scorer uses. Years with incomplete cover are dropped and counted.
    """
    store = store or planner_store
    key = point_key(lat, lon)
    cal, eco = crop["calendar"], crop["ecocrop"]
    per_year: List[Dict[str, Any]] = []
    for y in years:
        s, e = season_window(cal, y)
        rows = store.power_range(key, s.isoformat(), e.isoformat())
        n_expected = (e - s).days + 1
        t = [r["t2m"] for r in rows if r["t2m"] is not None]
        p = [r["precip"] for r in rows if r["precip"] is not None]
        if len(rows) < 0.95 * n_expected or len(t) < 0.95 * n_expected or len(p) < 0.95 * n_expected:
            continue

        # frost: winter crops in their rest period (1 Dec - 28 Feb), spring crops in the first 30 days after sowing
        if cal["winter_sown"]:
            f0, f1 = date(y - 1, 12, 1), date(y, 2, 28)
            kt = eco.get("killing_temp_rest")
        else:
            f0 = doy_to_date(y, cal["sow_median_doy"])
            f1 = f0 + timedelta(days=30)
            kt = eco.get("killing_temp_early")
        frost_rows = store.power_range(key, f0.isoformat(), f1.isoformat())
        mins = [r["tmin"] for r in frost_rows if r["tmin"] is not None]
        frost_min = min(mins) if len(mins) >= 0.9 * ((f1 - f0).days + 1) else None

        per_year.append({
            "year": y, "days": len(rows),
            "precip_mm": round(sum(p), 1),
            "rain_suitability": trapezoid(sum(p), eco["rmin"], eco["ropmn"], eco["ropmx"], eco["rmax"]),
            "mean_heat_suitability": mean(heat_suitability(v, eco["topmx"], eco["tmax"]) for v in t),
            "days_above_optimum": sum(1 for v in t if v > eco["topmx"]),
            "frost_min_c": frost_min, "killing_temp_c": kt,
        })

    if not per_year:
        return {"available": False, "reason": "No complete POWER seasons are stored for this location.", "years_used": [], "years_dropped": len(years)}

    p_list = [y["precip_mm"] for y in per_year]
    p20 = _percentile(p_list, 0.2)
    frost_known = [y for y in per_year if y["frost_min_c"] is not None and y["killing_temp_c"] is not None]
    frost_survival = None if not frost_known else sum(1 for y in frost_known if y["frost_min_c"] >= y["killing_temp_c"]) / len(frost_known)
    return {
        "available": True,
        "years_used": [y["year"] for y in per_year],
        "years_dropped": len(years) - len(per_year),
        "precip_mean_mm": round(mean(p_list), 1),
        "precip_p20_mm": round(p20, 1),
        # EcoCrop rainfall trapezoid applied to every season and averaged, so dry years count without a cliff at the minimum.
        "rain_adequacy": mean(y["rain_suitability"] for y in per_year),
        "heat_suitability": mean(y["mean_heat_suitability"] for y in per_year),
        "days_above_optimum_mean": round(mean(y["days_above_optimum"] for y in per_year), 1),
        "frost_survival": frost_survival,
        "frost_years_judged": len(frost_known),
        "frost_note": None if frost_survival is not None else "EcoCrop gives no killing temperature for this crop and stage, or the frost period is not covered by stored data.",
        "per_year": per_year,
        "season_days": (season_window(cal, years[-1])[1] - season_window(cal, years[-1])[0]).days,
    }


def monthly_climatology(lat: float, lon: float, years: List[int], heavy_mm: float, store: Optional[PlannerStore] = None) -> Dict[str, Any]:
    """Monthly mean precipitation, heavy-rain-day frequency and frost-day frequency over the stored years."""
    store = store or planner_store
    key = point_key(lat, lon)
    months = {m: {"precip": [], "heavy": [], "frost": [], "n_years": 0} for m in range(1, 13)}
    used_years = []
    for y in years:
        rows = store.power_range(key, f"{y}-01-01", f"{y}-12-31")
        if len(rows) < 360:
            continue
        used_years.append(y)
        for m in range(1, 13):
            mr = [r for r in rows if int(r["day"][5:7]) == m]
            ps = [r["precip"] for r in mr if r["precip"] is not None]
            ts = [r["tmin"] for r in mr if r["tmin"] is not None]
            if len(ps) < 0.9 * len(mr) or not mr:
                continue
            months[m]["precip"].append(sum(ps))
            months[m]["heavy"].append(sum(1 for v in ps if v >= heavy_mm))
            months[m]["frost"].append(1.0 if any(v < 0.0 for v in ts) else 0.0)
            months[m]["n_years"] += 1
    if not used_years:
        return {"available": False, "reason": "No complete POWER years stored for this location.", "months": {}}
    out = {}
    for m, d in months.items():
        if d["n_years"] == 0:
            out[m] = None
            continue
        out[m] = {
            "precip_mm": round(mean(d["precip"]), 1),
            "heavy_rain_days": round(mean(d["heavy"]), 2),
            "frost_month_share": round(mean(d["frost"]), 2),
            "years": d["n_years"],
        }
    return {"available": True, "years_used": used_years, "months": out, "source": SOURCE}
