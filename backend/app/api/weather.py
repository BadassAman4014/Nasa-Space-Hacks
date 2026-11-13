from typing import Any, Dict, List, Optional
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.services.weather_station_service import weather_station_service

router = APIRouter(prefix="/weather", tags=["weather"])


class StationTogglePayload(BaseModel):
    is_active: bool = True
    station_name: Optional[str] = None


@router.get("/stations")
def get_stations() -> List[Dict[str, Any]]:
    """Lists all configured virtual weather stations."""
    return weather_station_service.list_virtual_stations()


@router.get("/fields")
def get_all_fields_weather() -> List[Dict[str, Any]]:
    """Returns weather overview for all user fields (useful for map pins and selectors)."""
    return weather_station_service.get_all_fields_weather_summary()


@router.get("/fields/{field_id}")
def get_field_weather(field_id: str) -> Dict[str, Any]:
    """Returns complete meteorological, satellite 3JS and cloud forecast data for a field."""
    data = weather_station_service.get_field_weather_data(field_id)
    if not data:
        raise HTTPException(status_code=404, detail=f"Field '{field_id}' not found.")
    return data


@router.post("/stations/{field_id}")
def update_virtual_station(field_id: str, payload: StationTogglePayload) -> Dict[str, Any]:
    """Enables/disables or updates a virtual weather station on a field."""
    return weather_station_service.toggle_virtual_station(field_id, payload.is_active)


@router.delete("/stations/{field_id}")
def delete_virtual_station(field_id: str) -> Dict[str, Any]:
    """Disables the virtual weather station for a field."""
    return weather_station_service.toggle_virtual_station(field_id, False)
