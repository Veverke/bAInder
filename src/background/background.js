// bAInder Background Service Worker
// Stage 1: Basic setup and lifecycle management
// Stage 6: Enhanced SAVE_CHAT handler with validation, deduplication, and context menu excerpt save
//


import { handleSaveChat as _handleSaveChat, detectSource, buildExcerptPayload } from './chat-save-handler.js';
import { checkStaleChats } from './stale-check.js';
import { ChatRepository } from '../sidepanel/services/chat-repository.js';
import browser from '../lib/vendor/browser.js';
import { logger } from '../lib/utils/logger.js';

logger.info('Background service worker initialized');

// Shared ChatRepository instance backed by browser.storage.local.
// Centralises all chat I/O through the per-chat-key format.
const _chatRepo = new ChatRepository(browser.storage.local);

// Cache for rich excerpt markdown pushed proactively by content script on right-click.
// Stored in browser.storage.session so it survives service worker restarts between
// the contextmenu event and the context menu click handler.
// An in-memory mirror is kept for the fast (non-restart) path.
let _excerptCache = null;

// ─── Tab state tracking for bulk-fetch extraction ────────────────────────────
// Maps tabIndex → { phase, remaining, title, error? }
const _tabStates = new Map();
let _tabStateSeq = 0; // monotonic counter for tabIndex assignment

// ─── Context Menu ────────────────────────────────────────────────────────────

const SUPPORTED_URL_PATTERNS = [
  'https://chat.openai.com/*',
  'https://chatgpt.com/*',
  'https://claude.ai/*',
  'https://gemini.google.com/*',
  'https://copilot.microsoft.com/*',
  'https://m365.cloud.microsoft/*',
  'https://chat.deepseek.com/*'
];

function setupContextMenus() {
  browser.contextMenus.removeAll().then(() => {
    browser.contextMenus.create({
      id:                  'save-excerpt',
      title:               '💾 Save selection to bAInder',
      contexts:            ['selection'],
      documentUrlPatterns: SUPPORTED_URL_PATTERNS
    });
  });
}

browser.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== 'save-excerpt') return;
  try {
    const pageUrl = info.pageUrl || '';
    logger.debug('onClicked: selectionText=', JSON.stringify((info.selectionText || '').slice(0, 200)));

    // Prefer the rich markdown pushed proactively by the content script on
    // right-click (STORE_EXCERPT_CACHE).  Fall back to a live EXTRACT_EXCERPT
    // request (works when the page selection is still intact), then finally to
    // the plain selectionText provided by the Chrome API.
    //
    // The in-memory _excerptCache works when the service worker stayed alive.
    // browser.storage.session covers the case where the SW was killed and
    // restarted between the contextmenu event and the menu-item click.
    let richMarkdown = _excerptCache?.markdown || null;
    logger.debug('onClicked: in-memory excerptCache =', richMarkdown ? JSON.stringify(richMarkdown.slice(0, 200)) : null);
    _excerptCache = null; // consume in-memory copy

    if (!richMarkdown) {
      try {
        const stored = await browser.storage.session.get('excerptCache');
        richMarkdown = stored?.excerptCache?.markdown || null;
        logger.debug('onClicked: session excerptCache =', richMarkdown ? JSON.stringify(richMarkdown.slice(0, 200)) : null);
      } catch (e) {
        logger.debug('onClicked: session storage read failed =', e?.message);
      }
    }
    // Always clear session storage after consuming (one-shot)
    browser.storage.session.remove('excerptCache').catch(() => {});

    if (!richMarkdown) {
      logger.debug('onClicked: no cache — trying EXTRACT_EXCERPT fallback');
      try {
        const resp = await browser.tabs.sendMessage(tab.id, { type: 'EXTRACT_EXCERPT' });
        logger.debug('onClicked: EXTRACT_EXCERPT resp =', resp?.success, typeof resp?.data?.markdown, (resp?.data?.markdown || '').slice(0, 200));
        if (resp?.success && resp.data?.markdown) richMarkdown = resp.data.markdown;
      } catch (e) {
        logger.debug('onClicked: EXTRACT_EXCERPT failed =', e?.message);
      }
    }

    logger.debug('onClicked: resolved richMarkdown =', richMarkdown ? JSON.stringify(richMarkdown.slice(0, 500)) : null);
    const payload = buildExcerptPayload(info.selectionText, pageUrl, richMarkdown);
    logger.debug('onClicked: payload.content =', JSON.stringify(payload.content.slice(0, 500)));
    const entry = await handleSaveChat(payload, { tab });
    browser.runtime.sendMessage({ type: 'CHAT_SAVED', data: entry }).catch(() => {});
  } catch (err) {
    logger.error('Excerpt save failed:', err.message);
  }
});

