/**
 * Browser download trigger.
 * This is the only export module that interacts with the DOM.
 */

import { guessMime } from './format-helpers.js';

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
  const a   = document.createElement('a');
  a.href     = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
