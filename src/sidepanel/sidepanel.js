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
import { extractSnippet, highlightTerms, formatBreadcrumb, escapeHtml } from '../lib/search-utils.js';
import { getTagColor } from '../lib/tree-renderer.js';
import { ExportDialog } from '../lib/export-dialog.js';
import { ImportDialog } from '../lib/import-dialog.js';
import { loadThemeFile, validateTheme, applyCustomTheme, mergeWithDefaults } from '../lib/theme-sdk.js';
import browser from 'webextension-polyfill';

/**
 * bAInder's complete baseline variable map.
 * When a custom theme is loaded, mergeWithDefaults() uses these values for any
 * variable the theme file doesn't define — so new variables added to bAInder's
 * CSS always have a sensible fallback even with older theme files.
 *
 * Values mirror the built-in "light" theme.  Update here whenever a new
 * CSS custom property is introduced in bAInder's stylesheets.
 */
const BINDER_VARIABLE_DEFAULTS = {
  '--primary':          '#6366f1',
  '--primary-hover':    '#4f46e5',
  '--primary-light':    '#e0e7ff',
  '--primary-dark':     '#3730a3',
  '--header-bg':        'linear-gradient(135deg, #eef0ff 0%, #ffffff 55%)',
  '--header-accent':    '#6366f1',
  '--bg-primary':       '#ffffff',
  '--bg-secondary':     '#f8fafc',
  '--bg-tertiary':      '#f1f5f9',
  '--bg-elevated':      '#ffffff',
  '--bg-hover':         '#f1f5f9',
  '--bg-active':        '#e2e8f0',
  '--border-primary':   '#e2e8f0',
  '--border-secondary': '#cbd5e1',
  '--border-focus':     '#6366f1',
  '--text-primary':     '#0f172a',
  '--text-secondary':   '#475569',
  '--text-tertiary':    '#94a3b8',
  '--text-inverse':     '#ffffff',
  '--success':          '#10b981',
  '--success-bg':       '#d1fae5',
  '--warning':          '#f59e0b',
  '--warning-bg':       '#fef3c7',
  '--danger':           '#ef4444',
  '--danger-bg':        '#fee2e2',
  '--info':             '#3b82f6',
  '--info-bg':          '#dbeafe',
  '--shadow-sm':        '0 1px 2px 0 rgba(0,0,0,0.05)',
  '--shadow-md':        '0 4px 6px -1px rgba(0,0,0,0.1)',
  '--shadow-lg':        '0 10px 15px -3px rgba(0,0,0,0.1)',
  '--shadow-xl':        '0 20px 25px -5px rgba(0,0,0,0.1)',
  '--overlay':          'rgba(15,23,42,0.5)',
  '--overlay-light':    'rgba(15,23,42,0.1)',
  '--dot-chatgpt':      '#10b981',
  '--dot-claude':       '#f97316',
  '--dot-gemini':       '#3b82f6',
  '--dot-copilot':      '#8b5cf6',
  '--font-sans':        "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
  '--radius-xs':        '2px',
  '--radius-sm':        '4px',
  '--radius-md':        '6px',
  '--radius-lg':        '8px',
  '--radius-xl':        '12px',
  '--radius-full':      '9999px',
};

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
  importBtn: document.getElementById('importBtn'),
  exportAllBtn: document.getElementById('exportAllBtn'),
  clearAllBtn: document.getElementById('clearAllBtn'),
  settingsBtn: document.getElementById('settingsBtn'),
  themeToggle: document.getElementById('themeToggle'),
  contextMenu: document.getElementById('contextMenu'),
  chatContextMenu: document.getElementById('chatContextMenu'),
  modalContainer: document.getElementById('modalContainer'),
  itemCount: document.getElementById('itemCount'),
  expandAllBtn: document.getElementById('expandAllBtn'),
  collapseAllBtn: document.getElementById('collapseAllBtn'),
  resultCount: document.getElementById('resultCount'),
  storageUsage: document.getElementById('storageUsage'),
  saveBanner:   document.getElementById('saveBanner'),
  saveBtn:      document.getElementById('saveChatBtn'),
  saveBannerMsg:document.getElementById('saveBannerMsg')
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
  theme: 'light', // 'light', 'dark', 'oled', 'auto', or radical theme name
  skin: 'sharp',   // '' | 'sharp' | 'rounded' | 'outlined' | 'elevated'
  accent: '',      // '' | 'rose' | 'teal' | 'amber'
  _toastTimer: null, // setTimeout handle for auto-dismissing toast
  exportDialog: null, // ExportDialog instance (Stage 9)
  importDialog: null  // ImportDialog instance (Stage 9)
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

  // Initialize control skin
  await initSkin();

  // Initialize accent colour
  await initAccent();

  // Set up event listeners
  setupEventListeners();
  
  // Load tree from storage
  await loadTree();

  // Load chats from storage
  await loadChats();

  // Populate recently-saved rail (U4)
  updateRecentRail();

  // Initialize topic dialogs (needs tree instance)
  state.topicDialogs = new TopicDialogs(state.dialog, state.tree);

  // Initialize chat dialogs (needs tree instance)
  state.chatDialogs = new ChatDialogs(state.dialog, state.tree);

  // Initialize export/import dialogs (Stage 9)
  state.exportDialog = new ExportDialog(state.dialog);
  state.importDialog = new ImportDialog(state.dialog);
  
  // Initialize tree renderer
  initTreeRenderer();
  
  // Update storage usage display
  updateStorageUsage();

  // Detect current tab and show Save banner when on a supported AI chat page
  await initSaveBanner();

  console.log('bAInder initialized successfully');
}

