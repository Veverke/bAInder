// bAInder Side Panel Script
// Stage 4: Tree rendering with TreeRenderer

import { TopicTree } from '../lib/tree.js';
import { TreeRenderer } from '../lib/tree-renderer.js';
import { StorageService } from '../lib/storage.js';

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
  searchQuery: '',
  theme: 'light' // 'light', 'dark', or 'auto'
};

// Initialize the application
async function init() {
  console.log('Initializing bAInder...');
  
  // Initialize storage service
  state.storage = StorageService.getInstance('chrome');
  
  // Initialize theme
  await initTheme();
  
  // Set up event listeners
  setupEventListeners();
  
  // Load tree from storage
  await loadTree();
  
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
  
  // Settings button
  elements.settingsBtn.addEventListener('click', handleSettings);
  
  // Theme toggle button
  elements.themeToggle.addEventListener('click', toggleTheme);
  
  // Context menu - hide when clicking outside
  document.addEventListener('click', (e) => {
    if (!elements.contextMenu.contains(e.target)) {
      hideContextMenu();
    }
  });
  
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
    const treeData = await state.storage.loadTree();
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
    await state.storage.saveTree(state.tree.toObject());
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

// Handle topic context menu
function handleTopicContextMenu(topic, event) {
  console.log('Topic context menu:', topic.name);
  // TODO: Implement context menu in Stage 5
  showNotification('Topic management coming in Stage 5', 'info');
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
function handleAddTopic() {
  console.log('Add topic clicked');
  // TODO: Implement add topic dialog in Stage 5
  showNotification('Topic creation coming in Stage 5');
}

// Handle settings button
function handleSettings() {
  console.log('Settings clicked');
  // TODO: Implement settings in Stage 10
  showNotification('Settings coming in Stage 10');
}

// Show context menu
function showContextMenu(x, y, itemType, itemId) {
  elements.contextMenu.style.left = `${x}px`;
  elements.contextMenu.style.top = `${y}px`;
  elements.contextMenu.style.display = 'block';
  
  // Store context for menu actions
  elements.contextMenu.dataset.itemType = itemType;
  elements.contextMenu.dataset.itemId = itemId;
}

// Hide context menu
function hideContextMenu() {
  elements.contextMenu.style.display = 'none';
}

// Show modal
function showModal(content) {
  elements.modalContainer.innerHTML = content;
  elements.modalContainer.style.display = 'flex';
}

// Close modal
function closeModal() {
  elements.modalContainer.style.display = 'none';
  elements.modalContainer.innerHTML = '';
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
  loadTree,
  saveTree,
  renderTreeView,
  showNotification,
  saveExpandedState
};
