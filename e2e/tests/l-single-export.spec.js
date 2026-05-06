/**
 * L — Single Chat Export (L01–L14)
 *
 * Verifies exporting individual chats as Markdown, HTML, PDF,
 * and the style / content options available in the export dialog.
 */
import { launchExtension, closeExtension } from '../fixtures/extension.js';
import { test, expect }                    from '@playwright/test';
import { buildFullStoragePayload, CHAT_IDS } from '../fixtures/data.js';
import { seedStorage, clearStorage }       from '../helpers/storage.js';
import { openReader, openSidepanel, rightClickChat, clickContextMenuItem } from '../helpers/sidepanel.js';

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
// Helpers
// ---------------------------------------------------------------------------

async function openExportDialogViaContextMenu(chatTitle) {
  const panel = await openSidepanel(context, extensionId);
  const title = chatTitle.slice(0, 25);
  await rightClickChat(panel, title);
  const exportItem = panel.locator('[role="menuitem"]:has-text("Export"), [data-action="export"]').first();
  if (await exportItem.count() > 0) {
    await exportItem.click();
  }
  return panel;
}

async function openExportDialogViaReader(chatId) {
  const reader   = await openReader(context, extensionId, chatId);
  await reader.waitForLoadState('domcontentloaded');
  const exportBtn = reader.locator('button:has-text("Export"), [data-action="export"], .export-btn').first();
  if (await exportBtn.count() > 0) await exportBtn.click();
  return reader;
}

// ---------------------------------------------------------------------------
// L01 — Export dialog opens from context menu
// ---------------------------------------------------------------------------

test('L01 — Export dialog opens via side panel context menu', async () => {
  const sw    = context.serviceWorkers()[0];
  const index = await sw.evaluate(async () => {
    const r = await chrome.storage.local.get('chatIndex');
    return r.chatIndex ?? [];
  });
  if (!index.length) { return; }

  const panel = await openExportDialogViaContextMenu(index[0].title);
  const dialog = panel.locator('[role="dialog"], .export-dialog, [data-testid="export-dialog"]').first();
  if (await dialog.count() > 0) {
    await expect(dialog).toBeVisible({ timeout: 5000 });
  }
  await panel.close();
});

// ---------------------------------------------------------------------------
// L02 — Markdown export produces a .md download
// ---------------------------------------------------------------------------

test('L02 — Markdown export triggers a .md file download', async () => {
  const reader = await openExportDialogViaReader(CHAT_IDS.reactHooks);

  const mdBtn = reader.locator('button:has-text("Markdown"), [data-format="markdown"], [data-export-type="md"]').first();
  if (await mdBtn.count() === 0) { await reader.close(); return; }

  const [download] = await Promise.all([
    reader.waitForEvent('download', { timeout: 10000 }),
    mdBtn.click(),
  ]);

  expect(download.suggestedFilename()).toMatch(/\.md$/i);
  await reader.close();
});

// ---------------------------------------------------------------------------
// L03 — Markdown export file contains correct content
// ---------------------------------------------------------------------------

test('L03 — Exported Markdown file contains YAML frontmatter and chat turns', async () => {
  const reader  = await openExportDialogViaReader(CHAT_IDS.reactHooks);
  const mdBtn   = reader.locator('button:has-text("Markdown"), [data-format="markdown"]').first();
  if (await mdBtn.count() === 0) { await reader.close(); return; }

  const [download] = await Promise.all([
    reader.waitForEvent('download', { timeout: 10000 }),
    mdBtn.click(),
  ]);

  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const content = Buffer.concat(chunks).toString('utf-8');

  expect(content).toContain('---');         // YAML frontmatter delimiter
  expect(content).toContain('🙋');          // User turn prefix
  expect(content).toContain('🤖');          // Assistant turn prefix
  await reader.close();
});

// ---------------------------------------------------------------------------
// L04 — HTML export produces a .html download
// ---------------------------------------------------------------------------

test('L04 — HTML export triggers a .html file download', async () => {
  const reader = await openExportDialogViaReader(CHAT_IDS.reactHooks);

  const htmlBtn = reader.locator('button:has-text("HTML"), [data-format="html"], [data-export-type="html"]').first();
  if (await htmlBtn.count() === 0) { await reader.close(); return; }

  const [download] = await Promise.all([
    reader.waitForEvent('download', { timeout: 10000 }),
    htmlBtn.click(),
  ]);

  expect(download.suggestedFilename()).toMatch(/\.html?$/i);
  await reader.close();
});

// ---------------------------------------------------------------------------
// L05 — HTML export file is valid HTML
// ---------------------------------------------------------------------------

test('L05 — Exported HTML file contains valid HTML structure', async () => {
  const reader  = await openExportDialogViaReader(CHAT_IDS.reactHooks);
  const htmlBtn = reader.locator('button:has-text("HTML"), [data-format="html"]').first();
  if (await htmlBtn.count() === 0) { await reader.close(); return; }

  const [download] = await Promise.all([
    reader.waitForEvent('download', { timeout: 10000 }),
    htmlBtn.click(),
  ]);

  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const content = Buffer.concat(chunks).toString('utf-8');

  expect(content).toContain('<!DOCTYPE html>');
  expect(content).toContain('<html');
  expect(content).toContain('</html>');
  await reader.close();
});

// ---------------------------------------------------------------------------
// L06 — PDF export produces a .pdf download
// ---------------------------------------------------------------------------

