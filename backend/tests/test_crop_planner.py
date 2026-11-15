import json

import pytest

import _planner_fixtures as fx
from app.services.crop_planner import climate, generator, profiles, rotation, scoring, signals as sig, soilwater
from app.services.crop_planner.store import PlannerStore
from app.services.policy import cap, dbe, gloez


# ------------------------------------------------------------------ Task 1: crop table
def test_every_attribute_has_a_source_and_verify_flag():
    doc = profiles.load_profiles()
    for cid, crop in doc["crops"].items():
        for name, a in crop["attributes"].items():
            assert a["source"] in doc["sources"], (cid, name)
            assert a["ref"] and "verify" in a, (cid, name)


def test_unsourced_value_is_rejected():
    doc = json.loads(json.dumps(profiles.load_profiles()))
    del doc["crops"]["winter_wheat"]["attributes"]["ecocrop"]["source"]
    with pytest.raises(profiles.ProfileError):
        profiles.validate_profiles(doc)


def test_eligible_crops_are_exactly_those_with_every_required_attribute():
    assert set(profiles.eligible_crop_ids()) == {"winter_wheat", "winter_barley", "winter_rapeseed", "sugar_beet", "faba_bean", "field_pea"}
    for cid in profiles.crop_ids():
        has_all = all(k in profiles.get_crop(cid)["attributes"] for k in profiles.REQUIRED_FOR_SCORING)
        assert has_all == profiles.get_crop(cid)["scoring"]["eligible"], cid
    assert "rooting_depth_m" in profiles.get_crop("winter_rye")["scoring"]["missing"]
    assert "calendar" in profiles.get_crop("potato")["scoring"]["missing"]


def test_duev_values_match_the_law_text():
    # DüV Anlage 4 Table 2 (read from gesetze-im-internet.de on 2026-11-15)
    assert profiles.attr("winter_wheat", "duev_n_requirement")["n_kg_ha"] == 230
    assert profiles.attr("winter_rapeseed", "duev_n_requirement")["n_kg_ha"] == 200
    assert profiles.attr("sugar_beet", "duev_n_requirement")["n_kg_ha"] == 170
    assert profiles.attr("faba_bean", "duev_n_requirement") is None  # legumes have no Table 2 row
    assert profiles.attr("winter_rapeseed", "duev_previous_crop_deduction_kg_n_ha") == 10
    assert profiles.attr("winter_wheat", "duev_previous_crop_deduction_kg_n_ha") == 0


def test_public_table_exposes_sources():
    t = profiles.public_table()
    wheat = next(c for c in t["crops"] if c["id"] == "winter_wheat")
    assert wheat["attributes"]["calendar"]["source"]["url"].startswith("https://")


# ------------------------------------------------------------------ Task 5: policy
def seq(*crops, start=2024):
    return [{"year": start + i, "crop": c} for i, c in enumerate(crops)]


def test_gloez_flags_three_years_of_the_same_crop():
    r = gloez.validate_sequence(seq("winter_wheat", "winter_wheat", "winter_wheat"))
    assert r["status"] == "violation" and r["violations"]


def test_gloez_accepts_two_crops_in_three_years():
    assert gloez.validate_sequence(seq("winter_wheat", "winter_wheat", "winter_barley"))["status"] == "compliant"


def test_gloez_rye_self_succession_is_exempt():
    r = gloez.validate_sequence(seq("winter_rye", "winter_rye", "winter_rye"))
    assert r["violations"] == [] and r["windows"][0]["status"] == "exempt"


def test_gloez_unknown_crop_is_not_judged():
    assert gloez.validate_sequence(seq("winter_wheat", "other", "winter_wheat"))["status"] == "unknown"


def test_dbe_previous_crop_deduction_carries_forward():
    plan = dbe.plan(seq("faba_bean", "winter_wheat", "winter_barley", start=2027), previous_crop_before_first="winter_wheat")
    assert plan[0]["available"] is False and plan[0]["credit_to_next_crop_kg_n_ha"] == 10
    wheat = plan[1]
    assert wheat["requirement_before_nmin_kg_n_ha"] == 220.0  # 230 - 10 from the legume (Table 7)
    assert wheat["legal_max_kg_n_ha"] is None  # Nmin not entered, so no legal maximum is stated
    assert any(l["applied"] is False and "Nmin" in l["label"] for l in wheat["lines"])


