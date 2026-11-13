import { apiRequest } from './apiClient';

export type DatasetCategory =
  | 'soil'
  | 'climate'
  | 'satellite'
  | 'topography'
  | 'ecology'
  | 'water'
  | 'economics';

export interface ChallengeDatasetInfo {
  id: string;
  name: string;
  agency: string;
  category: DatasetCategory;
  spatial_resolution: string;
  temporal_cadence: string;
  official_url: string;
  api_endpoint?: string | null;
  description: string;
  agricultural_application: string;
  supported_parameters: string[];
  is_live_queryable: boolean;
}

export interface DatasetQueryResponse {
  dataset_id: string;
  name: string;
  agency: string;
  category: DatasetCategory;
  query_timestamp: string;
  location: { lat: number; lon: number };
  status: string;
  data: Record<string, any>;
  summary: string;
  source_url: string;
  metadata: Record<string, any>;
}

export interface FieldMultiQueryResponse {
  field_id: string;
  field_name: string;
  farm_name: string;
  area_ha: number;
  centroid: { lat: number; lon: number };
  bbox: number[];
  queried_at: string;
  results: Record<string, DatasetQueryResponse>;
}

export const nasaChallengeApi = {
  /**
   * List all 23 official NASA Challenge datasets, optionally filtered by category.
   */
  async getCatalog(category?: DatasetCategory): Promise<ChallengeDatasetInfo[]> {
    const url = category
      ? `/nasa-challenge/catalog?category=${category}`
      : '/nasa-challenge/catalog';
    return apiRequest<ChallengeDatasetInfo[]>(url);
  },

  /**
   * Get metadata and documentation for a single NASA Challenge dataset.
   */
  async getDataset(datasetId: string): Promise<ChallengeDatasetInfo> {
    return apiRequest<ChallengeDatasetInfo>(`/nasa-challenge/catalog/${datasetId}`);
  },

  /**
   * Get list of categories and counts.
   */
  async getCategories(): Promise<{ categories: string[]; counts: Record<string, number>; total_datasets: number }> {
    return apiRequest<{ categories: string[]; counts: Record<string, number>; total_datasets: number }>(
      '/nasa-challenge/categories'
    );
  },

  /**
   * Query a specific dataset for geographic coordinates.
   */
  async queryDataset(params: {
    dataset_id: string;
    lat: number;
    lon: number;
    year?: number;
    start_date?: string;
    end_date?: string;
  }): Promise<DatasetQueryResponse> {
    const searchParams = new URLSearchParams({
      dataset_id: params.dataset_id,
      lat: params.lat.toString(),
      lon: params.lon.toString(),
    });
    if (params.year) searchParams.append('year', params.year.toString());
    if (params.start_date) searchParams.append('start_date', params.start_date);
    if (params.end_date) searchParams.append('end_date', params.end_date);

    return apiRequest<DatasetQueryResponse>(`/nasa-challenge/query?${searchParams.toString()}`);
  },

  /**
   * Query a specific NASA Challenge dataset for a saved field.
   */
  async queryFieldDataset(
    fieldId: string,
    datasetId: string,
    year?: number
  ): Promise<DatasetQueryResponse> {
    const q = year ? `&year=${year}` : '';
    return apiRequest<DatasetQueryResponse>(
      `/nasa-challenge/fields/${fieldId}/query?dataset_id=${encodeURIComponent(datasetId)}${q}`
    );
  },

  /**
   * Run multi-dataset probe across core NASA Challenge categories for a saved field.
   */
  async probeAllForField(
    fieldId: string,
    datasetIds?: string[]
  ): Promise<FieldMultiQueryResponse> {
    const body = datasetIds ? JSON.stringify({ dataset_ids: datasetIds }) : undefined;
    return apiRequest<FieldMultiQueryResponse>(
      `/nasa-challenge/fields/${fieldId}/probe-all`,
      {
        method: 'POST',
        body,
      }
    );
  },
};
