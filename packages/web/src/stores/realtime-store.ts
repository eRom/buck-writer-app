import { create } from 'zustand';

export type RealtimeState = 'idle' | 'connecting' | 'listening' | 'speaking' | 'error';

export interface RecentTranscript {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  startedAt: number;
}

interface RealtimeStoreState {
  state: RealtimeState;
  error: string | null;
  chatSessionId: string | null;
  realtimeSessionId: string | null;
  analyser: AnalyserNode | null;
  muted: boolean;
  recentTranscripts: RecentTranscript[];

  setState: (s: RealtimeState) => void;
  setError: (msg: string) => void;
  reset: () => void;
  attach: (chatSessionId: string, realtimeSessionId: string | null, analyser: AnalyserNode | null) => void;
  setMuted: (m: boolean) => void;
  addTranscript: (t: { role: 'user' | 'assistant'; text: string; startedAt: number }) => void;
  clearTranscripts: () => void;
}

const INITIAL = {
  state: 'idle' as RealtimeState,
  error: null,
  chatSessionId: null,
  realtimeSessionId: null,
  analyser: null,
  muted: false,
  recentTranscripts: [] as RecentTranscript[],
};

export const useRealtimeStore = create<RealtimeStoreState>((set) => ({
  ...INITIAL,
  setState: (s) => set(() => (s === 'error' ? { state: s } : { state: s, error: null })),
  setError: (msg) => set({ state: 'error', error: msg }),
  reset: () => set({ ...INITIAL }),
  attach: (chatSessionId, realtimeSessionId, analyser) => set({ chatSessionId, realtimeSessionId, analyser }),
  setMuted: (m) => set({ muted: m }),
  addTranscript: (t) =>
    set((prev) => ({
      recentTranscripts: [
        ...prev.recentTranscripts,
        { id: crypto.randomUUID(), ...t },
      ],
    })),
  clearTranscripts: () => set({ recentTranscripts: [] }),
}));