def test_dbe_with_nmin_and_yield():
    r = dbe.requirement("winter_wheat", "winter_rapeseed", farm_yield_5yr_avg=100.0, nmin_kg_ha=30.0)
    # 230 + min(40, 2 steps x 10) - 10 - 30
    assert r["legal_max_kg_n_ha"] == 210.0


def test_dbe_yield_correction_is_capped_at_40():
    r = dbe.requirement("winter_wheat", None, farm_yield_5yr_avg=200.0)
    assert r["requirement_before_nmin_kg_n_ha"] == 270.0


def test_cap_cannot_be_judged_when_a_field_has_no_crop():
    r = cap.evaluate_farm([{"field_id": "a", "area_ha": 10, "crop": "winter_wheat"}, {"field_id": "b", "area_ha": 5, "crop": None}], 2027)
    assert r["status"] == "not_evaluable"


def test_cap_met_with_five_crops_and_ten_percent_legumes():
    crops = ["winter_wheat", "winter_barley", "winter_rapeseed", "sugar_beet", "faba_bean"]
    r = cap.evaluate_farm([{"field_id": c, "area_ha": 10, "crop": c} for c in crops], 2027)
    assert r["status"] == "met" and r["grain_legume_share_pct"] == 20.0


# ------------------------------------------------------------------ rotation mechanics
def test_rapeseed_cannot_follow_sugar_beet():
    assert rotation.feasible_succession("sugar_beet", "winter_rapeseed")["ok"] is False


def test_wheat_can_follow_a_legume_and_rapeseed():
    assert rotation.feasible_succession("faba_bean", "winter_wheat")["ok"] is True
    assert rotation.feasible_succession("winter_rapeseed", "winter_wheat")["ok"] is True


def test_legume_break_violation_is_found():
    v = rotation.break_violations([(2024, "field_pea"), (2025, "winter_wheat"), (2026, "field_pea")])
    assert v and v[0]["required_min"] == 5


def test_catch_crop_adds_cover_after_an_early_harvest():
    base = rotation.occupancy_year("winter_barley", "sugar_beet", False)
    with_cc = rotation.occupancy_year("winter_barley", "sugar_beet", True)
    assert sum(with_cc) > sum(base)


# ------------------------------------------------------------------ soil water
def test_available_water_uses_the_fao_table():
    layers = fx.soil_signal()["detail"]["layers"]
    aw = soilwater.available_water_to_depth(layers, 0.5)
    # loamy sand 0.06-0.12 m3/m3 over 50 cm = 30-60 mm, midpoint 45
    assert aw["available"] and aw["awc_mm"] == 45.0 and aw["awc_range_mm"] == [30.0, 60.0]


def test_class_without_a_table_row_gives_no_value():
    ms = [{"property_name": p, "depth_interval": d, "mean_value": v} for d, _, _ in soilwater.LAYERS for p, v in (("sand", 55.0), ("silt", 20.0), ("clay", 25.0))]
    layers = soilwater.layers_from_measurements(ms)
    assert layers[0]["usda_class"] == "Sandy Clay Loam" and layers[0]["available"] is False
    assert soilwater.available_water_to_depth(layers, 0.5)["available"] is False


# ------------------------------------------------------------------ climate / Task 2 behaviour
def test_failed_power_fetch_leaves_the_cache_empty_and_reports_it(tmp_path):
    store = PlannerStore(tmp_path / "p.db")

    def boom(lat, lon, year):
        raise RuntimeError("offline")

    r = climate.ensure_power(fx.LAT, fx.LON, [2020, 2021], store=store, fetcher=boom)
    assert r["years_available"] == [] and set(r["years_failed"]) == {2020, 2021}


def test_cached_power_years_are_not_fetched_again(tmp_path):
    store = fx.make_store(tmp_path)
    calls = []
    yrs = climate.climate_years(3)
    climate.ensure_power(fx.LAT, fx.LON, yrs, store=store, fetcher=lambda *a: calls.append(a) or [])
    assert calls == []


def test_trapezoid_and_heat_suitability():
    assert climate.trapezoid(100, 300, 750, 900, 1600) == 0.0
    assert climate.trapezoid(525, 300, 750, 900, 1600) == pytest.approx(0.5)
    assert climate.heat_suitability(20, 23, 27) == 1.0
    assert climate.heat_suitability(25, 23, 27) == pytest.approx(0.5)
    assert climate.heat_suitability(30, 23, 27) == 0.0


