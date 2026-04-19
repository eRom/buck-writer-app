import { describe, it, expect } from 'vitest';
import { createUsageTracker } from './usage-tracker.js';

const baseUsage = {
  audioInputTokens: 0,
  audioOutputTokens: 0,
  textInputTokens: 0,
  textOutputTokens: 0,
  cachedInputTokens: 0,
  audioInputSeconds: 0,
  audioOutputSeconds: 0,
};

describe('usage tracker', () => {
  it('accepte un update monotone', () => {
    const t = createUsageTracker({ nowMs: () => 1000 });
    t.update('s1', { ...baseUsage, audioInputTokens: 100, audioOutputTokens: 200 });
    expect(t.get('s1')?.audioInputTokens).toBe(100);
    t.update('s1', { ...baseUsage, audioInputTokens: 150, audioOutputTokens: 300, cachedInputTokens: 5 });
    expect(t.get('s1')?.audioInputTokens).toBe(150);
    expect(t.get('s1')?.cachedInputTokens).toBe(5);
  });

  it('rejette un décrément', () => {
    const t = createUsageTracker({ nowMs: () => 1000 });
    t.update('s1', { ...baseUsage, audioInputTokens: 100 });
    expect(() => t.update('s1', { ...baseUsage, audioInputTokens: 50 })).toThrow(/non-monotonic/);
  });

  it('GC supprime après staleness', () => {
    let now = 1000;
    const t = createUsageTracker({ nowMs: () => now, staleMs: 2000 });
    t.update('s1', { ...baseUsage, audioInputTokens: 100 });
    now = 5000;
    const gc = t.gc();
    expect(gc).toEqual(['s1']);
    expect(t.get('s1')).toBeUndefined();
  });

  it('drop retourne et supprime', () => {
    const t = createUsageTracker({ nowMs: () => 1000 });
    t.update('s1', { ...baseUsage, audioOutputTokens: 42 });
    const dropped = t.drop('s1');
    expect(dropped?.audioOutputTokens).toBe(42);
    expect(t.get('s1')).toBeUndefined();
  });
});
