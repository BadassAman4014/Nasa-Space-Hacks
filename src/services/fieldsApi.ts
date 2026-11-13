import { apiRequest } from './apiClient';
import type { Field, ClimateProfile, SoilProfile } from '@/types';
export const fieldsApi = { create: (payload: Omit<Field, 'id'>) => apiRequest<Field>('/fields', { method: 'POST', body: JSON.stringify(payload) }), get: (fieldId: string) => apiRequest<Field>(`/fields/${fieldId}`), environment: (fieldId: string) => apiRequest<ClimateProfile>(`/fields/${fieldId}/environment`), soil: (fieldId: string) => apiRequest<SoilProfile>(`/fields/${fieldId}/soil`) };
