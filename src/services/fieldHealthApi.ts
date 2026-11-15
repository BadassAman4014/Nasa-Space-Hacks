import { apiRequest } from './apiClient';

/** Where a value comes from. Shown next to every number in the UI. */
export type Provenance =
  | 'measured'
  | 'observed'
  | 'satellite_estimate'
  | 'modelled'
  | 'derived'
  | 'farmer_input'
  | 'unavailable';

export interface Unavailable {
  available: false;
  reason: string;
  provenance?: Provenance;
  pending_task?: string | null;
  [key: string]: any;
}

export interface MoistureStatus {
  available: true;
  class: 'red' | 'yellow' | 'green';
  label: string;
  percentile: number;
  rootzone_m3m3: number;
  date: string;
  provenance: Provenance;
  source: string;
  rule: string;
  climatology_median_m3m3?: number;
  climatology_p10_m3m3?: number;
  climatology_p90_m3m3?: number;
  climatology_samples?: number;
  climatology_years?: string;
  scale_note: string;
}

export interface RainSummary {
  available: true;
  provenance: Provenance;
  source: string;
  as_of: string;
  days_since_rain: number | null;
  days_since_rain_rule: string;
  rain_7d_mm: number;
  rain_30d_mm: number;
  rain_365d_mm: number;
  heavy_days_365d: number;
  daily: { date: string; precip_mm: number; granule: string }[];
}

export interface SoilComponent {
  name: string;
  value: number;
  unit: string;
  score: number;
  rule: string;
}

export interface SoilHealth {
  available: true;
  score: number;
  label: string;
  components: SoilComponent[];
  weakest: string;
  texture: string;
  sand_pct: number;
  clay_pct: number;
  silt_pct: number;
  provenance: Provenance;
  source: string;
  method: string;
}

export interface NitrogenOptions {
  crops: Record<string, string>;
  previous_crops: Record<string, string>;
}

export interface FarmerInputs {
  crop: string | null;
  yield_target: number | null;
  previous_crop: string | null;
  nmin_kg_ha: number | null;
  organic_n_last_year_kg_ha: number | null;
  last_n_application_date: string | null;
  last_n_application_kg_ha: number | null;
  updated_at?: string | null;
}

export interface NitrogenEstimate {
  available: boolean;
  reason?: string;
  missing_inputs?: string[];
  estimate_kg_n_ha?: number;
  applied_kg_n_ha?: number | null;
  remaining_kg_n_ha?: number | null;
  lines?: { label: string; kg_n_ha: number }[];
  warnings?: string[];
  options: NitrogenOptions;
  inputs: FarmerInputs;
  provenance?: Provenance;
}

export interface WeatherDay {
  date: string;
  day_name: string;
  temp_min_c: number;
  temp_max_c: number;
  precipitation_mm: number;
  precipitation_probability: number | null;
  wind_speed_ms: number | null;
  condition: string;
  icon: string;
}

export interface FieldWeather {
  available: true;
  provenance: Provenance;
  source: string;
  current: {
    temperature_c: number;
    feels_like_c: number | null;
    humidity_percent: number;
    wind_speed_ms: number;
    wind_compass: string;
    precipitation_mm: number;
    condition: string;
    icon: string;
    observation_time: string;
  };
  forecast_3d: WeatherDay[];
  alerts?: { available: boolean; region?: string | null; alerts: { label: string; level_label: string; start: string | null; end: string | null; description: string | null }[] } | null;
}

export interface MapField {
  field_id: string;
  name: string;
  farm_name?: string;
  area_ha: number;
  crop: string | null;
  geometry: any;
  moisture: MoistureStatus | Unavailable;
  days_since_rain: number | null;
  rain_as_of: string | null;
}

export interface FieldCard {
  field_id: string;
  name: string;
  area_ha: number;
  crop: string | null;
  geometry: any;
  moisture: MoistureStatus | Unavailable;
  rain: RainSummary | Unavailable;
  soil_health: SoilHealth | Unavailable;
  nitrogen: NitrogenEstimate;
  weather: FieldWeather | Unavailable;
  generated_at: string;
}

export interface LegendItem {
  colour: string;
  label: string;
}

export interface RasterLayer {
  available: true;
  kind: string;
  title: string;
  png: string;
  bounds: [[number, number], [number, number]];
  date: string;
  legend: LegendItem[];
  note?: string | null;
  provenance: Provenance;
}

