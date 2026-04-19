import { describe, it, expect, vi } from 'vitest';
import { mintRealtimeClientSecret, REALTIME_SESSIONS_URL } from './realtime.js';

describe('mintRealtimeClientSecret', () => {
  it('POST /v1/realtime/client_secrets avec session payload', async () => {
    const fetchMock = vi.fn(async () => new Response(
      JSON.stringify({ value: 'ek_abc', expires_at: 1776700000 }),
      { status: 200 },
    ));
    const out = await mintRealtimeClientSecret({
      apiKey: 'sk-test',
      session: { type: 'realtime', model: 'gpt-realtime-1.5' },
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    expect(out).toEqual({ value: 'ek_abc', expiresAt: 1776700000 });
    expect(fetchMock).toHaveBeenCalledWith(
      REALTIME_SESSIONS_URL,
      expect.objectContaining({ method: 'POST' }),
    );
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.session.model).toBe('gpt-realtime-1.5');
    expect(body.session.type).toBe('realtime');
  });

  it('throw OpenAIError si non-2xx', async () => {
    const fetchMock = vi.fn(async () => new Response(
      JSON.stringify({ error: { message: 'nope' } }),
      { status: 401 },
    ));
    await expect(
      mintRealtimeClientSecret({
        apiKey: 'sk-bad',
        session: { type: 'realtime', model: 'gpt-realtime-1.5' },
        fetchImpl: fetchMock as unknown as typeof fetch,
      }),
    ).rejects.toThrow('OpenAI API error 401');
  });
});
