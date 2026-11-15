"""
NASA POWER Daily Meteorological Service & GDD Calculator.
Retrieves real daily precipitation (PRECTOTCORR) and temperatures (T2M_MIN, T2M_MAX),
calculates accumulated precipitation and Growing Degree Days (GDD),
and provides real-time weather observations.
"""

from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple
import json
import math
import requests

from app.services.field_analytics.schemas import (
    CurrentWeather,
    DailyGDD,
    DailyPrecipitation,
    GDDTimeSeriesResponse,
    PrecipitationTimeSeriesResponse,
)
from app.services.field_analytics.repository import analytics_repo

class WeatherDataUnavailable(RuntimeError):
    """Raised when a real meteorological source cannot answer for this field."""


CROP_BASE_TEMPERATURES: Dict[str, float] = {
    "winter wheat": 4.4,
    "wheat": 4.4,
    "corn": 10.0,
    "maize": 10.0,
    "rapeseed": 5.0,
    "canola": 5.0,
    "barley": 4.0,
    "rye": 3.0,
    "oats": 4.0,
    "sunflower": 8.0,
    "soybeans": 10.0,
    "soybean": 10.0,
    "sugar beet": 6.0,
    "grassland": 5.0,
    "grassland pasture": 5.0,
    "peas": 4.4,
    "cover crop": 5.0,
}

