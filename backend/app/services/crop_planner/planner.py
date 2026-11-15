"""Orchestration: field -> signals -> risk card / recommendation / timeline. All field numbers come from real signals."""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from shapely.geometry import shape

from app.services.crop_planner import climate, explain, generator, profiles, riskcard, scoring, signals as sig, timeline
from app.services.crop_planner.store import IRRIGATION, PRIORITIES, SOIL_TEXTURES, PlannerStore, planner_store
from app.services.user_farms_repository import user_farms_repo


class FieldNotFound(LookupError):
    pass


def _field(field_id: str) -> Dict[str, Any]:
    f = user_farms_repo.get_field(field_id)
    if not f:
        raise FieldNotFound(f"Field '{field_id}' not found.")
    return f


def _centroid(f: Dict[str, Any]) -> tuple[float, float]:
    c = shape(f["geometry"]).centroid
    return round(c.y, 5), round(c.x, 5)


# ------------------------------------------------------------------------------------------ farmer inputs
def validate_inputs(history: List[Dict[str, Any]], soil_texture: Optional[str], priority: Optional[str], irrigation: Optional[str]) -> List[Dict[str, Any]]:
    problems = []
    if soil_texture is not None and soil_texture not in SOIL_TEXTURES:
        problems.append(f"Soil texture must be one of {', '.join(SOIL_TEXTURES)}.")
    if priority is not None and priority not in PRIORITIES:
        problems.append(f"Priority must be one of {', '.join(PRIORITIES)}.")
    if irrigation is not None and irrigation not in IRRIGATION:
        problems.append(f"Irrigation must be one of {', '.join(IRRIGATION)}.")
    if len(history) > 3:
        problems.append("Enter at most the last 3 years.")
    clean = []
    known = set(profiles.crop_ids()) | {"fallow_or_grass", "other"}
    seen = set()
    for h in history:
        try:
            y, c = int(h["year"]), h["crop"]
        except (KeyError, TypeError, ValueError):
            problems.append("Each history entry needs a year and a crop.")
            continue
        if c not in known:
            problems.append(f"Unknown crop '{c}'.")
        if y in seen:
            problems.append(f"Year {y} is entered twice.")
        seen.add(y)
        clean.append({"year": y, "crop": c})
    if problems:
        raise ValueError(" ".join(problems))
    return sorted(clean, key=lambda e: e["year"])


def save_inputs(field_id: str, history: List[Dict[str, Any]], soil_texture: Optional[str], priority: Optional[str], irrigation: Optional[str], store: Optional[PlannerStore] = None) -> Dict[str, Any]:
    _field(field_id)
    clean = validate_inputs(history, soil_texture, priority, irrigation)
    return (store or planner_store).save_inputs(field_id, clean, soil_texture, priority, irrigation)


def get_inputs(field_id: str, store: Optional[PlannerStore] = None) -> Dict[str, Any]:
    _field(field_id)
    inp = (store or planner_store).get_inputs(field_id)
    inp["options"] = {
        "soil_texture": [{"id": "sandboden", "de": "Sandboden", "en": "Sandy"}, {"id": "lehmboden", "de": "Lehmboden", "en": "Loamy"},
                         {"id": "tonboden", "de": "Tonboden", "en": "Clay"}, {"id": "moorboden", "de": "Moorboden", "en": "Peat"}],
        "priority": list(PRIORITIES), "irrigation": list(IRRIGATION),
        "crops": [{"id": c["id"], "label_en": c["label_en"], "label_de": c["label_de"], "scored": c["scoring"]["eligible"]} for c in profiles.load_profiles()["crops"].values()]
        + [{"id": "fallow_or_grass", "label_en": "Fallow / grass / perennial", "label_de": "Brache / Gras / mehrjährig", "scored": False}, {"id": "other", "label_en": "Other crop", "label_de": "Andere Kultur", "scored": False}],
    }
    return inp


# ------------------------------------------------------------------------------------------ shared
def _signals(field: Dict[str, Any], store: PlannerStore, refresh: bool, network: bool, farmer: Dict[str, Any], climate_fetcher=None) -> Dict[str, Dict[str, Any]]:
    return sig.get_field_signals(field, store=store, network=network, refresh=refresh, farmer_texture=farmer.get("soil_texture"), climate_fetcher=climate_fetcher)


def field_signals(field_id: str, refresh: bool = False, network: bool = True, store: Optional[PlannerStore] = None) -> Dict[str, Any]:
    store = store or planner_store
    f = _field(field_id)
    farmer = store.get_inputs(field_id)
    s = _signals(f, store, refresh, network, farmer)
    return {"field_id": field_id, "signals": s}


