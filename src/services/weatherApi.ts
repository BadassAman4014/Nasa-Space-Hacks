import { baseUrl } from './apiClient';

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
  label: string;
  temp_c: number;
  temperature_c: number;
  humidity_percent: number | null;
  dew_point_c: number | null;
  cloud_cover_percent: number;
  precipitation_mm: number;
  precipitation_probability: number | null;
  condition: string;
  icon: string;
  wind_speed_ms: number;
  wind_direction_deg: number | null;
  is_now?: boolean;
}

export interface DwdAlert {
  event: string;
  category: string;
  label: string;
  level: number;
  level_label: string;
  headline: string | null;
  description: string | null;
  instruction: string | null;
  start: string | null;
  end: string | null;
  is_active: boolean;
}

export interface DwdAlerts {
  available: boolean;
  reason: string | null;
  source: string;
  region: string | null;
  warn_cell_id?: string;
  issued_at?: string | null;
  alerts: DwdAlert[];
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
  precipitation_probability: number | null;
  wind_speed_ms: number | null;
  wind_gust_ms?: number | null;
  et0_mm?: number | null;
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

export interface FieldVirtualStationStatus {
  is_active: boolean;
  name: string;
  installed_at: string | null;
  sensors: Record<string, string | null>;
}

export interface FieldWeatherData {
  field_id: string;
  field_name: string;
  farm_name: string;
  area_ha: number;
  crop: string;
  coordinates: [number, number]; // [lat, lon]
  geometry: any;
  virtual_station: FieldVirtualStationStatus;
  current: {
    temperature_c: number;
    feels_like_c: number | null;
    humidity_percent: number;
    dew_point_c: number | null;
    cloud_cover_percent: number;
    wind_speed_ms: number;
    wind_direction_deg: number;
    wind_compass: string;
    wind_arrow: string;
    precipitation_mm: number;
    pressure_hpa: number | null;
    soil_temp_0_7_c: number | null;
    soil_temp_7_28_c: number | null;
    weather_code: number;
    condition: string;
    icon: string;
    observation_time: string;
    timestamp: string;
  };
  alerts?: DwdAlerts;
  elevation_m?: number | null;
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

const API_BASE = `${baseUrl}/weather`;

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
  feels_like_c: number | null;
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
  // The backend is the single source: it returns 503 when Open-Meteo is unreachable.
  // No placeholder observation is fabricated on failure.
  const res = await fetch(`${API_BASE}/point?lat=${lat}&lon=${lon}`);
  if (!res.ok) throw new Error(`Weather unavailable (${res.status})`);
  return res.json();
}