class WeatherService:
    NASA_POWER_DAILY_URL = "https://power.larc.nasa.gov/api/temporal/daily/point"

    def get_current_weather(self, lat: float, lon: float, station_name: Optional[str] = None) -> Optional[CurrentWeather]:
        """Retrieve the current Open-Meteo values or report no observation."""
        del station_name  # Kept for API compatibility; Open-Meteo supplies the point value.
        try:
            r = requests.get(
                "https://api.open-meteo.com/v1/forecast",
                params={
                    "latitude": lat,
                    "longitude": lon,
                    "current": "temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m",
                },
                timeout=3,
            )
            r.raise_for_status()
            data = r.json().get("current", {})
            required = {
                "temperature_2m",
                "relative_humidity_2m",
                "apparent_temperature",
                "precipitation",
                "weather_code",
                "wind_speed_10m",
                "time",
            }
            if not required.issubset(data) or any(data[key] is None for key in required):
                return None
            return CurrentWeather(
                temperature_c=round(float(data["temperature_2m"]), 1),
                feels_like_c=round(float(data["apparent_temperature"]), 1),
                precipitation_mm=round(float(data["precipitation"]), 1),
                wind_speed_kmh=round(float(data["wind_speed_10m"]), 1),
                humidity_percent=round(float(data["relative_humidity_2m"]), 1),
                condition=self._weather_code_to_desc(int(data["weather_code"])),
                is_forecast=True,
                observation_date=str(data["time"]),
                station_or_provider=f"Open-Meteo forecast grid ({lat:.2f}°N, {lon:.2f}°E)",
            )
        except (requests.RequestException, TypeError, ValueError, KeyError):
            return None

    def get_precipitation_series(
        self,
        field_id: str,
        lat: float,
        lon: float,
        start_date: str = "2024-03-01",
        end_date: str = "2024-10-31"
    ) -> PrecipitationTimeSeriesResponse:
        """
        Retrieves daily precipitation records from NASA POWER (PRECTOTCORR)
        and computes cumulative rainfall.
        """
        cache = analytics_repo.get_weather_cache(field_id)
        if cache and cache.get("precipitation"):
            precip_cache = cache["precipitation"]
            return PrecipitationTimeSeriesResponse(**precip_cache)

        # Attempt NASA POWER API query
        daily_records: List[DailyPrecipitation] = []
        total_acc = 0.0

        try:
            r = requests.get(
                self.NASA_POWER_DAILY_URL,
                params={
                    "parameters": "PRECTOTCORR",
                    "community": "AG",
                    "longitude": lon,
                    "latitude": lat,
                    "start": start_date.replace("-", ""),
                    "end": end_date.replace("-", ""),
                    "format": "JSON"
                },
                timeout=5
            )
            if r.status_code == 200:
                p_data = r.json().get("properties", {}).get("parameter", {}).get("PRECTOTCORR", {})
                for d_str, val in sorted(p_data.items()):
                    if val is None or val < -900:
                        continue
                    dt_obj = datetime.strptime(d_str, "%Y%m%d")
                    iso_date = dt_obj.strftime("%Y-%m-%d")
                    val_mm = max(0.0, round(float(val), 2))
                    total_acc += val_mm
                    daily_records.append(DailyPrecipitation(
                        date=iso_date,
                        daily_mm=val_mm,
                        accumulated_mm=round(total_acc, 2)
                    ))
        except Exception:
            pass

        if not daily_records:
            raise WeatherDataUnavailable(
                "NASA POWER returned no PRECTOTCORR records for this field and "
                "period. No precipitation values were synthesised."
            )

        res = PrecipitationTimeSeriesResponse(
            field_id=field_id,
            start_date=start_date,
            end_date=end_date,
            total_accumulated_mm=round(total_acc, 1),
            daily_records=daily_records,
            data_source="NASA POWER Daily API (GPM/MERRA-2 PRECTOTCORR)",
            resolution="0.5° × 0.5°",
            last_updated=datetime.now(timezone.utc).strftime("%Y-%m-%d")
        )

        # Update cache
        existing_cache = cache or {}
        existing_cache["precipitation"] = res.dict()
        analytics_repo.set_weather_cache(field_id, start_date, end_date, existing_cache)

        return res

    def get_gdd_series(
        self,
        field_id: str,
        crop: str,
        lat: float,
        lon: float,
        start_date: str = "2024-03-01",
        end_date: str = "2024-10-31",
        base_temperature_c: Optional[float] = None
    ) -> GDDTimeSeriesResponse:
        """
        Calculates daily and cumulative Growing Degree Days (GDD) from daily Tmin & Tmax.
        Formula: GDD = max(0, ((Tmax + Tmin) / 2) - Tbase)
        """
        crop_clean = (crop or "").strip().lower()
        if base_temperature_c is not None:
            t_base = base_temperature_c
        elif crop_clean in CROP_BASE_TEMPERATURES:
            t_base = CROP_BASE_TEMPERATURES[crop_clean]
        else:
            raise WeatherDataUnavailable(
                "A crop-specific or user-selected base temperature is required to calculate GDD."
            )

        daily_gdd_list: List[DailyGDD] = []
        total_gdd = 0.0

        # Attempt NASA POWER temperature query
        temps: Dict[str, Tuple[float, float]] = {}
        try:
            r = requests.get(
                self.NASA_POWER_DAILY_URL,
                params={
                    "parameters": "T2M_MIN,T2M_MAX",
                    "community": "AG",
                    "longitude": lon,
                    "latitude": lat,
                    "start": start_date.replace("-", ""),
                    "end": end_date.replace("-", ""),
                    "format": "JSON"
                },
                timeout=5
            )
            if r.status_code == 200:
                props = r.json().get("properties", {}).get("parameter", {})
                tmin_data = props.get("T2M_MIN", {})
                tmax_data = props.get("T2M_MAX", {})
                for d_str in sorted(tmin_data.keys()):
                    tmin_val = tmin_data.get(d_str)
                    tmax_val = tmax_data.get(d_str)
                    if tmin_val is not None and tmax_val is not None and tmin_val > -900 and tmax_val > -900:
                        iso_d = datetime.strptime(d_str, "%Y%m%d").strftime("%Y-%m-%d")
                        temps[iso_d] = (float(tmin_val), float(tmax_val))
        except Exception:
            pass

        if not temps:
            raise WeatherDataUnavailable(
                "NASA POWER returned no T2M_MIN/T2M_MAX records for this field "
                "and period. No temperatures were synthesised, so GDD cannot "
                "be reported."
            )

        for d_str, (tmin, tmax) in sorted(temps.items()):
            t_mean = (tmax + tmin) / 2.0
            daily_heat = max(0.0, t_mean - t_base)
            total_gdd += daily_heat
            daily_gdd_list.append(DailyGDD(
                date=d_str,
                tmin_c=round(tmin, 1),
                tmax_c=round(tmax, 1),
                daily_gdd=round(daily_heat, 2),
                accumulated_gdd=round(total_gdd, 1)
            ))

        return GDDTimeSeriesResponse(
            field_id=field_id,
            crop=crop or "Unassigned",
            base_temperature_c=round(t_base, 1),
            start_date=start_date,
            end_date=end_date,
            total_accumulated_gdd=round(total_gdd, 1),
            valid_days=len(daily_gdd_list),
            daily_records=daily_gdd_list,
            data_source="NASA POWER Daily API (T2M_MIN, T2M_MAX)",
            formula="GDD = max(0, ((Tmax + Tmin)/2) - Tbase)"
        )

    def _generate_climatological_precipitation(
        self,
        start_date: str,
        end_date: str,
        lat: float,
        lon: float
    ) -> Tuple[List[DailyPrecipitation], float]:
        """
        REMOVED. This previously returned pseudo-random values seeded from the
        field coordinates while the API labelled them "NASA POWER". Fabricating
        precipitation is prohibited, so callers now receive
        ``WeatherDataUnavailable`` instead.
        """
        raise WeatherDataUnavailable(
            "Synthetic precipitation generation has been removed."
        )

    def _weather_code_to_desc(self, code: int) -> str:
        codes = {
            0: "Clear sky",
            1: "Mainly clear",
            2: "Partly cloudy",
            3: "Overcast",
            45: "Fog",
            51: "Light drizzle",
            61: "Slight rain",
            63: "Moderate rain",
            65: "Heavy rain",
            71: "Slight snowfall",
            80: "Rain showers",
            95: "Thunderstorm"
        }
        return codes.get(code, f"Unknown weather code ({code})")

weather_service = WeatherService()
