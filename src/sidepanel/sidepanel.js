/**
 * sidepanel.js — bAInder Side Panel entry point
 *
 * Responsibility: bootstrap the application — create service instances,
 * load persisted data, wire DOM event listeners, and hand off to feature
 * and controller modules.
 *
 * This file is intentionally thin: it delegates every concern to a focused
 * module.  Nothing "interesting" should live here.
 *
 * Module map:
 *   app-context.js                  shared state + elements
 *   services/chat-repository.js     all browser.storage chat I/O
 *   services/reminder-prefs-repository.js  backup-reminder preference storage I/O
 *   controllers/tree-controller.js  tree load/save/render
 *   controllers/search-controller.js  search + filter bar
 *   controllers/topic-actions.js    topic CRUD + context menu
 *   controllers/chat-actions.js     chat CRUD + context menu + handleChatSaved
 *   controllers/import-export-actions.js  toolbar export / import / clear-all
 *   features/save-banner.js         "Save to bAInder" banner
 *   features/backup-reminder.js     periodic backup reminder banner
 *   features/theme-picker.js        theme picker panel
 *   features/multi-select.js        multi-select + digest export
 *   features/settings-panel.js      settings slide-in panel
 *   features/recent-rail.js         recently-saved chip rail
 *   features/storage-usage.js       storage usage display
 *   services/storage-sync.js        cross-tab storage change listener
 *   notification.js                 toast notifications
 */

import { StorageService, StorageUsageTracker } from '../lib/storage.js';
import { DialogManager }   from '../lib/dialogs/dialog-manager.js';
import { TopicDialogs }    from '../lib/dialogs/topic-dialogs.js';
import { ChatDialogs }     from '../lib/dialogs/chat-dialogs.js';
import { ExportDialog }    from '../lib/dialogs/export-dialog.js';
import { ImportDialog }    from '../lib/dialogs/import-dialog.js';
import { loadTheme }       from '../lib/theme/useTheme.js';
import browser             from '../lib/vendor/browser.js';
import { logger }          from '../lib/utils/logger.js';
import { TREE_FLASH_MS }   from '../lib/utils/constants.js';

import { state, elements }          from './app-context.js';
import { ChatRepository }            from './services/chat-repository.js';
import { ReminderPrefsRepository }   from './services/reminder-prefs-repository.js';
import { initStorageSync }           from './services/storage-sync.js';
import { validateRuntimeMessage }    from './services/message-validator.js';

import { loadTree, initTreeRenderer, saveExpandedState, renderTreeView } from './controllers/tree-controller.js';
import {
  handleSearch,
  clearSearch,
  setupFilterBar,
  populateTopicScopeSelect,
} from './controllers/search-controller.js';
import {
  handleAddTopic,
  handleTopicClick,
  handleTopicContextMenu,
  setupContextMenuActions,
  hideContextMenu,
} from './controllers/topic-actions.js';
import {
  handleChatClick,
  handleChatContextMenu,
  setupChatContextMenuActions,
  hideChatContextMenu,
  handleChatSaved,
} from './controllers/chat-actions.js';
import { handleExportAll, handleImport, handleClearAll } from './controllers/import-export-actions.js';

import { initSaveBanner, setSaveBtnState, handlePanelSave } from './features/save-banner.js';
import { initBackupReminder }  from './features/backup-reminder.js';
import { setupThemePicker, closeThemePicker } from './features/theme-picker.js';
import {
  handleMultiSelectToggle,
  handleAssemble,
  handleExportDigest,
  exitMultiSelectMode,
  handleSelectionChange,
} from './features/multi-select.js';
import { openSettingsPanel }   from './features/settings-panel.js';
import { updateRecentRail }    from './features/recent-rail.js';
import { updateStorageUsage }  from './features/storage-usage.js';

logger.info('Side panel loaded');

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

