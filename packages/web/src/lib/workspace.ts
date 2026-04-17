import { apiFetch } from './api';
import type { WorkspaceTreeResponse } from '@buck/shared';

export async function fetchWorkspaceTree(): Promise<WorkspaceTreeResponse> {
  return apiFetch<WorkspaceTreeResponse>('/api/workspace/tree');
}

export async function createDirectory(dirPath: string): Promise<void> {
  await apiFetch('/api/workspace/directory', { method: 'POST', body: { path: dirPath } });
}

export async function renameFile(filePath: string, newName: string): Promise<void> {
  await apiFetch(`/api/workspace/file?path=${encodeURIComponent(filePath)}`, {
    method: 'PATCH',
    body: { newName },
  });
}

export async function deleteFile(filePath: string): Promise<void> {
  await apiFetch(`/api/workspace/file?path=${encodeURIComponent(filePath)}`, {
    method: 'DELETE',
  });
}

export async function downloadFile(filePath: string): Promise<Blob> {
  const res = await fetch(`/api/workspace/file?path=${encodeURIComponent(filePath)}`, {
    credentials: 'include',
  });
  if (!res.ok) throw new Error('download failed');
  return res.blob();
}
