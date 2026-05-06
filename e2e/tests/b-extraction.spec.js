/**
 * B — Turn Capture & Extraction (B01–B10)
 *
 * Verifies that the content script + extractor correctly captures all
 * conversation turns from each supported platform.
 *
 * Approach: serve mock HTML via page.route() → click the injected
 * "Save to bAInder" button → inspect the saved chat in storage.
 *
 * Note: Claude uses a REST API (not DOM scraping) so B tests for Claude
 * require intercepting XHR; those are marked test.fixme and documented.
 */
import { launchExtension, closeExtension } from '../fixtures/extension.js';
import { test, expect }                    from '@playwright/test';
import { routeMockPlatform }               from '../helpers/mock-pages.js';
import { clearStorage, getChatIndex }      from '../helpers/storage.js';

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
// Helper: trigger a full save from a mock page and return the saved chat
// ---------------------------------------------------------------------------

async function saveFromMockPage(platform, path = '/c/test-123') {
  const page = await context.newPage();
  await routeMockPlatform(page, platform, path);

  // Wait for Save button
  const saveBtn = page.locator(
    '[data-bainder-btn], .bainder-save-btn, button[title*="bAInder"], button[title*="Save to bAInder"]'
  ).first();
  await saveBtn.waitFor({ state: 'visible', timeout: 8000 });
  await saveBtn.click();

  // Allow background SW to process and store the chat
  await page.waitForTimeout(2000);
  await page.close();

  // Return all saved chats from storage
  const sw    = context.serviceWorkers()[0];
  const index = await getChatIndex(sw);
  return index;
}

// ---------------------------------------------------------------------------
// B01 — All user turns captured
// ---------------------------------------------------------------------------

test('B01 — ChatGPT: all user turns captured', async () => {
  const index = await saveFromMockPage('chatgpt');
  expect(index.length).toBeGreaterThan(0);

  const sw   = context.serviceWorkers()[0];
  const chat = await sw.evaluate(async (id) => {
    const r = await chrome.storage.local.get(`chat:${id}`);
    return r[`chat:${id}`];
  }, index[0].id);

  // Mock page has 2 user turns (turns 0 and 2)
  const userMessages = chat.messages.filter(m => m.role === 'user');
  expect(userMessages.length).toBeGreaterThanOrEqual(2);
});

// ---------------------------------------------------------------------------
// B02 — All assistant turns captured
// ---------------------------------------------------------------------------

test('B02 — ChatGPT: all assistant turns captured', async () => {
  const index = await saveFromMockPage('chatgpt');
  expect(index.length).toBeGreaterThan(0);

  const sw   = context.serviceWorkers()[0];
  const chat = await sw.evaluate(async (id) => {
    const r = await chrome.storage.local.get(`chat:${id}`);
    return r[`chat:${id}`];
  }, index[0].id);

  const assistantMessages = chat.messages.filter(m => m.role === 'assistant');
  expect(assistantMessages.length).toBeGreaterThanOrEqual(2);
});

// ---------------------------------------------------------------------------
// B03 — Turn order preserved: user → assistant → user → …
// ---------------------------------------------------------------------------

test('B03 — ChatGPT: turn order preserved (user/assistant alternation)', async () => {
  const index = await saveFromMockPage('chatgpt');
  const sw    = context.serviceWorkers()[0];
  const chat  = await sw.evaluate(async (id) => {
    const r = await chrome.storage.local.get(`chat:${id}`);
    return r[`chat:${id}`];
  }, index[0].id);

  // First turn must be user
  expect(chat.messages[0].role).toBe('user');
  // Second turn must be assistant
  expect(chat.messages[1].role).toBe('assistant');
});

// ---------------------------------------------------------------------------
// B04 — Long conversation (4 turns in mock) — all turns present
// ---------------------------------------------------------------------------

test('B04 — ChatGPT: all turns captured in a multi-turn conversation', async () => {
  const index = await saveFromMockPage('chatgpt');
  const sw    = context.serviceWorkers()[0];
  const chat  = await sw.evaluate(async (id) => {
    const r = await chrome.storage.local.get(`chat:${id}`);
    return r[`chat:${id}`];
  }, index[0].id);

  // Mock page has 4 turns total (2 user + 2 assistant)
  expect(chat.messages.length).toBeGreaterThanOrEqual(4);
});

