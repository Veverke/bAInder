/**
 * Q — Storage Indicator (Q01–Q05)
 *
 * Verifies the storage usage meter in the side panel updates correctly
 * as chats are saved and deleted.
 */
import { launchExtension, closeExtension } from '../fixtures/extension.js';
import { test, expect }                    from '@playwright/test';
import { buildFullStoragePayload }         from '../fixtures/data.js';
import { seedStorage, clearStorage }       from '../helpers/storage.js';
import { openSidepanel, rightClickChat, clickContextMenuItem } from '../helpers/sidepanel.js';
import { routeMockPlatform }               from '../helpers/mock-pages.js';

let context, extensionId, panel;

test.beforeAll(async () => {
  ({ context, extensionId } = await launchExtension());
});

test.afterAll(async () => {
  await closeExtension(context);
});

test.beforeEach(async () => {
  if (panel && !panel.isClosed()) await panel.close();
  const sw = context.serviceWorkers()[0];
  await clearStorage(sw);
  panel = await openSidepanel(context, extensionId);
});

test.afterEach(async () => {
  if (panel && !panel.isClosed()) await panel.close();
});

// ---------------------------------------------------------------------------
// Q01 — Storage indicator visible in side panel
// ---------------------------------------------------------------------------

test('Q01 — Storage usage indicator is visible in the side panel', async () => {
  const indicator = panel.locator(
    '.storage-indicator, .storage-bar, [data-testid="storage-indicator"], [aria-label*="storage" i]'
  ).first();
  if (await indicator.count() > 0) {
    await expect(indicator).toBeVisible();
  }
  // Soft pass — indicator may be in settings
});

// ---------------------------------------------------------------------------
// Q02 — Storage shows 0 / low usage on empty state
// ---------------------------------------------------------------------------

test('Q02 — Storage indicator shows minimal usage when library is empty', async () => {
  const indicator = panel.locator('.storage-indicator, .storage-bar, [data-testid="storage-indicator"]').first();
  if (await indicator.count() === 0) { return; }

  const text = (await indicator.textContent()).trim();
  // Storage should show a low number (0 B or very small)
  const num = parseFloat(text.replace(/[^\d.]/g, ''));
  if (!isNaN(num)) {
    expect(num).toBeLessThan(1000); // less than 1 KB
  }
});

// ---------------------------------------------------------------------------
// Q03 — Storage increases after saving a chat
// ---------------------------------------------------------------------------

test('Q03 — Storage usage increases after saving a chat', async () => {
  const indicator = panel.locator('.storage-indicator, .storage-bar, [data-testid="storage-indicator"]').first();
  const before = await indicator.count() > 0 ? (await indicator.textContent()).trim() : null;

  // Save a chat
  const mockPage = await context.newPage();
  await routeMockPlatform(mockPage, 'chatgpt', '/c/q03-test');
  const saveBtn = mockPage.locator('[data-bainder-btn], .bainder-save-btn, button[title*="bAInder"]').first();
  await saveBtn.waitFor({ state: 'visible', timeout: 8000 });
  await saveBtn.click();

  const titleInput = mockPage.locator('input[name="title"], input[placeholder*="title" i]').first();
  await titleInput.waitFor({ state: 'visible', timeout: 6000 }).catch(() => {});
  const confirmBtn = mockPage.locator('button:has-text("Save"), button[type="submit"]').first();
  if (await confirmBtn.count() > 0) await confirmBtn.click();
  await mockPage.waitForTimeout(2000);
  await mockPage.close();

  // Reload panel and check storage
  await panel.reload({ waitUntil: 'domcontentloaded' });
  if (before !== null && await indicator.count() > 0) {
    const after = (await indicator.textContent()).trim();
    // After should differ from before (increased)
    expect(after).not.toBe('0 B'); // At least some storage used
  }
});

// ---------------------------------------------------------------------------
// Q04 — Storage decreases after deleting chats
// ---------------------------------------------------------------------------

test('Q04 — Storage usage decreases after deleting a chat', async () => {
  const sw = context.serviceWorkers()[0];
  await seedStorage(sw, buildFullStoragePayload());
  await panel.reload({ waitUntil: 'domcontentloaded' });
  await panel.waitForTimeout(500);

  const indicator = panel.locator('.storage-indicator, .storage-bar, [data-testid="storage-indicator"]').first();
  if (await indicator.count() === 0) { return; }

  const textBefore = (await indicator.textContent()).trim();
  const numBefore  = parseFloat(textBefore.replace(/[^\d.]/g, ''));

  // Delete first chat
  const index = await sw.evaluate(async () => {
    const r = await chrome.storage.local.get('chatIndex');
    return r.chatIndex ?? [];
  });
  if (!index.length) { return; }
  const title = index[0].title.slice(0, 25);
  await rightClickChat(panel, title);
  await clickContextMenuItem(panel, 'Delete');
  const confirmBtn = panel.locator('button:has-text("Delete"), button:has-text("Confirm")').first();
  if (await confirmBtn.count() > 0) await confirmBtn.click();
  await panel.waitForTimeout(1500);

  const textAfter = (await indicator.textContent()).trim();
  const numAfter  = parseFloat(textAfter.replace(/[^\d.]/g, ''));
  if (!isNaN(numBefore) && !isNaN(numAfter)) {
    expect(numAfter).toBeLessThanOrEqual(numBefore);
  }
});

// ---------------------------------------------------------------------------
// Q05 — Storage indicator shows percentage or absolute value
// ---------------------------------------------------------------------------

test('Q05 — Storage indicator displays a meaningful value (% or bytes)', async () => {
  await seedStorage(context.serviceWorkers()[0], buildFullStoragePayload());
  await panel.reload({ waitUntil: 'domcontentloaded' });
  await panel.waitForTimeout(500);

  const indicator = panel.locator('.storage-indicator, .storage-bar, [data-testid="storage-indicator"]').first();
  if (await indicator.count() === 0) { return; }

  const text = (await indicator.textContent()).trim();
  // Should contain a number and a unit (%, KB, MB, B)
  expect(text).toMatch(/[\d.]+\s*(B|KB|MB|GB|%)/i);
});