async function init() {
  logger.info('Initializing bAInder…');

  // Services
  state.storage        = StorageService.getInstance('chrome');
  state.storageTracker = new StorageUsageTracker(state.storage);
  state.dialog         = new DialogManager(elements.modalContainer);
  state.chatRepo       = new ChatRepository(state.storage);
  state.reminderPrefs  = new ReminderPrefsRepository();

  // Load theme
  const savedThemeId = localStorage.getItem('themeId') ?? 'light';
  await loadTheme(savedThemeId).catch(() => {/* default already applied */});

  // Load persisted data
  await loadTree();
  state.chats = await state.chatRepo.loadAll();

  // Dialog helpers (depend on state.tree)
  state.topicDialogs = new TopicDialogs(state.dialog, state.tree);
  state.chatDialogs  = new ChatDialogs(state.dialog, state.tree);
  state.exportDialog = new ExportDialog(state.dialog);
  state.importDialog = new ImportDialog(state.dialog);

  // C.9 — sync sort selector
  if (elements.topicSortSelect) elements.topicSortSelect.value = state.sortMode;

  // Wire all DOM event listeners
  setupEventListeners();

  // Tree renderer (needs chats loaded first)
  initTreeRenderer({
    onTopicClick:       handleTopicClick,
    onTopicContextMenu: handleTopicContextMenu,
    onChatClick:        handleChatClick,
    onChatContextMenu:  handleChatContextMenu,
    onSelectionChange:  handleSelectionChange,
    populateTopicScope: populateTopicScopeSelect,
  });

  // Side features
  updateRecentRail(handleChatClick);
  await updateStorageUsage();
  await initSaveBanner();
  await initBackupReminder();

  // Register cross-tab storage sync — keeps in-memory state fresh when
  // another extension page (second window, background script) modifies storage.
  initStorageSync({
    onTopicTreeChanged: _onExternalTreeChange,
    onChatsChanged:     _onExternalChatsChange,
  });

  logger.info('bAInder initialized');
}

// ---------------------------------------------------------------------------
// External storage-change reload handlers  (called by storage-sync.js)
// ---------------------------------------------------------------------------

/**
 * Reload the topic tree from storage and refresh the UI.
 * Triggered when another extension page writes to the `topicTree` key.
 */
async function _onExternalTreeChange() {
  try {
    logger.info('StorageSync: topic tree changed — reloading');
    await loadTree();
    // Re-sync dialog helpers that hold a reference to the old tree object
    if (state.topicDialogs) state.topicDialogs.tree = state.tree;
    if (state.chatDialogs)  state.chatDialogs.tree  = state.tree;
    if (state.renderer) {
      state.renderer.setTree(state.tree);
      renderTreeView();
    }
    await updateStorageUsage();
  } catch (err) {
    logger.error('[StorageSync] onTopicTreeChanged error:', err);
  }
}

/**
 * Reload the chats array from storage and refresh the UI.
 * Triggered when another extension page writes to the `chats` key.
 */
async function _onExternalChatsChange() {
  try {
    logger.info('StorageSync: chats changed — reloading');
    state.chats = await state.chatRepo.loadAll();
    if (state.renderer) {
      state.renderer.setChatData(state.chats);
      renderTreeView();
    }
    updateRecentRail(handleChatClick);
    await updateStorageUsage();
  } catch (err) {
    logger.error('[StorageSync] onChatsChanged error:', err);
  }
}

// ---------------------------------------------------------------------------
// Event listeners
// ---------------------------------------------------------------------------

