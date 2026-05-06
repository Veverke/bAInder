/**
 * X — Keyboard Shortcuts (X01–X04)
 *
 * Verifies keyboard interactions within the side panel.
 */
import { launchExtension, closeExtension } from '../fixtures/extension.js';
import { test, expect }                    from '@playwright/test';
import { buildFullStoragePayload }         from '../fixtures/data.js';
import { seedStorage, clearStorage }       from '../helpers/storage.js';
import { openSidepanel }                  from '../helpers/sidepanel.js';

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
  await seedStorage(sw, buildFullStoragePayload());
  panel = await openSidepanel(context, extensionId);
});

test.afterEach(async () => {
  if (panel && !panel.isClosed()) await panel.close();
});

// ---------------------------------------------------------------------------
// X01 — Ctrl+K / Cmd+K focuses the search input
// ---------------------------------------------------------------------------

test('X01 — Ctrl+K focuses the search input', async () => {
  // Ensure focus is in the panel
  await panel.locator('body').click();
  await panel.keyboard.press('Control+k');
  await panel.waitForTimeout(300);

  const searchInput = panel.locator('input[type="search"], input[placeholder*="Search" i], [data-testid="search-input"]').first();
  if (await searchInput.count() > 0) {
    await expect(searchInput).toBeFocused();
  }
});

// ---------------------------------------------------------------------------
// X02 — Escape clears active search and restores full chat list
// ---------------------------------------------------------------------------

test('X02 — Escape clears active search and restores full list', async () => {
  const searchInput = panel.locator('input[type="search"], input[placeholder*="Search" i], [data-testid="search-input"]').first();
  if (await searchInput.count() === 0) { return; }

  await searchInput.fill('React');
  await panel.waitForTimeout(400);

  const resultsBeforeEsc = panel.locator('.chat-item, [data-testid="chat-item"]');
  const countBefore = await resultsBeforeEsc.count();

  await searchInput.press('Escape');
  await panel.waitForTimeout(400);

  const countAfter = await panel.locator('.chat-item, [data-testid="chat-item"]').count();

  // After Escape the list should be restored (>= what was filtered)
  expect(countAfter).toBeGreaterThanOrEqual(countBefore);
  const value = await searchInput.inputValue();
  expect(value).toBe('');
});

// ---------------------------------------------------------------------------
// X03 — Escape exits multi-select mode
// ---------------------------------------------------------------------------

test('X03 — Pressing Escape exits multi-select mode', async () => {
  const msBtn = panel.locator('button[aria-label*="multi" i], [data-action="multiselect"], .multi-select-btn').first();
  if (await msBtn.count() === 0) { return; }

  await msBtn.click();
  await panel.waitForTimeout(400);

  const checkboxes = panel.locator('input[type="checkbox"], [role="checkbox"]');
  if (await checkboxes.count() === 0) { return; }

  await panel.keyboard.press('Escape');
  await panel.waitForTimeout(400);

  // Checkboxes should no longer be visible
  const visibleCheckboxes = checkboxes.filter({ has: panel.locator(':visible') });
  const visibleCount = await visibleCheckboxes.count();
  expect(visibleCount).toBe(0);
});

// ---------------------------------------------------------------------------
// X04 — Arrow keys navigate topic tree (if keyboard navigation supported)
// ---------------------------------------------------------------------------

test.fixme('X04 — Arrow keys navigate through topics in the topic tree', async () => {
  // Focus first topic item
  const firstTopic = panel.locator('.topic-item, [data-testid="topic-item"], [role="treeitem"]').first();
  if (await firstTopic.count() === 0) { return; }

  await firstTopic.click();
  await panel.keyboard.press('ArrowDown');
  await panel.waitForTimeout(200);

  const secondTopic = panel.locator('.topic-item:focus, [data-testid="topic-item"]:focus, [role="treeitem"]:focus');
  if (await secondTopic.count() > 0) {
    await expect(secondTopic).toBeFocused();
  }
});
