// bAInder Side Panel Script
// Stage 5: Topic Management UI
// Stage 7: Chat management integration

import { TopicTree } from '../lib/tree.js';
import { TreeRenderer } from '../lib/tree-renderer.js';
import { StorageService } from '../lib/storage.js';
import { DialogManager } from '../lib/dialog-manager.js';
import { TopicDialogs } from '../lib/topic-dialogs.js';
import { ChatDialogs } from '../lib/chat-dialogs.js';
import {
  assignChatToTopic,
  moveChatToTopic,
  removeChatFromTopic,
  updateChatInArray,
  removeChatFromArray
} from '../lib/chat-manager.js';
import { isSpecificChatUrl } from '../lib/url-utils.js';

console.log('bAInder Side Panel loaded');

// DOM Elements
const elements = {
  treeView: document.getElementById('treeView'),
  emptyState: document.getElementById('emptyState'),
  searchInput: document.getElementById('searchInput'),
  clearSearchBtn: document.getElementById('clearSearchBtn'),
  searchResults: document.getElementById('searchResults'),
  searchResultsList: document.getElementById('searchResultsList'),
  addTopicBtn: document.getElementById('addTopicBtn'),
  settingsBtn: document.getElementById('settingsBtn'),
  themeToggle: document.getElementById('themeToggle'),
  contextMenu: document.getElementById('contextMenu'),
  chatContextMenu: document.getElementById('chatContextMenu'),
  modalContainer: document.getElementById('modalContainer'),
  itemCount: document.getElementById('itemCount'),
  resultCount: document.getElementById('resultCount'),
  storageUsage: document.getElementById('storageUsage')
};

// Application State
const state = {
  tree: null, // TopicTree instance
  renderer: null, // TreeRenderer instance
  storage: null, // StorageService instance
  dialog: null, // DialogManager instance
  topicDialogs: null, // TopicDialogs instance
  chatDialogs: null, // ChatDialogs instance
  chats: [], // Loaded chat entries
  contextMenuTopic: null, // Currently selected topic for context menu
  contextMenuChat: null, // Currently selected chat for context menu
  searchQuery: '',
  theme: 'light', // 'light', 'dark', or 'auto'
  _toastTimer: null // setTimeout handle for auto-dismissing toast
};

// Initialize the application
async function init() {
  console.log('Initializing bAInder...');
  
  // Initialize storage service
  state.storage = StorageService.getInstance('chrome');
  
  // Initialize dialog manager
  state.dialog = new DialogManager(elements.modalContainer);
  
  // Initialize theme
  await initTheme();
  
  // Set up event listeners
  setupEventListeners();
  
  // Load tree from storage
  await loadTree();

  // Load chats from storage
  await loadChats();
  
  // Initialize topic dialogs (needs tree instance)
  state.topicDialogs = new TopicDialogs(state.dialog, state.tree);

  // Initialize chat dialogs (needs tree instance)
  state.chatDialogs = new ChatDialogs(state.dialog, state.tree);
  
  // Initialize tree renderer
  initTreeRenderer();
  
  // Update storage usage display
  updateStorageUsage();
  
  console.log('bAInder initialized successfully');
}

// Initialize theme system
async function initTheme() {
  try {
    const result = await chrome.storage.local.get('theme');
    state.theme = result.theme || 'light';
    applyTheme(state.theme);
  } catch (error) {
    console.error('Error loading theme:', error);
    applyTheme('light');
  }
}

// Apply theme to document
function applyTheme(theme) {
  const html = document.documentElement;
  const themeIcon = elements.themeToggle?.querySelector('.theme-icon');
  
  if (theme === 'auto') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    html.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
    if (themeIcon) themeIcon.textContent = '🌓';
  } else {
    html.setAttribute('data-theme', theme);
    if (themeIcon) themeIcon.textContent = theme === 'dark' ? '☀️' : '🌙';
  }
  
  state.theme = theme;
}