function setupEventListeners() {
  // Search
  elements.searchInput.addEventListener('input', handleSearch);
  elements.clearSearchBtn.addEventListener('click', clearSearch);
  setupFilterBar();

  // C.9 — topic sort
  elements.topicSortSelect?.addEventListener('change', () => {
    state.sortMode = elements.topicSortSelect.value;
    localStorage.setItem('topicSortMode', state.sortMode);
    if (state.renderer) state.renderer.setSortMode(state.sortMode);
  });

  // Toolbar: add topic, expand/collapse all
  elements.addTopicBtn.addEventListener('click', handleAddTopic);
  elements.expandAllBtn.addEventListener('click', () => {
    state.renderer?.expandAll();
    saveExpandedState();
  });
  elements.collapseAllBtn.addEventListener('click', () => {
    state.renderer?.collapseAll();
    saveExpandedState();
  });

  // Empty-state "Create first topic" button
  document.getElementById('createFirstTopicBtn')
    ?.addEventListener('click', handleAddTopic);

  // Toolbar: import / export / clear
  elements.importBtn?.addEventListener('click', handleImport);
  elements.exportAllBtn?.addEventListener('click', handleExportAll);
  elements.clearAllBtn?.addEventListener('click', handleClearAll);

  // C.17 — multi-select
  elements.multiSelectToggleBtn?.addEventListener('click', handleMultiSelectToggle);
  elements.assembleBtn?.addEventListener('click', handleAssemble);
  elements.exportDigestBtn?.addEventListener('click', handleExportDigest);
  elements.selectionClearBtn?.addEventListener('click', () => state.renderer?.clearSelection());
  elements.multiSelectCancelBtn?.addEventListener('click', exitMultiSelectMode);

  // Settings
  elements.settingsBtn.addEventListener('click', openSettingsPanel);

  // Theme picker
  setupThemePicker();

  // Context menus: hide on outside click
  document.addEventListener('click', (e) => {
    if (elements.contextMenu && !elements.contextMenu.contains(e.target)) {
      hideContextMenu();
      state.contextMenuTopic = null;
    }
    if (elements.chatContextMenu && !elements.chatContextMenu.contains(e.target)) {
      hideChatContextMenu();
      state.contextMenuChat = null;
    }
    closeThemePicker();
  });

  // Context-menu action handlers
  setupContextMenuActions();
  setupChatContextMenuActions();

  // Tree keyboard navigation (U6): ↑↓ move focus, Enter clicks, Space toggles
  elements.treeView?.addEventListener('keydown', (e) => {
    if (!['ArrowUp', 'ArrowDown', 'Enter', ' '].includes(e.key)) return;
    const focusable = [...elements.treeView.querySelectorAll('.tree-node-content[tabindex="0"]')];
    if (!focusable.length) return;
    const current = document.activeElement?.closest('.tree-node-content');
    const idx     = current ? focusable.indexOf(current) : -1;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      (focusable[idx + 1] ?? focusable[0]).focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      (idx > 0 ? focusable[idx - 1] : focusable[focusable.length - 1]).focus();
    } else if (e.key === 'Enter' && current) {
      e.preventDefault();
      current.click();
    } else if (e.key === ' ' && current) {
      e.preventDefault();
      const li = current.closest('.tree-node[data-topic-id]');
      if (li?.dataset.topicId) {
        state.renderer?.toggleNode(li.dataset.topicId);
        saveExpandedState();
      }
    }
  });

  // Modal backdrop — close on click outside
  elements.modalContainer.addEventListener('click', (e) => {
    if (e.target === elements.modalContainer) state.dialog?.close();
  });

  // U1 — TOC section collapse toggle
  const tocBtn = document.getElementById('tocCollapseBtn');
  if (tocBtn) {
    const tocSection = tocBtn.closest('.toc-section');
    if (localStorage.getItem('toc-collapsed') === '1' && tocSection) {
      tocSection.classList.add('section--collapsed');
      tocBtn.setAttribute('aria-expanded', 'false');
    }
    tocBtn.addEventListener('click', () => {
      const nowCollapsed = tocSection.classList.toggle('section--collapsed');
      tocBtn.setAttribute('aria-expanded', String(!nowCollapsed));
      localStorage.setItem('toc-collapsed', nowCollapsed ? '1' : '0');
    });
  }

  // Save banner button
  elements.saveBtn?.addEventListener('click', async () => {
    if (elements.saveBtn._reloadMode) {
      try {
        const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
        if (tab?.id) await browser.tabs.reload(tab.id);
      } catch (_) { /* ignore */ }
      setSaveBtnState('default');
      if (elements.saveBannerMsg) elements.saveBannerMsg.textContent = 'Reloading…';
    } else {
      handlePanelSave();
    }
  });
}

// ---------------------------------------------------------------------------
// Background message listener
// ---------------------------------------------------------------------------

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const validation = validateRuntimeMessage(message, sender, browser.runtime.id);
  if (!validation.ok) {
    logger.warn('Ignored runtime message:', validation.reason);
    return false;
  }

  if (message.type === 'CHAT_SAVED') {
    handleChatSaved(message.data)
      .then(() => sendResponse({ success: true }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true; // async
  }

  if (message.type === 'SELECT_CHAT') {
    const { chatId } = message;
    const chat = state.chats?.find(c => c.id === chatId);
    if (chat?.topicId && state.renderer) {
      state.renderer.expandNode(chat.topicId);
      renderTreeView();
    }
    // Scroll the chat row into view and briefly highlight it
    setTimeout(() => {
      const node = elements.treeView?.querySelector(`[data-chat-id="${chatId}"]`);
      if (node) {
        node.scrollIntoView({ behavior: 'smooth', block: 'center' });
        node.classList.add('tree-chat-item--flash');
        setTimeout(() => node.classList.remove('tree-chat-item--flash'), TREE_FLASH_MS);
      }
    }, chat?.topicId ? 80 : 0); // brief delay to let render complete
    sendResponse({ success: true });
    return false;
  }
});

// Refresh save banner on tab switch / reload
try {
  browser.tabs.onActivated.addListener(() => initSaveBanner());
  browser.tabs.onUpdated.addListener((_tabId, changeInfo) => {
    if (changeInfo.status === 'complete') initSaveBanner();
  });
} catch (_) { /* non-extension context (tests) */ }

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// Expose for devtools / integration tests
window.bAInder = {
  state,
  tree:         () => state.tree,
  renderer:     () => state.renderer,
  storage:        () => state.storage,
  storageTracker: () => state.storageTracker,
  dialog:         () => state.dialog,
  topicDialogs: () => state.topicDialogs,
  chatDialogs:  () => state.chatDialogs,
  chats:        () => state.chats,
};
