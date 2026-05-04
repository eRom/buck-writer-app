/**
 * E2E backdoor gating — runtime probe (REC-07 battery 8).
 *
 * The `/api/__e2e__/*` routes (dev-login, last-token, …) bypass auth
 * entirely. They MUST be unreachable in production. Two layers protect
 * us today:
 *   1. The routes are only mounted when `E2E=1` (env flag).
 *   2. `app.ts` throws on boot if `E2E=1 && NODE_ENV=production`.
 *
 * This probe asserts the runtime contract from the outside: when
 * `E2E_GATE_EXPECT_404=1` is set (CI mode, prod-like config), the
 * routes must return 404. In a normal dev session (`E2E=1` set), the
 * probe is skipped because the routes are LEGITIMATELY mounted.
 *
 * Run prod-mode: `NODE_ENV=production E2E_GATE_EXPECT_404=1 \
 *                 pnpm --filter @buck/web exec playwright test \
 *                   tests/e2e/security/e2e-gate.spec.ts`.
 */
import { test, expect } from '@playwright/test';

const SHOULD_BE_GATED = process.env.E2E_GATE_EXPECT_404 === '1';

test.describe('e2e backdoor gate', () => {
  test.skip(
    !SHOULD_BE_GATED,
    'Set E2E_GATE_EXPECT_404=1 to assert prod-like gating (skipped in dev where /api/__e2e__/* is intentionally mounted)',
  );

  test('GET /api/__e2e__/dev-login is not mounted (404)', async ({
    request,
  }) => {
    const res = await request.get(
      '/api/__e2e__/dev-login?email=stranger@example.com',
    );
    expect(res.status()).toBe(404);
  });

  test('GET /api/__e2e__/last-token is not mounted (404)', async ({
    request,
  }) => {
    const res = await request.get(
      '/api/__e2e__/last-token?email=stranger@example.com',
    );
    expect(res.status()).toBe(404);
  });
});
