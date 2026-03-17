/**
 * Tests for src/sidepanel/features/multi-select.js
 *
 * multi-select.js uses the `state` and `elements` singletons directly
 * (no _setContext injection), so tests mutate those singletons in beforeEach
 * and restore them in afterEach.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  handleMultiSelectToggle,
  exitMultiSelectMode,
  handleSelectionChange,
  updateSelectionBar,
  handleCopyAll,
  handleExportDigest,
  handleAssemble,
} from '../src/sidepanel/features/multi-select.js';
import { state, elements } from '../src/sidepanel/app-context.js';

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('../src/sidepanel/controllers/tree-controller.js', () => ({
  saveTree:       vi.fn().mockResolvedValue(undefined),
  renderTreeView: vi.fn(),
}));

vi.mock('../src/lib/export/clipboard-serialiser.js', () => ({
  copyChatsToClipboard: vi.fn().mockResolvedValue({ ok: true, tooLarge: false }),
}));

vi.mock('../src/lib/export/markdown-builder.js', () => ({
  buildDigestMarkdown: vi.fn().mockReturnValue('# Digest'),
}));

vi.mock('../src/lib/chat/chat-manager.js', () => ({
  assignChatToTopic: vi.fn((chat, topicId) => ({ ...chat, topicId })),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRenderer(overrides = {}) {
  return {
    multiSelectMode:    false,
    enterMultiSelectMode: vi.fn(function () { this.multiSelectMode = true; }),
    exitMultiSelectMode:  vi.fn(function () { this.multiSelectMode = false; }),
    getSelectedChats:   vi.fn().mockReturnValue([]),
    setChatData:        vi.fn(),
    expandNode:         vi.fn(),
    ...overrides,
  };
}

function makeToggleBtn() {
  const btn = document.createElement('button');
  document.body.appendChild(btn);
  elements.multiSelectToggleBtn = btn;
  return btn;
}

function makeSelectionBar() {
  const bar = document.createElement('div');
  bar.style.display = 'none';
  document.body.appendChild(bar);
  elements.selectionBar = bar;
  return bar;
}

function makeToast() {
  const toast = document.createElement('div');
  toast.id = 'toast';
  document.body.appendChild(toast);
  return toast;
}

beforeEach(() => {
  document.body.innerHTML = '';
  state.renderer = makeRenderer();
});

afterEach(() => {
  state.renderer          = null;
  state.dialog            = undefined;
  state.topicDialogs      = undefined;
  state.tree              = undefined;
  state.chatRepo          = undefined;
  state.chats             = undefined;
  state.exportDialog      = undefined;
  elements.multiSelectToggleBtn = null;
  elements.selectionBar   = null;
  elements.selectionCount = null;
  elements.assembleBtn    = null;
  elements.exportDigestBtn = null;
  elements.copyAllBtn     = null;
  elements.compareBtn     = null;
  document.body.innerHTML = '';
  vi.clearAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────
// handleMultiSelectToggle()
// ─────────────────────────────────────────────────────────────────────────────

describe('handleMultiSelectToggle()', () => {
  it('does nothing when renderer is null', () => {
    state.renderer = null;
    expect(() => handleMultiSelectToggle()).not.toThrow();
  });

  it('enters multi-select mode when not already in it', () => {
    const btn = makeToggleBtn();
    makeSelectionBar();
    state.renderer.multiSelectMode = false;
    handleMultiSelectToggle();
    expect(state.renderer.enterMultiSelectMode).toHaveBeenCalled();
    expect(btn.classList.contains('section-toggle--active')).toBe(true);
    expect(elements.selectionBar.style.display).toBe('flex');
  });

  it('exits multi-select mode when already in it', () => {
    const btn = makeToggleBtn();
    const bar = makeSelectionBar();
    state.renderer.multiSelectMode = true;
    bar.style.display = 'flex';
    handleMultiSelectToggle();
    expect(state.renderer.exitMultiSelectMode).toHaveBeenCalled();
    expect(elements.selectionBar.style.display).toBe('none');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// exitMultiSelectMode()
// ─────────────────────────────────────────────────────────────────────────────

describe('exitMultiSelectMode()', () => {
  it('does nothing when renderer is null', () => {
    state.renderer = null;
    expect(() => exitMultiSelectMode()).not.toThrow();
  });

  it('calls renderer.exitMultiSelectMode and hides selection bar', () => {
    const btn = makeToggleBtn();
    const bar = makeSelectionBar();
    bar.style.display = 'flex';
    exitMultiSelectMode();
    expect(state.renderer.exitMultiSelectMode).toHaveBeenCalled();
    expect(bar.style.display).toBe('none');
    expect(btn.getAttribute('aria-pressed')).toBe('false');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// handleSelectionChange()
// ─────────────────────────────────────────────────────────────────────────────

describe('handleSelectionChange()', () => {
  it('updates the selection count display', () => {
    const countEl = document.createElement('span');
    document.body.appendChild(countEl);
    elements.selectionCount = countEl;

    handleSelectionChange(new Set(['c1', 'c2']), []);
    expect(countEl.textContent).toBe('2 chats selected');
  });

  it('shows "1 chat selected" for a single selection', () => {
    const countEl = document.createElement('span');
    document.body.appendChild(countEl);
    elements.selectionCount = countEl;

    handleSelectionChange(new Set(['c1']), []);
    expect(countEl.textContent).toBe('1 chat selected');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// updateSelectionBar()
// ─────────────────────────────────────────────────────────────────────────────

describe('updateSelectionBar()', () => {
  beforeEach(() => {
    const selectionCount  = document.createElement('span');
    const assembleBtn     = document.createElement('button');
    const exportDigestBtn = document.createElement('button');
    const copyAllBtn      = document.createElement('button');
    const compareBtn      = document.createElement('button');
    document.body.append(selectionCount, assembleBtn, exportDigestBtn, copyAllBtn, compareBtn);
    elements.selectionCount  = selectionCount;
    elements.assembleBtn     = assembleBtn;
    elements.exportDigestBtn = exportDigestBtn;
    elements.copyAllBtn      = copyAllBtn;
    elements.compareBtn      = compareBtn;
  });

  it('disables action buttons when count < 2', () => {
    updateSelectionBar(1);
    expect(elements.assembleBtn.disabled).toBe(true);
    expect(elements.copyAllBtn.disabled).toBe(true);
    expect(elements.compareBtn.disabled).toBe(true);
  });

  it('enables action buttons when count >= 2', () => {
    updateSelectionBar(3);
    expect(elements.assembleBtn.disabled).toBe(false);
    expect(elements.exportDigestBtn.disabled).toBe(false);
    expect(elements.copyAllBtn.disabled).toBe(false);
    expect(elements.compareBtn.disabled).toBe(false);
  });

  it('shows count in selectionCount element', () => {
    updateSelectionBar(5);
    expect(elements.selectionCount.textContent).toBe('5 chats selected');
  });

  it('sets accessible titles on action buttons for >= 2 count', () => {
    updateSelectionBar(2);
    expect(elements.assembleBtn.title).toContain('2');
    expect(elements.copyAllBtn.title).toContain('2');
  });

  it('does not throw when elements are absent', () => {
    elements.assembleBtn = null;
    elements.exportDigestBtn = null;
    elements.copyAllBtn = null;
    elements.compareBtn = null;
    elements.selectionCount = null;
    expect(() => updateSelectionBar(3)).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// handleCopyAll()
// ─────────────────────────────────────────────────────────────────────────────

describe('handleCopyAll()', () => {
  it('does nothing when renderer is null', async () => {
    state.renderer = null;
    await handleCopyAll();
    // No throw expected
  });

  it('shows error when fewer than 2 chats selected', async () => {
    makeToast();
    state.renderer.getSelectedChats.mockReturnValueOnce([{ id: 'c1' }]);
    await handleCopyAll();
    const toast = document.getElementById('toast');
    expect(toast.textContent).toContain('Select at least 2');
  });

  it('shows success notification after successful copy', async () => {
    makeToast();
    state.renderer.getSelectedChats.mockReturnValueOnce([
      { id: 'c1', title: 'A' }, { id: 'c2', title: 'B' },
    ]);
    state.chatRepo = { loadFullByIds: vi.fn().mockResolvedValue([{ id: 'c1' }, { id: 'c2' }]) };
    const { copyChatsToClipboard } = await import('../src/lib/export/clipboard-serialiser.js');
    copyChatsToClipboard.mockResolvedValueOnce({ ok: true, tooLarge: false });
    await handleCopyAll();
    const toast = document.getElementById('toast');
    expect(toast.textContent).toContain('Copied 2');
  });

  it('shows error when clipboard content is too large', async () => {
    makeToast();
    state.renderer.getSelectedChats.mockReturnValueOnce([
      { id: 'c1' }, { id: 'c2' },
    ]);
    state.chatRepo = { loadFullByIds: vi.fn().mockResolvedValue([{ id: 'c1' }, { id: 'c2' }]) };
    const { copyChatsToClipboard } = await import('../src/lib/export/clipboard-serialiser.js');
    copyChatsToClipboard.mockResolvedValueOnce({ ok: false, tooLarge: true });
    await handleCopyAll();
    const toast = document.getElementById('toast');
    expect(toast.textContent).toContain('too large');
  });

  it('shows error when copy fails (ok: false, tooLarge: false)', async () => {
    makeToast();
    state.renderer.getSelectedChats.mockReturnValueOnce([{ id: 'c1' }, { id: 'c2' }]);
    state.chatRepo = { loadFullByIds: vi.fn().mockResolvedValue([{ id: 'c1' }, { id: 'c2' }]) };
    const { copyChatsToClipboard } = await import('../src/lib/export/clipboard-serialiser.js');
    copyChatsToClipboard.mockResolvedValueOnce({ ok: false, tooLarge: false });
    await handleCopyAll();
    const toast = document.getElementById('toast');
    expect(toast.textContent).toContain('Failed');
  });

  it('shows error when loadFullByIds throws', async () => {
    makeToast();
    state.renderer.getSelectedChats.mockReturnValueOnce([{ id: 'c1' }, { id: 'c2' }]);
    state.chatRepo = { loadFullByIds: vi.fn().mockRejectedValueOnce(new Error('DB error')) };
    await handleCopyAll();
    const toast = document.getElementById('toast');
    expect(toast.textContent).toContain('Failed');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// handleExportDigest()
// ─────────────────────────────────────────────────────────────────────────────

describe('handleExportDigest()', () => {
  it('does nothing when renderer is null', async () => {
    state.renderer = null;
    await handleExportDigest();
  });

  it('shows error when fewer than 2 chats selected', async () => {
    makeToast();
    state.renderer.getSelectedChats.mockReturnValueOnce([{ id: 'c1' }]);
    await handleExportDigest();
    const toast = document.getElementById('toast');
    expect(toast.textContent).toContain('Select at least 2');
  });

  it('calls showExportDigest when 2+ chats selected', async () => {
    makeToast();
    state.renderer.getSelectedChats.mockReturnValueOnce([
      { id: 'c1' }, { id: 'c2' },
    ]);
    state.chatRepo = { loadFullByIds: vi.fn().mockResolvedValue([{ id: 'c1' }, { id: 'c2' }]) };
    state.tree = { topics: {}, getAllTopics: vi.fn().mockReturnValue([]) };
    const showExportDigest = vi.fn().mockResolvedValue(undefined);
    state.exportDialog = { showExportDigest };
    await handleExportDigest();
    expect(showExportDigest).toHaveBeenCalled();
  });

  it('shows alert when export throws', async () => {
    makeToast();
    state.renderer.getSelectedChats.mockReturnValueOnce([{ id: 'c1' }, { id: 'c2' }]);
    state.chatRepo = { loadFullByIds: vi.fn().mockResolvedValue([{ id: 'c1' }, { id: 'c2' }]) };
    state.tree = { topics: {} };
    const alertFn = vi.fn().mockResolvedValue(undefined);
    state.exportDialog = { showExportDigest: vi.fn().mockRejectedValueOnce(new Error('Export crash')) };
    state.dialog = { alert: alertFn };
    await handleExportDigest();
    expect(alertFn).toHaveBeenCalledWith('Export crash', 'Export Error');
  });

  it('shows error when loadFullByIds throws in handleExportDigest', async () => {
    makeToast();
    state.renderer.getSelectedChats.mockReturnValueOnce([{ id: 'c1' }, { id: 'c2' }]);
    state.chatRepo = { loadFullByIds: vi.fn().mockRejectedValueOnce(new Error('DB fail')) };
    await handleExportDigest();
    const toast = document.getElementById('toast');
    expect(toast.textContent).toContain('Failed');
  });

  it('shows error when more than 100 chats selected for digest export', async () => {
    makeToast();
    const manyChats = Array.from({ length: 101 }, (_, i) => ({ id: `c${i}` }));
    state.renderer.getSelectedChats.mockReturnValueOnce(manyChats);
    state.chatRepo = { loadFullByIds: vi.fn() };
    await handleExportDigest();
    const toast = document.getElementById('toast');
    expect(toast.textContent).toContain('Cannot export more than');
    expect(state.chatRepo.loadFullByIds).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// handleAssemble()
// ─────────────────────────────────────────────────────────────────────────────

describe('handleAssemble()', () => {
  function makeAssembleState(overrides = {}) {
    return {
      renderer: makeRenderer(),
      chatRepo: {
        loadFullByIds: vi.fn().mockResolvedValue([
          { id: 'c1', title: 'A', content: 'hello', messageCount: 2, messages: [] },
          { id: 'c2', title: 'B', content: 'world', messageCount: 3, messages: [] },
        ]),
        addChat:    vi.fn().mockResolvedValue(undefined),
        updateChat: vi.fn().mockResolvedValue([]),
        loadAll:    vi.fn().mockResolvedValue([]),
      },
      tree: {
        getAllTopics:  vi.fn().mockReturnValue([]),
        addTopic:     vi.fn().mockReturnValue('assemblies-topic-id'),
        topics:       {},
        rootTopicIds: [],
      },
      dialog: {
        prompt: vi.fn().mockResolvedValue('My Assembly'),
        form:   vi.fn().mockResolvedValue({ topicId: '__assemblies__' }),
        alert:  vi.fn().mockResolvedValue(undefined),
      },
      topicDialogs: {
        buildTopicOptions: vi.fn().mockReturnValue([]),
      },
      exportDialog: null,
      ...overrides,
    };
  }

  beforeEach(() => {
    document.body.innerHTML = '';
    const toast = document.createElement('div');
    toast.id = 'toast';
    document.body.appendChild(toast);
    const bar = document.createElement('div');
    bar.style.display = 'flex';
    document.body.appendChild(bar);
    elements.selectionBar = bar;
    const btn = document.createElement('button');
    document.body.appendChild(btn);
    elements.multiSelectToggleBtn = btn;
  });

  afterEach(() => {
    state.renderer          = null;
    state.chatRepo          = undefined;
    state.tree              = undefined;
    state.dialog            = undefined;
    state.topicDialogs      = undefined;
    state.exportDialog      = undefined;
    state.chats             = undefined;
    elements.selectionBar   = null;
    elements.multiSelectToggleBtn = null;
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  it('does nothing when renderer is null', async () => {
    state.renderer = null;
    await handleAssemble();
  });

  it('shows error when fewer than 2 chats selected', async () => {
    const st = makeAssembleState();
    st.renderer.getSelectedChats.mockReturnValueOnce([{ id: 'c1' }]);
    Object.assign(state, st);
    await handleAssemble();
    expect(document.getElementById('toast').textContent).toContain('Select at least 2');
  });

  it('shows error when more than 100 chats selected for assembly', async () => {
    const st = makeAssembleState();
    const manyChats = Array.from({ length: 101 }, (_, i) => ({ id: `c${i}` }));
    st.renderer.getSelectedChats.mockReturnValueOnce(manyChats);
    Object.assign(state, st);
    await handleAssemble();
    expect(document.getElementById('toast').textContent).toContain('Cannot assemble more than');
    expect(st.chatRepo.loadFullByIds).not.toHaveBeenCalled();
  });

  it('returns early when prompt is cancelled', async () => {
    const st = makeAssembleState();
    st.renderer.getSelectedChats.mockReturnValueOnce([{ id: 'c1' }, { id: 'c2' }]);
    st.dialog.prompt.mockResolvedValueOnce(null);
    Object.assign(state, st);
    await handleAssemble();
    expect(st.chatRepo.addChat).not.toHaveBeenCalled();
  });

  it('returns early when folder form is cancelled', async () => {
    const st = makeAssembleState();
    st.renderer.getSelectedChats.mockReturnValueOnce([{ id: 'c1' }, { id: 'c2' }]);
    st.dialog.form.mockResolvedValueOnce(null);
    Object.assign(state, st);
    await handleAssemble();
    expect(st.chatRepo.addChat).not.toHaveBeenCalled();
  });

  it('shows error when loadFullByIds throws during assembly', async () => {
    const st = makeAssembleState();
    st.renderer.getSelectedChats.mockReturnValueOnce([{ id: 'c1' }, { id: 'c2' }]);
    st.chatRepo.loadFullByIds.mockRejectedValueOnce(new Error('DB fail'));
    Object.assign(state, st);
    await handleAssemble();
    expect(document.getElementById('toast').textContent).toContain('Failed');
  });

  it('creates an Assemblies folder when none exists and topicId is __assemblies__', async () => {
    const st = makeAssembleState();
    st.renderer.getSelectedChats.mockReturnValueOnce([{ id: 'c1' }, { id: 'c2' }]);
    st.tree.getAllTopics.mockReturnValue([]); // no existing Assemblies topic
    Object.assign(state, st);
    await handleAssemble();
    expect(st.tree.addTopic).toHaveBeenCalledWith('Assemblies');
    expect(st.chatRepo.addChat).toHaveBeenCalled();
  });

  it('reuses existing Assemblies folder when it already exists', async () => {
    const st = makeAssembleState();
    st.renderer.getSelectedChats.mockReturnValueOnce([{ id: 'c1' }, { id: 'c2' }]);
    st.tree.getAllTopics.mockReturnValue([{ id: 'existing-assemblies', name: 'Assemblies', parentId: null }]);
    Object.assign(state, st);
    await handleAssemble();
    expect(st.tree.addTopic).not.toHaveBeenCalled(); // reused
    expect(st.chatRepo.addChat).toHaveBeenCalled();
  });

  it('saves to a specified folder topic when topicId is not __assemblies__', async () => {
    const st = makeAssembleState();
    st.renderer.getSelectedChats.mockReturnValueOnce([{ id: 'c1' }, { id: 'c2' }]);
    st.dialog.form.mockResolvedValueOnce({ topicId: 'my-topic-id' });
    Object.assign(state, st);
    await handleAssemble();
    expect(st.chatRepo.updateChat).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ topicId: 'my-topic-id' })
    );
  });

  it('calls saveTree, loadAll, and renderTreeView on success', async () => {
    const { saveTree, renderTreeView } = await import('../src/sidepanel/controllers/tree-controller.js');
    const st = makeAssembleState();
    st.renderer.getSelectedChats.mockReturnValueOnce([{ id: 'c1' }, { id: 'c2' }]);
    Object.assign(state, st);
    await handleAssemble();
    expect(saveTree).toHaveBeenCalled();
    expect(renderTreeView).toHaveBeenCalled();
    expect(st.chatRepo.loadAll).toHaveBeenCalled();
  });

  it('shows success notification after assembly', async () => {
    const st = makeAssembleState();
    st.renderer.getSelectedChats.mockReturnValueOnce([{ id: 'c1' }, { id: 'c2' }]);
    Object.assign(state, st);
    await handleAssemble();
    expect(document.getElementById('toast').textContent).toContain('My Assembly');
  });

  it('shows error notification when addChat throws', async () => {
    const st = makeAssembleState();
    st.renderer.getSelectedChats.mockReturnValueOnce([{ id: 'c1' }, { id: 'c2' }]);
    st.chatRepo.addChat.mockRejectedValueOnce(new Error('Storage full'));
    Object.assign(state, st);
    await handleAssemble();
    expect(document.getElementById('toast').textContent).toContain('Assembly failed');
  });
});
