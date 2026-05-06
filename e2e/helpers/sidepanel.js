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
  const url  = `chrome-extension://${extensionId}/src/reader/reader.html?id=${chatId}`;
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
 * Expand a topic node by its visible name.
 * @param {import('@playwright/test').Page} page
 * @param {string} topicName
 */
export async function expandTopic(page, topicName) {
  const row = page.locator(`.tree-item[data-topic-name="${topicName}"], .topic-row`).filter({ hasText: topicName }).first();
  const toggle = row.locator('.tree-toggle, .topic-toggle, [aria-expanded]').first();
  const expanded = await toggle.getAttribute('aria-expanded').catch(() => null);
  if (expanded === 'false' || expanded === null) {
    await toggle.click();
  }
}

/**
 * Right-click a topic row to open its context menu.
 * @param {import('@playwright/test').Page} page
 * @param {string} topicName
 */
export async function rightClickTopic(page, topicName) {
  const row = page.locator('.topic-row, [data-topic-id]').filter({ hasText: topicName }).first();
  await row.click({ button: 'right' });
  await page.locator('.context-menu, [role="menu"]').waitFor({ state: 'visible', timeout: 5_000 });
}

/**
 * Right-click a chat row to open its context menu.
 * @param {import('@playwright/test').Page} page
 * @param {string} chatTitle
 */
export async function rightClickChat(page, chatTitle) {
  const row = page.locator('.chat-item, [data-chat-id]').filter({ hasText: chatTitle }).first();
  await row.click({ button: 'right' });
  await page.locator('.context-menu, [role="menu"]').waitFor({ state: 'visible', timeout: 5_000 });
}

/**
 * Click a context menu item by its visible text.
 * @param {import('@playwright/test').Page} page
 * @param {string} label
 */
export async function clickContextMenuItem(page, label) {
  await page.locator('.context-menu [role="menuitem"], .context-menu-item').filter({ hasText: label }).first().click();
}

/**
 * Fill and confirm a modal dialog.
 * @param {import('@playwright/test').Page} page
 * @param {object} fields  { fieldSelector: value, ... }
 * @param {string} [submitText] Text on the submit button (defaults to first primary button)
 */
export async function fillDialog(page, fields, submitText) {
  for (const [selector, value] of Object.entries(fields)) {
    await page.locator(selector).fill(value);
  }
  if (submitText) {
    await page.locator(`button`).filter({ hasText: submitText }).first().click();
  } else {
    await page.locator('[data-action="submit"], .btn-primary').first().click();
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
