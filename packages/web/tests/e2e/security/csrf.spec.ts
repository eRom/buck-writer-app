/**
 * CSRF middleware — runtime probe (REC-07 battery 2).
 *
 * Cross-checks that the CSRF middleware enforces what unit tests cover:
 * tokens are required on state-changing methods, the bad-Origin defense
 * triggers, and the `/webdav` bypass is anchored on a path boundary
 * (VULN-006). Catches a regression where someone accidentally widens the
 * bypass or removes the Origin check.
 *
 * Requires a running API on `E2E_BASE_URL`. The probes hit endpoints
 * that exist regardless of auth state — auth itself returns 401, but
 * the CSRF rejection (403 csrf_missing / bad_origin) wins on the
 * middleware order.
 */
import { test, expect } from '@playwright/test';

test.describe('csrf middleware', () => {
  test('rejects state-changing request without CSRF token (403 csrf_missing)', async ({
    request,
  }) => {
    const res = await request.post('/api/sessions', {
      headers: { 'content-type': 'application/json' },
      data: { title: 'should not pass' },
    });
    expect(res.status()).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe('csrf_missing');
  });

  test('rejects mismatched CSRF cookie+header (403 csrf_mismatch)', async ({
    request,
  }) => {
    const res = await request.post('/api/sessions', {
      headers: {
        'content-type': 'application/json',
        cookie: 'buck_csrf=aaaa',
        'x-csrf-token': 'bbbb',
      },
      data: { title: 'mismatch' },
    });
    expect(res.status()).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe('csrf_mismatch');
  });

  test('rejects POST with foreign Origin header even with valid token (403 bad_origin)', async ({
    request,
  }) => {
    const token = 'a'.repeat(48);
    const res = await request.post('/api/sessions', {
      headers: {
        'content-type': 'application/json',
        cookie: `buck_csrf=${token}`,
        'x-csrf-token': token,
        origin: 'https://evil.example.com',
      },
      data: { title: 'evil-origin' },
    });
    expect(res.status()).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe('bad_origin');
  });

  test('VULN-006 — /webdavbypass lookalike path does NOT inherit the bypass', async ({
    request,
  }) => {
    // PUT without CSRF token. Real /webdav routes bypass; the lookalike
    // path must NOT — middleware should reject before routing to 404.
    const res = await request.put('/webdavbypass/foo.txt', {
      data: 'hello',
    });
    expect(res.status()).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe('csrf_missing');
  });
});
