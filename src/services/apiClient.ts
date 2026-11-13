const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api';

export async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  if (!response.ok) throw new Error(`FieldShift API request failed: ${response.status}`);
  return response.json() as Promise<T>;
}
export { baseUrl };
