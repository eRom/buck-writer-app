import { create } from 'zustand';

interface MemoryStatusState {
  degraded: boolean;
  lastSignalAt: number | null;
  setDegraded: (d: boolean) => void;
}

export const useMemoryStatus = create<MemoryStatusState>((set) => ({
  degraded: false,
  lastSignalAt: null,
  setDegraded: (d) => set({ degraded: d, lastSignalAt: Date.now() }),
}));
