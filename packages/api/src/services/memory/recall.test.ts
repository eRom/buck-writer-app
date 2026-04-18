// packages/api/src/services/memory/recall.test.ts
import { describe, it, expect, vi } from 'vitest';
import { createRecallService } from './recall.js';

function rpcSupabase(rows: unknown[]) {
  return {
    rpc: vi.fn().mockResolvedValue({ data: rows, error: null }),
    from: vi.fn(() => ({
      update: vi.fn(() => ({
        in: vi.fn().mockResolvedValue({ error: null }),
      })),
    })),
  };
}

const embedFake = async () => ({ embedding: new Array(3072).fill(0.2), tokens: 5, model: 'm' });

describe('recall service', () => {
  it('calls match_memories RPC with correct params', async () => {
    const supabase = rpcSupabase([]);
    const svc = createRecallService({
      supabase: supabase as never,
      embed: embedFake,
      userId: 'u1',
      threshold: 0.7,
    });

    await svc.recall({ query: 'romain', type: 'semantic', count: 3 });

    expect(supabase.rpc).toHaveBeenCalledWith('match_memories', expect.objectContaining({
      match_threshold: 0.7,
      match_count: 3,
      filter_user_id: 'u1',
      filter_type: 'semantic',
    }));
  });

  it('returns rows mapped to RecallResult', async () => {
    const row = {
      id: 'm1', content: 'foo', memory_type: 'semantic', metadata: {},
      importance: 0.6, similarity: 0.85, created_at: '2026-04-18T00:00:00Z',
    };
    const svc = createRecallService({
      supabase: rpcSupabase([row]) as never,
      embed: embedFake,
      userId: 'u1',
      threshold: 0.7,
    });

    const res = await svc.recall({ query: 'x' });
    expect(res).toHaveLength(1);
    expect(res[0].similarity).toBe(0.85);
  });

  it('bumps access_count asynchronously (non-blocking)', async () => {
    const supabase = rpcSupabase([
      { id: 'm1', content: 'a', memory_type: 'semantic', metadata: {}, importance: 0.5, similarity: 0.8, created_at: 'x' },
      { id: 'm2', content: 'b', memory_type: 'semantic', metadata: {}, importance: 0.5, similarity: 0.75, created_at: 'y' },
    ]);
    const svc = createRecallService({
      supabase: supabase as never,
      embed: embedFake,
      userId: 'u1',
      threshold: 0.7,
    });

    await svc.recall({ query: 'x' });
    // Wait a tick so the fire-and-forget update can run
    await new Promise((r) => setImmediate(r));
    expect(supabase.from).toHaveBeenCalledWith('buck_memories');
  });

  it('returns [] when supabase errors (fail-soft)', async () => {
    const supabase = { rpc: vi.fn().mockResolvedValue({ data: null, error: { message: 'boom' } }) };
    const svc = createRecallService({
      supabase: supabase as never,
      embed: embedFake,
      userId: 'u1',
      threshold: 0.7,
    });
    const res = await svc.recall({ query: 'x' });
    expect(res).toEqual([]);
  });
});
