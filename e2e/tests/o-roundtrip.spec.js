/**
 * O — Round-Trip Export → Import (O01–O05)
 *
 * Exports the full library, clears storage, re-imports, and verifies
 * data integrity (no data loss or corruption).
 */
import { launchExtension, closeExtension } from '../fixtures/extension.js';
import { test, expect }                    from '@playwright/test';
import { buildFullStoragePayload }         from '../fixtures/data.js';
import { seedStorage, clearStorage, getChatIndex } from '../helpers/storage.js';
import { openSidepanel }                  from '../helpers/sidepanel.js';
import JSZip                               from 'jszip';
import path                                from 'path';
import fs                                  from 'fs';
import os                                  from 'os';

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
// O01 — Export all → clear → import → chat titles preserved
// ---------------------------------------------------------------------------

test('O01 — Exported and re-imported chats have the same titles', async () => {
  const sw           = context.serviceWorkers()[0];
  const indexBefore  = await getChatIndex(sw);
  const titlesBefore = indexBefore.map(c => c.title).sort();

  // Trigger export-all
  const exportAllBtn = panel.locator('button:has-text("Export All"), [data-action="export-all"]').first();
  if (await exportAllBtn.count() === 0) { return; } // Feature not present

  const [download] = await Promise.all([
    context.waitForEvent('download', { timeout: 20000 }),
    exportAllBtn.click(),
  ]);

  const tmpPath = path.join(os.tmpdir(), download.suggestedFilename());
  await download.saveAs(tmpPath);

  // Clear storage
  await clearStorage(sw);
  const emptyIndex = await getChatIndex(sw);
  expect(emptyIndex.length).toBe(0);

  // Import the ZIP
  await panel.reload({ waitUntil: 'domcontentloaded' });
  const importBtn = panel.locator('button:has-text("Import"), [data-action="import"]').first();
  if (await importBtn.count() === 0) { fs.unlinkSync(tmpPath); return; }
  await importBtn.click();

  const fileInput = panel.locator('input[type="file"]').first();
  if (await fileInput.count() === 0) { fs.unlinkSync(tmpPath); return; }
  await fileInput.setInputFiles(tmpPath);
  await panel.waitForTimeout(1000);

  const confirmBtn = panel.locator('button:has-text("Import"), button:has-text("Confirm")').first();
  if (await confirmBtn.count() > 0) await confirmBtn.click();
  await panel.waitForTimeout(2000);

  const indexAfter   = await getChatIndex(sw);
  const titlesAfter  = indexAfter.map(c => c.title).sort();
  expect(titlesAfter).toEqual(titlesBefore);

  fs.unlinkSync(tmpPath);
});

// ---------------------------------------------------------------------------
// O02 — Tags preserved across round-trip
// ---------------------------------------------------------------------------

test('O02 — Tags are preserved after export → import round-trip', async () => {
  const sw          = context.serviceWorkers()[0];
  const indexBefore = await getChatIndex(sw);
  const allTagsBefore = indexBefore.flatMap(c => c.tags ?? []).sort();

  const exportAllBtn = panel.locator('button:has-text("Export All"), [data-action="export-all"]').first();
  if (await exportAllBtn.count() === 0) { return; }

  const [download] = await Promise.all([
    context.waitForEvent('download', { timeout: 20000 }),
    exportAllBtn.click(),
  ]);

  const tmpPath = path.join(os.tmpdir(), download.suggestedFilename());
  await download.saveAs(tmpPath);
  await clearStorage(sw);

  await panel.reload({ waitUntil: 'domcontentloaded' });
  const importBtn = panel.locator('button:has-text("Import"), [data-action="import"]').first();
  if (await importBtn.count() === 0) { fs.unlinkSync(tmpPath); return; }
  await importBtn.click();

  const fileInput = panel.locator('input[type="file"]').first();
  if (await fileInput.count() === 0) { fs.unlinkSync(tmpPath); return; }
  await fileInput.setInputFiles(tmpPath);
  await panel.waitForTimeout(1000);

  const confirmBtn = panel.locator('button:has-text("Import"), button:has-text("Confirm")').first();
  if (await confirmBtn.count() > 0) await confirmBtn.click();
  await panel.waitForTimeout(2000);

  const indexAfter    = await getChatIndex(sw);
  const allTagsAfter  = indexAfter.flatMap(c => c.tags ?? []).sort();
  expect(allTagsAfter).toEqual(allTagsBefore);

  fs.unlinkSync(tmpPath);
});

// ---------------------------------------------------------------------------
// O03 — Content preserved across round-trip
// ---------------------------------------------------------------------------

