// bAInder Background Service Worker
// Stage 1: Basic setup and lifecycle management
// Stage 6: Enhanced SAVE_CHAT handler with validation, deduplication, and context menu excerpt save

import { handleSaveChat as _handleSaveChat, detectSource, buildExcerptPayload } from './chat-save-handler.js';
import browser from 'webextension-polyfill';

console.log('bAInder Background Service Worker initialized');

// Cache for rich excerpt markdown pushed proactively by content script on right-click.
// Stored in browser.storage.session so it survives service worker restarts between
// the contextmenu event and the context menu click handler.
// An in-memory mirror is kept for the fast (non-restart) path.
let _excerptCache = null;

// ─── Context Menu ────────────────────────────────────────────────────────────

const SUPPORTED_URL_PATTERNS = [
  'https://chat.openai.com/*',
  'https://chatgpt.com/*',
  'https://claude.ai/*',
  'https://gemini.google.com/*',
  'https://copilot.microsoft.com/*',
  'https://m365.cloud.microsoft/*'
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
    console.log('[bAInder DEBUG] onClicked: menuItemId=save-excerpt, selectionText=', JSON.stringify((info.selectionText || '').slice(0, 200)));

    // Prefer the rich markdown pushed proactively by the content script on
    // right-click (STORE_EXCERPT_CACHE).  Fall back to a live EXTRACT_EXCERPT
    // request (works when the page selection is still intact), then finally to
    // the plain selectionText provided by the Chrome API.
    //
    // The in-memory _excerptCache works when the service worker stayed alive.
    // browser.storage.session covers the case where the SW was killed and
    // restarted between the contextmenu event and the menu-item click.
    let richMarkdown = _excerptCache?.markdown || null;
    console.log('[bAInder DEBUG] onClicked: _excerptCache =', richMarkdown ? JSON.stringify(richMarkdown.slice(0, 200)) : null);
    _excerptCache = null; // consume in-memory copy

    if (!richMarkdown) {
      try {
        const stored = await browser.storage.session.get('excerptCache');
        richMarkdown = stored?.excerptCache?.markdown || null;
        console.log('[bAInder DEBUG] onClicked: session storage excerptCache =', richMarkdown ? JSON.stringify(richMarkdown.slice(0, 200)) : null);
      } catch (e) {
        console.warn('[bAInder DEBUG] onClicked: session storage get failed =', e?.message);
      }
    }
    // Always clear session storage after consuming (one-shot)
    browser.storage.session.remove('excerptCache').catch(() => {});

    if (!richMarkdown) {
      console.log('[bAInder DEBUG] onClicked: no cache, trying EXTRACT_EXCERPT fallback');
      try {
        const resp = await browser.tabs.sendMessage(tab.id, { type: 'EXTRACT_EXCERPT' });
        console.log('[bAInder DEBUG] onClicked: EXTRACT_EXCERPT resp =', resp?.success, typeof resp?.data?.markdown, (resp?.data?.markdown || '').slice(0, 200));
        if (resp?.success && resp.data?.markdown) richMarkdown = resp.data.markdown;
      } catch (e) {
        console.warn('[bAInder DEBUG] onClicked: EXTRACT_EXCERPT failed =', e?.message);
      }
    }

    console.log('[bAInder DEBUG] onClicked: final richMarkdown =', richMarkdown ? JSON.stringify(richMarkdown.slice(0, 500)) : null);
    const payload = buildExcerptPayload(info.selectionText, pageUrl, richMarkdown);
    console.log('[bAInder DEBUG] onClicked: payload.content =', JSON.stringify(payload.content.slice(0, 500)));
    const entry = await handleSaveChat(payload, { tab });
    browser.runtime.sendMessage({ type: 'CHAT_SAVED', data: entry }).catch(() => {});
  } catch (err) {
    console.error('bAInder: Excerpt save failed', err.message);
  }
});

// ─── Lifecycle ────────────────────────────────────────────────────────────────

// Extension installed or updated
browser.runtime.onInstalled.addListener((details) => {
  console.log('Extension installed/updated:', details.reason);
  setupContextMenus();

  if (details.reason === 'install') {
    // First time installation
    console.log('First time installation - setting up defaults');
    setupDefaults();
    
    // Open side panel to welcome user
    browser.tabs.query({ active: true, currentWindow: true }).then(tabs => {
      if (tabs[0]) {
        chrome.sidePanel.open({ tabId: tabs[0].id }).catch(err => {
          console.log('Could not open side panel:', err);
        });
      }
    });
  } else if (details.reason === 'update') {
    console.log('Extension updated from version:', details.previousVersion);
  }
});

// Set up default data structure
async function setupDefaults() {
  try {
    const existing = await browser.storage.local.get(['topics', 'chats', 'settings']);
    
    if (!existing.topics) {
      await browser.storage.local.set({
        topics: [],
        chats: [],
        expandedTopics: [],
        settings: {
          theme: 'light',
          autoSave: true,
          showTimestamps: true,
          defaultExportFormat: 'markdown'
        }
      });
      console.log('Default data structure created');
    }
  } catch (error) {
    console.error('Error setting up defaults:', error);
  }
}

// Handle action (toolbar icon) click - open side panel
browser.action.onClicked.addListener((tab) => {
  console.log('Extension icon clicked, opening side panel');
  chrome.sidePanel.open({ tabId: tab.id }).catch(err => {
    console.error('Error opening side panel:', err);
  });
});

// Handle messages from content scripts and side panel
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Message received:', message.type, message);
  
  switch (message.type) {
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
          console.warn('[bAInder] CAPTURE_DESIGNER_IMAGE failed:', err.message);
          sendResponse({ success: false, error: err.message });
        }
      })();
      return true; // keep channel open for async response
    }

    case 'STORE_EXCERPT_CACHE':
      // Rich markdown pushed proactively by content script on right-click.
      // Store both in-memory (fast path) and session storage (SW restart path).
      _excerptCache = message.data || null;
      console.log('[bAInder DEBUG] STORE_EXCERPT_CACHE received, markdown =', _excerptCache ? JSON.stringify(_excerptCache.markdown?.slice(0, 200)) : null);
      browser.storage.session.set({ excerptCache: _excerptCache })
        .then(() => console.log('[bAInder DEBUG] STORE_EXCERPT_CACHE: session storage write OK'))
        .catch(e => console.warn('[bAInder DEBUG] STORE_EXCERPT_CACHE: session storage write failed =', e?.message));
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
      chrome.sidePanel.open({ tabId: sender.tab.id })
        .then(() => sendResponse({ success: true }))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true;
      
    default:
      console.warn('Unknown message type:', message.type);
      sendResponse({ success: false, error: 'Unknown message type' });
  }
});

// Handle saving a chat from content script
// Delegates to the testable handler module, passing browser.storage.local as storage
async function handleSaveChat(chatData, sender) {
  return _handleSaveChat(chatData, sender, browser.storage.local);
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
    console.error('Error getting storage usage:', error);
    throw error;
  }
}

// Keep service worker alive (optional, for debugging)
browser.runtime.onStartup.addListener(() => {
  console.log('Browser started, service worker active');
});

console.log('Background service worker setup complete');
