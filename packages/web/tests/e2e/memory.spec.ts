import { test, expect } from '@playwright/test';

// Requires: MEMORY_E2E=1 + Supabase creds + dev stack running on the port
// declared by PUBLIC_BASE_URL in .env.development (currently 5173, so the
// browser Origin matches csrfMiddleware's expectedOrigin and POSTs clear).
test.skip(({}, _testInfo) => !process.env.MEMORY_E2E, 'requires MEMORY_E2E=1 and Supabase creds');

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

  // Capture session 1 URL so we can assert the "Nouvelle session" click
  // really navigated. TanStack Router encodes the id in ?session=<uuid>.
  const session1Url = page.url();

  // Session 2 — new chat, recall
  await page.locator(NEW).first().click();
  // Must have navigated to a distinct session — prevents the recall assertion
  // from matching the prompt echo left over from session 1.
  await expect
    .poll(() => page.url(), { timeout: 10_000 })
    .not.toBe(session1Url);

  await page.locator(INPUT).first().fill('Quel est mon langage préféré ?');
  await page.locator(SEND).first().click();

  // Wait until the second streaming turn ends.
  await stopBtn.waitFor({ state: 'visible', timeout: 5_000 }).catch(() => {});
  await stopBtn.waitFor({ state: 'hidden', timeout: 30_000 });

  // The recall must have resurfaced the fact in Buck's reply. Scope the
  // assertion to the chat scroll area so we don't pick up sidebar titles.
  await expect(
    page.locator('main').getByText(new RegExp(FACT, 'i')),
  ).toBeVisible({ timeout: 5_000 });
});
