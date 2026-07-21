/**
 * bulk-fetcher.js
 *
 * Self-contained content script for fetching ALL chat conversations from a
 * supported AI chat platform.  Designed to be injected into a tab via
 * chrome.scripting.executeScript({ file: 'bulk-fetcher.js' }) from the
 * background service worker.
 *
 * This file is bundled by Vite as a standalone entry point (no imports
 * from other modules — keeps the bundle self-contained).
 *
 * After it finishes, it sends a FETCH_ALL_CHATS_RESULT message back to
 * the background worker, and progress updates as FETCH_ALL_CHATS_PROGRESS.
 */

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
        all.push({ title, messages: [], source: 'copilot', url: absUrl, _needsExtract: true });
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