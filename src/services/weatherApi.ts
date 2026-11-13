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
