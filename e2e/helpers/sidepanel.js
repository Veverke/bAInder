/**
 * e2e/helpers/sidepanel.js
 *
 * Utilities for interacting with the bAInder side panel in E2E tests.
 */

import { buildFullStoragePayload } from '../fixtures/data.js';
import { seedStorage, clearStorage } from './storage.js';

/**
 * Open the side panel page fresh, optionally seeding storage first.
 *
 * Pattern:
 *   const panel = await openSidepanel(context, extensionId);
 *
 * @param {import('@playwright/test').BrowserContext} context
 * @param {string} extensionId
 * @param {boolean} [seedData=false]  Whether to seed default fixture data
 * @returns {Promise<import('@playwright/test').Page>}
 */
export async function openSidepanel(context, extensionId, seedData = false) {
  const url  = `chrome-extension://${extensionId}/src/sidepanel/sidepanel.html`;
  const page = await context.newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded' });

  if (seedData) {
    await seedStorage(page, buildFullStoragePayload());
    await page.reload({ waitUntil: 'networkidle' });
  }

  // Wait for the app to initialise (tree view or empty state must be visible)
  await page.waitForFunction(() =>
    document.getElementById('treeView') !== null ||
    document.getElementById('emptyState') !== null
  , { timeout: 10_000 });

  // Expand all topic nodes so chat items are visible in the DOM.
  await expandAllTopics(page);

  return page;
}

/**
 * Seed storage from an already-open sidepanel page and reload it.
 * Useful when you want to change data mid-test.
 *
 * @param {import('@playwright/test').Page} panelPage
 * @param {object} payload
 */
export async function reseedSidepanel(panelPage, payload) {
  await clearStorage(panelPage);
  await seedStorage(panelPage, payload);
  await panelPage.reload({ waitUntil: 'networkidle' });
  await panelPage.waitForFunction(() =>
    document.getElementById('treeView') !== null ||
    document.getElementById('emptyState') !== null
  , { timeout: 10_000 });
  await expandAllTopics(panelPage);
}

/**
 * Open a chat in the reader (new tab).
 *
 * @param {import('@playwright/test').BrowserContext} context
 * @param {string} extensionId
 * @param {string} chatId
 * @returns {Promise<import('@playwright/test').Page>}
 */
export async function openReader(context, extensionId, chatId) {
  const url  = `chrome-extension://${extensionId}/src/reader/reader.html?chatId=${chatId}`;
  const page = await context.newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded' });

  // Reader is ready when the header becomes visible
  await page.locator('#reader-header').waitFor({ state: 'visible', timeout: 10_000 });
  return page;
}

// ---------------------------------------------------------------------------
// Tree interaction helpers
// ---------------------------------------------------------------------------

/**
 * Expand all topic nodes in the sidepanel so that chat items are visible.
 * Clicks every collapsed expand button and waits for the tree to stabilise.
 * @param {import('@playwright/test').Page} page
 */
export async function expandAllTopics(page) {
  // Run all expand clicks inside the page to avoid per-click action timeouts.
  // btn.click() triggers the same listeners as a user click and render() is
  // synchronous, so after evaluate() returns all nodes are expanded.
  await page.evaluate(() => {
    for (let i = 0; i < 10; i++) {
      const btns = Array.from(
        document.querySelectorAll('#treeView .tree-expand-btn[aria-label="Expand"]')
      );
      if (!btns.length) break;
      btns.forEach(btn => btn.click());
    }
  }).catch(() => {});
}

/**
 * Expand a topic node by its visible name.
 * @param {import('@playwright/test').Page} page
 * @param {string} topicName
 */
export async function expandTopic(page, topicName) {
  const row = page.locator(`.tree-node[data-topic-id]`).filter({ hasText: topicName }).first();
  const expanded = await row.getAttribute('aria-expanded').catch(() => null);
  if (expanded !== 'true') {
    const toggle = row.locator('.tree-expand-btn').first();
    await toggle.click();
  }
}

/**
 * Right-click a topic row to open its context menu.
 * @param {import('@playwright/test').Page} page
 * @param {string} topicName
 */
export async function rightClickTopic(page, topicName) {
  const row = page.locator('.tree-node[data-topic-id]').filter({ hasText: topicName }).first();
  const content = row.locator('.tree-node-content').first();
  await content.click({ button: 'right' });
  await page.locator('#contextMenu').waitFor({ state: 'visible', timeout: 5_000 });
}

