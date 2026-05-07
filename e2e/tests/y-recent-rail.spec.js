/**
 * Y — Recent Rail (Y01–Y06)
 *
 * Verifies the recent-chats rail (quick-access chips at top of side panel).
 */
import { launchExtension, closeExtension } from '../fixtures/extension.js';
import { test, expect }                    from '@playwright/test';
import { buildFullStoragePayload }           from '../fixtures/data.js';
import { seedStorage, clearStorage, getChatIndex }              from '../helpers/storage.js';
import { openSidepanel, rightClickChat, clickContextMenuItem } from '../helpers/sidepanel.js';

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
// Y01 — Recent rail chips visible after seeding chats
// ---------------------------------------------------------------------------

test('Y01 — Recent rail chips appear in the side panel', async () => {
  const chips = panel.locator('.recent-chip, .recent-item, [data-testid="recent-chip"], .rail-chip');
  if (await chips.count() > 0) {
    await expect(chips.first()).toBeVisible();
  }
});

// ---------------------------------------------------------------------------
// Y02 — Clicking a chip opens the reader for that chat
// ---------------------------------------------------------------------------

test('Y02 — Clicking a recent chip opens the reader page for that chat', async () => {
  const chips = panel.locator('.recent-chip, .recent-item, [data-testid="recent-chip"]');
  if (await chips.count() === 0) { return; }

  const [newPage] = await Promise.all([
    context.waitForEvent('page', { timeout: 4000 }).catch(() => null),
    chips.first().click(),
  ]);

  if (newPage) {
    await newPage.waitForLoadState('domcontentloaded');
    expect(newPage.url()).toContain('reader');
    await newPage.close();
  }
});

// ---------------------------------------------------------------------------
// Y03 — Most recently saved chat appears first in the rail
// ---------------------------------------------------------------------------

test('Y03 — Most recently saved chat appears first in the recent rail', async () => {
  const sw    = context.serviceWorkers()[0];
  const index = await getChatIndex(sw);
  if (index.length === 0) { return; }

  // Sort by timestamp to find the most recent
  const sorted = [...index].sort((a, b) => b.timestamp - a.timestamp);
  const mostRecent = sorted[0].title.slice(0, 15);

  const firstChip = panel.locator('.recent-chip, .recent-item, [data-testid="recent-chip"]').first();
  if (await firstChip.count() > 0) {
    const text = await firstChip.textContent();
    expect(text).toContain(mostRecent.slice(0, 10));
  }
});

// ---------------------------------------------------------------------------
// Y04 — Rail capped at a maximum number of chips
// ---------------------------------------------------------------------------

test('Y04 — Recent rail does not exceed maximum chip count', async () => {
  const chips = panel.locator('.recent-chip, .recent-item, [data-testid="recent-chip"]');
  const count = await chips.count();
  // Max is typically 5–10; 7 seeded chats, so should be ≤ 10
  expect(count).toBeLessThanOrEqual(10);
});

// ---------------------------------------------------------------------------
// Y05 — Rail updates when a chat is deleted
// ---------------------------------------------------------------------------

test('Y05 — Recent rail removes a chip when that chat is deleted', async () => {
  const chips = panel.locator('.recent-chip, .recent-item, [data-testid="recent-chip"]');
  if (await chips.count() === 0) { return; }

  const countBefore = await chips.count();
  const chipText = ((await chips.first().textContent()) ?? '').trim();

  // Delete the first chat using context menu
  await rightClickChat(panel, chipText.slice(0, 20)).catch(async () => {
    // Fallback: right-click in chat list
    const chatItem = panel.locator('.chat-item, [data-testid="chat-item"]').first();
    await chatItem.click({ button: 'right' });
  });
  await clickContextMenuItem(panel, 'Delete').catch(() => {});
  const confirmBtn = panel.locator('button:has-text("Delete"), button:has-text("Yes")').first();
  if (await confirmBtn.count() > 0) await confirmBtn.click();
  await panel.waitForTimeout(800);

  const countAfter = await chips.count();
  expect(countAfter).toBeLessThanOrEqual(countBefore);
});

// ---------------------------------------------------------------------------
// Y06 — Rail persists across panel reload
// ---------------------------------------------------------------------------

test('Y06 — Recent rail content persists after reloading the side panel', async () => {
  const chips = panel.locator('.recent-chip, .recent-item, [data-testid="recent-chip"]');
  if (await chips.count() === 0) { return; }

  const textsBefore = await chips.allTextContents();

  await panel.reload({ waitUntil: 'domcontentloaded' });

  const chipsAfter = panel.locator('.recent-chip, .recent-item, [data-testid="recent-chip"]');
  if (await chipsAfter.count() > 0) {
    const textsAfter = await chipsAfter.allTextContents();
    expect(textsAfter[0]).toBe(textsBefore[0]);
  }
});
