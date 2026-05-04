import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  mintRealtimeClientSecret,
  REALTIME_SESSIONS_URL,
  REALTIME_MAX_TTL_SECONDS,
} from './realtime.js';

// Deterministic clock used by every test below so the TTL audit branches
// can be exercised without depending on wall-clock drift.
const NOW_SECONDS = 1_777_000_000;
const nowMs = () => NOW_SECONDS * 1000;

describe('mintRealtimeClientSecret', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('POST /v1/realtime/client_secrets avec session payload', async () => {
    // Issue a secret expiring 60s from now → well under any audit threshold.
    const fetchMock = vi.fn(async () => new Response(
      JSON.stringify({ value: 'ek_abc', expires_at: NOW_SECONDS + 60 }),
      { status: 200 },
    ));
    const out = await mintRealtimeClientSecret({
      apiKey: 'sk-test',
      session: { type: 'realtime', model: 'gpt-realtime-1.5' },
      fetchImpl: fetchMock as unknown as typeof fetch,
      nowMs,
    });
    expect(out).toEqual({ value: 'ek_abc', expiresAt: NOW_SECONDS + 60 });
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
        nowMs,
      }),
    ).rejects.toThrow('OpenAI API error 401');
  });

  describe('REC-09 — TTL audit + hard cap', () => {
    it('rejects an ephemeral key with TTL > 600s', async () => {
      const fetchMock = vi.fn(async () => new Response(
        // 1 hour TTL — way above the cap.
        JSON.stringify({ value: 'ek_long', expires_at: NOW_SECONDS + 3600 }),
        { status: 200 },
      ));
      await expect(
        mintRealtimeClientSecret({
          apiKey: 'sk-test',
          session: { type: 'realtime', model: 'gpt-realtime-1.5' },
          fetchImpl: fetchMock as unknown as typeof fetch,
          nowMs,
        }),
      ).rejects.toThrow(/refusing ephemeral key with TTL/);
    });

    it('logs a warning when TTL is between 300s and the hard cap', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const fetchMock = vi.fn(async () => new Response(
        // 500s TTL — over the warn threshold but under the hard cap.
        JSON.stringify({ value: 'ek_mid', expires_at: NOW_SECONDS + 500 }),
        { status: 200 },
      ));
      const out = await mintRealtimeClientSecret({
        apiKey: 'sk-test',
        session: { type: 'realtime', model: 'gpt-realtime-1.5' },
        fetchImpl: fetchMock as unknown as typeof fetch,
        nowMs,
      });
      expect(out.value).toBe('ek_mid');
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringMatching(/suspicious long ephemeral TTL/),
      );
    });

    it('does not warn for typical short-lived TTL (<300s)', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const fetchMock = vi.fn(async () => new Response(
        JSON.stringify({ value: 'ek_short', expires_at: NOW_SECONDS + 90 }),
        { status: 200 },
      ));
      await mintRealtimeClientSecret({
        apiKey: 'sk-test',
        session: { type: 'realtime', model: 'gpt-realtime-1.5' },
        fetchImpl: fetchMock as unknown as typeof fetch,
        nowMs,
      });
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('hard cap is exposed and matches 10 minutes', () => {
      expect(REALTIME_MAX_TTL_SECONDS).toBe(600);
    });
  });
});
