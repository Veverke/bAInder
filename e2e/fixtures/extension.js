/**
 * e2e/fixtures/extension.js
 *
 * Core Playwright fixture for bAInder extension E2E tests.
 *
 * Provides:
 *   - `context`     A Chromium persistent context with the unpacked extension loaded
 *   - `extensionId` The extension's runtime ID (extracted from the service worker URL)
 *   - `sidepanelUrl` Convenience URL for the side-panel HTML
 *   - `readerUrl(id)` Returns a reader URL for a given chat ID
 *
 * Usage in test files:
 *   import { test, expect } from '../fixtures/extension.js';
 *
 *   test('my test', async ({ context, extensionId, sidepanelUrl }) => {
 *     const page = await context.newPage();
 *     await page.goto(sidepanelUrl);
 *     ...
 *   });
 *
 * Context lifecycle:
 *   Tests should manage context lifecycle themselves using beforeAll/afterAll
 *   in their own describe blocks. The fixture itself creates a fresh context
 *   per test by default (use test.extend to hoist to file-level if needed).
 */

import { test as base, chromium, expect } from '@playwright/test';
import path                               from 'path';
import os                                 from 'os';
import fs                                 from 'fs';
import { fileURLToPath }                  from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

/** Absolute path to the Chrome extension build output. */
export const EXTENSION_PATH = path.resolve(__dirname, '../../dist/chrome');

// ---------------------------------------------------------------------------
// Low-level launcher — used directly by test files that manage their own
// context lifecycle (beforeAll / afterAll pattern).
// ---------------------------------------------------------------------------

/**
 * Launch a new Chromium persistent context with the bAInder extension loaded.
 * Returns `{ context, extensionId }`.
 *
 * The caller is responsible for calling `context.close()` in `afterAll`.
 *
 * @param {object} [options]
 * @param {boolean} [options.headless=false] Run headless (not recommended for extensions)
 * @returns {Promise<{ context: import('@playwright/test').BrowserContext, extensionId: string }>}
 */
export async function launchExtension({ headless = false } = {}) {
  if (!fs.existsSync(EXTENSION_PATH)) {
    throw new Error(
      `Extension build not found at ${EXTENSION_PATH}.\n` +
      `Run "npm run build:chrome" before running E2E tests.`
    );
  }

  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bainder-e2e-'));

  const context = await chromium.launchPersistentContext(userDataDir, {
    headless,
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
      '--no-sandbox',
      '--disable-dev-shm-usage',
      // Suppress "Chrome is being controlled by automated software" banner
      '--disable-infobars',
    ],
    ignoreHTTPSErrors: true,
    viewport:          { width: 1280, height: 800 },
  });

  // Wait for the MV3 service worker to register and extract the extension ID.
  let sw = context.serviceWorkers()[0];
  if (!sw) {
    sw = await context.waitForEvent('serviceworker', { timeout: 15_000 });
  }
  const match = sw.url().match(/chrome-extension:\/\/([^/]+)/);
  if (!match) {
    throw new Error(`Unexpected service worker URL: ${sw.url()}`);
  }
  const extensionId = match[1];

  // Stash the temp dir so the context close hook can clean it up.
  context.__bainderUserDataDir = userDataDir;

  return { context, extensionId };
}

/**
 * Close a context that was opened with launchExtension and remove its temp dir.
 * @param {import('@playwright/test').BrowserContext} context
 */
export async function closeExtension(context) {
  await context.close();
  if (context.__bainderUserDataDir) {
    fs.rmSync(context.__bainderUserDataDir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// Playwright test fixture (per-test context — useful for short spec files)
// ---------------------------------------------------------------------------

export const test = base.extend({
  // Provides a fresh extension context for every single test.
  // For test files that prefer to share context, use launchExtension directly.
  context: async ({}, use) => {
    const { context } = await launchExtension();
    await use(context);
    await closeExtension(context);
  },

  extensionId: async ({ context }, use) => {
    let sw = context.serviceWorkers()[0];
    if (!sw) sw = await context.waitForEvent('serviceworker', { timeout: 10_000 });
    const id = sw.url().match(/chrome-extension:\/\/([^/]+)/)?.[1];
    await use(id);
  },

  sidepanelUrl: async ({ extensionId }, use) => {
    await use(`chrome-extension://${extensionId}/src/sidepanel/sidepanel.html`);
  },
});

export { expect };

/**
 * Returns the reader URL for a given chat ID and extension ID.
 * @param {string} extensionId
 * @param {string} chatId
 * @returns {string}
 */
export function readerUrl(extensionId, chatId) {
  return `chrome-extension://${extensionId}/src/reader/reader.html?id=${chatId}`;
}
