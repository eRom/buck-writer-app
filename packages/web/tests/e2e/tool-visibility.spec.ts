import { test, expect } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';

// Requires: TOOL_VISIBILITY_E2E=1 + dev stack running (api 3000, web 5173) + a
// fixture text file at tests/e2e/fixtures/sample.txt. We use plain text rather
// than PDF so the test does not require markitdown-worker — the extraction
// path then exercises the 'plain' source which is always available.
test.skip(
  ({}, _testInfo) => !process.env.TOOL_VISIBILITY_E2E,
  'requires TOOL_VISIBILITY_E2E=1 and a running dev stack',
);

const EMAIL = process.env.E2E_EMAIL ?? 'romain.ecarnot@gmail.com';
const FIXTURE = path.resolve(__dirname, 'fixtures', 'sample.txt');
const INPUT = 'textarea[placeholder="Envoyer un message..."]';
const SEND = 'button[aria-label="Envoyer"]';

test.beforeAll(() => {
  if (!fs.existsSync(FIXTURE)) {
    fs.mkdirSync(path.dirname(FIXTURE), { recursive: true });
    fs.writeFileSync(
      FIXTURE,
      'This is a sample text used by the tool-visibility E2E test.\n',
    );
  }
});

test('attachment extraction badge + thinking spinner are visible', async ({ page }) => {
  await page.goto(`/api/__e2e__/dev-login?email=${encodeURIComponent(EMAIL)}`);
  await page.goto('/');

  // Upload the fixture via the hidden file input
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles(FIXTURE);

  // The file chip should appear in the chat input
  await expect(page.getByText('sample.txt')).toBeVisible({ timeout: 5_000 });

  // Send a message
  await page.locator(INPUT).first().fill('Que contient ce fichier ?');
  await page.locator(SEND).first().click();

  // Spinner « Buck réfléchit… » should appear briefly
  await expect(page.getByText(/buck réfléchit/i)).toBeVisible({ timeout: 5_000 });

  // The extraction badge should appear on the user bubble's attachment
  await expect(
    page.locator('main').getByText(/extrait|non extrait|extraction échouée/i).first(),
  ).toBeVisible({ timeout: 10_000 });

  // Wait for streaming to finish
  const stopBtn = page.locator('button[aria-label="Stop"]');
  await stopBtn.waitFor({ state: 'visible', timeout: 5_000 }).catch(() => {});
  await stopBtn.waitFor({ state: 'hidden', timeout: 30_000 });
});
