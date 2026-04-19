// packages/web/src/lib/settings.ts
import { apiFetch } from './api';
import type { SettingsResponse, UpdateSettingsInput, UsageResponse } from '@buck/shared';

export type { SettingsResponse, UsageResponse };

export async function fetchSettings(): Promise<SettingsResponse> {
  return apiFetch<SettingsResponse>('/api/settings');
}

export async function updateSettings(
  data: Partial<UpdateSettingsInput>,
): Promise<SettingsResponse> {
  return apiFetch<SettingsResponse>('/api/settings', {
    method: 'PATCH',
    body: data,
  });
}

export async function fetchUsageCurrent(): Promise<UsageResponse> {
  return apiFetch<UsageResponse>('/api/usage/current');
}