// ─── Lifecycle ────────────────────────────────────────────────────────────────

// Extension installed or updated
browser.runtime.onInstalled.addListener((details) => {
  logger.info('Extension event:', details.reason);
  setupContextMenus();

  if (details.reason === 'install') {
    logger.info('First-time install — setting up defaults');
    setupDefaults();
    
    // Open side panel to welcome user
    browser.tabs.query({ active: true, currentWindow: true }).then(tabs => {
      if (tabs[0]) {
        browser.sidePanel.open({ tabId: tabs[0].id }).catch(err => {
          logger.warn('Could not open side panel on install:', err);
        });
      }
    });
  } else if (details.reason === 'update') {
    logger.info('Extension updated from', details.previousVersion);
  }
});

// Set up default data structure
async function setupDefaults() {
  try {
    const existing = await browser.storage.local.get(['topicTree']);
    if (!existing.topicTree) {
      await browser.storage.local.set({
        topicTree: { rootTopicIds: [], topics: {} },
      });
    }
  } catch (error) {
    logger.error('Error setting up defaults:', error);
  }
}

// Handle action (toolbar icon) click - open side panel
browser.action.onClicked.addListener((tab) => {
  logger.info('Toolbar icon clicked — opening side panel');
  browser.sidePanel.open({ tabId: tab.id }).catch(err => {
    logger.error('Failed to open side panel:', err);
  });
});

