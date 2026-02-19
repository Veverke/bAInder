/**
 * bAInder Copilot Fetch Interceptor
 * Runs in the page's MAIN world (declared in manifest.json with "world":"MAIN").
 *
 * Purpose
 * -------
 * The Copilot SPA at m365.cloud.microsoft never changes the browser URL when
 * switching conversations. The only reliable signal is the background API call:
 *
 *   GET substrate.office.com/m365Copilot/GetConversation
 *       ?request={"conversationId":"<guid>","source":"officeweb",...}
 *
 * A content script running in the isolated world cannot reliably read the
 * page's PerformanceResourceTiming entries (different window context). Instead
 * this script wraps window.fetch in the MAIN world, captures the conversationId
 * as each request fires, and relays it to the isolated-world content script via
 * a CustomEvent dispatched on document (events cross the world boundary).
 *
 * The isolated-world content.js listens for "bAInder:copilotConversationId" and
 * stores the latest value so it can be embedded in the saved URL.
 */
(function bAInderCopilotInterceptor() {
  'use strict';

  // Guard against double-injection (e.g. SPA re-runs scripts on navigation)
  if (window.__bAInderCopilotInterceptorActive) return;
  window.__bAInderCopilotInterceptorActive = true;

  console.log('bAInder[interceptor]: MAIN world interceptor initialised on', location.href);

  const EVENT_NAME = 'bAInder:copilotConversationId';

  /**
   * Extract conversationId from a URL or JSON string, or return null.
   * Handles two patterns:
   *   1. ?request={"conversationId":"<guid>",...}    (GetConversation style)
   *   2. ?conversationId=<guid>                       (direct query param)
   *   3. JSON string body containing "conversationId" key
   * @param {string} text  URL or JSON body
   * @returns {string|null}
   */
  function extractConversationId(text) {
    if (!text) return null;
    try {
      // Pattern 1: JSON "request" query param
      if (text.includes('GetConversation') || text.includes('request=')) {
        const reqParam = new URL(text).searchParams.get('request');
        if (reqParam) {
          const parsed = JSON.parse(reqParam);
          if (parsed && typeof parsed.conversationId === 'string') return parsed.conversationId;
        }
      }
    } catch (_) {}
    try {
      // Pattern 2: direct conversationId query param in URL
      const u = new URL(text);
      const direct = u.searchParams.get('conversationId') ||
                     u.searchParams.get('conversationid') ||
                     u.searchParams.get('ConversationId');
      if (direct) return direct;
    } catch (_) {}
    try {
      // Pattern 3: JSON body string
      if (text.includes('conversationId') || text.includes('ConversationId')) {
        const parsed = JSON.parse(text);
        const id = parsed.conversationId || parsed.ConversationId ||
                   parsed.request?.conversationId;
        if (id && typeof id === 'string') return id;
      }
    } catch (_) {}
    return null;
  }

  /**
   * Dispatch a cross-world CustomEvent carrying the conversationId.
   * @param {string} conversationId
   */
  function broadcast(conversationId) {
    try {
      document.dispatchEvent(new CustomEvent(EVENT_NAME, {
        detail: { conversationId },
        bubbles: false,
        cancelable: false
      }));
    } catch (_) { /* ignore */ }
  }

  // ── Intercept fetch ────────────────────────────────────────────────────────
  // IMPORTANT: always call the original with globalThis as receiver.
  // When bundled SPA code calls fetch() in strict mode, `this` inside our
  // wrapper is undefined. Native fetch requires a Window receiver and throws
  // "Illegal invocation" on apply(undefined, …), which would break every
  // SPA network request. globalThis is always the Window in a browser.
  const _origFetch = window.fetch;
  window.fetch = function bAInderFetch(...args) {
    try {
      const url = typeof args[0] === 'string'
        ? args[0]
        : (args[0] instanceof Request ? args[0].url : String(args[0] || ''));
      // Log any call to substrate/graph/copilot APIs so we can identify the right pattern
      if (url && (
        url.includes('substrate') ||
        url.includes('copilot') ||
        url.includes('GetConversation') ||
        url.includes('conversation') ||
        url.includes('m365Copilot')
      )) {
        console.log('bAInder[interceptor]: fetch ->', url.slice(0, 200));
      }
      const id = extractConversationId(url);
      if (id) broadcast(id);
    } catch (_) { /* never break the page */ }
    return _origFetch.apply(globalThis, args);
  };

  // ── Intercept XHR ─────────────────────────────────────────────────────────
  // The M365 Copilot SPA uses an XHR-based HTTP client for several substrate
  // calls (visible in stack traces as xhr→v→_request→request). Wrapping both
  // open (for URL params) and send (for POST bodies) ensures we capture the
  // conversationId regardless of the transport used.
  const _origXHROpen = XMLHttpRequest.prototype.open;
  const _origXHRSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function bAInderXHROpen(method, url, ...rest) {
    try {
      const urlStr = String(url || '');
      if (urlStr && (
        urlStr.includes('substrate') ||
        urlStr.includes('copilot') ||
        urlStr.includes('GetConversation') ||
        urlStr.includes('conversation') ||
        urlStr.includes('m365Copilot') ||
        urlStr.includes('graph.microsoft')
      )) {
        console.log('bAInder[interceptor]: XHR open ->', method, urlStr.slice(0, 200));
      }
      const id = extractConversationId(urlStr);
      if (id) broadcast(id);
      this.__bAInderXHRUrl = urlStr;
    } catch (_) {}
    return _origXHROpen.apply(this, [method, url, ...rest]);
  };

  XMLHttpRequest.prototype.send = function bAInderXHRSend(body) {
    try {
      if (body && typeof body === 'string' &&
          (body.includes('conversationId') || body.includes('ConversationId'))) {
        console.log('bAInder[interceptor]: XHR send body (first 400):', body.slice(0, 400));
        const id = extractConversationId(body);
        if (id) broadcast(id);
      }
    } catch (_) {}
    return _origXHRSend.apply(this, arguments);
  };
})();
