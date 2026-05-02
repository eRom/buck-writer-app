import { apiFetch } from './api';
import type { FileEntry, WorkspaceTreeResponse } from '@buck/shared';

const HIDDEN_NAMES = new Set(['.git', 'skills', 'systems']);

function isHidden(name: string): boolean {
  if (HIDDEN_NAMES.has(name)) return true;
  if (name.startsWith('.DS')) return true;
  return false;
}

function filterTree(entries: FileEntry[]): FileEntry[] {
  return entries
    .filter((e) => !isHidden(e.name))
    .map((e) => (e.children ? { ...e, children: filterTree(e.children) } : e));
}

export async function fetchWorkspaceTree(): Promise<WorkspaceTreeResponse> {
  const res = await apiFetch<WorkspaceTreeResponse>('/api/workspace/tree', {
    cache: 'no-store',
  });
  return { ...res, tree: filterTree(res.tree) };
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