// Handle messages from content scripts and side panel
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Reject messages from any sender that is not this extension itself
  if (!sender.id || sender.id !== browser.runtime.id) return false;

  logger.debug('Runtime message received:', message.type);

  // ── Bulk fetch: forward content-script messages to the sidepanel ──────────
  // Content-script messages have sender.tab set; extension pages don't.
  if (sender.tab && message.type === 'FETCH_ALL_CHATS_PROGRESS') {
    // Progress messages always forward directly.
    const fwd = { type: `SIDEPANEL_${message.type}`, data: message.data };
    logger.info(`Relaying ${message.type} → sidepanel (${JSON.stringify(message.data).slice(0, 120)})`);
    browser.runtime.sendMessage(fwd).catch(() => {});
    sendResponse({ success: true });
    return;
  }

  // ── Per-tab extraction progress from content scripts ────────────────────
  if (sender.tab && message.type === 'EXTRACT_CHAT_PROGRESS') {
    const { tabIndex, phase, remaining, error } = message.data || {};
    const key = tabIndex != null ? tabIndex : _tabStateSeq;
    _tabStates.set(key, { phase, remaining, title: message.data?.title || '', error });
    // Forward aggregated tab states to sidepanel
    const states = Array.from(_tabStates.entries()).map(([idx, st]) => ({
      tabIndex: idx, phase: st.phase, remaining: st.remaining, title: st.title, error: st.error,
    }));
    browser.runtime.sendMessage({
      type: 'SIDEPANEL_EXTRACT_CHAT_PROGRESS',
      data: { states },
    }).catch(() => {});
    sendResponse({ success: true });
    return;
  }

  if (sender.tab && message.type === 'FETCH_ALL_CHATS_RESULT') {
    const { data } = message;
    if (data?.needsExtract && Array.isArray(data?.chats) && data.chats.length > 0) {
      // ── Parallel tab extraction ─────────────────────────────────────────
      // The bulk-fetcher collected only URLs (needsExtract = true).
      // Open each URL in its own tab, send EXTRACT_CHAT, collect messages,
      // close tab — all with bounded concurrency (5 parallel).
      logger.info(`FETCH_ALL_CHATS_RESULT: needsExtract — starting parallel tab extraction for ${data.chats.length} chats (platform=${data.platform})`);
      sendResponse({ success: true }); // ack immediately

      // Kick off async extraction — do not await inside the listener.
      _extractChatsInTabs(data).catch(err => {
        logger.error('Parallel tab extraction failed:', err.message);
      });
      return false; // sendResponse already called
    }

    // No extraction needed (e.g. ChatGPT/Claude already fully fetched via API).
    const fwd = { type: `SIDEPANEL_${message.type}`, data: data };
    logger.info(`Relaying ${message.type} → sidepanel (no extraction needed, ${data?.chats?.length || 0} chats)`);
    browser.runtime.sendMessage(fwd).catch(() => {});
    sendResponse({ success: true });
    return;
  }

  // Forward logs from content scripts (tab console → SW console).
  if (message.type === 'CONTENT_LOG') {
    const lvl = message.level || 'info';
    if (lvl === 'warn')  logger.warn('[content]', message.msg);
    else if (lvl === 'error') logger.error('[content]', message.msg);
    else                 logger.info('[content]', message.msg);
    return; // no sendResponse needed
  }

  switch (message.type) {
    case 'FETCH_IMAGE_AS_DATA_URL': {
      // Content scripts cannot bypass CORP: same-site for cross-origin image hosts
      // (the browser treats their isolated world as extension-origin, not page-origin).
      // The background service worker is exempt from CORP enforcement when the URL
      // is listed in host_permissions, so we proxy the fetch through here.
      const { url: imgUrl } = message;
      (async () => {
        try {
          const resp = await fetch(imgUrl, { credentials: 'include' });
          logger.info('FETCH_IMAGE_AS_DATA_URL response:', resp.status, resp.url);
          if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
          const blob = await resp.blob();
          const reader = new FileReader();
          reader.onloadend = () => sendResponse({ success: true, dataUrl: reader.result });
          reader.onerror   = () => sendResponse({ success: false, error: 'FileReader error' });
          reader.readAsDataURL(blob);
        } catch (err) {
          logger.info('FETCH_IMAGE_AS_DATA_URL failed:', err.message);
          sendResponse({ success: false, error: err.message });
        }
      })();
      return true; // keep channel open for async response
    }

    case 'CAPTURE_DESIGNER_IMAGE': {
      // Screenshot the visible tab, crop to the Designer iframe rect, return data URL.
      // This is the only reliable way to capture the cross-origin WebGL canvas.
      const { iframeid, rect, dpr } = message;
      const tabId = sender && sender.tab && sender.tab.id;
      if (!tabId || !rect) { sendResponse({ success: false }); break; }
      (async () => {
        try {
          const dataUrl = await browser.tabs.captureVisibleTab(null, { format: 'png' });
          // Decode and crop using OffscreenCanvas
          const img = await createImageBitmap(await (await fetch(dataUrl)).blob());
          const x = Math.round(rect.left * dpr);
          const y = Math.round(rect.top  * dpr);
          const w = Math.round(rect.width  * dpr);
          const h = Math.round(rect.height * dpr);
          // Clamp to image bounds
          const cx = Math.max(0, x);
          const cy = Math.max(0, y);
          const cw = Math.min(w, img.width  - cx);
          const ch = Math.min(h, img.height - cy);
          if (cw <= 0 || ch <= 0) { sendResponse({ success: false }); return; }
          const canvas = new OffscreenCanvas(cw, ch);
          canvas.getContext('2d').drawImage(img, cx, cy, cw, ch, 0, 0, cw, ch);
          const blob = await canvas.convertToBlob({ type: 'image/png' });
          const reader = new FileReader();
          reader.onloadend = () => sendResponse({ dataUrl: reader.result });
          reader.readAsDataURL(blob);
        } catch (err) {
          logger.warn('CAPTURE_DESIGNER_IMAGE failed:', err.message);
          sendResponse({ success: false, error: err.message });
        }
      })();
      return true; // keep channel open for async response
    }

    case 'STORE_EXCERPT_CACHE':
      // Rich markdown pushed proactively by content script on right-click.
      // Store both in-memory (fast path) and session storage (SW restart path).
      _excerptCache = message.data || null;
      logger.debug('STORE_EXCERPT_CACHE received, markdown =', _excerptCache ? JSON.stringify(_excerptCache.markdown?.slice(0, 200)) : null);
      browser.storage.session.set({ excerptCache: _excerptCache })
        .then(() => logger.debug('STORE_EXCERPT_CACHE: session storage write OK'))
        .catch(e => logger.debug('STORE_EXCERPT_CACHE: session storage write failed =', e?.message));
      sendResponse({ success: true });
      break;

    case 'SAVE_CHAT':
      handleSaveChat(message.data, sender)
        .then(result => {
          sendResponse({ success: true, data: result });
          browser.runtime.sendMessage({ type: 'CHAT_SAVED', data: result }).catch(() => {});
        })
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true; // Keep channel open for async response
      
    case 'GET_STORAGE_USAGE':
      getStorageUsage()
        .then(usage => sendResponse({ success: true, data: usage }))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true;
      
    case 'OPEN_SIDE_PANEL':
      browser.sidePanel.open({ tabId: sender.tab.id })
        .then(() => sendResponse({ success: true }))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true;

    case 'FETCH_ALL_CHATS':
      // Sidepanel requests injection of bulk-fetcher into the active tab.
      logger.info('FETCH_ALL_CHATS received from sidepanel');
      (async () => {
        try {
          const tabs = await browser.tabs.query({ active: true, currentWindow: true });
          const tab = tabs?.[0];
          if (!tab || !tab.id) {
            logger.warn('FETCH_ALL_CHATS: no active tab');
            sendResponse({ success: false, error: 'No active tab found' });
            return;
          }
          const url = tab.url || '';
          logger.info(`FETCH_ALL_CHATS: active tab url = ${url}`);
          const supported = [
            'chat.openai.com', 'chatgpt.com', 'claude.ai',
            'gemini.google.com', 'copilot.microsoft.com',
            'm365.cloud.microsoft', 'chat.deepseek.com', 'perplexity.ai'
          ];
          if (!supported.some(h => url.includes(h))) {
            sendResponse({ success: false, error: 'Active tab is not on a supported AI chat platform' });
            return;
          }
          logger.info('FETCH_ALL_CHATS: injecting bulk-fetcher.js into tab', tab.id);
          await browser.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['bulk-fetcher.js'],
          });
          logger.info('FETCH_ALL_CHATS: bulk-fetcher.js injected successfully');
          sendResponse({ success: true });
        } catch (err) {
          logger.error('FETCH_ALL_CHATS injection error:', err.message);
          sendResponse({ success: false, error: err.message });
        }
      })();
      return true;

    default:
      logger.warn('Unknown message type:', message.type);
      sendResponse({ success: false, error: 'Unknown message type' });
  }
});

