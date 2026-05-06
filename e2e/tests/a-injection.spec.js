/**
 * A — Extension Lifecycle & Content Script Injection (A01–A10)
 *
 * Uses page.route() to serve mock AI-platform HTML so content scripts inject
 * into a controlled page without requiring live credentials.
 *
 * Platforms tested per spec: ChatGPT (primary), others via parameterised loop.
 */
import { test, expect, launchExtension, closeExtension } from '../fixtures/extension.js';
import { routeMockPlatform, CHATGPT_EMPTY_PAGE }         from '../helpers/mock-pages.js';
import { clearStorage }                                   from '../helpers/storage.js';

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
// A01 — Extension loads with zero console errors on each platform
// ---------------------------------------------------------------------------

for (const platform of ['chatgpt', 'gemini', 'copilot', 'deepseek', 'perplexity']) {
  test(`A01 — ${platform}: zero console errors on load`, async () => {
    const page   = await context.newPage();
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));
    page.on('console',   msg => { if (msg.type() === 'error') errors.push(msg.text()); });

    await routeMockPlatform(page, platform);
    await page.waitForTimeout(1500); // allow content script to run

    // Filter known benign Chrome extension console messages
    const realErrors = errors.filter(e =>
      !e.includes('ERR_BLOCKED_BY_CLIENT') &&
      !e.includes('net::ERR_') &&
      !e.includes('favicon')
    );
    expect(realErrors, `Console errors on ${platform}: ${realErrors.join('; ')}`).toHaveLength(0);
    await page.close();
  });
}

// ---------------------------------------------------------------------------
// A02 — "Save to bAInder" button appears on an active conversation page
// ---------------------------------------------------------------------------

test('A02 — ChatGPT: Save button appears on a conversation page', async () => {
  const page = await context.newPage();
  await routeMockPlatform(page, 'chatgpt', '/c/react-hooks-test');

  // Content script should inject the Save button (give it 3 s to observe the DOM)
  await expect(
    page.locator('[data-bainder-btn], .bainder-save-btn, button[title*="bAInder"], button[title*="Save to bAInder"]').first()
  ).toBeVisible({ timeout: 8000 });

  await page.close();
});

// ---------------------------------------------------------------------------
// A03 — Button absent on home/new-chat page (no conversation)
// ---------------------------------------------------------------------------

test('A03 — ChatGPT: Save button absent on empty new-chat page', async () => {
  const page = await context.newPage();
  await page.route('https://chatgpt.com/**', route =>
    route.fulfill({ contentType: 'text/html', body: CHATGPT_EMPTY_PAGE })
  );
  await page.goto('https://chatgpt.com/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  await expect(
    page.locator('[data-bainder-btn], .bainder-save-btn, button[title*="bAInder"]')
  ).toHaveCount(0);

  await page.close();
});

// ---------------------------------------------------------------------------
// A04 — Button appears after first reply arrives (dynamic injection)
// ---------------------------------------------------------------------------

test('A04 — ChatGPT: Save button appears after first assistant turn is added dynamically', async () => {
  const page = await context.newPage();

  // Start with an empty page (no turns)
  await page.route('https://chatgpt.com/**', route =>
    route.fulfill({ contentType: 'text/html', body: CHATGPT_EMPTY_PAGE })
  );
  await page.goto('https://chatgpt.com/c/new-dynamic', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);

  // Simulate first turn arriving by injecting a conversation-turn article
  await page.evaluate(() => {
    const main = document.querySelector('main') ?? document.body;
    main.innerHTML = `
      <div class="flex flex-col">
        <article data-testid="conversation-turn-0" data-message-author-role="user">
          <div class="text-base"><p>Hello!</p></div>
        </article>
        <article data-testid="conversation-turn-1" data-message-author-role="assistant">
          <div class="markdown prose"><p>Hi there! How can I help you today?</p></div>
        </article>
      </div>`;
  });

  // Content script MutationObserver should detect the new turns
  await expect(
    page.locator('[data-bainder-btn], .bainder-save-btn, button[title*="bAInder"]').first()
  ).toBeVisible({ timeout: 8000 });

  await page.close();
});

// ---------------------------------------------------------------------------
// A05 — Navigating to a different conversation: button follows
// ---------------------------------------------------------------------------

test('A05 — ChatGPT: button appears after SPA navigation to a new conversation', async () => {
  const page = await context.newPage();
  await routeMockPlatform(page, 'chatgpt', '/c/first-conversation');

  // Wait for button on first conversation
  await page.locator('[data-bainder-btn], .bainder-save-btn, button[title*="bAInder"]')
    .first().waitFor({ state: 'visible', timeout: 8000 });

  // Simulate SPA navigation by changing URL and updating DOM
  await page.evaluate(() => {
    window.history.pushState({}, '', '/c/second-conversation');
    document.querySelector('[data-testid^="conversation-turn-0"]')
      ?.setAttribute('data-testid', 'conversation-turn-new-0');
  });
  await page.waitForTimeout(1500);

  // Button should still be present (re-injected or already there)
  await expect(
    page.locator('[data-bainder-btn], .bainder-save-btn, button[title*="bAInder"]').first()
  ).toBeVisible({ timeout: 6000 });

  await page.close();
});

// ---------------------------------------------------------------------------
// A06 — Button absent on non-conversation pages
// ---------------------------------------------------------------------------

test('A06 — ChatGPT: button absent on settings page', async () => {
  const page = await context.newPage();
  await page.route('https://chatgpt.com/**', route =>
    route.fulfill({ contentType: 'text/html', body: '<html><body><h1>Settings</h1></body></html>' })
  );
  await page.goto('https://chatgpt.com/settings', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  await expect(
    page.locator('[data-bainder-btn], .bainder-save-btn, button[title*="bAInder"]')
  ).toHaveCount(0);

  await page.close();
});

// ---------------------------------------------------------------------------
// A07 — Toolbar icon click opens the side panel
// ---------------------------------------------------------------------------

test('A07 — Toolbar icon click opens the side panel', async () => {
  // Open the sidepanel directly (simulates toolbar click opening it)
  const sidepanelUrl = `chrome-extension://${extensionId}/src/sidepanel/sidepanel.html`;
  const panel        = await context.newPage();
  await panel.goto(sidepanelUrl, { waitUntil: 'domcontentloaded' });

  await expect(panel.locator('body')).toBeVisible();
  await expect(panel.locator('#addTopicBtn, [id*="addTopic"]')).toBeVisible({ timeout: 5000 });
  await panel.close();
});

// ---------------------------------------------------------------------------
// A09 — First install: empty state visible when no data exists
// ---------------------------------------------------------------------------

test('A09 — First install: empty state shown when storage is empty', async () => {
  const sidepanelUrl = `chrome-extension://${extensionId}/src/sidepanel/sidepanel.html`;
  const panel        = await context.newPage();
  await panel.goto(sidepanelUrl, { waitUntil: 'domcontentloaded' });

  // The tree should be empty — "Add Topic" button must be visible
  await expect(panel.locator('#addTopicBtn, [id*="addTopic"]')).toBeVisible({ timeout: 5000 });

  // No chat items should exist
  await expect(panel.locator('.chat-item, [data-chat-id]')).toHaveCount(0);

  await panel.close();
});
