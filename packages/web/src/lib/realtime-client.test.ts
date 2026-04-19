import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { installRtcStubs } from '../test/webrtc-stubs';
import { RealtimeClient } from './realtime-client';

vi.mock('./realtime-api', () => ({
  realtimeApi: {
    createSession: vi.fn(),
    postUsage: vi.fn(),
    postTranscript: vi.fn(),
    closeSession: vi.fn(),
  },
}));

import { realtimeApi } from './realtime-api';

const DEFAULT_START_OPTS = {
  voice: 'alloy',
  turnDetection: {
    mode: 'server_vad' as const,
    threshold: 0.5,
    prefix_padding_ms: 300,
    silence_duration_ms: 500,
    interrupt_response: true,
  },
  tools: { bible: false, writingTools: false, webSearch: false },
};

function mockCreateSession() {
  vi.mocked(realtimeApi.createSession).mockResolvedValue({
    clientSecret: 'test-secret',
    expiresAt: Date.now() + 60_000,
    realtimeModel: 'gpt-4o-realtime-preview',
    sessionConfig: { type: 'session.update' },
  });
}

function mockFetch(sdp = 'answer-sdp') {
  global.fetch = vi.fn().mockResolvedValue({
    text: async () => sdp,
    ok: true,
  } as unknown as Response);
}

