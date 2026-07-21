/**
 * bulk-fetcher.js
 *
 * Self-contained content script for fetching ALL chat conversations from a
 * supported AI chat platform.  Designed to be injected into a tab via
 * chrome.scripting.executeScript({ file: 'bulk-fetcher.js' }) from the
 * background service worker.
 *
 * This file is bundled by Vite as a standalone entry point (imports from
 * other modules are bundled inline).
 *
 * After it finishes, it sends a FETCH_ALL_CHATS_RESULT message back to
 * the background worker, and progress updates as FETCH_ALL_CHATS_PROGRESS.
 */

import { htmlToMarkdown } from './extractors/html-to-markdown.js';

// Wrapped in a block to prevent Vite's top-level const declarations from
// clashing with page-level variables when injected via executeScript.
{
// ─── Logger ──────────────────────────────────────────────────────────────────
const _browser = chrome;
const _log = {
  debug: (...a) => console.debug('[bAInder:bulk]', ...a),
  info:  (...a) => console.info('[bAInder:bulk]', ...a),
  warn:  (...a) => console.warn('[bAInder:bulk]', ...a),
  error: (...a) => console.error('[bAInder:bulk]', ...a),
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const _delay = ms => new Promise(r => setTimeout(r, ms));

/**
 * Fetch JSON with credentials from a URL.
 * @param {string} url
 * @param {object} [opts]
 * @returns {Promise<any>}
 */
async function _apiFetch(url, opts = {}) {
  const resp = await fetch(url, {
    credentials: 'include',
    headers: { Accept: 'application/json', ...opts.headers },
    ...opts,
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status} ${url}`);
  return resp.json();
}

/** Send a progress update to the background worker. */
function _sendProgress(current, total, title) {
  try {
    _browser.runtime.sendMessage({
      type: 'FETCH_ALL_CHATS_PROGRESS',
      data: { current, total, title },
    }).catch(() => {});
  } catch {}
}

// ─── Platform detection ──────────────────────────────────────────────────────

/**
 * @param {string} hostname
 * @returns {'chatgpt'|'claude'|'gemini'|'copilot'|'perplexity'|'deepseek'|null}
 */
function _detectPlatform(hostname) {
  if (!hostname) return null;
  const h = hostname.toLowerCase();
  if (h.includes('chat.openai.com') || h.includes('chatgpt.com')) return 'chatgpt';
  if (h.includes('claude.ai'))         return 'claude';
  if (h.includes('gemini.google.com')) return 'gemini';
  if (h.includes('copilot.microsoft.com') || h.includes('m365.cloud.microsoft')) return 'copilot';
  if (h.includes('perplexity.ai'))     return 'perplexity';
  if (h.includes('chat.deepseek.com')) return 'deepseek';
  return null;
}

// ─── ChatGPT ─────────────────────────────────────────────────────────────────

async function _fetchChatGPT() {
  _log.info('ChatGPT: starting bulk fetch…');
  const all = [];
  let offset = 0;
  const LIMIT = 100;
  let hasMore = true;

  while (hasMore) {
    const list = await _apiFetch(`/api/conversations?offset=${offset}&limit=${LIMIT}&order=updated`);
    const items = list?.items || [];
    if (items.length === 0) break;
    const total = list?.total || items.length;
    _sendProgress(all.length, total, 'Listing conversations…');

    for (const item of items) {
      const convId = item.id;
      if (!convId) { _sendProgress(++all.length, total, 'Skipping (no id)'); continue; }
      try {
        const conv = await _apiFetch(`/api/conversations/${convId}`);
        if (!conv?.mapping) { _sendProgress(++all.length, total, 'Skipping (no mapping)'); continue; }

        const messages = [];
        const nodeIds = Object.keys(conv.mapping).sort((a, b) => {
          const na = conv.mapping[a];
          const nb = conv.mapping[b];
          return (na?.position ?? 0) - (nb?.position ?? 0);
        });
        for (const nodeId of nodeIds) {
          const node = conv.mapping[nodeId];
          if (!node?.message) continue;
          const msg = node.message;
          const role = msg.author?.role === 'user' ? 'user' : 'assistant';
          let content = '';
          if (msg.content?.content_type === 'text') {
            content = msg.content.parts?.filter(Boolean).join('\n\n') || '';
          } else if (msg.content?.content_type === 'multimodal_text') {
            content = msg.content.parts?.map(p => typeof p === 'string' ? p : '[🖼️ Image]').filter(Boolean).join('\n\n') || '';
          }
          if (content.trim()) messages.push({ role, content: content.trim() });
        }
        const title = conv.title || item.title || 'Untitled';
        all.push({ title, messages, source: 'chatgpt', url: `https://chatgpt.com/chat/${convId}` });
        _sendProgress(all.length, total, title);
        await _delay(100);
      } catch (err) {
        _log.warn(`ChatGPT: skip ${convId}: ${err.message}`);
        _sendProgress(all.length, all.length + 1, `⚠️ Error: ${convId}`);
      }
    }
    offset += items.length;
    hasMore = items.length >= LIMIT;
  }

  _log.info(`ChatGPT: fetched ${all.length} conversations`);
  return all;
}

