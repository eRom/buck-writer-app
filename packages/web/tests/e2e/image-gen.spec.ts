import { test, expect } from '@playwright/test';

// Requires: IMAGE_GEN_E2E=1 + dev stack running (api 3000, web 5173).
// OpenAI /api/chat is intercepted with a mock SSE stream so the test does
// NOT spend tokens.
test.skip(
  ({}, _testInfo) => !process.env.IMAGE_GEN_E2E,
  'requires IMAGE_GEN_E2E=1 and a running dev stack',
);

const EMAIL = process.env.E2E_EMAIL ?? 'romain.ecarnot@gmail.com';
const INPUT = 'textarea[placeholder="Envoyer un message..."]';
const SEND = 'button[aria-label="Envoyer"]';

// 1x1 transparent PNG in base64 — lightweight payload for both partials and final.
const TINY_PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

function buildMockSSE(): string {
  return [
    'event: response.created',
    'data: {"type":"response.created","response":{"id":"resp_mock_1"}}',
    '',
    'event: tool_started',
    'data: {"callId":"ig_mock","toolCallId":"ig_mock","toolName":"image_generation"}',
    '',
    'event: image_partial',
    'data: {"callId":"ig_mock","index":0,"b64":"' + TINY_PNG_B64 + '"}',
    '',
    'event: image_partial',
    'data: {"callId":"ig_mock","index":1,"b64":"' + TINY_PNG_B64 + '"}',
    '',
    'event: image_done',
    'data: {"callId":"ig_mock","b64":"' + TINY_PNG_B64 + '","revisedPrompt":"A test fox","size":"1024x1024"}',
    '',
    'event: assistant_saved',
    'data: {"id":"asst_mock_1"}',
    '',
    'event: done',
    'data: {"usage":{"prompt_tokens":10,"completion_tokens":10},"pendingApproval":false}',
    '',
  ].join('\n');
}

test('image generation: settings toggle, stream partials, action buttons visible', async ({
  page,
}) => {
  // Intercept /api/chat with our mock SSE fixture.
  await page.route('**/api/chat', async (route) => {
    await route.fulfill({
      status: 200,
      headers: {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
      },
      body: buildMockSSE(),
    });
  });

  await page.goto(`/api/__e2e__/dev-login?email=${encodeURIComponent(EMAIL)}`);

  // Activate imageGen in settings.
  await page.goto('/settings');
  const toggle = page.getByLabel("Activer la génération d'images");
  await toggle.waitFor({ state: 'visible', timeout: 10_000 });
  if (!(await toggle.isChecked())) {
    await toggle.click();
  }
  await expect(page.getByRole('radio', { name: /Moyenne/ })).toBeChecked({
    timeout: 5_000,
  });

  // Go back to the chat and send a prompt.
  await page.goto('/');
  await page.locator(INPUT).first().fill('Dessine un renard roux');
  await page.locator(SEND).first().click();

  // The generated image should be rendered.
  const img = page.locator('main img[alt*="Image"], main figure img').first();
  await expect(img).toBeVisible({ timeout: 10_000 });

  // Action buttons appear once the image is done.
  await expect(page.getByTitle(/Sauver|Sauvegardé/)).toBeVisible({
    timeout: 5_000,
  });
  await expect(page.getByTitle('Télécharger')).toBeVisible();
  await expect(page.getByTitle('Agrandir')).toBeVisible();
});