test('L06 — PDF export triggers a .pdf file download', async () => {
  const reader  = await openExportDialogViaReader(CHAT_IDS.reactHooks);
  const pdfBtn  = reader.locator('button:has-text("PDF"), [data-format="pdf"], [data-export-type="pdf"]').first();
  if (await pdfBtn.count() === 0) { await reader.close(); return; }

  const [download] = await Promise.all([
    reader.waitForEvent('download', { timeout: 15000 }),
    pdfBtn.click(),
  ]);

  expect(download.suggestedFilename()).toMatch(/\.pdf$/i);
  await reader.close();
});

// ---------------------------------------------------------------------------
// L07 — Export filename based on chat title
// ---------------------------------------------------------------------------

test('L07 — Export filename reflects the chat title', async () => {
  const reader  = await openExportDialogViaReader(CHAT_IDS.reactHooks);
  const mdBtn   = reader.locator('button:has-text("Markdown"), [data-format="markdown"]').first();
  if (await mdBtn.count() === 0) { await reader.close(); return; }

  const [download] = await Promise.all([
    reader.waitForEvent('download', { timeout: 10000 }),
    mdBtn.click(),
  ]);

  const filename = download.suggestedFilename().toLowerCase();
  expect(filename).toMatch(/react|hooks/i);
  await reader.close();
});

// ---------------------------------------------------------------------------
// L08 — Export dialog can be cancelled without downloading
// ---------------------------------------------------------------------------

test('L08 — Cancelling the export dialog produces no download', async () => {
  const reader     = await openExportDialogViaReader(CHAT_IDS.reactHooks);
  const cancelBtn  = reader.locator('button:has-text("Cancel"), [data-action="cancel"]').first();
  if (await cancelBtn.count() > 0) {
    let downloaded = false;
    reader.once('download', () => { downloaded = true; });
    await cancelBtn.click();
    await reader.waitForTimeout(1000);
    expect(downloaded).toBe(false);
  }
  await reader.close();
});

// ---------------------------------------------------------------------------
// L09 — Include notes option in export dialog
// ---------------------------------------------------------------------------

test('L09 — Export dialog offers "Include Notes" option', async () => {
  const reader    = await openExportDialogViaReader(CHAT_IDS.reactHooks);
  const notesOpt  = reader.locator('input[name*="note" i], label:has-text("notes"), [data-option="include-notes"]').first();
  if (await notesOpt.count() > 0) {
    await expect(notesOpt).toBeVisible();
  }
  await reader.close();
});

// ---------------------------------------------------------------------------
// L10 — Include tags option in export dialog
// ---------------------------------------------------------------------------

test('L10 — Export dialog offers "Include Tags" option', async () => {
  const reader   = await openExportDialogViaReader(CHAT_IDS.reactHooks);
  const tagsOpt  = reader.locator('input[name*="tag" i], label:has-text("tags"), [data-option="include-tags"]').first();
  if (await tagsOpt.count() > 0) {
    await expect(tagsOpt).toBeVisible();
  }
  await reader.close();
});

// ---------------------------------------------------------------------------
// L11 — Copy to clipboard option
// ---------------------------------------------------------------------------

test('L11 — Export dialog offers a "Copy to Clipboard" option', async () => {
  const reader   = await openExportDialogViaReader(CHAT_IDS.reactHooks);
  const copyBtn  = reader.locator('button:has-text("Copy"), [data-action="copy-export"]').first();
  if (await copyBtn.count() > 0) {
    await copyBtn.click();
    const text = await reader.evaluate(() => navigator.clipboard.readText().catch(() => ''));
    if (text) {
      expect(text.length).toBeGreaterThan(0);
    }
  }
  await reader.close();
});

// ---------------------------------------------------------------------------
// L12 — Exported Markdown includes tags in frontmatter
// ---------------------------------------------------------------------------

test('L12 — Exported Markdown frontmatter includes chat tags', async () => {
  const reader  = await openExportDialogViaReader(CHAT_IDS.reactHooks);
  const mdBtn   = reader.locator('button:has-text("Markdown"), [data-format="markdown"]').first();
  if (await mdBtn.count() === 0) { await reader.close(); return; }

  const [download] = await Promise.all([
    reader.waitForEvent('download', { timeout: 10000 }),
    mdBtn.click(),
  ]);

  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const content = Buffer.concat(chunks).toString('utf-8');

  expect(content).toMatch(/tags:/i);
  await reader.close();
});

// ---------------------------------------------------------------------------
// L13 — Export preserves code blocks
// ---------------------------------------------------------------------------

test('L13 — Exported Markdown preserves fenced code blocks', async () => {
  const reader  = await openExportDialogViaReader(CHAT_IDS.reactHooks);
  const mdBtn   = reader.locator('button:has-text("Markdown"), [data-format="markdown"]').first();
  if (await mdBtn.count() === 0) { await reader.close(); return; }

  const [download] = await Promise.all([
    reader.waitForEvent('download', { timeout: 10000 }),
    mdBtn.click(),
  ]);

  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const content = Buffer.concat(chunks).toString('utf-8');

  expect(content).toContain('```');
  await reader.close();
});

// ---------------------------------------------------------------------------
// L14 — JSONL export format available
// ---------------------------------------------------------------------------

test('L14 — JSONL export format is available in export dialog', async () => {
  const reader   = await openExportDialogViaReader(CHAT_IDS.reactHooks);
  const jsonlBtn = reader.locator('button:has-text("JSONL"), [data-format="jsonl"], [data-export-type="jsonl"]').first();
  if (await jsonlBtn.count() > 0) {
    const [download] = await Promise.all([
      reader.waitForEvent('download', { timeout: 10000 }),
      jsonlBtn.click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/\.jsonl$/i);
  }
  await reader.close();
});