def risk_card(field_id: str, refresh: bool = False, network: bool = True, store: Optional[PlannerStore] = None) -> Dict[str, Any]:
    store = store or planner_store
    f = _field(field_id)
    farmer = store.get_inputs(field_id)
    s = _signals(f, store, refresh, network, farmer)
    lat, lon = _centroid(f)
    W = profiles.load_weights()
    years = climate.climate_years(int(W["climate_window"]["years"]))
    card = riskcard.build(f, s, W, lat, lon, years, store)
    card["farmer_inputs"] = {k: farmer[k] for k in ("soil_texture", "priority", "irrigation")}
    tc = s["soil"]["detail"].get("texture_check") if s["soil"]["provenance"] != "unavailable" else None
    card["soil_texture"] = {"farmer": farmer.get("soil_texture"), "satellite": s["soil"]["value"], "label_source": "farmer-provided" if farmer.get("soil_texture") else "SoilGrids", "check": tc}
    return card


def _farm_fields(field: Dict[str, Any], store: PlannerStore) -> List[Dict[str, Any]]:
    out = []
    for f in user_farms_repo.list_fields(field["farm_id"]):
        hist = store.get_inputs(f["id"])["history"]
        out.append({"field_id": f["id"], "area_ha": f["area_hectares"], "crops_by_year": {int(h["year"]): h["crop"] for h in hist}})
    return out


def recommend(field_id: str, refresh: bool = False, network: bool = True, store: Optional[PlannerStore] = None, climate_fetcher=None) -> Dict[str, Any]:
    store = store or planner_store
    f = _field(field_id)
    farmer = store.get_inputs(field_id)
    problems = []
    if len(farmer["history"]) < 2:
        problems.append("Enter the main crop of the last 2 to 3 years.")
    if not farmer["priority"]:
        problems.append("Choose your top priority.")
    if not farmer["irrigation"]:
        problems.append("Say whether the field can be irrigated.")
    if problems:
        raise generator.PlanInputError(problems)

    s = _signals(f, store, refresh, network, farmer, climate_fetcher)
    lat, lon = _centroid(f)
    ctx = scoring.build_context(s, farmer, lat, lon, store)
    plan = generator.generate(ctx, farmer["history"], _farm_fields(f, store), field_id)

    strategies = plan["strategies"]
    base = strategies[0]
    common, excluded = plan["common_axes"], plan["excluded_axes"]
    for st in strategies:
        st["explanation"] = explain.explain(st, base, s, farmer, common, excluded)
    plan["timeline"] = timeline.build(ctx, s, strategies, 0)
    plan.update({
        "field_id": field_id, "field_name": f["name"], "farmer_inputs": {k: farmer[k] for k in ("soil_texture", "priority", "irrigation")},
        "signals": {k: {kk: vv for kk, vv in v.items() if kk != "detail"} for k, v in s.items()},
        "crop_table": {"retrieved": profiles.load_profiles()["retrieved"], "n_eligible": len(plan["eligible_crops"])},
        "income": {"available": False, "reason": "No real price source (BLE weekly prices or Destatis) is connected, so no income figure is shown."},
        "confidence_note": "Scores compare options for this field; they are not forecasts.",
    })
    rid = store.save_recommendation(field_id, plan)
    plan["id"] = rid
    return plan


def get_recommendation(rid: str, store: Optional[PlannerStore] = None) -> Optional[Dict[str, Any]]:
    return (store or planner_store).get_recommendation(rid)


def vulnerability_timeline(field_id: str, rid: Optional[str], year_index: int = 0, store: Optional[PlannerStore] = None) -> Dict[str, Any]:
    store = store or planner_store
    f = _field(field_id)
    rec = store.get_recommendation(rid) if rid else None
    if not rec or rec["field_id"] != field_id:
        raise LookupError("No saved recommendation for this field. Generate one first.")
    farmer = store.get_inputs(field_id)
    s = _signals(f, store, False, False, farmer)
    lat, lon = _centroid(f)
    ctx = scoring.build_context(s, farmer, lat, lon, store)
    return timeline.build(ctx, s, rec["strategies"], max(0, min(year_index, len(rec["years"]) - 1)))


def score_one_crop(field_id: str, crop: str, previous: Optional[str] = None, store: Optional[PlannerStore] = None, network: bool = False) -> Dict[str, Any]:
    store = store or planner_store
    f = _field(field_id)
    if crop not in profiles.crop_ids():
        raise ValueError(f"Unknown crop '{crop}'.")
    farmer = store.get_inputs(field_id)
    s = _signals(f, store, False, network, farmer)
    lat, lon = _centroid(f)
    ctx = scoring.build_context(s, farmer, lat, lon, store)
    return scoring.score_year(ctx, previous, crop, None, False)
