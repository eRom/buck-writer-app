import { apiFetch, ApiError } from './api';

export interface MeResponse {
  userId: string;
  email: string;
}

export async function fetchMe(): Promise<MeResponse | null> {
  try {
    return await apiFetch<MeResponse>('/api/auth/me');
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) return null;
    throw err;
  }
}