// ─── Claude ──────────────────────────────────────────────────────────────────

async function _fetchClaude() {
  _log.info('Claude: starting bulk fetch…');
  const API_HEADERS = { Accept: 'application/json', 'anthropic-client-type': 'web' };
  const orgs = await _apiFetch('https://claude.ai/api/organizations', { headers: API_HEADERS });
  if (!orgs?.length) throw new Error('No Claude organizations found');

  const all = [];
  for (const org of orgs) {
    let cursor = null;
    let hasMore = true;

    while (hasMore) {
      const params = new URLSearchParams({ sort_by: '-updated_at', 'search[limit]': '100' });
      if (cursor) params.set('cursor', cursor);
      const listUrl = `https://claude.ai/api/organizations/${org.uuid}/chat_conversations?${params}`;
      const list = await _apiFetch(listUrl, { headers: API_HEADERS });
      const items = Array.isArray(list.data) ? list.data : Array.isArray(list) ? list : [];
      if (items.length === 0) break;
      const total = list.total ?? items.length;
      _sendProgress(all.length, total, 'Listing conversations…');

      for (const conv of items) {
        const convId = conv.uuid;
        if (!convId) continue;
        try {
          const resp = await fetch(
            `https://claude.ai/api/organizations/${org.uuid}/chat_conversations/${convId}?tree=True&rendering_mode=messages&render_all_tools=true`,
            { credentials: 'include', headers: API_HEADERS }
          );
          if (!resp.ok) { _log.warn(`Claude: skip ${convId} (HTTP ${resp.status})`); continue; }
          const data = await resp.json();
          if (!data?.chat_messages) continue;

          const msgMap = {};
          for (const m of data.chat_messages) msgMap[m.uuid] = m;
          let ordered = [];
          let cur = msgMap[data.current_leaf_message_uuid];
          while (cur) { ordered.unshift(cur); cur = msgMap[cur.parent_message_uuid]; }
          if (!ordered.length) ordered = data.chat_messages;

          const messages = [];
          for (const msg of ordered) {
            const role = msg.sender === 'human' ? 'user' : 'assistant';
            let content = '';
            if (Array.isArray(msg.content)) {
              content = msg.content.map(b => {
                if (b.type === 'text') return b.text;
                if (b.type === 'image' && b.source?.type === 'base64' && b.source.data && b.source.media_type) {
                  return `![Image](data:${b.source.media_type};base64,${b.source.data})`;
                }
                if (b.type === 'image' && b.source?.type === 'url' && b.source.url) {
                  return `![Image](${b.source.url})`;
                }
                return null;
              }).filter(Boolean).join('\n\n');
            } else if (typeof msg.text === 'string') {
              content = msg.text;
            }
            if (content.trim()) messages.push({ role, content: content.trim() });
          }
          const title = data.name || conv.name || 'Untitled';
          all.push({ title, messages, source: 'claude', url: `https://claude.ai/chat/${convId}` });
          _sendProgress(all.length, total, title);
          await _delay(80);
        } catch (err) {
          _log.warn(`Claude: skip ${convId}: ${err.message}`);
        }
      }
      cursor = list.cursor || null;
      hasMore = list.has_more === true && cursor;
    }
  }
  _log.info(`Claude: fetched ${all.length} conversations`);
  return all;
}

