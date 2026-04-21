import { test, expect } from '@playwright/test';

// TODO(M5-V2): this spec currently produces FAUX-VERT in dev.
//
// Dev proxy topology (Vite :5173/5175 → API :3000) means the browser sends
// Origin=http://localhost:5175 but csrfMiddleware expects PUBLIC_BASE_URL=
// http://localhost:3000, so every POST mutation is rejected 403. The UI
// still echoes the user's prompt in the DOM, and getByText() matches that
// echo instead of Buck's actual reply — test passes without any round-trip
// to Supabase.
//
// Two fixes to unblock:
//   a) align PUBLIC_BASE_URL with the Vite dev port in .env.development, or
//   b) drive the test against a prod-style build (WEB_DIST_ROOT set, Hono
//      serves the SPA on :3000, no Vite proxy in the loop).
//
// Skipping unconditionally until one of the above lands — better an
// obviously-missing test than a silently-misleading one.
test.skip(true, 'Origin/CSRF mismatch in dev proxy — see TODO above');

const INPUT = 'textarea[placeholder="Envoyer un message..."]';
const SEND = 'button[aria-label="Envoyer"]';
const NEW = 'button[aria-label="Nouvelle session"]';
const EMAIL = process.env.E2E_EMAIL ?? 'romain.ecarnot@gmail.com';
const FACT = process.env.E2E_MEMORY_FACT ?? 'TypeScript';

test('Buck remembers a fact across sessions', async ({ page }) => {
  await page.goto(`/api/__e2e__/dev-login?email=${encodeURIComponent(EMAIL)}`);
  await page.goto('/');

  // Session 1 — remember
  await page.locator(INPUT).first().fill(
    `Souviens-toi que mon langage préféré est ${FACT}.`,
  );
  await page.locator(SEND).first().click();
  // Wait for streaming to finish: Stop may or may not appear, but must end hidden.
  const stopBtn = page.locator('button[aria-label="Stop"]');
  await stopBtn.waitFor({ state: 'visible', timeout: 5_000 }).catch(() => {});
  await stopBtn.waitFor({ state: 'hidden', timeout: 30_000 });

  // Session 2 — new chat, recall
  await page.locator(NEW).first().click();
  await page.locator(INPUT).first().fill('Quel est mon langage préféré ?');
  await page.locator(SEND).first().click();

  await expect(
    page.getByText(new RegExp(FACT, 'i')),
  ).toBeVisible({ timeout: 30_000 });
});