// Toggle theme
async function toggleTheme() {
  const themes = ['light', 'dark', 'auto'];
  const currentIndex = themes.indexOf(state.theme);
  const nextTheme = themes[(currentIndex + 1) % themes.length];
  
  applyTheme(nextTheme);
  
  try {
    await chrome.storage.local.set({ theme: nextTheme });
    console.log('Theme changed to:', nextTheme);
  } catch (error) {
    console.error('Error saving theme:', error);
  }
}

// Listen for system theme changes when in auto mode
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (state.theme === 'auto') {
    applyTheme('auto');
  }
});

// Set up event listeners
function setupEventListeners() {
  // Search functionality
  elements.searchInput.addEventListener('input', handleSearch);
  elements.clearSearchBtn.addEventListener('click', clearSearch);
  
  // Add topic button
  elements.addTopicBtn.addEventListener('click', handleAddTopic);
  
  // Create first topic button (in empty state)
  const createFirstTopicBtn = document.getElementById('createFirstTopicBtn');
  if (createFirstTopicBtn) {
    createFirstTopicBtn.addEventListener('click', handleAddTopic);
  }
  
  // Settings button
  elements.settingsBtn.addEventListener('click', handleSettings);
  
  // Theme toggle button
  elements.themeToggle.addEventListener('click', toggleTheme);
  
  // Topic context menu - hide when clicking outside
  document.addEventListener('click', (e) => {
    if (elements.contextMenu && !elements.contextMenu.contains(e.target)) {
      hideContextMenu();
      state.contextMenuTopic = null;
    }
    if (elements.chatContextMenu && !elements.chatContextMenu.contains(e.target)) {
      hideChatContextMenu();
      state.contextMenuChat = null;
    }
  });
  
  // Context menu action handlers
  setupContextMenuActions();
  setupChatContextMenuActions();
  
  // Modal container - close when clicking backdrop
  elements.modalContainer.addEventListener('click', (e) => {
    if (e.target === elements.modalContainer) {
      closeModal();
    }
  });
}

// Load data from storage
async function loadData() {
  console.log('loadData is deprecated, use loadTree instead');
}

// Load chats from storage
async function loadChats() {
  try {
    const result = await chrome.storage.local.get(['chats']);
    state.chats = Array.isArray(result.chats) ? result.chats : [];
    console.log(`Loaded ${state.chats.length} chats`);
  } catch (error) {
    console.error('Error loading chats:', error);
    state.chats = [];
  }
}

// Load tree from storage
async function loadTree() {
  try {
    const treeData = await state.storage.loadTopicTree();
    state.tree = TopicTree.fromObject(treeData);
    console.log(`Loaded tree with ${state.tree.getAllTopics().length} topics`);
  } catch (error) {
    console.error('Error loading tree:', error);
    // Initialize empty tree on error
    state.tree = new TopicTree();
  }
}

// Save tree to storage
async function saveTree() {
  try {
    await state.storage.saveTopicTree(state.tree.toObject());
    console.log('Tree saved successfully');
    await updateStorageUsage();
  } catch (error) {
    console.error('Error saving tree:', error);
    showNotification('Error saving changes', 'error');
  }
}

// Initialize tree renderer
function initTreeRenderer() {
  state.renderer = new TreeRenderer(elements.treeView, state.tree);
  
  // Set up topic event handlers
  state.renderer.onTopicClick = handleTopicClick;
  state.renderer.onTopicContextMenu = handleTopicContextMenu;

  // Set up chat event handlers (Stage 7)
  state.renderer.setChatData(state.chats);
  state.renderer.onChatClick = handleChatClick;
  state.renderer.onChatContextMenu = handleChatContextMenu;
  
  // Load expanded state from localStorage (UI preference)
  const savedExpanded = localStorage.getItem('expandedNodes');
  if (savedExpanded) {
    try {
      state.renderer.setExpandedState(JSON.parse(savedExpanded));
    } catch (error) {
      console.error('Error loading expanded state:', error);
    }
  }
  
  // Render the tree
  state.renderer.render();
  state.renderer.updateTopicCount();
}

// Save expanded state to localStorage
function saveExpandedState() {
  if (state.renderer) {
    const expandedIds = state.renderer.getExpandedState();
    localStorage.setItem('expandedNodes', JSON.stringify(expandedIds));
  }
}