// ─── Gemini (DOM-based history scraping) ─────────────────────────────────────

async function _fetchGemini() {
  _log.info('Gemini: starting bulk fetch…');
  const all = [];
  const seen = new Set();

  const selectors = [
    'a[href*="/conversations/"]',
    '[class*="history"] a',
    '[class*="conversation"] a[href]',
    '[role="listitem"] a[href]',
    'a[href*="/app/"]',
  ];

  for (const sel of selectors) {
    try {
      for (const el of document.querySelectorAll(sel)) {
        const href = el.getAttribute('href') || '';
        if (!href || href.startsWith('#') || href === '/') continue;
        const absUrl = new URL(href, location.origin).href;
        if (seen.has(absUrl)) continue;
        seen.add(absUrl);
        const title = el.textContent?.trim() || 'Untitled';
        all.push({ title, messages: [], source: 'gemini', url: absUrl, _needsExtract: true });
      }
    } catch {}
  }

  const showMoreBtn = document.querySelector(
    '[class*="show-more"], [class*="load-more"], [aria-label*="more"], [class*="expand"]'
  );
  if (showMoreBtn) {
    _log.info('Gemini: clicking "show more" for additional history');
    showMoreBtn.click();
    await _delay(2000);
    for (const sel of selectors) {
      try {
        for (const el of document.querySelectorAll(sel)) {
          const href = el.getAttribute('href') || '';
          if (!href || href.startsWith('#') || href === '/') continue;
          const absUrl = new URL(href, location.origin).href;
          if (seen.has(absUrl)) continue;
          seen.add(absUrl);
          const title = el.textContent?.trim() || 'Untitled';
          all.push({ title, messages: [], source: 'gemini', url: absUrl, _needsExtract: true });
        }
      } catch {}
    }
  }

  _log.info(`Gemini: collected ${all.length} conversation references`);
  return all;
}

// ─── Copilot (DOM-based history scraping) ────────────────────────────────────

