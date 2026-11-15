// API traffic stays same-origin in production. Vercel rewrites /api/* to Render.
const baseUrl = '/api';

export async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  if (!response.ok) throw new Error(`Farmily API request failed: ${response.status}`);
  return response.json() as Promise<T>;
}
export { baseUrl };