// Handle topic click
function handleTopicClick(topic) {
  console.log('Topic clicked:', topic.name);
  // Save expanded state whenever user interacts
  saveExpandedState();
}

// Handle chat click — open in a new/existing tab, with Copilot-specific navigation
async function handleChatClick(chat) {
  console.log('bAInder[sidepanel]: handleChatClick', { url: chat?.url, source: chat?.source, title: chat?.title });
  if (!chat || !chat.url) return;

  // Copilot's SPA has no URL-based deep linking: the browser URL never changes
  // between conversations. Instead we find/open a Copilot tab and send a message
  // to the content script, which clicks the matching sidebar item.
  const isCopilot = chat.source === 'copilot' ||
    (chat.url && (chat.url.includes('m365.cloud.microsoft') ||
                  chat.url.includes('copilot.microsoft.com')));
  console.log('bAInder[sidepanel]: isCopilot =', isCopilot, '| isSpecificChatUrl =', isSpecificChatUrl(chat.url));
  if (isCopilot) {
    await openCopilotChat(chat);
    return;
  }

  // Non-Copilot: skip dedup for generic/non-specific URLs to avoid false positives
  if (isSpecificChatUrl(chat.url)) {
    let existing = [];
    try {
      existing = await chrome.tabs.query({ url: chat.url });
    } catch (_) {
      // tabs.query can fail for non-http(s) URLs (e.g. blob:); treat as no match
    }

    if (existing.length > 0) {
      try {
        await chrome.tabs.update(existing[0].id, { active: true });
        if (chrome.windows) await chrome.windows.update(existing[0].windowId, { focused: true });
      } catch (_) { /* focus attempt failed — still notify */ }
      showNotification('Chat is already open in a tab', 'info');
      return;
    }
  }

  chrome.tabs.create({ url: chat.url });
}

/**
 * Injected into the Copilot tab by chrome.scripting.executeScript.
 * Must NOT reference any outer-scope variables (gets serialised by Chrome).
 * Searches the sidebar for the conversation by ID data-attr then by title text,
 * clicks it, and returns {found, method, debug}.
 *
 * @param {string} conversationId
 * @param {string} title
 */
