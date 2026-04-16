import { test, expect } from '@playwright/test';

const EMAIL = process.env.E2E_EMAIL ?? 'alice@example.com';

test('happy path: request magic link → consume token → logged in → logout', async ({
  page,
  request,
}) => {
  // 1. Open login, submit form
  await page.goto('/login');
  await page.fill('input#email', EMAIL);
  await page.click('button:has-text("Envoyer le lien magique")');
  await expect(page.getByText(/Email envoy/i)).toBeVisible();

  // 2. Retrieve the raw magic-link token from the E2E-only side channel
  const tokenRes = await request.get(
    `/api/__e2e__/last-token?email=${encodeURIComponent(EMAIL)}`,
  );
  expect(tokenRes.ok()).toBeTruthy();
  const { rawToken } = (await tokenRes.json()) as { rawToken: string };

  // 3. Consume the token — server sets cookie + 302 to /
  await page.goto(`/api/auth/callback?token=${rawToken}`);
  await expect(page).toHaveURL('/');
  await expect(
    page.getByText(`Connecté en tant que ${EMAIL}`),
  ).toBeVisible();

  // 4. Logout
  await page.click('button:has-text("Se déconnecter")');
  await expect(page).toHaveURL(/\/login$/);
});
