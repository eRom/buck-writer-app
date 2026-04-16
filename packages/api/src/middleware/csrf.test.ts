import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { csrfMiddleware, CSRF_COOKIE, CSRF_HEADER } from './csrf.js';

describe('csrf middleware', () => {
  const mkApp = () => {
    const app = new Hono();
    app.use('*', csrfMiddleware());
    app.get('/read', (c) => c.text('ok'));
    app.post('/write', (c) => c.text('written'));
    return app;
  };

  it('GET issues a fresh CSRF cookie if missing', async () => {
    const res = await mkApp().request('/read');
    expect(res.status).toBe(200);
    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toMatch(new RegExp(`${CSRF_COOKIE}=`));
  });

  it('POST without CSRF header is rejected', async () => {
    const res = await mkApp().request('/write', { method: 'POST' });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('csrf_missing');
  });

  it('POST with mismatched header rejected', async () => {
    const res = await mkApp().request('/write', {
      method: 'POST',
      headers: { cookie: `${CSRF_COOKIE}=aaa`, [CSRF_HEADER]: 'bbb' },
    });
    expect(res.status).toBe(403);
  });

  it('POST with matching header+cookie passes', async () => {
    const token = 'abc123'.padEnd(32, 'x');
    const res = await mkApp().request('/write', {
      method: 'POST',
      headers: { cookie: `${CSRF_COOKIE}=${token}`, [CSRF_HEADER]: token },
    });
    expect(res.status).toBe(200);
  });
});
