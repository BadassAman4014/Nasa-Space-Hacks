/**
 * Frontend API client for Field Analytics & Historical Satellite Report pipeline.
 * Inspired by OneSoil Yield, provides field-level multi-sensor analytics.
 */

import { apiRequest } from './apiClient';

export interface CurrentWeather {
  temperature_c: number;
  feels_like_c: number;
  precipitation_mm: number;
  wind_speed_kmh: number;
  humidity_percent: number;
  condition: string;
  is_forecast: boolean;
  observation_date: string;
  station_or_provider: string;
}

export interface FieldStatusSummary {
  field_id: string;
  name: string;
  farm_id: string;
  farm_name: string;
  area_ha: number;
  current_crop: string;
  planting_date?: string;
  harvest_date?: string;
  days_since_planting?: number;
  location: string;
  boundary_source: string;
  analysis_status: string;
  current_weather?: CurrentWeather;
  geometry?: any;
  bounds?: [number, number, number, number];
}

export interface SatelliteObservation {
  id: string;
  scene_id: string;
  acquisition_date: string;
  sensor: string;
  cloud_cover_percent: number;
  mean_ndvi?: number | null;
  median_ndvi?: number | null;
  min_ndvi?: number | null;
  max_ndvi?: number | null;
  std_ndvi?: number | null;
  valid_pixel_percent: number;
  valid_pixel_count: number;
  is_included: boolean;
  season: string;
  rgb_preview_url?: string;
  ndvi_preview_url?: string;
}

export interface NDVITimeSeriesResponse {
  field_id: string;
  field_name: string;
  area_ha: number;
  observations: SatelliteObservation[];
  latest_ndvi?: number;
  latest_date?: string;
  previous_ndvi?: number;
  previous_date?: string;
  change_percent?: number;
  data_source: string;
  resolution: string;
  unavailable_note?: string;
  total_count?: number;
  has_more?: boolean;
  batch_offset?: number;
  batch_limit?: number;
}

export interface DailyPrecipitation {
  date: string;
  daily_mm: number;
  accumulated_mm: number;
}

export interface PrecipitationTimeSeriesResponse {
  field_id: string;
  start_date: string;
  end_date: string;
  total_accumulated_mm: number;
  daily_records: DailyPrecipitation[];
  data_source: string;
  resolution: string;
  last_updated: string;
}

export interface DailyGDD {
  date: string;
  tmin_c: number;
  tmax_c: number;
  daily_gdd: number;
  accumulated_gdd: number;
}

export interface GDDTimeSeriesResponse {
  field_id: string;
  crop: string;
  base_temperature_c: number;
  start_date: string;
  end_date: string;
  total_accumulated_gdd: number;
  valid_days: number;
  daily_records: DailyGDD[];
  data_source: string;
  formula: string;
}

export interface ProductivityZone {
  zone_id: string;
  label: string;
  color: string;
  area_ha: number;
  area_percent: number;
  mean_ndvi?: number | null;
}

export interface ProductivityReportResponse {
  field_id: string;
  seasons_included: string[];
  total_seasons_analyzed: number;
  zones: ProductivityZone[];
  stable_area_ha: number;
  stable_area_percent: number;
  stability_rating: string;
  methodology: string;
  min_observations_met: boolean;
  status_note: string;
  productivity_map_url?: string;
}

export interface SoilBrightnessResponse {
  field_id: string;
  observation_date: string;
  sensor: string;
  mean_brightness: number;
  min_brightness: number;
  max_brightness: number;
  unit: string;
  methodology: string;
  is_available: boolean;
  status_note: string;
  map_url?: string;
}

export interface ElevationResponse {
  field_id: string;
  data_source: string;
  min_elevation_m: number;
  max_elevation_m: number;
  mean_elevation_m: number;
  elevation_range_m: number;
  mean_slope_deg: number;
  map_url?: string;
}

export interface CorrelationMetric {
  layer_a: string;
  layer_b: string;
  pearson_r: number;
  pearson_p_value: number;
  spearman_rho: number;
  spearman_p_value: number;
  sample_count: number;
  interpretation: string;
}

export interface CorrelationResponse {
  field_id: string;
  grid_resolution_m: number;
  sample_pixel_count: number;
  effective_sample_size?: number | null;
  lag1_autocorrelation?: number | null;
  productivity_vs_elevation?: CorrelationMetric | null;
  productivity_vs_brightness?: CorrelationMetric | null;
  spatial_autocorrelation_note: string;
  scientific_disclaimer: string;
}

export interface FullFieldReportResponse {
  field_id: string;
  field_summary: FieldStatusSummary;
  productivity: ProductivityReportResponse;
  soil_brightness: SoilBrightnessResponse;
  elevation: ElevationResponse;
  correlation: CorrelationResponse;
  historical_observations: SatelliteObservation[];
  soil_profile?: Record<string, any>;
  generated_at: string;
}

export const fieldAnalyticsApi = {
  getSummary: (fieldId: string) =>
    apiRequest<FieldStatusSummary>(`/fields/${fieldId}/analytics/summary`),

  updatePlantingDate: (fieldId: string, payload: { planting_date: string; harvest_date?: string }) =>
    apiRequest<any>(`/fields/${fieldId}/analytics/planting-date`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  getNDVITimeSeries: (fieldId: string, refresh = false, limit?: number, offset = 0, order = 'desc') => {
    const params = new URLSearchParams();
    if (refresh) params.append('refresh', 'true');
    if (limit != null) params.append('limit', String(limit));
    if (offset > 0) params.append('offset', String(offset));
    if (order) params.append('order', order);
    const qs = params.toString() ? `?${params.toString()}` : '';
    return apiRequest<NDVITimeSeriesResponse>(`/fields/${fieldId}/analytics/ndvi${qs}`);
  },

  getPrecipitation: (fieldId: string) =>
    apiRequest<PrecipitationTimeSeriesResponse>(`/fields/${fieldId}/analytics/weather`),

  getGDD: (fieldId: string, baseTemp?: number) => {
    const q = baseTemp !== undefined ? `?base_temp=${baseTemp}` : '';
    return apiRequest<GDDTimeSeriesResponse>(`/fields/${fieldId}/analytics/gdd${q}`);
  },

  getFullReport: (fieldId: string, refresh = false) =>
    apiRequest<FullFieldReportResponse>(`/fields/${fieldId}/analytics/report?refresh=${refresh}`),

  toggleObservation: (fieldId: string, observationId: string, isIncluded: boolean) =>
    apiRequest<FullFieldReportResponse>(`/fields/${fieldId}/analytics/observations/${observationId}/toggle`, {
      method: 'POST',
      body: JSON.stringify({ is_included: isIncluded }),
    }),

  runAnalysis: (fieldId: string) =>
    apiRequest<FullFieldReportResponse>(`/fields/${fieldId}/analytics/analyze`, {
      method: 'POST',
    }),
};
