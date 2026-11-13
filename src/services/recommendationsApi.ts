import { apiRequest } from './apiClient';
import type { Recommendation } from '@/types';
export const recommendationsApi = { generate: (fieldId: string) => apiRequest<Recommendation>('/recommendations/generate', { method: 'POST', body: JSON.stringify({ fieldId }) }), get: (id: string) => apiRequest<Recommendation>(`/recommendations/${id}`), compare: (ids: string[]) => apiRequest<Recommendation[]>('/recommendations/compare', { method: 'POST', body: JSON.stringify({ ids }) }) };
