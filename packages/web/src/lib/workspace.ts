import { apiFetch } from './api';
import { readCsrfCookie, CSRF_HEADER } from './csrf';
import type { FileEntry, WorkspaceTreeResponse } from '@buck/shared';

const HIDDEN_NAMES = new Set(['.git', 'skills', 'systems']);

function isHidden(name: string): boolean {
  if (HIDDEN_NAMES.has(name)) return true;
  if (name.startsWith('.DS')) return true;
  if (name.startsWith('._')) return true;
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

export const MAX_UPLOAD_SIZE = 5 * 1024 * 1024;

const ALLOWED_EXTS = new Set([
  '.md', '.mdx', '.txt', '.json', '.yaml', '.yml', '.csv', '.log',
  '.html', '.css', '.js', '.ts', '.tsx', '.jsx',
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg',
]);

function fileExt(name: string): string {
  const idx = name.lastIndexOf('.');
  return idx >= 0 ? name.slice(idx).toLowerCase() : '';
}

export function validateUpload(file: File): void {
  if (file.size > MAX_UPLOAD_SIZE) {
    throw new Error(`«${file.name}» trop volumineux (max 5 Mo)`);
  }
  const ext = fileExt(file.name);
  const mime = file.type || '';
  const mimeOk = mime.startsWith('image/') || mime.startsWith('text/');
  const extOk = ALLOWED_EXTS.has(ext);
  if (!mimeOk && !extOk) {
    throw new Error(`«${file.name}» : type non supporté (texte ou image uniquement)`);
  }
}

async function postFile(file: File, destPath: string): Promise<void> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('path', destPath);
  const res = await fetch('/api/workspace/file', {
    method: 'POST',
    headers: { [CSRF_HEADER]: readCsrfCookie() },
    credentials: 'include',
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: {} }));
    throw new Error(
      (err as { error?: { message?: string } }).error?.message ?? 'Upload échoué',
    );
  }
}

export async function uploadFile(file: File, destPath: string): Promise<void> {
  validateUpload(file);
  await postFile(file, destPath);
}

export async function createEmptyFile(filePath: string): Promise<void> {
  const name = filePath.split('/').pop() ?? 'untitled';
  await postFile(new File([''], name, { type: 'text/plain' }), filePath);
}

export function joinWorkspacePath(dir: string, name: string): string {
  if (!dir) return name;
  return `${dir.replace(/\/+$/, '')}/${name}`;
}
