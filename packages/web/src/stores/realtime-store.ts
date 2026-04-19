import { create } from 'zustand';

export type RealtimeState = 'idle' | 'connecting' | 'listening' | 'speaking' | 'error';

interface RealtimeStoreState {
  state: RealtimeState;
  error: string | null;
  chatSessionId: string | null;
  realtimeSessionId: string | null;
  analyser: AnalyserNode | null;
  muted: boolean;

  setState: (s: RealtimeState) => void;
  setError: (msg: string) => void;
  reset: () => void;
  attach: (chatSessionId: string, realtimeSessionId: string | null, analyser: AnalyserNode | null) => void;
  setMuted: (m: boolean) => void;
}

const INITIAL = {
  state: 'idle' as RealtimeState,
  error: null,
  chatSessionId: null,
  realtimeSessionId: null,
  analyser: null,
  muted: false,
};

export const useRealtimeStore = create<RealtimeStoreState>((set) => ({
  ...INITIAL,
  setState: (s) => set(() => (s === 'error' ? { state: s } : { state: s, error: null })),
  setError: (msg) => set({ state: 'error', error: msg }),
  reset: () => set({ ...INITIAL }),
  attach: (chatSessionId, realtimeSessionId, analyser) => set({ chatSessionId, realtimeSessionId, analyser }),
  setMuted: (m) => set({ muted: m }),
}));
