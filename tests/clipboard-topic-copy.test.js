import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/lib/export/clipboard-serialiser.js', () => ({
  copyChatsToClipboard: vi.fn(),
}));

vi.mock('../src/sidepanel/notification.js', () => ({
  showNotification: vi.fn(),
}));

vi.mock('../src/lib/utils/logger.js', () => ({
  logger: { warn: vi.fn(), log: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock('../src/sidepanel/controllers/tree-controller.js', () => ({
  saveTree: vi.fn(),
  renderTreeView: vi.fn(),
  saveExpandedState: vi.fn(),
  collectDescendantChatIds: vi.fn(),
}));

// Must come after vi.mock calls
import { handleCopyAllTopicChats, _setContext } from '../src/sidepanel/controllers/topic-actions.js';
import { copyChatsToClipboard } from '../src/lib/export/clipboard-serialiser.js';
import { showNotification } from '../src/sidepanel/notification.js';
import { collectDescendantChatIds } from '../src/sidepanel/controllers/tree-controller.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeChat(id) {
  return { id, title: `Chat ${id}`, messages: [], content: '' };
}

function makeState(overrides = {}) {
  return {
    contextMenuTopic: { id: 'topic1', name: 'Test Topic' },
    chatRepo: { loadFullByIds: vi.fn() },
    tree: {},
    chats: {},
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('handleCopyAllTopicChats', () => {
  let mockState;

  beforeEach(() => {
    vi.clearAllMocks();
    mockState = makeState();
    _setContext(mockState);
  });

  it('returns without notification when there is no contextMenuTopic', async () => {
    mockState.contextMenuTopic = null;

    await handleCopyAllTopicChats();

    expect(showNotification).not.toHaveBeenCalled();
    expect(collectDescendantChatIds).not.toHaveBeenCalled();
  });

  it('shows info notification when collectDescendantChatIds returns empty array', async () => {
    collectDescendantChatIds.mockReturnValue([]);

    await handleCopyAllTopicChats();

    expect(showNotification).toHaveBeenCalledWith('No chats to copy in this topic', 'info');
    expect(mockState.chatRepo.loadFullByIds).not.toHaveBeenCalled();
  });

  it('shows error notification when chatRepo.loadFullByIds rejects', async () => {
    collectDescendantChatIds.mockReturnValue(['c1', 'c2']);
    mockState.chatRepo.loadFullByIds.mockRejectedValue(new Error('DB error'));

    await handleCopyAllTopicChats();

    expect(showNotification).toHaveBeenCalledWith('Failed to load chat content', 'error');
    expect(copyChatsToClipboard).not.toHaveBeenCalled();
  });

  it('shows info notification when loadFullByIds returns empty array', async () => {
    collectDescendantChatIds.mockReturnValue(['c1']);
    mockState.chatRepo.loadFullByIds.mockResolvedValue([]);

    await handleCopyAllTopicChats();

    expect(showNotification).toHaveBeenCalledWith('No chats found to copy', 'info');
    expect(copyChatsToClipboard).not.toHaveBeenCalled();
  });

  it('shows slow-warning notification then proceeds when 20+ chats returned', async () => {
    const chatIds = Array.from({ length: 20 }, (_, i) => `c${i}`);
    const fullChats = chatIds.map(makeChat);
    collectDescendantChatIds.mockReturnValue(chatIds);
    mockState.chatRepo.loadFullByIds.mockResolvedValue(fullChats);
    copyChatsToClipboard.mockResolvedValue({ ok: true, tooLarge: false });

    await handleCopyAllTopicChats();

    expect(showNotification).toHaveBeenCalledWith(
      'Copying 20 chats — this may be slow',
      'info',
    );
    expect(copyChatsToClipboard).toHaveBeenCalledWith(fullChats);
    expect(showNotification).toHaveBeenCalledWith('Copied 20 chats to clipboard', 'success');
  });

  it('shows "Content too large" error when result.tooLarge is true', async () => {
    collectDescendantChatIds.mockReturnValue(['c1']);
    mockState.chatRepo.loadFullByIds.mockResolvedValue([makeChat('c1')]);
    copyChatsToClipboard.mockResolvedValue({ ok: false, tooLarge: true });

    await handleCopyAllTopicChats();

    expect(showNotification).toHaveBeenCalledWith(
      'Content too large to copy — use Export instead',
      'error',
    );
  });

  it('shows "Failed to copy" error when result.ok is false and not tooLarge', async () => {
    collectDescendantChatIds.mockReturnValue(['c1']);
    mockState.chatRepo.loadFullByIds.mockResolvedValue([makeChat('c1')]);
    copyChatsToClipboard.mockResolvedValue({ ok: false, tooLarge: false });

    await handleCopyAllTopicChats();

    expect(showNotification).toHaveBeenCalledWith('Failed to copy to clipboard', 'error');
  });

  it('shows success with singular "chat" for exactly 1 chat', async () => {
    collectDescendantChatIds.mockReturnValue(['c1']);
    mockState.chatRepo.loadFullByIds.mockResolvedValue([makeChat('c1')]);
    copyChatsToClipboard.mockResolvedValue({ ok: true, tooLarge: false });

    await handleCopyAllTopicChats();

    expect(showNotification).toHaveBeenCalledWith('Copied 1 chat to clipboard', 'success');
  });

  it('shows success with plural "chats" for multiple chats', async () => {
    const chatIds = ['c1', 'c2', 'c3'];
    const fullChats = chatIds.map(makeChat);
    collectDescendantChatIds.mockReturnValue(chatIds);
    mockState.chatRepo.loadFullByIds.mockResolvedValue(fullChats);
    copyChatsToClipboard.mockResolvedValue({ ok: true, tooLarge: false });

    await handleCopyAllTopicChats();

    expect(showNotification).toHaveBeenCalledWith('Copied 3 chats to clipboard', 'success');
  });
});
