import { useCallback, useEffect } from 'react';
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

// Singleton module-level : un seul RealtimeClient par onglet/app, partagé par
// toutes les instances du hook (Notch, ChatInput, hotkey, etc.). Évite les
// refs locales qui créaient des stop() no-op sur des instances tierces.
const clientSingleton: { current: RealtimeClient | null } = { current: null };

export function useRealtimeVoice(chatSessionId: string | null): UseRealtimeVoiceReturn {
  const state = useRealtimeStore((s) => s.state);
  const muted = useRealtimeStore((s) => s.muted);
  const error = useRealtimeStore((s) => s.error);
  const queryClient = useQueryClient();

  const stop = useCallback(async () => {
    const client = clientSingleton.current;
    clientSingleton.current = null;
    if (client) await client.stop();
    useRealtimeStore.getState().reset();
    useRealtimeStore.getState().clearTranscripts();
  }, []);

  const start = useCallback(
    async (config: StartOpts, silenceTimeoutSec?: number) => {
      if (!chatSessionId) return;
      if (clientSingleton.current) return;
      const store = useRealtimeStore.getState();

      const client = new RealtimeClient({
        chatSessionId,
        silenceTimeoutMs: silenceTimeoutSec ? silenceTimeoutSec * 1000 : undefined,
      });
      clientSingleton.current = client;

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
        // Cleanup ressources (micro, PC, AudioContext) avant de nullifier
        await client.stop().catch(() => {
          // swallow — on est déjà en erreur
        });
        clientSingleton.current = null;
        store.setError((err as Error).message ?? 'start failed');
      }
    },
    [chatSessionId],
  );

  const toggleMute = useCallback(() => {
    const next = !useRealtimeStore.getState().muted;
    useRealtimeStore.getState().setMuted(next);
    clientSingleton.current?.setMuted(next);
  }, []);

  // Best-effort cleanup quand l'onglet se ferme — évite micro ouvert après
  // navigation abrupte. Une vraie fermeture propre passe par stop() explicite.
  useEffect(() => {
    const onBeforeUnload = () => {
      const c = clientSingleton.current;
      if (c) {
        clientSingleton.current = null;
        void c.stop();
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  return { start, stop, toggleMute, state, muted, error };
}
