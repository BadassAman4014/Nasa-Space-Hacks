"""
TEST FIXTURES ONLY. Nothing in this file is imported by application code.

It builds small, clearly artificial weather and soil inputs so the planner's arithmetic can be tested without the network.
"""

from __future__ import annotations

import math
from datetime import date
from pathlib import Path
from typing import Any, Dict, List, Optional

from app.services.crop_planner import climate, scoring, signals as sig, soilwater
from app.services.crop_planner.store import PlannerStore
from app.services.nasa.real.store import point_key

LAT, LON = 51.77, 14.28


def power_year_rows(year: int, base: float = 9.0, amp: float = 10.0, rain_mm: float = 1.6, hot_boost: float = 0.0):
    rows = []
    d = date(year, 1, 1)
    while d.year == year:
        doy = d.timetuple().tm_yday
        t = base + amp * math.sin(2 * math.pi * (doy - 110) / 365) + (hot_boost if d.month in (6, 7, 8) else 0.0)
        rows.append((d.isoformat(), t, t + 5, t - 5, rain_mm, 1.0))
        d = date.fromordinal(d.toordinal() + 1)
    return rows


def make_store(tmp_path: Path, **weather) -> PlannerStore:
    store = PlannerStore(tmp_path / "planner_test.db")
    key = point_key(LAT, LON)
    for y in range(climate.last_complete_year() - 10, climate.last_complete_year() + 1):
        store.save_power_year(key, y, power_year_rows(y, **weather))
    return store


def soil_signal(sand: float = 80.0, silt: float = 15.0, clay: float = 5.0, provenance: str = "cached") -> Dict[str, Any]:
    ms = [{"property_name": p, "depth_interval": d, "mean_value": v} for d, _, _ in soilwater.LAYERS for p, v in (("sand", sand), ("silt", silt), ("clay", clay))]
    layers = soilwater.layers_from_measurements(ms)
    return sig.make_signal("soil", "Soil", value=layers[2].get("usda_class"), source="test", provenance=provenance, as_of="2026-01-01", detail={"layers": layers})


def signals_bundle(store: PlannerStore, sand: float = 80.0, esi: Optional[float] = None, climate_ok: bool = True) -> Dict[str, Dict[str, Any]]:
    U = lambda name, why="not stored in test": sig.unavailable_signal(name, name, "test", why)  # noqa: E731
    return {
        "slope": sig.make_signal("slope", "slope", value=3.0, unit="deg", source="test", provenance="cached", as_of="2026-01-01", detail={"max_slope_deg": 6.0, "mean_slope_pct": 5.2, "mean_elevation_m": 80.0}),
        "rain_extremes": sig.make_signal("rain_extremes", "rain", value=4, unit="days", source="test", provenance="cached", as_of="2026-11-13"),
        "bare_soil": U("bare_soil"),
        "evaporative_stress": sig.make_signal("evaporative_stress", "esi", value=esi, source="test", provenance="cached", as_of="2026-08-01", detail={"overpasses": [{"date": "2026-08-01", "mean": esi, "valid_share": 0.9}]}) if esi is not None else U("evaporative_stress", "no overpass"),
        "root_zone_moisture": U("root_zone_moisture"),
        "soil": soil_signal(sand=sand, silt=max(0.0, 100.0 - sand - 5.0), clay=5.0),
        "climate": sig.make_signal("climate", "climate", value=11, source="test", provenance="cached", as_of="2026-11-15", detail={}) if climate_ok else U("climate", "no POWER years"),
    }


def build_ctx(tmp_path: Path, priority: str = "save_water", irrigation: str = "rainfed", sand: float = 80.0, esi: Optional[float] = None, climate_ok: bool = True, **weather):
    store = make_store(tmp_path, **weather)
    s = signals_bundle(store, sand=sand, esi=esi, climate_ok=climate_ok)
    farmer = {"priority": priority, "irrigation": irrigation, "soil_texture": None}
    return scoring.build_context(s, farmer, LAT, LON, store), s, store
