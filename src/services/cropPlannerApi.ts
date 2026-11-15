import { baseUrl } from './apiClient';
import type { ApiProblem, PlannerInputs, Recommendation, TimelineData } from '../components/crop-planner/types';

export class PlannerApiError extends Error {
  status: number;
  problems: string[];
  constructor(status: number, message: string, problems: string[] = []) {
    super(message);
    this.status = status;
    this.problems = problems;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  if (!response.ok) {
    let detail: unknown = null;
    try {
      detail = (await response.json())?.detail;
    } catch {
      /* body is not JSON */
    }
    if (detail && typeof detail === 'object' && 'problems' in (detail as ApiProblem)) {
      const d = detail as ApiProblem;
      throw new PlannerApiError(response.status, d.message, d.problems);
    }
    throw new PlannerApiError(response.status, typeof detail === 'string' ? detail : `Request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}

export const cropPlannerApi = {
  inputs: (fieldId: string) => request<PlannerInputs>(`/fields/${fieldId}/planner-inputs`),
  saveInputs: (fieldId: string, body: Pick<PlannerInputs, 'history' | 'soil_texture' | 'priority' | 'irrigation'>) =>
    request<PlannerInputs>(`/fields/${fieldId}/planner-inputs`, { method: 'PUT', body: JSON.stringify(body) }),
  generate: (fieldId: string, refresh = false) =>
    request<Recommendation>('/recommendations/generate', { method: 'POST', body: JSON.stringify({ field_id: fieldId, refresh }) }),
  timeline: (fieldId: string, recommendationId: string, yearIndex: number) =>
    request<TimelineData>(`/fields/${fieldId}/vulnerability-timeline?recommendation_id=${recommendationId}&year_index=${yearIndex}`),
};
