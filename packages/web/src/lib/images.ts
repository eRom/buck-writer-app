import { apiFetch } from './api';

export interface SaveImageResponse {
  ok: boolean;
  path: string;
  absPath: string;
  sizeBytes: number;
  savedAt: number;
}

export async function saveImageToWorkspace(body: {
  messageId: string;
  callId: string;
  path: string;
}): Promise<SaveImageResponse> {
  return apiFetch<SaveImageResponse>('/api/images/save', {
    method: 'POST',
    body,
  });
}
