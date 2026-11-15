export type FieldCategory = 'crop' | 'field' | 'soil' | 'fertilizer' | 'advisor';

export interface FieldOption {
  id: string;
  name: string;
  farm_name: string;
  area_ha: number;
  crop_name?: string | null;
  status: string;
  is_special?: boolean;
}

export interface SoilGridsData {
  ph_h2o: number;
  soc_g_kg: number;
  sand_percent: number;
  silt_percent: number;
  clay_percent: number;
  texture_class: string;
  bulk_density_g_cm3: number;
  cec_mmol_kg: number;
  total_nitrogen_g_kg: number;
  c_n_ratio: number;
  source: string;
  depth: string;
}

export interface FieldContextData {
  field_id: string;
  field_name?: string;
  farm_name?: string;
  area_ha?: number;
  context_text?: string;
  structured_data?: {
    soil?: {
      ph: number;
      organic_carbon_g_kg: number;
      texture: string;
      total_nitrogen_g_kg: number;
      c_n_ratio?: number;
      sand_pct: number;
      silt_pct: number;
      clay_pct: number;
      bulk_density_g_cm3: number;
      cec_mmol_kg: number;
      source: string;
      depth: string;
    } | null;
    [key: string]: unknown;
  };
  crop_name?: string | null;
  crop_category?: string | null;
  coordinates?: [number, number];
  bounds?: number[];
  soilgrids?: SoilGridsData | null;
  satellite_ndvi?: {
    latest_ndvi?: number;
    delta_vs_previous?: string;
    mean_ndvi?: number;
    sensor?: string;
  } | null;
  weather?: {
    temperature_c?: number;
    condition?: string;
    wind_kmh?: number;
    rain_mm?: number;
    location?: string;
  } | null;
  summary_text?: string;
  category?: FieldCategory;
}

export interface ImageAttachment {
  name: string;
  mime_type: string;
  data: string; // base64
  size_bytes?: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  images?: ImageAttachment[];
  field_id?: string | null;
  field_name?: string | null;
  category?: FieldCategory | null;
  isStreaming?: boolean;
  model?: string;
}

export interface ConversationSummary {
  id: string;
  title: string;
  field_id?: string | null;
  field_name?: string | null;
  category?: FieldCategory | null;
  created_at: string;
  updated_at: string;
  message_count: number;
}

export type WorkflowStep = 'select-field' | 'select-category' | 'loading-context' | 'ready';
