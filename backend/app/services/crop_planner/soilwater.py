"""
Plant-available water in the root zone from SoilGrids sand/silt/clay per depth layer and the FAO-56 Table 19
water characteristics by USDA texture class (data/soil_reference.json).

Layers without a published table row (sandy clay loam, clay loam, sandy clay) give no value. The result is
'unavailable' for a root zone that includes such a layer. Peat (Moorboden) soils are outside the table.
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, List, Optional

from app.services.crop_planner.profiles import DATA_DIR

#: SoilGrids standard depth intervals in cm.
LAYERS = [("0-5cm", 0, 5), ("5-15cm", 5, 15), ("15-30cm", 15, 30), ("30-60cm", 30, 60), ("60-100cm", 60, 100), ("100-200cm", 100, 200)]

#: Farmer texture groups and the USDA classes that fit each (a consistency check, not a conversion).
FARMER_TEXTURE_CLASSES = {
    "sandboden": {"Sand", "Loamy Sand", "Sandy Loam"},
    "lehmboden": {"Sandy Loam", "Loam", "Silt Loam", "Silt", "Sandy Clay Loam", "Clay Loam"},
    "tonboden": {"Clay", "Silty Clay", "Sandy Clay", "Silty Clay Loam", "Clay Loam"},
    "moorboden": set(),
}


@lru_cache(maxsize=1)
def reference() -> Dict[str, Any]:
    with (Path(DATA_DIR) / "soil_reference.json").open(encoding="utf-8") as fh:
        return json.load(fh)


def awc_for_class(usda_class: str) -> Optional[Dict[str, Any]]:
    row = reference()["available_water"]["by_usda_class"].get(usda_class)
    if not row:
        return None
    lo, hi = row["awc"]
    return {"awc_range_m3m3": [lo, hi], "awc_mid_m3m3": round((lo + hi) / 2.0, 4)}


def layers_from_measurements(measurements: List[Any]) -> List[Dict[str, Any]]:
    """Group SoilGrids measurements (objects or dicts) by depth and attach the USDA class and water characteristics."""
    from app.services.soilgrids.statistics import get_usda_texture

    by_depth: Dict[str, Dict[str, float]] = {}
    for m in measurements:
        get = (lambda k: m[k]) if isinstance(m, dict) else (lambda k: getattr(m, k))
        name = str(get("property_name")).lower()
        key = "sand" if "sand" in name else "silt" if "silt" in name else "clay" if "clay" in name else None
        if key:
            by_depth.setdefault(str(get("depth_interval")), {})[key] = float(get("mean_value"))
    out = []
    for depth, lo, hi in LAYERS:
        v = by_depth.get(depth)
        if not v or not {"sand", "silt", "clay"} <= set(v):
            out.append({"depth": depth, "from_cm": lo, "to_cm": hi, "available": False, "reason": "SoilGrids has no sand/silt/clay value for this layer."})
            continue
        cls = get_usda_texture(v["sand"], v["silt"], v["clay"])
        w = awc_for_class(cls)
        out.append({
            "depth": depth, "from_cm": lo, "to_cm": hi, "sand_pct": round(v["sand"], 1), "silt_pct": round(v["silt"], 1), "clay_pct": round(v["clay"], 1),
            "usda_class": cls, "available": w is not None, **(w or {"reason": f"FAO-56 Table 19 has no row for {cls}."}),
        })
    return out


def available_water_to_depth(layers: List[Dict[str, Any]], depth_m: float) -> Dict[str, Any]:
    """Plant-available water (mm) in the top `depth_m` of soil. Unavailable if any layer in that depth lacks a table row."""
    d_cm = depth_m * 100.0
    mid = lo_mm = hi_mm = 0.0
    used = []
    for L in layers:
        if L["from_cm"] >= d_cm:
            break
        thick = min(L["to_cm"], d_cm) - L["from_cm"]
        if not L.get("available"):
            return {"available": False, "reason": f"Layer {L['depth']} has no water value: {L.get('reason')}", "depth_m": depth_m}
        a_lo, a_hi = L["awc_range_m3m3"]
        mid += L["awc_mid_m3m3"] * thick * 10.0  # m3/m3 x cm x 10 = mm
        lo_mm += a_lo * thick * 10.0
        hi_mm += a_hi * thick * 10.0
        used.append(L["depth"])
    return {"available": True, "depth_m": depth_m, "awc_mm": round(mid, 1), "awc_range_mm": [round(lo_mm, 1), round(hi_mm, 1)], "layers": used}


def texture_check(farmer_texture: Optional[str], topsoil_class: Optional[str]) -> Optional[Dict[str, Any]]:
    if not farmer_texture:
        return None
    if farmer_texture == "moorboden":
        return {"farmer": farmer_texture, "consistent": None, "note": "Peat soils are outside the FAO-56 water table, so no plant-available water is calculated for this field."}
    if not topsoil_class:
        return {"farmer": farmer_texture, "consistent": None, "note": "No SoilGrids class to compare with."}
    ok = topsoil_class in FARMER_TEXTURE_CLASSES.get(farmer_texture, set())
    return {"farmer": farmer_texture, "satellite_class": topsoil_class, "consistent": ok,
            "note": None if ok else f"You entered {farmer_texture}, SoilGrids (250 m) suggests {topsoil_class}. The calculation uses the SoilGrids layers; check your soil analysis."}
