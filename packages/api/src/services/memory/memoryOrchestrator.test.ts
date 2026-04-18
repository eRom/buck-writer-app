// packages/api/src/services/memory/memoryOrchestrator.test.ts
import { describe, it, expect, vi } from 'vitest';
import { buildMemoryContext } from './memoryOrchestrator.js';

function fakeSelectChain(result: { data?: unknown; error?: unknown }) {
  return {
    select: () => ({
      eq: () => ({
        eq: () => ({
          abortSignal: () => Promise.resolve(result),
        }),
      }),
    }),
  };
}

describe('buildMemoryContext', () => {
  it('returns preferences + activeContext when both tiers load', async () => {
    const supabase = {
      from: vi.fn((_table: string) => fakeSelectChain({
        data: [
          { key: 'lang', value: 'fr' },
          { key: 'tone', value: 'trinity' },
        ],
      })),
    };

    const ctx = await buildMemoryContext('user-1', { supabase: supabase as never, timeoutMs: 1500 });
    expect(ctx.degraded).toBe(false);
    expect(ctx.preferences).toEqual({ lang: 'fr', tone: 'trinity' });
  });

  it('returns degraded=true when supabase fails (fail-soft)', async () => {
    const supabase = {
      from: vi.fn(() => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              abortSignal: () => Promise.reject(new Error('timeout')),
            }),
          }),
        }),
      })),
    };

    const ctx = await buildMemoryContext('user-1', { supabase: supabase as never, timeoutMs: 10 });
    expect(ctx.degraded).toBe(true);
    expect(ctx.preferences).toEqual({});
    expect(ctx.activeContext).toEqual({});
  });

  it('returns degraded if supabase returns error property', async () => {
    const supabase = {
      from: vi.fn(() => fakeSelectChain({ error: { message: 'boom' } })),
    };
    const ctx = await buildMemoryContext('user-1', { supabase: supabase as never, timeoutMs: 1500 });
    expect(ctx.degraded).toBe(true);
  });
});
