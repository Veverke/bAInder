/**
 * storage-sync.js
 *
 * Responsibility: keep the sidepanel's in-memory state consistent when
 * browser.storage is modified by another extension page (e.g. a second
 * sidepanel window, or a background script that writes directly without
 * sending a runtime message).
 *
 * The module registers a single `browser.storage.onChanged` listener and
 * debounces the caller-supplied reload callbacks so that a rapid burst of
 * writes (e.g. an import) causes only one reload per key group.
 *
 * NOT responsible for: applying reloaded data to the UI; that is done by
 * the callbacks injected from sidepanel.js.
 *
 * Design notes
 * ─────────────────────────────────────────────────────────────────────────────
 * • `browser.storage.onChanged` fires for ALL writes, including writes made by
 *   the current page.  This means redundant reloads on self-writes are possible.
 *   They are harmless: every reload simply re-confirms the data already in
 *   memory.  No write-back occurs, so there is no update loop.
 *
 * • A per-key-group "reload in progress" guard prevents overlapping concurrent
 *   reloads for the same key if a debounce window overlaps an async callback.
 *
 * • Tree changes and chat changes are guarded independently so that an import
 *   (which touches both keys) can reload both concurrently once queued.
 */

import browser from '../../lib/vendor/browser.js';
import { logger } from '../../lib/utils/logger.js';

/** Milliseconds to wait after the last change before triggering a reload. */
const DEBOUNCE_MS = 300;

/**
 * Register a `browser.storage.onChanged` listener that calls the supplied
 * callbacks when the watched storage keys change.
 *
 * @param {{
 *   onTopicTreeChanged?: () => Promise<void> | void,
 *   onChatsChanged?:     () => Promise<void> | void,
 * }} callbacks
 *
 * @returns {() => void}
 *   Cleanup function.  Call it to remove the listener (e.g. in tests).
 */
export function initStorageSync({ onTopicTreeChanged, onChatsChanged } = {}) {
  let treeTimer        = null;
  let chatsTimer       = null;
  let treeReloading    = false;
  let chatsReloading   = false;

  /**
   * Schedule a debounced call to `callback`, guarded by `isReloading`.
   * Returns the new timer handle; caller stores it to allow cancellation.
   */
  function schedule(existingTimer, isReloading, setReloading, callback) {
    if (existingTimer !== null) clearTimeout(existingTimer);
    return setTimeout(async () => {
      if (isReloading()) return;
      setReloading(true);
      try {
        await callback();
      } catch (err) {
        logger.error('[StorageSync] reload callback error:', err);
      } finally {
        setReloading(false);
      }
    }, DEBOUNCE_MS);
  }

  function handleChanged(changes /*, areaName — always 'local' */) {
    if ('topicTree' in changes && onTopicTreeChanged) {
      treeTimer = schedule(
        treeTimer,
        () => treeReloading,
        v => { treeReloading = v; },
        onTopicTreeChanged,
      );
    }
    if ('chats' in changes && onChatsChanged) {
      chatsTimer = schedule(
        chatsTimer,
        () => chatsReloading,
        v => { chatsReloading = v; },
        onChatsChanged,
      );
    }
  }

  try {
    browser.storage.onChanged.addListener(handleChanged);
  } catch (_) {
    // Non-extension context (tests without storage stub) — silently skip
  }

  return function cleanup() {
    try {
      browser.storage.onChanged.removeListener(handleChanged);
    } catch (_) { /* ignore */ }
    if (treeTimer  !== null) clearTimeout(treeTimer);
    if (chatsTimer !== null) clearTimeout(chatsTimer);
  };
}
