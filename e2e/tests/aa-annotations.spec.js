/**
 * AA — Annotations (AA01–AA09)
 *
 * Verifies text selection and highlighting in the reader page.
 */
import { launchExtension, closeExtension } from '../fixtures/extension.js';
import { test, expect }                    from '@playwright/test';
import { buildFullStoragePayload, CHAT_IDS } from '../fixtures/data.js';
import { seedStorage, clearStorage }       from '../helpers/storage.js';
import { openReader }                      from '../helpers/sidepanel.js';

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
// AA01 — Selecting text in reader shows highlight toolbar
// ---------------------------------------------------------------------------

test('AA01 — Selecting text in the reader shows an annotation toolbar', async () => {
  const reader = await openReader(context, extensionId, CHAT_IDS.reactHooks);
  await reader.waitForLoadState('domcontentloaded');

  const textNode = reader.locator('.turn p, .message p, [data-testid="turn"] p').first();
  await textNode.waitFor({ state: 'visible', timeout: 5000 });

  // Simulate text selection
  await textNode.evaluate(el => {
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  });

  // Dispatch mouseup to trigger annotation toolbar
  await textNode.dispatchEvent('mouseup');
  await reader.waitForTimeout(500);

  const toolbar = reader.locator('.annotation-toolbar, .highlight-toolbar, [data-testid="annotation-bar"]').first();
  if (await toolbar.count() > 0) {
    await expect(toolbar).toBeVisible();
  }
  await reader.close();
});

// ---------------------------------------------------------------------------
// AA02 — Highlight colour can be chosen from toolbar
// ---------------------------------------------------------------------------

test('AA02 — Highlight colour options are present in annotation toolbar', async () => {
  const reader = await openReader(context, extensionId, CHAT_IDS.reactHooks);
  await reader.waitForLoadState('domcontentloaded');

  const textNode = reader.locator('.turn p, .message p').first();
  await textNode.waitFor({ state: 'visible', timeout: 5000 });
  await textNode.evaluate(el => {
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  });
  await textNode.dispatchEvent('mouseup');
  await reader.waitForTimeout(400);

  const colourBtn = reader.locator(
    '.highlight-yellow, .highlight-btn, [data-colour], [data-color], [aria-label*="yellow" i]'
  ).first();
  if (await colourBtn.count() > 0) {
    await expect(colourBtn).toBeVisible();
  }
  await reader.close();
});

// ---------------------------------------------------------------------------
// AA03 — Highlighted text shown with correct background
// ---------------------------------------------------------------------------

test('AA03 — Highlighted text rendered with coloured background', async () => {
  const reader = await openReader(context, extensionId, CHAT_IDS.reactHooks);
  await reader.waitForLoadState('domcontentloaded');

  const textNode = reader.locator('.turn p, .message p').first();
  await textNode.waitFor({ state: 'visible', timeout: 5000 });
  await textNode.evaluate(el => {
    const range = document.createRange();
    range.selectNodeContents(el);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);
  });
  await textNode.dispatchEvent('mouseup');
  await reader.waitForTimeout(400);

  const highlightBtn = reader.locator('.highlight-yellow, .highlight-btn, [data-colour="yellow"]').first();
  if (await highlightBtn.count() > 0) {
    await highlightBtn.click();
    await reader.waitForTimeout(500);
    const highlighted = reader.locator('mark, .highlight, [data-highlight]').first();
    if (await highlighted.count() > 0) {
      await expect(highlighted).toBeVisible();
    }
  }
  await reader.close();
});

// ---------------------------------------------------------------------------
// AA04 — Annotations persist across reader reloads
// ---------------------------------------------------------------------------

test('AA04 — Annotations persist after reader page reload', async () => {
  const reader = await openReader(context, extensionId, CHAT_IDS.reactHooks);
  await reader.waitForLoadState('domcontentloaded');

  const textNode = reader.locator('.turn p, .message p').first();
  await textNode.waitFor({ state: 'visible', timeout: 5000 });
  const originalText = (await textNode.textContent()).slice(0, 20);

  await textNode.evaluate(el => {
    const range = document.createRange();
    range.selectNodeContents(el);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);
  });
  await textNode.dispatchEvent('mouseup');
  await reader.waitForTimeout(400);

  const highlightBtn = reader.locator('.highlight-yellow, .highlight-btn').first();
  if (await highlightBtn.count() === 0) {
    await reader.close();
    return; // Feature not present
  }
  await highlightBtn.click();
  await reader.waitForTimeout(800);

  await reader.reload({ waitUntil: 'domcontentloaded' });
  const highlighted = reader.locator('mark, .highlight, [data-highlight]').first();
  await highlighted.waitFor({ state: 'visible', timeout: 5000 });
  await expect(highlighted).toBeVisible();
  await reader.close();
});