export interface OverlayResponse {
  available: boolean;
  layer?: RasterLayer | Unavailable;
  reason?: string | null;
  level?: 'red' | 'yellow' | 'green';
  vulnerability?: string;
  scope?: string;
  note?: string;
}

export interface VegetationTrend {
  available: true;
  source: string;
  period: [string, string];
  observation_count: number;
  series: { date: string; mean_ndvi: number; valid_pixel_percent: number; scene_id: string }[];
  season_peaks: { season: string; peak_ndvi: number; observations: number }[];
  trend:
    | { available: true; status: 'improving' | 'stable' | 'declining'; slope_per_year: number; explanation: string; method: string }
    | { available: false; reason: string };
  crop_note: string;
}

export interface YieldZones {
  available: true;
  zones: { zone: 'high' | 'medium' | 'low'; area_ha: number; percent_of_field: number }[];
  stability: any;
  seasons_used: string[];
  seasons_total: number;
  observations_used: number;
  season_window: string;
  method: string;
  caveat: string;
  legend: { zone: string; label: string }[];
  map_url: string;
  bounds: [[number, number], [number, number]];
  data_source: string;
}

export interface RiskFactor {
  factor: string;
  value: string;
  effect?: string;
  source?: string;
  points?: number;
  type?: string;
}

export interface ErosionRisk {
  available: true;
  level: 'red' | 'yellow' | 'green';
  dominant: 'wind' | 'water';
  water_points: number;
  wind_points: number;
  factors: RiskFactor[];
  recommendation: string;
  method: string;
}

export interface LeachingRisk {
  available: true;
  level: 'red' | 'yellow' | 'green';
  vulnerability: 'low' | 'medium' | 'high';
  alerts: { level: 'red' | 'yellow' | 'info'; text: string }[];
  factors: RiskFactor[];
  seeding_window:
    | { available: true; status: 'open' | 'closed'; text: string; rule: string; soil_temp_3d_mean_c: number; rain_3d_mm: number | null; source: string }
    | Unavailable;
  method: string;
}

export interface MoistureTrend {
  available: true;
  period: [string, string];
  usual_range: { p10: number; median: number; p90: number; years: string; samples: number; window: string } | null;
  modelled: { date: string; rootzone_m3m3: number; surface_m3m3: number | null; rootzone_percentile: number | null }[];
  measured: { date: string; pass: string; value_m3m3: number; quality: string; used: boolean }[];
  sources: Record<string, { name: string; provenance: Provenance; depth: string; resolution: string; filter?: string }>;
  events: { type: string; text: string; date?: string }[];
  change_m3m3?: number;
  change_percentile_points?: number;
  rejected_measurements?: number;
}

export interface ActionCard {
  priority: number;
  title: string;
  body: string;
  evidence: string[];
}

export interface HealthTrend {
  field_id: string;
  vegetation_trend: VegetationTrend | Unavailable;
  yield_zones: YieldZones | Unavailable;
  erosion: ErosionRisk | Unavailable;
  leaching: LeachingRisk | Unavailable;
  moisture_trend: MoistureTrend | Unavailable;
  actions: ActionCard[];
  card: FieldCard;
}

export const fieldHealthApi = {
  getMap: (refresh = false) => apiRequest<MapField[]>(`/field-health/map${refresh ? '?refresh=true' : ''}`),
  getCard: (fieldId: string, refresh = false) =>
    apiRequest<FieldCard>(`/field-health/fields/${encodeURIComponent(fieldId)}/card${refresh ? '?refresh=true' : ''}`),
  getOverlay: (fieldId: string, kind: 'moisture' | 'nitrogen' | 'leaching') =>
    apiRequest<OverlayResponse>(`/field-health/fields/${encodeURIComponent(fieldId)}/overlay/${kind}`),
  getTrend: (fieldId: string, refresh = false) =>
    apiRequest<HealthTrend>(`/field-health/fields/${encodeURIComponent(fieldId)}/trend${refresh ? '?refresh=true' : ''}`),
  saveInputs: (fieldId: string, inputs: Partial<FarmerInputs>) =>
    apiRequest<FarmerInputs>(`/field-health/fields/${encodeURIComponent(fieldId)}/inputs`, {
      method: 'PUT',
      body: JSON.stringify(inputs),
    }),
};
