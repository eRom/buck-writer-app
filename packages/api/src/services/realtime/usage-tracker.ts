import type { RealtimeUsage } from '@buck/shared';

export interface TrackedUsage extends RealtimeUsage {
  audioInputSeconds: number;
  audioOutputSeconds: number;
  updatedAt: number;
}

export interface UsageTrackerOpts {
  nowMs: () => number;
  staleMs?: number;
}

const MONOTONIC_KEYS: (keyof Omit<TrackedUsage, 'updatedAt'>)[] = [
  'audioInputTokens',
  'audioOutputTokens',
  'textInputTokens',
  'textOutputTokens',
  'cachedInputTokens',
  'audioInputSeconds',
  'audioOutputSeconds',
];

export function createUsageTracker(opts: UsageTrackerOpts) {
  const store = new Map<string, TrackedUsage>();
  const staleMs = opts.staleMs ?? 120_000;

  return {
    update(sessionId: string, u: Omit<TrackedUsage, 'updatedAt'>): TrackedUsage {
      const prev = store.get(sessionId);
      if (prev) {
        for (const k of MONOTONIC_KEYS) {
          if (u[k] < prev[k]) throw new Error(`non-monotonic ${k}: ${u[k]} < ${prev[k]}`);
        }
      }
      const merged: TrackedUsage = { ...u, updatedAt: opts.nowMs() };
      store.set(sessionId, merged);
      return merged;
    },
    get(sessionId: string): TrackedUsage | undefined {
      return store.get(sessionId);
    },
    drop(sessionId: string): TrackedUsage | undefined {
      const v = store.get(sessionId);
      store.delete(sessionId);
      return v;
    },
    gc(): string[] {
      const cutoff = opts.nowMs() - staleMs;
      const dropped: string[] = [];
      for (const [k, v] of store) {
        if (v.updatedAt < cutoff) {
          store.delete(k);
          dropped.push(k);
        }
      }
      return dropped;
    },
    size() {
      return store.size;
    },
  };
}

export type UsageTracker = ReturnType<typeof createUsageTracker>;
