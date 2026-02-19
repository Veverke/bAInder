// bAInder Background Service Worker
// Stage 1: Basic setup and lifecycle management
// Stage 6: Enhanced SAVE_CHAT handler with validation, deduplication, and context menu excerpt save

import { handleSaveChat as _handleSaveChat, detectSource, buildExcerptPayload } from './chat-save-handler.js';

console.log('bAInder Background Service Worker initialized');

// ─── Context Menu ────────────────────────────────────────────────────────────

const SUPPORTED_URL_PATTERNS = [
  'https://chat.openai.com/*',
  'https://claude.ai/*',
  'https://gemini.google.com/*',
  'https://copilot.microsoft.com/*'
];

function setupContextMenus() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id:                  'save-excerpt',
      title:               '💾 Save selection to bAInder',
      contexts:            ['selection'],
      documentUrlPatterns: SUPPORTED_URL_PATTERNS
    });
  });
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== 'save-excerpt') return;
  try {
    const payload = buildExcerptPayload(info.selectionText, info.pageUrl);
    handleSaveChat(payload, { tab })
      .then(entry => console.log('bAInder: Excerpt saved', entry.id))
      .catch(err  => console.error('bAInder: Excerpt save failed', err.message));
  } catch (err) {
    console.error('bAInder: Could not build excerpt payload', err.message);
  }
});

// ─── Lifecycle ────────────────────────────────────────────────────────────────

// Extension installed or updated
chrome.runtime.onInstalled.addListener((details) => {
  console.log('Extension installed/updated:', details.reason);
  setupContextMenus();

  if (details.reason === 'install') {
    // First time installation
    console.log('First time installation - setting up defaults');
    setupDefaults();
    
    // Open side panel to welcome user
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
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
    const existing = await chrome.storage.local.get(['topics', 'chats', 'settings']);
    
    if (!existing.topics) {
      await chrome.storage.local.set({
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
chrome.action.onClicked.addListener((tab) => {
  console.log('Extension icon clicked, opening side panel');
  chrome.sidePanel.open({ tabId: tab.id }).catch(err => {
    console.error('Error opening side panel:', err);
  });
});

// Handle messages from content scripts and side panel
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Message received:', message.type, message);
  
  switch (message.type) {
    case 'SAVE_CHAT':
      handleSaveChat(message.data, sender)
        .then(result => sendResponse({ success: true, data: result }))
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
// Delegates to the testable handler module, passing chrome.storage.local as storage
async function handleSaveChat(chatData, sender) {
  return _handleSaveChat(chatData, sender, chrome.storage.local);
}

// Get storage usage
async function getStorageUsage() {
  try {
    const bytesInUse = await chrome.storage.local.getBytesInUse();
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
chrome.runtime.onStartup.addListener(() => {
  console.log('Browser started, service worker active');
});

console.log('Background service worker setup complete');
