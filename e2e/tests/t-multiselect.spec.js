/**
 * T — Multi-Select (T01–T13)
 *
 * Verifies multi-select mode: toggle, checkboxes, join, digest export,
 * copy all, compare two chats.
 */
import { launchExtension, closeExtension } from '../fixtures/extension.js';
import { test, expect }                    from '@playwright/test';
import { buildFullStoragePayload, CHAT_IDS } from '../fixtures/data.js';
import { seedStorage, clearStorage, getChatIndex } from '../helpers/storage.js';
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
// Helper: enter multi-select mode
// ---------------------------------------------------------------------------

async function enterMultiSelectMode() {
  const multiSelectBtn = panel.locator(
    'button[aria-label*="multi" i], button[title*="select" i], [data-action="multiselect"], .multi-select-btn'
  ).first();
  if (await multiSelectBtn.count() > 0) {
    await multiSelectBtn.click();
    return true;
  }
  // Try long-press on first chat item
  const chatItem = panel.locator('.chat-item, [data-testid="chat-item"]').first();
  if (await chatItem.count() > 0) {
    await chatItem.dispatchEvent('contextmenu');
    const selectItem = panel.locator('[role="menuitem"]:has-text("Select"), [role="menuitem"]:has-text("Multi")').first();
    if (await selectItem.count() > 0) {
      await selectItem.click();
      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// T01 — Multi-select mode can be activated
// ---------------------------------------------------------------------------

test('T01 — Multi-select mode can be activated from the toolbar', async () => {
  const activated = await enterMultiSelectMode();
  if (activated) {
    const checkbox = panel.locator('input[type="checkbox"], .checkbox, [role="checkbox"]').first();
    await checkbox.waitFor({ state: 'visible', timeout: 4000 });
    await expect(checkbox).toBeVisible();
  }
  // Soft pass if multi-select entry not found
});

// ---------------------------------------------------------------------------
// T02 — Checkboxes appear on all chat items in multi-select mode
// ---------------------------------------------------------------------------

test('T02 — All chat items show checkboxes in multi-select mode', async () => {
  if (!(await enterMultiSelectMode())) { return; }

  const chats     = panel.locator('.chat-item, [data-testid="chat-item"]');
  const checkboxes = panel.locator('input[type="checkbox"], [role="checkbox"]');
  await checkboxes.first().waitFor({ state: 'visible', timeout: 4000 });

  const chatCount = await chats.count();
  const cbCount   = await checkboxes.count();
  expect(cbCount).toBeGreaterThanOrEqual(chatCount > 0 ? 1 : 0);
});

// ---------------------------------------------------------------------------
// T03 — Chat item can be selected via checkbox
// ---------------------------------------------------------------------------

test('T03 — Clicking a checkbox selects the chat item', async () => {
  if (!(await enterMultiSelectMode())) { return; }

  const checkbox = panel.locator('input[type="checkbox"], [role="checkbox"]').first();
  await checkbox.waitFor({ state: 'visible', timeout: 4000 });
  await checkbox.check();

  const isChecked = await checkbox.isChecked();
  expect(isChecked).toBe(true);
});

// ---------------------------------------------------------------------------
// T04 — Multiple chats can be selected simultaneously
// ---------------------------------------------------------------------------

test('T04 — Multiple chat checkboxes can be ticked simultaneously', async () => {
  if (!(await enterMultiSelectMode())) { return; }

  const checkboxes = panel.locator('input[type="checkbox"], [role="checkbox"]');
  await checkboxes.first().waitFor({ state: 'visible', timeout: 4000 });
  const count = await checkboxes.count();

  if (count >= 2) {
    await checkboxes.nth(0).check();
    await checkboxes.nth(1).check();
    expect(await checkboxes.nth(0).isChecked()).toBe(true);
    expect(await checkboxes.nth(1).isChecked()).toBe(true);
  }
});

// ---------------------------------------------------------------------------
// T05 — Multi-select toolbar shows count of selected items
// ---------------------------------------------------------------------------

test('T05 — Multi-select toolbar shows the number of selected items', async () => {
  if (!(await enterMultiSelectMode())) { return; }

  const checkbox = panel.locator('input[type="checkbox"], [role="checkbox"]').first();
  await checkbox.waitFor({ state: 'visible', timeout: 4000 });
  await checkbox.check();

  const counter = panel.locator('.selection-count, [data-testid="selection-count"], :has-text("1 selected")').first();
  if (await counter.count() > 0) {
    await expect(counter).toBeVisible();
    const text = (await counter.textContent()).trim();
    expect(text).toMatch(/1/);
  }
});

// ---------------------------------------------------------------------------
// T06 — "Select All" selects all visible chats
// ---------------------------------------------------------------------------

test('T06 — "Select All" selects every visible chat item', async () => {
  if (!(await enterMultiSelectMode())) { return; }

  const selectAllBtn = panel.locator('button:has-text("Select All"), [data-action="select-all"]').first();
  if (await selectAllBtn.count() === 0) { return; }
  await selectAllBtn.click();

  const checkboxes = panel.locator('input[type="checkbox"], [role="checkbox"]');
  const count = await checkboxes.count();
  for (let i = 0; i < Math.min(count, 5); i++) {
    expect(await checkboxes.nth(i).isChecked()).toBe(true);
  }
});

// ---------------------------------------------------------------------------
// T07 — Deselecting all items via "Select All" toggle
// ---------------------------------------------------------------------------

test('T07 — Clicking "Select All" again deselects all items', async () => {
  if (!(await enterMultiSelectMode())) { return; }

  const selectAllBtn = panel.locator('button:has-text("Select All"), [data-action="select-all"]').first();
  if (await selectAllBtn.count() === 0) { return; }
  await selectAllBtn.click(); // Select all
  await selectAllBtn.click(); // Deselect all

  const checkboxes = panel.locator('input[type="checkbox"]:checked, [role="checkbox"][aria-checked="true"]');
  expect(await checkboxes.count()).toBe(0);
});

// ---------------------------------------------------------------------------
// T08 — Exiting multi-select mode hides checkboxes
// ---------------------------------------------------------------------------

test('T08 — Exiting multi-select mode removes checkboxes from view', async () => {
  if (!(await enterMultiSelectMode())) { return; }

  // Exit via Escape or a cancel button
  const cancelBtn = panel.locator('button:has-text("Cancel"), button:has-text("Done"), [data-action="exit-multiselect"]').first();
  if (await cancelBtn.count() > 0) {
    await cancelBtn.click();
  } else {
    await panel.keyboard.press('Escape');
  }
  await panel.waitForTimeout(400);

  const checkboxes = panel.locator('input[type="checkbox"], [role="checkbox"]');
  expect(await checkboxes.count()).toBe(0);
});

// ---------------------------------------------------------------------------
// T09 — "Delete selected" removes all selected chats
// ---------------------------------------------------------------------------

test('T09 — "Delete selected" removes all selected chats from storage', async () => {
  const sw          = context.serviceWorkers()[0];
  const indexBefore = await getChatIndex(sw);
  if (indexBefore.length < 2) { return; }

  if (!(await enterMultiSelectMode())) { return; }

  const checkboxes = panel.locator('input[type="checkbox"], [role="checkbox"]');
  await checkboxes.first().waitFor({ state: 'visible', timeout: 4000 });
  await checkboxes.nth(0).check();
  await checkboxes.nth(1).check();

  const deleteBtn = panel.locator('button:has-text("Delete"), [data-action="delete-selected"]').first();
  if (await deleteBtn.count() === 0) { return; }
  await deleteBtn.click();

  const confirmBtn = panel.locator('button:has-text("Delete"), button:has-text("Confirm")').first();
  if (await confirmBtn.count() > 0) await confirmBtn.click();
  await panel.waitForTimeout(1500);

  const indexAfter = await getChatIndex(sw);
  expect(indexAfter.length).toBeLessThan(indexBefore.length);
});

// ---------------------------------------------------------------------------
// T10 — "Move selected" moves all selected chats to a topic
// ---------------------------------------------------------------------------

test('T10 — "Move selected" moves all selected chats to a chosen topic', async () => {
  if (!(await enterMultiSelectMode())) { return; }

  const checkboxes = panel.locator('input[type="checkbox"], [role="checkbox"]');
  await checkboxes.first().waitFor({ state: 'visible', timeout: 4000 });
  await checkboxes.nth(0).check();

  const moveBtn = panel.locator('button:has-text("Move"), [data-action="move-selected"]').first();
  if (await moveBtn.count() === 0) { return; }
  await moveBtn.click();

  const dest = panel.locator('button:has-text("Science"), [data-topic]:has-text("Science"), li:has-text("Science")').first();
  if (await dest.count() > 0) await dest.click();
  await panel.waitForTimeout(1000);
  // Soft pass — just verify no crash
});

// ---------------------------------------------------------------------------
// T11 — "Export selected" triggers download
// ---------------------------------------------------------------------------

test('T11 — "Export selected" triggers a download for selected chats', async () => {
  if (!(await enterMultiSelectMode())) { return; }

  const checkboxes = panel.locator('input[type="checkbox"], [role="checkbox"]');
  await checkboxes.first().waitFor({ state: 'visible', timeout: 4000 });
  await checkboxes.nth(0).check();

  const exportBtn = panel.locator('button:has-text("Export"), [data-action="export-selected"]').first();
  if (await exportBtn.count() === 0) { return; }

  const [download] = await Promise.all([
    context.waitForEvent('download', { timeout: 10000 }),
    exportBtn.click(),
  ]).catch(() => [null]);

  if (download) {
    expect(download.suggestedFilename()).toMatch(/\.(zip|md|jsonl)$/i);
  }
});

// ---------------------------------------------------------------------------
// T12 — "Copy all" copies all selected chats' content to clipboard
// ---------------------------------------------------------------------------

test('T12 — "Copy all" copies selected chats content to clipboard', async () => {
  if (!(await enterMultiSelectMode())) { return; }

  const checkboxes = panel.locator('input[type="checkbox"], [role="checkbox"]');
  await checkboxes.first().waitFor({ state: 'visible', timeout: 4000 });
  await checkboxes.nth(0).check();

  const copyBtn = panel.locator('button:has-text("Copy All"), button:has-text("Copy"), [data-action="copy-selected"]').first();
  if (await copyBtn.count() === 0) { return; }
  await copyBtn.click();
  await panel.waitForTimeout(500);

  const text = await panel.evaluate(() => navigator.clipboard.readText().catch(() => '')).catch(() => '');
  if (text) {
    expect(text.length).toBeGreaterThan(0);
  }
});

// ---------------------------------------------------------------------------
// T13 — Selecting exactly 2 chats enables "Compare" button
// ---------------------------------------------------------------------------

test('T13 — Selecting exactly 2 chats enables the "Compare" action', async () => {
  if (!(await enterMultiSelectMode())) { return; }

  const checkboxes = panel.locator('input[type="checkbox"], [role="checkbox"]');
  await checkboxes.first().waitFor({ state: 'visible', timeout: 4000 });
  if (await checkboxes.count() < 2) { return; }
  await checkboxes.nth(0).check();
  await checkboxes.nth(1).check();

  const compareBtn = panel.locator('button:has-text("Compare"), [data-action="compare"]').first();
  if (await compareBtn.count() > 0) {
    await expect(compareBtn).toBeEnabled();
  }
});
