export type MarkitdownSource = 'text' | 'ocr' | 'native';

export interface MarkitdownResult {
  markdown: string;
  charCount: number;
  filename: string;
  ext: string;
  source: MarkitdownSource;
}

export type MarkitdownErrorCode =
  | 'unauthorized'
  | 'too_large'
  | 'unsupported'
  | 'timeout'
  | 'unreachable'
  | 'worker_error';

export class MarkitdownError extends Error {
  public readonly code: MarkitdownErrorCode;
  public readonly httpStatus?: number;
  public readonly reason?: string;

  constructor(
    code: MarkitdownErrorCode,
    message: string,
    opts: { httpStatus?: number; reason?: string; cause?: unknown } = {},
  ) {
    super(message, { cause: opts.cause });
    this.name = 'MarkitdownError';
    this.code = code;
    this.httpStatus = opts.httpStatus;
    this.reason = opts.reason;
  }
}

export interface MarkitdownClient {
  convert(file: Buffer, filename: string, mimeType?: string): Promise<MarkitdownResult>;
  health(): Promise<{ status: string; version?: string; ocr_enabled?: boolean }>;
}

export interface MarkitdownClientOptions {
  baseUrl: string;
  internalToken: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

const DEFAULT_TIMEOUT_MS = 65_000;

export function createMarkitdownClient(
  opts: MarkitdownClientOptions,
): MarkitdownClient {
  const baseUrl = opts.baseUrl.replace(/\/$/, '');
  const token = opts.internalToken;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const fetchImpl = opts.fetchImpl ?? fetch;

  async function call(
    op: string,
    path: string,
    init: RequestInit,
  ): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetchImpl(`${baseUrl}${path}`, { ...init, signal: controller.signal });
    } catch (err) {
      if (controller.signal.aborted) {
        throw new MarkitdownError('timeout', `${op} timed out after ${timeoutMs}ms`, {
          cause: err,
        });
      }
      throw new MarkitdownError('unreachable', `worker unreachable: ${String(err)}`, {
        cause: err,
      });
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    async health() {
      const res = await call('health', '/health', { method: 'GET' });
      if (!res.ok) {
        throw new MarkitdownError('worker_error', `health status ${res.status}`, {
          httpStatus: res.status,
        });
      }
      return (await res.json()) as { status: string; version?: string; ocr_enabled?: boolean };
    },

    async convert(file, filename, mimeType) {
      const form = new FormData();
      // Buffer's underlying type is ArrayBufferLike which widens to include
      // SharedArrayBuffer in strict DOM types; Blob accepts it at runtime.
      const blob = new Blob([file as unknown as ArrayBuffer], {
        type: mimeType ?? 'application/octet-stream',
      });
      form.append('file', blob, filename);

      const res = await call('convert', '/api/convert', {
        method: 'POST',
        headers: { 'X-Internal-Token': token },
        body: form,
      });

      if (res.ok) {
        const body = (await res.json()) as {
          markdown: string;
          char_count: number;
          filename: string;
          ext: string;
          source: MarkitdownSource;
        };
        return {
          markdown: body.markdown ?? '',
          charCount: body.char_count ?? 0,
          filename: body.filename,
          ext: body.ext,
          source: body.source,
        };
      }

      const code = httpStatusToCode(res.status);
      const reason = await safeReadError(res);
      throw new MarkitdownError(code, `worker returned ${res.status}`, {
        httpStatus: res.status,
        reason,
      });
    },
  };
}

function httpStatusToCode(status: number): MarkitdownErrorCode {
  if (status === 401) return 'unauthorized';
  if (status === 413) return 'too_large';
  if (status === 415) return 'unsupported';
  if (status === 504) return 'timeout';
  return 'worker_error';
}

async function safeReadError(res: Response): Promise<string | undefined> {
  try {
    const data = (await res.json()) as { detail?: { error?: string; reason?: string } };
    return data?.detail?.error ?? data?.detail?.reason;
  } catch {
    return undefined;
  }
}
