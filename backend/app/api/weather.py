from typing import Any, Dict, List, Optional
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.services.weather_station_service import weather_station_service, WeatherUnavailable

from app.services.user_farms_repository import user_farms_repo

router = APIRouter(prefix="/weather", tags=["weather"])


class StationTogglePayload(BaseModel):
    is_active: bool = True
    station_name: Optional[str] = None


@router.get("/stations")
def get_stations() -> List[Dict[str, Any]]:
    """Lists all configured virtual weather stations that the user explicitly added."""
    return weather_station_service.list_virtual_stations()


@router.get("/available-fields")
def get_available_fields() -> List[Dict[str, Any]]:
    """Lists all user fields with their current station status."""
    fields = user_farms_repo.list_fields()
    stations = {s["field_id"]: s for s in weather_station_service.list_virtual_stations()}
    result = []
    for f in fields:
        f_id = f["id"]
        result.append({
            "field_id": f_id,
            "field_name": f.get("name", "Field"),
            "farm_name": f.get("farm_name", "My Farm"),
            "has_station": f_id in stations,
            "station": stations.get(f_id),
            "geometry": f.get("geometry"),
        })
    return result


@router.get("/point")
def get_point_weather(lat: float = Query(...), lon: float = Query(...)) -> Dict[str, Any]:
    """Returns real-time atmospheric observation for specific geographical coordinates (e.g. device GPS)."""
    try:
        return weather_station_service.get_point_weather(lat, lon)
    except WeatherUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc))


@router.get("/fields")
def get_all_fields_weather() -> List[Dict[str, Any]]:
    """Returns weather overview for user fields with installed virtual stations."""
    return weather_station_service.get_all_fields_weather_summary()


@router.get("/fields/{field_id}")
def get_field_weather(field_id: str) -> Dict[str, Any]:
    """Returns complete meteorological, satellite 3JS and cloud forecast data for a field."""
    try:
        data = weather_station_service.get_field_weather_data(field_id)
    except WeatherUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    if not data:
        raise HTTPException(status_code=404, detail=f"Field '{field_id}' not found.")
    return data


@router.post("/stations/{field_id}")
def add_or_update_virtual_station(field_id: str, payload: Optional[StationTogglePayload] = None) -> Dict[str, Any]:
    """Adds a virtual weather station to a field."""
    name = payload.station_name if payload else None
    return weather_station_service.add_virtual_station(field_id, name)


@router.delete("/stations/{field_id}")
def delete_virtual_station(field_id: str) -> Dict[str, Any]:
    """Removes a virtual weather station from a field."""
    return weather_station_service.delete_virtual_station(field_id)


@router.delete("/stations")
def clear_all_stations() -> Dict[str, Any]:
    """Removes all virtual weather stations."""
    return weather_station_service.clear_all_virtual_stations()
