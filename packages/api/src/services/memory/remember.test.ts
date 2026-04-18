// packages/api/src/services/memory/remember.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRememberService } from './remember.js';

function successSupabase(insertedId = 'mem-1') {
  return {
    from: vi.fn(() => ({
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn(() => ({
            abortSignal: vi.fn().mockResolvedValue({ data: { id: insertedId }, error: null }),
          })),
        })),
      })),
    })),
  };
}

function failingSupabase() {
  return {
    from: vi.fn(() => ({
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn(() => ({
            abortSignal: vi.fn().mockRejectedValue(new Error('network')),
          })),
        })),
      })),
    })),
  };
}

const embedFake = async () => ({ embedding: new Array(3072).fill(0.1), tokens: 10, model: 'm' });

describe('remember service', () => {
  beforeEach(() => vi.useRealTimers());

  it('inserts and returns id on success', async () => {
    const svc = createRememberService({
      supabase: successSupabase('abc') as never,
      embed: embedFake,
      userId: 'u1',
      bufferCap: 100,
    });
    const out = await svc.remember({ content: 'foo', type: 'episodic', importance: 0.5 });
    expect(out).toEqual({ ok: true, id: 'abc' });
    expect(svc.bufferSize()).toBe(0);
  });

  it('buffers on failure and returns deferred', async () => {
    const svc = createRememberService({
      supabase: failingSupabase() as never,
      embed: embedFake,
      userId: 'u1',
      bufferCap: 100,
    });
    const out = await svc.remember({ content: 'bar', type: 'semantic', importance: 0.7 });
    expect(out).toEqual({ ok: true, deferred: true });
    expect(svc.bufferSize()).toBe(1);
  });

  it('drops oldest when buffer full (FIFO)', async () => {
    const svc = createRememberService({
      supabase: failingSupabase() as never,
      embed: embedFake,
      userId: 'u1',
      bufferCap: 2,
    });
    await svc.remember({ content: 'a', type: 'episodic' });
    await svc.remember({ content: 'b', type: 'episodic' });
    await svc.remember({ content: 'c', type: 'episodic' });
    expect(svc.bufferSize()).toBe(2);
    const snapshot = svc.bufferSnapshot();
    expect(snapshot.map((p) => p.payload.content)).toEqual(['b', 'c']);
  });

  it('drain empties buffer when supabase recovers', async () => {
    const svc = createRememberService({
      supabase: failingSupabase() as never,
      embed: embedFake,
      userId: 'u1',
      bufferCap: 100,
    });
    await svc.remember({ content: 'z', type: 'episodic' });
    expect(svc.bufferSize()).toBe(1);

    // swap supabase for successful client via __setClientForTest helper
    svc.__setClientForTest(successSupabase('z-id') as never);
    await svc.drain();
    expect(svc.bufferSize()).toBe(0);
  });
});
