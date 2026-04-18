// packages/api/src/services/memory/state.test.ts
import { describe, it, expect, vi } from 'vitest';
import { createStateService } from './state.js';

function upsertSupabase(captured: unknown[]) {
  return {
    from: vi.fn(() => ({
      upsert: vi.fn((row: unknown) => {
        captured.push(row);
        return Promise.resolve({ error: null });
      }),
    })),
  };
}

describe('state service', () => {
  it('set static: no compaction, no token budget check', async () => {
    const captured: unknown[] = [];
    const compact = vi.fn();
    const svc = createStateService({
      supabase: upsertSupabase(captured) as never,
      userId: 'u1',
      compact,
      tokenCounter: (s: string) => s.length, // 1 char = 1 token (fake)
    });

    await svc.set('static', 'lang', 'fr');
    expect(compact).not.toHaveBeenCalled();
    expect(captured[0]).toMatchObject({ tier: 'static', key: 'lang', value: 'fr', token_budget: null });
  });

  it('set context under budget: no compaction', async () => {
    const captured: unknown[] = [];
    const compact = vi.fn();
    const svc = createStateService({
      supabase: upsertSupabase(captured) as never,
      userId: 'u1',
      compact,
      tokenCounter: (s: string) => s.length,
    });

    await svc.set('context', 'current_project', 'short', { tokenBudget: 100 });
    expect(compact).not.toHaveBeenCalled();
    expect((captured[0] as { value: string }).value).toBe('short');
  });

  it('set context over budget: triggers compaction', async () => {
    const captured: unknown[] = [];
    const compact = vi.fn().mockResolvedValue('COMPACTED');
    const svc = createStateService({
      supabase: upsertSupabase(captured) as never,
      userId: 'u1',
      compact,
      tokenCounter: (s: string) => s.length,
    });

    const big = 'x'.repeat(200); // > 100 budget
    await svc.set('context', 'current_project', big, { tokenBudget: 100 });
    expect(compact).toHaveBeenCalledWith({
      userId: 'u1', key: 'current_project', currentValue: big, tokenBudget: 100,
    });
    expect((captured[0] as { value: string }).value).toBe('COMPACTED');
  });

  it('hard-truncates when compaction throws', async () => {
    const captured: unknown[] = [];
    const compact = vi.fn().mockRejectedValue(new Error('edge down'));
    const svc = createStateService({
      supabase: upsertSupabase(captured) as never,
      userId: 'u1',
      compact,
      tokenCounter: (s: string) => s.length,
    });

    const big = 'x'.repeat(200);
    await svc.set('context', 'k', big, { tokenBudget: 100 });
    // hard-truncate keeps only first budget chars (our fake counter = char count)
    expect((captured[0] as { value: string }).value).toHaveLength(100);
  });
});
