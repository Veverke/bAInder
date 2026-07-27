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

// NOTE: A `{...}` block does NOT prevent Vite from placing inlined-import
// const declarations at the top level of the bundled output.  The actual
// fix is in vite.config.js — the wrap-bulk-fetcher-iife plugin wraps the
// entire bundled file in an IIFE after Vite finishes.
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
 * Map an array of items to async functions with bounded concurrency.
 * Respects insertion order of results.
 * @template T, R
 * @param {T[]} items
 * @param {(item: T, index: number) => Promise<R>} fn
 * @param {number} [concurrency=5]
 * @returns {Promise<R[]>}
 */
async function _mapConcurrent(items, fn, concurrency = 5) {
  const results = new Array(items.length);
  const executing = new Set();
  let idx = 0;
  const next = () => {
    if (idx >= items.length) return null;
    const i = idx++;
    const p = fn(items[i], i).then(r => { results[i] = r; });
    executing.add(p);
    p.finally(() => executing.delete(p));
    return p;
  };
  // Fill initial batch
  while (executing.size < concurrency && idx < items.length) next();
  // Drain and refill
  while (executing.size > 0) {
    await Promise.race(executing);
    while (executing.size < concurrency && idx < items.length) next();
  }
  return results;
}

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
  const convIds = [];
  let offset = 0;
  const LIMIT = 100;
  let hasMore = true;
  let totalConversations = 0;

  while (hasMore) {
    const list = await _apiFetch(`/api/conversations?offset=${offset}&limit=${LIMIT}&order=updated`);
    const items = list?.items || [];
    if (items.length === 0) break;
    totalConversations = list?.total || items.length;
    _sendProgress(all.length, totalConversations, 'Listing conversations…');

    for (const item of items) {
      const convId = item.id;
      if (!convId) { _sendProgress(++all.length, totalConversations, 'Skipping (no id)'); continue; }
      convIds.push({ convId, item });
    }
    offset += items.length;
    hasMore = items.length >= LIMIT;
  }

  // ── Fetch conversation details concurrently (up to 5 at a time) ──
  const results = await _mapConcurrent(convIds, async ({ convId, item }) => {
    try {
      const conv = await _apiFetch(`/api/conversations/${convId}`);
      if (!conv?.mapping) return null;

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
      if (messages.length === 0) return null;
      return {
        title: conv.title || item.title || 'Untitled',
        messages,
        source: 'chatgpt',
        url: `https://chatgpt.com/chat/${convId}`,
      };
    } catch (err) {
      _log.warn(`ChatGPT: skip ${convId}: ${err.message}`);
      return null;
    }
  });

  // Collect results, update progress
  for (const chat of results) {
    if (chat) {
      all.push(chat);
      _sendProgress(all.length, totalConversations, chat.title);
    }
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

  // ── Phase 1: collect all conversation references from all orgs ──────
  const convRefs = []; // { convId, orgUuid, name }
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
      _sendProgress(convRefs.length, convRefs.length + items.length, 'Listing conversations…');

      for (const conv of items) {
        const convId = conv.uuid;
        if (!convId) continue;
        convRefs.push({ convId, orgUuid: org.uuid, name: conv.name || 'Untitled' });
      }
      cursor = list.cursor || null;
      hasMore = list.has_more === true && cursor;
    }
  }

  // ── Phase 2: fetch conversation details concurrently (up to 5) ──────
  const total = convRefs.length;
  const results = await _mapConcurrent(convRefs, async ({ convId, orgUuid, name }) => {
    try {
      const resp = await fetch(
        `https://claude.ai/api/organizations/${orgUuid}/chat_conversations/${convId}?tree=True&rendering_mode=messages&render_all_tools=true`,
        { credentials: 'include', headers: API_HEADERS }
      );
      if (!resp.ok) { _log.warn(`Claude: skip ${convId} (HTTP ${resp.status})`); return null; }
      const data = await resp.json();
      if (!data?.chat_messages) return null;

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
      if (messages.length === 0) return null;
      return {
        title: data.name || name,
        messages,
        source: 'claude',
        url: `https://claude.ai/chat/${convId}`,
      };
    } catch (err) {
      _log.warn(`Claude: skip ${convId}: ${err.message}`);
      return null;
    }
  });

  // Collect results, update progress
  const all = [];
  for (const chat of results) {
    if (chat) {
      all.push(chat);
      _sendProgress(all.length, total, chat.title);
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

/**
 * Find the scrollable ancestor element of a given element.
 * Walks up from `child` until it finds an element with overflow-y: auto|scroll
 * that has actual scrollable content (scrollHeight > clientHeight + threshold).
 * @param {Element} child
 * @param {number} [threshold=20]
 * @returns {Element|null}
 */
function _findScrollableAncestor(child, threshold = 20) {
  if (!child || typeof getComputedStyle === 'undefined') return null;
  let node = child.parentElement;
  while (node && node !== document.documentElement) {
    const oy = getComputedStyle(node).overflowY;
    if ((oy === 'auto' || oy === 'scroll') && node.scrollHeight > node.clientHeight + threshold) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}

/**
 * Scroll the sidebar chat-history list to trigger loading of all virtualised
 * items.  The sidebar uses a virtualised/scrolling list — items outside the
 * viewport may not be rendered in the DOM.
 * @returns {Promise<void>}
 */
async function _scrollSidebarToLoadAll() {
  // Find the sidebar scroll container — the t-custom-scrollbar div inside the nav
  const nav = document.querySelector('nav') || document.querySelector('[role="navigation"]');
  if (!nav) return;

  // Find the scrollable container that contains "Our conversations together"
  const scrollEl = nav.querySelector('.t-custom-scrollbar') || _findScrollableAncestor(
    Array.from(nav.querySelectorAll('h2')).find(h => h.textContent?.includes('conversations'))
  );
  if (!scrollEl || scrollEl.scrollHeight <= scrollEl.clientHeight + 50) return;

  _log.info(`Copilot: scrolling sidebar to load all history items (scrollH=${scrollEl.scrollHeight}, clientH=${scrollEl.clientHeight})`);

  // Scroll to bottom in steps, waiting for new items to render
  const STEP = Math.max(200, Math.floor((scrollEl.clientHeight || 400) * 0.6));
  let lastItemCount = scrollEl.querySelectorAll('div[role="link"]').length;
  let stableCount = 0;

  for (let step = 0; step < 50; step++) {
    scrollEl.scrollBy({ top: STEP, behavior: 'instant' });
    await _delay(400);
    const newCount = scrollEl.querySelectorAll('div[role="link"]').length;
    if (newCount === lastItemCount) {
      stableCount++;
      if (stableCount >= 3) break;
    } else {
      stableCount = 0;
      lastItemCount = newCount;
    }
  }

  // Final sweep to the very bottom
  scrollEl.scrollTo({ top: scrollEl.scrollHeight, behavior: 'instant' });
  await _delay(500);

  _log.info(`Copilot: sidebar scroll done — ${lastItemCount} chat items visible`);
}

async function _fetchCopilot() {
  _log.info('Copilot: starting bulk fetch…');
  const all = [];
  const seen = new Set();

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
    // Scroll the sidebar to load all virtualised conversation items
    const m365Scroll = m365Section.closest('[class*="t-custom-scrollbar"]') ||
      _findScrollableAncestor(m365Section, 20);
    if (m365Scroll && m365Scroll.scrollHeight > m365Scroll.clientHeight + 50) {
      _log.info(`Copilot: scrolling M365 sidebar to load all history items`);
      const STEP = Math.max(200, Math.floor((m365Scroll.clientHeight || 400) * 0.6));
      let lastCount = m365Scroll.querySelectorAll("div[class*='SplitNavItem']").length;
      let stable = 0;
      for (let s = 0; s < 50; s++) {
        m365Scroll.scrollBy({ top: STEP, behavior: 'instant' });
        await _delay(400);
        const n = m365Scroll.querySelectorAll("div[class*='SplitNavItem']").length;
        if (n === lastCount) { if (++stable >= 3) break; }
        else { stable = 0; lastCount = n; }
      }
      m365Scroll.scrollTo({ top: 0, behavior: 'instant' });
      await _delay(300);
    }

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
        all.push({ title, messages: [], source: 'copilot', url: absUrl });
        _sendProgress(all.length, splitItems.length, title);
        _log.info(`Copilot: collected chat ${all.length}: "${title}" → ${absUrl}`);
      } catch (err) {
        _log.warn(`Copilot: error processing SplitNavItem ${i}: ${err.message}`);
      }
    }
    if (all.length > 0) {
      _log.info(`Copilot: collected ${all.length} conversation references (M365 nav)`);
      return all;
    }
    _log.warn('Copilot: M365 section found but no SplitNavItem matched');
  }

  // ── Fallback: any <a> with a conversation URL on the page ────────────
  // Try scrolling the sidebar first to load all virtualised items
  if (all.length === 0) {
    try {
      const nav = document.querySelector('nav') || document.querySelector('[role="navigation"]');
      if (nav) {
        const sb = nav.querySelector('.t-custom-scrollbar') || _findScrollableAncestor(
          Array.from(nav.querySelectorAll('h2')).find(h => h.textContent?.includes('conversations'))
        );
        if (sb && sb.scrollHeight > sb.clientHeight + 50) {
          _log.info('Copilot: scrolling sidebar before fallback <a> scrape');
          const STEP = Math.max(200, Math.floor((sb.clientHeight || 400) * 0.6));
          for (let s = 0; s < 50; s++) {
            sb.scrollBy({ top: STEP, behavior: 'instant' });
            await _delay(400);
            const prev = sb.scrollTop;
            await _delay(200);
            if (sb.scrollTop === prev && sb.scrollTop + sb.clientHeight >= sb.scrollHeight - 10) break;
          }
          sb.scrollTo({ top: 0, behavior: 'instant' });
          await _delay(300);
        }
      }
    } catch {}
  }

  try {
    for (const el of document.querySelectorAll('a[href*="/chat/conversation/"]')) {
      const href = el.getAttribute('href') || '';
      if (!href) continue;
      const absUrl = new URL(href, location.origin).href;
      if (seen.has(absUrl)) continue;
      seen.add(absUrl);
      const title = el.textContent?.trim() || 'Untitled';
      all.push({ title, messages: [], source: 'copilot', url: absUrl });
    }
  } catch {}

  if (all.length > 0) {
    _log.info(`Copilot: collected ${all.length} conversation references (fallback)`);
    return all;
  }

  // ── copilot.microsoft.com: <div role="link"> chat history items ──────
  // The consumer copilot renders history as <div role="link"> elements
  // (no <a> tag, no href).  The conversation UUID is embedded in a
  // button's id: conversation-options-{uuid}.  URL: /chats/{uuid}
  //
  // First, scroll the sidebar to ensure all virtualised history items are
  // loaded into the DOM before scraping.
  await _scrollSidebarToLoadAll();
  try {
    const nav = document.querySelector('nav') || document.querySelector('[role="navigation"]');
    if (nav) {
      const lists = nav.querySelectorAll('[role="list"]');
      // The chat history list is typically the second [role="list"] in the nav
      for (const list of lists) {
        const linkItems = list.querySelectorAll('div[role="link"]');
        if (linkItems.length === 0) continue;
        _log.info(`Copilot: found ${linkItems.length} div[role="link"] items in nav list`);
        for (const item of linkItems) {
          try {
            const title = item.textContent?.trim() || 'Untitled';
            // Extract UUID from the options button id
            const optBtn = item.querySelector('button[id^="conversation-options-"]');
            if (!optBtn) continue;
            const convId = optBtn.id.replace('conversation-options-', '');
            if (!convId || seen.has(convId)) continue;
            seen.add(convId);
            const absUrl = `${location.origin}/chats/${convId}`;
            all.push({ title, messages: [], source: 'copilot', url: absUrl });
            _sendProgress(all.length, linkItems.length, title);
            _log.info(`Copilot: collected chat ${all.length}: "${title}" → ${absUrl}`);
          } catch (err) {
            _log.warn(`Copilot: error processing div[role="link"] item: ${err.message}`);
          }
        }
        // Only process the first list that has role="link" items
        if (all.length > 0) break;
      }
    }
  } catch (err) {
    _log.warn(`Copilot: error scanning nav for div[role="link"]: ${err.message}`);
  }

  if (all.length > 0) {
    _log.info(`Copilot: collected ${all.length} conversation references (div[role="link"])`);
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
  return all;
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
        // Copilot extraction is done in parallel via background tab-opening
        // (each URL opened in its own tab, EXTRACT_CHAT message, scroll-to-load).
        // The bulk-fetcher only collects conversation references.
        needsExtract = true;
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