async function _copilotFindAndClick(conversationId, title) {
  const tag = 'bAInder[inject]';

  // ── Inner: attempt match via all three strategies + expand check ──────────
  // Returns a result object if actionable (found or expanded), or null to keep waiting.
  function attemptMatch() {
    // Pre-step: click "Show all" / "View all" if present so older chats render
    const expandSelectors = [
      '[class*="navItem"] button',
      '[class*="NavItem"] button',
      '[class*="showAll"]', '[class*="ShowAll"]',
      '[class*="viewAll"]', '[class*="ViewAll"]',
      '[class*="seeAll"]',  '[class*="SeeAll"]',
    ];
    for (const sel of expandSelectors) {
      try {
        for (const btn of document.querySelectorAll(sel)) {
          const txt = btn.textContent.trim().toLowerCase();
          if (txt === 'show all' || txt === 'view all' || txt === 'see all' ||
              txt === 'show all chats' || txt === 'view all chats' ||
              txt.startsWith('show all') || txt.startsWith('view all')) {
            console.log(tag, 'Clicking expand button:', btn.textContent.trim());
            btn.click();
            return { found: false, expanded: true };
          }
        }
      } catch (_) {}
    }

    // ── Strategy 1: React fiber props (rename-safe) ──────────────────────────
    function getFiberConversationId(el) {
      try {
        const fiberKey = Object.keys(el).find(k => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'));
        if (!fiberKey) return null;
        let fiber = el[fiberKey];
        let depth = 0;
        while (fiber && depth++ < 30) {
          const props = fiber.memoizedProps || fiber.pendingProps;
          if (props) {
            const id = props.conversationId || props.threadId || props.entityId ||
                       props.itemKey || props.chatId ||
                       props.item?.conversationId || props.item?.threadId ||
                       props.data?.conversationId || props.data?.threadId;
            if (id && typeof id === 'string') return id;
          }
          fiber = fiber.return;
        }
      } catch (_) {}
      return null;
    }

    const navItemEls = document.querySelectorAll('[class*="navItem"], [class*="NavItem"], [class*="ChatItem"], [class*="chatItem"], [class*="threadItem"], [class*="ThreadItem"]');
    for (const el of navItemEls) {
      const id = getFiberConversationId(el);
      if (id && id.toLowerCase() === conversationId.toLowerCase()) {
        console.log(tag, 'Strategy 1 HIT via React fiber');
        el.click();
        return { found: true, method: 'react-fiber' };
      }
    }

    // ── Strategy 2: data-attribute match ────────────────────────────────────
    const idAttrs = [
      'data-conversation-id', 'data-conversationid',
      'data-entity-id',       'data-entityid',
      'data-thread-id',       'data-threadid',
      'data-item-key',        'data-id', 'data-key', 'data-chat-id',
    ];
    for (const attr of idAttrs) {
      try {
        const el = document.querySelector(`[${attr}="${CSS.escape(conversationId)}"]`) ||
                   document.querySelector(`[${attr}*="${conversationId}"]`);
        if (el) {
          console.log(tag, 'Strategy 2 HIT', attr);
          el.click();
          return { found: true, method: attr };
        }
      } catch (_) {}
    }

    // ── Strategy 3: title text match (last resort) ──────────────────────────
    if (title) {
      const cleanTitle = title.replace(/^you said:\s*/i, '').replace(/^i said:\s*/i, '').trim();
      const probe = cleanTitle.slice(0, 30).toLowerCase().trim();
      const sidebarSelectors = [
        '[class*="navItem"]', '[class*="NavItem"]',
        '[class*="chatItem"]', '[class*="ChatItem"]',
        '[class*="threadItem"]', '[class*="ThreadItem"]',
        '[class*="historyItem"]', '[class*="HistoryItem"]',
        '[class*="conversationItem"]', '[class*="ConversationItem"]',
      ];
      if (probe) {
        for (const sel of sidebarSelectors) {
          try {
            for (const item of document.querySelectorAll(sel)) {
              const txt = item.textContent.toLowerCase().trim();
              if (txt.startsWith(probe) || txt.includes(probe)) {
                console.log(tag, 'Strategy 3 HIT (title)', sel);
                item.click();
                return { found: true, method: 'title:' + sel };
              }
            }
          } catch (_) {}
        }
      }
    }

    return null; // nothing actionable yet
  } // end attemptMatch

  // ── Try immediately first ──────────────────────────────────────────────────
  const immediate = attemptMatch();
  if (immediate) return immediate;

  // ── Wait up to 2 s for DOM changes (sidebar lazy-renders) ─────────────────
  // MutationObserver fires the moment a matching item appears, so the caller
  // gets a result as soon as the sidebar has loaded — no fixed polling needed.
  return new Promise(resolve => {
    const timer = setTimeout(() => {
      obs.disconnect();
      console.log(tag, 'MutationObserver timed out — no match in 2 s');
      resolve({ found: false });
    }, 2000);

    const obs = new MutationObserver(() => {
      const r = attemptMatch();
      if (r) {
        clearTimeout(timer);
        obs.disconnect();
        resolve(r);
      }
    });

    // Observe the nearest sidebar ancestor; fall back to body
    const root = document.querySelector('[class*="nav"]') ||
                 document.querySelector('nav') ||
                 document.querySelector('[class*="sidebar"]') ||
                 document.body;
    obs.observe(root, { childList: true, subtree: true });
  });
}

// Find or open a Copilot tab and navigate to the correct conversation.
//
// M365 does not honour ?conversationId= as a deep-link on initial page load —
// it always renders the history view on first load. The reliable path is:
//   1. Navigate the tab to the conversation URL (keeps auth cookies live and
//      sets the URL so the SPA "knows" which conversation is contextual).
//   2. Wait for the page to become idle, then use executeScript to find the
//      matching item in the left-sidebar history list and click it — exactly
//      what the user would do manually, but automated.
async function openCopilotChat(chat) {
  let conversationId = null;
  try {
    const u = new URL(chat.url);
    conversationId = u.searchParams.get('conversationId') ||
                     u.searchParams.get('entityid')       ||
                     u.searchParams.get('ThreadId')       ||
                     u.searchParams.get('chatId');
  } catch (_) {}

  const targetUrl = conversationId
    ? `https://m365.cloud.microsoft/chat?conversationId=${encodeURIComponent(conversationId)}`
    : 'https://m365.cloud.microsoft/chat';

  // Reuse an existing Copilot tab if one is open, otherwise open a new one
  let tab = null;
  let isNewTab = false;
  try {
    const tabs = await chrome.tabs.query({
      url: ['https://m365.cloud.microsoft/*', 'https://copilot.microsoft.com/*']
    });
    if (tabs.length > 0) {
      tab = tabs[0];
      await chrome.tabs.update(tab.id, { active: true, url: targetUrl });
      if (chrome.windows) await chrome.windows.update(tab.windowId, { focused: true });
    }
  } catch (_) {}

  if (!tab) {
    isNewTab = true;
    tab = await chrome.tabs.create({ url: targetUrl });
  }

  if (!conversationId) {
    showNotification('Copilot opened — select the conversation manually', 'info');
    return;
  }

  // Show a persistent loading indicator while we wait for Copilot to render
  showNotification('Opening Copilot conversation…', 'loading');

  // After the tab finishes loading (including the M365 auth redirect), use
  // executeScript to click the matching sidebar history item.
  //
  // Each call to _copilotFindAndClick internally waits up to 2 s for DOM
  // changes via MutationObserver, so retryMs is just a safety-net gap between
  // attempts rather than the primary wait mechanism.
  const runWhenReady = (tabId) => {
    const maxAttempts   = 6;
    const retryMs       = 400;  // safety-net gap; real waiting is inside _copilotFindAndClick
    const expandRetryMs = 800;  // after "Show all" click, give the list a moment to render
    const initialDelay  = isNewTab ? 3000 : 1500;
    let attempt = 0;

    const tryClick = async () => {
      attempt++;
      try {
        const results = await chrome.scripting.executeScript({
          target: { tabId },
          func: _copilotFindAndClick,
          args: [conversationId, chat.title || '']
        });
        const res = results?.[0]?.result;
        if (res?.found) {
          showNotification('Conversation opened', 'success');
          return;
        }
        // "Show all" was clicked — give the list a moment to render, then retry
        if (res?.expanded) {
          if (attempt < maxAttempts) setTimeout(tryClick, expandRetryMs);
          else showNotification('Conversation not found in sidebar — it may be too old. Try searching in Copilot.', 'info');
          return;
        }
      } catch (_) {}
      if (attempt < maxAttempts) {
        setTimeout(tryClick, retryMs);
      } else {
        showNotification('Conversation not found in sidebar — it may be too old. Try searching in Copilot.', 'info');
      }
    };

    setTimeout(tryClick, initialDelay);
  };

  if (tab.status === 'complete' && !isNewTab) {
    runWhenReady(tab.id);
  } else {
    const onUpdated = (tabId, changeInfo) => {
      if (tabId === tab.id && changeInfo.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(onUpdated);
        runWhenReady(tabId);
      }
    };
    chrome.tabs.onUpdated.addListener(onUpdated);
  }
}

// Handle chat context menu
function handleChatContextMenu(chat, event) {
  event.preventDefault();
  state.contextMenuChat = chat;
  console.log('Chat context menu opened for:', chat.title);
  showChatContextMenu(event.clientX, event.clientY);
}

// Handle incoming CHAT_SAVED message from background
async function handleChatSaved(chatEntry) {
  // Add to in-memory list
  state.chats = [...state.chats, chatEntry];
  state.renderer.setChatData(state.chats);

  // Prompt user to assign the new chat to a topic
  const result = await state.chatDialogs.showAssignChat(chatEntry);
  if (!result) return;

  const updatedChat = assignChatToTopic(chatEntry, result.topicId, state.tree);
  if (result.title && result.title !== chatEntry.title) {
    updatedChat.title = result.title;
  }
  state.chats = updateChatInArray(chatEntry.id, updatedChat, state.chats);
  await chrome.storage.local.set({ chats: state.chats });
  await saveTree();
  state.renderer.setChatData(state.chats);
  renderTreeView();
  state.renderer.expandToTopic(result.topicId);
}

// Render the tree view
function renderTreeView() {
  if (state.renderer) {
    state.renderer.render();
    state.renderer.updateTopicCount();
  }
}

// Handle search input
function handleSearch(event) {
  const query = event.target.value.trim();
  state.searchQuery = query;
  
  // Show/hide clear button
  elements.clearSearchBtn.style.display = query ? 'block' : 'none';
  
  if (query) {
    // Highlight matching topics in tree
    if (state.renderer) {
      state.renderer.highlightSearch(query);
      // Expand all to show matches
      state.renderer.expandAll();
      saveExpandedState();
    }
    // TODO: Full search functionality in Stage 8
  } else {
    if (state.renderer) {
      state.renderer.clearHighlight();
    }
    hideSearchResults();
  }
}

// Clear search
function clearSearch() {
  elements.searchInput.value = '';
  state.searchQuery = '';
  elements.clearSearchBtn.style.display = 'none';
  if (state.renderer) {
    state.renderer.clearHighlight();
  }
  hideSearchResults();
}

// Perform search (placeholder for Stage 8)
function performSearch(query) {
  console.log('Searching for:', query);
  // TODO: Implement search functionality in Stage 8
  elements.searchResults.style.display = 'block';
  elements.resultCount.textContent = '0 results';
  elements.searchResultsList.innerHTML = '<div style="padding: 16px; color: var(--text-secondary);">Search functionality coming in Stage 8</div>';
}

// Hide search results
function hideSearchResults() {
  elements.searchResults.style.display = 'none';
  elements.searchResultsList.innerHTML = '';
}

// Handle add topic button
async function handleAddTopic() {
  const result = await state.topicDialogs.showAddTopic();
  
  if (result) {
    console.log('Topic created:', result.name);
    await saveTree();
    renderTreeView();
    
    // Expand parent if needed
    if (result.parentId) {
      state.renderer.expandToTopic(result.topicId);
    }
    
    // Select new topic
    state.renderer.selectNode(result.topicId);
    saveExpandedState();
  }
}

// Handle topic context menu
async function handleTopicContextMenu(topic, event) {
  state.contextMenuTopic = topic;
  console.log('Context menu opened for topic:', topic.name);
  showContextMenu(event.clientX, event.clientY);
}

// Setup context menu action handlers
function setupContextMenuActions() {
  const actions = {
    rename: handleRenameTopic,
    move: handleMoveTopic,
    merge: handleMergeTopic,
    delete: handleDeleteTopic
  };
  
  elements.contextMenu.querySelectorAll('[data-action]').forEach(item => {
    item.addEventListener('click', async (e) => {
      e.stopPropagation();
      const action = item.dataset.action;
      
      // Store topic reference before hiding menu
      const topic = state.contextMenuTopic;
      console.log('Context menu action clicked:', action, 'for topic:', topic?.name);
      hideContextMenu();
      
      if (topic && actions[action]) {
        state.contextMenuTopic = topic;
        await actions[action]();
        state.contextMenuTopic = null;
      } else if (!topic) {
        console.warn('No topic selected for action:', action);
      } else if (!actions[action]) {
        console.warn('Unknown action:', action);
      }
    });
  });
}

// Setup chat context menu action handlers (Stage 7)
function setupChatContextMenuActions() {
  if (!elements.chatContextMenu) return;

  const actions = {
    open:   handleOpenChatAction,
    rename: handleRenameChatAction,
    move:   handleMoveChatAction,
    delete: handleDeleteChatAction
  };

  elements.chatContextMenu.querySelectorAll('[data-chat-action]').forEach(item => {
    item.addEventListener('click', async (e) => {
      e.stopPropagation();
      const action = item.dataset.chatAction;
      const chat = state.contextMenuChat;
      console.log('Chat context menu action clicked:', action, 'for chat:', chat?.title);
      hideChatContextMenu();

      if (chat && actions[action]) {
        state.contextMenuChat = chat;
        await actions[action]();
        state.contextMenuChat = null;
      } else if (!chat) {
        console.warn('No chat selected for action:', action);
      } else if (!actions[action]) {
        console.warn('Unknown chat action:', action);
      }
    });
  });
}

// Handle "Open" chat action
function handleOpenChatAction() {
  if (state.contextMenuChat) {
    handleChatClick(state.contextMenuChat);
  }
}

// Handle "Rename" chat action
async function handleRenameChatAction() {
  if (!state.contextMenuChat) return;
  const result = await state.chatDialogs.showRenameChat(state.contextMenuChat);
  if (!result) return;

  state.chats = updateChatInArray(state.contextMenuChat.id, { title: result.title }, state.chats);
  await chrome.storage.local.set({ chats: state.chats });
  state.renderer.setChatData(state.chats);
  renderTreeView();
}

// Handle "Move" chat action
async function handleMoveChatAction() {
  if (!state.contextMenuChat) return;
  const result = await state.chatDialogs.showMoveChat(state.contextMenuChat);
  if (!result) return;

  const movedChat = moveChatToTopic(state.contextMenuChat, result.topicId, state.tree);
  state.chats = updateChatInArray(state.contextMenuChat.id, movedChat, state.chats);
  await chrome.storage.local.set({ chats: state.chats });
  await saveTree();
  state.renderer.setChatData(state.chats);
  renderTreeView();
  state.renderer.expandToTopic(result.topicId);
  saveExpandedState();
}

// Handle "Delete" chat action
async function handleDeleteChatAction() {
  if (!state.contextMenuChat) return;
  const result = await state.chatDialogs.showDeleteChat(state.contextMenuChat);
  if (!result) return;

  const chat = state.contextMenuChat;
  if (chat.topicId) {
    removeChatFromTopic(chat.id, chat.topicId, state.tree);
    await saveTree();
  }
  state.chats = removeChatFromArray(chat.id, state.chats);
  await chrome.storage.local.set({ chats: state.chats });
  state.renderer.setChatData(state.chats);
  renderTreeView();
}

// Handle rename topic
async function handleRenameTopic() {
  if (!state.contextMenuTopic) return;
  
  const result = await state.topicDialogs.showRenameTopic(state.contextMenuTopic.id);
  
  if (result) {
    console.log('Topic renamed:', result.oldName, '->', result.newName);
    await saveTree();
    renderTreeView();
    state.renderer.selectNode(result.topicId);
  }
}

// Handle move topic
async function handleMoveTopic() {
  if (!state.contextMenuTopic) return;
  
  const result = await state.topicDialogs.showMoveTopic(state.contextMenuTopic.id);
  
  if (result) {
    console.log('Topic moved:', result);
    await saveTree();
    renderTreeView();
    
    // Expand to show moved topic
    state.renderer.expandToTopic(result.topicId);
    state.renderer.selectNode(result.topicId);
    saveExpandedState();
  }
}

// Handle delete topic
async function handleDeleteTopic() {
  if (!state.contextMenuTopic) return;
  
  const result = await state.topicDialogs.showDeleteTopic(state.contextMenuTopic.id);
  
  if (result) {
    console.log('Topic deleted:', result.name);
    await saveTree();
    renderTreeView();
    
    // TODO: Handle chat deletion (Stage 6)
    if (result.deletedChatCount > 0) {
      console.log(`Note: ${result.deletedChatCount} chats were unassigned`);
    }
  }
}

// Handle merge topic
async function handleMergeTopic() {
  if (!state.contextMenuTopic) return;
  
  const result = await state.topicDialogs.showMergeTopic(state.contextMenuTopic.id);
  
  if (result) {
    console.log('Topics merged:', result);
    await saveTree();
    renderTreeView();
    
    // Select target topic
    state.renderer.expandToTopic(result.targetTopicId);
    state.renderer.selectNode(result.targetTopicId);
    saveExpandedState();
  }
}

// Handle settings button
function handleSettings() {
  console.log('Settings clicked');
  // TODO: Implement settings in Stage 10
  showNotification('Settings coming in Stage 10');
}

// Show chat context menu
function showChatContextMenu(x, y) {
  if (!elements.chatContextMenu) return;
  elements.chatContextMenu.style.left = `${x}px`;
  elements.chatContextMenu.style.top = `${y}px`;
  elements.chatContextMenu.style.display = 'block';

  setTimeout(() => {
    const rect = elements.chatContextMenu.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
      elements.chatContextMenu.style.left = `${window.innerWidth - rect.width - 10}px`;
    }
    if (rect.bottom > window.innerHeight) {
      elements.chatContextMenu.style.top = `${window.innerHeight - rect.height - 10}px`;
    }
  }, 0);
}

