import { Mic, MicOff, X } from 'lucide-react';
import { useRealtimeStore } from '@/stores/realtime-store';
import { useRealtimeVoice } from '@/hooks/use-realtime-voice';
import { Waveform } from './waveform';

export function Notch() {
  const state = useRealtimeStore((s) => s.state);
  const muted = useRealtimeStore((s) => s.muted);
  const analyser = useRealtimeStore((s) => s.analyser);
  const chatSessionId = useRealtimeStore((s) => s.chatSessionId);
  const { stop, toggleMute } = useRealtimeVoice(chatSessionId);

  if (state === 'idle') return null;

  const label =
    state === 'connecting'
      ? 'Live en connexion'
      : state === 'listening'
        ? muted
          ? 'Live actif — muet'
          : 'Live actif — écoute'
        : state === 'speaking'
          ? 'Live actif — parole'
          : 'Live erreur';

  const waveState = state === 'error' ? 'idle' : state;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={label}
      className="fixed top-2 left-1/2 -translate-x-1/2 z-50 h-11 w-[260px] rounded-full bg-stone-900/80 backdrop-blur-md border border-stone-800 flex items-center px-3 gap-2 animate-in fade-in slide-in-from-top-2 duration-200"
    >
      <Mic
        className={state === 'speaking' ? 'text-lime-400' : 'text-amber-400'}
        size={16}
        aria-hidden="true"
      />
      <div className="flex-1">
        <Waveform analyser={analyser} state={waveState} />
      </div>
      <button
        aria-label={muted ? 'Réactiver micro' : 'Couper micro'}
        onClick={toggleMute}
        className="text-stone-300 hover:text-white"
        type="button"
      >
        {muted ? <MicOff size={14} /> : <Mic size={14} />}
      </button>
      <button
        aria-label="Fermer session Live"
        onClick={() => void stop()}
        className="text-stone-300 hover:text-white"
        type="button"
      >
        <X size={14} />
      </button>
    </div>
  );
}
