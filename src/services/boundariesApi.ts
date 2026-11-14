/**
 * FieldShift AI - Brandenburg Agricultural Boundary & User Farms API Service
 * Connects frontend to FastAPI endpoints serving Digitales Feldblockkataster (DFBK),
 * InVeKoS boundaries, and durable persistent user farm & field records.
 */

import type { Feature, FeatureCollection, Polygon, MultiPolygon } from 'geojson';

export interface BoundaryProperties {
  id: string;
  external_id: string;
  source: string;
  source_dataset_id: string;
  land_use_category: string;
  category_name?: string;
  official_net_ha: number;
  calculated_area_ha: number;
  validity_start?: string;
  validity_end?: string;
  reference_year?: number;
  is_agricultural: boolean;
  attribution: string;
  is_imported?: boolean;
}

export type BoundaryFeature = Feature<Polygon | MultiPolygon, BoundaryProperties>;
export type BoundaryFeatureCollection = FeatureCollection<Polygon | MultiPolygon, BoundaryProperties> & {
  properties?: { count?: number; total_in_view?: number; truncated?: boolean; total_area_ha?: number };
};

export interface BoundaryProviderInfo {
  name: string;
  title: string;
  role: string;
  status: string;
  record_count?: number;
  version_year?: number;
  attribution: string;
  wfs_status?: string;
  available?: boolean;
}

export interface BoundaryStatusResponse {
  providers: BoundaryProviderInfo[];
  dataset_version: string;
  active_records: number;
  total_agricultural_hectares: number;
  primary_provider: string;
  last_updated: string;
}

export interface UserFarm {
  id: string;
  name: string;
  location: string;
  created_at: string;
  updated_at: string;
  field_count: number;
  total_area_ha: number;
}

export interface SavedField {
  id: string;
  farm_id: string;
  farm_name?: string;
  farm_location?: string;
  name: string;
  source_boundary_id?: string;
  boundary_source?: string;
  land_use_category?: string;
  original_geometry?: Polygon | MultiPolygon;
  geometry: Polygon | MultiPolygon;
  area_hectares: number;
  current_crop: string;
  attribution: string;
  created_at: string;
  updated_at: string;
}

export type ImportedField = SavedField;

export interface ImportBoundariesResponse {
  status: string;
  farm_id: string;
  imported_count: number;
  fields: SavedField[];
}

// Category descriptions for human UI display (Distinct palettes; Green is reserved for Saved Fields)
export const CATEGORY_DESCRIPTIONS: Record<string, { label: string; desc: string; color: string }> = {
  'AL': { label: 'Ackerland', desc: 'Arable cropland', color: '#eab308' },
  'GL': { label: 'Grünland', desc: 'Permanent grassland / pasture', color: '#38bdf8' },
  'DK': { label: 'Dauerkultur', desc: 'Permanent orchards / vineyards', color: '#c084fc' },
  'AL-AF': { label: 'Ackerland Agroforst', desc: 'Arable agroforestry', color: '#ca8a04' },
  'GL-AF': { label: 'Grünland Agroforst', desc: 'Grassland agroforestry', color: '#0284c7' },
  'DK-AF': { label: 'Dauerkultur Agroforst', desc: 'Permanent agroforestry', color: '#9333ea' },
  'AL-APV': { label: 'Ackerland Agri-PV', desc: 'Agri-photovoltaic arable', color: '#f59e0b' },
  'GL-APV': { label: 'Grünland Agri-PV', desc: 'Agri-photovoltaic grassland', color: '#0ea5e9' },
  'DK-APV': { label: 'Dauerkultur Agri-PV', desc: 'Agri-photovoltaic permanent crop', color: '#a855f7' },
  'GL-ELP': { label: 'Grünland ELP', desc: 'Grassland low productivity', color: '#06b6d4' },
  'GL-MO': { label: 'Moor-Grünland', desc: 'Peatland grassland', color: '#64748b' },
};

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? '';