/**
 * Right-click a chat row to open its context menu.
 * @param {import('@playwright/test').Page} page
 * @param {string} chatTitle
 */
export async function rightClickChat(page, chatTitle) {
  const row = page.locator('[data-chat-id]').filter({ hasText: chatTitle }).first();
  const content = row.locator('.tree-node-content').first();
  await content.click({ button: 'right' });
  await page.locator('#chatContextMenu').waitFor({ state: 'visible', timeout: 5_000 });
}

/**
 * Click a context menu item by its visible text.
 * @param {import('@playwright/test').Page} page
 * @param {string} label
 */
export async function clickContextMenuItem(page, label) {
  // Find the visible context menu (either topic or chat) and click the item.
  const visibleMenu = page.locator('#contextMenu, #chatContextMenu').filter({ visible: true }).filter({ hasText: label });
  await visibleMenu.locator('.context-menu-item').filter({ hasText: label }).first().click();
}

/**
 * Arm a download capture spy in the page.
 * Call this BEFORE the action that triggers a download, then call
 * `readCapturedDownload(page)` afterwards to retrieve the data.
 *
 * Works for blob: URL downloads from chrome-extension:// pages where
 * Playwright's `waitForEvent('download')` cannot intercept.
 *
 * @param {import('@playwright/test').Page} page
 */
export async function armDownloadCapture(page) {
  await page.evaluate(() => {
    window.__bainderDownloadCapture = null;
    const origCreate = URL.createObjectURL.bind(URL);
    URL.createObjectURL = function (blob) {
      const url = origCreate(blob);
      window.__bainderDownloadCapture = { blob, url };
      return url;
    };
  });
}

/**
 * Wait for a download to be captured (after calling armDownloadCapture) and
 * return its content as a Buffer plus the suggested filename.
 *
 * @param {import('@playwright/test').Page} page
 * @param {number} [timeout=10000]
 * @returns {Promise<{ filename: string|null, buffer: Buffer, type: string }>}
 */
export async function readCapturedDownload(page, timeout = 10000) {
  // Wait until URL.createObjectURL has been called with a blob.
  await page.waitForFunction(
    () => window.__bainderDownloadCapture !== null,
    { timeout }
  );

  // Read the blob content and the filename from the anchor element.
  const result = await page.evaluate(async () => {
    const cap = window.__bainderDownloadCapture;
    if (!cap) return null;
    const ab = await cap.blob.arrayBuffer();
    // The anchor with download attribute may still be in the DOM briefly.
    const anchor = document.querySelector(`a[href="${cap.url}"]`);
    return {
      filename: anchor ? anchor.download : null,
      type:     cap.blob.type,
      data:     Array.from(new Uint8Array(ab)),
    };
  });

  if (!result) throw new Error('No download captured');
  return {
    filename: result.filename,
    type:     result.type,
    buffer:   Buffer.from(result.data),
  };
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {object} fields  { fieldSelector: value, ... }
 * @param {string} [submitText] Text on the submit button (defaults to first primary button)
 */
export async function fillDialog(page, fields, submitText) {
  for (const [key, value] of Object.entries(fields)) {
    // The dialog manager renders inputs with data-field="<name>" attribute.
    // Fall back to input[name="<key>"] for compatibility.
    const el = page.locator(`[data-field="${key}"], input[name="${key}"]`).first();
    await el.fill(value);
  }
  if (submitText) {
    await page.locator(`button`).filter({ hasText: submitText }).first().click();
  } else {
    await page.locator('#modalContainer [data-action="submit"], #modalContainer button[type="submit"], #modalContainer .btn-primary').first().click();
  }
}

/**
 * Dismiss/cancel an open modal dialog.
 * @param {import('@playwright/test').Page} page
 */
export async function cancelDialog(page) {
  await page.locator('[data-action="cancel"], button').filter({ hasText: /cancel/i }).first().click();
}

/**
 * Wait for a toast notification containing the given text.
 * @param {import('@playwright/test').Page} page
 * @param {string} text
 */
export async function waitForToast(page, text) {
  await page.locator('.notification, .toast, [role="alert"]').filter({ hasText: text }).waitFor({ state: 'visible', timeout: 5_000 });
}