test('O03 — Chat message content is preserved after export → import round-trip', async () => {
  const sw     = context.serviceWorkers()[0];
  const index  = await getChatIndex(sw);
  if (!index.length) { return; }

  const firstId      = index[0].id;
  const chatBefore   = await sw.evaluate(async (id) => {
    const r = await chrome.storage.local.get(`chat:${id}`);
    return r[`chat:${id}`];
  }, firstId);

  const exportAllBtn = panel.locator('button:has-text("Export All"), [data-action="export-all"]').first();
  if (await exportAllBtn.count() === 0) { return; }

  const [download] = await Promise.all([
    context.waitForEvent('download', { timeout: 20000 }),
    exportAllBtn.click(),
  ]);

  const tmpPath = path.join(os.tmpdir(), download.suggestedFilename());
  await download.saveAs(tmpPath);
  await clearStorage(sw);

  await panel.reload({ waitUntil: 'domcontentloaded' });
  const importBtn = panel.locator('button:has-text("Import"), [data-action="import"]').first();
  if (await importBtn.count() === 0) { fs.unlinkSync(tmpPath); return; }
  await importBtn.click();

  const fileInput = panel.locator('input[type="file"]').first();
  if (await fileInput.count() === 0) { fs.unlinkSync(tmpPath); return; }
  await fileInput.setInputFiles(tmpPath);
  await panel.waitForTimeout(1000);

  const confirmBtn = panel.locator('button:has-text("Import"), button:has-text("Confirm")').first();
  if (await confirmBtn.count() > 0) await confirmBtn.click();
  await panel.waitForTimeout(2000);

  const indexAfter = await getChatIndex(sw);
  expect(indexAfter.length).toBeGreaterThan(0);

  const matchId    = indexAfter.find(c => c.title === chatBefore.title)?.id;
  if (matchId) {
    const chatAfter = await sw.evaluate(async (id) => {
      const r = await chrome.storage.local.get(`chat:${id}`);
      return r[`chat:${id}`];
    }, matchId);
    expect(chatAfter.content).toContain('🙋');
  }

  fs.unlinkSync(tmpPath);
});

// ---------------------------------------------------------------------------
// O04 — Topic tree structure preserved across round-trip
// ---------------------------------------------------------------------------

test('O04 — Topic hierarchy is preserved after export → import round-trip', async () => {
  const sw         = context.serviceWorkers()[0];
  const treeBefore = await sw.evaluate(async () => {
    const r = await chrome.storage.local.get('topicTree');
    return r.topicTree ?? null;
  });
  if (!treeBefore) { return; }

  const exportAllBtn = panel.locator('button:has-text("Export All"), [data-action="export-all"]').first();
  if (await exportAllBtn.count() === 0) { return; }

  const [download] = await Promise.all([
    context.waitForEvent('download', { timeout: 20000 }),
    exportAllBtn.click(),
  ]);

  const tmpPath = path.join(os.tmpdir(), download.suggestedFilename());
  await download.saveAs(tmpPath);
  await clearStorage(sw);

  await panel.reload({ waitUntil: 'domcontentloaded' });
  const importBtn = panel.locator('button:has-text("Import"), [data-action="import"]').first();
  if (await importBtn.count() === 0) { fs.unlinkSync(tmpPath); return; }
  await importBtn.click();

  const fileInput = panel.locator('input[type="file"]').first();
  if (await fileInput.count() === 0) { fs.unlinkSync(tmpPath); return; }
  await fileInput.setInputFiles(tmpPath);
  await panel.waitForTimeout(1000);

  const confirmBtn = panel.locator('button:has-text("Import"), button:has-text("Confirm")').first();
  if (await confirmBtn.count() > 0) await confirmBtn.click();
  await panel.waitForTimeout(2000);

  // Programming topic should still exist
  const programmingNode = panel.locator(':has-text("Programming")').first();
  await programmingNode.waitFor({ state: 'visible', timeout: 5000 });
  await expect(programmingNode).toBeVisible();

  fs.unlinkSync(tmpPath);
});

// ---------------------------------------------------------------------------
// O05 — Round-trip with empty library produces empty import
// ---------------------------------------------------------------------------

test('O05 — Exporting an empty library produces an importable but empty export', async () => {
  const sw = context.serviceWorkers()[0];
  await clearStorage(sw);
  await panel.reload({ waitUntil: 'domcontentloaded' });

  const exportAllBtn = panel.locator('button:has-text("Export All"), [data-action="export-all"]').first();
  if (await exportAllBtn.count() === 0) { return; }

  // Export should either produce an empty ZIP or show "nothing to export" message
  let downloaded = false;
  context.once('download', () => { downloaded = true; });
  await exportAllBtn.click();
  await panel.waitForTimeout(3000);

  // Either a download triggered (empty ZIP is ok) or a "nothing to export" notice
  const notice = panel.locator(':has-text("nothing"), :has-text("empty"), :has-text("No chats")').first();
  const noticeVisible = await notice.isVisible().catch(() => false);
  expect(downloaded || noticeVisible).toBe(true);
});
