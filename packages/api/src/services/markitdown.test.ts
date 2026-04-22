import { describe, it, expect, vi } from 'vitest';
import { createMarkitdownClient, MarkitdownError } from './markitdown.js';

function mockFetchOk(body: unknown): typeof fetch {
  return vi.fn(async () => new Response(JSON.stringify(body), { status: 200 })) as unknown as typeof fetch;
}

function mockFetchStatus(status: number, body: unknown = {}): typeof fetch {
  return vi.fn(
    async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      }),
  ) as unknown as typeof fetch;
}

const BASE = 'http://worker:8000';
const TOKEN = 'sekret';

describe('createMarkitdownClient', () => {
  it('converts successfully and maps snake_case → camelCase', async () => {
    const fetchImpl = mockFetchOk({
      markdown: '# hello',
      char_count: 7,
      filename: 'f.pdf',
      ext: '.pdf',
      source: 'text',
    });
    const client = createMarkitdownClient({ baseUrl: BASE, internalToken: TOKEN, fetchImpl });
    const res = await client.convert(Buffer.from('fake pdf'), 'f.pdf', 'application/pdf');
    expect(res).toEqual({
      markdown: '# hello',
      charCount: 7,
      filename: 'f.pdf',
      ext: '.pdf',
      source: 'text',
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      `${BASE}/api/convert`,
      expect.objectContaining({
        method: 'POST',
        headers: { 'X-Internal-Token': TOKEN },
      }),
    );
  });

  it('maps 401 → unauthorized', async () => {
    const fetchImpl = mockFetchStatus(401, { detail: { error: 'unauthorized' } });
    const client = createMarkitdownClient({ baseUrl: BASE, internalToken: 'bad', fetchImpl });
    await expect(client.convert(Buffer.from('x'), 'f.pdf')).rejects.toMatchObject({
      name: 'MarkitdownError',
      code: 'unauthorized',
      httpStatus: 401,
    });
  });

  it('maps 413 → too_large', async () => {
    const fetchImpl = mockFetchStatus(413, { detail: { error: 'too big' } });
    const client = createMarkitdownClient({ baseUrl: BASE, internalToken: TOKEN, fetchImpl });
    await expect(client.convert(Buffer.from('x'), 'big.pdf')).rejects.toMatchObject({
      code: 'too_large',
    });
  });

  it('maps 415 → unsupported', async () => {
    const fetchImpl = mockFetchStatus(415, { detail: { error: 'no' } });
    const client = createMarkitdownClient({ baseUrl: BASE, internalToken: TOKEN, fetchImpl });
    await expect(client.convert(Buffer.from('x'), 'x.zip')).rejects.toMatchObject({
      code: 'unsupported',
    });
  });

  it('maps 504 → timeout', async () => {
    const fetchImpl = mockFetchStatus(504);
    const client = createMarkitdownClient({ baseUrl: BASE, internalToken: TOKEN, fetchImpl });
    await expect(client.convert(Buffer.from('x'), 'x.pdf')).rejects.toMatchObject({
      code: 'timeout',
    });
  });

  it('maps 500 → worker_error with reason', async () => {
    const fetchImpl = mockFetchStatus(500, { detail: { error: 'boom', reason: 'corrupted' } });
    const client = createMarkitdownClient({ baseUrl: BASE, internalToken: TOKEN, fetchImpl });
    await expect(client.convert(Buffer.from('x'), 'x.pdf')).rejects.toMatchObject({
      code: 'worker_error',
      httpStatus: 500,
      reason: 'boom',
    });
  });

  it('maps network error → unreachable', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as typeof fetch;
    const client = createMarkitdownClient({ baseUrl: BASE, internalToken: TOKEN, fetchImpl });
    await expect(client.convert(Buffer.from('x'), 'x.pdf')).rejects.toMatchObject({
      code: 'unreachable',
    });
  });

  it('maps AbortError → timeout', async () => {
    const fetchImpl = vi.fn(async (_url: string | URL, init?: RequestInit) => {
      await new Promise<void>((resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const err = new Error('aborted');
          err.name = 'AbortError';
          reject(err);
        });
      });
      return new Response();
    }) as unknown as typeof fetch;
    const client = createMarkitdownClient({
      baseUrl: BASE,
      internalToken: TOKEN,
      timeoutMs: 10,
      fetchImpl,
    });
    const err = await client.convert(Buffer.from('x'), 'x.pdf').catch((e) => e);
    expect(err).toBeInstanceOf(MarkitdownError);
    expect(err.code).toBe('timeout');
  });

  it('health: returns body on 200', async () => {
    const fetchImpl = mockFetchOk({ status: 'ok', version: '0.1.0', ocr_enabled: true });
    const client = createMarkitdownClient({ baseUrl: BASE, internalToken: TOKEN, fetchImpl });
    const h = await client.health();
    expect(h.status).toBe('ok');
    expect(h.ocr_enabled).toBe(true);
  });
});
