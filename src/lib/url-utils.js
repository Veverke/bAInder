/**
 * URL utility helpers for bAInder.
 */

/**
 * The known hosts for Copilot's SPA-based chat interface.
 * These hosts can serve different conversations while keeping the exact same
 * base URL, so the URL alone cannot identify a specific conversation.
 */
const COPILOT_SPA_HOSTS = new Set([
  'copilot.microsoft.com',
  'm365.cloud.microsoft',
]);

/**
 * Query-parameter names that identify a specific conversation in Copilot.
 * A URL containing any of these is conversation-specific.
 */
const CONVERSATION_PARAM_RE = /[?&](entityid|ThreadId|conversationId|chatId|threadId)=/i;

/**
 * Returns `true` when `url` points to a specific conversation rather than a
 * generic chat-history landing page.
 *
 * Background
 * ----------
 * - ChatGPT, Claude, Gemini:  every conversation has a unique path segment,
 *   so these are *always* considered specific.
 * - Copilot SPA (copilot.microsoft.com, m365.cloud.microsoft): the base URL
 *   (`/chat`, `/`) is the same regardless of which conversation is active.
 *   We require at least one conversation-identifying query param before we
 *   treat the URL as specific.  Without it we cannot tell two different
 *   conversations apart and must NOT block opening a new tab.
 *
 * @param {string|null|undefined} url
 * @returns {boolean}
 */
export function isSpecificChatUrl(url) {
  if (!url) return false;
  try {
    const { hostname } = new URL(url);
    if (COPILOT_SPA_HOSTS.has(hostname)) {
      // Only specific when a conversation-identifying query param is present
      return CONVERSATION_PARAM_RE.test(url);
    }
    // All other platforms use conversation-specific paths
    return true;
  } catch (_) {
    // Malformed URL — treat as non-specific to avoid false "already open"
    return false;
  }
}
