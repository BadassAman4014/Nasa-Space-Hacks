export type Provenance = 'live' | 'cached' | 'unavailable';

export interface Signal {
  name: string;
  label: string;
  value: number | string | null;
  unit: string | null;
  source: string;
  provenance: Provenance;
  as_of: string | null;
  resolution_note: string | null;
  reason: string | null;
}

export type RiskLevel = 'green' | 'yellow' | 'red' | 'info' | 'unavailable';

export interface RiskItem {
  id: 'erosion' | 'heat_stress' | 'bare_soil';
  label: string;
  level: RiskLevel;
  reading: string;
  value?: number;
  source_used?: string | null;
  as_of?: string | null;
  sources?: string[];
  method?: string | null;
  factors?: { factor: string; value: string; points: number | null; provenance?: Provenance; as_of?: string | null; source: string; reason?: string }[];
}

export interface RiskCardData {
  field_id: string;
  field_name: string;
  area_ha: number;
  items: RiskItem[];
  signals: Record<string, Signal>;
  soil_texture: {
    farmer: string | null;
    satellite: string | null;
    label_source: 'farmer-provided' | 'SoilGrids';
    check: { consistent: boolean | null; note: string | null } | null;
  };
}

export interface CropOption {
  id: string;
  label_en: string;
  label_de: string;
  scored: boolean;
}

export interface PlannerInputs {
  field_id: string;
  history: { year: number; crop: string }[];
  soil_texture: string | null;
  priority: string | null;
  irrigation: string | null;
  updated_at: string | null;
  options: {
    soil_texture: { id: string; de: string; en: string }[];
    priority: string[];
    irrigation: string[];
    crops: CropOption[];
  };
}

export type AxisKey = 'water' | 'soil_cover' | 'nitrogen' | 'heat';
export interface AxisResult {
  axis: AxisKey;
  label: string;
  score: number | null;
  status: 'scored' | 'partial' | 'not_scored';
  reason: string | null;
}

export interface DbeLine {
  label: string;
  kg_n_ha: number | null;
  ref: string;
  applied: boolean;
  note: string | null;
}

export interface DbeYear {
  year: number;
  crop: string;
  previous_crop: string | null;
  available: boolean;
  reason: string | null;
  lines: DbeLine[];
  requirement_before_nmin_kg_n_ha: number | null;
  legal_max_kg_n_ha: number | null;
  credit_to_next_crop_kg_n_ha: number | null;
  credit_ref: string;
  caveats?: string[];
}

export interface StrategyYear {
  year: number;
  crop: string;
  crop_label: string;
  crop_label_de: string;
  scored: boolean;
  catch_crop_after: boolean;
  year_overall: number | null;
  feasibility_from_previous: { ok: boolean; reason: string | null } | null;
  dbe: DbeYear;
  cap: { field: { grain_legume: boolean }; farm: { status: string; reason?: string | null; main_crop_species?: number; grain_legume_share_pct?: number } };
}

export interface Explanation {
  why: { axis: string; statement: string; source: string; data_as_of: string | null; delta_vs_current: number | null }[];
  weak_points: { axis: string; statement: string }[];
  limitations: { kind: string; text: string }[];
  caveats: string[];
}

export interface Strategy {
  id: 'A' | 'B' | 'C';
  name: string;
  kind: 'current_path' | 'resilience' | 'diversified';
  years: StrategyYear[];
  axes: Record<AxisKey, AxisResult>;
  overall: number | null;
  overall_axes: AxisKey[];
  rotation_terms: { botanical_families: string[]; diversity_share: number; grain_legume_years: number; bonus_points: number; break_violations: { crop: string; year: number; years_without: number; required_min: number }[] };
  legal: { gloez7: { status: string; compliant: boolean; violations: { years: number[]; reason: string | null }[]; rule: { source_name: string; source_url: string; retrieved: string; verify: boolean } }; break_violations: unknown[] };
  explanation: Explanation;
}

export interface MonthHazard {
  value: number | null;
  level: 'low' | 'medium' | 'high' | null;
  source: string;
}

export interface TimelineMonth {
  month: number;
  cover_share: number | null;
  cover_state: 'exposed' | 'partly' | 'shielded' | null;
  hazards: { drought: MonthHazard; erosion: MonthHazard & { heavy_rain_days: number | null }; frost: MonthHazard };
}

export interface TimelineData {
  year_index: number;
  hazards: { notes: string[]; years_used: number[] };
  strategies: Record<string, { strategy_id: string; crop: string; year: number; months: TimelineMonth[]; unprotected_hazard_months: number[]; crop_in_high_drought_months: number[] }>;
  method: string;
}

export interface Recommendation {
  id: string;
  field_id: string;
  field_name: string;
  start_year: number;
  years: number[];
  history: { year: number; crop: string; crop_label: string; crop_label_de: string }[];
  strategies: Strategy[];
  common_axes: AxisKey[];
  excluded_axes: AxisKey[];
  eligible_crops: string[];
  excluded_crops: { id: string; missing: string[] }[];
  candidates_examined: number;
  alternatives_note?: string;
  timeline: TimelineData;
  signals: Record<string, Signal>;
  income: { available: boolean; reason: string };
  confidence_note: string;
}

export interface ApiProblem {
  message: string;
  problems: string[];
}
