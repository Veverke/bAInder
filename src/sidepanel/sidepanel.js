// bAInder Side Panel Script
// Stage 5: Topic Management UI

import { TopicTree } from '../lib/tree.js';
import { TreeRenderer } from '../lib/tree-renderer.js';
import { StorageService } from '../lib/storage.js';
import { DialogManager } from '../lib/dialog-manager.js';
import { TopicDialogs } from '../lib/topic-dialogs.js';

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
  searchQuery: '',
  theme: 'light', // 'light', 'dark', or 'auto'
  contextMenuTopic: null // Currently selected topic for context menu
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
  
  // Initialize topic dialogs (needs tree instance)
  state.topicDialogs = new TopicDialogs(state.dialog, state.tree);
  
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
  
  // Context menu - hide when clicking outside
  document.addEventListener('click', (e) => {
    if (!elements.contextMenu.contains(e.target)) {
      hideContextMenu();
      state.contextMenuTopic = null; // Clear topic when clicking outside
    }
  });
  
  // Context menu action handlers
  setupContextMenuActions();
  
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
  
  // Set up event handlers
  state.renderer.onTopicClick = handleTopicClick;
  state.renderer.onTopicContextMenu = handleTopicContextMenu;
  
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
  // TODO: Show topic details/chats in Stage 7
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
      
      // Store topic reference before hiding menu (which clears state.contextMenuTopic)
      const topic = state.contextMenuTopic;
      console.log('Context menu action clicked:', action, 'for topic:', topic?.name);
      hideContextMenu();
      
      // Temporarily restore topic for the action handler
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

// Show notification (simple toast)
function showNotification(message, type = 'info') {
  console.log(`[${type.toUpperCase()}] ${message}`);
  // TODO: Implement toast notifications in Stage 10
  alert(message); // Temporary
}

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
  loadTree,
  saveTree,
  renderTreeView,
  showNotification,
  saveExpandedState
};