async function _fetchCopilot() {
  _log.info('Copilot: starting bulk fetch…');
  const all = [];
  const seen = new Set();
  const itemLinks = []; // { link, title, url } — keep refs for later extraction

  // ── M365 Copilot (m365.cloud.microsoft) ──────────────────────────────
  // The side-nav uses a virtualised list; conversation links are nested
  // inside SplitNavItem containers.  The <a> element carries the UUID
  // as its id and /chat/conversation/{uuid} as its href.

  // Ensure the navigation drawer is expanded so the chat list is visible
  // in the DOM for scraping.
  const collapseBtn = document.querySelector(
    'button[aria-label="Collapse navigation"], button[aria-label="Expand navigation"]'
  );
  if (collapseBtn) {
    const isExpanded = collapseBtn.getAttribute('aria-expanded') === 'true';
    _log.info(`Copilot: nav toggle found, aria-expanded=${isExpanded}`);
    if (!isExpanded) {
      _log.info('Copilot: expanding navigation drawer');
      collapseBtn.click();
      await _delay(1000); // wait for drawer to open
    }
  }

  const m365Section = document.querySelector('#m365-copilot-chats-section');
  if (m365Section) {
    // Try the user-verified SplitNavItem selector first.
    const splitItems = m365Section.querySelectorAll("div[class*='SplitNavItem']");
    _log.info(`Copilot: found ${splitItems.length} SplitNavItem elements`);
    for (let i = 0; i < splitItems.length; i++) {
      try {
        const item = splitItems[i];
        const link = item.querySelector('a[href*="/chat/conversation/"]');
        if (!link) continue;
        const href = link.getAttribute('href') || '';
        const absUrl = new URL(href, location.origin).href;
        if (seen.has(absUrl)) continue;
        seen.add(absUrl);
        const title = link.textContent?.trim() || 'Untitled';
        itemLinks.push({ link, title, url: absUrl });
        all.push({ title, messages: [], source: 'copilot', url: absUrl });
        _sendProgress(all.length, splitItems.length, title);
        _log.info(`Copilot: collected chat ${all.length}: "${title}" → ${absUrl}`);
      } catch (err) {
        _log.warn(`Copilot: error processing SplitNavItem ${i}: ${err.message}`);
      }
    }
    if (all.length > 0) {
      _log.info(`Copilot: collected ${all.length} conversation references (M365 nav)`);
      // ── Extract messages inline by clicking each conversation ──────────
      await _extractCopilotMessages(all, itemLinks);
      return all;
    }
    _log.warn('Copilot: M365 section found but no SplitNavItem matched');
  }

  // ── Fallback: any <a> with a conversation URL on the page ────────────
  try {
    for (const el of document.querySelectorAll('a[href*="/chat/conversation/"]')) {
      const href = el.getAttribute('href') || '';
      if (!href) continue;
      const absUrl = new URL(href, location.origin).href;
      if (seen.has(absUrl)) continue;
      seen.add(absUrl);
      const title = el.textContent?.trim() || 'Untitled';
      itemLinks.push({ link: el, title, url: absUrl });
      all.push({ title, messages: [], source: 'copilot', url: absUrl });
    }
  } catch {}

  if (all.length > 0) {
    _log.info(`Copilot: collected ${all.length} conversation references (fallback)`);
    await _extractCopilotMessages(all, itemLinks);
    return all;
  }

  // ── Legacy consumer copilot.microsoft.com selectors ──────────────────
  const historyToggle = document.querySelector(
    '[class*="history"] button, [data-testid*="history"], [aria-label*="history"], [title*="history"]'
  );
  if (historyToggle) {
    _log.info('Copilot: clicking history toggle');
    historyToggle.click();
    await _delay(1500);
  }

  const selectors = [
    '[data-testid="history-item"] a',
    '[class*="history-item"] a',
    '[class*="chat-item"] a',
    '[class*="conversation"] a[href]',
    '[role="listbox"] [role="option"]',
  ];

  for (const sel of selectors) {
    try {
      for (const el of document.querySelectorAll(sel)) {
        const href = el.getAttribute('href') || el.dataset?.url || '';
        const title = el.textContent?.trim() || 'Untitled';
        const absUrl = href ? new URL(href, location.origin).href : location.href;
        if (seen.has(absUrl)) continue;
        seen.add(absUrl);
        all.push({ title, messages: [], source: 'copilot', url: absUrl });
      }
    } catch {}
  }

  _log.info(`Copilot: collected ${all.length} conversation references`);
  // Legacy copilot.microsoft.com may not support SPA click-through; try anyway
  if (all.length > 0) {
    await _extractCopilotMessages(all, itemLinks);
  }
  return all;
}

/**
 * Extract messages from the currently visible M365 Copilot conversation DOM.
 * Uses htmlToMarkdown (same as regular content.js) to preserve formatting.
 * @returns {Array<{role: string, content: string}>}
 */
function _extractVisibleCopilotMessages() {
  const messages = [];

  // User messages: fai-UserMessage__message / fai-BebopUserMessage__message
  // contain the clean user text without "You said:" prefix.
  const userEls = document.querySelectorAll(
    '.fai-UserMessage__message, .fai-BebopUserMessage__message'
  );

  // Assistant messages: fai-CopilotMessage__content contains the rich HTML
  // (p, strong, code, ul, ol, li, pre, etc.) — use htmlToMarkdown to preserve formatting.
  const aiEls = document.querySelectorAll('.fai-CopilotMessage__content');

  // Fallback: markdown-reply divs contain rendered markdown without labels
  const markdownEls = document.querySelectorAll('[data-testid="markdown-reply"]');

  // Build a combined list sorted by DOM position
  const allEls = [];
  userEls.forEach(el => allEls.push({ el, role: 'user' }));
  aiEls.forEach(el => allEls.push({ el, role: 'assistant' }));
  // If no fai-* elements found, fall back to markdown-reply (assistant only)
  if (userEls.length === 0 && aiEls.length === 0) {
    markdownEls.forEach(el => allEls.push({ el, role: 'assistant' }));
  }

  allEls.sort((a, b) => {
    const pos = a.el.compareDocumentPosition(b.el);
    return pos & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
  });

  for (const { el, role } of allEls) {
    let content;
    if (role === 'assistant') {
      // Use htmlToMarkdown to preserve code blocks, lists, bold, etc.
      content = htmlToMarkdown(el);
    } else {
      // User messages are plain text — innerText is fine
      content = el.innerText || '';
    }
    content = content.trim();
    if (content) messages.push({ role, content });
  }
  return messages;
}

