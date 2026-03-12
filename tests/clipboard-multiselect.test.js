/**
 * clipboard-multiselect.test.js
 *
 * Unit tests for the "Copy all" multi-select action in
 * src/sidepanel/features/multi-select.js (feature C.26, task E).
 *
 * Covers:
 *  - handleCopyAll: no renderer, <2 chats, load error, 20+ chats bulk warning,
 *    tooLarge, generic failure, and success paths
 *  - updateSelectionBar: copyAllBtn enable/disable via elements.copyAllBtn
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ─── Hoisted mock objects (must exist before vi.mock factory calls) ───────────

const { mockState, mockElements } = vi.hoisted(() => {
  const mockState = {
    renderer: null,
    chatRepo: { loadFullByIds: vi.fn() },
  };
  const mockElements = {};
  return { mockState, mockElements };
});

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('../src/sidepanel/app-context.js', () => ({
  state:    mockState,
  elements: mockElements,
}));

vi.mock('../src/lib/export/clipboard-serialiser.js', () => ({
  copyChatsToClipboard: vi.fn(),
}));

vi.mock('../src/sidepanel/notification.js', () => ({
  showNotification: vi.fn(),
}));

// Transitive deps of multi-select.js — not under test here
vi.mock('../src/lib/export/markdown-builder.js', () => ({
  buildDigestMarkdown: vi.fn().mockReturnValue(''),
}));

vi.mock('../src/sidepanel/controllers/tree-controller.js', () => ({
  saveTree:          vi.fn(),
  renderTreeView:    vi.fn(),
  saveExpandedState: vi.fn(),
}));

vi.mock('../src/lib/chat/chat-manager.js', () => ({
  assignChatToTopic:   vi.fn(),
  moveChatToTopic:     vi.fn(),
  removeChatFromTopic: vi.fn(),
}));

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import { handleCopyAll, updateSelectionBar } from '../src/sidepanel/features/multi-select.js';
import { copyChatsToClipboard }              from '../src/lib/export/clipboard-serialiser.js';
import { showNotification }                  from '../src/sidepanel/notification.js';

// ─── handleCopyAll tests ──────────────────────────────────────────────────────

describe('handleCopyAll', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState.renderer = null;
    mockState.chatRepo.loadFullByIds.mockReset();
  });

  it('returns without notification when renderer is null', async () => {
    mockState.renderer = null;
    await handleCopyAll();
    expect(showNotification).not.toHaveBeenCalled();
    expect(copyChatsToClipboard).not.toHaveBeenCalled();
  });

  it('shows error when fewer than 2 chats are selected', async () => {
    mockState.renderer = {
      getSelectedChats: vi.fn().mockReturnValue([{ id: 'c1' }]),
    };
    await handleCopyAll();
    expect(showNotification).toHaveBeenCalledWith(
      'Select at least 2 chats to copy', 'error'
    );
    expect(copyChatsToClipboard).not.toHaveBeenCalled();
  });

  it('shows error when loadFullByIds rejects', async () => {
    mockState.renderer = {
      getSelectedChats: vi.fn().mockReturnValue([{ id: 'c1' }, { id: 'c2' }]),
    };
    mockState.chatRepo.loadFullByIds.mockRejectedValue(new Error('storage failure'));
    await handleCopyAll();
    expect(showNotification).toHaveBeenCalledWith(
      'Failed to load chats for copying', 'error'
    );
    expect(copyChatsToClipboard).not.toHaveBeenCalled();
  });

  it('shows slow-copy info warning for 20+ chats and then succeeds', async () => {
    const twentyChats = Array.from({ length: 20 }, (_, i) => ({ id: `c${i}` }));
    mockState.renderer = {
      getSelectedChats: vi.fn().mockReturnValue(twentyChats),
    };
    mockState.chatRepo.loadFullByIds.mockResolvedValue(twentyChats);
    copyChatsToClipboard.mockResolvedValue({ ok: true, charCount: 5000, chatCount: 20 });

    await handleCopyAll();

    expect(showNotification).toHaveBeenCalledWith(
      'Copying 20 chats — this may be slow', 'info'
    );
    expect(showNotification).toHaveBeenCalledWith(
      'Copied 20 chats to clipboard', 'success'
    );
    expect(copyChatsToClipboard).toHaveBeenCalledOnce();
  });

  it('shows tooLarge error when result.tooLarge is true', async () => {
    const twoChats = [{ id: 'c1' }, { id: 'c2' }];
    mockState.renderer = {
      getSelectedChats: vi.fn().mockReturnValue(twoChats),
    };
    mockState.chatRepo.loadFullByIds.mockResolvedValue(twoChats);
    copyChatsToClipboard.mockResolvedValue({ ok: false, tooLarge: true });

    await handleCopyAll();

    expect(showNotification).toHaveBeenCalledWith(
      'Content too large to copy — use Export Digest instead', 'error'
    );
  });

  it('shows generic failure error when ok is false and not tooLarge', async () => {
    const twoChats = [{ id: 'c1' }, { id: 'c2' }];
    mockState.renderer = {
      getSelectedChats: vi.fn().mockReturnValue(twoChats),
    };
    mockState.chatRepo.loadFullByIds.mockResolvedValue(twoChats);
    copyChatsToClipboard.mockResolvedValue({ ok: false, tooLarge: false });

    await handleCopyAll();

    expect(showNotification).toHaveBeenCalledWith(
      'Failed to copy to clipboard', 'error'
    );
  });

  it('shows success notification with correct plural for 3 chats', async () => {
    const threeChats = [{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }];
    mockState.renderer = {
      getSelectedChats: vi.fn().mockReturnValue(threeChats),
    };
    mockState.chatRepo.loadFullByIds.mockResolvedValue(threeChats);
    copyChatsToClipboard.mockResolvedValue({ ok: true, charCount: 1200, chatCount: 3 });

    await handleCopyAll();

    expect(showNotification).toHaveBeenCalledWith(
      'Copied 3 chats to clipboard', 'success'
    );
    expect(showNotification).toHaveBeenCalledTimes(1);
  });
});

// ─── updateSelectionBar — copyAllBtn ─────────────────────────────────────────

describe('updateSelectionBar — copyAllBtn', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Provide stub DOM-like objects for every element accessed inside updateSelectionBar
    mockElements.selectionCount  = { textContent: '' };
    mockElements.assembleBtn     = { disabled: true, title: '' };
    mockElements.exportDigestBtn = { disabled: true, title: '' };
    mockElements.copyAllBtn      = { disabled: true, title: '' };
  });

  it('disables copyAllBtn and sets placeholder title when count is 0', () => {
    updateSelectionBar(0);
    expect(mockElements.copyAllBtn.disabled).toBe(true);
    expect(mockElements.copyAllBtn.title).toBe('Select at least 2 chats to copy');
  });

  it('disables copyAllBtn and sets placeholder title when count is 1', () => {
    updateSelectionBar(1);
    expect(mockElements.copyAllBtn.disabled).toBe(true);
    expect(mockElements.copyAllBtn.title).toBe('Select at least 2 chats to copy');
  });

  it('enables copyAllBtn with count-specific title when count is 2', () => {
    updateSelectionBar(2);
    expect(mockElements.copyAllBtn.disabled).toBe(false);
    expect(mockElements.copyAllBtn.title).toBe('Copy 2 chats to clipboard');
  });

  it('enables copyAllBtn with count-specific title when count is greater than 2', () => {
    updateSelectionBar(5);
    expect(mockElements.copyAllBtn.disabled).toBe(false);
    expect(mockElements.copyAllBtn.title).toBe('Copy 5 chats to clipboard');
  });

  it('skips copyAllBtn handling when elements.copyAllBtn is absent', () => {
    delete mockElements.copyAllBtn;
    // Should not throw even without the button in the DOM
    expect(() => updateSelectionBar(3)).not.toThrow();
  });
});
