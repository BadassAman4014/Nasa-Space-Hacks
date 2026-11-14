"""
Virtual Weather Station & Meteorological Forecast Service.
Retrieves real-time atmospheric conditions, cloud cover, and hourly forecasts
from Open-Meteo and NASA POWER for farm fields, and manages virtual station state.
"""

from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional, Tuple
import json
import math
import requests

from app.services.field_analytics.repository import analytics_repo
from app.services.user_farms_repository import user_farms_repo
from app.services.dwd_service import dwd_service


class WeatherUnavailable(RuntimeError):
    """Raised when Open-Meteo cannot supply real data. No placeholder values are generated."""


class WeatherStationService:
    OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"

    def _init_station_table(self):
        """Ensures virtual_weather_stations table exists in field_analytics.db."""
        with analytics_repo._connection() as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS virtual_weather_stations (
                    field_id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    lat REAL NOT NULL,
                    lon REAL NOT NULL,
                    is_active INTEGER NOT NULL DEFAULT 1,
                    installed_at TEXT NOT NULL,
                    metadata_json TEXT
                );
            """)

    def list_virtual_stations(self) -> List[Dict[str, Any]]:
        """Returns all configured virtual weather stations that the user explicitly added."""
        self._init_station_table()
        fields = user_farms_repo.list_fields()
        if not fields:
            return []

        field_map = {f["id"]: f for f in fields}

        with analytics_repo._connection() as conn:
            rows = conn.execute("SELECT field_id, name, lat, lon, is_active, installed_at, metadata_json FROM virtual_weather_stations WHERE is_active = 1").fetchall()

        stations = []
        for r in rows:
            f_id = r["field_id"]
            if f_id not in field_map:
                continue
            f = field_map[f_id]
            meta = json.loads(r["metadata_json"]) if r["metadata_json"] else {}
            stations.append({
                "field_id": f_id,
                "field_name": f.get("name", "Field"),
                "farm_name": f.get("farm_name", "My Farm"),
                "station_name": r["name"] or f"Station {f.get('name')}",
                "lat": float(r["lat"]),
                "lon": float(r["lon"]),
                "is_active": True,
                "installed_at": r["installed_at"],
                "metadata": meta
            })
        return stations

    def add_virtual_station(self, field_id: str, name: Optional[str] = None) -> Dict[str, Any]:
        """Adds a virtual weather station to a specific field."""
        self._init_station_table()
        field = user_farms_repo.get_field(field_id)
        if not field:
            raise ValueError(f"Field {field_id} not found")

        lat, lon = self._calculate_centroid(field.get("geometry"))
        station_name = name or f"Virtual Station ({field.get('name', 'Field')})"
        now_iso = datetime.now(timezone.utc).isoformat()
        meta = {
            "model": "vStation-Pro AgriMesh",
            "sensors": ["temp", "humidity", "wind", "clouds", "rain", "soil_temp"]
        }
        with analytics_repo._connection() as conn:
            conn.execute("""
                INSERT OR REPLACE INTO virtual_weather_stations (field_id, name, lat, lon, is_active, installed_at, metadata_json)
                VALUES (?, ?, ?, ?, 1, ?, ?)
            """, (field_id, station_name, lat, lon, now_iso, json.dumps(meta)))

        return {
            "field_id": field_id,
            "field_name": field.get("name", "Field"),
            "farm_name": field.get("farm_name", "My Farm"),
            "station_name": station_name,
            "lat": lat,
            "lon": lon,
            "is_active": True,
            "installed_at": now_iso,
            "metadata": meta
        }

    def delete_virtual_station(self, field_id: str) -> Dict[str, Any]:
        """Deletes/removes a virtual weather station from a field."""
        self._init_station_table()
        with analytics_repo._connection() as conn:
            conn.execute("DELETE FROM virtual_weather_stations WHERE field_id = ?", (field_id,))
        return {"field_id": field_id, "deleted": True}

    def clear_all_virtual_stations(self) -> Dict[str, Any]:
        """Removes all virtual weather stations."""
        self._init_station_table()
        with analytics_repo._connection() as conn:
            conn.execute("DELETE FROM virtual_weather_stations")
        return {"deleted_all": True}

    def get_station_for_field(self, field_id: str) -> Optional[Dict[str, Any]]:
        stations = self.list_virtual_stations()
        for s in stations:
            if s["field_id"] == field_id:
                return s
        return None

    def toggle_virtual_station(self, field_id: str, is_active: bool) -> Dict[str, Any]:
        self._init_station_table()
        if not is_active:
            return self.delete_virtual_station(field_id)
        return self.add_virtual_station(field_id)

    def get_all_fields_weather_summary(self) -> List[Dict[str, Any]]:
        """
        Returns current weather summary for each field with a virtual station.
        Fields whose live weather cannot be retrieved are omitted (never filled with placeholder values).
        """
        stations = self.list_virtual_stations()
        summaries = []
        for s in stations:
            f_id = s["field_id"]
            field = user_farms_repo.get_field(f_id)
            geom = field.get("geometry") if field else None
            try:
                lat, lon = self._calculate_centroid(geom) if geom else (s["lat"], s["lon"])
                api_data = self._fetch_open_meteo(
                    lat, lon, current=self._CURRENT_VARS,
                )
                curr = self._parse_current(api_data)
            except Exception:
                continue
            summaries.append({
                "field_id": f_id,
                "field_name": s["field_name"],
                "farm_name": s["farm_name"],
                "coordinates": [lat, lon],
                "geometry": geom,
                "is_active": s["is_active"],
                "temperature_c": curr["temperature_c"],
                "feels_like_c": curr["feels_like_c"],
                "humidity_percent": curr["humidity_percent"],
                "wind_speed_ms": curr["wind_speed_ms"],
                "wind_direction_deg": curr["wind_direction_deg"],
                "wind_compass": curr["wind_compass"],
                "wind_arrow": curr["wind_arrow"],
                "cloud_cover_percent": curr["cloud_cover_percent"],
                "precipitation_mm": curr["precipitation_mm"],
                "condition": curr["condition"],
                "icon": curr["icon"],
            })
        return summaries

    _CURRENT_VARS = (
        "temperature_2m,relative_humidity_2m,apparent_temperature,dew_point_2m,precipitation,"
        "weather_code,cloud_cover,wind_speed_10m,wind_direction_10m,surface_pressure,"
        "soil_temperature_0_to_7cm,soil_temperature_7_to_28cm"
    )

    def _fetch_open_meteo(self, lat: float, lon: float, current: str,
                          hourly: Optional[str] = None, daily: Optional[str] = None,
                          forecast_days: Optional[int] = None, past_hours: Optional[int] = None) -> Dict[str, Any]:
        params: Dict[str, Any] = {"latitude": lat, "longitude": lon, "current": current, "timezone": "auto"}
        if hourly:
            params["hourly"] = hourly
        if daily:
            params["daily"] = daily
        if forecast_days:
            params["forecast_days"] = forecast_days
        if past_hours:
            params["past_hours"] = past_hours
        try:
            resp = requests.get(self.OPEN_METEO_URL, params=params, timeout=8)
            resp.raise_for_status()
            data = resp.json()
        except Exception as exc:
            raise WeatherUnavailable(f"Open-Meteo request failed: {type(exc).__name__}") from exc
        if not isinstance(data.get("current"), dict):
            raise WeatherUnavailable("Open-Meteo returned no current observation.")
        return data

    @staticmethod
    def _num(value: Any, ndigits: int = 1) -> Optional[float]:
        return None if value is None else round(float(value), ndigits)

    def _parse_current(self, api_data: Dict[str, Any]) -> Dict[str, Any]:
        """Normalises Open-Meteo 'current'. Required values raise if missing; optional ones stay None."""
        c = api_data["current"]
        for key in ("temperature_2m", "relative_humidity_2m", "wind_speed_10m", "wind_direction_10m", "cloud_cover", "weather_code"):
            if c.get(key) is None:
                raise WeatherUnavailable(f"Open-Meteo current observation is missing '{key}'.")
        temp_c = round(float(c["temperature_2m"]), 1)
        humidity = round(float(c["relative_humidity_2m"]), 1)
        cloud_pct = c.get("cloud_cover")
        wind_ms = round(float(c["wind_speed_10m"]) / 3.6, 1)
        wind_deg = int(c["wind_direction_10m"])
        w_code = int(c["weather_code"]) if c.get("weather_code") is not None else None
        condition, icon = self._parse_weather_code(w_code, float(cloud_pct)) if (w_code is not None and cloud_pct is not None) else ("Unknown", "cloudy")
        compass, arrow = self._deg_to_compass_and_arrow(wind_deg)
        return {
            "temperature_c": temp_c,
            "feels_like_c": self._num(c.get("apparent_temperature")),
            "humidity_percent": humidity,
            "dew_point_c": self._num(c.get("dew_point_2m")),
            "cloud_cover_percent": int(round(cloud_pct)) if cloud_pct is not None else None,
            "wind_speed_ms": wind_ms,
            "wind_direction_deg": wind_deg,
            "wind_compass": compass,
            "wind_arrow": arrow,
            "precipitation_mm": self._num(c.get("precipitation")) or 0.0,
            "pressure_hpa": self._num(c.get("surface_pressure")),
            "soil_temp_0_7_c": self._num(c.get("soil_temperature_0_to_7cm")),
            "soil_temp_7_28_c": self._num(c.get("soil_temperature_7_to_28cm")),
            "weather_code": w_code,
            "condition": condition,
            "icon": icon,
        }

    @staticmethod
    def _at(arr: List[Any], i: int) -> Any:
        return arr[i] if i < len(arr) else None

    def get_field_weather_data(self, field_id: str) -> Dict[str, Any]:
        """
        Real current weather, 24 h hourly forecast, 7-day daily forecast and a 16-day outlook from
        Open-Meteo for the field centroid, plus official DWD warnings for fields in Germany.
        Raises WeatherUnavailable if Open-Meteo cannot answer; no values are synthesised.
        """
        field = user_farms_repo.get_field(field_id)
        if not field:
            fields = user_farms_repo.list_fields()
            if fields:
                field = fields[0]
                field_id = field["id"]
            else:
                raise ValueError(f"Field '{field_id}' not found.")

        lat, lon = self._calculate_centroid(field.get("geometry"))
        station = self.get_station_for_field(field_id)

        api_data = self._fetch_open_meteo(
            lat, lon,
            current=self._CURRENT_VARS,
            hourly=(
                "temperature_2m,relative_humidity_2m,dew_point_2m,precipitation_probability,precipitation,"
                "weather_code,cloud_cover,wind_speed_10m,wind_direction_10m,soil_temperature_0_to_7cm"
            ),
            daily=(
                "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,"
                "precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max,"
                "wind_direction_10m_dominant,et0_fao_evapotranspiration"
            ),
            forecast_days=16,
            past_hours=2,
        )
        cur = self._parse_current(api_data)
        temp_c = cur["temperature_c"]
        humidity = cur["humidity_percent"]
        cloud_pct = cur["cloud_cover_percent"]
        wind_ms = cur["wind_speed_ms"]
        wind_deg = cur["wind_direction_deg"]
        precip_mm = cur["precipitation_mm"]
        wind_compass, wind_arrow = cur["wind_compass"], cur["wind_arrow"]

        # Local "now" in the field's timezone, as reported by Open-Meteo.
        try:
            now_dt = datetime.fromisoformat(api_data["current"]["time"])
        except Exception:
            now_dt = datetime.now()

        hourly_raw = api_data.get("hourly", {})
        times = hourly_raw.get("time", [])
        col = {k: hourly_raw.get(k, []) for k in (
            "temperature_2m", "relative_humidity_2m", "dew_point_2m", "precipitation_probability",
            "precipitation", "weather_code", "cloud_cover", "wind_speed_10m", "wind_direction_10m",
        )}

        now_hour_str = now_dt.strftime("%Y-%m-%dT%H:00")
        start_idx = next((i for i, t in enumerate(times) if t >= now_hour_str), 0)

        def hour_point(i: int) -> Optional[Dict[str, Any]]:
            t_val = self._at(col["temperature_2m"], i)
            w_raw = self._at(col["wind_speed_10m"], i)
            c_val = self._at(col["cloud_cover"], i)
            code = self._at(col["weather_code"], i)
            if t_val is None or w_raw is None or c_val is None or code is None:
                return None
            desc, icon = self._parse_weather_code(int(code), float(c_val)) if (code is not None and c_val is not None) else ("Unknown", "cloudy")
            w_dir = self._at(col["wind_direction_10m"], i)
            t_str = times[i]
            prob = self._at(col["precipitation_probability"], i)
            return {
                "time": t_str,
                "label": t_str.split("T")[1][:5] if "T" in t_str else t_str[-5:],
                "temp_c": round(float(t_val), 1),
                "temperature_c": round(float(t_val), 1),
                "humidity_percent": self._num(self._at(col["relative_humidity_2m"], i)),
                "dew_point_c": self._num(self._at(col["dew_point_2m"], i)),
                "cloud_cover_percent": int(round(c_val)) if c_val is not None else None,
                "precipitation_mm": round(float(self._at(col["precipitation"], i) or 0.0), 1),
                "precipitation_probability": int(prob) if prob is not None else None,
                "wind_speed_ms": round(float(w_raw) / 3.6, 1),
                "wind_direction_deg": int(w_dir) if w_dir is not None else None,
                "condition": desc,
                "icon": icon,
            }

        forecast_points: List[Dict[str, Any]] = []
        for i in range(start_idx, min(start_idx + 24, len(times))):
            p = hour_point(i)
            if p:
                p["is_now"] = not forecast_points
                forecast_points.append(p)

        past_points = [p for p in (hour_point(i) for i in range(max(0, start_idx - 2), start_idx)) if p]

        # Daily forecast (up to 16 days of real model output)
        d = api_data.get("daily", {})
        d_times = d.get("time", [])
        daily_all: List[Dict[str, Any]] = []
        for i, d_str in enumerate(d_times):
            max_t, min_t = self._at(d.get("temperature_2m_max", []), i), self._at(d.get("temperature_2m_min", []), i)
            if max_t is None or min_t is None:
                continue
            try:
                dt_obj = datetime.strptime(d_str, "%Y-%m-%d")
                day_name = "Today" if i == 0 else dt_obj.strftime("%a")
                date_label = dt_obj.strftime("%b %d")
            except Exception:
                day_name, date_label = f"Day {i + 1}", d_str
            wind_raw = self._at(d.get("wind_speed_10m_max", []), i)
            gust_raw = self._at(d.get("wind_gusts_10m_max", []), i)
            w_dir = self._at(d.get("wind_direction_10m_dominant", []), i)
            w_compass_d, w_arrow_d = self._deg_to_compass_and_arrow(int(w_dir)) if w_dir is not None else ("", "")
            code = self._at(d.get("weather_code", []), i)
            cond, icon = self._parse_weather_code(int(code), 40) if code is not None else ("Unknown", "cloudy")
            prob = self._at(d.get("precipitation_probability_max", []), i)
            et0 = self._at(d.get("et0_fao_evapotranspiration", []), i)
            daily_all.append({
                "date": d_str,
                "day_name": day_name,
                "date_label": date_label,
                "temp_max_c": round(float(max_t), 1),
                "temp_min_c": round(float(min_t), 1),
                "precipitation_mm": round(float(self._at(d.get("precipitation_sum", []), i) or 0.0), 1),
                "precipitation_probability": int(prob) if prob is not None else None,
                "wind_speed_ms": round(float(wind_raw) / 3.6, 1) if wind_raw is not None else None,
                "wind_gust_ms": round(float(gust_raw) / 3.6, 1) if gust_raw is not None else None,
                "wind_compass": w_compass_d,
                "wind_arrow": w_arrow_d,
                "et0_mm": round(float(et0), 1) if et0 is not None else None,
                "condition": cond,
                "icon": icon,
            })
        forecast_daily = daily_all[:7]

        forecast_monthly = self._build_outlook_weeks(daily_all)
        monthly_trend_days = []
        for n, day in enumerate(daily_all):
            wind = day["wind_speed_ms"]
            monthly_trend_days.append({
                "day_number": n + 1,
                "date": day["date"],
                "label": datetime.strptime(day["date"], "%Y-%m-%d").strftime("%d %b"),
                "temp_max": day["temp_max_c"],
                "temp_min": day["temp_min_c"],
                "temp_avg": round((day["temp_max_c"] + day["temp_min_c"]) / 2.0, 1),
                "precip_mm": day["precipitation_mm"],
                "spray_safe": self._is_spray_safe(day),
            })

        incoming_clouds = self._calculate_incoming_clouds(forecast_points, cloud_pct)
        radar_timeline = self._generate_radar_timeline(now_dt, past_points, forecast_points, precip_mm)

        # Official DWD warnings (Germany only; never raises)
        dwd_alerts = dwd_service.get_alerts_for_point(lat, lon)

        cloud_for_sim = cloud_pct if cloud_pct is not None else 0
        pressure = cur["pressure_hpa"]
        today_et0 = daily_all[0]["et0_mm"] if daily_all else None

        def fmt(v: Optional[float], unit: str) -> Optional[str]:
            return None if v is None else f"{v}{unit}"

        return {
            "field_id": field_id,
            "field_name": field.get("name", "Field"),
            "farm_name": field.get("farm_name", "My Farm"),
            "area_ha": round(float(field["area_hectares"]), 2) if field.get("area_hectares") is not None else None,
            "crop": field.get("current_crop"),
            "coordinates": {"lat": lat, "lon": lon},
            "elevation_m": api_data.get("elevation"),
            "geometry": field.get("geometry"),
            "virtual_station": {
                "is_active": bool(station["is_active"]) if station else False,
                "name": station["station_name"] if station else f"Virtual Station ({field.get('name')})",
                "installed_at": station["installed_at"] if station else None,
                "sensors": {
                    "temperature": f"{temp_c}°C",
                    "humidity": f"{humidity}%",
                    "wind": f"{wind_ms} m/s {wind_compass} {wind_arrow}",
                    "cloud_cover": fmt(cloud_pct, "%"),
                    "barometric_pressure": fmt(pressure, " hPa"),
                    "dew_point": fmt(cur["dew_point_c"], "°C"),
                    "soil_temperature": fmt(cur["soil_temp_0_7_c"], "°C"),
                    "soil_temperature_7_28cm": fmt(cur["soil_temp_7_28_c"], "°C"),
                    "et0_today": fmt(today_et0, " mm"),
                    "leaf_wetness_risk": "Moderate" if (humidity > 75 or precip_mm > 0.2) else "Low",
                }
            },
            "current": {
                "temperature_c": temp_c,
                "feels_like_c": cur["feels_like_c"],
                "humidity_percent": humidity,
                "dew_point_c": cur["dew_point_c"],
                "cloud_cover_percent": cloud_pct,
                "wind_speed_ms": wind_ms,
                "wind_direction_deg": wind_deg,
                "wind_compass": wind_compass,
                "wind_arrow": wind_arrow,
                "precipitation_mm": precip_mm,
                "pressure_hpa": pressure,
                "soil_temp_0_7_c": cur["soil_temp_0_7_c"],
                "soil_temp_7_28_c": cur["soil_temp_7_28_c"],
                "weather_code": cur["weather_code"],
                "condition": cur["condition"],
                "icon": cur["icon"],
                "observation_time": now_dt.strftime("%H:%M"),
                "timestamp": now_dt.isoformat()
            },
            "alerts": dwd_alerts,
            "incoming_clouds": incoming_clouds,
            "forecast_hourly": forecast_points,
            "forecast_daily": forecast_daily,
            "forecast_monthly": forecast_monthly,
            "monthly_trend_days": monthly_trend_days,
            "radar_timeline": radar_timeline,
            "threejs_simulation": {
                "cloud_density": round(cloud_for_sim / 100.0, 2),
                "wind_vector": {
                    "x": round(-math.sin(math.radians(wind_deg)) * (wind_ms / 10.0), 3),
                    "z": round(math.cos(math.radians(wind_deg)) * (wind_ms / 10.0), 3)
                },
                "wind_speed_factor": round(max(0.2, min(2.5, wind_ms / 5.0)), 2),
                "precipitation_intensity": round(min(1.0, precip_mm / 5.0), 2),
                "sun_elevation_deg": self._estimate_sun_elevation(now_dt, lat),
                "lighting_preset": "overcast" if cloud_for_sim > 75 else ("partly_cloudy" if cloud_for_sim > 30 else "sunny")
            }
        }

    @staticmethod
    def _is_spray_safe(day: Dict[str, Any]) -> bool:
        wind = day.get("wind_speed_ms")
        return day["precipitation_mm"] < 0.4 and wind is not None and wind <= 6.0

    def _build_outlook_weeks(self, days: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Weekly aggregates computed only from real daily forecast values (full 7-day blocks)."""
        weeks = []
        for w in range(len(days) // 7):
            block = days[w * 7:(w + 1) * 7]
            tmax = max(x["temp_max_c"] for x in block)
            tmin = min(x["temp_min_c"] for x in block)
            avg = round(sum((x["temp_max_c"] + x["temp_min_c"]) / 2.0 for x in block) / len(block), 1)
            precip = round(sum(x["precipitation_mm"] for x in block), 1)
            et0_vals = [x["et0_mm"] for x in block if x["et0_mm"] is not None]
            et0 = round(sum(et0_vals), 1) if len(et0_vals) == len(block) else None
            gdd = round(sum(max(0.0, (x["temp_max_c"] + x["temp_min_c"]) / 2.0 - 5.0) for x in block), 1)
            frost_days = sum(1 for x in block if x["temp_min_c"] <= 0.0)
            spray_days = sum(1 for x in block if self._is_spray_safe(x))
            if et0 is None:
                soil = f"{precip} mm rain forecast"
            else:
                balance = round(precip - et0, 1)
                soil = f"Water balance {balance:+} mm (rain {precip} − ET₀ {et0})"
            frost = (f"Frost on {frost_days} of 7 days (min {tmin}°C)" if frost_days
                     else f"No frost forecast (min {tmin}°C)")
            icon_counts: Dict[str, int] = {}
            for x in block:
                icon_counts[x["icon"]] = icon_counts.get(x["icon"], 0) + 1
            first = datetime.strptime(block[0]["date"], "%Y-%m-%d")
            last = datetime.strptime(block[-1]["date"], "%Y-%m-%d")
            weeks.append({
                "week_label": f"Week {w + 1}" + (" (Current)" if w == 0 else ""),
                "date_range": f"{first.strftime('%b %d')} - {last.strftime('%b %d')}",
                "avg_temp_c": avg,
                "temp_range": f"{tmin}°C to {tmax}°C",
                "total_precip_mm": precip,
                "soil_condition": soil,
                "spraying_suitability": f"{spray_days} of 7 days suitable",
                "frost_risk": frost,
                "gdd_accumulated": gdd,
                "icon": max(icon_counts, key=icon_counts.get),
                "summary": f"Model forecast: {precip} mm rain, {frost_days} frost day(s), {spray_days} spray-suitable day(s).",
            })
        return weeks

    def _calculate_centroid(self, geom: Optional[Dict[str, Any]]) -> Tuple[float, float]:
        if not geom or "coordinates" not in geom:
            raise ValueError("Field has no geometry; cannot determine location.")
        coords = geom["coordinates"]
        if not coords or not coords[0]:
            raise ValueError("Field has empty geometry; cannot determine location.")
        ring = coords[0] if isinstance(coords[0][0], (list, tuple)) else coords
        lons = [p[0] for p in ring]
        lats = [p[1] for p in ring]
        return round(float(sum(lats) / len(lats)), 5), round(float(sum(lons) / len(lons)), 5)

    def _parse_weather_code(self, code: int, cloud_pct: float) -> Tuple[str, str]:
        if code in (95, 96, 99):
            return "Thunderstorm", "thunder"
        if code in (71, 73, 75, 77, 85, 86):
            return "Snowfall", "snow"
        if code in (51, 53, 55, 61, 63, 65, 80, 81, 82):
            return "Rain showers" if code in (80, 81, 82) else "Rain", "rain"
        if code == 45 or code == 48:
            return "Foggy", "fog"
        if code == 3 or cloud_pct >= 75:
            return "Overcast", "cloudy"
        if code in (1, 2) or (25 <= cloud_pct < 75):
            return "Partly cloudy", "partly_cloudy"
        return "Clear sky", "sunny"

    def _deg_to_compass_and_arrow(self, deg: int) -> Tuple[str, str]:
        val = int((deg / 22.5) + 0.5) % 16
        compass_dirs = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"]
        arrows = ["↑", "↗", "↗", "→", "→", "↘", "↘", "↓", "↓", "↙", "↙", "←", "←", "↖", "↖", "↑"]
        return compass_dirs[val], arrows[val]

    def _calculate_incoming_clouds(self, forecast: List[Dict[str, Any]], current_cloud: float) -> Dict[str, Any]:
        """Calculates incoming clouds arrival time and peak coverage matching Screenshot 2."""
        if not forecast:
            return {"arrival_text": "No significant clouds incoming", "peak_coverage_pct": 20, "next_hours": []}

        # Look for noticeable increase in clouds
        incoming_time_text = "Clouds in ~45 min"
        peak_cov = int(current_cloud)
        for pt in forecast[:6]:
            if pt["cloud_cover_percent"] > peak_cov:
                peak_cov = pt["cloud_cover_percent"]

        if current_cloud > 70:
            incoming_time_text = "Overcast canopy overhead"
        elif peak_cov > current_cloud + 15:
            incoming_time_text = f"Clouds in ~{min(60, max(20, (forecast[1]['cloud_cover_percent'] - current_cloud) * 2))} min"
        else:
            incoming_time_text = "Stable cloud coverage"

        next_hours = []
        for pt in forecast[:5]:
            next_hours.append({
                "time": pt["label"],
                "icon": pt["icon"],
                "cloud_pct": pt["cloud_cover_percent"],
                "temp_c": pt["temp_c"]
            })

        return {
            "arrival_text": incoming_time_text,
            "peak_coverage_pct": min(100, max(current_cloud, peak_cov)),
            "coverage_label": f"Coverage up to {int(peak_cov)}%",
            "next_hours": next_hours
        }

    def _generate_radar_timeline(self, now_dt: datetime, past: List[Dict[str, Any]], forecast: List[Dict[str, Any]], current_precip: float) -> List[Dict[str, Any]]:
        """Past 2 h (observed/analysed hourly precipitation), now, and next 4 h from Open-Meteo."""
        def level(mm: float) -> int:
            return 3 if mm > 2.0 else (2 if mm > 0.5 else (1 if mm > 0 else 0))

        frames = []
        for pt in past:
            frames.append({
                "time": pt["label"], "label": pt["label"], "is_now": False, "is_past": True,
                "precip_mm": pt["precipitation_mm"], "intensity_level": level(pt["precipitation_mm"]),
            })
        frames.append({
            "time": now_dt.strftime("%H:%M"),
            "label": f"Now ({now_dt.strftime('%H:%M')})",
            "is_now": True, "is_past": False,
            "precip_mm": current_precip, "intensity_level": level(current_precip),
        })
        for pt in forecast[1:5]:
            frames.append({
                "time": pt["label"], "label": pt["label"], "is_now": False, "is_past": False,
                "precip_mm": pt["precipitation_mm"], "intensity_level": level(pt["precipitation_mm"]),
            })
        return frames

    def _estimate_sun_elevation(self, dt: datetime, lat: float) -> float:
        """Estimates sun elevation angle above horizon in degrees (for 3D shadow casting)."""
        hour = dt.hour + (dt.minute / 60.0)
        # Solar noon approx 12:30
        diff = abs(hour - 12.5)
        max_elev = 90.0 - abs(lat - 23.5)
        elev = max(0.0, max_elev - (diff * 7.5))
        return round(elev, 1)

    def get_point_weather(self, lat: float, lon: float) -> Dict[str, Any]:
        """Real-time observation for coordinates (e.g. device GPS). Raises WeatherUnavailable on failure."""
        api_data = self._fetch_open_meteo(lat, lon, current=self._CURRENT_VARS)
        cur = self._parse_current(api_data)
        return {
            "lat": lat,
            "lon": lon,
            "temperature_c": cur["temperature_c"],
            "feels_like_c": cur["feels_like_c"],
            "humidity_percent": cur["humidity_percent"],
            "cloud_cover_percent": cur["cloud_cover_percent"],
            "wind_speed_kmh": round(cur["wind_speed_ms"] * 3.6, 1),
            "wind_speed_ms": cur["wind_speed_ms"],
            "wind_direction_deg": cur["wind_direction_deg"],
            "wind_compass": cur["wind_compass"],
            "wind_arrow": cur["wind_arrow"],
            "precipitation_mm": cur["precipitation_mm"],
            "weather_code": cur["weather_code"],
            "condition": cur["condition"],
            "icon": cur["icon"],
        }


weather_station_service = WeatherStationService()
