import { useEffect, useState, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import type { TtsPostResponse } from '@buck/shared';
import { apiFetch, ApiError } from '@/lib/api';

type TtsState = 'idle' | 'loading' | 'playing' | 'error';

// Module-level singleton — only one audio plays at a time, across all hook
// instances. listeners are notified whenever the active message changes.
let currentAudio: HTMLAudioElement | null = null;
let currentMessageId: string | null = null;
const listeners = new Set<(activeId: string | null) => void>();

function setActive(audio: HTMLAudioElement | null, messageId: string | null): void {
  currentAudio = audio;
  currentMessageId = messageId;
  for (const l of listeners) l(messageId);
}

function stopCurrent(): void {
  if (currentAudio) {
    try {
      currentAudio.pause();
    } catch {
      // ignore
    }
  }
  setActive(null, null);
}

export function useTts(messageId: string): {
  state: TtsState;
  toggle: () => Promise<void>;
} {
  const [state, setState] = useState<TtsState>('idle');
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    const listener = (activeId: string | null): void => {
      if (!mountedRef.current) return;
      if (activeId !== messageId) setState('idle');
    };
    listeners.add(listener);
    return () => {
      mountedRef.current = false;
      listeners.delete(listener);
      // If this component owns the active audio, stop it — otherwise the
      // singleton leaks a playing audio after the message is unmounted.
      if (currentMessageId === messageId) stopCurrent();
    };
  }, [messageId]);

  const safeSetState = useCallback((next: TtsState) => {
    if (mountedRef.current) setState(next);
  }, []);

  const toggle = useCallback(async () => {
    // If this message is already playing, stop it
    if (
      currentMessageId === messageId &&
      currentAudio &&
      !currentAudio.paused
    ) {
      stopCurrent();
      safeSetState('idle');
      return;
    }

    stopCurrent();
    safeSetState('loading');

    try {
      const res = await apiFetch<TtsPostResponse>(`/api/tts/${messageId}`, {
        method: 'POST',
        body: {},
      });
      if (!mountedRef.current) return;

      const audio = new Audio(res.url);
      setActive(audio, messageId);
      audio.onended = () => {
        if (currentMessageId === messageId) stopCurrent();
        safeSetState('idle');
      };
      audio.onerror = () => {
        if (currentMessageId === messageId) stopCurrent();
        safeSetState('error');
        if (mountedRef.current) toast.error('Erreur de lecture audio');
        setTimeout(() => safeSetState('idle'), 2000);
      };
      await audio.play();
      if (!mountedRef.current) {
        // Unmounted during play() — clean up so the singleton stays honest.
        stopCurrent();
        return;
      }
      safeSetState('playing');
    } catch (err) {
      safeSetState('error');
      if (mountedRef.current) {
        if (err instanceof ApiError) {
          if (err.code === 'message_too_long') {
            toast.error('Message trop long pour la synthèse vocale');
          } else if (err.code === 'budget_exceeded') {
            toast.error('Budget mensuel atteint');
          } else if (err.code === 'rate_limited') {
            toast.warning('Trop de requêtes TTS, réessaye dans un instant');
          } else if (err.code === 'empty_text') {
            toast.error('Aucun texte à lire dans ce message');
          } else if (err.code === 'tts_quota_exhausted') {
            toast.error('Quota Gemini TTS dépassé');
          } else {
            toast.error(`TTS indisponible : ${err.message}`);
          }
        } else {
          toast.error('TTS indisponible');
        }
      }
      setTimeout(() => safeSetState('idle'), 2000);
    }
  }, [messageId, safeSetState]);

  return { state, toggle };
}

// Test-only reset — exported for Vitest isolation between tests.
export function __resetTtsSingleton(): void {
  stopCurrent();
  listeners.clear();
}
