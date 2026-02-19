/**
 * Tests for src/content/copilot-interceptor.js
 *
 * Key behaviours verified:
 * - Captures conversationId from a GetConversation fetch URL (pattern 1)
 * - Captures conversationId from a direct ?conversationId= query param (pattern 2)
 * - Captures conversationId from an XHR URL (open) and POST body (send)
 * - Dispatches 'bAInder:copilotConversationId' CustomEvent on document
 * - Forwards the call to the original fetch with globalThis as receiver
 *   (critical: prevents "Illegal invocation" when SPA uses strict mode)
 * - Handles multiple calls, broadcasting the most recent ID each time
 * - Never throws / breaks the page on malformed URLs or missing params
 * - Double-injection guard prevents re-wrapping
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// ── helpers ─────────────────────────────────────────────────────────────────

/** Build a realistic GetConversation URL matching what the Copilot SPA sends. */
function makeGetConvUrl(conversationId, extra = {}) {
  const req = JSON.stringify({ conversationId, source: 'officeweb', ...extra });
  return `https://substrate.office.com/m365Copilot/GetConversation?request=${encodeURIComponent(req)}&variants=feature.EnableGetConversationMetadataPhase2`;
}

/** Build a URL with a direct conversationId query param (pattern 2). */
function makeDirectConvUrl(conversationId) {
  return `https://substrate.office.com/m365Copilot/Chats?conversationId=${encodeURIComponent(conversationId)}&source=officeweb`;
}

/** Load and execute the interceptor script in the current jsdom window. */
function loadInterceptor() {
  const scriptPath = path.resolve(__dirname, '../src/content/copilot-interceptor.js');
  const code = fs.readFileSync(scriptPath, 'utf-8');
  // eslint-disable-next-line no-new-func
  new Function('window', 'document', 'XMLHttpRequest', 'CustomEvent', 'globalThis', code)(
    globalThis.window ?? global,
    globalThis.document ?? global.document,
    globalThis.XMLHttpRequest,
    globalThis.CustomEvent,
    globalThis
  );
}

// ── tests ────────────────────────────────────────────────────────────────────

