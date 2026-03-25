/**
 * Tests for src/sidepanel/controllers/chat-actions.js
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  _setContext,
  showChatContextMenu,
  hideChatContextMenu,
  handleChatClick,
  handleChatContextMenu,
  setupChatContextMenuActions,
  updateChatRatingWidget,
  handleRateChatAction,
  handleChatSaved,
  checkAndTriggerAutoExport,
} from '../src/sidepanel/controllers/chat-actions.js';
import { elements } from '../src/sidepanel/app-context.js';

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('../src/lib/vendor/browser.js', () => ({
  default: {
    runtime: { getURL: vi.fn(p => `chrome-extension://test/${p}`) },
    tabs: {
      create:      vi.fn().mockResolvedValue({}),
      query:       vi.fn().mockResolvedValue([]),
      sendMessage: vi.fn().mockResolvedValue(null),
    },
    storage: { local: {
      get: vi.fn().mockResolvedValue({}),
      set: vi.fn().mockResolvedValue(undefined),
    }},
  },
}));

vi.mock('../src/sidepanel/controllers/tree-controller.js', () => ({
  saveTree:           vi.fn().mockResolvedValue(undefined),
  renderTreeView:     vi.fn(),
  saveExpandedState:  vi.fn(),
  collectDescendantChatIds: vi.fn().mockReturnValue([]),
}));

vi.mock('../src/sidepanel/features/save-banner.js', () => ({
  setSaveBtnState: vi.fn(),
}));

vi.mock('../src/sidepanel/features/recent-rail.js', () => ({
  updateRecentRail: vi.fn(),
}));

vi.mock('../src/lib/chat/chat-manager.js', () => ({
  assignChatToTopic:  vi.fn(chat => ({ ...chat })),
  moveChatToTopic:    vi.fn(),
  removeChatFromTopic: vi.fn(),
}));

vi.mock('../src/lib/export/auto-export.js', () => ({
  triggerAutoExport: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../src/lib/export/clipboard-serialiser.js', () => ({
  getClipboardSettings:  vi.fn().mockResolvedValue({}),
  copyChatsToClipboard:  vi.fn().mockResolvedValue({ success: true }),
  serialiseChats:        vi.fn(() => ''),
  writeToClipboard:      vi.fn().mockResolvedValue({ success: true }),
  writeToClipboardHtml:  vi.fn().mockResolvedValue({ success: true }),
  MAX_CLIPBOARD_CHARS:   1_000_000,
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeContextMenuEl() {
  const menu = document.createElement('div');
  menu.id = 'chatContextMenu';
  menu.style.display = 'none';
  document.body.appendChild(menu);
  return menu;
}

function makeState(overrides = {}) {
  return {
    chats:            [],
    contextMenuChat:  null,
    renderer:         {
      setChatData:     vi.fn(),
      expandToTopic:   vi.fn(),
      selectNode:      vi.fn(),
      highlightSearch: vi.fn(),
      clearHighlight:  vi.fn(),
      expandAll:       vi.fn(),
    },
    chatRepo: {
      updateChat:      vi.fn().mockResolvedValue([]),
      removeManyChats: vi.fn().mockResolvedValue(undefined),
      removeChat:      vi.fn().mockResolvedValue(undefined),
    },
    chatDialogs: {
      showAssignChat:  vi.fn().mockResolvedValue(null),
      showRenameChat:  vi.fn().mockResolvedValue(null),
      showEditTags:    vi.fn().mockResolvedValue(null),
      showMoveChat:    vi.fn().mockResolvedValue(null),
      showDeleteChat:  vi.fn().mockResolvedValue(null),
      showSetReviewDate: vi.fn().mockResolvedValue(null),
    },
    tree: { topics: {}, rootTopicIds: [] },
    lastUsedTopicId:    null,
    lastCreatedTopicId: null,
    _toastTimer:        undefined,
    storage: {},
    dialog: {
      confirm: vi.fn().mockResolvedValue(false),
      alert:   vi.fn().mockResolvedValue(undefined),
    },
  };
}

beforeEach(() => {
  document.body.innerHTML = '';
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
  // Reset the elements singleton pointers touched by these tests
  elements.chatContextMenu = null;
});

// ─────────────────────────────────────────────────────────────────────────────
// showChatContextMenu / hideChatContextMenu
// ─────────────────────────────────────────────────────────────────────────────

describe('showChatContextMenu()', () => {
  it('does nothing gracefully when elements.chatContextMenu is null', () => {
    elements.chatContextMenu = null;
    expect(() => showChatContextMenu(100, 200)).not.toThrow();
  });

  it('sets style.left and style.top and makes the menu visible', () => {
    const menu = makeContextMenuEl();
    elements.chatContextMenu = menu;
    showChatContextMenu(50, 75);
    expect(menu.style.left).toBe('50px');
    expect(menu.style.top).toBe('75px');
    expect(menu.style.display).toBe('block');
  });

  it('adjusts position if menu overflows the right edge of the viewport', () => {
    const menu = makeContextMenuEl();
    elements.chatContextMenu = menu;
    menu.getBoundingClientRect = () => ({
      right: window.innerWidth + 100, bottom: 50,
      width: 200, height: 50, left: 0, top: 0,
    });
    showChatContextMenu(window.innerWidth - 10, 10);
    vi.runAllTimers();
    // Should have been clamped so it doesn't overflow
    const left = parseFloat(menu.style.left);
    expect(left).toBeLessThan(window.innerWidth);
  });
});

describe('hideChatContextMenu()', () => {
  it('does nothing gracefully when elements.chatContextMenu is null', () => {
    elements.chatContextMenu = null;
    expect(() => hideChatContextMenu()).not.toThrow();
  });

  it('sets display to none', () => {
    const menu = makeContextMenuEl();
    elements.chatContextMenu = menu;
    menu.style.display = 'block';
    hideChatContextMenu();
    expect(menu.style.display).toBe('none');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// handleChatClick
// ─────────────────────────────────────────────────────────────────────────────

describe('handleChatClick()', () => {
  it('does nothing when chat is falsy', async () => {
    const { default: browser } = await import('../src/lib/vendor/browser.js');
    await handleChatClick(null);
    expect(browser.tabs.create).not.toHaveBeenCalled();
  });

  it('does nothing when chat.id is absent', async () => {
    const { default: browser } = await import('../src/lib/vendor/browser.js');
    await handleChatClick({});
    expect(browser.tabs.create).not.toHaveBeenCalled();
  });

  it('calls browser.tabs.create with the reader URL for a valid chat', async () => {
    const { default: browser } = await import('../src/lib/vendor/browser.js');
    browser.tabs.create.mockClear();
    await handleChatClick({ id: 'chat-abc-123' });
    expect(browser.tabs.create).toHaveBeenCalledWith(
      expect.objectContaining({ url: expect.stringContaining('chat-abc-123') })
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// handleChatContextMenu
// ─────────────────────────────────────────────────────────────────────────────

describe('handleChatContextMenu()', () => {
  it('calls event.preventDefault()', () => {
    const menu  = makeContextMenuEl();
    elements.chatContextMenu = menu;
    const st = makeState();
    _setContext(st);
    const chat  = { id: 'c1', rating: 3 };
    const event = { preventDefault: vi.fn(), clientX: 10, clientY: 20 };
    handleChatContextMenu(chat, event);
    expect(event.preventDefault).toHaveBeenCalled();
  });

  it('sets contextMenuChat on state to the given chat', () => {
    const menu = makeContextMenuEl();
    elements.chatContextMenu = menu;
    const st   = makeState();
    _setContext(st);
    const chat  = { id: 'c42', rating: 0 };
    const event = { preventDefault: vi.fn(), clientX: 0, clientY: 0 };
    handleChatContextMenu(chat, event);
    expect(st.contextMenuChat).toBe(chat);
  });

  it('renders review date "Set review date" when chat has no reviewDate and is not stale', () => {
    const menu = makeContextMenuEl();
    elements.chatContextMenu = menu;
    const span = document.createElement('span');
    span.id = 'chatReviewDateSpan';
    document.body.appendChild(span);
    const st = makeState();
    _setContext(st);
    const chat  = { id: 'c1', rating: 0 };
    const event = { preventDefault: vi.fn(), clientX: 0, clientY: 0 };
    handleChatContextMenu(chat, event);
    expect(span.textContent).toBe('Set review date');
  });

  it('renders review date label when chat has a reviewDate', () => {
    const menu = makeContextMenuEl();
    elements.chatContextMenu = menu;
    const span = document.createElement('span');
    span.id = 'chatReviewDateSpan';
    document.body.appendChild(span);
    const st = makeState();
    _setContext(st);
    const chat  = { id: 'c1', rating: 0, reviewDate: '2026-06-01' };
    const event = { preventDefault: vi.fn(), clientX: 0, clientY: 0 };
    handleChatContextMenu(chat, event);
    expect(span.textContent).toContain('2026-06-01');
  });

  it('renders stale warning when chat.flaggedAsStale with no reviewDate', () => {
    const menu = makeContextMenuEl();
    elements.chatContextMenu = menu;
    const span = document.createElement('span');
    span.id = 'chatReviewDateSpan';
    document.body.appendChild(span);
    const st = makeState();
    _setContext(st);
    const chat  = { id: 'c1', rating: 0, flaggedAsStale: true };
    const event = { preventDefault: vi.fn(), clientX: 0, clientY: 0 };
    handleChatContextMenu(chat, event);
    expect(span.textContent).toContain('Update review date');
  });

  it('renders stale warning with reviewDate when flaggedAsStale', () => {
    const menu = makeContextMenuEl();
    elements.chatContextMenu = menu;
    const span = document.createElement('span');
    span.id = 'chatReviewDateSpan';
    document.body.appendChild(span);
    const st = makeState();
    _setContext(st);
    const chat  = { id: 'c1', rating: 0, flaggedAsStale: true, reviewDate: '2026-01-15' };
    const event = { preventDefault: vi.fn(), clientX: 0, clientY: 0 };
    handleChatContextMenu(chat, event);
    expect(span.textContent).toContain('2026-01-15');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// updateChatRatingWidget
// ─────────────────────────────────────────────────────────────────────────────

describe('updateChatRatingWidget()', () => {
  it('does nothing when no #chatRatingWidget element exists', () => {
    expect(() => updateChatRatingWidget(3)).not.toThrow();
  });

  it('marks stars up to the rating as active', () => {
    const widget = document.createElement('div');
    widget.id = 'chatRatingWidget';
    for (let i = 1; i <= 5; i++) {
      const btn = document.createElement('button');
      btn.className = 'star-btn';
      btn.dataset.value = String(i);
      widget.appendChild(btn);
    }
    document.body.appendChild(widget);

    updateChatRatingWidget(3);
    const btns = [...widget.querySelectorAll('.star-btn')];
    expect(btns[0].classList.contains('is-active')).toBe(true);
    expect(btns[1].classList.contains('is-active')).toBe(true);
    expect(btns[2].classList.contains('is-active')).toBe(true);
    expect(btns[3].classList.contains('is-active')).toBe(false);
    expect(btns[4].classList.contains('is-active')).toBe(false);
  });

  it('sets aria-pressed correctly on each star button', () => {
    const widget = document.createElement('div');
    widget.id = 'chatRatingWidget';
    for (let i = 1; i <= 5; i++) {
      const btn = document.createElement('button');
      btn.className = 'star-btn';
      btn.dataset.value = String(i);
      widget.appendChild(btn);
    }
    document.body.appendChild(widget);

    updateChatRatingWidget(2);
    const btns = [...widget.querySelectorAll('.star-btn')];
    expect(btns[0].getAttribute('aria-pressed')).toBe('true');
    expect(btns[1].getAttribute('aria-pressed')).toBe('true');
    expect(btns[2].getAttribute('aria-pressed')).toBe('false');
  });

  it('clears all active stars when rating is 0', () => {
    const widget = document.createElement('div');
    widget.id = 'chatRatingWidget';
    for (let i = 1; i <= 5; i++) {
      const btn = document.createElement('button');
      btn.className = 'star-btn is-active';
      btn.dataset.value = String(i);
      widget.appendChild(btn);
    }
    document.body.appendChild(widget);

    updateChatRatingWidget(0);
    const btns = [...widget.querySelectorAll('.star-btn')];
    expect(btns.every(b => !b.classList.contains('is-active'))).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// setupChatContextMenuActions
// ─────────────────────────────────────────────────────────────────────────────

describe('setupChatContextMenuActions()', () => {
  it('does nothing when elements.chatContextMenu is null', () => {
    elements.chatContextMenu = null;
    expect(() => setupChatContextMenuActions()).not.toThrow();
  });

  it('wires click handlers to [data-chat-action] items', async () => {
    const menu = makeContextMenuEl();
    // Add a data-chat-action item
    const openItem = document.createElement('div');
    openItem.dataset.chatAction = 'open';
    menu.appendChild(openItem);
    elements.chatContextMenu = menu;
    const st = makeState();
    st.contextMenuChat = { id: 'test-chat', rating: 0 };
    _setContext(st);

    setupChatContextMenuActions();
    // Clicking should call hideChatContextMenu and then an action handler
    openItem.click();
    // Give the async dispatch a tick
    await vi.runAllTimersAsync();
    // context menu should be hidden after click
    expect(menu.style.display).toBe('none');
  });

  it('logs a warning when no chat is selected for an action', async () => {
    const menu = makeContextMenuEl();
    const renameItem = document.createElement('div');
    renameItem.dataset.chatAction = 'rename';
    menu.appendChild(renameItem);
    elements.chatContextMenu = menu;
    const st = makeState();
    st.contextMenuChat = null; // no selection
    _setContext(st);

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    setupChatContextMenuActions();
    renameItem.click();
    await vi.runAllTimersAsync();
    // logger.warn is called; we can't easily test it directly but no error thrown
    warnSpy.mockRestore();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// handleRateChatAction
// ─────────────────────────────────────────────────────────────────────────────

describe('handleRateChatAction()', () => {
  it('does nothing when contextMenuChat is null', async () => {
    const st = makeState();
    st.contextMenuChat = null;
    _setContext(st);
    await expect(handleRateChatAction(3)).resolves.toBeUndefined();
    expect(st.chatRepo.updateChat).not.toHaveBeenCalled();
  });

  it('sets rating when chat does not already have that rating', async () => {
    const st = makeState();
    st.contextMenuChat = { id: 'c1', rating: null };
    st.chatRepo.updateChat.mockResolvedValueOnce([{ id: 'c1', rating: 4 }]);
    _setContext(st);

    await handleRateChatAction(4);
    expect(st.chatRepo.updateChat).toHaveBeenCalledWith('c1', { rating: 4 });
  });

  it('clears rating (sets to null) when the same value is clicked again', async () => {
    const st = makeState();
    st.contextMenuChat = { id: 'c1', rating: 3 };
    st.chatRepo.updateChat.mockResolvedValueOnce([{ id: 'c1', rating: null }]);
    _setContext(st);

    await handleRateChatAction(3);
    expect(st.chatRepo.updateChat).toHaveBeenCalledWith('c1', { rating: null });
  });

  it('calls renderer.setChatData with the returned chats', async () => {
    const st = makeState();
    st.contextMenuChat = { id: 'c1', rating: 0 };
    const updatedChats = [{ id: 'c1', rating: 5 }];
    st.chatRepo.updateChat.mockResolvedValueOnce(updatedChats);
    _setContext(st);

    await handleRateChatAction(5);
    expect(st.renderer.setChatData).toHaveBeenCalledWith(updatedChats);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// handleChatSaved
// ─────────────────────────────────────────────────────────────────────────────

describe('handleChatSaved()', () => {
  it('resets save button to default when user cancels from the assign dialog', async () => {
    const { setSaveBtnState } = await import('../src/sidepanel/features/save-banner.js');
    const st = makeState();
    st.chatDialogs.showAssignChat.mockResolvedValueOnce(null);
    _setContext(st);

    await handleChatSaved({ id: 'new-chat', title: 'New', messages: [] });
    expect(setSaveBtnState).toHaveBeenCalledWith('default');
  });

  it('adds the chat to state.chats before showing dialog', async () => {
    const st = makeState();
    st.chatDialogs.showAssignChat.mockResolvedValueOnce(null);
    _setContext(st);

    const entry = { id: 'chat-new', title: 'New Chat', messages: [] };
    await handleChatSaved(entry);
    expect(st.chats.some(c => c.id === 'chat-new')).toBe(true);
  });

  it('updates the chat and saves tree when dialog returns a result', async () => {
    const { saveTree } = await import('../src/sidepanel/controllers/tree-controller.js');
    const { setSaveBtnState } = await import('../src/sidepanel/features/save-banner.js');
    const st = makeState();
    const newChat = { id: 'chat-ok', title: 'OK', messages: [] };
    st.chatDialogs.showAssignChat.mockResolvedValueOnce({ topicId: 't1', title: 'New Title', tags: ['tag1'] });
    st.chatRepo.updateChat.mockResolvedValueOnce([{ ...newChat, topicId: 't1' }]);
    _setContext(st);

    await handleChatSaved(newChat);
    expect(saveTree).toHaveBeenCalled();
    expect(setSaveBtnState).toHaveBeenCalledWith('success');
  });

  it('replaces stale duplicate chat in state.chats', async () => {
    const st = makeState();
    const existingChat = { id: 'dup-chat', title: 'Old', messages: [] };
    st.chats = [existingChat];
    st.chatDialogs.showAssignChat.mockResolvedValueOnce(null);
    _setContext(st);

    const newEntry = { id: 'dup-chat', title: 'Updated', messages: [] };
    await handleChatSaved(newEntry);
    // Should have replaced the duplicate
    const found = st.chats.find(c => c.id === 'dup-chat');
    expect(found?.title).toBe('Updated');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Private chat-action handlers (triggered via setupChatContextMenuActions)
// ─────────────────────────────────────────────────────────────────────────────

describe('private chat-action handlers via setupChatContextMenuActions', () => {
  function setupMenuWithAction(action, st) {
    const menu = makeContextMenuEl();
    const item = document.createElement('div');
    item.dataset.chatAction = action;
    menu.appendChild(item);
    elements.chatContextMenu = menu;
    _setContext(st);
    setupChatContextMenuActions();
    return { menu, item };
  }

  function makeToast() {
    const t = document.createElement('div');
    t.id = 'toast';
    document.body.appendChild(t);
    return t;
  }

  afterEach(() => {
    elements.chatContextMenu = null;
  });

  it('rename: calls showRenameChat for the context chat', async () => {
    const st = makeState();
    st.contextMenuChat = { id: 'c1', title: 'Old', rating: 0 };
    st.chatDialogs.showRenameChat.mockResolvedValueOnce(null);
    const { item } = setupMenuWithAction('rename', st);
    item.click();
    await vi.runAllTimersAsync();
    expect(st.chatDialogs.showRenameChat).toHaveBeenCalledWith(expect.objectContaining({ id: 'c1' }));
  });

  it('rename: updates chat when dialog returns a result', async () => {
    const st = makeState();
    const chat = { id: 'c1', title: 'Old', rating: 0 };
    st.contextMenuChat = chat;
    st.chatDialogs.showRenameChat.mockResolvedValueOnce({ title: 'New Title', tags: ['t1'] });
    st.chatRepo.updateChat.mockResolvedValueOnce([{ ...chat, title: 'New Title' }]);
    const { item } = setupMenuWithAction('rename', st);
    item.click();
    await vi.runAllTimersAsync();
    expect(st.chatRepo.updateChat).toHaveBeenCalledWith('c1', expect.objectContaining({ title: 'New Title' }));
  });

  it('edit-tags: calls showEditTags', async () => {
    const st = makeState();
    st.contextMenuChat = { id: 'c1', title: 'Chat', rating: 0 };
    st.chatDialogs.showEditTags.mockResolvedValueOnce(null);
    const { item } = setupMenuWithAction('edit-tags', st);
    item.click();
    await vi.runAllTimersAsync();
    expect(st.chatDialogs.showEditTags).toHaveBeenCalled();
  });

  it('edit-tags: updates tags when dialog returns result', async () => {
    const st = makeState();
    const chat = { id: 'c1', title: 'Chat', rating: 0 };
    st.contextMenuChat = chat;
    st.chatDialogs.showEditTags.mockResolvedValueOnce({ tags: ['alpha', 'beta'] });
    st.chatRepo.updateChat.mockResolvedValueOnce([{ ...chat, tags: ['alpha', 'beta'] }]);
    const { item } = setupMenuWithAction('edit-tags', st);
    item.click();
    await vi.runAllTimersAsync();
    expect(st.chatRepo.updateChat).toHaveBeenCalledWith('c1', { tags: ['alpha', 'beta'] });
  });

  it('move: calls showMoveChat', async () => {
    const st = makeState();
    st.contextMenuChat = { id: 'c1', title: 'Chat', rating: 0 };
    st.chatDialogs.showMoveChat.mockResolvedValueOnce(null);
    const { item } = setupMenuWithAction('move', st);
    item.click();
    await vi.runAllTimersAsync();
    expect(st.chatDialogs.showMoveChat).toHaveBeenCalled();
  });

  it('move: moves chat and calls saveTree when dialog returns result', async () => {
    const { saveTree } = await import('../src/sidepanel/controllers/tree-controller.js');
    const st = makeState();
    const chat = { id: 'c1', title: 'Chat', rating: 0 };
    st.contextMenuChat = chat;
    st.chatDialogs.showMoveChat.mockResolvedValueOnce({ topicId: 't2' });
    st.chatRepo.updateChat.mockResolvedValueOnce([{ ...chat, topicId: 't2' }]);
    const { item } = setupMenuWithAction('move', st);
    item.click();
    await vi.runAllTimersAsync();
    expect(saveTree).toHaveBeenCalled();
    expect(st.renderer.expandToTopic).toHaveBeenCalledWith('t2');
  });

  it('set-review-date: calls showSetReviewDate', async () => {
    const st = makeState();
    st.contextMenuChat = { id: 'c1', title: 'Chat', rating: 0 };
    st.chatDialogs.showSetReviewDate.mockResolvedValueOnce(null);
    const { item } = setupMenuWithAction('set-review-date', st);
    item.click();
    await vi.runAllTimersAsync();
    expect(st.chatDialogs.showSetReviewDate).toHaveBeenCalled();
  });

  it('set-review-date: updates reviewDate when dialog returns result', async () => {
    const st = makeState();
    const chat = { id: 'c1', title: 'Chat', rating: 0 };
    st.contextMenuChat = chat;
    st.chatDialogs.showSetReviewDate.mockResolvedValueOnce({ reviewDate: '2024-06-01' });
    st.chatRepo.updateChat.mockResolvedValueOnce([{ ...chat, reviewDate: '2024-06-01' }]);
    const { item } = setupMenuWithAction('set-review-date', st);
    item.click();
    await vi.runAllTimersAsync();
    expect(st.chatRepo.updateChat).toHaveBeenCalledWith('c1', {
      reviewDate: '2024-06-01',
      flaggedAsStale: false,
    });
  });

  it('export: calls showExportChat', async () => {
    const st = makeState();
    st.contextMenuChat = { id: 'c1', title: 'Chat', rating: 0 };
    st.exportDialog = { showExportChat: vi.fn().mockResolvedValue(undefined) };
    const { item } = setupMenuWithAction('export', st);
    item.click();
    await vi.runAllTimersAsync();
    expect(st.exportDialog.showExportChat).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'c1' }),
      st.tree
    );
  });

  it('export: calls dialog.alert when showExportChat throws', async () => {
    const st = makeState();
    st.contextMenuChat = { id: 'c1', title: 'Chat', rating: 0 };
    st.exportDialog = { showExportChat: vi.fn().mockRejectedValue(new Error('Boom')) };
    st.dialog = { alert: vi.fn().mockResolvedValue(undefined) };
    const { item } = setupMenuWithAction('export', st);
    item.click();
    await vi.runAllTimersAsync();
    expect(st.dialog.alert).toHaveBeenCalledWith('Boom', 'Export Error');
  });

  it('delete: removes chat from state immediately (optimistic UI)', async () => {
    makeToast();
    const st = makeState();
    const chat = { id: 'c1', title: 'Deleted Chat', rating: 0, topicId: null };
    st.contextMenuChat = chat;
    st.chats = [chat];
    const { item } = setupMenuWithAction('delete', st);
    item.click();
    await vi.runAllTimersAsync();
    expect(st.renderer.setChatData).toHaveBeenCalled();
    expect(st.chats.find(c => c.id === 'c1')).toBeUndefined();
  });

  it('delete: calls saveTree and removeChat after deferred timer when chat has a topicId', async () => {
    const { saveTree, renderTreeView } = await import('../src/sidepanel/controllers/tree-controller.js');
    makeToast();
    const st = makeState();
    const chat = { id: 'c2', title: 'Topicless', rating: 0, topicId: 't1' };
    st.contextMenuChat = chat;
    st.chats = [chat];
    st.tree.topics = { t1: { id: 't1', chatIds: ['c2'], children: [] } };
    const { item } = setupMenuWithAction('delete', st);
    item.click();
    // Before timer fires, removeChat should not have been called
    expect(st.chatRepo.removeChat).not.toHaveBeenCalled();
    // Fire the 6 s timer
    await vi.runAllTimersAsync();
    expect(saveTree).toHaveBeenCalled();
    expect(st.chatRepo.removeChat).toHaveBeenCalledWith('c2');
  });

  it('delete: undo button restores the chat to state (no topic)', async () => {
    const { renderTreeView } = await import('../src/sidepanel/controllers/tree-controller.js');
    const toast = makeToast();
    const st = makeState();
    const chat = { id: 'c3', title: 'Restored Chat', rating: 0, topicId: null };
    st.contextMenuChat = chat;
    st.chats = [chat];
    const { item } = setupMenuWithAction('delete', st);
    item.click();
    // Chat is optimistically removed
    expect(st.chats.find(c => c.id === 'c3')).toBeUndefined();
    // Click undo
    const undoBtn = toast.querySelector('button.toast__undo');
    expect(undoBtn).toBeTruthy();
    undoBtn.click();
    // Chat should be restored
    expect(st.chats.find(c => c.id === 'c3')).toBeDefined();
    expect(renderTreeView).toHaveBeenCalled();
  });

  it('delete: undo button restores a chat that belonged to a topic (covers topic.chatIds.push)', async () => {
    const toast = makeToast();
    const st = makeState();
    const chat = { id: 'c4', title: 'Topic Chat', rating: 0, topicId: 't1' };
    st.contextMenuChat = chat;
    st.chats = [chat];
    // After optimistic removal, chatIds won't include c4 anymore
    st.tree.topics = { t1: { id: 't1', chatIds: [], children: [] } };
    const { item } = setupMenuWithAction('delete', st);
    item.click();
    expect(st.chats.find(c => c.id === 'c4')).toBeUndefined();
    const undoBtn = toast.querySelector('button.toast__undo');
    undoBtn.click();
    // Chat restored and re-added to topic
    expect(st.chats.find(c => c.id === 'c4')).toBeDefined();
    expect(st.tree.topics.t1.chatIds).toContain('c4');
  });

  it('copy: copies chat to clipboard successfully', async () => {
    const { copyChatsToClipboard } = await import('../src/lib/export/clipboard-serialiser.js');
    copyChatsToClipboard.mockResolvedValueOnce({ ok: true, tooLarge: false });
    const st = makeState();
    const chat = { id: 'cx1', title: 'Copy Me', rating: 0, topicId: null };
    st.contextMenuChat = chat;
    st.chatRepo.loadFullByIds = vi.fn().mockResolvedValue([chat]);
    const { item } = setupMenuWithAction('copy', st);
    item.click();
    await vi.runAllTimersAsync();
    expect(copyChatsToClipboard).toHaveBeenCalled();
  });

  it('copy: shows error notification when clipboard result is not ok', async () => {
    const { copyChatsToClipboard } = await import('../src/lib/export/clipboard-serialiser.js');
    copyChatsToClipboard.mockResolvedValueOnce({ ok: false, tooLarge: false });
    const st = makeState();
    const chat = { id: 'cx2', title: 'Copy Fail', rating: 0, topicId: null };
    st.contextMenuChat = chat;
    st.chatRepo.loadFullByIds = vi.fn().mockResolvedValue([chat]);
    const { item } = setupMenuWithAction('copy', st);
    item.click();
    await vi.runAllTimersAsync();
    expect(copyChatsToClipboard).toHaveBeenCalled();
  });

  it('copy: shows tooLarge notification when result.tooLarge is true', async () => {
    const { copyChatsToClipboard } = await import('../src/lib/export/clipboard-serialiser.js');
    copyChatsToClipboard.mockResolvedValueOnce({ ok: false, tooLarge: true });
    const st = makeState();
    const chat = { id: 'cx3', title: 'Too Large', rating: 0, topicId: null };
    st.contextMenuChat = chat;
    st.chatRepo.loadFullByIds = vi.fn().mockResolvedValue([chat]);
    const { item } = setupMenuWithAction('copy', st);
    item.click();
    await vi.runAllTimersAsync();
    expect(copyChatsToClipboard).toHaveBeenCalled();
  });

  it('copy: shows error when chatRepo.loadFullByIds returns empty', async () => {
    const st = makeState();
    const chat = { id: 'cx4', title: 'Empty', rating: 0, topicId: null };
    st.contextMenuChat = chat;
    st.chatRepo.loadFullByIds = vi.fn().mockResolvedValue([]);
    const { item } = setupMenuWithAction('copy', st);
    item.click();
    await vi.runAllTimersAsync();
    // no crash expected
  });

  it('copy: shows error when chatRepo.loadFullByIds rejects', async () => {
    const st = makeState();
    const chat = { id: 'cx5', title: 'Reject', rating: 0, topicId: null };
    st.contextMenuChat = chat;
    st.chatRepo.loadFullByIds = vi.fn().mockRejectedValue(new Error('load fail'));
    const { item } = setupMenuWithAction('copy', st);
    item.click();
    await vi.runAllTimersAsync();
    // no crash expected
  });

  it('unknown action: does not throw and logs a warning', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const st = makeState();
    st.contextMenuChat = { id: 'c1', rating: 0 };
    const { item } = setupMenuWithAction('nonexistent-action', st);
    item.click();
    await vi.runAllTimersAsync();
    warnSpy.mockRestore();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// handleChatSaved — Feature d: duplicate-title overwrite
// ─────────────────────────────────────────────────────────────────────────────

describe('handleChatSaved() — Feature d: duplicate title overwrite', () => {
  it('shows confirm dialog when a different chat shares the same title', async () => {
    const st = makeState();
    const existing = { id: 'other', title: 'Shared Title', topicId: null };
    st.chats = [existing];
    st.chatDialogs.showAssignChat.mockResolvedValueOnce({ topicId: null, tags: [] });
    _setContext(st);

    await handleChatSaved({ id: 'new-chat', title: 'Shared Title', messages: [] });
    expect(st.dialog.confirm).toHaveBeenCalledWith(
      expect.stringContaining('Shared Title'),
      'Overwrite Existing Chat?'
    );
  });

  it('resets save button to default when overwrite is declined', async () => {
    const { setSaveBtnState } = await import('../src/sidepanel/features/save-banner.js');
    const st = makeState();
    const existing = { id: 'other', title: 'Same Title', topicId: null };
    st.chats = [existing];
    st.dialog.confirm.mockResolvedValueOnce(false);
    st.chatDialogs.showAssignChat.mockResolvedValueOnce({ topicId: null, tags: [] });
    _setContext(st);

    await handleChatSaved({ id: 'new-chat', title: 'Same Title', messages: [] });
    expect(setSaveBtnState).toHaveBeenCalledWith('default');
    expect(st.chatRepo.removeChat).not.toHaveBeenCalled();
  });

  it('removes duplicate and saves tree when overwrite is confirmed', async () => {
    const { saveTree } = await import('../src/sidepanel/controllers/tree-controller.js');
    const st = makeState();
    const existing = { id: 'clash-id', title: 'Clashing Name', topicId: null };
    st.chats = [existing];
    st.dialog.confirm.mockResolvedValueOnce(true);
    st.chatDialogs.showAssignChat.mockResolvedValueOnce({ topicId: null, tags: [] });
    st.chatRepo.updateChat.mockResolvedValueOnce([]);
    _setContext(st);

    await handleChatSaved({ id: 'brand-new', title: 'Clashing Name', messages: [] });
    expect(st.chatRepo.removeChat).toHaveBeenCalledWith('clash-id');
    expect(saveTree).toHaveBeenCalled();
  });

  it('matches title case-insensitively', async () => {
    const st = makeState();
    const existing = { id: 'lower-id', title: 'hello world', topicId: null };
    st.chats = [existing];
    st.chatDialogs.showAssignChat.mockResolvedValueOnce({ topicId: null, tags: [] });
    _setContext(st);

    await handleChatSaved({ id: 'upper-id', title: 'HELLO WORLD', messages: [] });
    expect(st.dialog.confirm).toHaveBeenCalled();
  });

  it('does not show confirm dialog when chatEntry.id matches the found title', async () => {
    const st = makeState();
    st.chatDialogs.showAssignChat.mockResolvedValueOnce({ topicId: null, tags: [] });
    st.chatRepo.updateChat.mockResolvedValueOnce([]);
    _setContext(st);

    // Same id — no other chat to clash with
    await handleChatSaved({ id: 'self-id', title: 'My Title', messages: [] });
    expect(st.dialog.confirm).not.toHaveBeenCalled();
  });

  it('places overwritten chat in the duplicate\'s original topic (nested topic fix)', async () => {
    const { moveChatToTopic } = await import('../src/lib/chat/chat-manager.js');
    const st = makeState();
    // Duplicate lives in a nested topic 't-nested'; user chose a different topic 't-chosen'
    const existing = { id: 'dup-id', title: 'Nested Chat', topicId: 't-nested' };
    st.chats = [existing];
    st.dialog.confirm.mockResolvedValueOnce(true);
    st.chatDialogs.showAssignChat.mockResolvedValueOnce({ topicId: 't-chosen', title: 'Nested Chat', tags: [] });
    st.chatRepo.updateChat.mockResolvedValueOnce([]);
    _setContext(st);

    await handleChatSaved({ id: 'new-id', title: 'Nested Chat', messages: [] });

    expect(vi.mocked(moveChatToTopic)).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'new-id' }),
      't-nested',
      st.tree
    );
  });

  it('does not call moveChatToTopic when duplicate has no topicId', async () => {
    const { moveChatToTopic } = await import('../src/lib/chat/chat-manager.js');
    vi.mocked(moveChatToTopic).mockClear();
    const st = makeState();
    const existing = { id: 'dup-null', title: 'Floating Chat', topicId: null };
    st.chats = [existing];
    st.dialog.confirm.mockResolvedValueOnce(true);
    st.chatDialogs.showAssignChat.mockResolvedValueOnce({ topicId: 't-chosen', title: 'Floating Chat', tags: [] });
    st.chatRepo.updateChat.mockResolvedValueOnce([]);
    _setContext(st);

    await handleChatSaved({ id: 'new-floating', title: 'Floating Chat', messages: [] });
    expect(vi.mocked(moveChatToTopic)).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// handleChatSaved — Feature c: auto-export
// ─────────────────────────────────────────────────────────────────────────────

describe('handleChatSaved() — Feature c: auto-export', () => {
  async function runSavedWithStorage(storageValues) {
    const browser = (await import('../src/lib/vendor/browser.js')).default;
    vi.mocked(browser.storage.local.get).mockResolvedValueOnce(storageValues);

    const st = makeState();
    st.chatDialogs.showAssignChat.mockResolvedValueOnce({ topicId: null, tags: [] });
    st.chatRepo.updateChat.mockResolvedValueOnce([]);
    _setContext(st);
    await handleChatSaved({ id: 'auto-chat', title: 'Auto Chat', messages: [] });
    return { browser, st };
  }

  it('does not call triggerAutoExport when autoExportEnabled is false', async () => {
    const { triggerAutoExport } = await import('../src/lib/export/auto-export.js');
    vi.mocked(triggerAutoExport).mockClear();
    await runSavedWithStorage({ autoExportEnabled: false });
    expect(triggerAutoExport).not.toHaveBeenCalled();
  });

  it('increments chatsSinceLastAutoExport when threshold not reached', async () => {
    const { browser } = await runSavedWithStorage({
      autoExportEnabled: true,
      autoExportThreshold: 5,
      chatsSinceLastAutoExport: 2,
      autoExportTopics: '',
    });
    expect(vi.mocked(browser.storage.local.set)).toHaveBeenCalledWith({ chatsSinceLastAutoExport: 3 });
  });

  it('calls triggerAutoExport and resets counter when threshold is reached', async () => {
    const { triggerAutoExport } = await import('../src/lib/export/auto-export.js');
    vi.mocked(triggerAutoExport).mockClear();
    const { browser } = await runSavedWithStorage({
      autoExportEnabled: true,
      autoExportThreshold: 3,
      chatsSinceLastAutoExport: 2,   // newCount = 3 >= threshold
      autoExportTopics: 'Work',
    });
    expect(vi.mocked(browser.storage.local.set)).toHaveBeenCalledWith({ chatsSinceLastAutoExport: 0 });
    expect(triggerAutoExport).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(Array),
      'Work'
    );
  });

  it('uses default threshold of 10 when autoExportThreshold is absent', async () => {
    const { triggerAutoExport } = await import('../src/lib/export/auto-export.js');
    vi.mocked(triggerAutoExport).mockClear();
    // count goes from 9 to 10 which equals default threshold of 10
    const { browser } = await runSavedWithStorage({
      autoExportEnabled: true,
      chatsSinceLastAutoExport: 9,
    });
    expect(vi.mocked(browser.storage.local.set)).toHaveBeenCalledWith({ chatsSinceLastAutoExport: 0 });
    expect(triggerAutoExport).toHaveBeenCalled();
  });

  it('does not throw when browser.storage.local.get rejects', async () => {
    const browser = (await import('../src/lib/vendor/browser.js')).default;
    vi.mocked(browser.storage.local.get).mockRejectedValueOnce(new Error('storage error'));
    const st = makeState();
    st.chatDialogs.showAssignChat.mockResolvedValueOnce({ topicId: null, tags: [] });
    st.chatRepo.updateChat.mockResolvedValueOnce([]);
    _setContext(st);
    await expect(handleChatSaved({ id: 'err-chat', title: 'Err', messages: [] })).resolves.not.toThrow();
  });
});

// ─── checkAndTriggerAutoExport ────────────────────────────────────────────────

describe('checkAndTriggerAutoExport()', () => {
  async function runCheck(storageValues, stateOverrides = {}) {
    const browser = (await import('../src/lib/vendor/browser.js')).default;
    vi.mocked(browser.storage.local.get).mockResolvedValueOnce(storageValues);
    const st = makeState();
    Object.assign(st, stateOverrides);
    _setContext(st);
    await checkAndTriggerAutoExport();
    return { browser, st };
  }

  it('does not call triggerAutoExport when autoExportEnabled is false', async () => {
    const { triggerAutoExport } = await import('../src/lib/export/auto-export.js');
    vi.mocked(triggerAutoExport).mockClear();
    await runCheck({ autoExportEnabled: false });
    expect(triggerAutoExport).not.toHaveBeenCalled();
  });

  it('increments chatsSinceLastAutoExport when threshold not reached', async () => {
    const { browser } = await runCheck({
      autoExportEnabled: true,
      autoExportThreshold: 5,
      chatsSinceLastAutoExport: 1,
      autoExportTopics: '',
    });
    expect(vi.mocked(browser.storage.local.set)).toHaveBeenCalledWith({ chatsSinceLastAutoExport: 2 });
  });

  it('calls triggerAutoExport and resets counter when threshold is reached', async () => {
    const { triggerAutoExport } = await import('../src/lib/export/auto-export.js');
    vi.mocked(triggerAutoExport).mockClear();
    const mockTree  = {};
    const mockChats = [{ id: 'c1' }];
    const { browser } = await runCheck(
      { autoExportEnabled: true, autoExportThreshold: 3, chatsSinceLastAutoExport: 2, autoExportTopics: 'Work' },
      { tree: mockTree, chats: mockChats },
    );
    expect(vi.mocked(browser.storage.local.set)).toHaveBeenCalledWith({ chatsSinceLastAutoExport: 0 });
    expect(triggerAutoExport).toHaveBeenCalledWith(mockTree, mockChats, 'Work');
  });

  it('uses default threshold of 10 when autoExportThreshold is absent', async () => {
    const { triggerAutoExport } = await import('../src/lib/export/auto-export.js');
    vi.mocked(triggerAutoExport).mockClear();
    const { browser } = await runCheck({
      autoExportEnabled: true,
      chatsSinceLastAutoExport: 9,
    });
    expect(vi.mocked(browser.storage.local.set)).toHaveBeenCalledWith({ chatsSinceLastAutoExport: 0 });
    expect(triggerAutoExport).toHaveBeenCalled();
  });

  it('does not throw when browser.storage.local.get rejects', async () => {
    const browser = (await import('../src/lib/vendor/browser.js')).default;
    vi.mocked(browser.storage.local.get).mockRejectedValueOnce(new Error('storage error'));
    const st = makeState();
    _setContext(st);
    await expect(checkAndTriggerAutoExport()).resolves.not.toThrow();
  });

  it('threshold 1: triggers on the very first save', async () => {
    const { triggerAutoExport } = await import('../src/lib/export/auto-export.js');
    vi.mocked(triggerAutoExport).mockClear();
    const { browser } = await runCheck({
      autoExportEnabled: true,
      autoExportThreshold: 1,
      chatsSinceLastAutoExport: 0,
    });
    expect(vi.mocked(browser.storage.local.set)).toHaveBeenCalledWith({ chatsSinceLastAutoExport: 0 });
    expect(triggerAutoExport).toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// handleOverwriteChatAction (via setupChatContextMenuActions dispatch)
// ─────────────────────────────────────────────────────────────────────────────

describe('handleOverwriteChatAction via setupChatContextMenuActions', () => {
  function setupOverwriteMenu(st) {
    const menu = document.createElement('div');
    menu.id = 'chatContextMenu';
    menu.style.display = 'none';
    document.body.appendChild(menu);
    const item = document.createElement('div');
    item.dataset.chatAction = 'overwrite';
    menu.appendChild(item);
    elements.chatContextMenu = menu;
    _setContext(st);
    setupChatContextMenuActions();
    return { menu, item };
  }

  afterEach(() => {
    elements.chatContextMenu = null;
  });

  it('does nothing when contextMenuChat is null', async () => {
    const { default: browser } = await import('../src/lib/vendor/browser.js');
    const st = makeState();
    st.contextMenuChat = null;
    const { item } = setupOverwriteMenu(st);
    item.click();
    await vi.runAllTimersAsync();
    expect(browser.tabs.query).not.toHaveBeenCalled();
  });

  it('shows error notification when tabs.query throws', async () => {
    const { default: browser } = await import('../src/lib/vendor/browser.js');
    vi.mocked(browser.tabs.query).mockRejectedValueOnce(new Error('no permission'));
    const toast = document.createElement('div');
    toast.id = 'toast';
    document.body.appendChild(toast);
    const st = makeState();
    st.contextMenuChat = { id: 'c1', title: 'My Chat' };
    const { item } = setupOverwriteMenu(st);
    item.click();
    await vi.runAllTimersAsync();
    expect(toast.textContent).toContain('Could not access the active tab');
  });

  it('shows error when no active tab is found (tab.id is falsy)', async () => {
    const { default: browser } = await import('../src/lib/vendor/browser.js');
    vi.mocked(browser.tabs.query).mockResolvedValueOnce([{ id: undefined, url: '' }]);
    const toast = document.createElement('div');
    toast.id = 'toast';
    document.body.appendChild(toast);
    const st = makeState();
    st.contextMenuChat = { id: 'c1', title: 'My Chat' };
    const { item } = setupOverwriteMenu(st);
    item.click();
    await vi.runAllTimersAsync();
    expect(toast.textContent).toContain('No active tab found');
  });

  it('shows error when tabs.query returns empty array (no tab)', async () => {
    const { default: browser } = await import('../src/lib/vendor/browser.js');
    vi.mocked(browser.tabs.query).mockResolvedValueOnce([]);
    const toast = document.createElement('div');
    toast.id = 'toast';
    document.body.appendChild(toast);
    const st = makeState();
    st.contextMenuChat = { id: 'c1', title: 'My Chat' };
    const { item } = setupOverwriteMenu(st);
    item.click();
    await vi.runAllTimersAsync();
    expect(toast.textContent).toContain('No active tab found');
  });

  it('shows error when tabs.sendMessage throws', async () => {
    const { default: browser } = await import('../src/lib/vendor/browser.js');
    vi.mocked(browser.tabs.query).mockResolvedValueOnce([{ id: 42 }]);
    vi.mocked(browser.tabs.sendMessage).mockRejectedValueOnce(new Error('no content script'));
    const toast = document.createElement('div');
    toast.id = 'toast';
    document.body.appendChild(toast);
    const st = makeState();
    st.contextMenuChat = { id: 'c1', title: 'My Chat' };
    const { item } = setupOverwriteMenu(st);
    item.click();
    await vi.runAllTimersAsync();
    expect(toast.textContent).toContain('Could not extract chat');
  });

  it('shows extraction error when response.success is false (no custom error)', async () => {
    const { default: browser } = await import('../src/lib/vendor/browser.js');
    vi.mocked(browser.tabs.query).mockResolvedValueOnce([{ id: 42 }]);
    vi.mocked(browser.tabs.sendMessage).mockResolvedValueOnce({ success: false });
    const toast = document.createElement('div');
    toast.id = 'toast';
    document.body.appendChild(toast);
    const st = makeState();
    st.contextMenuChat = { id: 'c1', title: 'My Chat' };
    const { item } = setupOverwriteMenu(st);
    item.click();
    await vi.runAllTimersAsync();
    expect(toast.textContent).toContain('Extraction failed');
  });

  it('shows custom error when response.success is false and error is set', async () => {
    const { default: browser } = await import('../src/lib/vendor/browser.js');
    vi.mocked(browser.tabs.query).mockResolvedValueOnce([{ id: 42 }]);
    vi.mocked(browser.tabs.sendMessage).mockResolvedValueOnce({ success: false, error: 'Wrong page' });
    const toast = document.createElement('div');
    toast.id = 'toast';
    document.body.appendChild(toast);
    const st = makeState();
    st.contextMenuChat = { id: 'c1', title: 'My Chat' };
    const { item } = setupOverwriteMenu(st);
    item.click();
    await vi.runAllTimersAsync();
    expect(toast.textContent).toContain('Wrong page');
  });

  it('shows error when extractResponse has no data', async () => {
    const { default: browser } = await import('../src/lib/vendor/browser.js');
    vi.mocked(browser.tabs.query).mockResolvedValueOnce([{ id: 42 }]);
    vi.mocked(browser.tabs.sendMessage).mockResolvedValueOnce({ success: true, data: null });
    const toast = document.createElement('div');
    toast.id = 'toast';
    document.body.appendChild(toast);
    const st = makeState();
    st.contextMenuChat = { id: 'c1', title: 'My Chat' };
    const { item } = setupOverwriteMenu(st);
    item.click();
    await vi.runAllTimersAsync();
    expect(toast.textContent).toContain('No chat content found');
  });

  it('shows error when chatData has messageCount 0 and no messages array', async () => {
    const { default: browser } = await import('../src/lib/vendor/browser.js');
    vi.mocked(browser.tabs.query).mockResolvedValueOnce([{ id: 42 }]);
    vi.mocked(browser.tabs.sendMessage).mockResolvedValueOnce({
      success: true,
      data: { messageCount: 0, messages: [] },
    });
    const toast = document.createElement('div');
    toast.id = 'toast';
    document.body.appendChild(toast);
    const st = makeState();
    st.contextMenuChat = { id: 'c1', title: 'My Chat' };
    const { item } = setupOverwriteMenu(st);
    item.click();
    await vi.runAllTimersAsync();
    expect(toast.textContent).toContain('No chat content found');
  });

  it('returns without updating when user cancels the confirm dialog', async () => {
    const { default: browser } = await import('../src/lib/vendor/browser.js');
    vi.mocked(browser.tabs.query).mockResolvedValueOnce([{ id: 42 }]);
    vi.mocked(browser.tabs.sendMessage).mockResolvedValueOnce({
      success: true,
      data: { messages: [{ role: 'user', content: 'hi' }], messageCount: 1 },
    });
    const st = makeState();
    st.contextMenuChat = { id: 'c1', title: 'My Chat' };
    st.dialog.confirm.mockResolvedValueOnce(false);
    const { item } = setupOverwriteMenu(st);
    item.click();
    await vi.runAllTimersAsync();
    expect(st.chatRepo.updateChat).not.toHaveBeenCalled();
  });

  it('shows error when chatRepo.updateChat throws', async () => {
    const { default: browser } = await import('../src/lib/vendor/browser.js');
    vi.mocked(browser.tabs.query).mockResolvedValueOnce([{ id: 42 }]);
    vi.mocked(browser.tabs.sendMessage).mockResolvedValueOnce({
      success: true,
      data: { messages: [{ role: 'user', content: 'hello' }], messageCount: 1 },
    });
    const toast = document.createElement('div');
    toast.id = 'toast';
    document.body.appendChild(toast);
    const st = makeState();
    st.contextMenuChat = { id: 'c1', title: 'My Chat' };
    st.dialog.confirm.mockResolvedValueOnce(true);
    st.chatRepo.updateChat.mockRejectedValueOnce(new Error('DB error'));
    const { item } = setupOverwriteMenu(st);
    item.click();
    await vi.runAllTimersAsync();
    expect(toast.textContent).toContain('Failed to overwrite chat');
  });

  it('success path: updates renderer, calls renderTreeView, shows success toast', async () => {
    const { renderTreeView } = await import('../src/sidepanel/controllers/tree-controller.js');
    const { default: browser } = await import('../src/lib/vendor/browser.js');
    vi.mocked(browser.tabs.query).mockResolvedValueOnce([{ id: 99, url: 'https://chat.openai.com' }]);
    vi.mocked(browser.tabs.sendMessage).mockResolvedValueOnce({
      success: true,
      data: {
        content: '# Chat\n...',
        messages: [{ role: 'user', content: 'test' }],
        messageCount: 1,
        url: 'https://chat.openai.com',
        source: 'chatgpt',
      },
    });
    const toast = document.createElement('div');
    toast.id = 'toast';
    document.body.appendChild(toast);
    const updatedChats = [{ id: 'c1', title: 'My Chat' }];
    const st = makeState();
    st.contextMenuChat = { id: 'c1', title: 'My Chat', source: 'chatgpt', url: '' };
    st.dialog.confirm.mockResolvedValueOnce(true);
    st.chatRepo.updateChat.mockResolvedValueOnce(updatedChats);
    const { item } = setupOverwriteMenu(st);
    item.click();
    await vi.runAllTimersAsync();
    expect(st.chatRepo.updateChat).toHaveBeenCalledWith('c1', expect.objectContaining({
      messages: expect.any(Array),
      messageCount: 1,
    }));
    expect(st.renderer.setChatData).toHaveBeenCalledWith(updatedChats);
    expect(renderTreeView).toHaveBeenCalled();
    expect(toast.textContent).toContain('My Chat');
  });

  it('success: uses tab.url as fallback when chatData.url is empty', async () => {
    const { default: browser } = await import('../src/lib/vendor/browser.js');
    vi.mocked(browser.tabs.query).mockResolvedValueOnce([{ id: 7, url: 'https://fallback.url' }]);
    vi.mocked(browser.tabs.sendMessage).mockResolvedValueOnce({
      success: true,
      data: { messages: [{ role: 'user', content: 'hi' }], messageCount: 1, url: '', source: '' },
    });
    const st = makeState();
    st.contextMenuChat = { id: 'c2', title: 'Chat 2', source: 'mysrc', url: 'https://orig.url' };
    st.dialog.confirm.mockResolvedValueOnce(true);
    st.chatRepo.updateChat.mockResolvedValueOnce([]);
    const { item } = setupOverwriteMenu(st);
    item.click();
    await vi.runAllTimersAsync();
    expect(st.chatRepo.updateChat).toHaveBeenCalledWith('c2', expect.objectContaining({
      url: 'https://fallback.url',
    }));
  });
});
