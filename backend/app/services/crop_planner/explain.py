"""
"Why this works & Limitations" text for each strategy.

Reasons quote factor texts produced by the scorer, so they contain only values that exist in the field's real signals
and the sourced crop table. Limitations come from the provenance and resolution of the signals actually used, the
verify flags of the crop attributes actually used, the axes that were not scored, and a fixed caveat.
No profit or yield is promised.
"""

from __future__ import annotations

from typing import Any, Dict, List

from app.services.crop_planner import profiles, scoring

FACTOR_SIGNAL = {
    "rain_adequacy": "climate", "temperature_suitability": "climate", "frost_survival": "climate",
    "soil_water_buffer": "soil", "leaching_exposure": "soil", "field_evaporative_stress": "evaporative_stress",
    "erosion_weighted_cover": "climate", "fertiliser_need": None,
}

FIXED_CAVEATS = [
    "Satellite soil moisture is coarse (SMAP 9 km) and says nothing about subsoil water at your field. Check the moisture of the deeper soil yourself before planting.",
    "Check the current CAP / GAP rules with your Landwirtschaftsamt before you decide. Rules differ by year and state, and farm exemptions are not known here.",
    "These scores compare options for this field. They are not a yield or profit forecast. Discuss the result with your agronomist.",
]


def _best_factor(strategy: Dict[str, Any], axis: str) -> Dict[str, Any] | None:
    best = None
    for y in strategy["years"]:
        for f in y["factors"].get(axis, []):
            if f["value"] is None or not f.get("text"):
                continue
            key = f["weight"] * f["value"]
            if best is None or key > best[0]:
                best = (key, y, f)
    return best and {"year": best[1]["year"], "crop": best[1]["crop_label"], "factor": best[2]}


def _weakest_factor(strategy: Dict[str, Any], axis: str) -> Dict[str, Any] | None:
    worst = None
    for y in strategy["years"]:
        for f in y["factors"].get(axis, []):
            if f["value"] is None or not f.get("text"):
                continue
            if worst is None or f["value"] < worst[0]:
                worst = (f["value"], y, f)
    return worst and {"year": worst[1]["year"], "crop": worst[1]["crop_label"], "factor": worst[2]}


def reasons(strategy: Dict[str, Any], baseline: Dict[str, Any], signals: Dict[str, Dict[str, Any]], common_axes: List[str]) -> List[Dict[str, Any]]:
    out = []
    for a in common_axes:
        s, b = strategy["axes"][a]["score"], baseline["axes"][a]["score"]
        if s is None:
            continue
        delta = None if (b is None or strategy["id"] == baseline["id"]) else round(s - b, 1)
        bf = _best_factor(strategy, a)
        if bf is None:
            continue
        sig = FACTOR_SIGNAL.get(bf["factor"]["id"])
        out.append({
            "axis": a, "axis_label": scoring.AXIS_LABEL[a], "score": s, "baseline_score": b, "delta_vs_current": delta,
            "statement": f"{scoring.AXIS_LABEL[a]} {s:.0f}" + ("" if delta is None else f" ({delta:+.0f} vs your current path)") + f": in {bf['year']} {bf['crop']}: {bf['factor']['text']}",
            "source": bf["factor"]["source"], "data_as_of": signals[sig]["as_of"] if sig and sig in signals else None,
        })
    out.sort(key=lambda r: (-(r["delta_vs_current"] or -999), -r["score"]))
    return out


