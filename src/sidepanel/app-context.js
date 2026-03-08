/**
 * app-context.js
 *
 * Centralised application state and DOM-element references for the sidepanel.
 *
 * Responsibility: own the two mutable singletons — `state` and `elements` —
 * so every feature module can import them without creating circular deps or
 * re-querying the DOM on every function call.
 *
 * NOT responsible for: business logic, storage I/O, rendering, or event wiring.
 */

// ---------------------------------------------------------------------------
// DOM element references
// Populated once at module evaluation time (after the HTML is parsed).
// ---------------------------------------------------------------------------
export const elements = {
  treeView:             document.getElementById('treeView'),
  emptyState:           document.getElementById('emptyState'),
  searchInput:          document.getElementById('searchInput'),
  clearSearchBtn:       document.getElementById('clearSearchBtn'),
  searchResults:        document.getElementById('searchResults'),
  searchResultsList:    document.getElementById('searchResultsList'),
  addTopicBtn:          document.getElementById('addTopicBtn'),
  importBtn:            document.getElementById('importBtn'),
  exportAllBtn:         document.getElementById('exportAllBtn'),
  clearAllBtn:          document.getElementById('clearAllBtn'),
  settingsBtn:          document.getElementById('settingsBtn'),
  contextMenu:          document.getElementById('contextMenu'),
  chatContextMenu:      document.getElementById('chatContextMenu'),
  modalContainer:       document.getElementById('modalContainer'),
  itemCount:            document.getElementById('itemCount'),
  expandAllBtn:         document.getElementById('expandAllBtn'),
  collapseAllBtn:       document.getElementById('collapseAllBtn'),
  resultCount:          document.getElementById('resultCount'),
  storageUsage:         document.getElementById('storageUsage'),
  saveBanner:           document.getElementById('saveBanner'),
  saveBtn:              document.getElementById('saveChatBtn'),
  saveBannerMsg:        document.getElementById('saveBannerMsg'),
  // C.9 — sort selector
  topicSortSelect:      document.getElementById('topicSortSelect'),
  // C.3 — search filter bar
  filterToggleBtn:      document.getElementById('filterToggleBtn'),
  searchFilterBar:      document.getElementById('searchFilterBar'),
  filterSourcePills:    document.getElementById('filterSourcePills'),
  filterDateFrom:       document.getElementById('filterDateFrom'),
  filterDateTo:         document.getElementById('filterDateTo'),
  filterTopicScope:     document.getElementById('filterTopicScope'),
  filterClearBtn:       document.getElementById('filterClearBtn'),
  filterRatingPills:    document.getElementById('filterRatingPills'),
  filterTagPills:       document.getElementById('filterTagPills'),
  // C.10 — backup reminder
  backupReminderBanner: document.getElementById('backupReminderBanner'),
  backupReminderMsg:    document.getElementById('backupReminderMsg'),
  backupExportNowBtn:   document.getElementById('backupExportNowBtn'),
  backupRemindLaterBtn: document.getElementById('backupRemindLaterBtn'),
  backupNeverRemindBtn: document.getElementById('backupNeverRemindBtn'),
  backupDismissBtn:     document.getElementById('backupDismissBtn'),
  // C.17 — multi-select / assembly
  multiSelectToggleBtn: document.getElementById('multiSelectToggleBtn'),
  selectionBar:         document.getElementById('selectionBar'),
  selectionCount:       document.getElementById('selectionCount'),
  assembleBtn:          document.getElementById('assembleBtn'),
  exportDigestBtn:      document.getElementById('exportDigestBtn'),
  selectionClearBtn:    document.getElementById('selectionClearBtn'),
  multiSelectCancelBtn: document.getElementById('multiSelectCancelBtn'),
};

// ---------------------------------------------------------------------------
// Application state
// ---------------------------------------------------------------------------
export const state = {
  // Service instances (populated during init)
  tree:         null,   // TopicTree
  renderer:     null,   // TreeRenderer
  storage:      null,   // StorageService
  dialog:       null,   // DialogManager
  topicDialogs: null,   // TopicDialogs
  chatDialogs:  null,   // ChatDialogs
  chatRepo:     null,   // ChatRepository (set by init)
  exportDialog: null,   // ExportDialog
  importDialog: null,   // ImportDialog

  // Runtime data
  chats: [],            // metadata-only chat array (content stripped)

  // Transient context-menu state
  contextMenuTopic: null,
  contextMenuChat:  null,

  // Search
  searchQuery: '',
  filters: {
    sources:   new Set(),   // active source keys (empty = all)
    dateFrom:  null,        // 'YYYY-MM-DD' or null
    dateTo:    null,        // 'YYYY-MM-DD' or null
    topicId:   '',          // '' = all topics
    minRating: null,        // C.15 — 1–5 or null
    tags:      new Set()    // active tag strings (empty = all)
  },

  // C.9 — topic sort mode (persisted to localStorage)
  sortMode: localStorage.getItem('topicSortMode') || 'alpha-asc',

  // Toast timer handle
  _toastTimer: null,

  // Save-button topic hints
  // lastCreatedTopicId: set when a topic is added; cleared after first successful save
  // lastUsedTopicId:    set when a chat is successfully saved to a topic
  lastCreatedTopicId: null,
  lastUsedTopicId:    null,
};
