"""Data-integrity tests for the NASA Challenge catalogue client."""

import pytest

from app.services.nasa_challenge.client import NasaChallengeDataClient, SourceUnavailable
from app.services.nasa_challenge.schemas import DatasetQueryResponse


def test_unimplemented_connector_returns_no_measurements():
    client = NasaChallengeDataClient()
    response = client.query_dataset("fao_gaez", lat=52.4, lon=14.3)

    assert response.status == "unavailable"
    assert response.data == {}
    assert "No live field-value connector" in response.summary


def test_us_only_source_reports_out_of_coverage_for_germany():
    client = NasaChallengeDataClient()
    response = client.query_dataset("web_soil_survey", lat=52.4, lon=14.3)

    assert response.status == "out_of_coverage"
    assert response.data == {}


def test_cmr_failure_does_not_create_synthetic_granules(monkeypatch):
    client = NasaChallengeDataClient()

    def unavailable(*args, **kwargs):
        raise SourceUnavailable("CMR unavailable for test")

    monkeypatch.setattr(client, "query_nasa_cmr_granules", unavailable)
    response = client.query_dataset("smap", lat=52.4, lon=14.3)

    assert response.status == "unavailable"
    assert response.data == {}
    assert response.summary == "CMR unavailable for test"


def test_saved_field_uses_geometry_centroid_and_area(monkeypatch):
    client = NasaChallengeDataClient()
    field = {
        "id": "field-test",
        "name": "Test field",
        "farm_name": "Test farm",
        "area_hectares": 12.34,
        "geometry": {
            "type": "Polygon",
            "coordinates": [[[14.0, 52.0], [14.2, 52.0], [14.2, 52.2], [14.0, 52.2], [14.0, 52.0]]],
        },
    }
    monkeypatch.setattr(
        "app.services.nasa_challenge.client.user_farms_repo.get_field",
        lambda field_id: field,
    )

    captured = {}

    def query(dataset_id, lat, lon, **kwargs):
        captured.update({"lat": lat, "lon": lon})
        info = client.get_dataset_info(dataset_id)
        return DatasetQueryResponse(
            dataset_id=dataset_id,
            name=info.name,
            agency=info.agency,
            category=info.category,
            query_timestamp="2026-01-01T00:00:00+00:00",
            location={"lat": lat, "lon": lon},
            status="unavailable",
            data={},
            summary="test",
            source_url=info.official_url,
        )

    monkeypatch.setattr(client, "query_dataset", query)
    response = client.query_field_challenge_datasets("field-test", dataset_ids=["smap"])

    assert captured["lat"] == pytest.approx(52.1)
    assert captured["lon"] == pytest.approx(14.1)
    assert response.area_ha == pytest.approx(12.34)
    assert response.bbox == [14.0, 52.0, 14.2, 52.2]
