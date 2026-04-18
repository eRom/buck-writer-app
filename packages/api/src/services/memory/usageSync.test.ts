// packages/api/src/services/memory/usageSync.test.ts
import { describe, it, expect, vi } from 'vitest';
import { syncMemoryUsage } from './usageSync.js';

describe('syncMemoryUsage', () => {
  it('fetches rows after cursor and inserts into usage_events, updates cursor', async () => {
    const rows = [
      { id: 'u1', user_id: 'U', kind: 'consolidation', model: 'gpt-4o-mini',
        prompt_tok: 100, completion_tok: 20, cost_usd: '0.001', metadata: {},
        created_at: '2026-04-18T03:00:00Z' },
      { id: 'u2', user_id: 'U', kind: 'compaction', model: 'gpt-4o-mini',
        prompt_tok: 50, completion_tok: 10, cost_usd: '0.0005', metadata: {},
        created_at: '2026-04-18T04:00:00Z' },
    ];
    const supabase = {
      from: vi.fn(() => ({
        select: () => ({
          eq: () => ({
            gt: () => ({ order: () => Promise.resolve({ data: rows, error: null }) }),
          }),
        }),
      })),
    };
    const insertUsage = vi.fn().mockResolvedValue(undefined);
    const saveCursor = vi.fn().mockResolvedValue(undefined);

    const synced = await syncMemoryUsage({
      supabase: supabase as never,
      userId: 'U',
      sinceCursor: new Date('2026-04-18T00:00:00Z'),
      insertUsage,
      saveCursor,
    });

    expect(synced).toBe(2);
    expect(insertUsage).toHaveBeenCalledTimes(2);
    expect(insertUsage).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'memory_consolidation',
      promptTokens: 100,
    }));
    expect(saveCursor).toHaveBeenCalledWith(new Date('2026-04-18T04:00:00Z'));
  });

  it('noop when no new rows', async () => {
    const supabase = {
      from: vi.fn(() => ({
        select: () => ({
          eq: () => ({
            gt: () => ({ order: () => Promise.resolve({ data: [], error: null }) }),
          }),
        }),
      })),
    };
    const insertUsage = vi.fn();
    const saveCursor = vi.fn();
    const synced = await syncMemoryUsage({
      supabase: supabase as never,
      userId: 'U',
      sinceCursor: new Date(0),
      insertUsage,
      saveCursor,
    });
    expect(synced).toBe(0);
    expect(insertUsage).not.toHaveBeenCalled();
    expect(saveCursor).not.toHaveBeenCalled();
  });
});
