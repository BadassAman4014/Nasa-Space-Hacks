import pytest
from fastapi.testclient import TestClient

import _planner_fixtures as fx
from app.main import app
from app.services.crop_planner import planner
from app.services.user_farms_repository import UserFarmsRepository

d = 0.0005
POLY = {"type": "Polygon", "coordinates": [[[fx.LON - d, fx.LAT - d], [fx.LON + d, fx.LAT - d], [fx.LON + d, fx.LAT + d], [fx.LON - d, fx.LAT + d], [fx.LON - d, fx.LAT - d]]]}


@pytest.fixture()
def client(tmp_path, monkeypatch):
    repo = UserFarmsRepository(db_path=tmp_path / "farms.db")
    field = repo.create_field("farm-t", "Test field", POLY)
    store = fx.make_store(tmp_path)
    monkeypatch.setattr(planner, "user_farms_repo", repo)
    monkeypatch.setattr(planner, "planner_store", store)
    original = planner._signals
    # The tests must never touch the network or the production databases.
    monkeypatch.setattr(planner, "_signals", lambda f, st, refresh, network, farmer, climate_fetcher=None: original(f, st, refresh, False, farmer, climate_fetcher))
    return TestClient(app), field["id"]


def test_crops_endpoint_lists_sources(client):
    c, _ = client
    r = c.get("/api/crops").json()
    assert any(x["id"] == "winter_wheat" and x["scoring"]["eligible"] for x in r["crops"])
    assert all("source" in a for x in r["crops"] for a in x["attributes"].values())


def test_policy_validate_flags_wheat_only_sequence(client):
    c, _ = client
    body = {"history": [{"year": 2025, "crop": "winter_wheat"}, {"year": 2026, "crop": "winter_wheat"}], "plan": [{"year": 2027, "crop": "winter_wheat"}]}
    r = c.post("/api/policy/validate", json=body).json()
    assert r["gloez7"]["status"] == "violation"
    assert r["dbe"][0]["requirement_before_nmin_kg_n_ha"] == 230.0


def test_unknown_field_is_404_and_missing_input_is_422(client):
    c, fid = client
    assert c.get("/api/fields/nope/risk-card?network=false").status_code == 404
    r = c.post("/api/recommendations/generate", json={"field_id": fid})
    assert r.status_code == 422 and r.json()["detail"]["problems"]


def test_inputs_round_trip_and_validation(client):
    c, fid = client
    assert c.put(f"/api/fields/{fid}/planner-inputs", json={"history": [{"year": 2026, "crop": "unicorn"}]}).status_code == 422
    body = {"history": [{"year": 2025, "crop": "winter_wheat"}, {"year": 2026, "crop": "winter_barley"}], "soil_texture": "sandboden", "priority": "save_water", "irrigation": "rainfed"}
    r = c.put(f"/api/fields/{fid}/planner-inputs", json=body).json()
    assert r["soil_texture"] == "sandboden" and len(r["history"]) == 2
    assert c.get(f"/api/fields/{fid}/planner-inputs").json()["priority"] == "save_water"


def test_risk_card_reports_unavailable_data_instead_of_numbers(client):
    c, fid = client
    card = c.get(f"/api/fields/{fid}/risk-card?network=false").json()
    items = {i["id"]: i for i in card["items"]}
    assert items["erosion"]["level"] == "unavailable" and "slope" in items["erosion"]["reading"].lower() or items["erosion"]["level"] == "unavailable"
    assert items["bare_soil"]["level"] == "unavailable"
    assert items["heat_stress"]["level"] in ("unavailable", "info")
    assert all(s["provenance"] in ("live", "cached", "unavailable") for s in card["signals"].values())


def test_recommendation_degrades_to_not_scored_axes_and_has_no_income(client, monkeypatch):
    c, fid = client
    body = {"history": [{"year": 2025, "crop": "winter_wheat"}, {"year": 2026, "crop": "winter_barley"}], "soil_texture": None, "priority": "save_water", "irrigation": "rainfed"}
    c.put(f"/api/fields/{fid}/planner-inputs", json=body)
    # signals read from the empty production stores (no network): soil and satellite data are unavailable, POWER weather is in the test store
    monkeypatch.setattr(planner.sig, "climate_signal", lambda field, store, network, years=None, fetcher=None: fx.sig.make_signal("climate", "climate", value=11, source="test", provenance="cached", as_of="2026-11-15", detail={}))
    r = c.post("/api/recommendations/generate", json={"field_id": fid})
    assert r.status_code == 200, r.text
    rec = r.json()
    assert rec["income"]["available"] is False
    assert "water" in rec["excluded_axes"], "water needs soil layers that are not stored, so it must be left out, not defaulted"
    for s in rec["strategies"]:
        assert s["axes"]["water"]["score"] is None and s["axes"]["water"]["reason"]
        assert s["explanation"]["limitations"] and s["explanation"]["caveats"]
    saved = c.get(f"/api/recommendations/{rec['id']}").json()
    assert saved["id"] == rec["id"]
    tl = c.get(f"/api/fields/{fid}/vulnerability-timeline?recommendation_id={rec['id']}").json()
    assert len(tl["strategies"]["A"]["months"]) == 12
