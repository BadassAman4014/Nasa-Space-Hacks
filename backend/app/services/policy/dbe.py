"""
Nitrogen fertiliser requirement (Düngebedarfsermittlung) following DüV Anlage 4, Tabelle 1.

requirement = N requirement value (Table 2)
            + yield correction (Table 3, from the farm's own 5-year average yield)
            - previous crop deduction (Table 7)
            - humus deduction (Table 6)
            - Nmin (measured in spring)

Nothing is estimated. Where the law needs a farm figure (5-year yield, Nmin, humus) and the farmer has not
entered it, the line is shown as 'not applied' and the result is labelled accordingly. Red-area status
(additional 20 % reduction under DüV §13a) is not known and is not applied.

This is a planning aid, not the legal Düngebedarfsermittlung. The farm must make its own calculation.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from app.services.crop_planner import profiles


def _line(label: str, kg: Optional[float], ref: str, applied: bool, note: Optional[str] = None) -> Dict[str, Any]:
    return {"label": label, "kg_n_ha": kg, "ref": ref, "applied": applied, "note": note}


def previous_crop_deduction(prev_crop: Optional[str]) -> Dict[str, Any]:
    if prev_crop is None or prev_crop in ("other", "fallow_or_grass"):
        return {"kg": None, "ref": "Table 7", "known": False}
    if prev_crop == "catch_crop":
        cc = profiles.load_profiles()["cover_crop"]["duev_previous_crop_deduction_kg_n_ha"]
        return {"kg": cc["value"], "ref": "Table 7: " + cc["ref"], "known": True}
    kg = profiles.attr(prev_crop, "duev_previous_crop_deduction_kg_n_ha")
    if kg is None:
        return {"kg": None, "ref": "Table 7", "known": False}
    a = profiles.get_crop(prev_crop)["attributes"]["duev_previous_crop_deduction_kg_n_ha"]
    return {"kg": kg, "ref": a["ref"], "known": True}


def requirement(
    crop: str,
    previous_crop: Optional[str],
    farm_yield_5yr_avg: Optional[float] = None,
    nmin_kg_ha: Optional[float] = None,
    humus_pct: Optional[float] = None,
) -> Dict[str, Any]:
    """Fertiliser requirement for one crop-year."""
    req = profiles.attr(crop, "duev_n_requirement")
    label = profiles.label(crop)
    deduction_for_next = previous_crop_deduction(crop)

    if req is None:
        known = crop in profiles.crop_ids()
        return {
            "crop": crop,
            "available": False,
            "reason": (f"DüV Anlage 4 Table 2 has no N requirement value for {label}, so no mineral N figure can be calculated here."
                       if known else f"'{label}' is not in the crop table, so no DüV value is available."),
            "lines": [],
            "requirement_before_nmin_kg_n_ha": None,
            "legal_max_kg_n_ha": None,
            "credit_to_next_crop_kg_n_ha": deduction_for_next["kg"],
            "credit_ref": deduction_for_next["ref"],
            "source": profiles.attr_source(crop, "duev_n_requirement"),
            "caveats": [],
        }

    lines: List[Dict[str, Any]] = [
        _line(f"N requirement value {label} at {req['reference_yield']:g} {req['yield_unit']} (Table 2)", float(req["n_kg_ha"]), "Table 2", True)
    ]

    if farm_yield_5yr_avg is None:
        lines.append(_line("Yield correction (Table 3)", None, "Table 3", False, "Not applied: no 5-year average yield of this farm entered."))
        adj = 0.0
    else:
        diff = float(farm_yield_5yr_avg) - float(req["reference_yield"])
        steps = abs(diff) / float(req["yield_step"])
        if diff >= 0:
            adj = min(float(req["max_up_kg"]), int(steps) * float(req["up_kg_per_step"]))
        else:
            adj = -int(steps) * float(req["down_kg_per_step"])
        lines.append(_line(f"Yield correction: farm average {farm_yield_5yr_avg:g} vs {req['reference_yield']:g} {req['yield_unit']} (Table 3)", adj, "Table 3", True))

    prev = previous_crop_deduction(previous_crop)
    if prev["known"]:
        lines.append(_line(f"Previous crop deduction ({profiles.label(previous_crop) if previous_crop in profiles.crop_ids() else previous_crop})", -float(prev["kg"]), prev["ref"], True))
        pc = float(prev["kg"])
    else:
        lines.append(_line("Previous crop deduction (Table 7)", None, "Table 7", False, "Not applied: previous crop unknown."))
        pc = 0.0

    if humus_pct is not None and humus_pct > 4.0:
        lines.append(_line(f"Humus {humus_pct:.1f} % (> 4.0 %)", -20.0, "Table 6", True))
        hd = 20.0
    else:
        hd = 0.0
        if humus_pct is None:
            lines.append(_line("Humus deduction (Table 6)", None, "Table 6", False, "Not applied: humus content not entered."))

    before_nmin = max(0.0, float(req["n_kg_ha"]) + adj - pc - hd)
    legal_max: Optional[float]
    if nmin_kg_ha is None:
        lines.append(_line("Nmin 0-90 cm in spring", None, "§4 DüV", False, "Not applied: measure Nmin before sowing or use your state's Nmin service."))
        legal_max = None
    else:
        lines.append(_line("Nmin 0-90 cm in spring (farmer input)", -float(nmin_kg_ha), "§4 DüV", True))
        legal_max = max(0.0, before_nmin - float(nmin_kg_ha))

    return {
        "crop": crop,
        "available": True,
        "reason": None,
        "lines": lines,
        "requirement_before_nmin_kg_n_ha": round(before_nmin, 1),
        "legal_max_kg_n_ha": None if legal_max is None else round(legal_max, 1),
        "credit_to_next_crop_kg_n_ha": deduction_for_next["kg"],
        "credit_ref": deduction_for_next["ref"],
        "source": profiles.attr_source(crop, "duev_n_requirement"),
        "caveats": [profiles.load_policy()["duev"]["red_area_note"], profiles.load_policy()["duev"]["nmin_note"]],
    }


def plan(entries: List[Dict[str, Any]], previous_crop_before_first: Optional[str] = None, **farm: Any) -> List[Dict[str, Any]]:
    """Requirement for every year of a sequence. The previous-crop deduction carries forward automatically."""
    out = []
    prev = previous_crop_before_first
    for e in sorted(entries, key=lambda x: x["year"]):
        r = requirement(e["crop"], prev, **farm)
        r["year"] = e["year"]
        r["previous_crop"] = prev
        out.append(r)
        prev = e["crop"]
    return out