// Initialize theme system
async function initTheme() {
  try {
    const result = await browser.storage.local.get(['theme', 'customTheme']);
    const savedTheme = result.theme || 'light';

    if (savedTheme === 'custom' && result.customTheme) {
      applyCustomTheme(mergeWithDefaults(result.customTheme, BINDER_VARIABLE_DEFAULTS));
      state.theme = 'custom';
    } else {
      state.theme = savedTheme;
      applyTheme(state.theme);
    }
  } catch (error) {
    console.error('Error loading theme:', error);
    applyTheme('light');
  }
}

// Load a custom theme from a .json File object
async function handleLoadTheme(file) {
  try {
    const json = await loadThemeFile(file);
    const error = validateTheme(json);
    if (error) {
      await state.dialog.alert(error, 'Invalid Theme File');
      return;
    }
    applyCustomTheme(mergeWithDefaults(json, BINDER_VARIABLE_DEFAULTS));
    state.theme = 'custom';
    await browser.storage.local.set({ theme: 'custom', customTheme: json });

    // Reflect in the settings selector
    const sel = document.getElementById('settingsThemeSelect');
    if (sel) sel.value = 'custom';

    showToast(`Theme "${json.name}" loaded`, 'success');
  } catch (err) {
    console.error('Load theme error:', err);
    await state.dialog.alert(err.message, 'Load Theme Error');
  }
}

// Apply theme to document
function applyTheme(theme) {
  const html = document.documentElement;
  // Clear any inline CSS variables injected by a previous custom theme
  html.style.cssText = '';
  const themeIcon = elements.themeToggle?.querySelector('.theme-icon');

  // OLED: dark theme vars + black-surface override attribute
  if (theme === 'oled') {
    html.setAttribute('data-theme', 'dark');
    html.setAttribute('data-oled', '');
  } else {
    html.removeAttribute('data-oled');
  }

  if (theme === 'auto') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    html.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
    if (themeIcon) themeIcon.textContent = '🌓';
  } else if (theme !== 'oled') {
    html.setAttribute('data-theme', theme);
    const themeIcons = { dark: '☀️', oled: '🕶️', terminal: '🖥️', retro: '🕹️', glass: '🪟', neon: '💡', nord: '🏔️', solarized: '☀️', forest: '🌲' };
    if (themeIcon) themeIcon.textContent = themeIcons[theme] ?? '🌙';
  } else {
    // oled branch — data-theme already set to 'dark' above
    if (themeIcon) themeIcon.textContent = '🕶️';
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
    await browser.storage.local.set({ theme: nextTheme });
    console.log('Theme changed to:', nextTheme);
  } catch (error) {
    console.error('Error saving theme:', error);
  }
}

// ── Control skin ────────────────────────────────────────────────────────────

async function initSkin() {
  try {
    const result = await browser.storage.local.get('skin');
    state.skin = result.skin || 'sharp';
    applySkin(state.skin);
  } catch (_) {
    applySkin('');
  }
}

