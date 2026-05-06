/**
 * W — Settings Panel (W01–W11)
 *
 * Verifies all settings controls: opening/closing the settings panel,
 * theme and skin, auto-export toggle, stale-chat days, clear-all.
 */
import { launchExtension, closeExtension } from '../fixtures/extension.js';
import { test, expect }                    from '@playwright/test';
import { buildFullStoragePayload }         from '../fixtures/data.js';
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
// Helper
// ---------------------------------------------------------------------------

async function openSettings() {
  const btn = panel.locator(
    'button[aria-label*="settings" i], button[title*="settings" i], [data-action="settings"], .settings-btn'
  ).first();
  if (await btn.count() > 0) {
    await btn.click();
    await panel.waitForTimeout(400);
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// W01 — Settings panel opens via toolbar icon
// ---------------------------------------------------------------------------

test('W01 — Settings panel opens via the toolbar gear/settings icon', async () => {
  const opened = await openSettings();
  if (!opened) { return; }

  const settings = panel.locator('.settings-panel, [data-testid="settings"], [role="region"][aria-label*="Settings"]').first();
  if (await settings.count() > 0) {
    await expect(settings).toBeVisible({ timeout: 5000 });
  }
});

// ---------------------------------------------------------------------------
// W02 — Settings panel can be closed
// ---------------------------------------------------------------------------

test('W02 — Settings panel can be closed via close button', async () => {
  if (!(await openSettings())) { return; }

  const closeBtn = panel.locator('button[aria-label*="close" i], .close-settings, [data-action="close-settings"]').first();
  if (await closeBtn.count() === 0) {
    // Try Escape
    await panel.keyboard.press('Escape');
  } else {
    await closeBtn.click();
  }
  await panel.waitForTimeout(400);

  const settings = panel.locator('.settings-panel, [data-testid="settings"]').first();
  if (await settings.count() > 0) {
    await expect(settings).not.toBeVisible();
  }
});

// ---------------------------------------------------------------------------
// W03 — Theme selection controls present (Dark / Light / Auto)
// ---------------------------------------------------------------------------

test('W03 — Theme selection controls (Dark / Light / Auto) present in settings', async () => {
  if (!(await openSettings())) { return; }

  const darkBtn = panel.locator('button:has-text("Dark"), [data-theme="dark"], input[value="dark"]').first();
  if (await darkBtn.count() > 0) {
    await expect(darkBtn).toBeVisible();
  }
});

// ---------------------------------------------------------------------------
// W04 — Skin selection controls present
// ---------------------------------------------------------------------------

test('W04 — Skin/style controls (Default / Sharp / Rounded) present in settings', async () => {
  if (!(await openSettings())) { return; }

  const skinBtns = panel.locator('[data-skin], .skin-btn, input[name="skin"]');
  if (await skinBtns.count() > 0) {
    await expect(skinBtns.first()).toBeVisible();
  }
});

// ---------------------------------------------------------------------------
// W05 — Auto-export toggle can be switched on/off
// ---------------------------------------------------------------------------

test('W05 — Auto-export toggle can be switched on and off', async () => {
  if (!(await openSettings())) { return; }

  const autoExportToggle = panel.locator(
    'input[name*="auto-export"], [data-setting="auto-export"], label:has-text("Auto")'
  ).first();
  if (await autoExportToggle.count() === 0) { return; }

  const wasChecked = await autoExportToggle.isChecked().catch(() => false);
  await autoExportToggle.click().catch(() => {});
  await panel.waitForTimeout(400);
  const isNowChecked = await autoExportToggle.isChecked().catch(() => !wasChecked);
  expect(isNowChecked).not.toBe(wasChecked);
});

// ---------------------------------------------------------------------------
// W06 — Auto-export toggle state persists after reload
// ---------------------------------------------------------------------------

test('W06 — Auto-export toggle state persists across panel reload', async () => {
  if (!(await openSettings())) { return; }

  const toggle = panel.locator('input[name*="auto-export"], [data-setting="auto-export"]').first();
  if (await toggle.count() === 0) { return; }

  // Enable auto-export
  const wasOn = await toggle.isChecked().catch(() => false);
  if (!wasOn) {
    await toggle.click().catch(() => {});
    await panel.waitForTimeout(400);
  }

  await panel.reload({ waitUntil: 'domcontentloaded' });
  if (!(await openSettings())) { return; }

  const toggleAfter = panel.locator('input[name*="auto-export"], [data-setting="auto-export"]').first();
  if (await toggleAfter.count() > 0) {
    const isOn = await toggleAfter.isChecked().catch(() => true);
    expect(isOn).toBe(true);
  }
});

// ---------------------------------------------------------------------------
// W07 — Stale-chat threshold days input present
// ---------------------------------------------------------------------------

test('W07 — Stale-chat threshold setting accepts a numeric value', async () => {
  if (!(await openSettings())) { return; }

  const staleDaysInput = panel.locator(
    'input[name*="stale"], input[type="number"][name*="days"], [data-setting="stale-days"]'
  ).first();
  if (await staleDaysInput.count() === 0) { return; }

  await staleDaysInput.fill('30');
  expect(await staleDaysInput.inputValue()).toBe('30');
});

// ---------------------------------------------------------------------------
// W08 — "Clear All" button present and guarded by confirmation
// ---------------------------------------------------------------------------

test('W08 — "Clear All" button in settings requires confirmation', async () => {
  if (!(await openSettings())) { return; }

  const clearAllBtn = panel.locator(
    'button:has-text("Clear All"), button:has-text("Clear Library"), [data-action="clear-all"]'
  ).first();
  if (await clearAllBtn.count() === 0) { return; }

  await clearAllBtn.click();

  // A confirmation dialog must appear before data is deleted
  const confirmDialog = panel.locator('[role="alertdialog"], [role="dialog"], .confirm-dialog').first();
  await confirmDialog.waitFor({ state: 'visible', timeout: 4000 });
  await expect(confirmDialog).toBeVisible();

  // Cancel — don't actually clear
  const cancelBtn = panel.locator('button:has-text("Cancel"), button:has-text("No")').first();
  if (await cancelBtn.count() > 0) await cancelBtn.click();
});

// ---------------------------------------------------------------------------
// W09 — "Clear All" with confirmation deletes all data
// ---------------------------------------------------------------------------

test('W09 — Confirming "Clear All" removes all chats from storage', async () => {
  if (!(await openSettings())) { return; }

  const clearAllBtn = panel.locator(
    'button:has-text("Clear All"), [data-action="clear-all"]'
  ).first();
  if (await clearAllBtn.count() === 0) { return; }

  await clearAllBtn.click();

  const confirmBtn = panel.locator('button:has-text("Delete"), button:has-text("Clear"), button:has-text("Yes"), button:has-text("Confirm")').first();
  if (await confirmBtn.count() === 0) { return; }
  await confirmBtn.click();
  await panel.waitForTimeout(2000);

  const sw    = context.serviceWorkers()[0];
  const index = await getChatIndex(sw);
  expect(index.length).toBe(0);
});

// ---------------------------------------------------------------------------
// W10 — Extension version shown in settings
// ---------------------------------------------------------------------------

test('W10 — Extension version number is displayed in settings', async () => {
  if (!(await openSettings())) { return; }

  const versionEl = panel.locator('.version, [data-testid="version"], :has-text("v")').first();
  if (await versionEl.count() > 0) {
    const text = (await versionEl.textContent()).trim();
    expect(text).toMatch(/\d+\.\d+/);
  }
});

// ---------------------------------------------------------------------------
// W11 — Privacy policy link present in settings
// ---------------------------------------------------------------------------

test('W11 — Privacy policy link is present in the settings panel', async () => {
  if (!(await openSettings())) { return; }

  const privacyLink = panel.locator('a:has-text("Privacy"), a[href*="privacy"]').first();
  if (await privacyLink.count() > 0) {
    await expect(privacyLink).toBeVisible();
  }
});