/**
 * Wait for conversation messages to appear in the DOM (up to 8 seconds).
 * Uses the same selectors as _extractVisibleCopilotMessages.
 * @param {number} [timeoutMs=8000]
 * @returns {Promise<boolean>} true if content elements appeared
 */
function _waitForConversationContent(timeoutMs = 8000) {
  return new Promise(resolve => {
    const start = Date.now();
    const check = () => {
      const user = document.querySelectorAll(
        '.fai-UserMessage__message, .fai-BebopUserMessage__message'
      );
      const ai = document.querySelectorAll('.fai-CopilotMessage__content');
      const md = document.querySelectorAll('[data-testid="markdown-reply"]');
      if (user.length > 0 || ai.length > 0 || md.length > 0) {
        resolve(true);
        return;
      }
      if (Date.now() - start >= timeoutMs) {
        resolve(false);
        return;
      }
      setTimeout(check, 300);
    };
    check();
  });
}

/**
 * Click through each sidebar conversation link, extract messages from the DOM.
 * Waits for the SPA URL to change before checking for content (fixes race
 * condition where old DOM elements are still present after clicking).
 * @param {Array<{title: string, messages: Array, url: string}>} all
 * @param {Array<{link: Element, title: string, url: string}>} itemLinks
 */
async function _extractCopilotMessages(all, itemLinks) {
  if (all.length === 0) return;
  _log.info(`Copilot: extracting messages for ${all.length} conversations…`);

  // 1. Check if any conversation is already loaded on the current page
  const initialMsgs = _extractVisibleCopilotMessages();
  if (initialMsgs.length > 0) {
    _log.info(`Copilot: found ${initialMsgs.length} messages already visible — assigning to current conversation`);
    const currentUrl = location.href.split('?')[0].split('#')[0];
    const match = all.find(c => c.url === currentUrl);
    if (match) {
      match.messages = initialMsgs;
    } else if (all.length > 0) {
      all[0].messages = initialMsgs;
    }
  }

  // 2. Click through each conversation that still has no messages
  for (let i = 0; i < all.length; i++) {
    const chat = all[i];
    if (chat.messages.length > 0) {
      _log.info(`Copilot: "${chat.title}" already has ${chat.messages.length} messages — skipping`);
      continue;
    }

    _sendProgress(i + 1, all.length, `Extracting: ${chat.title}`);
    _log.info(`Copilot: clicking "${chat.title}" → ${chat.url}`);

    const entry = itemLinks.find(l => l.url === chat.url);
    if (!entry || !entry.link) {
      _log.warn(`Copilot: no link element for "${chat.title}" — skipping`);
      continue;
    }

    try {
      entry.link.click();

      // Wait for SPA URL to change to the target conversation
      const urlChanged = await _waitForUrlChange(chat.url, 8000);
      if (!urlChanged) {
        _log.warn(`Copilot: URL did not change to "${chat.url}" after clicking "${chat.title}"`);
        continue;
      }

      // Now wait for content elements to appear (fresh DOM after SPA navigation)
      const loaded = await _waitForConversationContent(8000);
      if (!loaded) {
        _log.warn(`Copilot: no content appeared for "${chat.title}" after click`);
        continue;
      }
      await _delay(500); // Extra settle time for React rendering
      chat.messages = _extractVisibleCopilotMessages();
      _log.info(`Copilot: extracted ${chat.messages.length} messages from "${chat.title}"`);
    } catch (err) {
      _log.warn(`Copilot: error extracting "${chat.title}": ${err.message}`);
    }
  }
}

/**
 * Wait for location.href to contain the target URL (SPA navigation).
 * @param {string} targetUrl
 * @param {number} [timeoutMs=8000]
 * @returns {Promise<boolean>}
 */
function _waitForUrlChange(targetUrl, timeoutMs = 8000) {
  return new Promise(resolve => {
    const start = Date.now();
    const check = () => {
      if (location.href.split('?')[0].split('#')[0] === targetUrl) {
        resolve(true);
        return;
      }
      if (Date.now() - start >= timeoutMs) {
        resolve(false);
        return;
      }
      setTimeout(check, 200);
    };
    check();
  });
}