// Hide chat context menu
function hideChatContextMenu() {
  if (elements.chatContextMenu) {
    elements.chatContextMenu.style.display = 'none';
  }
}

// Show context menu
function showContextMenu(x, y) {
  // Position context menu
  elements.contextMenu.style.left = `${x}px`;
  elements.contextMenu.style.top = `${y}px`;
  elements.contextMenu.style.display = 'block';
  
  // Adjust if menu goes off screen
  setTimeout(() => {
    const rect = elements.contextMenu.getBoundingClientRect();
    
    if (rect.right > window.innerWidth) {
      elements.contextMenu.style.left = `${window.innerWidth - rect.width - 10}px`;
    }
    
    if (rect.bottom > window.innerHeight) {
      elements.contextMenu.style.top = `${window.innerHeight - rect.height - 10}px`;
    }
  }, 0);
}

// Hide context menu
function hideContextMenu() {
  elements.contextMenu.style.display = 'none';
  // Note: state.contextMenuTopic is NOT cleared here
  // It will be cleared after the action completes in setupContextMenuActions
}

// Show modal (deprecated - use DialogManager)
function showModal(content) {
  console.warn('showModal is deprecated, use DialogManager instead');
}

// Close modal (deprecated - use DialogManager)
function closeModal() {
  if (state.dialog) {
    state.dialog.close();
  }
}

