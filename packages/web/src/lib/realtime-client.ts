import { realtimeApi, type UsagePayload } from './realtime-api';

export interface RealtimeClientOpts {
  chatSessionId: string;
  silenceTimeoutMs?: number;
  warnAtMs?: number;
  maxDurationMs?: number;
}

export interface StartOpts {
  voice: string;
  turnDetection: {
    mode: 'server_vad' | 'semantic_vad';
    threshold: number;
    prefix_padding_ms: number;
    silence_duration_ms: number;
    interrupt_response: boolean;
  };
  tools: { bible: boolean; writingTools: boolean; webSearch: boolean };
}

interface TranscriptEntry {
  role: 'user' | 'assistant';
  text: string;
  startedAt: number;
  endedAt: number;
}

const DEFAULT_SILENCE_MS = 30_000;
const DEFAULT_WARN_MS = 20 * 60_000;
const DEFAULT_MAX_MS = 25 * 60_000;

export class RealtimeClient extends EventTarget {
  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;
  private micStream: MediaStream | null = null;
  private remoteAudio: HTMLAudioElement | null = null;
  private analyser: AnalyserNode | null = null;
  private audioCtx: AudioContext | null = null;

  private realtimeSessionId = '';
  private usage: UsagePayload = {
    audioInputTokens: 0,
    audioOutputTokens: 0,
    textInputTokens: 0,
    textOutputTokens: 0,
    cachedInputTokens: 0,
    audioInputSeconds: 0,
    audioOutputSeconds: 0,
  };
  private transcriptQueue: TranscriptEntry[] = [];
  private transcriptFlushTimer: ReturnType<typeof setTimeout> | null = null;
  private silenceTimer: ReturnType<typeof setTimeout> | null = null;
  private durationTimers: ReturnType<typeof setTimeout>[] = [];
  private stopped = false;

  constructor(private opts: RealtimeClientOpts) {
    super();
  }

  private emit(name: string, detail?: unknown) {
    this.dispatchEvent(new CustomEvent(name, { detail }));
  }

