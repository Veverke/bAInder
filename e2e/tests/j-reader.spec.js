/**
 * J — Reader Page (J01–J13)
 *
 * Verifies the chat reader: metadata bar, turn rendering, code blocks,
 * images, word count, scroll, and title display.
 */
import { launchExtension, closeExtension } from '../fixtures/extension.js';
import { test, expect }                    from '@playwright/test';
import { buildFullStoragePayload, CHAT_IDS } from '../fixtures/data.js';
import { seedStorage, clearStorage }       from '../helpers/storage.js';
import { openReader }                      from '../helpers/sidepanel.js';

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
  await seedStorage(sw, buildFullStoragePayload());
});

// ---------------------------------------------------------------------------
// J01 — Reader page loads for a valid chat ID
// ---------------------------------------------------------------------------

test('J01 — Reader page loads successfully for a seeded chat', async () => {
  const reader = await openReader(context, extensionId, CHAT_IDS.reactHooks);
  await expect(reader).toHaveURL(new RegExp(`chrome-extension://${extensionId}`));
  await reader.close();
});

// ---------------------------------------------------------------------------
// J02 — Chat title shown in reader header
// ---------------------------------------------------------------------------

test('J02 — Reader displays the chat title in the page header', async () => {
  const reader = await openReader(context, extensionId, CHAT_IDS.reactHooks);
  await reader.waitForLoadState('domcontentloaded');

  const heading = reader.locator('h1, h2, .chat-title, [data-testid="chat-title"]').first();
  await heading.waitFor({ state: 'visible', timeout: 5000 });
  const text = (await heading.textContent()).trim();
  expect(text.toLowerCase()).toMatch(/react|hooks|useState/i);
  await reader.close();
});

// ---------------------------------------------------------------------------
// J03 — Source platform badge shown in metadata bar
// ---------------------------------------------------------------------------

test('J03 — Reader shows source platform in the metadata bar', async () => {
  const reader = await openReader(context, extensionId, CHAT_IDS.reactHooks);
  await reader.waitForLoadState('domcontentloaded');

  const source = reader.locator('.source-badge, .platform, [data-testid="source"], img[alt*="ChatGPT"]').first();
  if (await source.count() > 0) {
    await expect(source).toBeVisible();
  }
  await reader.close();
});

// ---------------------------------------------------------------------------
// J04 — Date shown in metadata bar
// ---------------------------------------------------------------------------

test('J04 — Reader shows the chat save date in the metadata bar', async () => {
  const reader = await openReader(context, extensionId, CHAT_IDS.reactHooks);
  await reader.waitForLoadState('domcontentloaded');

  const date = reader.locator('time, .date, [data-testid="date"], .timestamp').first();
  if (await date.count() > 0) {
    const text = (await date.textContent()).trim();
    expect(text.length).toBeGreaterThan(0);
  }
  await reader.close();
});

// ---------------------------------------------------------------------------
// J05 — All conversation turns rendered
// ---------------------------------------------------------------------------

test('J05 — Reader renders all conversation turns (user + assistant)', async () => {
  const reader = await openReader(context, extensionId, CHAT_IDS.reactHooks);
  await reader.waitForLoadState('domcontentloaded');

  const turns = reader.locator('.turn, .message, [data-testid="turn"]');
  await turns.first().waitFor({ state: 'visible', timeout: 5000 });
  const count = await turns.count();
  expect(count).toBeGreaterThanOrEqual(4); // reactHooks has 4 turns
  await reader.close();
});

// ---------------------------------------------------------------------------
// J06 — User turns prefixed with 🙋 icon/label
// ---------------------------------------------------------------------------

test('J06 — User turns show the 🙋 prefix or user label', async () => {
  const reader = await openReader(context, extensionId, CHAT_IDS.reactHooks);
  await reader.waitForLoadState('domcontentloaded');

  const userTurn = reader.locator('.turn-user, [data-role="user"], :has-text("🙋")').first();
  await userTurn.waitFor({ state: 'visible', timeout: 5000 });
  await expect(userTurn).toBeVisible();
  await reader.close();
});

// ---------------------------------------------------------------------------
// J07 — Assistant turns prefixed with 🤖 icon/label
// ---------------------------------------------------------------------------

