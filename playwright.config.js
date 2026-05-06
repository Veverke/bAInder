/**
 * playwright.config.js — bAInder E2E test configuration
 *
 * Runs against the built Chrome extension in dist/chrome/.
 * Build first with `npm run build:chrome`, then run `npm run e2e`.
 *
 * All tests run in a single Chromium worker because:
 *   - Extensions can only be loaded into one persistent context at a time
 *   - chrome.storage.local is shared within a profile — parallel workers
 *     would race on the same storage keys
 *
 * Each spec file manages its own browser context lifecycle (beforeAll/afterAll)
 * so tests within a file are fast (context reuse) while files remain isolated.
 */
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir:       './e2e/tests',
  fullyParallel: false,          // must be serial — one extension context at a time
  forbidOnly:    !!process.env.CI,
  retries:       process.env.CI ? 1 : 0,
  workers:       1,
  timeout:       30_000,
  expect:        { timeout: 10_000 },

  reporter: [
    ['html', { outputFolder: 'e2e-report', open: 'never' }],
    ['junit', { outputFile: 'e2e-results.xml' }],
    ['list'],
  ],

  use: {
    trace:      'on-first-retry',
    screenshot: 'only-on-failure',
    video:      'retain-on-failure',
    actionTimeout:      10_000,
    navigationTimeout:  15_000,
  },
});
