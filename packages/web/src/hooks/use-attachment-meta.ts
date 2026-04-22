import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

export interface AttachmentMeta {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  extractionStatus: 'pending' | 'ok' | 'failed' | 'skipped';
  extractionSource: 'plain' | 'markitdown' | null;
  extractionError: string | null;
  extractedChars: number | null;
  extractedAt: number | null;
}

export function useAttachmentMeta(id: string) {
  return useQuery({
    queryKey: ['attachment-meta', id],
    queryFn: () => apiFetch<AttachmentMeta>(`/api/attachments/${id}/meta`),
    staleTime: 5 * 60 * 1000,
  });
}