def limitations(strategy: Dict[str, Any], signals: Dict[str, Dict[str, Any]], farmer: Dict[str, Any], common_axes: List[str], excluded_axes: List[str]) -> List[Dict[str, Any]]:
    L: List[Dict[str, Any]] = []
    used_axes = common_axes
    for name, s in signals.items():
        if s["provenance"] == "unavailable":
            L.append({"kind": "data_unavailable", "text": f"{s['label']} is unavailable: {s['reason']}"})
        elif s["provenance"] == "cached":
            L.append({"kind": "cached", "text": f"{s['label']} comes from stored data dated {s['as_of']} ({s['source']})."})
        if s["provenance"] != "unavailable" and s.get("resolution_note"):
            L.append({"kind": "resolution", "text": f"{s['label']}: {s['resolution_note']}"})
    for a in excluded_axes:
        why = strategy["axes"][a].get("reason")
        L.append({"kind": "axis_not_scored", "text": f"{scoring.AXIS_LABEL[a]} could not be scored for every strategy, so it is left out of the overall score." + (f" {why}" if why else "")})
    for a in used_axes:
        if strategy["axes"][a]["status"] == "partial" and strategy["axes"][a].get("reason"):
            L.append({"kind": "axis_partial", "text": f"{scoring.AXIS_LABEL[a]}: {strategy['axes'][a]['reason']}"})

    seen = set()
    for y in strategy["years"]:
        c = y["crop"]
        if c not in profiles.eligible_crop_ids() or c in seen:
            continue
        seen.add(c)
        for name in ("ecocrop", "calendar", "rooting_depth_m", "rotation_break_years", "n_fixation_kg_ha"):
            src = profiles.attr_source(c, name)
            if src and src["verify"]:
                L.append({"kind": "verify", "text": f"{y['crop_label']}: {name.replace('_', ' ')} from {src['name']} ({src['ref']}). Needs agronomist review."})
    winter_with_frost = [y["crop_label"] for y in strategy["years"] if y["scored"] and (profiles.calendar(y["crop"]) or {}).get("winter_sown")
                         and any(f["id"] == "frost_survival" and f["value"] is not None for f in y["factors"].get("heat", []))]
    if winter_with_frost:
        L.append({"kind": "data_limit", "text": "Frost survival uses the species-level killing temperature of FAO EcoCrop, which does not separate winter from spring forms. It can understate the hardiness of winter crops (" + ", ".join(sorted(set(winter_with_frost))) + ")."})
    if farmer.get("irrigation") == "irrigated":
        L.append({"kind": "assumption", "text": "You reported irrigation access, so rain and soil-water factors count as met. The amount of water you can apply is not known."})
    if farmer.get("soil_texture"):
        L.append({"kind": "farmer_input", "text": f"Soil texture '{farmer['soil_texture']}' is your entry. The calculation uses SoilGrids layers."})
    L.append({"kind": "model", "text": "Factor weights and the bonus for diversity and legumes are design parameters in scoring_weights.json, not measurements."})
    if any(not y["scored"] for y in strategy["years"]):
        L.append({"kind": "crop_not_scored", "text": "A crop in this rotation has no complete sourced profile, so its axes are not scored."})
    g = strategy["legal"]["gloez7"]
    L.append({"kind": "legal", "text": f"GLÖZ 7 is checked per field from your crop history; farm exemptions and the 33 % farm-level condition are not known. Rule source: {g['rule']['source_name']}, retrieved {g['rule']['retrieved']}."})
    L.append({"kind": "legal", "text": "Fertiliser figures follow DüV Anlage 4 but need your own Nmin, 5-year yield and humus values. Red-area reduction (§13a) is not applied."})
    return L


def explain(strategy: Dict[str, Any], baseline: Dict[str, Any], signals: Dict[str, Dict[str, Any]], farmer: Dict[str, Any], common_axes: List[str], excluded_axes: List[str]) -> Dict[str, Any]:
    return {
        "why": reasons(strategy, baseline, signals, common_axes),
        "weak_points": [
            {"axis": a, "statement": f"{scoring.AXIS_LABEL[a]}: in {w['year']} {w['crop']}: {w['factor']['text']}"}
            for a in common_axes if (w := _weakest_factor(strategy, a)) and w["factor"]["value"] is not None and w["factor"]["value"] < 0.5
        ],
        "limitations": limitations(strategy, signals, farmer, common_axes, excluded_axes),
        "caveats": FIXED_CAVEATS,
    }
