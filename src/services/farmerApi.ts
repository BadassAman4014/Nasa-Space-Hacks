import { apiRequest } from './apiClient';
import type { FarmerPreferences, CropHistory } from '@/types';
export const farmerApi = { savePreferences: (payload: FarmerPreferences) => apiRequest<FarmerPreferences>('/farmer/preferences', { method: 'POST', body: JSON.stringify(payload) }), saveHistory: (fieldId: string, history: CropHistory[]) => apiRequest<CropHistory[]>(`/fields/${fieldId}/history`, { method: 'POST', body: JSON.stringify({ history }) }) };
