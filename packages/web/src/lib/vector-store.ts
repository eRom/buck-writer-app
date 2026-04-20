import { apiFetch } from './api';

export interface VectorStoreStatus {
  vectorStoreId: string | null;
  fileCount: number;
  lastSyncAt: number | null;
}

export interface SyncSummary {
  added: number;
  updated: number;
  removed: number;
  unchanged: number;
  skipped: number;
  vectorStoreId: string;
}

export async function fetchVectorStoreStatus(): Promise<VectorStoreStatus> {
  return apiFetch<VectorStoreStatus>('/api/vector-store');
}

export async function syncVectorStore(): Promise<SyncSummary> {
  return apiFetch<SyncSummary>('/api/vector-store/sync', { method: 'POST' });
}
