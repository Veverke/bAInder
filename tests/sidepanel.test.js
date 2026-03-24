/**
 * Tests for src/sidepanel/sidepanel.js
 *
 * Exercises the exported `switchTab()` function.  The bootstrap `init()` and
 * `setupEventListeners()` functions are internal and tightly coupled to a live
 * browser-extension DOM; they are not unit-tested here.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// ── Shared mutable state / element objects used by switchTab ──────────────────
// vi.hoisted ensures these are available inside vi.mock factory callbacks,
// which are hoisted to the top of the module by Vitest's transform.
const { mockState, mockElements, setSearchContextMock, initEntityControllerMock } = vi.hoisted(() => {
  // Create a minimal DOM-element stub that satisfies addEventListener calls
  const el = () => {
    const e = { addEventListener: () => {}, setAttribute: () => {}, classList: { toggle: () => {}, add: () => {}, remove: () => {} } };
    e.hidden = false;
    return e;
  };
  const mockState    = { activeTab: 'sessions', entityControllerInitialized: false };
  const mockElements = {
    sessionPanel:         el(),
    entityPanel:          el(),
    tabChatSessions:      Object.assign(el(), { setAttribute: vi.fn(), classList: { toggle: vi.fn() } }),
    tabChatEntities:      Object.assign(el(), { setAttribute: vi.fn(), classList: { toggle: vi.fn() } }),
    searchInput:          el(),
    clearSearchBtn:       el(),
    addTopicBtn:          el(),
    expandAllBtn:         el(),
    collapseAllBtn:       el(),
    modalContainer:       el(),
    treeView:             el(),
    topicSortSelect:      el(),
    chatSortSelect:       el(),
    multiSelectToggleBtn: el(),
    joinBtn:              el(),
    exportDigestBtn:      el(),
    copyAllBtn:           el(),
    compareBtn:           el(),
    selectionClearBtn:    el(),
    multiSelectCancelBtn: el(),
    importBtn:            el(),
    exportAllBtn:         el(),
    clearAllBtn:          el(),
    saveBtn:              el(),
  };
  mockElements.sessionPanel.hidden = false;
  mockElements.entityPanel.hidden  = true;
  const setSearchContextMock     = vi.fn();
  const initEntityControllerMock = vi.fn();
  return { mockState, mockElements, setSearchContextMock, initEntityControllerMock };
});

vi.mock('../src/sidepanel/app-context.js', () => ({
  state:    mockState,
  elements: mockElements,
}));

vi.mock('../src/lib/vendor/browser.js', () => ({
  default: {
    storage: { local: { get: vi.fn().mockResolvedValue({}), set: vi.fn().mockResolvedValue(undefined) } },
    tabs:    { query: vi.fn().mockResolvedValue([]), reload: vi.fn().mockResolvedValue(undefined) },
    runtime: { onMessage: { addListener: vi.fn() } },
  },
}));

vi.mock('../src/lib/utils/logger.js', () => ({
  logger: { log: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../src/lib/utils/constants.js', () => ({ TREE_FLASH_MS: 300 }));

// Heavy module mocks — return no-op stubs for every named export used
vi.mock('../src/sidepanel/controllers/tree-controller.js', () => ({
  loadTree:           vi.fn().mockResolvedValue(undefined),
  initTreeRenderer:   vi.fn(),
  saveExpandedState:  vi.fn(),
  renderTreeView:     vi.fn(),
}));

vi.mock('../src/sidepanel/controllers/search-controller.js', () => ({
  handleSearch:                   vi.fn(),
  clearSearch:                    vi.fn(),
  setupFilterBar:                 vi.fn(),
  populateTopicScopeSelect:       vi.fn(),
  setupSearchContextToggle:       vi.fn(),
  setSearchContext:               setSearchContextMock,
  refreshEntityTypeChipVisibility: vi.fn(),
}));

vi.mock('../src/sidepanel/controllers/topic-actions.js', () => ({
  handleAddTopic:         vi.fn(),
  handleTopicClick:       vi.fn(),
  handleTopicContextMenu: vi.fn(),
  setupContextMenuActions: vi.fn(),
  hideContextMenu:        vi.fn(),
}));

vi.mock('../src/sidepanel/controllers/chat-actions.js', () => ({
  handleChatClick:             vi.fn(),
  handleChatContextMenu:       vi.fn(),
  setupChatContextMenuActions: vi.fn(),
  hideChatContextMenu:         vi.fn(),
  handleChatSaved:             vi.fn(),
}));

vi.mock('../src/sidepanel/controllers/import-export-actions.js', () => ({
  handleExportAll: vi.fn(),
  handleImport:    vi.fn(),
  handleClearAll:  vi.fn(),
}));

vi.mock('../src/sidepanel/features/save-banner.js', () => ({
  initSaveBanner:  vi.fn().mockResolvedValue(undefined),
  setSaveBtnState: vi.fn(),
  handlePanelSave: vi.fn(),
}));

vi.mock('../src/sidepanel/features/backup-reminder.js', () => ({
  initBackupReminder: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../src/sidepanel/controllers/entity-controller.js', () => ({
  init:    initEntityControllerMock,
  refresh: vi.fn(),
}));

vi.mock('../src/sidepanel/features/multi-select.js', () => ({
  handleMultiSelectToggle: vi.fn(),
  handleJoin:              vi.fn(),
  handleExportDigest:      vi.fn(),
  handleCopyAll:           vi.fn(),
  exitMultiSelectMode:     vi.fn(),
  handleSelectionChange:   vi.fn(),
}));

vi.mock('../src/sidepanel/features/compare.js',       () => ({ handleCompare:      vi.fn() }));
vi.mock('../src/sidepanel/features/settings-panel.js',() => ({ openSettingsPanel:  vi.fn() }));
vi.mock('../src/sidepanel/features/recent-rail.js',   () => ({ updateRecentRail:   vi.fn() }));
vi.mock('../src/sidepanel/features/storage-usage.js', () => ({ updateStorageUsage: vi.fn().mockResolvedValue(undefined) }));

vi.mock('../src/lib/storage.js',                () => ({ StorageService: { getInstance: vi.fn() } }));
vi.mock('../src/lib/dialogs/dialog-manager.js', () => ({ DialogManager: class { close() {} } }));
vi.mock('../src/lib/dialogs/topic-dialogs.js',  () => ({ TopicDialogs:  class {} }));
vi.mock('../src/lib/dialogs/chat-dialogs.js',   () => ({ ChatDialogs:   class { setTagSuggestions() {} } }));
vi.mock('../src/lib/dialogs/export-dialog.js',  () => ({ ExportDialog:  class {} }));
vi.mock('../src/lib/dialogs/import-dialog.js',  () => ({ ImportDialog:  class {} }));
vi.mock('../src/sidepanel/services/chat-repository.js', () => ({
  ChatRepository: class { loadAll() { return Promise.resolve([]); } },
}));

// ── Import the module under test AFTER all mocks are set up ──────────────────
import { switchTab } from '../src/sidepanel/sidepanel.js';

// ─────────────────────────────────────────────────────────────────────────────
// switchTab()
// ─────────────────────────────────────────────────────────────────────────────

describe('switchTab()', () => {
  beforeEach(() => {
    mockState.activeTab = 'sessions';
    mockState.entityControllerInitialized = false;
    mockElements.sessionPanel.hidden = false;
    mockElements.entityPanel.hidden  = true;
    vi.clearAllMocks();
  });

  it('sets state.activeTab to the requested tab', () => {
    switchTab('entities');
    expect(mockState.activeTab).toBe('entities');
  });

  it('hides sessionPanel and shows entityPanel when switching to entities', () => {
    switchTab('entities');
    expect(mockElements.sessionPanel.hidden).toBe(true);
    expect(mockElements.entityPanel.hidden).toBe(false);
  });

  it('shows sessionPanel and hides entityPanel when switching to sessions', () => {
    mockElements.sessionPanel.hidden = true;
    mockElements.entityPanel.hidden  = false;
    switchTab('sessions');
    expect(mockElements.sessionPanel.hidden).toBe(false);
    expect(mockElements.entityPanel.hidden).toBe(true);
  });

  it('updates aria-selected on tab buttons', () => {
    switchTab('entities');
    expect(mockElements.tabChatSessions.setAttribute).toHaveBeenCalledWith('aria-selected', 'false');
    expect(mockElements.tabChatEntities.setAttribute).toHaveBeenCalledWith('aria-selected', 'true');
  });

  it('toggles panel-tab--active class on tab buttons', () => {
    switchTab('entities');
    expect(mockElements.tabChatSessions.classList.toggle).toHaveBeenCalledWith('panel-tab--active', false);
    expect(mockElements.tabChatEntities.classList.toggle).toHaveBeenCalledWith('panel-tab--active', true);
  });

  it('calls setSearchContext("entities") when switching to entities tab', () => {
    switchTab('entities');
    expect(setSearchContextMock).toHaveBeenCalledWith('entities');
  });

  it('calls setSearchContext("chats") when switching to sessions tab', () => {
    switchTab('sessions');
    expect(setSearchContextMock).toHaveBeenCalledWith('chats');
  });

  it('lazy-inits entityController on first switch to entities', () => {
    switchTab('entities');
    expect(initEntityControllerMock).toHaveBeenCalledTimes(1);
    expect(mockState.entityControllerInitialized).toBe(true);
  });

  it('does not re-init entityController on subsequent switch to entities', () => {
    switchTab('entities');
    switchTab('sessions');
    switchTab('entities');
    expect(initEntityControllerMock).toHaveBeenCalledTimes(1);
  });

  it('does not init entityController when switching to sessions', () => {
    switchTab('sessions');
    expect(initEntityControllerMock).not.toHaveBeenCalled();
  });

  it('tolerates missing panel elements (null-safe)', () => {
    const savedSessionPanel = mockElements.sessionPanel;
    const savedEntityPanel  = mockElements.entityPanel;
    mockElements.sessionPanel = null;
    mockElements.entityPanel  = null;
    expect(() => switchTab('entities')).not.toThrow();
    mockElements.sessionPanel = savedSessionPanel;
    mockElements.entityPanel  = savedEntityPanel;
  });

  it('tolerates missing tab button elements (null-safe)', () => {
    const savedSessions = mockElements.tabChatSessions;
    const savedEntities = mockElements.tabChatEntities;
    mockElements.tabChatSessions = null;
    mockElements.tabChatEntities = null;
    expect(() => switchTab('entities')).not.toThrow();
    mockElements.tabChatSessions = savedSessions;
    mockElements.tabChatEntities = savedEntities;
  });
});
