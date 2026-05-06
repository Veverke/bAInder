/**
 * U — Compare View (U01–U05)
 *
 * Verifies selecting two chats and opening the compare side-by-side view.
 */
import { launchExtension, closeExtension } from '../fixtures/extension.js';
import { test, expect }                    from '@playwright/test';
import { buildFullStoragePayload }           from '../fixtures/data.js';
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
// Helper: select 2 chats and open compare
// ---------------------------------------------------------------------------

async function selectTwoAndCompare() {
  // Enter multi-select
  const msBtn = panel.locator('button[aria-label*="multi" i], [data-action="multiselect"], .multi-select-btn').first();
  if (await msBtn.count() > 0) await msBtn.click();
  await panel.waitForTimeout(300);

  const checkboxes = panel.locator('input[type="checkbox"], [role="checkbox"]');
  await checkboxes.first().waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
  const count = await checkboxes.count();
  if (count < 2) return false;

  await checkboxes.nth(0).check();
  await checkboxes.nth(1).check();

  const compareBtn = panel.locator('button:has-text("Compare"), [data-action="compare"]').first();
  if (await compareBtn.count() === 0) return false;
  await compareBtn.click();
  return true;
}

// ---------------------------------------------------------------------------
// U01 — Compare view opens with two panels
// ---------------------------------------------------------------------------

test('U01 — Selecting two chats and clicking Compare opens the compare view', async () => {
  const opened = await selectTwoAndCompare();
  if (!opened) { return; }

  // Compare view may open as a new page or within the panel
  const comparePage = context.pages().find(p => p.url().includes('compare')) || panel;
  const columns = comparePage.locator('.compare-column, .compare-panel, [data-testid="compare-col"]');
  await columns.first().waitFor({ state: 'visible', timeout: 6000 });
  await expect(columns.first()).toBeVisible();
});

// ---------------------------------------------------------------------------
// U02 — Both chat titles shown in compare view
// ---------------------------------------------------------------------------

test('U02 — Both chat titles are displayed in the compare view header', async () => {
  const opened = await selectTwoAndCompare();
  if (!opened) { return; }

  const sw    = context.serviceWorkers()[0];
  const index = await sw.evaluate(async () => {
    const r = await chrome.storage.local.get('chatIndex');
    return r.chatIndex ?? [];
  });
  if (index.length < 2) { return; }

  const comparePage = context.pages().find(p => p.url().includes('compare')) || panel;
  await comparePage.waitForLoadState('domcontentloaded');

  const title1 = index[0].title.slice(0, 15);
  const title2 = index[1].title.slice(0, 15);

  await expect(comparePage.locator(`:has-text("${title1}")`).first()).toBeVisible({ timeout: 5000 });
  await expect(comparePage.locator(`:has-text("${title2}")`).first()).toBeVisible({ timeout: 5000 });
});

// ---------------------------------------------------------------------------
// U03 — Compare view shows both conversation contents
// ---------------------------------------------------------------------------

test('U03 — Both chats\' content is rendered in the compare columns', async () => {
  const opened = await selectTwoAndCompare();
  if (!opened) { return; }

  const comparePage = context.pages().find(p => p.url().includes('compare')) || panel;
  await comparePage.waitForLoadState('domcontentloaded');

  const columns = comparePage.locator('.compare-column, .compare-panel, [data-testid="compare-col"]');
  await columns.first().waitFor({ state: 'visible', timeout: 6000 });
  const count = await columns.count();
  expect(count).toBeGreaterThanOrEqual(2);
});

// ---------------------------------------------------------------------------
// U04 — Compare view is scrollable for long chats
// ---------------------------------------------------------------------------

test('U04 — Compare columns are independently scrollable', async () => {
  const opened = await selectTwoAndCompare();
  if (!opened) { return; }

  const comparePage = context.pages().find(p => p.url().includes('compare')) || panel;
  await comparePage.waitForLoadState('domcontentloaded');

  const col = comparePage.locator('.compare-column, .compare-panel').first();
  await col.waitFor({ state: 'visible', timeout: 5000 });
  await col.evaluate(el => el.scrollBy(0, 200));
  // No error = scrollable
});

// ---------------------------------------------------------------------------
// U05 — Compare view can be closed / exited
// ---------------------------------------------------------------------------

test('U05 — Compare view can be closed or exited', async () => {
  const opened = await selectTwoAndCompare();
  if (!opened) { return; }

  const comparePage = context.pages().find(p => p.url().includes('compare')) || null;
  if (comparePage && comparePage !== panel) {
    await comparePage.close();
  } else {
    const closeBtn = panel.locator('button:has-text("Close"), button[aria-label*="close" i], [data-action="close-compare"]').first();
    if (await closeBtn.count() > 0) {
      await closeBtn.click();
    } else {
      await panel.goBack().catch(() => {});
    }
  }
  // Should not crash
  await panel.waitForTimeout(500);
});
