import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Hono } from 'hono';
import { createRateLimiter } from './rate-limit.js';

describe('rate-limit', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it('allows requests under the limit', async () => {
    const app = new Hono();
    const limiter = createRateLimiter({
      windowMs: 60_000,
      max: 3,
      keyBy: () => 'test',
    });
    app.use('*', limiter);
    app.get('/', (c) => c.text('ok'));
    for (let i = 0; i < 3; i++) {
      const res = await app.request('/');
      expect(res.status).toBe(200);
    }
  });

  it('blocks 4th request when max=3', async () => {
    const app = new Hono();
    const limiter = createRateLimiter({
      windowMs: 60_000,
      max: 3,
      keyBy: () => 'test2',
    });
    app.use('*', limiter);
    app.get('/', (c) => c.text('ok'));
    for (let i = 0; i < 3; i++) await app.request('/');
    const res = await app.request('/');
    expect(res.status).toBe(429);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('rate_limited');
  });

  it('resets after windowMs', async () => {
    vi.useFakeTimers();
    const app = new Hono();
    const limiter = createRateLimiter({
      windowMs: 1000,
      max: 1,
      keyBy: () => 'test3',
    });
    app.use('*', limiter);
    app.get('/', (c) => c.text('ok'));
    expect((await app.request('/')).status).toBe(200);
    expect((await app.request('/')).status).toBe(429);
    vi.advanceTimersByTime(1100);
    expect((await app.request('/')).status).toBe(200);
    vi.useRealTimers();
  });
});