async function apiFetch<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const url = `${API_BASE}${endpoint}`;
  try {
    const res = await fetch(url, options);
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`API error ${res.status}: ${errText || res.statusText}`);
    }
    return (await res.json()) as T;
  } catch (err) {
    if (!API_BASE) {
      const fallbackUrl = `http://127.0.0.1:8000${endpoint}`;
      const res = await fetch(fallbackUrl, options);
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Fallback API error ${res.status}: ${errText || res.statusText}`);
      }
      return (await res.json()) as T;
    }
    throw err;
  }
}

export const boundariesApi = {
  // --------------------------------------------------------------------------
  // Reference Boundaries (DFBK & InVeKoS)
  // --------------------------------------------------------------------------
  getStatus(): Promise<BoundaryStatusResponse> {
    return apiFetch<BoundaryStatusResponse>('/api/boundaries/status');
  },

  getViewportBoundaries(params: {
    west: number;
    south: number;
    east: number;
    north: number;
    source?: string;
    land_use_category?: string;
    min_area?: number;
    max_area?: number;
    limit?: number;
    zoom?: number;
  }): Promise<BoundaryFeatureCollection> {
    const q = new URLSearchParams();
    q.set('west', params.west.toFixed(6));
    q.set('south', params.south.toFixed(6));
    q.set('east', params.east.toFixed(6));
    q.set('north', params.north.toFixed(6));
    if (params.source) q.set('source', params.source);
    if (params.land_use_category && params.land_use_category !== 'ALL') {
      q.set('land_use_category', params.land_use_category);
    }
    if (params.min_area !== undefined) q.set('min_area', params.min_area.toString());
    if (params.max_area !== undefined) q.set('max_area', params.max_area.toString());
    if (params.limit !== undefined) q.set('limit', params.limit.toString());
    if (params.zoom !== undefined) q.set('zoom', params.zoom.toString());

    return apiFetch<BoundaryFeatureCollection>(`/api/boundaries/viewport?${q.toString()}`);
  },

  getNearbyBoundaries(params: {
    lat: number;
    lon: number;
    radius?: number;
    source?: string;
    land_use_category?: string;
    min_area?: number;
    max_area?: number;
    limit?: number;
  }): Promise<BoundaryFeatureCollection> {
    const q = new URLSearchParams();
    q.set('lat', params.lat.toFixed(6));
    q.set('lon', params.lon.toFixed(6));
    if (params.radius !== undefined) q.set('radius', params.radius.toString());
    if (params.source) q.set('source', params.source);
    if (params.land_use_category && params.land_use_category !== 'ALL') {
      q.set('land_use_category', params.land_use_category);
    }
    if (params.min_area !== undefined) q.set('min_area', params.min_area.toString());
    if (params.max_area !== undefined) q.set('max_area', params.max_area.toString());
    if (params.limit !== undefined) q.set('limit', params.limit.toString());

    return apiFetch<BoundaryFeatureCollection>(`/api/boundaries/nearby?${q.toString()}`);
  },

  searchBoundaries(params: {
    location?: string;
    lat?: number;
    lon?: number;
    radius?: number;
    source?: string;
    land_use_category?: string;
    min_area?: number;
    max_area?: number;
    limit?: number;
  }): Promise<BoundaryFeatureCollection> {
    const q = new URLSearchParams();
    if (params.location) q.set('location', params.location);
    if (params.lat !== undefined) q.set('lat', params.lat.toString());
    if (params.lon !== undefined) q.set('lon', params.lon.toString());
    if (params.radius !== undefined) q.set('radius', params.radius.toString());
    if (params.source) q.set('source', params.source);
    if (params.land_use_category && params.land_use_category !== 'ALL') {
      q.set('land_use_category', params.land_use_category);
    }
    if (params.min_area !== undefined) q.set('min_area', params.min_area.toString());
    if (params.max_area !== undefined) q.set('max_area', params.max_area.toString());
    if (params.limit !== undefined) q.set('limit', params.limit.toString());

    return apiFetch<BoundaryFeatureCollection>(`/api/boundaries/search?${q.toString()}`);
  },

  getBoundaryById(id: string): Promise<BoundaryFeature> {
    return apiFetch<BoundaryFeature>(`/api/boundaries/${encodeURIComponent(id)}`);
  },

  // --------------------------------------------------------------------------
  // User Farms Management (Durable SQLite DB)
  // --------------------------------------------------------------------------
  listFarms(): Promise<UserFarm[]> {
    return apiFetch<UserFarm[]>('/api/farms');
  },

  getFarm(farmId: string): Promise<UserFarm> {
    return apiFetch<UserFarm>(`/api/farms/${encodeURIComponent(farmId)}`);
  },

  createFarm(data: { name: string; location?: string }): Promise<UserFarm> {
    return apiFetch<UserFarm>('/api/farms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  },

  deleteFarm(farmId: string): Promise<{ status: string; message: string }> {
    return apiFetch<{ status: string; message: string }>(`/api/farms/${encodeURIComponent(farmId)}`, {
      method: 'DELETE',
    });
  },

  // --------------------------------------------------------------------------
  // User Fields Management (Durable SQLite DB)
  // --------------------------------------------------------------------------
  listFields(farmId?: string): Promise<SavedField[]> {
    const q = farmId && farmId !== 'all' ? `?farm_id=${encodeURIComponent(farmId)}` : '';
    return apiFetch<SavedField[]>(`/api/fields${q}`);
  },

  getField(fieldId: string): Promise<SavedField> {
    return apiFetch<SavedField>(`/api/fields/${encodeURIComponent(fieldId)}`);
  },

  createField(data: {
    farm_id: string;
    name: string;
    geometry: Polygon | MultiPolygon;
    current_crop?: string;
    source_boundary_id?: string;
    boundary_source?: string;
    land_use_category?: string;
    area_hectares?: number;
  }): Promise<{ status: string; field: SavedField }> {
    return apiFetch<{ status: string; field: SavedField }>('/api/fields', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  },

  updateField(
    fieldId: string,
    data: {
      name?: string;
      farm_id?: string;
      current_crop?: string;
      geometry?: Polygon | MultiPolygon;
    }
  ): Promise<{ status: string; field: SavedField }> {
    return apiFetch<{ status: string; field: SavedField }>(`/api/fields/${encodeURIComponent(fieldId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  },

  deleteField(fieldId: string): Promise<{ status: string; message: string }> {
    return apiFetch<{ status: string; message: string }>(`/api/fields/${encodeURIComponent(fieldId)}`, {
      method: 'DELETE',
    });
  },

  importBoundaries(data: {
    farm_id: string;
    boundary_ids: string[];
    custom_names?: Record<string, string>;
    current_crop?: string;
  }): Promise<ImportBoundariesResponse> {
    return apiFetch<ImportBoundariesResponse>('/api/fields/import-boundaries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  },

  saveFieldGeometry(fieldId: string, geometry: Polygon | MultiPolygon): Promise<{ status: string; field: SavedField }> {
    return apiFetch<{ status: string; field: SavedField }>(`/api/fields/${encodeURIComponent(fieldId)}/geometry`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ geometry }),
    });
  },

  getFarmFields(farmId: string): Promise<{ farm_id: string; count: number; fields: SavedField[] }> {
    return apiFetch<{ farm_id: string; count: number; fields: SavedField[] }>(`/api/farms/${encodeURIComponent(farmId)}/fields`);
  },
};

// ----------------------------------------------------------------------------
// AI Satellite Field Boundary Detection API
// ----------------------------------------------------------------------------

export interface ScanRequest {
  bbox: [number, number, number, number]; // [west, south, east, north]
  zoom?: number;
  acquisition_date?: string;
  max_cloud_cover?: number;
  min_confidence?: number;
  min_field_area_ha?: number;
}

export type ScanJobStatusType = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface ScanJobStatus {
  job_id: string;
  status: ScanJobStatusType;
  stage: string;
  progress: number;
  created_at: string;
  updated_at: string;
  error_details?: string | null;
  prediction_count: number;
  bbox: [number, number, number, number];
  scene_id?: string | null;
  imagery_date?: string | null;
  sensor?: string | null;
}

export interface PredictionFeatureProperties {
  id: string;
  name: string;
  area_hectares: number;
  confidence: number;
  min_confidence: number;
  perimeter_m: number;
  model_version: string;
  imagery_date: string;
  sensor: string;
  source: 'ai_prediction';
  geographic_region: string;
  quality_status: string;
  experimental: boolean;
}

export interface PredictionFeature {
  type: 'Feature';
  id: string;
  geometry: Polygon | MultiPolygon;
  properties: PredictionFeatureProperties;
}

export interface PredictionCollection {
  type: 'FeatureCollection';
  features: PredictionFeature[];
  metadata: {
    job_id?: string;
    model_version?: string;
    sensor?: string;
    imagery_date?: string;
    scene_id?: string;
    total_fields?: number;
    total_area_ha?: number;
    bbox?: [number, number, number, number];
    status?: string;
    experimental?: boolean;
    [key: string]: any;
  };
}

export interface ModelStatusResponse {
  model_ready: boolean;
  model_version: string;
  architecture: string;
  parameters_count: number;
  input_channels: string[];
  input_resolution_m: number;
  device: string;
  training_readiness: string;
  validation_metrics: Record<string, any>;
  geographic_validation: Record<string, any>;
  checkpoint_path: string;
}

export const aiFieldDetectionApi = {
  getModelStatus(): Promise<ModelStatusResponse> {
    return apiFetch<ModelStatusResponse>('/api/ai-field-detection/model/status');
  },

  startScan(req: ScanRequest): Promise<ScanJobStatus> {
    return apiFetch<ScanJobStatus>('/api/ai-field-detection/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });
  },

  getJobStatus(jobId: string): Promise<ScanJobStatus> {
    return apiFetch<ScanJobStatus>(`/api/ai-field-detection/jobs/${encodeURIComponent(jobId)}`);
  },

  getPredictions(jobId: string): Promise<PredictionCollection> {
    return apiFetch<PredictionCollection>(`/api/ai-field-detection/jobs/${encodeURIComponent(jobId)}/predictions`);
  },

  cancelScan(jobId: string): Promise<{ status: string; job_id: string }> {
    return apiFetch<{ status: string; job_id: string }>(`/api/ai-field-detection/jobs/${encodeURIComponent(jobId)}/cancel`, {
      method: 'POST',
    });
  },
};

