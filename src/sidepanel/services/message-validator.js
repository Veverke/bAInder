/**
 * message-validator.js
 *
 * Responsibility: validate every incoming browser.runtime.onMessage payload
 * before the sidepanel dispatches it to a handler.
 *
 * Two-layer defence:
 *   1. Sender identity  — reject messages whose sender.id does not match
 *      the running extension ID (blocks messages from arbitrary web pages
 *      or other extensions).
 *   2. Payload schema   — reject messages that lack the fields each handler
 *      relies on, preventing handlers from acting on garbage input.
 *
 * The function is pure (no side-effects) and is exported so it can be
 * exercised in isolation by unit tests.
 */

/**
 * Validate an incoming browser.runtime message.
 *
 * @param {unknown} message      The raw first argument from onMessage
 * @param {Object}  sender       The MessageSender object from onMessage
 * @param {string}  extensionId  browser.runtime.id — the expected sender ID
 * @returns {{ ok: boolean, reason?: string }}
 */
export function validateRuntimeMessage(message, sender, extensionId) {
  // ── 1. Sender identity check ──────────────────────────────────────────────
  // Only accept messages whose sender.id matches this extension.
  // Background service-workers, content-scripts, and other extension pages
  // all share the same extension ID.  A cross-origin web page cannot forge
  // a matching sender.id.
  if (!sender || sender.id !== extensionId) {
    return { ok: false, reason: 'untrusted sender' };
  }

  // ── 2. Top-level message shape ────────────────────────────────────────────
  if (!message || typeof message !== 'object' || typeof message.type !== 'string') {
    return { ok: false, reason: 'invalid message shape: must be an object with a string type' };
  }

  // ── 3. Per-type payload validation ───────────────────────────────────────
  if (message.type === 'CHAT_SAVED') {
    const d = message.data;
    if (!d || typeof d !== 'object') {
      return { ok: false, reason: 'CHAT_SAVED: data must be an object' };
    }
    if (typeof d.id !== 'string' || !d.id.trim()) {
      return { ok: false, reason: 'CHAT_SAVED: data.id must be a non-empty string' };
    }
    if (typeof d.title !== 'string' || !d.title.trim()) {
      return { ok: false, reason: 'CHAT_SAVED: data.title must be a non-empty string' };
    }
  }

  if (message.type === 'SELECT_CHAT') {
    if (typeof message.chatId !== 'string' || !message.chatId.trim()) {
      return { ok: false, reason: 'SELECT_CHAT: chatId must be a non-empty string' };
    }
  }

  return { ok: true };
}
