/**
 * Tests for src/sidepanel/controllers/tree-controller.js
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  _setContext,
  showTreeSkeleton,
  removeTreeSkeleton,
  loadTree,
  saveTree,
  saveExpandedState,
  renderTreeView,
  collectDescendantChatIds,
  handleTopicDrop,
  handleChatDrop,
  handleTopicPin,
  initTreeRenderer,
} from '../src/sidepanel/controllers/tree-controller.js';
import { elements } from '../src/sidepanel/app-context.js';

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('../src/lib/renderer/tree-renderer.js', () => {
  class MockTreeRenderer {
    constructor() {
      this.render             = vi.fn();
      this.updateTopicCount   = vi.fn();
      this.setChatData        = vi.fn();
      this.getExpandedState   = vi.fn().mockReturnValue([]);
      this.setExpandedState   = vi.fn();
      this.highlightSearch    = vi.fn();
      this.clearHighlight     = vi.fn();
      this.expandAll          = vi.fn();
      this.expandToTopic      = vi.fn();
      this.onTopicClick       = null;
      this.onTopicContextMenu = null;
      this.onTopicDrop        = null;
      this.onTopicPin         = null;
      this.onChatClick        = null;
      this.onChatContextMenu  = null;
      this.onChatDrop         = null;
      this.onSelectionChange  = null;
      this.multiSelectMode    = false;
      this.sortMode           = 'default';
    }
  }
  return { TreeRenderer: MockTreeRenderer };
});

vi.mock('../src/lib/chat/chat-manager.js', () => ({
  moveChatToTopic: vi.fn((chat, topicId) => ({ ...chat, topicId })),
}));

vi.mock('../src/sidepanel/features/storage-usage.js', () => ({
  updateStorageUsage: vi.fn().mockResolvedValue(undefined),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeTree(overrides = {}) {
  return {
    topics: {},
    rootTopicIds: [],
    getAllTopics:  () => [],
    toObject:     () => ({}),
    moveTopic:    vi.fn(),
    ...overrides,
  };
}

function makeState(overrides = {}) {
  return {
    tree:     makeTree(),
    chats:    [],
    sortMode: 'default',
    renderer: null,
    storage: {
      loadTopicTree: vi.fn().mockResolvedValue({}),
      saveTopicTree: vi.fn().mockResolvedValue(undefined),
    },
    chatRepo: {
      updateChat: vi.fn().mockResolvedValue([]),
    },
    ...overrides,
  };
}

let st;
beforeEach(() => {
  document.body.innerHTML = '';
  st = makeState();
  _setContext(st);
  elements.treeView = null;
  localStorage.clear();
});

afterEach(() => {
  elements.treeView = null;
  document.body.innerHTML = '';
  vi.clearAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────
// showTreeSkeleton / removeTreeSkeleton
// ─────────────────────────────────────────────────────────────────────────────

describe('showTreeSkeleton()', () => {
  it('does nothing when treeView element is absent', () => {
    elements.treeView = null;
    expect(() => showTreeSkeleton()).not.toThrow();
  });

  it('appends skeleton rows to treeView', () => {
    const treeView = document.createElement('div');
    document.body.appendChild(treeView);
    elements.treeView = treeView;
    showTreeSkeleton();
    expect(treeView.querySelectorAll('.skeleton-row').length).toBe(4);
  });

  it('skeleton rows are aria-hidden', () => {
    const treeView = document.createElement('div');
    document.body.appendChild(treeView);
    elements.treeView = treeView;
    showTreeSkeleton();
    const rows = treeView.querySelectorAll('.skeleton-row');
    rows.forEach(row => expect(row.getAttribute('aria-hidden')).toBe('true'));
  });
});

describe('removeTreeSkeleton()', () => {
  it('removes existing skeleton rows', () => {
    const treeView = document.createElement('div');
    document.body.appendChild(treeView);
    elements.treeView = treeView;
    showTreeSkeleton();
    expect(treeView.querySelectorAll('.skeleton-row').length).toBe(4);
    removeTreeSkeleton();
    expect(treeView.querySelectorAll('.skeleton-row').length).toBe(0);
  });

  it('does nothing when treeView is absent', () => {
    elements.treeView = null;
    expect(() => removeTreeSkeleton()).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// loadTree()
// ─────────────────────────────────────────────────────────────────────────────

describe('loadTree()', () => {
  it('calls storage.loadTopicTree and assigns tree to state', async () => {
    st.storage.loadTopicTree.mockResolvedValueOnce({ rootTopicIds: [], topics: {} });
    await loadTree();
    expect(st.storage.loadTopicTree).toHaveBeenCalled();
    expect(st.tree).toBeDefined();
  });

  it('sets state.tree to an empty TopicTree on storage error', async () => {
    st.storage.loadTopicTree.mockRejectedValueOnce(new Error('Storage error'));
    await loadTree();
    // tree should still be defined (reset to empty TopicTree)
    expect(st.tree).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// saveTree()
// ─────────────────────────────────────────────────────────────────────────────

describe('saveTree()', () => {
  it('calls storage.saveTopicTree with tree data', async () => {
    st.tree.toObject = vi.fn().mockReturnValue({ rootTopicIds: [], topics: {} });
    await saveTree();
    expect(st.storage.saveTopicTree).toHaveBeenCalledWith(st.tree.toObject());
  });

  it('shows error notification when save fails', async () => {
    const toast = document.createElement('div');
    toast.id = 'toast';
    document.body.appendChild(toast);
    st.storage.saveTopicTree.mockRejectedValueOnce(new Error('Write error'));
    await saveTree();
    // Should not throw; error notification shown via showNotification
    expect(toast.textContent).toContain('Error');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// saveExpandedState()
// ─────────────────────────────────────────────────────────────────────────────

describe('saveExpandedState()', () => {
  it('does not throw when renderer is null', () => {
    st.renderer = null;
    expect(() => saveExpandedState()).not.toThrow();
  });

  it('persists expanded IDs to localStorage when renderer is set', () => {
    st.renderer = { getExpandedState: vi.fn().mockReturnValue(['t1', 't2']) };
    saveExpandedState();
    const saved = JSON.parse(localStorage.getItem('expandedNodes'));
    expect(saved).toEqual(['t1', 't2']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// renderTreeView()
// ─────────────────────────────────────────────────────────────────────────────

describe('renderTreeView()', () => {
  it('does not throw when renderer is null', () => {
    st.renderer = null;
    expect(() => renderTreeView()).not.toThrow();
  });

  it('calls renderer.render() and updateTopicCount()', () => {
    st.renderer = { render: vi.fn(), updateTopicCount: vi.fn() };
    renderTreeView();
    expect(st.renderer.render).toHaveBeenCalled();
    expect(st.renderer.updateTopicCount).toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// collectDescendantChatIds()
// ─────────────────────────────────────────────────────────────────────────────

describe('collectDescendantChatIds()', () => {
  it('returns empty array when topicId not found', () => {
    st.tree = makeTree({ topics: {} });
    expect(collectDescendantChatIds('missing')).toEqual([]);
  });

  it('returns direct chat IDs for a leaf topic', () => {
    st.tree = makeTree({
      topics: { t1: { id: 't1', chatIds: ['c1', 'c2'], children: [] } },
    });
    expect(collectDescendantChatIds('t1')).toEqual(['c1', 'c2']);
  });

  it('includes chat IDs from nested descendants', () => {
    st.tree = makeTree({
      topics: {
        parent: { id: 'parent',  chatIds: ['p1'],     children: ['child1'] },
        child1: { id: 'child1',  chatIds: ['c1', 'c2'], children: ['grandchild'] },
        grandchild: { id: 'grandchild', chatIds: ['g1'], children: [] },
      },
    });
    const ids = collectDescendantChatIds('parent');
    expect(ids).toEqual(['p1', 'c1', 'c2', 'g1']);
  });

  it('returns empty array when tree itself is falsy', () => {
    st.tree = null;
    expect(collectDescendantChatIds('t1')).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// initTreeRenderer()
// ─────────────────────────────────────────────────────────────────────────────

describe('initTreeRenderer()', () => {
  it('creates a renderer and assigns it to state.renderer', () => {
    const treeView = document.createElement('div');
    document.body.appendChild(treeView);
    elements.treeView = treeView;
    st.tree = makeTree();
    initTreeRenderer({ onTopicClick: vi.fn() });
    expect(st.renderer).toBeTruthy();
  });

  it('restores expanded state from localStorage', () => {
    const treeView = document.createElement('div');
    document.body.appendChild(treeView);
    elements.treeView = treeView;
    localStorage.setItem('expandedNodes', JSON.stringify(['t1', 't2']));
    initTreeRenderer({ onTopicClick: vi.fn() });
    expect(st.renderer.setExpandedState).toHaveBeenCalledWith(['t1', 't2']);
  });

  it('calls populateTopicScope callback if provided', () => {
    const treeView = document.createElement('div');
    document.body.appendChild(treeView);
    elements.treeView = treeView;
    const populateTopicScope = vi.fn();
    initTreeRenderer({ onTopicClick: vi.fn(), populateTopicScope });
    expect(populateTopicScope).toHaveBeenCalled();
  });

  it('wires custom event callbacks', () => {
    const treeView = document.createElement('div');
    document.body.appendChild(treeView);
    elements.treeView = treeView;
    const onTopicClick       = vi.fn();
    const onTopicContextMenu = vi.fn();
    const onChatClick        = vi.fn();
    const onChatContextMenu  = vi.fn();
    const onSelectionChange  = vi.fn();
    initTreeRenderer({ onTopicClick, onTopicContextMenu, onChatClick, onChatContextMenu, onSelectionChange });
    expect(st.renderer.onTopicClick).toBe(onTopicClick);
    expect(st.renderer.onChatClick).toBe(onChatClick);
    expect(st.renderer.onSelectionChange).toBe(onSelectionChange);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// handleTopicDrop()
// ─────────────────────────────────────────────────────────────────────────────

describe('handleTopicDrop()', () => {
  it('does nothing when tree is null', async () => {
    st.tree = null;
    await expect(handleTopicDrop('t1', 't2')).resolves.toBeUndefined();
  });

  it('does nothing when dragged topic is not found', async () => {
    st.tree = makeTree({ topics: {} });
    await expect(handleTopicDrop('missing', 't2')).resolves.toBeUndefined();
  });

  it('does nothing when parentId equals targetTopicId (no-op)', async () => {
    st.tree = makeTree({
      topics: { t1: { id: 't1', parentId: 't2', name: 'Topic 1' } },
    });
    await handleTopicDrop('t1', 't2');
    expect(st.tree.moveTopic).not.toHaveBeenCalled();
  });

  it('moves the topic and saves tree on valid drop', async () => {
    const toast = document.createElement('div');
    toast.id = 'toast';
    document.body.appendChild(toast);
    st.renderer = { render: vi.fn(), updateTopicCount: vi.fn(), expandToTopic: vi.fn(), getExpandedState: vi.fn().mockReturnValue([]) };
    st.tree = makeTree({
      topics: { t1: { id: 't1', parentId: null, name: 'Topic 1' }, t2: { id: 't2' } },
    });
    await handleTopicDrop('t1', 't2');
    expect(st.tree.moveTopic).toHaveBeenCalledWith('t1', 't2');
    expect(st.storage.saveTopicTree).toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// handleChatDrop()
// ─────────────────────────────────────────────────────────────────────────────

describe('handleChatDrop()', () => {
  it('does nothing when chat is not found in state', async () => {
    st.chats = [];
    await handleChatDrop('missing-id', 't1');
    expect(st.chatRepo.updateChat).not.toHaveBeenCalled();
  });

  it('does nothing when chat is already in the target topic', async () => {
    st.chats = [{ id: 'c1', topicId: 't1' }];
    await handleChatDrop('c1', 't1');
    expect(st.chatRepo.updateChat).not.toHaveBeenCalled();
  });

  it('moves chat, saves, and shows success notification', async () => {
    const toast = document.createElement('div');
    toast.id = 'toast';
    document.body.appendChild(toast);
    st.chats = [{ id: 'c1', title: 'My Chat', topicId: 'old-t' }];
    st.renderer = { render: vi.fn(), updateTopicCount: vi.fn(), setChatData: vi.fn(), expandToTopic: vi.fn(), getExpandedState: vi.fn().mockReturnValue([]) };
    st.chatRepo.updateChat.mockResolvedValueOnce([{ id: 'c1', topicId: 'new-t' }]);

    await handleChatDrop('c1', 'new-t');
    expect(st.chatRepo.updateChat).toHaveBeenCalled();
    expect(st.storage.saveTopicTree).toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// handleTopicPin()
// ─────────────────────────────────────────────────────────────────────────────

describe('handleTopicPin()', () => {
  it('does nothing when tree is null', async () => {
    st.tree = null;
    await handleTopicPin('t1', true);
    expect(st.storage.saveTopicTree).not.toHaveBeenCalled();
  });

  it('does nothing when topic is not found', async () => {
    st.tree = makeTree({ topics: {} });
    await handleTopicPin('missing', true);
    expect(st.storage.saveTopicTree).not.toHaveBeenCalled();
  });

  it('pins a topic, saves tree, and shows notification', async () => {
    const toast = document.createElement('div');
    toast.id = 'toast';
    document.body.appendChild(toast);
    st.renderer = { render: vi.fn(), updateTopicCount: vi.fn() };
    st.tree = makeTree({
      topics: { t1: { id: 't1', name: 'Work', pinned: false } },
    });
    await handleTopicPin('t1', true);
    expect(st.tree.topics.t1.pinned).toBe(true);
    expect(st.storage.saveTopicTree).toHaveBeenCalled();
    expect(toast.textContent).toContain('pinned');
  });

  it('unpins a topic and shows "unpinned" notification', async () => {
    const toast = document.createElement('div');
    toast.id = 'toast';
    document.body.appendChild(toast);
    st.renderer = { render: vi.fn(), updateTopicCount: vi.fn() };
    st.tree = makeTree({
      topics: { t1: { id: 't1', name: 'Work', pinned: true } },
    });
    await handleTopicPin('t1', false);
    expect(st.tree.topics.t1.pinned).toBe(false);
    expect(toast.textContent).toContain('unpinned');
  });
});
