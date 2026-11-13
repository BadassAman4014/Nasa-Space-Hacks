import { apiRequest } from './apiClient';
import type { RecommendationEvidence } from '@/types';
export const reportsApi = { evidence: (recommendationId: string) => apiRequest<RecommendationEvidence[]>(`/recommendations/${recommendationId}/evidence`), report: (recommendationId: string) => apiRequest<{ downloadUrl: string }>(`/reports/${recommendationId}`) };
