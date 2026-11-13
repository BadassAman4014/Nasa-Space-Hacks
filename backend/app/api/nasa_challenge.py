from typing import Any, Optional
from fastapi import APIRouter, HTTPException, Query
from app.services.nasa_challenge import (
    NASA_CHALLENGE_CATALOG,
    ChallengeDatasetInfo,
    DatasetCategory,
    DatasetQueryRequest,
    DatasetQueryResponse,
    FieldMultiQueryRequest,
    FieldMultiQueryResponse,
    nasa_challenge_client,
)

router = APIRouter(prefix="/nasa-challenge", tags=["NASA Challenge Data & Resources"])


@router.get("/catalog", response_model=list[ChallengeDatasetInfo])
def list_datasets(category: Optional[DatasetCategory] = None) -> list[ChallengeDatasetInfo]:
    """
    List all 23 official NASA Space Apps Challenge earth observation and agricultural datasets,
    optionally filtered by domain category.
    """
    datasets = list(NASA_CHALLENGE_CATALOG.values())
    if category:
        datasets = [d for d in datasets if d.category == category]
    return datasets


@router.get("/catalog/{dataset_id}", response_model=ChallengeDatasetInfo)
def get_dataset(dataset_id: str) -> ChallengeDatasetInfo:
    """
    Get detailed metadata, official documentation URL, and API specs for a specific NASA Challenge dataset.
    """
    info = NASA_CHALLENGE_CATALOG.get(dataset_id)
    if not info:
        raise HTTPException(status_code=404, detail=f"Dataset '{dataset_id}' not found in catalog")
    return info


@router.get("/categories")
def list_categories() -> dict[str, Any]:
    """
    List available dataset categories with counts.
    """
    categories = {}
    for d in NASA_CHALLENGE_CATALOG.values():
        c = d.category.value
        categories[c] = categories.get(c, 0) + 1
    return {
        "categories": list(categories.keys()),
        "counts": categories,
        "total_datasets": len(NASA_CHALLENGE_CATALOG)
    }


@router.get("/query", response_model=DatasetQueryResponse)
def query_dataset_get(
    dataset_id: str = Query(..., description="NASA Challenge dataset ID"),
    lat: float = Query(..., description="Latitude (WGS84)"),
    lon: float = Query(..., description="Longitude (WGS84)"),
    year: Optional[int] = Query(None, description="Year for annual products (e.g., CropScape)"),
    start_date: Optional[str] = Query(None, description="Start date (YYYY-MM-DD)"),
    end_date: Optional[str] = Query(None, description="End date (YYYY-MM-DD)"),
) -> DatasetQueryResponse:
    """
    Query any of the 23 NASA Challenge datasets for a geographical point.
    """
    if dataset_id not in NASA_CHALLENGE_CATALOG:
        raise HTTPException(status_code=404, detail=f"Unknown dataset '{dataset_id}'")

    try:
        return nasa_challenge_client.query_dataset(
            dataset_id=dataset_id,
            lat=lat,
            lon=lon,
            year=year,
            start_date=start_date,
            end_date=end_date,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/query", response_model=DatasetQueryResponse)
def query_dataset_post(req: DatasetQueryRequest) -> DatasetQueryResponse:
    """
    Query any of the 23 NASA Challenge datasets using a JSON request payload.
    """
    if req.dataset_id not in NASA_CHALLENGE_CATALOG:
        raise HTTPException(status_code=404, detail=f"Unknown dataset '{req.dataset_id}'")

    try:
        return nasa_challenge_client.query_dataset(
            dataset_id=req.dataset_id,
            lat=req.lat,
            lon=req.lon,
            year=req.year,
            start_date=req.start_date,
            end_date=req.end_date,
            extra_params=req.extra_params,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/fields/{field_id}/query", response_model=DatasetQueryResponse)
@router.post("/fields/{field_id}/query", response_model=DatasetQueryResponse)
def query_saved_field_dataset(
    field_id: str,
    dataset_id: str = Query(..., description="NASA Challenge dataset ID"),
    year: Optional[int] = Query(None, description="Year for annual products"),
    start_date: Optional[str] = Query(None, description="Start date (YYYY-MM-DD)"),
    end_date: Optional[str] = Query(None, description="End date (YYYY-MM-DD)"),
) -> DatasetQueryResponse:
    """
    Query a single NASA Challenge dataset for a saved field's geometry.
    """
    res = nasa_challenge_client.query_field_challenge_datasets(
        field_id=field_id,
        dataset_ids=[dataset_id],
        start_date=start_date,
        end_date=end_date
    )
    if dataset_id not in res.results:
        raise HTTPException(status_code=500, detail=f"Failed to query {dataset_id} for field {field_id}")
    return res.results[dataset_id]


@router.post("/fields/{field_id}/probe-all", response_model=FieldMultiQueryResponse)
def probe_all_for_field(field_id: str, req: Optional[FieldMultiQueryRequest] = None) -> FieldMultiQueryResponse:
    """
    Execute a coordinated multi-dataset probe across NASA and partner agency datasets
    (Soil, Climate, Topography, Satellite, Ecology, Economics) for a saved field.
    """
    dataset_ids = req.dataset_ids if req else None
    start_date = req.start_date if req else None
    end_date = req.end_date if req else None

    try:
        return nasa_challenge_client.query_field_challenge_datasets(
            field_id=field_id,
            dataset_ids=dataset_ids,
            start_date=start_date,
            end_date=end_date
        )
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
