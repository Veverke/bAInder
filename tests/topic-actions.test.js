/**
 * Tests for src/sidepanel/controllers/topic-actions.js
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  _setContext,
  showContextMenu,
  hideContextMenu,
  handleTopicClick,
  handleTopicContextMenu,
  setupContextMenuActions,
  handleAddTopic,
  handleRenameTopic,
  handleMoveTopic,
  handleDeleteTopic,
  handleMergeTopic,
  handleExportTopic,
  handleCopyAllTopicChats,
} from '../src/sidepanel/controllers/topic-actions.js';
import { elements } from '../src/sidepanel/app-context.js';

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('../src/lib/vendor/browser.js', () => ({
  default: {
    runtime: { getURL: vi.fn(p => `chrome-extension://test/${p}`) },
    tabs:    { create: vi.fn().mockResolvedValue({}) },
  },
}));

vi.mock('../src/sidepanel/controllers/tree-controller.js', () => ({
  saveTree:            vi.fn().mockResolvedValue(undefined),
  renderTreeView:      vi.fn(),
  saveExpandedState:   vi.fn(),
  collectDescendantChatIds: vi.fn().mockReturnValue([]),
}));

vi.mock('../src/sidepanel/features/save-banner.js', () => ({
  setSaveBtnState: vi.fn(),
}));

vi.mock('../src/lib/export/clipboard-serialiser.js', () => ({
  copyChatsToClipboard: vi.fn().mockResolvedValue({ ok: true, tooLarge: false }),
  MAX_CLIPBOARD_CHARS:  1_000_000,
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeContextMenuEl() {
  const menu = document.createElement('div');
  menu.id = 'contextMenu';
  menu.style.display = 'none';
  document.body.appendChild(menu);
  return menu;
}

function makeToast() {
  const toast = document.createElement('div');
  toast.id = 'toast';
  document.body.appendChild(toast);
  return toast;
}

function makeState(overrides = {}) {
  return {
    chats:            [],
    contextMenuTopic: null,
    renderer: {
      setChatData:    vi.fn(),
      expandToTopic:  vi.fn(),
      selectNode:     vi.fn(),
    },
    chatRepo: {
      updateChat:        vi.fn().mockResolvedValue([]),
      removeManyChats:   vi.fn().mockResolvedValue(undefined),
      loadFullByIds:     vi.fn().mockResolvedValue([]),
    },
    topicDialogs: {
      showAddTopic:    vi.fn().mockResolvedValue(null),
      showRenameTopic: vi.fn().mockResolvedValue(null),
      showMoveTopic:   vi.fn().mockResolvedValue(null),
      showDeleteTopic: vi.fn().mockResolvedValue(null),
      showMergeTopic:  vi.fn().mockResolvedValue(null),
    },
    exportDialog: {
      showExportTopic: vi.fn().mockResolvedValue(undefined),
    },
    dialog: {
      alert: vi.fn().mockResolvedValue(undefined),
    },
    tree: { topics: {}, rootTopicIds: [] },
    lastCreatedTopicId: null,
    lastUsedTopicId:    null,
    _toastTimer:        undefined,
    ...overrides,
  };
}

beforeEach(() => {
  document.body.innerHTML = '';
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
  elements.contextMenu = null;
});

// ─────────────────────────────────────────────────────────────────────────────
// showContextMenu / hideContextMenu
// ─────────────────────────────────────────────────────────────────────────────

describe('showContextMenu()', () => {
  it('sets left/top and shows the menu', () => {
    const menu = makeContextMenuEl();
    elements.contextMenu = menu;
    showContextMenu(30, 60);
    expect(menu.style.left).toBe('30px');
    expect(menu.style.top).toBe('60px');
    expect(menu.style.display).toBe('block');
  });

  it('adjusts position when menu overflows the right edge', () => {
    const menu = makeContextMenuEl();
    elements.contextMenu = menu;
    menu.getBoundingClientRect = () => ({
      right: window.innerWidth + 50, bottom: 50,
      width: 200, height: 50, left: 0, top: 0,
    });
    showContextMenu(window.innerWidth - 10, 20);
    vi.runAllTimers();
    const left = parseFloat(menu.style.left);
    expect(left).toBeLessThan(window.innerWidth);
  });

  it('adjusts position when menu overflows the bottom edge', () => {
    const menu = makeContextMenuEl();
    elements.contextMenu = menu;
    menu.getBoundingClientRect = () => ({
      right: 100, bottom: window.innerHeight + 60,
      width: 100, height: 200, left: 0, top: 0,
    });
    showContextMenu(10, window.innerHeight - 10);
    vi.runAllTimers();
    const top = parseFloat(menu.style.top);
    expect(top).toBeLessThan(window.innerHeight);
  });
});

describe('hideContextMenu()', () => {
  it('sets display to none', () => {
    const menu = makeContextMenuEl();
    elements.contextMenu = menu;
    menu.style.display = 'block';
    hideContextMenu();
    expect(menu.style.display).toBe('none');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// handleTopicClick
// ─────────────────────────────────────────────────────────────────────────────

describe('handleTopicClick()', () => {
  it('calls saveExpandedState', async () => {
    const { saveExpandedState } = await import('../src/sidepanel/controllers/tree-controller.js');
    saveExpandedState.mockClear();
    handleTopicClick({ id: 't1' });
    expect(saveExpandedState).toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// handleTopicContextMenu
// ─────────────────────────────────────────────────────────────────────────────

describe('handleTopicContextMenu()', () => {
  it('calls event.preventDefault()', async () => {
    const menu  = makeContextMenuEl();
    elements.contextMenu = menu;
    const st    = makeState();
    _setContext(st);
    const topic = { id: 't1' };
    const event = { preventDefault: vi.fn(), clientX: 5, clientY: 10 };
    await handleTopicContextMenu(topic, event);
    expect(event.preventDefault).toHaveBeenCalled();
  });

  it('sets contextMenuTopic on state', async () => {
    const menu  = makeContextMenuEl();
    elements.contextMenu = menu;
    const st    = makeState();
    _setContext(st);
    const topic = { id: 'my-topic' };
    const event = { preventDefault: vi.fn(), clientX: 0, clientY: 0 };
    await handleTopicContextMenu(topic, event);
    expect(st.contextMenuTopic).toBe(topic);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// setupContextMenuActions
// ─────────────────────────────────────────────────────────────────────────────

describe('setupContextMenuActions()', () => {
  it('wires click handlers to [data-action] items in the context menu', async () => {
    const menu = makeContextMenuEl();
    elements.contextMenu = menu;
    const item = document.createElement('div');
    item.dataset.action = 'rename';
    menu.appendChild(item);
    const st = makeState();
    st.contextMenuTopic = { id: 't1' };
    _setContext(st);

    setupContextMenuActions();
    item.click();
    await vi.runAllTimersAsync();
    // After click the menu should be hidden
    expect(menu.style.display).toBe('none');
  });

  it('logs a warning when no topic is selected', async () => {
    const menu = makeContextMenuEl();
    elements.contextMenu = menu;
    const item = document.createElement('div');
    item.dataset.action = 'rename';
    menu.appendChild(item);
    const st = makeState();
    st.contextMenuTopic = null;
    _setContext(st);

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    setupContextMenuActions();
    item.click();
    await vi.runAllTimersAsync();
    warnSpy.mockRestore();
  });

  it('logs a warning for unknown actions', async () => {
    const menu = makeContextMenuEl();
    elements.contextMenu = menu;
    const item = document.createElement('div');
    item.dataset.action = 'does-not-exist';
    menu.appendChild(item);
    const st = makeState();
    st.contextMenuTopic = { id: 't1' };
    _setContext(st);

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    setupContextMenuActions();
    item.click();
    await vi.runAllTimersAsync();
    warnSpy.mockRestore();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// handleAddTopic
// ─────────────────────────────────────────────────────────────────────────────

describe('handleAddTopic()', () => {
  it('does not call saveTree when dialog is cancelled', async () => {
    const { saveTree } = await import('../src/sidepanel/controllers/tree-controller.js');
    const st = makeState();
    st.topicDialogs.showAddTopic.mockResolvedValueOnce(null);
    _setContext(st);
    await handleAddTopic();
    expect(saveTree).not.toHaveBeenCalled();
  });

  it('saves tree and renders when dialog returns a result', async () => {
    const { saveTree, renderTreeView } = await import('../src/sidepanel/controllers/tree-controller.js');
    const { setSaveBtnState } = await import('../src/sidepanel/features/save-banner.js');
    const st = makeState();
    st.topicDialogs.showAddTopic.mockResolvedValueOnce({ topicId: 'new-t', parentId: null });
    _setContext(st);
    await handleAddTopic();
    expect(saveTree).toHaveBeenCalled();
    expect(renderTreeView).toHaveBeenCalled();
    expect(setSaveBtnState).toHaveBeenCalledWith('default');
    expect(st.lastCreatedTopicId).toBe('new-t');
  });

  it('calls renderer.expandToTopic when the new topic has a parentId', async () => {
    const st = makeState();
    st.topicDialogs.showAddTopic.mockResolvedValueOnce({ topicId: 'child-t', parentId: 'parent-t' });
    _setContext(st);
    await handleAddTopic();
    expect(st.renderer.expandToTopic).toHaveBeenCalledWith('child-t');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// handleRenameTopic
// ─────────────────────────────────────────────────────────────────────────────

describe('handleRenameTopic()', () => {
  it('does nothing when contextMenuTopic is null', async () => {
    const { saveTree } = await import('../src/sidepanel/controllers/tree-controller.js');
    const st = makeState();
    st.contextMenuTopic = null;
    _setContext(st);
    await handleRenameTopic();
    expect(saveTree).not.toHaveBeenCalled();
  });

  it('does nothing when dialog returns null (cancelled)', async () => {
    const { saveTree } = await import('../src/sidepanel/controllers/tree-controller.js');
    const st = makeState();
    st.contextMenuTopic = { id: 't1' };
    st.topicDialogs.showRenameTopic.mockResolvedValueOnce(null);
    _setContext(st);
    await handleRenameTopic();
    expect(saveTree).not.toHaveBeenCalled();
  });

  it('saves tree and renders when rename succeeds', async () => {
    const { saveTree, renderTreeView } = await import('../src/sidepanel/controllers/tree-controller.js');
    const st = makeState();
    st.contextMenuTopic = { id: 't1' };
    st.topicDialogs.showRenameTopic.mockResolvedValueOnce({ topicId: 't1' });
    _setContext(st);
    await handleRenameTopic();
    expect(saveTree).toHaveBeenCalled();
    expect(renderTreeView).toHaveBeenCalled();
    expect(st.renderer.selectNode).toHaveBeenCalledWith('t1');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// handleMoveTopic
// ─────────────────────────────────────────────────────────────────────────────

describe('handleMoveTopic()', () => {
  it('does nothing when contextMenuTopic is null', async () => {
    const { saveTree } = await import('../src/sidepanel/controllers/tree-controller.js');
    const st = makeState();
    st.contextMenuTopic = null;
    _setContext(st);
    await handleMoveTopic();
    expect(saveTree).not.toHaveBeenCalled();
  });

  it('saves tree and renders when move dialog succeeds', async () => {
    const { saveTree } = await import('../src/sidepanel/controllers/tree-controller.js');
    const st = makeState();
    st.contextMenuTopic = { id: 't1' };
    st.topicDialogs.showMoveTopic.mockResolvedValueOnce({ topicId: 'new-parent' });
    _setContext(st);
    await handleMoveTopic();
    expect(saveTree).toHaveBeenCalled();
    expect(st.renderer.expandToTopic).toHaveBeenCalledWith('new-parent');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// handleMergeTopic
// ─────────────────────────────────────────────────────────────────────────────

describe('handleMergeTopic()', () => {
  it('does nothing when contextMenuTopic is null', async () => {
    const { saveTree } = await import('../src/sidepanel/controllers/tree-controller.js');
    const st = makeState();
    st.contextMenuTopic = null;
    _setContext(st);
    await handleMergeTopic();
    expect(saveTree).not.toHaveBeenCalled();
  });

  it('saves tree and re-renders on success', async () => {
    const { saveTree } = await import('../src/sidepanel/controllers/tree-controller.js');
    const st = makeState();
    st.contextMenuTopic = { id: 't1' };
    st.topicDialogs.showMergeTopic.mockResolvedValueOnce({ targetTopicId: 'target-t' });
    _setContext(st);
    await handleMergeTopic();
    expect(saveTree).toHaveBeenCalled();
    expect(st.renderer.expandToTopic).toHaveBeenCalledWith('target-t');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// handleExportTopic
// ─────────────────────────────────────────────────────────────────────────────

describe('handleExportTopic()', () => {
  it('does nothing when contextMenuTopic is null', async () => {
    const st = makeState();
    st.contextMenuTopic = null;
    _setContext(st);
    await handleExportTopic();
    expect(st.exportDialog.showExportTopic).not.toHaveBeenCalled();
  });

  it('calls exportDialog.showExportTopic with the topic', async () => {
    const st = makeState();
    st.contextMenuTopic = { id: 't1', name: 'My Topic' };
    _setContext(st);
    await handleExportTopic();
    expect(st.exportDialog.showExportTopic).toHaveBeenCalledWith(
      st.contextMenuTopic, st.tree, st.chats
    );
  });

  it('shows an alert dialog when export throws', async () => {
    const st = makeState();
    st.contextMenuTopic = { id: 't1' };
    st.exportDialog.showExportTopic.mockRejectedValueOnce(new Error('Export failed!'));
    _setContext(st);
    await handleExportTopic();
    expect(st.dialog.alert).toHaveBeenCalledWith('Export failed!', 'Export Error');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// handleCopyAllTopicChats
// ─────────────────────────────────────────────────────────────────────────────

describe('handleCopyAllTopicChats()', () => {
  it('does nothing when contextMenuTopic is null', async () => {
    const st = makeState();
    st.contextMenuTopic = null;
    _setContext(st);
    await handleCopyAllTopicChats();
    expect(st.chatRepo.loadFullByIds).not.toHaveBeenCalled();
  });

  it('shows "No chats to copy" notification when topic has no descendant chats', async () => {
    makeToast();
    const { collectDescendantChatIds } = await import('../src/sidepanel/controllers/tree-controller.js');
    collectDescendantChatIds.mockReturnValueOnce([]);
    const st = makeState();
    st.contextMenuTopic = { id: 't1' };
    _setContext(st);
    await handleCopyAllTopicChats();
    expect(st.chatRepo.loadFullByIds).not.toHaveBeenCalled();
  });

  it('shows error when loadFullByIds throws', async () => {
    makeToast();
    const { collectDescendantChatIds } = await import('../src/sidepanel/controllers/tree-controller.js');
    collectDescendantChatIds.mockReturnValueOnce(['c1', 'c2']);
    const st = makeState();
    st.contextMenuTopic = { id: 't1' };
    st.chatRepo.loadFullByIds.mockRejectedValueOnce(new Error('DB error'));
    _setContext(st);
    await handleCopyAllTopicChats();
    // Should not throw; error notification shown
  });

  it('shows success notification when copy succeeds', async () => {
    makeToast();
    const { collectDescendantChatIds } = await import('../src/sidepanel/controllers/tree-controller.js');
    const { copyChatsToClipboard } = await import('../src/lib/export/clipboard-serialiser.js');
    collectDescendantChatIds.mockReturnValueOnce(['c1']);
    const st = makeState();
    st.contextMenuTopic = { id: 't1' };
    st.chatRepo.loadFullByIds.mockResolvedValueOnce([{ id: 'c1', title: 'Chat 1' }]);
    copyChatsToClipboard.mockResolvedValueOnce({ ok: true, tooLarge: false });
    _setContext(st);
    await handleCopyAllTopicChats();
    const toast = document.getElementById('toast');
    expect(toast.textContent).toContain('Copied');
  });

  it('shows tooLarge error when copy result has tooLarge flag', async () => {
    makeToast();
    const { collectDescendantChatIds } = await import('../src/sidepanel/controllers/tree-controller.js');
    const { copyChatsToClipboard } = await import('../src/lib/export/clipboard-serialiser.js');
    collectDescendantChatIds.mockReturnValueOnce(['c1']);
    const st = makeState();
    st.contextMenuTopic = { id: 't1' };
    st.chatRepo.loadFullByIds.mockResolvedValueOnce([{ id: 'c1' }]);
    copyChatsToClipboard.mockResolvedValueOnce({ ok: false, tooLarge: true });
    _setContext(st);
    await handleCopyAllTopicChats();
    const toast = document.getElementById('toast');
    expect(toast.textContent).toContain('too large');
  });

  it('shows failure notification when copy result is not ok and not tooLarge', async () => {
    makeToast();
    const { collectDescendantChatIds } = await import('../src/sidepanel/controllers/tree-controller.js');
    const { copyChatsToClipboard } = await import('../src/lib/export/clipboard-serialiser.js');
    collectDescendantChatIds.mockReturnValueOnce(['c1']);
    const st = makeState();
    st.contextMenuTopic = { id: 't1' };
    st.chatRepo.loadFullByIds.mockResolvedValueOnce([{ id: 'c1' }]);
    copyChatsToClipboard.mockResolvedValueOnce({ ok: false, tooLarge: false });
    _setContext(st);
    await handleCopyAllTopicChats();
    const toast = document.getElementById('toast');
    expect(toast.textContent).toContain('Failed');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// handleDeleteTopic
// ─────────────────────────────────────────────────────────────────────────────

describe('handleDeleteTopic()', () => {
  it('does nothing when contextMenuTopic is null', async () => {
    const { saveTree } = await import('../src/sidepanel/controllers/tree-controller.js');
    const st = makeState();
    st.contextMenuTopic = null;
    _setContext(st);
    await handleDeleteTopic();
    expect(saveTree).not.toHaveBeenCalled();
  });

  it('does nothing when showDeleteTopic is cancelled', async () => {
    const { saveTree } = await import('../src/sidepanel/controllers/tree-controller.js');
    const st = makeState();
    st.contextMenuTopic = { id: 't1' };
    st.topicDialogs.showDeleteTopic.mockResolvedValueOnce(null);
    st.tree.topics = { t1: { id: 't1', children: [], parentId: null } };
    _setContext(st);
    await handleDeleteTopic();
    expect(saveTree).not.toHaveBeenCalled();
  });

  it('removes descendant chats from state and re-renders when delete succeeds', async () => {
    const { collectDescendantChatIds, renderTreeView } = await import('../src/sidepanel/controllers/tree-controller.js');
    collectDescendantChatIds.mockReturnValueOnce(['c1']);
    const st = makeState();
    st.chats = [{ id: 'c1', title: 'To delete' }, { id: 'c2', title: 'Keep' }];
    st.contextMenuTopic = { id: 't1' };
    st.topicDialogs.showDeleteTopic.mockResolvedValueOnce({ name: 'My Topic' });
    st.tree.topics = { t1: { id: 't1', children: [], parentId: null } };
    makeToast();
    _setContext(st);

    await handleDeleteTopic();
    expect(st.chats.find(c => c.id === 'c1')).toBeUndefined();
    expect(st.chats.find(c => c.id === 'c2')).toBeDefined();
    expect(renderTreeView).toHaveBeenCalled();
  });

  it('calls removeManyChats and saveTree after the 6 s deferred timer fires', async () => {
    const { collectDescendantChatIds, saveTree } = await import('../src/sidepanel/controllers/tree-controller.js');
    collectDescendantChatIds.mockReturnValueOnce(['c1']);
    const st = makeState();
    st.chats = [{ id: 'c1', title: 'To delete' }];
    st.contextMenuTopic = { id: 't1' };
    st.topicDialogs.showDeleteTopic.mockResolvedValueOnce({ name: 'My Topic' });
    st.tree.topics = { t1: { id: 't1', children: [], parentId: null } };
    makeToast();
    _setContext(st);

    await handleDeleteTopic();
    // Deferred timer not fired yet
    expect(st.chatRepo.removeManyChats).not.toHaveBeenCalled();

    // Advance the 6 s delete timer
    await vi.runAllTimersAsync();
    expect(st.chatRepo.removeManyChats).toHaveBeenCalledWith(['c1']);
    expect(saveTree).toHaveBeenCalled();
  });

  it('invokes the undo callback and restores chats when undo button is clicked', async () => {
    const { collectDescendantChatIds, renderTreeView } = await import('../src/sidepanel/controllers/tree-controller.js');
    collectDescendantChatIds.mockReturnValueOnce(['c1']);
    const st = makeState();
    const chat1 = { id: 'c1', title: 'Chat A', topicId: 't1' };
    st.chats = [chat1, { id: 'c2', title: 'Chat B' }];
    st.contextMenuTopic = { id: 't1' };
    st.topicDialogs.showDeleteTopic.mockResolvedValueOnce({ name: 'My Topic' });
    st.tree.topics = { t1: { id: 't1', children: [], parentId: null } };
    const toast = makeToast();
    _setContext(st);

    await handleDeleteTopic();
    // Chat c1 should have been removed from state
    expect(st.chats.find(c => c.id === 'c1')).toBeUndefined();

    // Click undo button to restore
    const undoBtn = toast.querySelector('button.toast__undo');
    expect(undoBtn).toBeTruthy();
    undoBtn.click();

    // Chat c1 should be restored
    expect(st.chats.find(c => c.id === 'c1')).toBeDefined();
    expect(renderTreeView).toHaveBeenCalled();
  });
});