// ─── Perplexity (DOM-based) ──────────────────────────────────────────────────

async function _fetchPerplexity() {
  _log.info('Perplexity: starting bulk fetch…');
  const all = [];
  const seen = new Set();

  const selectors = [
    'a[href*="/search/"]',
    '[class*="thread"] a',
    '[class*="history"] a',
    '[class*="conversation"] a',
    '[role="listitem"] a',
  ];

  for (const sel of selectors) {
    try {
      for (const el of document.querySelectorAll(sel)) {
        const href = el.getAttribute('href') || '';
        if (!href || href.startsWith('#') || href === '/') continue;
        const absUrl = new URL(href, location.origin).href;
        if (seen.has(absUrl)) continue;
        seen.add(absUrl);
        const title = el.textContent?.trim() || 'Untitled';
        all.push({ title, messages: [], source: 'perplexity', url: absUrl, _needsExtract: true });
      }
    } catch {}
  }

  _log.info(`Perplexity: collected ${all.length} conversation references`);
  return all;
}

// ─── DeepSeek (DOM-based) ────────────────────────────────────────────────────

async function _fetchDeepSeek() {
  _log.info('DeepSeek: starting bulk fetch…');
  const all = [];
  const seen = new Set();

  const selectors = [
    '[class*="history"] a',
    '[class*="conversation"] a',
    '[class*="chat-item"] a',
    '[class*="sidebar"] a',
    '[class*="list"] a',
  ];

  for (const sel of selectors) {
    try {
      for (const el of document.querySelectorAll(sel)) {
        const href = el.getAttribute('href') || '';
        if (!href || href.startsWith('#')) continue;
        const absUrl = new URL(href, location.origin).href;
        if (seen.has(absUrl)) continue;
        seen.add(absUrl);
        const title = el.textContent?.trim() || 'Untitled';
        all.push({ title, messages: [], source: 'deepseek', url: absUrl, _needsExtract: true });
      }
    } catch {}
  }

  _log.info(`DeepSeek: collected ${all.length} conversation references`);
  return all;
}

// ─── Orchestrator ────────────────────────────────────────────────────────────

(async function() {
  'use strict';

  const hostname = window.location.hostname;
  const platform = _detectPlatform(hostname);
  if (!platform) {
    _browser.runtime.sendMessage({
      type: 'FETCH_ALL_CHATS_RESULT',
      data: { success: false, error: 'Not on a supported AI chat platform' },
    }).catch(() => {});
    return;
  }

  _log.info(`Starting bulk fetch for platform: ${platform}`);
  _sendProgress(0, 0, `Fetching all ${platform} conversations…`);

  try {
    let chats;
    let needsExtract = false;

    switch (platform) {
      case 'chatgpt':
        chats = await _fetchChatGPT();
        break;
      case 'claude':
        chats = await _fetchClaude();
        break;
      case 'gemini':
        chats = await _fetchGemini();
        needsExtract = true;
        break;
      case 'copilot':
        chats = await _fetchCopilot();
        // Copilot now extracts message content inline via _extractCopilotMessages
        needsExtract = false;
        break;
      case 'perplexity':
        chats = await _fetchPerplexity();
        needsExtract = true;
        break;
      case 'deepseek':
        chats = await _fetchDeepSeek();
        needsExtract = true;
        break;
      default:
        throw new Error(`Unsupported platform: ${platform}`);
    }

    _sendProgress(chats.length, chats.length, `Done — ${chats.length} conversations`);
    _log.info(`Sending FETCH_ALL_CHATS_RESULT: success=true, platform=${platform}, ${chats.length} chats, needsExtract=${needsExtract}`);

    _browser.runtime.sendMessage({
      type: 'FETCH_ALL_CHATS_RESULT',
      data: { success: true, platform, chats, needsExtract },
    }).catch(() => {});
  } catch (err) {
    _log.error('Bulk fetch failed:', err);
    _browser.runtime.sendMessage({
      type: 'FETCH_ALL_CHATS_RESULT',
      data: { success: false, error: err.message },
    }).catch(() => {});
  }
})();
}