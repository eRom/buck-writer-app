import { useEffect, useState, useCallback } from 'react';
import { toast } from 'sonner';
import { apiFetch, ApiError } from '@/lib/api';

type TtsState = 'idle' | 'loading' | 'playing' | 'error';

interface PostResponse {
  url: string;
  voice: string;
  durationSec: number | null;
  cached: boolean;
  costUsd: number;
}

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

  useEffect(() => {
    const listener = (activeId: string | null): void => {
      if (activeId !== messageId) setState('idle');
    };
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, [messageId]);

  const toggle = useCallback(async () => {
    // If this message is already playing, stop it
    if (
      currentMessageId === messageId &&
      currentAudio &&
      !currentAudio.paused
    ) {
      stopCurrent();
      setState('idle');
      return;
    }

    stopCurrent();
    setState('loading');

    try {
      const res = await apiFetch<PostResponse>(`/api/tts/${messageId}`, {
        method: 'POST',
        body: {},
      });
      const audio = new Audio(res.url);
      setActive(audio, messageId);
      audio.onended = () => {
        if (currentMessageId === messageId) stopCurrent();
        setState('idle');
      };
      audio.onerror = () => {
        if (currentMessageId === messageId) stopCurrent();
        setState('error');
        toast.error('Erreur de lecture audio');
        setTimeout(() => setState('idle'), 2000);
      };
      await audio.play();
      setState('playing');
    } catch (err) {
      setState('error');
      if (err instanceof ApiError) {
        if (err.code === 'message_too_long') {
          toast.error('Message trop long pour la synthèse vocale');
        } else if (err.code === 'budget_exceeded') {
          toast.error('Budget mensuel atteint');
        } else if (err.code === 'rate_limited') {
          toast.warning('Trop de requêtes TTS, réessaye dans un instant');
        } else if (err.code === 'empty_text') {
          toast.error('Aucun texte à lire dans ce message');
        } else {
          toast.error(`TTS indisponible : ${err.message}`);
        }
      } else {
        toast.error('TTS indisponible');
      }
      setTimeout(() => setState('idle'), 2000);
    }
  }, [messageId]);

  return { state, toggle };
}

// Test-only reset — exported for Vitest isolation between tests.
export function __resetTtsSingleton(): void {
  stopCurrent();
  listeners.clear();
}