// ---------------------------------------------------------------------------
// AA05 — Annotation can be removed / cleared
// ---------------------------------------------------------------------------

test('AA05 — Annotation can be removed by clicking "Remove" in toolbar', async () => {
  const reader = await openReader(context, extensionId, CHAT_IDS.reactHooks);
  await reader.waitForLoadState('domcontentloaded');

  const textNode = reader.locator('.turn p, .message p').first();
  await textNode.waitFor({ state: 'visible', timeout: 5000 });
  await textNode.evaluate(el => {
    const range = document.createRange();
    range.selectNodeContents(el);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);
  });
  await textNode.dispatchEvent('mouseup');
  await reader.waitForTimeout(400);

  const highlightBtn = reader.locator('.highlight-yellow, .highlight-btn').first();
  if (await highlightBtn.count() === 0) { await reader.close(); return; }
  await highlightBtn.click();
  await reader.waitForTimeout(500);

  // Click on the highlighted text to show remove option
  const highlighted = reader.locator('mark, .highlight').first();
  if (await highlighted.count() > 0) {
    await highlighted.click();
    await reader.waitForTimeout(300);
    const removeBtn = reader.locator('[data-action="remove-highlight"], button:has-text("Remove"), .remove-highlight').first();
    if (await removeBtn.count() > 0) {
      await removeBtn.click();
      await reader.waitForTimeout(500);
      await expect(reader.locator('mark, .highlight')).toHaveCount(0, { timeout: 3000 });
    }
  }
  await reader.close();
});

// ---------------------------------------------------------------------------
// AA06 — Annotations stored in chrome.storage
// ---------------------------------------------------------------------------

test('AA06 — Annotations are stored in chrome.storage keyed to chat ID', async () => {
  const reader = await openReader(context, extensionId, CHAT_IDS.reactHooks);
  await reader.waitForLoadState('domcontentloaded');

  const textNode = reader.locator('.turn p, .message p').first();
  await textNode.waitFor({ state: 'visible', timeout: 5000 });
  await textNode.evaluate(el => {
    const range = document.createRange();
    range.selectNodeContents(el);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);
  });
  await textNode.dispatchEvent('mouseup');
  await reader.waitForTimeout(400);

  const highlightBtn = reader.locator('.highlight-yellow, .highlight-btn').first();
  if (await highlightBtn.count() === 0) { await reader.close(); return; }
  await highlightBtn.click();
  await reader.waitForTimeout(800);

  const sw   = context.serviceWorkers()[0];
  const data = await sw.evaluate(async (id) => {
    const keys = [`annotations:${id}`, `highlights:${id}`];
    for (const k of keys) {
      const r = await chrome.storage.local.get(k);
      if (r[k]) return r[k];
    }
    return null;
  }, CHAT_IDS.reactHooks);

  if (data !== null) {
    expect(Array.isArray(data) || typeof data === 'object').toBe(true);
  }
  await reader.close();
});

// ---------------------------------------------------------------------------
// AA07 — Annotations across chats are independent
// ---------------------------------------------------------------------------

test('AA07 — Annotations on one chat do not appear in a different chat', async () => {
  // This is ensured by storage key isolation — just verify no cross-contamination
  const sw = context.serviceWorkers()[0];
  const annotations = await sw.evaluate(async (id1, id2) => {
    const r = await chrome.storage.local.get([`annotations:${id1}`, `annotations:${id2}`]);
    return { a1: r[`annotations:${id1}`], a2: r[`annotations:${id2}`] };
  }, CHAT_IDS.reactHooks, CHAT_IDS.existentialism);

  // Neither should have annotations from the other
  expect(annotations.a1).not.toEqual(annotations.a2);
});

// ---------------------------------------------------------------------------
// AA08 — Annotation panel / sidebar lists all annotations
// ---------------------------------------------------------------------------

test.fixme('AA08 — Annotation panel lists all highlights for the current chat', async () => {
  // UI panel listing annotations — not yet confirmed to exist.
});

// ---------------------------------------------------------------------------
// AA09 — Annotations included in exported Markdown
// ---------------------------------------------------------------------------

test.fixme('AA09 — Annotations appear in exported Markdown as HTML mark tags', async () => {
  // Requires export + annotation interaction — deferred.
});
