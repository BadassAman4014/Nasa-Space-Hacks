export interface VirtualStation {
  field_id: string;
  field_name: string;
  farm_name: string;
  station_name: string;
  lat: number;
  lon: number;
  is_active: boolean;
  installed_at: string;
  metadata?: {
    model?: string;
    elevation_m?: number;
    sensors?: string[];
    [key: string]: any;
  };
}

export interface FieldWeatherSummary {
  field_id: string;
  field_name: string;
  farm_name: string;
  coordinates: [number, number]; // [lat, lon]
  geometry?: any;
  is_active: boolean;
  temperature_c: number;
  feels_like_c: number;
  humidity_percent: number;
  wind_speed_ms: number;
  wind_direction_deg: number;
  wind_compass: string;
  wind_arrow: string;
  cloud_cover_percent: number;
  precipitation_mm: number;
  condition: string;
  icon: string;
}

export interface HourlyForecastPoint {
  time: string;
  iso_time: string;
  temperature_c: number;
  feels_like_c: number;
  cloud_cover_percent: number;
  precipitation_mm: number;
  weather_code: number;
  condition: string;
  icon: string;
  wind_speed_ms: number;
  wind_direction_deg: number;
}

export interface IncomingCloudsInfo {
  arrival_text: string;
  peak_coverage_pct: number;
  coverage_label: string;
  next_hours: Array<{
    time: string;
    icon: string;
    cloud_pct: number;
    temp_c: number;
  }>;
}

export interface RadarFrame {
  minute_offset: number;
  time_label: string;
  is_now: boolean;
  precipitation_mm: number;
  cloud_cover_percent: number;
}

export interface DailyForecastPoint {
  date: string;
  day_name: string;
  date_label: string;
  temp_max_c: number;
  temp_min_c: number;
  precipitation_mm: number;
  precipitation_probability: number;
  wind_speed_ms: number;
  wind_compass: string;
  wind_arrow: string;
  condition: string;
  icon: string;
}

export interface MonthlyDayTrend {
  day_number: number;
  date: string;
  label: string;
  temp_max: number;
  temp_min: number;
  temp_avg: number;
  precip_mm: number;
  spray_safe: boolean;
}

export interface MonthlyOutlookPoint {
  week_label: string;
  date_range: string;
  avg_temp_c: number;
  temp_range: string;
  total_precip_mm: number;
  soil_condition: string;
  spraying_suitability: string;
  frost_risk: string;
  gdd_accumulated: number;
  icon: string;
  summary: string;
}

export interface ThreeJsSimulationParams {
  cloud_density: number;
  wind_vector: { x: number; z: number };
  wind_speed_factor: number;
  precipitation_intensity: number;
  sun_elevation_deg: number;
  lighting_preset: string;
}

export interface FieldWeatherData {
  field_id: string;
  field_name: string;
  farm_name: string;
  area_ha: number;
  crop: string;
  coordinates: [number, number]; // [lat, lon]
  geometry: any;
  virtual_station: VirtualStation;
  current: {
    temperature_c: number;
    feels_like_c: number;
    humidity_percent: number;
    cloud_cover_percent: number;
    wind_speed_ms: number;
    wind_direction_deg: number;
    wind_compass: string;
    wind_arrow: string;
    precipitation_mm: number;
    pressure_hpa: number;
    weather_code: number;
    condition: string;
    icon: string;
    observation_time: string;
    timestamp: string;
  };
  incoming_clouds: IncomingCloudsInfo;
  forecast_hourly: HourlyForecastPoint[];
  forecast_daily?: DailyForecastPoint[];
  forecast_monthly?: MonthlyOutlookPoint[];
  monthly_trend_days?: MonthlyDayTrend[];
  radar_timeline: RadarFrame[];
  threejs_simulation: ThreeJsSimulationParams;
}

export interface AvailableField {
  field_id: string;
  field_name: string;
  farm_name: string;
  has_station: boolean;
  station?: VirtualStation;
  geometry?: any;
}

const API_BASE = '/api/weather';

export async function fetchVirtualStations(): Promise<VirtualStation[]> {
  const res = await fetch(`${API_BASE}/stations`);
  if (!res.ok) throw new Error(`Failed to fetch stations: ${res.statusText}`);
  return res.json();
}

export async function fetchAvailableFields(): Promise<AvailableField[]> {
  const res = await fetch(`${API_BASE}/available-fields`);
  if (!res.ok) throw new Error(`Failed to fetch available fields: ${res.statusText}`);
  return res.json();
}

export async function fetchAllFieldsWeather(): Promise<FieldWeatherSummary[]> {
  const res = await fetch(`${API_BASE}/fields`);
  if (!res.ok) throw new Error(`Failed to fetch fields weather: ${res.statusText}`);
  return res.json();
}

