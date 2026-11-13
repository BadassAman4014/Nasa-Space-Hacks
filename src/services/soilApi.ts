/**
 * FieldShift AI - ISRIC SoilGrids API Service
 * Fetches real 250m resolution soil properties (pH, SOC, texture, bulk density, CEC, nitrogen)
 * and depth intervals for saved user fields in Brandenburg, Germany.
 */

const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api';

export interface VariableMetadata {
  key: string;
  name: string;
  mapped_unit: string;
  conventional_unit: string;
  scale_factor: number;
  description: string;
}

export interface SoilMeasurement {
  property_name: string;
  depth_interval: string;
  mean_value: number;
  minimum_value: number;
  maximum_value: number;
  unit: string;
  raw_mean?: number;
  valid_pixel_count: number;
  coverage_percentage: number;
}

export interface TopsoilSummary {
  depth_interval: string;
  ph: number;
  organic_carbon_g_kg: number;
  organic_carbon_pct: number;
  clay_pct: number;
  sand_pct: number;
  silt_pct: number;
  texture_class: string;
  bulk_density_g_cm3: number;
  cec_mmol_kg: number;
  total_nitrogen_g_kg: number;
  valid_pixel_count: number;
  is_subpixel: boolean;
  resolution_limitation?: string;
}

export interface SoilProfileResponse {
  field_id: string;
  status: 'not_started' | 'processing' | 'completed' | 'partial' | 'failed';
  source: string;
  dataset_version: string;
  spatial_resolution: string;
  extraction_date?: string;
  coverage_percentage: number;
  field_area_ha: number;
  is_subpixel: boolean;
  resolution_limitation?: string;
  topsoil_summary?: TopsoilSummary;
  measurements: SoilMeasurement[];
  depth_intervals: string[];
  supported_properties: string[];
  created_at?: string;
  updated_at?: string;
  message?: string;
}

export interface ExtractionStatusResponse {
  field_id: string;
  status: 'not_started' | 'processing' | 'completed' | 'partial' | 'failed';
  progress_percentage: number;
  message: string;
  last_updated?: string;
}

export interface SupportedVariablesResponse {
  source: string;
  dataset_version: string;
  spatial_resolution: string;
  supported_properties: VariableMetadata[];
  depth_intervals: string[];
  notes: string[];
}

export const soilApi = {
  /**
   * Get cached or extracted soil profile for a specific field.
   */
  async getSoilProfile(fieldId: string): Promise<SoilProfileResponse> {
    const res = await fetch(`${baseUrl}/fields/${fieldId}/soil`);
    if (!res.ok) {
      if (res.status === 404) {
        throw new Error(`Field not found: ${fieldId}`);
      }
      throw new Error(`Failed to load soil profile: ${res.status}`);
    }
    return res.json();
  },

  /**
   * Trigger spatial extraction for a field (or returns cached if already extracted).
   */
  async extractSoil(fieldId: string): Promise<SoilProfileResponse> {
    const res = await fetch(`${baseUrl}/fields/${fieldId}/soil/extract`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) {
      throw new Error(`Extraction failed: ${res.status}`);
    }
    return res.json();
  },

  /**
   * Force refresh / re-extraction of soil data from SoilGrids rasters.
   */
  async refreshSoil(fieldId: string): Promise<SoilProfileResponse> {
    const res = await fetch(`${baseUrl}/fields/${fieldId}/soil/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) {
      throw new Error(`Refresh failed: ${res.status}`);
    }
    return res.json();
  },

  /**
   * Check status of extraction job for a field.
   */
  async getSoilStatus(fieldId: string): Promise<ExtractionStatusResponse> {
    const res = await fetch(`${baseUrl}/fields/${fieldId}/soil/status`);
    if (!res.ok) {
      throw new Error(`Failed to fetch status: ${res.status}`);
    }
    return res.json();
  },

  /**
   * Get metadata of all supported SoilGrids variables and depth intervals.
   */
  async getVariables(): Promise<SupportedVariablesResponse> {
    const res = await fetch(`${baseUrl}/soilgrids/variables`);
    if (!res.ok) {
      throw new Error(`Failed to fetch variables metadata: ${res.status}`);
    }
    return res.json();
  },
};
