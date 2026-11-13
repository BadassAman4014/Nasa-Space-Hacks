import { apiRequest } from './apiClient';
import type { ClimateScenario, Recommendation } from '@/types';
export const scenariosApi = { simulate: (scenario: ClimateScenario) => apiRequest<Recommendation[]>('/scenarios/simulate', { method: 'POST', body: JSON.stringify(scenario) }) };