def test_signals_never_return_a_default_when_nothing_is_stored(tmp_path):
    store = PlannerStore(tmp_path / "empty.db")
    field = {"id": "field-test-none", "name": "t", "geometry": {"type": "Polygon", "coordinates": [[[80.0, 10.0], [80.001, 10.0], [80.001, 10.001], [80.0, 10.001], [80.0, 10.0]]]}}
    s = sig.get_field_signals(field, store=store, network=False)
    for name, v in s.items():
        assert v["provenance"] == "unavailable", name
        assert v["value"] is None and v["reason"], name


def test_failed_live_slope_falls_back_to_the_stored_real_reading_with_its_date(tmp_path, monkeypatch):
    store = PlannerStore(tmp_path / "s.db")
    store.put_signal("f1", "slope", {"mean_slope_deg": 4.0, "max_slope_deg": 7.0, "mean_elevation_m": 70.0, "as_of": "2026-03-02"})
    import app.services.field_analytics.elevation_service as es

    monkeypatch.setattr(es.elevation_service, "get_elevation_for_polygon", lambda *a, **k: (_ for _ in ()).throw(RuntimeError("DEM offline")))
    field = {"id": "f1", "geometry": {"type": "Polygon", "coordinates": [[[14.0, 51.0], [14.001, 51.0], [14.001, 51.001], [14.0, 51.001], [14.0, 51.0]]]}}
    s = sig.slope_signal(field, store, network=True, refresh=True)
    assert s["provenance"] == "cached" and s["value"] == 4.0 and s["as_of"] == "2026-03-02"


def test_bare_soil_days_are_interpolated_and_long_gaps_are_not_counted():
    obs = [{"acquisition_date": "2025-01-01", "mean_ndvi": 0.1}, {"acquisition_date": "2025-01-11", "mean_ndvi": 0.1},
           {"acquisition_date": "2025-06-01", "mean_ndvi": 0.8}, {"acquisition_date": "2025-06-11", "mean_ndvi": 0.8}]
    r = sig.bare_soil_from_observations(obs, 0.25, today=__import__("datetime").date(2026, 1, 1))
    y = r["years"][2025]
    assert y["bare_days"] == 10 and y["covered_days"] == 20  # the Jan-Jun gap (>45 days) is skipped


# ------------------------------------------------------------------ Task 6: scoring
def test_a_drier_field_lowers_the_water_score(tmp_path):
    wet, _, _ = fx.build_ctx(tmp_path / "w", rain_mm=2.2)
    dry, _, _ = fx.build_ctx(tmp_path / "d", rain_mm=1.0)
    w = scoring.water_axis(wet, "winter_wheat")["score"]
    d = scoring.water_axis(dry, "winter_wheat")["score"]
    assert d < w


def test_axis_is_not_scored_without_climate_not_defaulted(tmp_path):
    ctx, _, _ = fx.build_ctx(tmp_path, climate_ok=False)
    ax = scoring.water_axis(ctx, "winter_wheat")
    assert ax["score"] is None and ax["status"] == "not_scored" and "NASA POWER" in " ".join(f["source"] for f in ax["factors"])


def test_missing_esi_makes_heat_partial_and_present_esi_changes_the_score(tmp_path):
    no_esi, _, _ = fx.build_ctx(tmp_path / "a", esi=None)
    stressed, _, _ = fx.build_ctx(tmp_path / "b", esi=0.2)
    a, b = scoring.heat_axis(no_esi, "winter_wheat"), scoring.heat_axis(stressed, "winter_wheat")
    assert a["status"] == "partial" and "Field summer stress" in a["reason"]
    assert b["status"] in ("scored", "partial") and b["factors"][2]["value"] is not None


def test_sandier_soil_raises_leaching_exposure(tmp_path):
    sandy, _, _ = fx.build_ctx(tmp_path / "s", sand=85.0)
    loamy, _, _ = fx.build_ctx(tmp_path / "l", sand=40.0)
    s = next(f for f in scoring.nitrogen_axis(sandy, "sugar_beet", "winter_wheat", None, False)["factors"] if f["id"] == "leaching_exposure")["value"]
    l = next(f for f in scoring.nitrogen_axis(loamy, "sugar_beet", "winter_wheat", None, False)["factors"] if f["id"] == "leaching_exposure")["value"]
    assert s < l


