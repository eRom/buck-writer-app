import { useCallback, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { RealtimeClient, type StartOpts } from '@/lib/realtime-client';
import { useRealtimeStore, type RealtimeState } from '@/stores/realtime-store';
import { realtimeApi } from '@/lib/realtime-api';

export interface UseRealtimeVoiceReturn {
  start: (config: StartOpts, silenceTimeoutSec?: number) => Promise<void>;
  stop: () => Promise<void>;
  toggleMute: () => void;
  state: RealtimeState;
  muted: boolean;
  error: string | null;
}

export function useRealtimeVoice(chatSessionId: string | null): UseRealtimeVoiceReturn {
  const state = useRealtimeStore((s) => s.state);
  const muted = useRealtimeStore((s) => s.muted);
  const error = useRealtimeStore((s) => s.error);
  const clientRef = useRef<RealtimeClient | null>(null);
  const queryClient = useQueryClient();

  const stop = useCallback(async () => {
    const client = clientRef.current;
    clientRef.current = null;
    if (client) await client.stop();
    useRealtimeStore.getState().reset();
    useRealtimeStore.getState().clearTranscripts();
  }, []);

  const start = useCallback(
    async (config: StartOpts, silenceTimeoutSec?: number) => {
      if (!chatSessionId) return;
      if (clientRef.current) return;
      const store = useRealtimeStore.getState();

      const client = new RealtimeClient({
        chatSessionId,
        silenceTimeoutMs: silenceTimeoutSec ? silenceTimeoutSec * 1000 : undefined,
      });
      clientRef.current = client;

      client.addEventListener('state', (e) => {
        const next = (e as CustomEvent<RealtimeState>).detail;
        store.setState(next);
      });
      client.addEventListener('error', (e) => {
        const msg = (e as CustomEvent<string>).detail;
        store.setError(msg);
      });
      client.addEventListener('analyser', (e) => {
        const analyser = (e as CustomEvent<AnalyserNode>).detail;
        const prev = useRealtimeStore.getState();
        store.attach(chatSessionId, prev.realtimeSessionId, analyser);
      });
      client.addEventListener('session.created', (e) => {
        const id = (e as CustomEvent<string>).detail;
        const prev = useRealtimeStore.getState();
        store.attach(chatSessionId, id, prev.analyser);
      });
      client.addEventListener('transcript', (e) => {
        const t = (e as CustomEvent<{ role: 'user' | 'assistant'; text: string; startedAt: number }>).detail;
        useRealtimeStore.getState().addTranscript(t);
      });
      client.addEventListener('write_to_chat', (e) => {
        const { content } = (e as CustomEvent<{ content?: string }>).detail;
        if (!content || !chatSessionId) return;
        void realtimeApi.writeToChat(chatSessionId, content).then(() => {
          void queryClient.invalidateQueries({ queryKey: ['messages', chatSessionId] });
        }).catch(() => {
          // log silencieux — on continue
        });
      });

      try {
        await client.start(config);
      } catch (err) {
        clientRef.current = null;
        store.setError((err as Error).message ?? 'start failed');
      }
    },
    [chatSessionId],
  );

  const toggleMute = useCallback(() => {
    const next = !useRealtimeStore.getState().muted;
    useRealtimeStore.getState().setMuted(next);
    clientRef.current?.setMuted(next);
  }, []);

  useEffect(() => {
    return () => {
      const c = clientRef.current;
      clientRef.current = null;
      if (c) void c.stop();
    };
  }, []);

  return { start, stop, toggleMute, state, muted, error };
}
