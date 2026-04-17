import type { AttachmentResponse } from '@buck/shared';
import { readCsrfCookie, CSRF_HEADER } from './csrf';

export async function uploadAttachments(files: File[]): Promise<AttachmentResponse[]> {
  const formData = new FormData();
  files.forEach((f) => formData.append('files', f));

  const res = await fetch('/api/attachments', {
    method: 'POST',
    headers: { [CSRF_HEADER]: readCsrfCookie() },
    credentials: 'include',
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: {} }));
    throw new Error((err as { error?: { message?: string } }).error?.message ?? 'Upload failed');
  }

  const body = (await res.json()) as { attachments: AttachmentResponse[] };
  return body.attachments;
}