// Handle saving a chat from content script
// Delegates to the testable handler module, passing the shared ChatRepository
async function handleSaveChat(chatData, sender) {
  return _handleSaveChat(chatData, sender, _chatRepo);
}

// ─── Parallel tab extraction for bulk-fetcher ────────────────────────────────

/**
 * Map an array concurrently with bounded parallelism, preserving insertion order.
 * @template T, R
 * @param {T[]} items
 * @param {(item: T, index: number) => Promise<R>} fn
 * @param {number} [concurrency=5]
 * @returns {Promise<R[]>}
 */
async function _mapConcurrent(items, fn, concurrency = 5) {
  const results = [];
  const queue = items.entries();
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    for (const [i, item] of queue) {
      results[i] = await fn(item, i);
    }
  });
  await Promise.all(workers);
  return results;
}

/**
 * Send a progress update to the sidepanel during parallel tab extraction.
 * @param {number} current
 * @param {number} total
 * @param {string} [title]
 */
function _sendExtractProgress(current, total, title) {
  browser.runtime.sendMessage({
    type: 'SIDEPANEL_FETCH_ALL_CHATS_PROGRESS',
    data: { current, total, title },
  }).catch(() => {});
}

/**
 * Broadcast the current _tabStates to the sidepanel.
 */
function _sendTabStateUpdate() {
  const states = Array.from(_tabStates.entries()).map(([idx, st]) => ({
    tabIndex: idx, phase: st.phase, remaining: st.remaining, title: st.title, error: st.error,
  }));
  browser.runtime.sendMessage({
    type: 'SIDEPANEL_EXTRACT_CHAT_PROGRESS',
    data: { states },
  }).catch(() => {});
}

