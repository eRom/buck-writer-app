import { describe, it, expect, vi, beforeEach } from 'vitest';
import { realtimeApi } from './realtime-api';

describe('realtimeApi', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    // CSRF cookie
    Object.defineProperty(document, 'cookie', {
      writable: true,
      value: 'csrf=test-csrf',
    });
  });

  it('createSession POST /api/realtime/session', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ clientSecret: 'ek', expiresAt: 1, realtimeModel: 'gpt-realtime-1.5', sessionConfig: {} }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    const out = await realtimeApi.createSession({
      sessionId: 's1',
      voice: 'coral',
      turnDetection: { mode: 'server_vad', threshold: 0.5, prefix_padding_ms: 500, silence_duration_ms: 500, interrupt_response: true },
      tools: { bible: true, writingTools: true, webSearch: true },
    });
    expect(out.clientSecret).toBe('ek');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/realtime/session',
      expect.objectContaining({ method: 'POST', credentials: 'include' }),
    );
  });

  it('postUsage throw sur 429 avec code budget_exceeded', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ error: { code: 'budget_exceeded', message: 'nope' } }),
        { status: 429, headers: { 'content-type': 'application/json' } },
      ),
    );
    await expect(
      realtimeApi.postUsage('s1', 'rts1', {
        audioInputTokens: 0, audioOutputTokens: 0, textInputTokens: 0, textOutputTokens: 0, cachedInputTokens: 0, audioInputSeconds: 0, audioOutputSeconds: 0,
      }),
    ).rejects.toMatchObject({ code: 'budget_exceeded', status: 429 });
  });

  it('closeSession DELETE avec sessionId en query', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ closed: true, costUsd: 0.1 }), { status: 200, headers: { 'content-type': 'application/json' } }),
    );
    const out = await realtimeApi.closeSession('rts1', 's1');
    expect(out).toEqual({ closed: true, costUsd: 0.1 });
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toMatch(/^\/api\/realtime\/session\/rts1\?sessionId=s1$/);
  });

  it('postTranscript envoie la batch', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ inserted: 2 }), { status: 200, headers: { 'content-type': 'application/json' } }),
    );
    const out = await realtimeApi.postTranscript('s1', [
      { role: 'user', text: 'hi', startedAt: 1, endedAt: 2 },
      { role: 'assistant', text: 'salut', startedAt: 3, endedAt: 4 },
    ]);
    expect(out.inserted).toBe(2);
  });
});
