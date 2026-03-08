/**
 * Browser download trigger.
 * This is the only export module that interacts with the DOM.
 *
 * The DOM mutation (createElement / appendChild / click) is isolated behind a
 * swappable "click driver" so that unit tests can inject a spy and verify the
 * url + filename without touching document.body at all.
 */

import { guessMime } from './format-helpers.js';

/**
 * Default (real-browser) click driver.
 * Appends a hidden <a> to the document, programmatically clicks it, then
 * immediately removes it.
 *
 * @param {string} url   - Object URL produced by URL.createObjectURL
 * @param {string} filename
 */
function domClickDriver(url, filename) {
  const a       = document.createElement('a');
  a.href        = url;
  a.download    = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

/** Currently active driver — replaced by tests via {@link setDownloadDriver}. */
let _driver = domClickDriver;

/**
 * Replace the click driver used by {@link triggerDownload}.
 * Call this in test `beforeEach`/`afterEach` to inject a spy and restore the
 * real driver afterwards.
 *
 * Pass `undefined` (or call with no argument) to restore the default DOM driver.
 *
 * @param {((url: string, filename: string) => void) | undefined} fn
 */
export function setDownloadDriver(fn) {
  _driver = fn ?? domClickDriver;
}

/**
 * Trigger a file download in the browser.
 *
 * @param {string} filename
 * @param {string | Blob | ArrayBuffer} content
 * @param {string} [mimeType]
 */
export function triggerDownload(filename, content, mimeType) {
  const mime = mimeType || guessMime(filename);
  const blob = content instanceof Blob
    ? content
    : new Blob([content], { type: mime });

  const url = URL.createObjectURL(blob);
  _driver(url, filename);
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