/**
 * Open each chat URL in a new tab, send EXTRACT_CHAT to the content script,
 * collect messages, close the tab — all with bounded concurrency.
 *
 * @param {{ platform: string, chats: Array<{title: string, url: string, messages: Array}> }} data
 */
async function _extractChatsInTabs(data) {
  const { platform, chats } = data;
  const total = chats.length;
  let extractedCount = 0;

  // Read settings from storage (concurrency + range)
  let concurrency = 5;
  let rangeStart = 1;
  let rangeEnd = 999999;
  try {
    const s = await browser.storage.local.get(['extractSettings']);
    const es = s.extractSettings || {};
    concurrency = Math.max(1, Math.min(20, parseInt(es.concurrency, 10) || 5));
    rangeStart  = Math.max(1, parseInt(es.rangeStart, 10) || 1);
    rangeEnd    = Math.max(rangeStart, parseInt(es.rangeEnd, 10) || 999999);
  } catch (_) {}

  // Slice chats to the requested range (1-based, inclusive)
  const startIdx = rangeStart - 1;
  const endIdx   = Math.min(rangeEnd, total);
  const workingChats = chats.slice(startIdx, endIdx);

  logger.info(`_extractChatsInTabs: platform=${platform} total=${total} ` +
    `range=[${rangeStart}..${rangeEnd}] concurrency=${concurrency} ` +
    `working=${workingChats.length} chats`);

  _sendExtractProgress(0, workingChats.length, 'Starting parallel extraction…');

  await _mapConcurrent(workingChats, async (chat) => {
    if (!chat.url) {
      logger.warn(`_extractChatsInTabs: "${chat.title}" has no URL — skipping`);
      return;
    }

    // Assign a unique tabIndex for progress tracking
    const tabIndex = ++_tabStateSeq;
    _tabStates.set(tabIndex, { phase: 'waiting', remaining: 60, title: chat.title || '' });
    logger.info(`_extractChatsInTabs: [idx=${tabIndex}] starting "${chat.title}" url=${chat.url}`);

    let tab = null;
    try {
      // 1. Open the conversation URL in a new tab
      logger.info(`_extractChatsInTabs: [idx=${tabIndex}] creating tab for "${chat.title}" → ${chat.url}`);
      tab = await browser.tabs.create({ url: chat.url, active: false });
      const tabId = tab.id;
      _tabStates.set(tabIndex, { ..._tabStates.get(tabIndex), phase: 'loading' });
      _sendTabStateUpdate();
      logger.info(`_extractChatsInTabs: opened tab ${tabId} (idx=${tabIndex}) for "${chat.title}" → ${chat.url}`);

      // Set tab title to include the extraction index for easy identification
      logger.info(`_extractChatsInTabs: [idx=${tabIndex}] tab ${tabId} finished loading`);

      // Set tab title to include the extraction index for easy identification
      // Chrome's tabs.update() does NOT support a 'title' property (Firefox-only).
      browser.scripting.executeScript({
        target: { tabId },
        func: (t) => { document.title = t; },
        args: [`#${tabIndex} - ${chat.title}`],
      }).catch(e => {
        logger.warn(`_extractChatsInTabs: [idx=${tabIndex}] title injection failed: ${e.message}`);
      });

      // Give content script a moment to initialise
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          cleanup();
          reject(new Error(`Timeout waiting for tab ${tabId} to load (60s)`));
        }, 60_000);

        const onUpdated = (updatedTabId, changeInfo) => {
          if (updatedTabId !== tabId) return;
          if (changeInfo.status === 'complete') {
            cleanup();
            resolve();
          }
        };

        const onError = (erasedTabId) => {
          if (erasedTabId === tabId) {
            cleanup();
            reject(new Error(`Tab ${tabId} was removed before loading`));
          }
        };

        const cleanup = () => {
          clearTimeout(timeout);
          browser.tabs.onUpdated.removeListener(onUpdated);
          browser.tabs.onRemoved.removeListener(onError);
        };

        browser.tabs.onUpdated.addListener(onUpdated);
        browser.tabs.onRemoved.addListener(onError);
      });

      logger.info(`_extractChatsInTabs: [idx=${tabIndex}] tab ${tabId} finished loading`);

      // Give content script a moment to initialise
      await new Promise(r => setTimeout(r, 1500));

      // ── Activate tab to wake up virtual-list rendering ──────────────────
      // Chrome throttles hidden/inactive tabs severely:
      //   - requestAnimationFrame is paused
      //   - scroll events are coalesced or dropped
      //   - setTimeout is clamped to ≥ 1s
      // The Copilot SPA virtual list relies on rAF + scroll handlers to
      // render off-screen messages.  Without activation, our scroll-to-
      // trigger fix in the content script has no effect and only the first
      // 1-2 visible messages are mounted in the DOM.
      //
      // We activate the tab briefly, wait for the virtual list to finish
      // rendering, send EXTRACT_CHAT, then close the tab immediately.
      // Since extraction runs with bounded concurrency (default 5), at most
      // 5 brief tab-switches happen at once.
      _tabStates.set(tabIndex, { ..._tabStates.get(tabIndex), phase: 'activating' });
      _sendTabStateUpdate();
      await browser.tabs.update(tabId, { active: true }).catch(e => {
        logger.warn(`_extractChatsInTabs: [idx=${tabIndex}] tab activation failed: ${e.message}`);
      });
      // Wait for the virtual list to render all items (rAF + scroll handlers
      // fire when the tab is active)
      await new Promise(r => setTimeout(r, 3000));

      // 3. Send EXTRACT_CHAT message to the content script with tabIndex
      logger.info(`_extractChatsInTabs: [idx=${tabIndex}] sending EXTRACT_CHAT to tab ${tabId}`);
      const resp = await browser.tabs.sendMessage(tabId, { type: 'EXTRACT_CHAT', tabIndex });
      if (resp?.success && resp.data) {
        // Use the full formatted markdown from prepareChatForSave() directly
        // rather than rebuilding from messages — this preserves formatting
        // (emoji roles, markdown structure) and avoids duplicating logic.
        chat.content = resp.data.content || '';
        chat.messages = resp.data.messages || [];
        chat.messageCount = resp.data.messageCount || chat.messages.length;
        chat.extractedAt = resp.data.metadata?.extractedAt || Date.now();
        chat.chatDate = resp.data.metadata?.chatDate || null;
        chat.source = resp.data.source || chat.source || platform;

        // Preserve the original sidebar chat name (from bulk-fetcher's
        // discovery phase) instead of the derived title that extractCopilot
        // generates from the first user prompt.  The derived title is embedded
        // in the frontmatter of resp.data.content — replace it.
        if (chat.title && chat.content) {
          chat.content = chat.content.replace(
            /^title: \".*\"$/m,
            `title: "${chat.title.replace(/[\\"]/g, '\\$&')}"`
          );
        }

        logger.info(`_extractChatsInTabs: extracted ${chat.messages.length} messages from "${chat.title}"`);
        _tabStates.set(tabIndex, { ..._tabStates.get(tabIndex), phase: 'done' });
        _sendTabStateUpdate();
      } else {
        logger.warn(`_extractChatsInTabs: [idx=${tabIndex}] EXTRACT_CHAT failed for "${chat.title}": resp=${JSON.stringify(resp)}`);
        _tabStates.set(tabIndex, { ..._tabStates.get(tabIndex), phase: 'error' });
        _sendTabStateUpdate();
      }

      // 4. Close the tab
      logger.info(`_extractChatsInTabs: [idx=${tabIndex}] closing tab ${tabId}`);
      await browser.tabs.remove(tabId).catch(() => {});
      tab = null;
    } catch (err) {
      logger.warn(`_extractChatsInTabs: error processing "${chat.title}" [idx=${tabIndex}]: ${err.message}`, err.stack);
      _tabStates.set(tabIndex, { ..._tabStates.get(tabIndex), phase: 'error' });
      _sendTabStateUpdate();
      if (tab?.id) {
        await browser.tabs.remove(tab.id).catch(() => {});
      }
    }

    extractedCount++;
    logger.info(`_extractChatsInTabs: [idx=${tabIndex}] completed (${extractedCount}/${workingChats.length})`);
    _sendExtractProgress(extractedCount, workingChats.length, `Extracted: ${chat.title}`);
  }, concurrency); // concurrency from settings

  // 5. Send final result to sidepanel
  logger.info(`_extractChatsInTabs: done — ${extractedCount}/${workingChats.length} chats extracted`);
  browser.runtime.sendMessage({
    type: 'SIDEPANEL_FETCH_ALL_CHATS_RESULT',
    data: { success: true, platform, chats: workingChats },
  }).catch(() => {});
}

