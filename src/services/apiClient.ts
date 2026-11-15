const baseUrl = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_PUBLIC_API_URL || '/api';

export async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  if (!response.ok) throw new Error(`Farmily API request failed: ${response.status}`);
  return response.json() as Promise<T>;
}
export { baseUrl };
