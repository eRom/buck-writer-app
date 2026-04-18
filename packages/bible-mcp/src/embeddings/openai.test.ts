import { describe, it, expect, vi, afterEach } from 'vitest';
import { embedBatch, EMBEDDING_DIM } from './openai.js';

afterEach(() => vi.restoreAllMocks());

describe('embedBatch', () => {
  it('calls OpenAI embeddings endpoint with correct payload', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({
        data: [{ embedding: new Array(3072).fill(0.1) }],
        model: 'text-embedding-3-large',
        usage: { prompt_tokens: 5 },
      }), { headers: { 'content-type': 'application/json' } }),
    );

    const result = await embedBatch({ apiKey: 'sk-test', texts: ['hello'] });

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.openai.com/v1/embeddings',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'Authorization': 'Bearer sk-test' }),
      }),
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toHaveLength(3072);
  });

  it('batches requests (100 texts max per call)', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({
        data: new Array(100).fill({ embedding: new Array(3072).fill(0) }),
      }))),
    );
    const texts = new Array(250).fill('x');
    await embedBatch({ apiKey: 'sk', texts });
    expect(fetchSpy).toHaveBeenCalledTimes(3); // 100 + 100 + 50
  });

  it('respects custom model param', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ data: [{ embedding: [] }] })),
    );
    await embedBatch({ apiKey: 'sk', texts: ['x'], model: 'text-embedding-3-small' });
    const call = (globalThis.fetch as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0];
    const body = JSON.parse(call[1].body as string);
    expect(body.model).toBe('text-embedding-3-small');
  });

  it('throws on non-2xx with payload', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { message: 'bad key' } }), { status: 401 }),
    );
    await expect(embedBatch({ apiKey: 'sk', texts: ['x'] })).rejects.toThrow(/401/);
  });
});

describe('EMBEDDING_DIM', () => {
  it('exports 3072 for large', () => {
    expect(EMBEDDING_DIM['text-embedding-3-large']).toBe(3072);
    expect(EMBEDDING_DIM['text-embedding-3-small']).toBe(1536);
  });
});
