/**
 * clipboard-copy-actions.test.js
 *
 * Unit tests for the "copy to clipboard" action in
 * src/sidepanel/controllers/chat-actions.js (feature C.26, task C).
 *
 * Covers:
 *  - handleCopyChatAction: no chat, load error, empty result, tooLarge,
 *    generic failure, and success paths
 *  - setupChatContextMenuActions: 'copy' data-chat-action triggers the handler
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ─── Module mocks (hoisted before imports) ────────────────────────────────────

// vi.hoisted ensures this variable is initialised before the hoisted vi.mock calls
const mockElements = vi.hoisted(() => ({ chatContextMenu: null }));

vi.mock('../src/sidepanel/app-context.js', () => ({
  state:    {},
  elements: mockElements,
}));

vi.mock('../src/lib/export/clipboard-serialiser.js', () => ({
  copyChatsToClipboard: vi.fn(),
}));

vi.mock('../src/sidepanel/notification.js', () => ({
  showNotification: vi.fn(),
}));

vi.mock('../src/lib/utils/logger.js', () => ({
  logger: { warn: vi.fn(), log: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

// Transitive deps of chat-actions.js — not under test here
vi.mock('../src/lib/chat/chat-manager.js', () => ({
  assignChatToTopic:    vi.fn(),
  moveChatToTopic:      vi.fn(),
  removeChatFromTopic:  vi.fn(),
}));

vi.mock('../src/sidepanel/controllers/tree-controller.js', () => ({
  saveTree:          vi.fn(),
  renderTreeView:    vi.fn(),
  saveExpandedState: vi.fn(),
}));

vi.mock('../src/sidepanel/features/save-banner.js', () => ({
  setSaveBtnState: vi.fn(),
}));

vi.mock('../src/sidepanel/features/recent-rail.js', () => ({
  updateRecentRail: vi.fn(),
}));

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import {
  handleCopyChatAction,
  setupChatContextMenuActions,
  _setContext,
  hideChatContextMenu,
} from '../src/sidepanel/controllers/chat-actions.js';

import { copyChatsToClipboard } from '../src/lib/export/clipboard-serialiser.js';
import { showNotification }     from '../src/sidepanel/notification.js';
import { logger }               from '../src/lib/utils/logger.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeState(overrides = {}) {
  return {
    contextMenuChat: { id: 'chat1', title: 'Test Chat' },
    chatRepo: {
      loadFullByIds: vi.fn().mockResolvedValue([
        { id: 'chat1', title: 'Test Chat', messages: [] },
      ]),
    },
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('handleCopyChatAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: elements has no context menu (most unit tests don't need it)
    mockElements.chatContextMenu = null;
  });

  it('returns immediately when contextMenuChat is null', async () => {
    _setContext(makeState({ contextMenuChat: null }));
    await handleCopyChatAction();
    expect(copyChatsToClipboard).not.toHaveBeenCalled();
    expect(showNotification).not.toHaveBeenCalled();
  });

  it('shows error notification when chatRepo.loadFullByIds rejects', async () => {
    const err = new Error('storage failure');
    _setContext(makeState({
      chatRepo: { loadFullByIds: vi.fn().mockRejectedValue(err) },
    }));

    await handleCopyChatAction();

    expect(logger.warn).toHaveBeenCalledWith(
      'Copy: failed to load chat content',
      err,
    );
    expect(showNotification).toHaveBeenCalledWith('Failed to load chat content', 'error');
    expect(copyChatsToClipboard).not.toHaveBeenCalled();
  });

  it('shows error notification when loadFullByIds returns empty array', async () => {
    _setContext(makeState({
      chatRepo: { loadFullByIds: vi.fn().mockResolvedValue([]) },
    }));

    await handleCopyChatAction();

    expect(showNotification).toHaveBeenCalledWith('Chat content not found', 'error');
    expect(copyChatsToClipboard).not.toHaveBeenCalled();
  });

  it('shows "too large" error when copyChatsToClipboard returns tooLarge', async () => {
    _setContext(makeState());
    copyChatsToClipboard.mockResolvedValue({ ok: false, tooLarge: true });

    await handleCopyChatAction();

    expect(showNotification).toHaveBeenCalledWith(
      'Content too large to copy \u2014 use Export instead',
      'error',
    );
  });

  it('shows generic failure error when ok is false and not tooLarge', async () => {
    _setContext(makeState());
    copyChatsToClipboard.mockResolvedValue({ ok: false, tooLarge: false });

    await handleCopyChatAction();

    expect(showNotification).toHaveBeenCalledWith('Failed to copy to clipboard', 'error');
  });

  it('shows success notification when copy succeeds', async () => {
    _setContext(makeState());
    copyChatsToClipboard.mockResolvedValue({ ok: true });

    await handleCopyChatAction();

    expect(copyChatsToClipboard).toHaveBeenCalledWith([
      { id: 'chat1', title: 'Test Chat', messages: [] },
    ]);
    expect(showNotification).toHaveBeenCalledWith('Copied to clipboard', 'success');
  });
});

// ─── DOM integration ──────────────────────────────────────────────────────────

describe('setupChatContextMenuActions — copy dispatch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("clicking [data-chat-action='copy'] triggers handleCopyChatAction", async () => {
    // Build a minimal context menu DOM
    const menu = document.createElement('div');
    const copyItem = document.createElement('div');
    copyItem.dataset.chatAction = 'copy';
    menu.appendChild(copyItem);
    mockElements.chatContextMenu = menu;

    // State: chat present so the action branch executes
    const state = makeState();
    copyChatsToClipboard.mockResolvedValue({ ok: true });
    _setContext(state);

    setupChatContextMenuActions();

    copyItem.click();

    // Allow the async listener to settle
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(showNotification).toHaveBeenCalledWith('Copied to clipboard', 'success');
  });
});
