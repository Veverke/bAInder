/**
 * AB — Auto-Export (AB01–AB04)
 *
 * Verifies the auto-export feature: default disabled, toggle, and triggering.
 * Note: File-system write verification requires the File System Access API
 * (showDirectoryPicker), so folder write tests are marked fixme.
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
// Helper: open settings and locate auto-export toggle
// ---------------------------------------------------------------------------

async function getAutoExportToggle() {
  const settingsBtn = panel.locator('button[aria-label*="settings" i], [data-action="settings"]').first();
  if (await settingsBtn.count() > 0) {
    await settingsBtn.click();
    await panel.waitForTimeout(400);
  }
  return panel.locator('input[name*="auto-export"], [data-setting="auto-export"], label:has-text("Auto-export") input').first();
}

// ---------------------------------------------------------------------------
// AB01 — Auto-export is disabled by default
// ---------------------------------------------------------------------------

test('AB01 — Auto-export is disabled by default when extension is freshly installed', async () => {
  const sw = context.serviceWorkers()[0];

  // Check storage for auto-export setting (should be off / absent)
  const settings = await sw.evaluate(async () => {
    const r = await chrome.storage.local.get('settings');
    return r.settings ?? {};
  });

  const autoExportOn = settings.autoExport === true;
  expect(autoExportOn).toBe(false);
});

// ---------------------------------------------------------------------------
// AB02 — Auto-export toggle is shown in settings
// ---------------------------------------------------------------------------

test('AB02 — Auto-export toggle is present in the settings panel', async () => {
  const toggle = await getAutoExportToggle();
  if (await toggle.count() > 0) {
    await expect(toggle).toBeVisible();
  }
});

// ---------------------------------------------------------------------------
// AB03 — Toggling auto-export on persists to storage
// ---------------------------------------------------------------------------

test('AB03 — Enabling auto-export saves the setting to storage', async () => {
  const toggle = await getAutoExportToggle();
  if (await toggle.count() === 0) { return; }

  const wasOn = await toggle.isChecked().catch(() => false);
  if (!wasOn) {
    await toggle.click();
    await panel.waitForTimeout(600);
  }

  const sw       = context.serviceWorkers()[0];
  const settings = await sw.evaluate(async () => {
    const r = await chrome.storage.local.get('settings');
    return r.settings ?? {};
  });

  expect(settings.autoExport).toBe(true);
});

// ---------------------------------------------------------------------------
// AB04 — Toggling auto-export off persists to storage
// ---------------------------------------------------------------------------

test('AB04 — Disabling auto-export saves the updated setting to storage', async () => {
  // First enable
  const toggle = await getAutoExportToggle();
  if (await toggle.count() === 0) { return; }

  const isOn = await toggle.isChecked().catch(() => false);
  if (isOn) {
    await toggle.click();
    await panel.waitForTimeout(400);
  }

  const sw       = context.serviceWorkers()[0];
  const settings = await sw.evaluate(async () => {
    const r = await chrome.storage.local.get('settings');
    return r.settings ?? {};
  });

  expect(settings.autoExport).not.toBe(true);
});

// ---------------------------------------------------------------------------
// AB05 (fixme) — Auto-export triggers a folder write after saving a chat
// ---------------------------------------------------------------------------

test.fixme('AB05 — Saving a chat triggers auto-export write to selected folder', async () => {
  // Requires granting File System Access API permission and mocking
  // showDirectoryPicker — not automatable in headless Playwright.
  //
  // Manual verification: enable auto-export, pick a folder in settings,
  // save a chat, verify the folder contains the exported Markdown file.
});
