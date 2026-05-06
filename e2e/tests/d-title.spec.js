/**
 * D — Title Generation (D01–D05)
 *
 * Verifies that the auto-generated title for a saved chat is correct.
 */
import { launchExtension, closeExtension } from '../fixtures/extension.js';
import { test, expect }                    from '@playwright/test';
import { clearStorage }                    from '../helpers/storage.js';

let context, extensionId;

test.beforeAll(async () => {
  ({ context, extensionId } = await launchExtension());
});

test.afterAll(async () => {
  await closeExtension(context);
});

test.beforeEach(async () => {
  const sw = context.serviceWorkers()[0];
  await clearStorage(sw);
});

// ---------------------------------------------------------------------------
// Helper: save a chat with a specific user first-message, return stored title
// ---------------------------------------------------------------------------

async function saveChatAndGetTitle(firstUserMessage) {
  const mockHtml = /* html */ `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>ChatGPT</title></head>
<body><div id="__next"><main><div class="flex flex-col">
  <article data-testid="conversation-turn-0" data-message-author-role="user">
    <div class="text-base"><p>${firstUserMessage}</p></div>
  </article>
  <article data-testid="conversation-turn-1" data-message-author-role="assistant">
    <div class="markdown prose w-full"><p>Sure! Here's a detailed answer.</p></div>
  </article>
</div></main></div></body></html>`;

  const page = await context.newPage();
  await page.route('https://chatgpt.com/**', route =>
    route.fulfill({ contentType: 'text/html', body: mockHtml })
  );
  await page.goto('https://chatgpt.com/c/title-test', { waitUntil: 'domcontentloaded' });

  const saveBtn = page.locator('[data-bainder-btn], .bainder-save-btn, button[title*="bAInder"]').first();
  await saveBtn.waitFor({ state: 'visible', timeout: 8000 });
  await saveBtn.click();

  await page.waitForTimeout(2000);
  await page.close();

  const sw = context.serviceWorkers()[0];
  return sw.evaluate(async () => {
    const idx = await chrome.storage.local.get('chatIndex');
    return idx.chatIndex?.[0]?.title ?? null;
  });
}

// ---------------------------------------------------------------------------
// D01 — Title pre-filled with text from first user message
// ---------------------------------------------------------------------------

test('D01 — Title derived from first user message', async () => {
  const title = await saveChatAndGetTitle('How does React Context work?');
  expect(title).toBeTruthy();
  // Title should include recognisable words from the user message
  expect(title.toLowerCase()).toMatch(/react|context/i);
});

// ---------------------------------------------------------------------------
// D02 — Title is a non-empty string
// ---------------------------------------------------------------------------

test('D02 — Title is always a non-empty string', async () => {
  const title = await saveChatAndGetTitle('Explain recursion.');
  expect(typeof title).toBe('string');
  expect(title.trim().length).toBeGreaterThan(0);
});

// ---------------------------------------------------------------------------
// D03 — Very short first message falls back gracefully
// ---------------------------------------------------------------------------

test('D03 — Very short first message produces non-empty fallback title', async () => {
  const title = await saveChatAndGetTitle('Hi');
  expect(title).toBeTruthy();
  expect(title.length).toBeGreaterThan(0);
});

// ---------------------------------------------------------------------------
// D04 — Markdown artefacts stripped from title
// ---------------------------------------------------------------------------

test('D04 — Markdown artefacts stripped from generated title', async () => {
  const title = await saveChatAndGetTitle('**What** is `useState` in ##React?');
  expect(title).not.toContain('**');
  expect(title).not.toContain('`');
  expect(title).not.toContain('##');
});

// ---------------------------------------------------------------------------
// D05 — Title truncated at a reasonable length (≤ 100 chars)
// ---------------------------------------------------------------------------

test('D05 — Title is truncated to a reasonable length', async () => {
  const longMessage = 'A'.repeat(300) + ' something important at the end';
  const title = await saveChatAndGetTitle(longMessage);
  expect(title).toBeTruthy();
  expect(title.length).toBeLessThanOrEqual(100);
});
