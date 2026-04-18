import { test, expect } from '@playwright/test';

test.skip(({}, _testInfo) => !process.env.MEMORY_E2E, 'requires MEMORY_E2E=1 and Supabase creds');

test('Buck remembers a fact across sessions', async ({ page }) => {
  // Login via dev endpoint
  await page.goto('/api/__e2e__/dev-login?email=romain.ecarnot@gmail.com');
  await page.goto('/');

  // Session 1: remember
  await page.fill('[data-testid="chat-input"]', 'Souviens-toi que mon langage préféré est TypeScript.');
  await page.click('[data-testid="chat-send"]');
  await page.waitForSelector('[data-testid="chat-message-assistant"]');
  await page.waitForTimeout(2000); // let the tool_call finalize

  // Session 2: new chat, recall
  await page.click('[data-testid="chat-new"]');
  await page.fill('[data-testid="chat-input"]', 'Quel est mon langage préféré ?');
  await page.click('[data-testid="chat-send"]');

  const response = await page.waitForSelector('[data-testid="chat-message-assistant"]:last-of-type');
  const text = await response.textContent();
  expect(text?.toLowerCase()).toContain('typescript');
});