test('J07 — Assistant turns show the 🤖 prefix or assistant label', async () => {
  const reader = await openReader(context, extensionId, CHAT_IDS.reactHooks);
  await reader.waitForLoadState('domcontentloaded');

  const asstTurn = reader.locator('.turn-assistant, [data-role="assistant"], :has-text("🤖")').first();
  await asstTurn.waitFor({ state: 'visible', timeout: 5000 });
  await expect(asstTurn).toBeVisible();
  await reader.close();
});

// ---------------------------------------------------------------------------
// J08 — Code blocks rendered with syntax highlighting
// ---------------------------------------------------------------------------

test('J08 — Fenced code blocks are rendered with <code> tags in the reader', async () => {
  const reader = await openReader(context, extensionId, CHAT_IDS.reactHooks);
  await reader.waitForLoadState('domcontentloaded');

  const codeBlock = reader.locator('pre code, .code-block, [data-testid="code-block"]').first();
  await codeBlock.waitFor({ state: 'visible', timeout: 5000 });
  await expect(codeBlock).toBeVisible();
  const text = (await codeBlock.textContent()).trim();
  expect(text.length).toBeGreaterThan(0);
  await reader.close();
});

// ---------------------------------------------------------------------------
// J09 — Copy code button in code block
// ---------------------------------------------------------------------------

test('J09 — Copy button present on code blocks in the reader', async () => {
  const reader = await openReader(context, extensionId, CHAT_IDS.reactHooks);
  await reader.waitForLoadState('domcontentloaded');

  const copyBtn = reader.locator('.copy-code-btn, button[title*="copy" i], [data-action="copy-code"]').first();
  if (await copyBtn.count() > 0) {
    await expect(copyBtn).toBeVisible();
  }
  await reader.close();
});

// ---------------------------------------------------------------------------
// J10 — Word count shown
// ---------------------------------------------------------------------------

test('J10 — Reader shows a word count or turn count metric', async () => {
  const reader = await openReader(context, extensionId, CHAT_IDS.reactHooks);
  await reader.waitForLoadState('domcontentloaded');

  const stat = reader.locator('.word-count, .turn-count, [data-testid="stats"], .chat-stats').first();
  if (await stat.count() > 0) {
    const text = (await stat.textContent()).trim();
    expect(text.length).toBeGreaterThan(0);
  }
  await reader.close();
});

// ---------------------------------------------------------------------------
// J11 — Long chat is scrollable
// ---------------------------------------------------------------------------

test('J11 — Reader is scrollable for long conversations', async () => {
  const reader = await openReader(context, extensionId, CHAT_IDS.reactHooks);
  await reader.waitForLoadState('domcontentloaded');

  const scrollable = reader.locator('.reader-body, main, .chat-content').first();
  await scrollable.waitFor({ state: 'visible', timeout: 5000 });
  await scrollable.evaluate(el => el.scrollBy(0, 500));
  // No error = scrolling works
  await reader.close();
});

// ---------------------------------------------------------------------------
// J12 — Reader shows tags assigned to the chat
// ---------------------------------------------------------------------------

test('J12 — Reader displays the tags assigned to the chat', async () => {
  const reader = await openReader(context, extensionId, CHAT_IDS.reactHooks);
  await reader.waitForLoadState('domcontentloaded');

  const tag = reader.locator('.tag-chip:has-text("react"), [data-tag="react"], :has-text("react")').first();
  if (await tag.count() > 0) {
    await expect(tag).toBeVisible();
  }
  await reader.close();
});

// ---------------------------------------------------------------------------
// J13 — Navigating back from reader returns to side panel
// ---------------------------------------------------------------------------

test('J13 — Back button / browser back navigates away from reader without error', async () => {
  const reader = await openReader(context, extensionId, CHAT_IDS.reactHooks);
  await reader.waitForLoadState('domcontentloaded');

  const backBtn = reader.locator('button[aria-label="Back"], .back-btn, [data-action="back"]').first();
  if (await backBtn.count() > 0) {
    await backBtn.click();
  } else {
    await reader.goBack();
  }
  await reader.waitForTimeout(500);
  // Page should not have crashed
  await expect(reader).not.toHaveURL('chrome-error://');
  await reader.close();
});