describe('copilot-interceptor (MAIN world fetch + XHR wrapper)', () => {
  let originalFetch;
  let originalXHROpen;
  let originalXHRSend;
  let capturedEvents;
  let eventHandler;

  beforeEach(() => {
    delete global.__bAInderCopilotInterceptorActive;
    capturedEvents = [];
    eventHandler = (e) => capturedEvents.push(e.detail);
    document.addEventListener('bAInder:copilotConversationId', eventHandler);
    originalFetch = global.fetch;
    global.fetch = vi.fn(() => Promise.resolve(new Response('ok')));
    originalXHROpen = XMLHttpRequest.prototype.open;
    originalXHRSend = XMLHttpRequest.prototype.send;
  });

  afterEach(() => {
    document.removeEventListener('bAInder:copilotConversationId', eventHandler);
    global.fetch = originalFetch;
    XMLHttpRequest.prototype.open = originalXHROpen;
    XMLHttpRequest.prototype.send = originalXHRSend;
    delete global.__bAInderCopilotInterceptorActive;
  });

  // ── fetch interception ───────────────────────────────────────────────────

  it('dispatches conversationId when fetch is called with a GetConversation URL', async () => {
    loadInterceptor();
    await fetch(makeGetConvUrl('106db17b-155c-4622-806d-927491981c14'));
    expect(capturedEvents).toHaveLength(1);
    expect(capturedEvents[0].conversationId).toBe('106db17b-155c-4622-806d-927491981c14');
  });

  it('dispatches conversationId from a direct ?conversationId= query param', async () => {
    loadInterceptor();
    await fetch(makeDirectConvUrl('direct-param-id'));
    expect(capturedEvents).toHaveLength(1);
    expect(capturedEvents[0].conversationId).toBe('direct-param-id');
  });

  it('calls the original fetch with globalThis as receiver to prevent Illegal invocation', async () => {
    // When SPA code calls fetch() in strict mode, `this` inside our wrapper is
    // undefined. Native fetch requires a Window receiver and throws
    // "Illegal invocation" on apply(undefined, ...). We must use globalThis.
    loadInterceptor();
    let receivedThis;
    const mockFetch = vi.fn(function () {
      receivedThis = this;
      return Promise.resolve(new Response('ok'));
    });
    global.fetch = mockFetch;
    delete global.__bAInderCopilotInterceptorActive;
    loadInterceptor(); // re-wrap our mockFetch
    await fetch('https://example.com/resource');
    expect(receivedThis).toBe(globalThis);
  });

  it('still calls the original fetch (passthrough)', async () => {
    loadInterceptor();
    const mockFetch = vi.fn(() => Promise.resolve(new Response('ok')));
    global.fetch = mockFetch;
    delete global.__bAInderCopilotInterceptorActive;
    loadInterceptor();
    await fetch(makeGetConvUrl('abc-123'));
    expect(mockFetch).toHaveBeenCalledOnce();
  });

  it('does NOT dispatch an event for unrelated fetch URLs', async () => {
    loadInterceptor();
    await fetch('https://example.com/api/data');
    expect(capturedEvents).toHaveLength(0);
  });

  it('dispatches the latest conversationId on each new GetConversation call', async () => {
    loadInterceptor();
    await fetch(makeGetConvUrl('first-id'));
    await fetch(makeGetConvUrl('second-id'));
    expect(capturedEvents).toHaveLength(2);
    expect(capturedEvents[0].conversationId).toBe('first-id');
    expect(capturedEvents[1].conversationId).toBe('second-id');
  });

  it('does not throw when the URL is malformed', async () => {
    loadInterceptor();
    await expect(fetch('not-a-valid-url')).resolves.not.toThrow();
    expect(capturedEvents).toHaveLength(0);
  });

  it('does not throw when the request param is missing', async () => {
    loadInterceptor();
    await fetch('https://substrate.office.com/m365Copilot/GetConversation?other=param');
    expect(capturedEvents).toHaveLength(0);
  });

  it('does not throw when the request param JSON is invalid', async () => {
    loadInterceptor();
    await fetch('https://substrate.office.com/m365Copilot/GetConversation?request=NOT_JSON');
    expect(capturedEvents).toHaveLength(0);
  });

  it('does not throw when the request JSON lacks conversationId', async () => {
    loadInterceptor();
    const req = encodeURIComponent(JSON.stringify({ source: 'officeweb' }));
    await fetch(`https://substrate.office.com/m365Copilot/GetConversation?request=${req}`);
    expect(capturedEvents).toHaveLength(0);
  });

  it('handles a fetch called with a Request object', async () => {
    loadInterceptor();
    const req = new Request(makeGetConvUrl('req-object-id'));
    await fetch(req);
    expect(capturedEvents).toHaveLength(1);
    expect(capturedEvents[0].conversationId).toBe('req-object-id');
  });

  // ── XHR interception ────────────────────────────────────────────────────

  it('dispatches conversationId from an XHR open URL with direct ?conversationId= param', () => {
    loadInterceptor();
    const xhr = new XMLHttpRequest();
    xhr.open('GET', makeDirectConvUrl('xhr-url-id'));
    expect(capturedEvents).toHaveLength(1);
    expect(capturedEvents[0].conversationId).toBe('xhr-url-id');
  });

  it('dispatches conversationId from an XHR open URL with GetConversation request param', () => {
    loadInterceptor();
    const xhr = new XMLHttpRequest();
    xhr.open('GET', makeGetConvUrl('xhr-getconv-id'));
    expect(capturedEvents).toHaveLength(1);
    expect(capturedEvents[0].conversationId).toBe('xhr-getconv-id');
  });

  it('dispatches conversationId from an XHR send POST body', () => {
    loadInterceptor();
    const xhr = new XMLHttpRequest();
    xhr.open('POST', 'https://substrate.office.com/m365Copilot/SomeEndpoint');
    xhr.send(JSON.stringify({ conversationId: 'xhr-body-id', source: 'web' }));
    expect(capturedEvents.some(e => e.conversationId === 'xhr-body-id')).toBe(true);
  });

  it('does not throw when XHR send body is not JSON', () => {
    loadInterceptor();
    const xhr = new XMLHttpRequest();
    xhr.open('POST', 'https://example.com/data');
    expect(() => xhr.send('plain text body')).not.toThrow();
  });

  it('does not dispatch for XHR open with unrelated URL', () => {
    loadInterceptor();
    const xhr = new XMLHttpRequest();
    xhr.open('GET', 'https://example.com/unrelated');
    expect(capturedEvents).toHaveLength(0);
  });

  // ── double-injection guard ───────────────────────────────────────────────

  it('only wraps fetch once even if the script is loaded twice', async () => {
    loadInterceptor();
    const wrappedFetch = global.fetch;
    loadInterceptor(); // guard fires, fetch must not be re-wrapped
    expect(global.fetch).toBe(wrappedFetch);
  });
});