// Get storage usage
async function getStorageUsage() {
  try {
    const bytesInUse = await browser.storage.local.getBytesInUse();
    return {
      bytes: bytesInUse,
      megabytes: (bytesInUse / (1024 * 1024)).toFixed(2)
    };
  } catch (error) {
    logger.error('getStorageUsage failed:', error);
    throw error;
  }
}

// Keep service worker alive (optional, for debugging)
browser.runtime.onStartup.addListener(() => {
  logger.info('Browser started — service worker active');
  // C.19 — Run stale-check on every browser startup
  checkStaleChats(browser.storage.local)
    .then(count => { if (count > 0) logger.info('Stale check: flagged', count, 'chat(s) for review'); })
    .catch(err => logger.warn('Stale check failed on startup:', err.message));
});

// C.19 — Register a daily alarm to keep stale flags current even when the
// browser isn't restarted.  The alarm is created idempotently: Chrome
// ignores duplicate creates for an alarm that already exists.
browser.alarms.create('staleCheck', { periodInMinutes: 1440 });
browser.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'staleCheck') {
    checkStaleChats(browser.storage.local)
      .then(count => { if (count > 0) logger.info('Stale check (alarm): flagged', count, 'chat(s) for review'); })
      .catch(err => logger.warn('Stale check alarm failed:', err.message));
  }
});

logger.info('Background service worker ready');
