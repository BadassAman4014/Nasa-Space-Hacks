"""
Rule-based 4-axis scoring: water resilience, soil cover, nitrogen balance, heat tolerance.

Each axis is 100 x sum(w_i * f_i) / sum(w_i) over factors f_i in [0, 1]. Every factor keeps its inputs, its
source and a one-line effect, so an explanation can quote it. The weights are model parameters
(data/scoring_weights.json), the crop numbers come from the sourced crop table, the field numbers from
real signals.

Required inputs missing  ->  the axis is 'not_scored' with a reason (never a default value).
Optional inputs missing  ->  the axis is 'partial': the remaining weights are renormalised and the missing
                              factor is listed.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from app.services.crop_planner import climate, profiles, rotation
from app.services.policy import dbe

AXES = ("water", "soil_cover", "nitrogen", "heat")
AXIS_LABEL = {"water": "Water resilience", "soil_cover": "Soil cover", "nitrogen": "Nitrogen balance", "heat": "Heat tolerance"}


def _factor(fid: str, label: str, weight: float, value: Optional[float], inputs: Dict[str, Any], source: str, effect_text: Optional[str] = None, optional: bool = False, missing_reason: Optional[str] = None) -> Dict[str, Any]:
    v = None if value is None else max(0.0, min(1.0, float(value)))
    if v is None:
        effect = "not available"
    elif v >= 0.66:
        effect = "supports"
    elif v >= 0.33:
        effect = "mixed"
    else:
        effect = "limits"
    return {"id": fid, "label": label, "weight": weight, "value": None if v is None else round(v, 3), "inputs": inputs, "source": source,
            "effect": effect, "text": effect_text, "optional": optional, "missing_reason": missing_reason}


def _combine(axis: str, factors: List[Dict[str, Any]]) -> Dict[str, Any]:
    missing_required = [f for f in factors if f["value"] is None and not f["optional"]]
    missing_optional = [f for f in factors if f["value"] is None and f["optional"]]
    if missing_required:
        return {"axis": axis, "label": AXIS_LABEL[axis], "score": None, "status": "not_scored", "coverage": 0.0, "factors": factors,
                "reason": "; ".join(f"{f['label']}: {f['missing_reason'] or 'input unavailable'}" for f in missing_required)}
    avail = [f for f in factors if f["value"] is not None]
    total = sum(f["weight"] for f in avail)
    score = 100.0 * sum(f["weight"] * f["value"] for f in avail) / total
    full = sum(f["weight"] for f in factors)
    return {"axis": axis, "label": AXIS_LABEL[axis], "score": round(score, 1), "status": "partial" if missing_optional else "scored",
            "coverage": round(total / full, 2), "factors": factors,
            "reason": None if not missing_optional else "Scored without: " + "; ".join(f"{f['label']} ({f['missing_reason'] or 'unavailable'})" for f in missing_optional)}


# ------------------------------------------------------------------------------------------ context
def build_context(signals: Dict[str, Dict[str, Any]], farmer: Dict[str, Any], lat: float, lon: float, store, years: Optional[List[int]] = None) -> Dict[str, Any]:
    W = profiles.load_weights()
    years = years or climate.climate_years(int(W["climate_window"]["years"]))
    clim_ok = signals["climate"]["provenance"] != "unavailable"
    monthly = climate.monthly_climatology(lat, lon, years, float(W["heavy_rain_mm_day"]["value"]), store=store) if clim_ok else {"available": False, "reason": signals["climate"]["reason"], "months": {}}
    soil = signals["soil"]
    layers = soil["detail"].get("layers") if soil["provenance"] != "unavailable" else None
    sand_top = None
    if layers:
        parts = [(L.get("sand_pct"), L["to_cm"] - L["from_cm"]) for L in layers if L["to_cm"] <= 30]
        if parts and all(p[0] is not None for p in parts):
            sand_top = sum(s * t for s, t in parts) / sum(t for _, t in parts)
    esi = signals["evaporative_stress"]
    return {
        "weights": W, "years": years, "lat": lat, "lon": lon, "store": store,
        "priority": farmer.get("priority"), "irrigated": farmer.get("irrigation") == "irrigated",
        "peat": farmer.get("soil_texture") == "moorboden",
        "signals": signals, "monthly": monthly, "layers": layers, "sand_topsoil_pct": sand_top,
        "esi": esi["value"] if esi["provenance"] != "unavailable" else None,
        "_climate_cache": {},
        "n_ref": max([profiles.attr(c, "duev_n_requirement")["n_kg_ha"] for c in profiles.crop_ids() if profiles.attr(c, "duev_n_requirement")]),
    }


def crop_climate_for(ctx: Dict[str, Any], crop: str) -> Dict[str, Any]:
    cache = ctx["_climate_cache"]
    if crop not in cache:
        if ctx["signals"]["climate"]["provenance"] == "unavailable":
            cache[crop] = {"available": False, "reason": ctx["signals"]["climate"]["reason"]}
        else:
            cache[crop] = climate.crop_climate(ctx["lat"], ctx["lon"], {"calendar": profiles.calendar(crop), "ecocrop": profiles.attr(crop, "ecocrop")}, ctx["years"], store=ctx["store"])
    return cache[crop]


def _src_eco(crop: str) -> str:
    s = profiles.attr_source(crop, "ecocrop")
    return f"FAO EcoCrop ({s['ref']}) + NASA POWER"


# ------------------------------------------------------------------------------------------ axes
def water_axis(ctx: Dict[str, Any], crop: str) -> Dict[str, Any]:
    W = ctx["weights"]["factor_weights"]["water"]
    eco = profiles.attr(crop, "ecocrop")
    if ctx["irrigated"]:
        note = "Farmer reports irrigation access; the rainfall deficit is assumed to be covered. The amount of water available is not known."
        factors = [
            _factor("rain_adequacy", "Rain adequacy", W["rain_adequacy"], 1.0, {"irrigation": "irrigated"}, "Farmer input", note),
            _factor("soil_water_buffer", "Soil water buffer", W["soil_water_buffer"], 1.0, {"irrigation": "irrigated"}, "Farmer input", note),
        ]
        return _combine("water", factors)

    cc = crop_climate_for(ctx, crop)
    if cc["available"]:
        p20 = cc["precip_p20_mm"]
        rain = _factor("rain_adequacy", "Rain adequacy", W["rain_adequacy"], cc["rain_adequacy"],
                       {"season_precip_p20_mm": p20, "season_precip_mean_mm": cc["precip_mean_mm"], "ecocrop_rmin": eco["rmin"], "ecocrop_ropmn": eco["ropmn"], "years": len(cc["years_used"])},
                       _src_eco(crop), f"The crop's season brings {cc['precip_mean_mm']:.0f} mm on average and {p20:.0f} mm in a dry year (20th percentile of {len(cc['years_used'])} seasons); EcoCrop's minimum is {eco['rmin']:.0f} mm and its optimum starts at {eco['ropmn']:.0f} mm.")
    else:
        rain = _factor("rain_adequacy", "Rain adequacy", W["rain_adequacy"], None, {}, "NASA POWER", missing_reason=cc["reason"])

    depth = profiles.attr(crop, "rooting_depth_m")["min"]
    if ctx["peat"]:
        buf = _factor("soil_water_buffer", "Soil water buffer", W["soil_water_buffer"], None, {}, "FAO-56 Table 19", missing_reason="peat soil is outside the FAO-56 water table")
    elif not ctx["layers"]:
        buf = _factor("soil_water_buffer", "Soil water buffer", W["soil_water_buffer"], None, {}, "SoilGrids + FAO-56", missing_reason=ctx["signals"]["soil"]["reason"] or "soil layers unavailable")
    elif not cc["available"]:
        buf = _factor("soil_water_buffer", "Soil water buffer", W["soil_water_buffer"], None, {}, "SoilGrids + FAO-56", missing_reason="needs the season rainfall")
    else:
        from app.services.crop_planner import soilwater

        aw = soilwater.available_water_to_depth(ctx["layers"], depth)
        if not aw["available"]:
            buf = _factor("soil_water_buffer", "Soil water buffer", W["soil_water_buffer"], None, {"root_depth_m": depth}, "SoilGrids + FAO-56", missing_reason=aw["reason"])
        else:
            deficit = max(0.0, eco["ropmn"] - cc["precip_p20_mm"])
            v = 1.0 if deficit == 0 else min(1.0, aw["awc_mm"] / deficit)
            buf = _factor("soil_water_buffer", "Soil water buffer", W["soil_water_buffer"], v,
                          {"awc_mm": aw["awc_mm"], "awc_range_mm": aw["awc_range_mm"], "root_depth_m": depth, "dry_year_deficit_mm": round(deficit, 1)},
                          "ISRIC SoilGrids + FAO-56 Tables 19 and 22",
                          f"The soil holds about {aw['awc_mm']:.0f} mm of plant-available water to {depth:g} m (range {aw['awc_range_mm'][0]:.0f}-{aw['awc_range_mm'][1]:.0f}); the dry-year gap to EcoCrop's optimum is {deficit:.0f} mm.")
    return _combine("water", [rain, buf])


def _bare_exposure(ctx: Dict[str, Any], occ: List[bool], only_months: Optional[List[int]] = None) -> Optional[float]:
    m = ctx["monthly"]
    if not m["available"]:
        return None
    shares = rotation.month_shares(occ)
    num = den = 0.0
    for mo in range(1, 13):
        if only_months and mo not in only_months:
            continue
        rec = m["months"].get(mo) or m["months"].get(str(mo))
        if rec is None:
            return None
        num += (1.0 - shares[mo]) * rec["precip_mm"]
        den += rec["precip_mm"]
    return None if den == 0 else num / den


def cover_axis(ctx: Dict[str, Any], crop: str, nxt: Optional[str], catch: bool) -> Dict[str, Any]:
    W = ctx["weights"]["factor_weights"]["soil_cover"]
    occ = rotation.occupancy_year(crop, nxt, catch)
    exp = _bare_exposure(ctx, occ)
    if exp is None:
        f = _factor("erosion_weighted_cover", "Cover when it rains", W["erosion_weighted_cover"], None, {}, "NASA POWER + crop calendar", missing_reason=ctx["monthly"].get("reason") or "monthly rainfall unavailable")
    else:
        bare_days = sum(1 for o in occ if not o)
        f = _factor("erosion_weighted_cover", "Cover when it rains", W["erosion_weighted_cover"], 1.0 - exp,
                    {"bare_days_in_year": bare_days, "rain_weighted_bare_share": round(exp, 3), "catch_crop": catch, "successor": nxt},
                    "Crop calendar (Sacks 2010 / LfL / BZL) + NASA POWER monthly rain",
                    f"The field is bare on {bare_days} days of the calendar year; weighted by how much rain falls in those months, {exp * 100:.0f} % of the year's rain falls on uncovered soil.")
    return _combine("soil_cover", [f])


def nitrogen_axis(ctx: Dict[str, Any], crop: str, prev: Optional[str], nxt: Optional[str], catch: bool) -> Dict[str, Any]:
    W = ctx["weights"]["factor_weights"]["nitrogen"]
    req = profiles.attr(crop, "duev_n_requirement")
    ded = dbe.previous_crop_deduction(prev) if prev else {"kg": None, "known": False}
    if req is None:
        need, v, text = 0.0, 1.0, f"{profiles.label(crop)} is a grain legume and has no mineral N requirement value in DüV Anlage 4; it fixes its own nitrogen."
    else:
        credit = float(ded["kg"]) if ded["known"] else 0.0
        need = max(0.0, req["n_kg_ha"] - credit)
        v = 1.0 - need / ctx["n_ref"]
        text = f"DüV Table 2 N requirement {req['n_kg_ha']} kg N/ha" + (f", minus {credit:g} kg N/ha previous-crop deduction (Table 7)" if ded["known"] else ", previous crop unknown so no deduction") + f", against the highest value in the crop table ({ctx['n_ref']} kg N/ha)."
    need_f = _factor("fertiliser_need", "Mineral fertiliser need", W["fertiliser_need"], v, {"n_requirement_net_kg_ha": round(need, 1), "previous_crop_deduction_kg_ha": ded["kg"], "n_ref_kg_ha": ctx["n_ref"]}, "DüV Anlage 4 Tables 2 and 7", text)

    sand = ctx["sand_topsoil_pct"]
    occ = rotation.occupancy_year(crop, nxt, catch)
    exp = _bare_exposure(ctx, occ, only_months=ctx["weights"]["percolation_months"]["value"])
    if sand is None or exp is None:
        leach = _factor("leaching_exposure", "Leaching exposure", W["leaching_exposure"], None, {}, "SoilGrids + NASA POWER",
                        missing_reason=("topsoil sand content unavailable" if sand is None else ctx["monthly"].get("reason") or "monthly rainfall unavailable"))
    else:
        vuln = sand / 100.0
        value = 1.0 - exp * vuln
        leach = _factor("leaching_exposure", "Leaching exposure", W["leaching_exposure"], value,
                        {"topsoil_sand_pct": round(sand, 1), "bare_share_of_percolation_rain": round(exp, 3), "catch_crop": catch},
                        "SoilGrids sand (0-30 cm) + NASA POWER rain Oct-Mar + crop calendar",
                        f"{exp * 100:.0f} % of the Oct-Mar rain falls on uncovered soil; with {sand:.0f} % sand in the topsoil, nitrate can move down quickly.")
    return _combine("nitrogen", [need_f, leach])


def heat_axis(ctx: Dict[str, Any], crop: str) -> Dict[str, Any]:
    W = ctx["weights"]["factor_weights"]["heat"]
    eco = profiles.attr(crop, "ecocrop")
    cc = crop_climate_for(ctx, crop)
    if cc["available"]:
        temp = _factor("temperature_suitability", "Heat suitability", W["temperature_suitability"], cc["heat_suitability"],
                       {"ecocrop_topmx_c": eco["topmx"], "ecocrop_tmax_c": eco["tmax"], "days_above_optimum_mean": cc["days_above_optimum_mean"], "years": len(cc["years_used"])},
                       _src_eco(crop), f"On average {cc['days_above_optimum_mean']:.0f} days per season are warmer than the crop's optimum maximum of {eco['topmx']:.0f} deg C (absolute maximum {eco['tmax']:.0f} deg C).")
        if cc["frost_survival"] is None:
            frost = _factor("frost_survival", "Frost survival", W["frost_survival"], None, {}, "FAO EcoCrop + NASA POWER", optional=True, missing_reason=cc["frost_note"])
        else:
            frost = _factor("frost_survival", "Frost survival", W["frost_survival"], cc["frost_survival"],
                            {"years_judged": cc["frost_years_judged"], "killing_temp_c": cc["per_year"][-1]["killing_temp_c"]}, "FAO EcoCrop + NASA POWER",
                            f"In {round(cc['frost_survival'] * cc['frost_years_judged'])} of {cc['frost_years_judged']} years the coldest night in the vulnerable period stayed above the crop's killing temperature.", optional=True)
    else:
        temp = _factor("temperature_suitability", "Heat suitability", W["temperature_suitability"], None, {}, "NASA POWER", missing_reason=cc["reason"])
        frost = _factor("frost_survival", "Frost survival", W["frost_survival"], None, {}, "NASA POWER", optional=True, missing_reason=cc["reason"])

    esi = ctx["esi"]
    if esi is None:
        ef = _factor("field_evaporative_stress", "Field summer stress", W["field_evaporative_stress"], None, {}, "NASA ECOSTRESS", optional=True, missing_reason=ctx["signals"]["evaporative_stress"]["reason"])
    else:
        occ = rotation.occupancy_year(crop, None, False)
        overlap = sum(1 for d in rotation.SUMMER_DOYS if occ[d - 1]) / len(rotation.SUMMER_DOYS)
        ef = _factor("field_evaporative_stress", "Field summer stress", W["field_evaporative_stress"], 1.0 - overlap * (1.0 - esi),
                     {"esi_summer_mean": esi, "summer_overlap_share": round(overlap, 2)}, "NASA ECOSTRESS ESI",
                     f"The crop stands in the field on {overlap * 100:.0f} % of June-August; ECOSTRESS measured a summer ESI of {esi:.2f} (1 = no stress).", optional=True)
    return _combine("heat", [temp, frost, ef])


# ------------------------------------------------------------------------------------------ one crop-year
def unscored_year(prev: Optional[str], crop: str, nxt: Optional[str]) -> Dict[str, Any]:
    """A crop without a complete sourced profile is never guessed at: every axis is not scored."""
    if crop in profiles.crop_ids():
        why = "no sourced value for: " + ", ".join(profiles.get_crop(crop)["scoring"]["missing"])
    else:
        why = "not a crop with a profile"
    axes = {a: {"axis": a, "label": AXIS_LABEL[a], "score": None, "status": "not_scored", "coverage": 0.0, "factors": [], "reason": f"{profiles.label(crop)}: {why}"} for a in AXES}
    return {"crop": crop, "previous": prev, "successor": nxt, "catch_crop": False, "axes": axes, "overall": None, "overall_reason": "crop not scored", "axes_used": []}


def score_year(ctx: Dict[str, Any], prev: Optional[str], crop: str, nxt: Optional[str], catch: bool = False) -> Dict[str, Any]:
    if crop not in profiles.eligible_crop_ids():
        return unscored_year(prev, crop, nxt)
    axes = {
        "water": water_axis(ctx, crop),
        "soil_cover": cover_axis(ctx, crop, nxt, catch),
        "nitrogen": nitrogen_axis(ctx, crop, prev, nxt, catch),
        "heat": heat_axis(ctx, crop),
    }
    return {"crop": crop, "previous": prev, "successor": nxt, "catch_crop": catch, "axes": axes, **overall(ctx, axes)}


def overall(ctx: Dict[str, Any], axes: Dict[str, Dict[str, Any]], restrict: Optional[List[str]] = None) -> Dict[str, Any]:
    pw = ctx["weights"]["priority_axis_weights"].get(ctx.get("priority") or "", None)
    if pw is None:
        return {"overall": None, "overall_reason": "Top priority not entered, so the axes cannot be weighted.", "axes_used": []}
    use = [a for a in AXES if axes[a]["score"] is not None and (restrict is None or a in restrict)]
    if not use:
        return {"overall": None, "overall_reason": "No axis could be scored.", "axes_used": []}
    tot = sum(pw[a] for a in use)
    return {"overall": round(sum(pw[a] * axes[a]["score"] for a in use) / tot, 1), "overall_reason": None, "axes_used": use}
