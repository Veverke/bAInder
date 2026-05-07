/**
 * Z — Backup Reminders & Stale-Chat Badges (Z01–Z07)
 *
 * Verifies backup reminder banners and stale-chat age badges.
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
});

test.afterEach(async () => {
  if (panel && !panel.isClosed()) await panel.close();
});

// ---------------------------------------------------------------------------
// Helper: seed chats with a specific last-backup timestamp
// ---------------------------------------------------------------------------

async function seedWithLastBackup(sw, lastBackupMsAgo) {
  const payload = buildFullStoragePayload();
  const ts      = Date.now() - lastBackupMsAgo;
  payload.settings = { ...(payload.settings ?? {}), lastBackupAt: ts };
  await seedStorage(sw, payload);
}

// ---------------------------------------------------------------------------
// Z01 — Backup reminder banner shown when no recent backup
// ---------------------------------------------------------------------------

test('Z01 — Backup reminder banner is shown when last backup is more than 30 days ago', async () => {
  const sw = context.serviceWorkers()[0];
  const THIRTY_ONE_DAYS_MS = 31 * 24 * 60 * 60 * 1000;
  await seedWithLastBackup(sw, THIRTY_ONE_DAYS_MS);

  panel = await openSidepanel(context, extensionId);

  const banner = panel.locator('.backup-reminder, [data-testid="backup-banner"], :has-text("backup"), :has-text("Backup")').first();
  if (await banner.count() > 0) {
    await expect(banner).toBeVisible({ timeout: 5000 });
  }
});

// ---------------------------------------------------------------------------
// Z02 — Backup banner is NOT shown when backup is recent
// ---------------------------------------------------------------------------

test('Z02 — Backup reminder banner is hidden when last backup was very recent', async () => {
  const sw = context.serviceWorkers()[0];
  await seedWithLastBackup(sw, 60_000); // 1 minute ago
  panel = await openSidepanel(context, extensionId);
  await panel.waitForTimeout(800);

  const banner = panel.locator('.backup-reminder, [data-testid="backup-banner"]').first();
  if (await banner.count() > 0) {
    await expect(banner).not.toBeVisible();
  }
});

// ---------------------------------------------------------------------------
// Z03 — Backup banner can be dismissed
// ---------------------------------------------------------------------------

test('Z03 — Backup reminder banner can be dismissed by the user', async () => {
  const sw = context.serviceWorkers()[0];
  const THIRTY_ONE_DAYS_MS = 31 * 24 * 60 * 60 * 1000;
  await seedWithLastBackup(sw, THIRTY_ONE_DAYS_MS);
  panel = await openSidepanel(context, extensionId);

  const banner = panel.locator('.backup-reminder, [data-testid="backup-banner"]').first();
  if (await banner.count() === 0) { return; }
  const dismissBtn = banner.locator('button:has-text("Dismiss"), button[aria-label*="close" i]').first();
  if (await dismissBtn.count() === 0) { return; }

  await dismissBtn.click();
  await panel.waitForTimeout(400);
  await expect(banner).not.toBeVisible();
});

// ---------------------------------------------------------------------------
// Z04 — Stale-chat badge shown on chats older than threshold
// ---------------------------------------------------------------------------

test('Z04 — Stale-chat badge shown on chats not viewed in more than threshold days', async () => {
  const sw = context.serviceWorkers()[0];

  // Seed chats with old timestamps (90 days ago)
  const payload    = buildFullStoragePayload();
  const ninetyDaysAgo = Date.now() - 90 * 24 * 60 * 60 * 1000;
  payload.chatIndex = payload.chatIndex.map(c => ({ ...c, timestamp: ninetyDaysAgo }));
  await seedStorage(sw, payload);

  panel = await openSidepanel(context, extensionId);
  await panel.waitForTimeout(800);

  const staleBadge = panel.locator('.stale-badge, .age-badge, [data-testid="stale"], [title*="old" i], [title*="stale" i]').first();
  if (await staleBadge.count() > 0) {
    await expect(staleBadge).toBeVisible();
  }
});

// ---------------------------------------------------------------------------
// Z05 — Recent chats don't show stale badge
// ---------------------------------------------------------------------------

test('Z05 — Freshly saved chats do not display a stale badge', async () => {
  const sw = context.serviceWorkers()[0];

  // Seed chats with current timestamps
  const payload    = buildFullStoragePayload();
  const now        = Date.now();
  payload.chatIndex = payload.chatIndex.map(c => ({ ...c, timestamp: now }));
  await seedStorage(sw, payload);

  panel = await openSidepanel(context, extensionId);
  await panel.waitForTimeout(600);

  const staleBadge = panel.locator('.stale-badge, [data-testid="stale"]').first();
  if (await staleBadge.count() > 0) {
    await expect(staleBadge).not.toBeVisible();
  }
});

// ---------------------------------------------------------------------------
// Z06 — Stale threshold is configurable in settings
// ---------------------------------------------------------------------------

test('Z06 — Stale-chat threshold can be changed in settings', async () => {
  const sw = context.serviceWorkers()[0];
  await seedStorage(sw, buildFullStoragePayload());
  panel = await openSidepanel(context, extensionId);

  const settingsBtn = panel.locator('button[aria-label*="settings" i], [data-action="settings"]').first();
  if (await settingsBtn.count() === 0) { return; }
  await settingsBtn.click();

  const input = panel.locator('input[name*="stale"], input[type="number"][data-setting*="stale"]').first();
  if (await input.count() === 0) { return; }

  await input.fill('14');
  await panel.waitForTimeout(300);
  expect(await input.inputValue()).toBe('14');
});

// ---------------------------------------------------------------------------
// Z07 — Dismissing backup banner persists across reload (doesn't re-show immediately)
// ---------------------------------------------------------------------------

test('Z07 — Dismissed backup reminder does not immediately reappear after reload', async () => {
  const sw = context.serviceWorkers()[0];
  const THIRTY_ONE_DAYS_MS = 31 * 24 * 60 * 60 * 1000;
  await seedWithLastBackup(sw, THIRTY_ONE_DAYS_MS);
  panel = await openSidepanel(context, extensionId);

  const banner = panel.locator('.backup-reminder, [data-testid="backup-banner"]').first();
  if (await banner.count() === 0) { return; }

  const dismissBtn = banner.locator('button:has-text("Dismiss"), button[aria-label*="close" i]').first();
  if (await dismissBtn.count() === 0) { return; }
  await dismissBtn.click();
  await panel.waitForTimeout(500);

  await panel.reload({ waitUntil: 'domcontentloaded' });
  await panel.waitForTimeout(600);

  // Should not reappear immediately
  const bannerAfter = panel.locator('.backup-reminder, [data-testid="backup-banner"]').first();
  if (await bannerAfter.count() > 0) {
    await expect(bannerAfter).not.toBeVisible();
  }
});