// Update storage usage display
async function updateStorageUsage() {
  try {
    const usage = await chrome.storage.local.getBytesInUse();
    const usageMB = (usage / (1024 * 1024)).toFixed(2);
    const usageKB = (usage / 1024).toFixed(1);
    
    // Show KB for small values, MB for larger
    if (usage < 1024 * 1024) {
      elements.storageUsage.textContent = `${usageKB} KB`;
    } else {
      elements.storageUsage.textContent = `${usageMB} MB`;
    }
  } catch (error) {
    console.error('Error getting storage usage:', error);
    elements.storageUsage.textContent = 'Unknown';
  }
}

// Show notification as a toast.
// Pass type='loading' for a persistent spinner toast that stays until replaced.
function showNotification(message, type = 'info') {
  console.log(`[${type.toUpperCase()}] ${message}`);
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.className = `toast toast--${type} toast--visible`;
  clearTimeout(state._toastTimer);
  if (type !== 'loading') {
    state._toastTimer = setTimeout(() => {
      toast.className = 'toast';
    }, 3000);
  }
}

// Listen for messages from the background service worker (e.g. CHAT_SAVED)
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'CHAT_SAVED') {
    handleChatSaved(message.data)
      .then(() => sendResponse({ success: true }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true; // async
  }
});

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// Export for use in other modules (future stages)
window.bAInder = {
  state,
  tree: () => state.tree,
  renderer: () => state.renderer,
  storage: () => state.storage,
  dialog: () => state.dialog,
  topicDialogs: () => state.topicDialogs,
  chatDialogs: () => state.chatDialogs,
  chats: () => state.chats,
  loadTree,
  loadChats,
  saveTree,
  renderTreeView,
  showNotification,
  saveExpandedState,
  isSpecificChatUrl,
  openCopilotChat
};
