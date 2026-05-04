/**
 * Security headers — runtime probe (REC-07 battery 6).
 *
 * Verifies that the live API emits the security headers we believe are
 * configured in `packages/api/src/middleware/security-headers.ts`. Drift
 * here means a CSP / HSTS / Permissions-Policy regression escaped unit
 * tests AND CI — exactly the scenario this battery is meant to catch.
 *
 * Requires a running API on `E2E_BASE_URL` (default http://localhost:3000).
 * Run via: `pnpm --filter @buck/web exec playwright test tests/e2e/security/`.
 */
import { test, expect } from '@playwright/test';

test.describe('security headers', () => {
  test('emits HSTS / X-Content-Type-Options / X-Frame / Referrer-Policy', async ({
    request,
  }) => {
    const res = await request.get('/api/health');
    expect(res.ok()).toBeTruthy();

    expect(res.headers()['strict-transport-security']).toContain('max-age=');
    expect(res.headers()['x-content-type-options']).toBe('nosniff');
    expect(res.headers()['x-frame-options']).toBe('DENY');
    expect(res.headers()['referrer-policy']).toBe(
      'strict-origin-when-cross-origin',
    );
  });

  test('CSP locks down script-src and frame-ancestors', async ({ request }) => {
    const res = await request.get('/api/health');
    const csp = res.headers()['content-security-policy'] ?? '';
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self'");
    // 'unsafe-inline' on script-src would defeat half the SAST coverage.
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
  });

  test('Permissions-Policy locks down powerful features (microphone allowed)', async ({
    request,
  }) => {
    const res = await request.get('/api/health');
    const pp = res.headers()['permissions-policy'] ?? '';
    expect(pp).toContain('microphone=(self)');
    expect(pp).toContain('camera=()');
    expect(pp).toContain('geolocation=()');
    expect(pp).toContain('payment=()');
  });

  test('COOP isolates the origin', async ({ request }) => {
    const res = await request.get('/api/health');
    expect(res.headers()['cross-origin-opener-policy']).toBe('same-origin');
  });
});