def test_winter_cover_scores_higher_than_bare_summer_fallow_period(tmp_path):
    ctx, _, _ = fx.build_ctx(tmp_path)
    wheat = scoring.cover_axis(ctx, "winter_wheat", "winter_wheat", False)["score"]
    beet = scoring.cover_axis(ctx, "sugar_beet", "winter_wheat", False)["score"]
    assert wheat > beet


def test_legumes_need_no_mineral_n(tmp_path):
    ctx, _, _ = fx.build_ctx(tmp_path)
    n = next(f for f in scoring.nitrogen_axis(ctx, "faba_bean", "winter_wheat", "winter_wheat", False)["factors"] if f["id"] == "fertiliser_need")
    assert n["value"] == 1.0


def test_irrigation_is_labelled_as_a_farmer_assumption(tmp_path):
    ctx, _, _ = fx.build_ctx(tmp_path, irrigation="irrigated")
    ax = scoring.water_axis(ctx, "sugar_beet")
    assert ax["score"] == 100.0 and all(f["source"] == "Farmer input" for f in ax["factors"])


def test_a_crop_without_a_complete_profile_is_not_scored(tmp_path):
    ctx, _, _ = fx.build_ctx(tmp_path)
    y = scoring.score_year(ctx, "winter_wheat", "potato", None)
    assert y["overall"] is None and all(a["score"] is None for a in y["axes"].values())


# ------------------------------------------------------------------ Task 7: generator
def history(*crops, end=2026):
    start = end - len(crops) + 1
    return [{"year": start + i, "crop": c} for i, c in enumerate(crops)]


def test_strategy_a_is_flagged_when_the_current_path_is_illegal(tmp_path):
    ctx, _, _ = fx.build_ctx(tmp_path)
    plan = generator.generate(ctx, history("winter_wheat", "winter_wheat", "winter_wheat"), [], "f")
    a = plan["strategies"][0]
    assert a["id"] == "A" and [y["crop"] for y in a["years"]] == ["winter_wheat"] * 5
    assert a["legal"]["gloez7"]["status"] == "violation"
    assert plan["years"] == [2027, 2028, 2029, 2030, 2031]


def test_alternatives_exist_even_when_the_farmers_past_broke_the_rule(tmp_path):
    ctx, _, _ = fx.build_ctx(tmp_path)
    plan = generator.generate(ctx, history("winter_wheat", "winter_wheat", "winter_wheat"), [], "f")
    assert len(plan["strategies"]) >= 2
    assert plan["strategies"][1]["legal"]["gloez7"]["windows"][-1]["status"] == "ok"


def test_alternative_strategies_obey_the_filters_and_are_deterministic(tmp_path):
    ctx, _, _ = fx.build_ctx(tmp_path)
    h = history("winter_wheat", "winter_barley", "winter_rapeseed")
    p1 = generator.generate(ctx, h, [], "f")
    p2 = generator.generate(ctx, h, [], "f")
    assert [[y["crop"] for y in s["years"]] for s in p1["strategies"]] == [[y["crop"] for y in s["years"]] for s in p2["strategies"]]
    ids = [s["id"] for s in p1["strategies"]]
    assert ids[0] == "A" and set(ids) <= {"A", "B", "C"} and len(ids) >= 2
    for s in p1["strategies"][1:]:
        assert s["legal"]["gloez7"]["violations"] == []
        crops = [y["crop"] for y in s["years"]]
        assert all(c in profiles.eligible_crop_ids() for c in crops)
        for prev, nxt in zip([h[-1]["crop"]] + crops, crops):
            assert rotation.feasible_succession(prev, nxt)["ok"]
        assert not [v for v in s["rotation_terms"]["break_violations"] if profiles.is_legume(v["crop"])]
        assert all(a != b for a, b in zip([h[-1]["crop"]] + crops, crops)), "no crop directly after itself (BZL, TLL)"
        for a in scoring.AXES:
            assert s["axes"][a]["score"] is not None


def test_generation_needs_history_and_a_priority(tmp_path):
    ctx, _, _ = fx.build_ctx(tmp_path)
    with pytest.raises(generator.PlanInputError):
        generator.generate(ctx, history("winter_wheat"), [], "f")
    ctx["priority"] = None
    with pytest.raises(generator.PlanInputError):
        generator.generate(ctx, history("winter_wheat", "winter_barley"), [], "f")


def test_no_income_is_invented():
    from app.services.crop_planner import planner

    src = open(planner.__file__, encoding="utf-8").read()
    assert '"income": {"available": False' in src
