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

  it('does not crash on malformed percent-encoded cookie values', async () => {
    const res = await mkApp().request('/write', {
      method: 'POST',
      headers: {
        // %ZZ is a malformed escape — decodeURIComponent would throw
        cookie: `${CSRF_COOKIE}=%ZZbad`,
        [CSRF_HEADER]: '%ZZbad',
      },
    });
    // Same raw value on both sides → middleware should match (not 500)
    expect(res.status).toBe(200);
  });

  describe('Origin defense-in-depth', () => {
    const mkOriginApp = () => {
      const app = new Hono();
      app.use('*', csrfMiddleware({ expectedOrigin: 'https://buck.example.com' }));
      app.post('/write', (c) => c.text('written'));
      return app;
    };

    it('rejects POST with mismatched Origin even if CSRF token is valid', async () => {
      const token = 'abc123'.padEnd(32, 'x');
      const res = await mkOriginApp().request('/write', {
        method: 'POST',
        headers: {
          cookie: `${CSRF_COOKIE}=${token}`,
          [CSRF_HEADER]: token,
          origin: 'https://evil.example.com',
        },
      });
      expect(res.status).toBe(403);
      const body = (await res.json()) as { error: { code: string } };
      expect(body.error.code).toBe('bad_origin');
    });

    it('accepts POST with matching Origin', async () => {
      const token = 'abc123'.padEnd(32, 'x');
      const res = await mkOriginApp().request('/write', {
        method: 'POST',
        headers: {
          cookie: `${CSRF_COOKIE}=${token}`,
          [CSRF_HEADER]: token,
          origin: 'https://buck.example.com',
        },
      });
      expect(res.status).toBe(200);
    });

    it('accepts POST with missing Origin (non-browser client)', async () => {
      const token = 'abc123'.padEnd(32, 'x');
      const res = await mkOriginApp().request('/write', {
        method: 'POST',
        headers: {
          cookie: `${CSRF_COOKIE}=${token}`,
          [CSRF_HEADER]: token,
        },
      });
      expect(res.status).toBe(200);
    });
  });
});
