import { useEffect } from 'react';
import type { StartOpts } from '@/lib/realtime-client';
import { useRealtimeStore } from '@/stores/realtime-store';
import { useRealtimeVoice } from '@/hooks/use-realtime-voice';

export interface HotkeyConfig {
  chatSessionId: string | null;
  startOpts: StartOpts;
  silenceTimeoutSec?: number;
}

export function useRealtimeHotkey({
  chatSessionId,
  startOpts,
  silenceTimeoutSec,
}: HotkeyConfig): void {
  const { start, stop } = useRealtimeVoice(chatSessionId);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.shiftKey && e.key.toLowerCase() === 'l') {
        e.preventDefault();
        const state = useRealtimeStore.getState().state;
        if (!chatSessionId) return;
        if (state === 'idle') {
          void start(startOpts, silenceTimeoutSec);
        } else {
          void stop();
        }
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [chatSessionId, startOpts, silenceTimeoutSec, start, stop]);
}
