import { CSRF_HEADER, readCsrfCookie } from './csrf';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function apiFetch<T>(
  path: string,
  init: Omit<RequestInit, 'body'> & { body?: unknown } = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body !== undefined && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }
  const method = (init.method ?? 'GET').toUpperCase();
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    headers.set(CSRF_HEADER, readCsrfCookie());
  }
  const res = await fetch(path, {
    ...init,
    headers,
    body:
      init.body !== undefined && typeof init.body !== 'string'
        ? JSON.stringify(init.body)
        : (init.body as BodyInit | undefined),
    credentials: 'include',
  });
  const ct = res.headers.get('content-type') ?? '';
  const json = ct.includes('application/json')
    ? ((await res.json()) as unknown)
    : undefined;
  if (!res.ok) {
    const err =
      (json as { error?: { code?: string; message?: string } } | undefined)
        ?.error ?? {};
    throw new ApiError(
      res.status,
      err.code ?? 'unknown',
      err.message ?? res.statusText,
    );
  }
  return json as T;
}
