"""
CAP eco-scheme ÖR 2 (diverse crops in arable farming): simple rule check.

ÖR 2 is judged for the whole farm in one year: at least five main crop species, including at least 10 % grain
legumes of the arable area. One field cannot meet it alone. This module therefore (a) tells what a field's crop
contributes and (b) evaluates the farm when every field's crop for that year is known. When any field's crop
is unknown, the result is 'not_evaluable' and says so. No premium amount is shown (no current rate verified).
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from app.services.crop_planner import profiles


def field_contribution(crop: str) -> Dict[str, Any]:
    legume = bool(profiles.attr(crop, "grain_legume")) if crop in profiles.crop_ids() else False
    return {"crop": crop, "counts_as_main_crop_species": crop not in ("other", "fallow_or_grass"), "grain_legume": legume}


def evaluate_farm(fields: List[Dict[str, Any]], year: int) -> Dict[str, Any]:
    """
    fields: [{"field_id", "area_ha", "crop": crop_id or None}] for one year.
    """
    rule = profiles.load_policy()["eco_scheme_or2"]
    src = rule["source"]
    base = {
        "year": year,
        "rule": {"label": rule["label_en"], "level": rule["level"], "verify": rule["verify"], "source_name": src["name"], "source_url": src["url"], "retrieved": src["retrieved"]},
        "premium_note": rule["premium_note"],
    }
    unknown = [f["field_id"] for f in fields if not f.get("crop") or f["crop"] in ("other",)]
    if not fields:
        return {**base, "status": "not_evaluable", "reason": "The farm has no fields."}
    if unknown:
        return {**base, "status": "not_evaluable", "reason": f"{len(unknown)} of {len(fields)} fields have no crop entered for {year}, so the farm cannot be judged.", "unknown_fields": unknown}

    area = sum(float(f["area_ha"]) for f in fields)
    species = {f["crop"] for f in fields if f["crop"] != "fallow_or_grass"}
    legume_area = sum(float(f["area_ha"]) for f in fields if f["crop"] in profiles.crop_ids() and profiles.attr(f["crop"], "grain_legume"))
    share = 100.0 * legume_area / area if area else 0.0
    ok_species = len(species) >= int(rule["min_main_crop_species"])
    ok_legume = share >= float(rule["min_grain_legume_share_pct"])
    return {
        **base,
        "status": "met" if ok_species and ok_legume else "not_met",
        "main_crop_species": len(species),
        "required_species": rule["min_main_crop_species"],
        "grain_legume_share_pct": round(share, 1),
        "required_legume_share_pct": rule["min_grain_legume_share_pct"],
        "reason": None if ok_species and ok_legume else "; ".join(
            x for x in (
                None if ok_species else f"{len(species)} main crop species, {rule['min_main_crop_species']} needed",
                None if ok_legume else f"grain legumes on {share:.1f} % of the area, {rule['min_grain_legume_share_pct']} % needed",
            ) if x
        ),
    }