describe('RealtimeClient', () => {
  beforeEach(() => {
    installRtcStubs();
    mockCreateSession();
    mockFetch();
    vi.mocked(realtimeApi.postUsage).mockResolvedValue({ costUsd: 0, budgetRemaining: 100 });
    vi.mocked(realtimeApi.postTranscript).mockResolvedValue({ inserted: 0 });
    vi.mocked(realtimeApi.closeSession).mockResolvedValue({ closed: true, costUsd: 0 });
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  // ── Test 1 : start() émet state=connecting puis state=listening après DC open ──

  it('start() — émet state=connecting puis state=listening après DC open', async () => {
    const client = new RealtimeClient({ chatSessionId: 'sess-1' });
    const states: unknown[] = [];
    client.addEventListener('state', (e) => states.push((e as CustomEvent).detail));

    const startPromise = client.start(DEFAULT_START_OPTS);
    expect(states).toContain('connecting');

    await startPromise;
    // queueMicrotask → attendre que le DC onopen soit déclenché
    await new Promise((r) => queueMicrotask(r as () => void));

    expect(states).toContain('listening');
    await client.stop();
  });

  // ── Test 2 : handleEvent session.created émet l'id ──

  it('session.created event — émet session.created avec id', async () => {
    const client = new RealtimeClient({ chatSessionId: 'sess-2' });
    const sessionIds: unknown[] = [];
    client.addEventListener('session.created', (e) => sessionIds.push((e as CustomEvent).detail));

    await client.start(DEFAULT_START_OPTS);
    await new Promise((r) => queueMicrotask(r as () => void));

    // accès interne au DC pour simuler un message entrant
    const dc = (client as unknown as { dc: { onmessage: ((e: MessageEvent) => void) | null } }).dc;
    dc?.onmessage?.({ data: JSON.stringify({ type: 'session.created', session: { id: 'rt-abc' } }) } as MessageEvent);

    expect(sessionIds).toEqual(['rt-abc']);
    await client.stop();
  });

  // ── Test 3 : response.created → speaking ; response.done → listening + flushUsage ──

  it('response.created → speaking ; response.done → listening + postUsage', async () => {
    const client = new RealtimeClient({ chatSessionId: 'sess-3' });
    const states: unknown[] = [];
    client.addEventListener('state', (e) => states.push((e as CustomEvent).detail));

    await client.start(DEFAULT_START_OPTS);
    await new Promise((r) => queueMicrotask(r as () => void));

    // On a besoin d'un realtimeSessionId pour que flushUsage appelle postUsage
    (client as unknown as { realtimeSessionId: string }).realtimeSessionId = 'rt-xyz';

    const dc = (client as unknown as { dc: { onmessage: ((e: MessageEvent) => void) | null } }).dc;
    dc?.onmessage?.({ data: JSON.stringify({ type: 'response.created' }) } as MessageEvent);
    expect(states).toContain('speaking');

    dc?.onmessage?.({ data: JSON.stringify({ type: 'response.done', response: { usage: {} } }) } as MessageEvent);

    // attendre le flush async
    await vi.waitFor(() => expect(realtimeApi.postUsage).toHaveBeenCalled());
    expect(states.at(-1)).toBe('listening');
    await client.stop();
  });

  // ── Test 4 : silence timeout → émet error ──

  it('silence timeout → émet error "silence prolongé"', async () => {
    vi.useFakeTimers();
    const client = new RealtimeClient({ chatSessionId: 'sess-4', silenceTimeoutMs: 1000 });
    const errors: unknown[] = [];
    client.addEventListener('error', (e) => errors.push((e as CustomEvent).detail));

    await client.start(DEFAULT_START_OPTS);
    // déclencher le DC onopen manuellement (fake timers bloquent queueMicrotask)
    const dc = (client as unknown as { dc: { onopen: (() => void) | null; onmessage: null; send: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> } }).dc;
    dc?.onopen?.();

    vi.advanceTimersByTime(1001);
    expect(errors).toContain('silence prolongé');
    vi.useRealTimers();
    await client.stop();
  });

  // ── Test 5 : input_audio_buffer.speech_started reset le silence timer ──

  it('speech_started reset le silence timer — pas d\'erreur avant nouveau timeout', async () => {
    vi.useFakeTimers();
    const client = new RealtimeClient({ chatSessionId: 'sess-5', silenceTimeoutMs: 1000 });
    const errors: unknown[] = [];
    client.addEventListener('error', (e) => errors.push((e as CustomEvent).detail));

    await client.start(DEFAULT_START_OPTS);
    const dc = (client as unknown as { dc: { onopen: (() => void) | null; onmessage: ((e: MessageEvent) => void) | null } }).dc;
    dc?.onopen?.();

    // avancer 800ms puis speech_started reset
    vi.advanceTimersByTime(800);
    dc?.onmessage?.({ data: JSON.stringify({ type: 'input_audio_buffer.speech_started' }) } as MessageEvent);

    // avancer encore 800ms (total 1600ms mais reset à 800ms → seulement 800ms depuis reset)
    vi.advanceTimersByTime(800);
    expect(errors).toHaveLength(0);

    // avancer jusqu'au nouveau timeout
    vi.advanceTimersByTime(201);
    expect(errors).toContain('silence prolongé');
    vi.useRealTimers();
    await client.stop();
  });

  // ── Test 6 : setMuted(true) désactive track.enabled ──

  it('setMuted(true) — désactive les audio tracks', async () => {
    const client = new RealtimeClient({ chatSessionId: 'sess-6' });
    await client.start(DEFAULT_START_OPTS);
    await new Promise((r) => queueMicrotask(r as () => void));

    const micStream = (client as unknown as { micStream: { getAudioTracks: () => Array<{ enabled: boolean }> } }).micStream!;
    expect(micStream.getAudioTracks()[0]!.enabled).toBe(true);

    client.setMuted(true);
    expect(micStream.getAudioTracks()[0]!.enabled).toBe(false);

    client.setMuted(false);
    expect(micStream.getAudioTracks()[0]!.enabled).toBe(true);

    await client.stop();
  });

  // ── Test 7 : mergeUsage agrège correctement ──

  it('response.done avec usage — agrège les tokens correctement', async () => {
    const client = new RealtimeClient({ chatSessionId: 'sess-7' });
    (client as unknown as { realtimeSessionId: string }).realtimeSessionId = 'rt-merge';

    await client.start(DEFAULT_START_OPTS);
    await new Promise((r) => queueMicrotask(r as () => void));

    const dc = (client as unknown as { dc: { onmessage: ((e: MessageEvent) => void) | null } }).dc;

    const usageEvent = {
      type: 'response.done',
      response: {
        usage: {
          input_token_details: { audio_tokens: 100, text_tokens: 50, cached_tokens: 10 },
          output_token_details: { audio_tokens: 200, text_tokens: 30 },
        },
      },
    };
    dc?.onmessage?.({ data: JSON.stringify(usageEvent) } as MessageEvent);

    await vi.waitFor(() => expect(realtimeApi.postUsage).toHaveBeenCalled());

    const usage = (client as unknown as { usage: Record<string, number> }).usage;
    expect(usage.audioInputTokens).toBe(100);
    expect(usage.textInputTokens).toBe(50);
    expect(usage.cachedInputTokens).toBe(10);
    expect(usage.audioOutputTokens).toBe(200);
    expect(usage.textOutputTokens).toBe(30);
    expect(usage.audioInputSeconds).toBeCloseTo(100 / 50);
    expect(usage.audioOutputSeconds).toBeCloseTo(200 / 200);

    await client.stop();
  });

  // ── Test 8 : write_to_chat émet event + send function_call_output ──

  it('write_to_chat — émet event + send function_call_output ok:true', async () => {
    const client = new RealtimeClient({ chatSessionId: 'sess-8' });
    const writeToChatEvents: unknown[] = [];
    client.addEventListener('write_to_chat', (e) => writeToChatEvents.push((e as CustomEvent).detail));

    await client.start(DEFAULT_START_OPTS);
    await new Promise((r) => queueMicrotask(r as () => void));

    const dc = (client as unknown as { dc: { onmessage: ((e: MessageEvent) => void) | null; send: ReturnType<typeof vi.fn> } }).dc;

    dc?.onmessage?.({
      data: JSON.stringify({
        type: 'response.function_call_arguments.done',
        name: 'write_to_chat',
        arguments: JSON.stringify({ content: 'bonjour' }),
        call_id: 'call-42',
      }),
    } as MessageEvent);

    expect(writeToChatEvents).toHaveLength(1);
    expect((writeToChatEvents[0] as { content: string }).content).toBe('bonjour');

    const sentPayload = JSON.parse(dc!.send.mock.calls.at(-1)?.[0] as string) as {
      item: { output: string };
    };
    expect(JSON.parse(sentPayload.item.output)).toEqual({ ok: true });

    await client.stop();
  });

  // ── Test 9 : stop() flush transcript + close session + emit state=idle ──

  it('stop() — flush transcript + closeSession + émet state=idle', async () => {
    const client = new RealtimeClient({ chatSessionId: 'sess-9' });
    (client as unknown as { realtimeSessionId: string }).realtimeSessionId = 'rt-stop';

    // Enqueue un transcript sans le flusher
    (client as unknown as { transcriptQueue: unknown[] }).transcriptQueue.push({
      role: 'user', text: 'hello', startedAt: 1, endedAt: 1,
    });

    const states: unknown[] = [];
    client.addEventListener('state', (e) => states.push((e as CustomEvent).detail));

    await client.stop();

    expect(realtimeApi.postTranscript).toHaveBeenCalledWith('sess-9', expect.arrayContaining([
      expect.objectContaining({ role: 'user', text: 'hello' }),
    ]));
    expect(realtimeApi.closeSession).toHaveBeenCalledWith('rt-stop', 'sess-9');
    expect(states).toContain('idle');
  });

  // ── Test 10 : transcript queue — 2 items flush après 2000ms ──

  it('transcript queue — 2 items flushed après 2000ms', async () => {
    vi.useFakeTimers();
    const client = new RealtimeClient({ chatSessionId: 'sess-10' });
    (client as unknown as { realtimeSessionId: string }).realtimeSessionId = 'rt-transcript';

    const transcripts: unknown[] = [];
    client.addEventListener('transcript', (e) => transcripts.push((e as CustomEvent).detail));

    // Injecter directement via handleEvent (accès privé)
    const handleEvent = (client as unknown as { handleEvent: (e: Record<string, unknown>) => void }).handleEvent.bind(client);

    handleEvent({ type: 'conversation.item.input_audio_transcription.completed', transcript: 'bonjour' });
    handleEvent({ type: 'response.audio_transcript.done', transcript: 'salut' });

    expect(transcripts).toHaveLength(2);
    expect((client as unknown as { transcriptQueue: unknown[] }).transcriptQueue).toHaveLength(2);

    vi.advanceTimersByTime(2001);
    // Résoudre les promises en attente
    await vi.runAllTimersAsync();

    expect(realtimeApi.postTranscript).toHaveBeenCalledWith('sess-10', expect.arrayContaining([
      expect.objectContaining({ role: 'user', text: 'bonjour' }),
      expect.objectContaining({ role: 'assistant', text: 'salut' }),
    ]));

    vi.useRealTimers();
  });
});
