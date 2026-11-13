import { apiRequest } from './apiClient';
import type { Farm } from '@/types';
export const farmsApi = { list: () => apiRequest<Farm[]>('/farms'), get: (farmId: string) => apiRequest<Farm>(`/farms/${farmId}`), create: (payload: Omit<Farm, 'id'>) => apiRequest<Farm>('/farms', { method: 'POST', body: JSON.stringify(payload) }) };