// ---------------------------------------------------------------------------
// B05 — User turn prefixed with 🙋 in stored content
// ---------------------------------------------------------------------------

test('B05 — ChatGPT: user turns prefixed with 🙋 in stored content', async () => {
  const index = await saveFromMockPage('chatgpt');
  const sw    = context.serviceWorkers()[0];
  const chat  = await sw.evaluate(async (id) => {
    const r = await chrome.storage.local.get(`chat:${id}`);
    return r[`chat:${id}`];
  }, index[0].id);

  expect(chat.content).toContain('🙋');
});

// ---------------------------------------------------------------------------
// B06 — Assistant turn prefixed with 🤖 in stored content
// ---------------------------------------------------------------------------

test('B06 — ChatGPT: assistant turns prefixed with 🤖 in stored content', async () => {
  const index = await saveFromMockPage('chatgpt');
  const sw    = context.serviceWorkers()[0];
  const chat  = await sw.evaluate(async (id) => {
    const r = await chrome.storage.local.get(`chat:${id}`);
    return r[`chat:${id}`];
  }, index[0].id);

  expect(chat.content).toContain('🤖');
});

// ---------------------------------------------------------------------------
// B07 — `---` separator between turns
// ---------------------------------------------------------------------------

test('B07 — ChatGPT: HR separators between turns in stored content', async () => {
  const index = await saveFromMockPage('chatgpt');
  const sw    = context.serviceWorkers()[0];
  const chat  = await sw.evaluate(async (id) => {
    const r = await chrome.storage.local.get(`chat:${id}`);
    return r[`chat:${id}`];
  }, index[0].id);

  expect(chat.content).toContain('\n---\n');
});

// ---------------------------------------------------------------------------
// B08 — DeepSeek: extraction captures turns correctly
// ---------------------------------------------------------------------------

test('B08 — DeepSeek: turns extracted and stored', async () => {
  const index = await saveFromMockPage('deepseek');
  expect(index.length).toBeGreaterThan(0);

  const sw   = context.serviceWorkers()[0];
  const chat = await sw.evaluate(async (id) => {
    const r = await chrome.storage.local.get(`chat:${id}`);
    return r[`chat:${id}`];
  }, index[0].id);

  expect(chat.source).toBe('deepseek');
  expect(chat.messages.length).toBeGreaterThanOrEqual(2);
});

// ---------------------------------------------------------------------------
// B09 — Perplexity: answer content captured
// ---------------------------------------------------------------------------

test('B09 — Perplexity: answer content captured from .prose block', async () => {
  const index = await saveFromMockPage('perplexity');
  expect(index.length).toBeGreaterThan(0);

  const sw   = context.serviceWorkers()[0];
  const chat = await sw.evaluate(async (id) => {
    const r = await chrome.storage.local.get(`chat:${id}`);
    return r[`chat:${id}`];
  }, index[0].id);

  expect(chat.source).toBe('perplexity');
  expect(chat.content.length).toBeGreaterThan(50);
});

// ---------------------------------------------------------------------------
// B10 — messageCount set correctly
// ---------------------------------------------------------------------------

test('B10 — ChatGPT: messageCount matches number of messages stored', async () => {
  const index = await saveFromMockPage('chatgpt');
  const sw    = context.serviceWorkers()[0];
  const chat  = await sw.evaluate(async (id) => {
    const r = await chrome.storage.local.get(`chat:${id}`);
    return r[`chat:${id}`];
  }, index[0].id);

  expect(chat.messageCount).toBe(chat.messages.length);
});

// ---------------------------------------------------------------------------
// Claude — requires API interception (manual / live only)
// ---------------------------------------------------------------------------

test.fixme('B-Claude — Claude API extraction requires live session', async () => {
  // Claude's extractor calls the claude.ai REST API (/api/organizations/...).
  // To test this in CI without credentials, intercept XHR responses:
  //   await page.route('https://claude.ai/api/**', async route => {
  //     const url = route.request().url();
  //     if (url.includes('/organizations')) {
  //       await route.fulfill({ json: [{ uuid: 'mock-org-123' }] });
  //     } else if (url.includes('/chat_conversations/')) {
  //       await route.fulfill({ json: MOCK_CLAUDE_CONVERSATION_RESPONSE });
  //     } else {
  //       await route.continue();
  //     }
  //   });
  // MOCK_CLAUDE_CONVERSATION_RESPONSE must match the claude.ai API schema.
});