  async start(startOpts: StartOpts): Promise<void> {
    this.emit('state', 'connecting');

    this.micStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
    });

    const { clientSecret, sessionConfig, realtimeModel } = await realtimeApi.createSession({
      sessionId: this.opts.chatSessionId,
      voice: startOpts.voice,
      turnDetection: startOpts.turnDetection,
      tools: startOpts.tools,
    });

    const pc = new RTCPeerConnection();
    this.pc = pc;
    this.micStream.getTracks().forEach((t) => pc.addTrack(t, this.micStream!));

    this.remoteAudio = document.createElement('audio');
    this.remoteAudio.autoplay = true;

    pc.ontrack = (e: RTCTrackEvent) => {
      if (!this.remoteAudio) return;
      const stream = e.streams[0];
      if (stream) this.remoteAudio.srcObject = stream;
      try {
        const Ctor = (window.AudioContext || (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)!;
        this.audioCtx ??= new Ctor();
        const src = this.audioCtx.createMediaStreamSource(e.streams[0] as MediaStream);
        const analyser = this.audioCtx.createAnalyser();
        analyser.fftSize = 256;
        src.connect(analyser);
        this.analyser = analyser;
        this.emit('analyser', analyser);
      } catch {
        // audio ctx peut échouer en test — on continue
      }
    };

    pc.oniceconnectionstatechange = () => {
      const s = pc.iceConnectionState;
      if (s === 'disconnected' || s === 'failed') {
        setTimeout(() => {
          if (!this.stopped && (this.pc?.iceConnectionState === 'disconnected' || this.pc?.iceConnectionState === 'failed')) {
            this.fail('connexion perdue');
          }
        }, 5000);
      }
    };

    const dc = pc.createDataChannel('oai-events');
    this.dc = dc;

    dc.onopen = () => {
      dc.send(JSON.stringify(sessionConfig));
      this.resetSilenceTimer();
      this.scheduleDurationWarnings();
      this.emit('state', 'listening');
    };
    dc.onmessage = (e: MessageEvent) => {
      try {
        this.handleEvent(JSON.parse(e.data as string));
      } catch {
        // ignore parse errors
      }
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    // Endpoint GA (2026) : /v1/realtime/calls.
    // L'ancien /v1/realtime était le beta — il rejette le client_secret GA
    // avec 'api_version_mismatch'.
    const answerRes = await fetch(
      `https://api.openai.com/v1/realtime/calls?model=${encodeURIComponent(realtimeModel)}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${clientSecret}`,
          'Content-Type': 'application/sdp',
        },
        body: offer.sdp ?? '',
      },
    );
    if (!answerRes.ok) {
      const errText = await answerRes.text().catch(() => '');
      throw new Error(`OpenAI SDP exchange failed: ${answerRes.status} ${errText}`);
    }
    const answerSdp = await answerRes.text();
    await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });
  }

  private handleEvent(event: Record<string, unknown>): void {
    const type = event?.type as string | undefined;
    switch (type) {
      case 'session.created': {
        const sess = event.session as { id?: string } | undefined;
        this.realtimeSessionId = sess?.id ?? '';
        this.emit('session.created', this.realtimeSessionId);
        break;
      }
      case 'input_audio_buffer.speech_started':
        this.resetSilenceTimer();
        this.emit('state', 'listening');
        break;
      case 'response.created':
        this.emit('state', 'speaking');
        break;
      case 'response.audio.delta':
        this.resetSilenceTimer();
        break;
      case 'response.done': {
        this.emit('state', 'listening');
        const resp = event.response as { usage?: Record<string, unknown> } | undefined;
        this.mergeUsage(resp?.usage);
        void this.flushUsage();
        break;
      }
      case 'conversation.item.input_audio_transcription.completed': {
        const text = (event.transcript as string | undefined) ?? '';
        if (text) this.enqueueTranscript('user', text);
        break;
      }
      case 'response.audio_transcript.done': {
        const text = (event.transcript as string | undefined) ?? '';
        if (text) this.enqueueTranscript('assistant', text);
        break;
      }
      case 'response.function_call_arguments.done': {
        if ((event.name as string | undefined) === 'write_to_chat') this.handleWriteToChat(event);
        break;
      }
      default:
        break;
    }
  }

  private mergeUsage(u: Record<string, unknown> | undefined): void {
    if (!u) return;
    const ind = (u.input_token_details as Record<string, unknown> | undefined) ?? {};
    const outd = (u.output_token_details as Record<string, unknown> | undefined) ?? {};
    const audioIn = Number(ind.audio_tokens ?? 0);
    const textIn = Number(ind.text_tokens ?? 0);
    const cached = Number(ind.cached_tokens ?? 0);
    const audioOut = Number(outd.audio_tokens ?? 0);
    const textOut = Number(outd.text_tokens ?? 0);
    this.usage.audioInputTokens += audioIn;
    this.usage.textInputTokens += textIn;
    this.usage.cachedInputTokens += cached;
    this.usage.audioOutputTokens += audioOut;
    this.usage.textOutputTokens += textOut;
    this.usage.audioInputSeconds += audioIn / 50;
    this.usage.audioOutputSeconds += audioOut / 200;
  }

  private async flushUsage(): Promise<void> {
    if (!this.realtimeSessionId) return;
    try {
      await realtimeApi.postUsage(this.opts.chatSessionId, this.realtimeSessionId, this.usage);
    } catch (e) {
      const code = (e as { code?: string } | null)?.code;
      if (code === 'budget_exceeded') this.fail('budget mensuel dépassé');
    }
  }

  private enqueueTranscript(role: 'user' | 'assistant', text: string): void {
    const startedAt = Date.now();
    this.transcriptQueue.push({ role, text, startedAt, endedAt: startedAt });
    this.emit('transcript', { role, text, startedAt });
    if (this.transcriptFlushTimer) clearTimeout(this.transcriptFlushTimer);
    this.transcriptFlushTimer = setTimeout(() => void this.flushTranscript(), 2000);
  }

  private async flushTranscript(): Promise<void> {
    if (this.transcriptQueue.length === 0) return;
    const batch = this.transcriptQueue.splice(0);
    try {
      await realtimeApi.postTranscript(this.opts.chatSessionId, batch);
    } catch {
      this.transcriptQueue.unshift(...batch);
    }
  }

  private handleWriteToChat(event: Record<string, unknown>): void {
    try {
      const args = JSON.parse((event.arguments as string) ?? '{}') as { content?: string };
      this.emit('write_to_chat', args);
      this.dc?.send(
        JSON.stringify({
          type: 'conversation.item.create',
          item: {
            type: 'function_call_output',
            call_id: event.call_id,
            output: JSON.stringify({ ok: true }),
          },
        }),
      );
    } catch {
      this.dc?.send(
        JSON.stringify({
          type: 'conversation.item.create',
          item: {
            type: 'function_call_output',
            call_id: event.call_id,
            output: JSON.stringify({ ok: false }),
          },
        }),
      );
    }
  }

  private resetSilenceTimer(): void {
    if (this.silenceTimer) clearTimeout(this.silenceTimer);
    const ms = this.opts.silenceTimeoutMs ?? DEFAULT_SILENCE_MS;
    this.silenceTimer = setTimeout(() => this.fail('silence prolongé'), ms);
  }

  private scheduleDurationWarnings(): void {
    const warnMs = this.opts.warnAtMs ?? DEFAULT_WARN_MS;
    const maxMs = this.opts.maxDurationMs ?? DEFAULT_MAX_MS;
    this.durationTimers.push(
      setTimeout(() => this.emit('warn', 'session en cours depuis 20 min — fermeture dans 5 min'), warnMs),
    );
    this.durationTimers.push(setTimeout(() => this.fail('durée max atteinte'), maxMs));
  }

  setMuted(muted: boolean): void {
    this.micStream?.getAudioTracks().forEach((t) => {
      t.enabled = !muted;
    });
  }

  getAnalyser(): AnalyserNode | null {
    return this.analyser;
  }

  private fail(reason: string): void {
    this.emit('error', reason);
    void this.stop();
  }

  async stop(): Promise<void> {
    if (this.stopped) return;
    this.stopped = true;
    if (this.silenceTimer) clearTimeout(this.silenceTimer);
    this.durationTimers.forEach(clearTimeout);
    if (this.transcriptFlushTimer) clearTimeout(this.transcriptFlushTimer);
    // Flush la dernière fenêtre d'usage + transcripts AVANT de demander la
    // fermeture côté serveur, sinon la dernière merge locale est perdue.
    await this.flushUsage();
    await this.flushTranscript();
    if (this.realtimeSessionId) {
      try {
        await realtimeApi.closeSession(this.realtimeSessionId, this.opts.chatSessionId);
      } catch {
        // swallow — déjà en train de fermer
      }
    }
    try { this.dc?.close(); } catch { /* noop */ }
    try { this.pc?.close(); } catch { /* noop */ }
    this.micStream?.getTracks().forEach((t) => t.stop());
    this.remoteAudio?.remove();
    try {
      await this.audioCtx?.close();
    } catch {
      // noop
    }
    this.emit('state', 'idle');
  }
}