function applySkin(skin) {
  const html = document.documentElement;
  if (skin) {
    html.setAttribute('data-skin', skin);
  } else {
    html.removeAttribute('data-skin');
  }
  state.skin = skin;
}

// ── Accent colour ────────────────────────────────────────────────────────────

async function initAccent() {
  try {
    const result = await browser.storage.local.get('accent');
    state.accent = result.accent || '';
    applyAccent(state.accent);
  } catch (_) {
    applyAccent('');
  }
}

function applyAccent(accent) {
  const html = document.documentElement;
  if (accent) {
    html.setAttribute('data-accent', accent);
  } else {
    html.removeAttribute('data-accent');
  }
  state.accent = accent;
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

  // Expand / Collapse all buttons
  elements.expandAllBtn.addEventListener('click', () => {
    state.renderer?.expandAll();
    saveExpandedState();
  });
  elements.collapseAllBtn.addEventListener('click', () => {
    state.renderer?.collapseAll();
    saveExpandedState();
  });
  
  // Create first topic button (in empty state)
  const createFirstTopicBtn = document.getElementById('createFirstTopicBtn');
  if (createFirstTopicBtn) {
    createFirstTopicBtn.addEventListener('click', handleAddTopic);
  }
  
  // Import button (Stage 9)
  if (elements.importBtn) {
    elements.importBtn.addEventListener('click', handleImport);
  }

  // Export entire tree button (Stage 9)
  if (elements.exportAllBtn) {
    elements.exportAllBtn.addEventListener('click', handleExportAll);
  }

  // Clear all button
  if (elements.clearAllBtn) {
    elements.clearAllBtn.addEventListener('click', handleClearAll);
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

  // Tree keyboard navigation: ↑/↓ move focus, Enter clicks, Space toggles (U6)
  if (elements.treeView) {
    elements.treeView.addEventListener('keydown', (e) => {
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
  }

  // Modal container - close when clicking backdrop
  elements.modalContainer.addEventListener('click', (e) => {
    if (e.target === elements.modalContainer) {
      closeModal();
    }
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

  // Save to bAInder button (in banner above footer)
  if (elements.saveBtn) {
    elements.saveBtn.addEventListener('click', async () => {
      if (elements.saveBtn._reloadMode) {
        // Content script not yet injected — reload the active tab to fix that
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
}

// Load data from storage
async function loadData() {
  console.log('loadData is deprecated, use loadTree instead');
}

// Load chats from storage
async function loadChats() {
  try {
    const result = await browser.storage.local.get(['chats']);
    state.chats = Array.isArray(result.chats) ? result.chats : [];
    console.log(`Loaded ${state.chats.length} chats`);
  } catch (error) {
    console.error('Error loading chats:', error);
    state.chats = [];
  }
}

// U4 — populate the “Recently saved” horizontal chip rail
function updateRecentRail() {
  const rail = document.getElementById('recentRail');
  if (!rail) return;

  const sorted = [...state.chats]
    .filter(c => c.savedAt || c.timestamp)
    .sort((a, b) => ((b.savedAt || b.timestamp) || 0) - ((a.savedAt || a.timestamp) || 0))
    .slice(0, 8); // fetch up to 8 candidates; we'll trim to what actually fits

  if (sorted.length < 3) {
    rail.style.display = 'none';
    return;
  }

  // Build DOM from scratch
  rail.innerHTML = '';
  rail.style.display = 'flex';

  const label = document.createElement('span');
  label.className = 'recent-rail__label';
  label.textContent = 'Recent';
  rail.appendChild(label);

  // Add chips one by one; stop as soon as one causes overflow (preserves order)
  for (const c of sorted) {
    const src = c.source || 'unknown';

    const chip = document.createElement('button');
    chip.className = 'recent-chip';
    chip.title = c.title || 'Untitled';

    const dot = document.createElement('span');
    dot.className = `recent-chip__dot recent-chip__dot--${src}`;

    const titleEl = document.createElement('span');
    titleEl.className = 'recent-chip__title';
    titleEl.textContent = c.title || 'Untitled';

    chip.appendChild(dot);
    chip.appendChild(titleEl);
    chip.addEventListener('click', () => handleChatClick(c));
    rail.appendChild(chip);

    // If this chip pushed content beyond the visible width, remove it and stop
    if (rail.scrollWidth > rail.clientWidth) {
      rail.removeChild(chip);
      break;
    }
  }

  // If only the label fits (no chips), hide the rail entirely
  if (rail.children.length <= 1) {
    rail.style.display = 'none';
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

  // Show skeleton while data settles
  showTreeSkeleton();

  // Set up topic event handlers
  state.renderer.onTopicClick = handleTopicClick;
  state.renderer.onTopicContextMenu = handleTopicContextMenu;

  // Set up chat event handlers (Stage 7)
  state.renderer.setChatData(state.chats);
  state.renderer.onChatClick = handleChatClick;
  state.renderer.onChatContextMenu = handleChatContextMenu;

  // Set up drag-and-drop handlers
  state.renderer.onTopicDrop = handleTopicDrop;
  state.renderer.onChatDrop  = handleChatDrop;

  // Set up pin/star handler (U2)
  state.renderer.onTopicPin = handleTopicPin;

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
  removeTreeSkeleton();
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

// Handle chat click — open saved content in the built-in reader
async function handleChatClick(chat) {
  if (!chat || !chat.id) return;

  const readerUrl = browser.runtime.getURL(
    `src/reader/reader.html?chatId=${encodeURIComponent(chat.id)}`
  );
  browser.tabs.create({ url: readerUrl });
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
  if (result.tags !== undefined) {
    updatedChat.tags = result.tags;
  }
  state.chats = updateChatInArray(chatEntry.id, updatedChat, state.chats);
  await browser.storage.local.set({ chats: state.chats });
  await saveTree();
  state.renderer.setChatData(state.chats);
  renderTreeView();
  state.renderer.expandToTopic(result.topicId);

  // A1 — flash pop on the newly added chat node
  requestAnimationFrame(() => {
    const li = elements.treeView?.querySelector(`li[data-chat-id="${updatedChat.id}"]`);
    if (li) {
      li.classList.add('tree-node--pop');
      li.addEventListener('animationend', () => li.classList.remove('tree-node--pop'), { once: true });
    }
  });

  // U4 — refresh the recent rail
  updateRecentRail();
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

  // A5 — show shimmer while keystrokes are in-flight
  const searchContainer = elements.searchInput?.closest('.search-container');
  if (query) {
    searchContainer?.classList.add('is-typing');
  } else {
    searchContainer?.classList.remove('is-typing');
  }

  if (query) {
    // Highlight matching topics in tree
    if (state.renderer) {
      state.renderer.highlightSearch(query);
      // Expand all to show matches
      state.renderer.expandAll();
      saveExpandedState();
    }
    // Full-text search across all saved chats
    state.storage.searchChats(query)
      .then(results => {
        searchContainer?.classList.remove('is-typing');
        renderSearchResults(results, query);
      })
      .catch(err => {
        searchContainer?.classList.remove('is-typing');
        console.error('Search failed:', err);
      });
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

// Render search results into the panel
function renderSearchResults(results, query) {
  elements.searchResults.style.display = 'block';
  const n = results.length;
  elements.resultCount.textContent = n === 1 ? '1 result' : `${n} results`;

  // A4 — badge morph animation on count change
  elements.resultCount.classList.remove('badge--morphing');
  void elements.resultCount.offsetWidth; // force reflow to re-trigger animation
  elements.resultCount.classList.add('badge--morphing');
  elements.resultCount.addEventListener('animationend',
    () => elements.resultCount.classList.remove('badge--morphing'), { once: true });

  if (n === 0) {
    // U5 — illustrated empty state
    elements.searchResultsList.innerHTML = `
      <div class="result-empty-state">
        <svg class="result-empty-state__icon" width="52" height="52" viewBox="0 0 52 52" fill="none" aria-hidden="true">
          <circle cx="23" cy="23" r="14" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
          <path d="M33.5 33.5L44 44" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
          <path d="M19 23h8" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity="0.5"/>
          <path d="M23 19v8" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity="0.5"/>
          <circle cx="23" cy="23" r="5" stroke="currentColor" stroke-width="1.4" stroke-dasharray="2.5 2.5" opacity="0.35"/>
        </svg>
        <p class="result-empty-state__title">No matches found</p>
        <p class="result-empty-state__sub">Nothing matched <strong>&ldquo;${escapeHtml(query)}&rdquo;</strong>.<br>Try a shorter or different term.</p>
      </div>`;
    return;
  }

  elements.searchResultsList.innerHTML = results.map(buildResultCard.bind(null, query)).join('');

  // Wire click + keyboard handlers
  elements.searchResultsList.querySelectorAll('.result-card').forEach((card, i) => {
    const open = () => handleChatClick(results[i]);
    card.addEventListener('click', open);
    card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
  });
}

// Build a single result card HTML string
function buildResultCard(query, chat) {
  const LABELS = { chatgpt: 'ChatGPT', claude: 'Claude', gemini: 'Gemini', copilot: 'Copilot' };
  const KNOWN_SOURCES = Object.keys(LABELS);
  const source      = chat.source || 'unknown';
  const badgeCls    = KNOWN_SOURCES.includes(source) ? `badge badge--${source}` : 'badge badge--unknown';
  const sourceText  = LABELS[source] || (source.charAt(0).toUpperCase() + source.slice(1));
  const title       = chat.title || 'Untitled Chat';
  const snippet     = extractSnippet(chat.content || '', query);
  const path        = (chat.topicId && state.tree) ? state.tree.getTopicPath(chat.topicId) : [];
  const breadcrumb  = formatBreadcrumb(path);
  const tags        = chat.tags || [];

  const titleHtml   = highlightTerms(title, query);
  const snippetHtml = snippet ? highlightTerms(snippet, query) : '';
  const snippetEl   = snippetHtml
    ? `<p class="result-snippet">${snippetHtml}</p>`
    : '';

  const tagsHtml = tags.length > 0
    ? `<div class="result-tags">${tags.map(t => {
        const isMatch = t.toLowerCase().includes(query.toLowerCase());
        const style = isMatch ? '' : ` style="--tag-hue:${getTagColor(t)}"`;
        return `<span class="result-tag-chip${isMatch ? ' result-tag-chip--match' : ''}"${style}>${escapeHtml(t)}</span>`;
      }).join('')}</div>`
    : '';

  return (
    `<article class="result-card" role="button" tabindex="0" aria-label="${escapeHtml(title)}">
      <div class="result-header">
        <span class="result-title">${titleHtml}</span>
        <span class="${badgeCls}">${escapeHtml(sourceText)}</span>
      </div>
      ${snippetEl}
      ${tagsHtml}
      <div class="result-breadcrumb">${escapeHtml(breadcrumb)}</div>
    </article>`
  );
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
    export: handleExportTopic,
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
    open:        handleOpenChatAction,
    rename:      handleRenameChatAction,
    'edit-tags': handleEditTagsAction,
    move:        handleMoveChatAction,
    delete:      handleDeleteChatAction
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

  const updates = { title: result.title };
  if (result.tags !== undefined) updates.tags = result.tags;
  state.chats = updateChatInArray(state.contextMenuChat.id, updates, state.chats);
  await browser.storage.local.set({ chats: state.chats });
  state.renderer.setChatData(state.chats);
  renderTreeView();
}

// Handle "Edit Tags" chat action
async function handleEditTagsAction() {
  if (!state.contextMenuChat) return;
  const result = await state.chatDialogs.showEditTags(state.contextMenuChat);
  if (!result) return;

  state.chats = updateChatInArray(state.contextMenuChat.id, { tags: result.tags }, state.chats);
  await browser.storage.local.set({ chats: state.chats });
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
  await browser.storage.local.set({ chats: state.chats });
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
  await browser.storage.local.set({ chats: state.chats });
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

  // Collect all descendant chat IDs BEFORE the tree mutation so we can
  // clean them from state.chats and persistent storage.
  const chatIdsToDelete = collectDescendantChatIds(state.contextMenuTopic.id);

  const result = await state.topicDialogs.showDeleteTopic(state.contextMenuTopic.id);

  if (result) {
    console.log('Topic deleted:', result.name);

    // Remove all affected chats from the in-memory list and persist
    if (chatIdsToDelete.length > 0) {
      const deleteSet = new Set(chatIdsToDelete);
      state.chats = state.chats.filter(c => !deleteSet.has(c.id));
      await browser.storage.local.set({ chats: state.chats });
      state.renderer.setChatData(state.chats);
      console.log(`Removed ${chatIdsToDelete.length} chat(s) belonging to deleted topic tree`);
    }

    await saveTree();
    renderTreeView();
  }
}

/**
 * Recursively collect all chat IDs from a topic and its descendants.
 * @param {string} topicId
 * @returns {string[]}
 */
function collectDescendantChatIds(topicId) {
  const topic = state.tree && state.tree.topics[topicId];
  if (!topic) return [];
  const ids = [...(topic.chatIds || [])];
  for (const childId of (topic.children || [])) {
    ids.push(...collectDescendantChatIds(childId));
  }
  return ids;
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
// Handle export topic context menu action (Stage 9)
async function handleExportTopic() {
  const topic = state.contextMenuTopic;
  if (!topic) return;
  try {
    await state.exportDialog.showExportTopic(topic, state.tree, state.chats);
  } catch (err) {
    console.error('Export failed:', err);
    await state.dialog.alert(err.message || 'Export failed', 'Export Error');
  }
}

// Handle export entire tree toolbar action (Stage 9)
async function handleExportAll() {
  try {
    await state.exportDialog.showExportTree(state.tree, state.chats);
  } catch (err) {
    console.error('Export failed:', err);
    await state.dialog.alert(err.message || 'Export failed', 'Export Error');
  }
}

// Handle import from ZIP (Stage 9)
async function handleImport() {
  try {
    await state.importDialog.showImportDialog(
      state.tree,
      state.chats,
      async (updatedTopics, updatedRootTopics, updatedChats, summary) => {
        // Rebuild a proper TopicTree instance from the imported data
        state.tree  = TopicTree.fromObject({ topics: updatedTopics, rootTopicIds: updatedRootTopics });
        state.chats = updatedChats;

        // Update dialog instances with new tree reference
        state.topicDialogs.tree = state.tree;
        state.chatDialogs.tree  = state.tree;

        // Persist to storage
        await saveTree();
        await browser.storage.local.set({ chats: state.chats });

        // Refresh UI
        state.renderer.setTree(state.tree);
        state.renderer.setChatData(state.chats);
        renderTreeView();
        updateStorageUsage();

        const msg = `Imported ${summary.chatsImported} chat(s) into ${summary.topicsCreated + summary.topicsMerged} topic(s).`;
        showNotification(msg, 'success');
      }
    );
  } catch (err) {
    console.error('Import failed:', err);
    await state.dialog.alert(err.message || 'Import failed', 'Import Error');
  }
}

function handleSettings() {
  openSettingsPanel();
}

// Clear all saved chats and topics
async function handleClearAll() {
  const confirmed = await state.dialog.confirm(
    'This will permanently delete all saved chats and topics. This cannot be undone.',
    'Clear All Saved Chats'
  );
  if (!confirmed) return;

  try {
    state.tree  = new TopicTree();
    state.chats = [];

    // Clear tree and chats in storage concurrently, then read usage once both are done
    await Promise.all([
      state.storage.saveTopicTree(state.tree.toObject()),
      browser.storage.local.set({ chats: state.chats }),
    ]);

    state.renderer.setTree(state.tree);
    state.renderer.setChatData(state.chats);
    renderTreeView();
    updateRecentRail();
    await updateStorageUsage();

    showNotification('All saved chats cleared.', 'success');
  } catch (err) {
    console.error('Clear all failed:', err);
    await state.dialog.alert(err.message || 'Failed to clear data', 'Error');
  }
}

function openSettingsPanel() {
  const panel = document.getElementById('settingsPanel');
  if (!panel) return;
  // Sync theme selector to current state
  const sel = document.getElementById('settingsThemeSelect');
  if (sel) sel.value = state.theme;
  panel.classList.add('settings-panel--open');
  panel.setAttribute('aria-hidden', 'false');

  // Backdrop click closes panel
  const backdrop = panel.querySelector('.settings-panel__backdrop');
  backdrop?.addEventListener('click', closeSettingsPanel, { once: true });

  // Close button
  document.getElementById('settingsPanelClose')
    ?.addEventListener('click', closeSettingsPanel, { once: true });

  // Theme select live-change
  document.getElementById('settingsThemeSelect')
    ?.addEventListener('change', (e) => {
      if (e.target.value === 'custom') return; // read-only placeholder
      applyTheme(e.target.value);
      browser.storage.local.set({ theme: e.target.value, customTheme: null }).catch(() => {});
    });

  // Load Theme file input
  const loadThemeInput = document.getElementById('loadThemeInput');
  if (loadThemeInput) {
    // Re-attach each time the panel opens; clear old value so same file re-triggers
    loadThemeInput.value = '';
    loadThemeInput.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (file) handleLoadTheme(file);
    }, { once: true });
  }

  // Skin select — sync value then wire change
  const skinSel = document.getElementById('settingsSkinSelect');
  if (skinSel) {
    skinSel.value = state.skin;
    skinSel.addEventListener('change', (e) => {
      applySkin(e.target.value);
      browser.storage.local.set({ skin: e.target.value }).catch(() => {});
    });
  }

  // Accent swatch buttons — mark active and wire click
  const swatches = document.querySelectorAll('#accentSwatches .accent-swatch');
  swatches.forEach(swatch => {
    if (swatch.dataset.accent === state.accent) swatch.classList.add('is-active');
    swatch.addEventListener('click', () => {
      swatches.forEach(s => s.classList.remove('is-active'));
      swatch.classList.add('is-active');
      const val = swatch.dataset.accent;
      applyAccent(val);
      browser.storage.local.set({ accent: val }).catch(() => {});
    });
  });
}

function closeSettingsPanel() {
  const panel = document.getElementById('settingsPanel');
  if (!panel) return;
  panel.classList.remove('settings-panel--open');
  panel.setAttribute('aria-hidden', 'true');
}

// ── Tree skeleton helpers ───────────────────────────────────────────────

function showTreeSkeleton() {
  if (!elements.treeView) return;
  const frag = document.createDocumentFragment();
  const widths = ['72%', '58%', '85%', '63%'];
  widths.forEach((w, i) => {
    const row = document.createElement('div');
    row.className = 'skeleton-row';
    row.setAttribute('aria-hidden', 'true');
    row.innerHTML = `
      <span class="skeleton-icon"></span>
      <span class="skeleton-text" style="width:${w}; animation-delay:${i * 80}ms"></span>
    `;
    frag.appendChild(row);
  });
  elements.treeView.appendChild(frag);
}

function removeTreeSkeleton() {
  elements.treeView?.querySelectorAll('.skeleton-row').forEach(el => el.remove());
}

// ── Drag-and-drop handlers ───────────────────────────────────────────────────

/**
 * Called by TreeRenderer when a topic is dropped onto another topic or root.
 * @param {string} draggedTopicId
 * @param {string|null} targetTopicId  null = move to root
 */
async function handleTopicDrop(draggedTopicId, targetTopicId) {
  if (!state.tree) return;
  const dragged = state.tree.topics[draggedTopicId];
  if (!dragged) return;

  // No-op if already at the target parent
  if (dragged.parentId === targetTopicId) return;

  try {
    state.tree.moveTopic(draggedTopicId, targetTopicId);
    await saveTree();
    renderTreeView();
    state.renderer.expandToTopic(draggedTopicId);
    saveExpandedState();
    showNotification(`Moved "${dragged.name}"`, 'success');
  } catch (err) {
    showNotification(err.message, 'error');
  }
}

/**
 * Called by TreeRenderer when a chat item is dropped onto a topic node.
 * @param {string} chatId
 * @param {string} targetTopicId
 */
async function handleChatDrop(chatId, targetTopicId) {
  const chat = state.chats.find(c => c.id === chatId);
  if (!chat) return;
  if (chat.topicId === targetTopicId) return; // already there

  const movedChat = moveChatToTopic(chat, targetTopicId, state.tree);
  state.chats = updateChatInArray(chatId, movedChat, state.chats);
  await browser.storage.local.set({ chats: state.chats });
  await saveTree();
  state.renderer.setChatData(state.chats);
  renderTreeView();
  state.renderer.expandToTopic(targetTopicId);
  saveExpandedState();
  showNotification(`Moved "${chat.title}"`, 'success');
}

/**
 * Toggle the pinned status of a topic (U2).
 * @param {string} topicId
 * @param {boolean} pinned
 */
async function handleTopicPin(topicId, pinned) {
  if (!state.tree) return;
  const topic = state.tree.topics[topicId];
  if (!topic) return;
  topic.pinned = pinned;
  await saveTree();
  renderTreeView();
  showNotification(pinned ? `\uD83D\uDCCC "${topic.name}" pinned` : `"${topic.name}" unpinned`, 'success');
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
    const usage = await browser.storage.local.getBytesInUse();
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
browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'CHAT_SAVED') {
    handleChatSaved(message.data)
      .then(() => sendResponse({ success: true }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true; // async
  }
});

// ─── Save Banner (detect active AI tab & drive the save flow) ────────────────

const SIDEPANEL_PLATFORM_PATTERNS = [
  { re: /chatgpt\.com|chat\.openai\.com/, name: 'ChatGPT'  },
  { re: /claude\.ai/,                     name: 'Claude'   },
  { re: /gemini\.google\.com/,            name: 'Gemini'   },
  { re: /copilot\.microsoft\.com|m365\.cloud\.microsoft/, name: 'Copilot' },
];

function detectPlatformFromUrl(url) {
  if (!url) return null;
  for (const { re, name } of SIDEPANEL_PLATFORM_PATTERNS) {
    if (re.test(url)) return name;
  }
  return null;
}

async function initSaveBanner() {
  if (!elements.saveBanner) return;
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    const platform = tab ? detectPlatformFromUrl(tab.url) : null;
    if (platform) {
      if (elements.saveBannerMsg) elements.saveBannerMsg.textContent = `${platform} conversation detected`;
      elements.saveBanner.style.display = 'flex';
      setSaveBtnState('default');
    } else {
      elements.saveBanner.style.display = 'none';
    }
  } catch (err) {
    console.warn('bAInder: initSaveBanner error', err);
    if (elements.saveBanner) elements.saveBanner.style.display = 'none';
  }
}

function setSaveBtnState(s) {
  const btn = elements.saveBtn;
  if (!btn) return;
  const map = {
    default: { text: '💾 Save', disabled: false },
    loading: { text: '⏳ Saving…',          disabled: true  },
    success: { text: '✅ Saved!',            disabled: true  },
    error:   { text: '❌ Error',             disabled: false },
    empty:   { text: '⚠️ No chat yet',       disabled: false },
    reload:  { text: '🔄 Reload page',       disabled: false },
  };
  const st = map[s] || map.default;
  btn.textContent = st.text;
  btn.disabled    = st.disabled;

  // When in reload state, a click reloads the active tab instead of saving
  btn._reloadMode = (s === 'reload');

  if (s === 'success' || s === 'error' || s === 'empty') {
    setTimeout(() => setSaveBtnState('default'), 3500);
  }
}

async function handlePanelSave() {
  setSaveBtnState('loading');
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error('No active tab');

    // Ask content script to extract the chat
    const extractResponse = await browser.tabs.sendMessage(tab.id, { type: 'EXTRACT_CHAT' });
    if (!extractResponse?.success) {
      throw new Error(extractResponse?.error || 'Extraction failed');
    }
    const chatData = extractResponse.data;
    if (!chatData || (chatData.messageCount === 0 && !chatData.messages?.length)) {
      setSaveBtnState('empty');
      return;
    }

    // Forward to background to save
    const saveResponse = await browser.runtime.sendMessage({ type: 'SAVE_CHAT', data: chatData });
    if (!saveResponse?.success) {
      throw new Error(saveResponse?.error || 'Save failed');
    }

    setSaveBtnState('success');

    // State refresh is handled by handleChatSaved (triggered by the CHAT_SAVED
    // broadcast from background) — which also shows the assign-to-topic dialog,
    // saves the topicId, and re-renders. Calling loadTree() here concurrently
    // would race against that flow and overwrite state.tree before the topicId
    // mutation is saved, causing the chat to disappear from the tree.
    await updateStorageUsage();
  } catch (err) {
    const noContentScript = /receiving end does not exist|could not establish connection/i.test(err.message);
    const contextLost     = /context.*(lost|invalidated)/i.test(err.message);
    if (noContentScript || contextLost) {
      if (elements.saveBannerMsg) {
        elements.saveBannerMsg.textContent = '⚠️ Reload this page to activate bAInder';
      }
      setSaveBtnState('reload');
    } else {
      setSaveBtnState('error');
    }
    console.error('bAInder: Panel save failed', err);
  }
}

// Refresh the save banner whenever the user switches tabs or a tab finishes loading
try {
  browser.tabs.onActivated.addListener(() => initSaveBanner());
  browser.tabs.onUpdated.addListener((_tabId, changeInfo) => {
    if (changeInfo.status === 'complete') initSaveBanner();
  });
} catch (_) { /* non-extension context (tests) */ }

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
  saveExpandedState
};
