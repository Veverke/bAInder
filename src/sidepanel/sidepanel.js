// bAInder Side Panel Script
// Stage 1: Basic initialization and UI setup

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
  topics: [],
  chats: [],
  expandedTopics: new Set(),
  selectedItem: null,
  searchQuery: '',
  theme: 'light' // 'light', 'dark', or 'auto'
};

// Initialize the application
async function init() {
  console.log('Initializing bAInder...');
  
  // Initialize theme
  await initTheme();
  
  // Set up event listeners
  setupEventListeners();
  
  // Load data from storage
  await loadData();
  
  // Update storage usage display
  updateStorageUsage();
  
  // Render the tree view
  renderTreeView();
  
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
  try {
    const result = await chrome.storage.local.get(['topics', 'chats', 'expandedTopics', 'theme']);
    state.topics = result.topics || [];
    state.chats = result.chats || [];
    state.expandedTopics = new Set(result.expandedTopics || []);
    state.theme = result.theme || 'light';
    
    console.log(`Loaded ${state.topics.length} topics and ${state.chats.length} chats`);
  } catch (error) {
    console.error('Error loading data:', error);
  }
}

// Save data to storage
async function saveData() {
  try {
    await chrome.storage.local.set({
      topics: state.topics,
      chats: state.chats,
      expandedTopics: Array.from(state.expandedTopics),
      theme: state.theme
    });
    console.log('Data saved successfully');
  } catch (error) {
    console.error('Error saving data:', error);
  }
}

// Render the tree view
function renderTreeView() {
  if (state.topics.length === 0) {
    elements.emptyState.style.display = 'flex';
    elements.treeView.innerHTML = '';
    elements.itemCount.textContent = '0 topics';
  } else {
    elements.emptyState.style.display = 'none';
    // TODO: Implement tree rendering in later stages
    elements.itemCount.textContent = `${state.topics.length} topic${state.topics.length !== 1 ? 's' : ''}`;
  }
}

// Handle search input
function handleSearch(event) {
  const query = event.target.value.trim();
  state.searchQuery = query;
  
  // Show/hide clear button
  elements.clearSearchBtn.style.display = query ? 'block' : 'none';
  
  if (query) {
    performSearch(query);
  } else {
    hideSearchResults();
  }
}

// Clear search
function clearSearch() {
  elements.searchInput.value = '';
  state.searchQuery = '';
  elements.clearSearchBtn.style.display = 'none';
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
  loadData,
  saveData,
  renderTreeView,
  showNotification,
  showModal,
  closeModal
};
