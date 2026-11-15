/**
 * FieldShift AI - NASA Environmental Data API Service
 * Interacts with FastAPI backend for NASA SMAP (soil moisture), NASA GPM IMERG (precipitation),
 * and NASA MODIS (vegetation indices NDVI/EVI).
 */

import { baseUrl } from './apiClient';

export type DatasetType = 'smap' | 'gpm' | 'modis';

export interface EnvironmentalDatasetInfo {
  id: string;
  source: string;
  product_id: string;
  product_version: string;
  variable_name: string;
  native_unit: string;
  spatial_resolution: string;
  temporal_resolution: string;
  description: string;
  is_coarse_resolution: boolean;
  effective_resolution_note: string;
}

export interface EnvironmentalObservationItem {
  id: string;
  field_id: string;
  dataset_id: string;
  source: string;
  variable_name: string;
  observation_date: string;
  period_start: string;
  period_end: string;
  mean_value: number;
  minimum_value: number;
  maximum_value: number;
  standard_deviation: number;
  unit: string;
  valid_pixel_count: number;
  coverage_percentage: number;
  quality_status: string;
  source_granule: string;
  is_coarse_resolution: boolean;
  resolution_limitation?: string;
  metadata?: Record<string, any>;
  created_at?: string;
}

export interface EnvironmentalSummaryItem {
  id: string;
  field_id: string;
  dataset_id: string;
  aggregation_type: string;
  period_start: string;
  period_end: string;
  metric_name: string;
  metric_value: number;
  unit: string;
  coverage_percentage: number;
}

export interface SmapFieldReport {
  dataset_info: EnvironmentalDatasetInfo;
  latest_soil_moisture?: number;
  latest_observation_date?: string;
  unit: string;
  is_coarse_resolution: boolean;
  resolution_limitation: string;
  observations: EnvironmentalObservationItem[];
  weekly_means: Array<{ period: string; mean_soil_moisture: number; count: number; unit: string }>;
  monthly_means: Array<{ month: string; mean_soil_moisture: number; min: number; max: number; count: number; unit: string }>;
  seasonal_mean?: number;
}

export interface GpmFieldReport {
  dataset_info: EnvironmentalDatasetInfo;
  latest_precipitation_mm?: number;
  latest_observation_date?: string;
  unit: string;
  product_run: string;
  is_coarse_resolution: boolean;
  resolution_limitation: string;
  observations: EnvironmentalObservationItem[];
  monthly_accumulation_mm: Array<{ month: string; accumulated_precipitation_mm: number; rainy_days: number; heavy_rain_events: number; days_recorded: number; unit: string }>;
  total_seasonal_accumulation_mm?: number;
  rainy_days_count: number;
  heavy_rain_events_count: number;
}

export interface ModisFieldReport {
  dataset_info: EnvironmentalDatasetInfo;
  latest_ndvi?: number;
  latest_evi?: number;
  latest_composite_date?: string;
  is_subpixel: boolean;
  resolution_limitation?: string;
  observations: EnvironmentalObservationItem[];
  seasonal_max_ndvi?: number;
  seasonal_mean_ndvi?: number;
  seasonal_mean_evi?: number;
  valid_coverage_pct: number;
}

export interface FieldEnvironmentalResponse {
  field_id: string;
  field_name: string;
  field_area_ha: number;
  query_start_date: string;
  query_end_date: string;
  smap?: SmapFieldReport;
  gpm?: GpmFieldReport;
  modis?: ModisFieldReport;
  summaries: EnvironmentalSummaryItem[];
  last_updated?: string;
  message?: string;
}

export interface EnvironmentalExtractionRequest {
  start_date?: string;
  end_date?: string;
  datasets?: DatasetType[];
  force_refresh?: boolean;
}

export interface EnvironmentalExtractionStatus {
  field_id: string;
  status: 'not_started' | 'processing' | 'completed' | 'partial' | 'failed';
  progress_percentage: number;
  current_dataset?: string;
  message: string;
  last_updated?: string;
}

export const environmentApi = {
  /**
   * Get metadata for all supported NASA datasets.
   */
  async getDatasets(): Promise<EnvironmentalDatasetInfo[]> {
    const res = await fetch(`${baseUrl}/nasa/datasets`);
    if (!res.ok) throw new Error(`Failed to load NASA datasets: ${res.status}`);
    return res.json();
  },

  /**
   * Get environmental observations and summaries for a field.
   */
  async getFieldEnvironmental(
    field_id: string,
    params?: { dataset?: string; start_date?: string; end_date?: string }
  ): Promise<FieldEnvironmentalResponse> {
    const q = new URLSearchParams();
    if (params?.dataset) q.append('dataset', params.dataset);
    if (params?.start_date) q.append('start_date', params.start_date);
    if (params?.end_date) q.append('end_date', params.end_date);

    const qs = q.toString() ? `?${q.toString()}` : '';
    const res = await fetch(`${baseUrl}/fields/${field_id}/environmental${qs}`);
    if (!res.ok) {
      if (res.status === 404) throw new Error(`Field not found: ${field_id}`);
      throw new Error(`Failed to load environmental data: ${res.status}`);
    }
    return res.json();
  },

  /**
   * Trigger spatial extraction for a field across NASA datasets.
   */
  async extractEnvironmental(
    field_id: string,
    request?: EnvironmentalExtractionRequest
  ): Promise<FieldEnvironmentalResponse> {
    const res = await fetch(`${baseUrl}/fields/${field_id}/environmental/extract`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request || {}),
    });
    if (!res.ok) throw new Error(`Environmental extraction failed: ${res.status}`);
    return res.json();
  },

  /**
   * Force refresh of NASA satellite observations.
   */
  async refreshEnvironmental(
    field_id: string,
    request?: EnvironmentalExtractionRequest
  ): Promise<FieldEnvironmentalResponse> {
    const res = await fetch(`${baseUrl}/fields/{field_id}/environmental/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request || {}),
    });
    if (!res.ok) throw new Error(`Refresh failed: ${res.status}`);
    return res.json();
  },

  /**
   * Get extraction status for a field.
   */
  async getStatus(field_id: string): Promise<EnvironmentalExtractionStatus> {
    const res = await fetch(`${baseUrl}/fields/${field_id}/environmental/status`);
    if (!res.ok) throw new Error(`Failed to load status: ${res.status}`);
    return res.json();
  },

  /**
   * Retrieve stored summaries for a field.
   */
  async getSummaries(field_id: string, dataset?: string): Promise<EnvironmentalSummaryItem[]> {
    const qs = dataset ? `?dataset=${encodeURIComponent(dataset)}` : '';
    const res = await fetch(`${baseUrl}/fields/${field_id}/environmental/summary${qs}`);
    if (!res.ok) throw new Error(`Failed to load summaries: ${res.status}`);
    return res.json();
  },
};