export async function fetchFieldWeather(fieldId: string): Promise<FieldWeatherData> {
  const res = await fetch(`${API_BASE}/fields/${encodeURIComponent(fieldId)}`);
  if (!res.ok) throw new Error(`Failed to fetch field weather: ${res.statusText}`);
  return res.json();
}

export async function addVirtualStation(fieldId: string, stationName?: string): Promise<VirtualStation> {
  const res = await fetch(`${API_BASE}/stations/${encodeURIComponent(fieldId)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ is_active: true, station_name: stationName }),
  });
  if (!res.ok) throw new Error(`Failed to add virtual station: ${res.statusText}`);
  return res.json();
}

export async function deleteVirtualStation(fieldId: string): Promise<{ field_id: string; deleted: boolean }> {
  const res = await fetch(`${API_BASE}/stations/${encodeURIComponent(fieldId)}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(`Failed to delete virtual station: ${res.statusText}`);
  return res.json();
}

export async function clearAllVirtualStations(): Promise<{ deleted_all: boolean }> {
  const res = await fetch(`${API_BASE}/stations`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(`Failed to clear virtual stations: ${res.statusText}`);
  return res.json();
}

export async function toggleVirtualStation(fieldId: string, isActive: boolean): Promise<VirtualStation> {
  if (!isActive) {
    return deleteVirtualStation(fieldId) as any;
  }
  return addVirtualStation(fieldId);
}

export interface PointWeather {
  lat: number;
  lon: number;
  temperature_c: number;
  feels_like_c: number;
  humidity_percent: number;
  cloud_cover_percent: number;
  wind_speed_kmh: number;
  wind_speed_ms: number;
  wind_direction_deg: number;
  wind_compass: string;
  wind_arrow: string;
  precipitation_mm: number;
  weather_code: number;
  condition: string;
  icon: string;
}

export async function fetchPointWeather(lat: number, lon: number): Promise<PointWeather> {
  try {
    const res = await fetch(`${API_BASE}/point?lat=${lat}&lon=${lon}`);
    if (res.ok) {
      return await res.json();
    }
  } catch {
    // Fall back to client-side Open-Meteo or baseline
  }

  // Direct client-side Open-Meteo query
  try {
    const omRes = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m&timezone=auto`
    );
    if (omRes.ok) {
      const data = await omRes.json();
      const c = data.current || {};
      const temp = Number(c.temperature_2m ?? 18.0);
      const wCode = Number(c.weather_code ?? 1);
      const isCloudy = (c.cloud_cover ?? 30) > 60;
      const condition =
        wCode === 0
          ? 'Clear sky'
          : wCode <= 3
          ? isCloudy
            ? 'Overcast'
            : 'Partly cloudy'
          : wCode >= 51 && wCode <= 67
          ? 'Rain'
          : wCode >= 71 && wCode <= 77
          ? 'Snow'
          : wCode >= 95
          ? 'Thunderstorm'
          : 'Partly cloudy';
      const icon =
        wCode === 0
          ? 'sunny'
          : wCode <= 3
          ? isCloudy
            ? 'cloudy'
            : 'partly_cloudy'
          : wCode >= 51 && wCode <= 67
          ? 'rain'
          : wCode >= 71 && wCode <= 77
          ? 'snow'
          : 'partly_cloudy';

      return {
        lat,
        lon,
        temperature_c: Math.round(temp * 10) / 10,
        feels_like_c: Math.round(Number(c.apparent_temperature ?? temp) * 10) / 10,
        humidity_percent: Math.round(Number(c.relative_humidity_2m ?? 65)),
        cloud_cover_percent: Math.round(Number(c.cloud_cover ?? 30)),
        wind_speed_kmh: Math.round(Number(c.wind_speed_10m ?? 12) * 10) / 10,
        wind_speed_ms: Math.round(((c.wind_speed_10m ?? 12) / 3.6) * 10) / 10,
        wind_direction_deg: Number(c.wind_direction_10m ?? 240),
        wind_compass: 'W',
        wind_arrow: '←',
        precipitation_mm: Number(c.precipitation ?? 0),
        weather_code: wCode,
        condition,
        icon,
      };
    }
  } catch {
    // Ignore and fallback
  }

  return {
    lat,
    lon,
    temperature_c: 18.4,
    feels_like_c: 18.0,
    humidity_percent: 65,
    cloud_cover_percent: 35,
    wind_speed_kmh: 14.0,
    wind_speed_ms: 3.9,
    wind_direction_deg: 240,
    wind_compass: 'W',
    wind_arrow: '←',
    precipitation_mm: 0.0,
    weather_code: 2,
    condition: 'Partly cloudy',
    icon: 'partly_cloudy',
  };
}
