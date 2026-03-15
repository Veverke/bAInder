/**
 * chat-actions.js
 *
 * Responsibility: all user-driven chat CRUD operations and the chat
 * context-menu interactions, including rating.
 *
 * Covers: open, rename, edit-tags, move, delete, set-review-date, rate,
 * context-menu show/hide, and context-menu action dispatch.
 *
 * NOT responsible for: tree persistence (delegates to tree-controller),
 * storage I/O (delegates to ChatRepository), or topic operations.
 */

import { state, elements } from '../app-context.js';
import { logger } from '../../lib/utils/logger.js';
import { showNotification } from '../notification.js';
import {
  assignChatToTopic,
  moveChatToTopic,
  removeChatFromTopic,
} from '../../lib/chat/chat-manager.js';
import browser from '../../lib/vendor/browser.js';
import {
  saveTree,
  renderTreeView,
  saveExpandedState,
} from './tree-controller.js';
import { setSaveBtnState } from '../features/save-banner.js';
import { updateRecentRail } from '../features/recent-rail.js';
import { copyChatsToClipboard } from '../../lib/export/clipboard-serialiser.js';
let _state = state;
// ---------------------------------------------------------------------------
// Test injection hook - lets unit tests provide a mock app context instead of
// mutating the real singleton.  Never call from production code.
// ---------------------------------------------------------------------------
/** @internal */
export function _setContext(ctx) { _state = ctx; }


// ---------------------------------------------------------------------------
// Context menu — positioning
// ---------------------------------------------------------------------------

export function showChatContextMenu(x, y) {
  if (!elements.chatContextMenu) return;
  elements.chatContextMenu.style.left    = `${x}px`;
  elements.chatContextMenu.style.top     = `${y}px`;
  elements.chatContextMenu.style.display = 'block';

  setTimeout(() => {
    const rect = elements.chatContextMenu.getBoundingClientRect();
    if (rect.right  > window.innerWidth)  elements.chatContextMenu.style.left = `${window.innerWidth  - rect.width  - 10}px`;
    if (rect.bottom > window.innerHeight) elements.chatContextMenu.style.top  = `${window.innerHeight - rect.height - 10}px`;
  }, 0);
}

export function hideChatContextMenu() {
  if (elements.chatContextMenu) elements.chatContextMenu.style.display = 'none';
}

// ---------------------------------------------------------------------------
// Event handlers wired by TreeRenderer
// ---------------------------------------------------------------------------

/** Open the chat reader page. */
export async function handleChatClick(chat) {
  if (!chat?.id) return;
  const readerUrl = browser.runtime.getURL(
    `src/reader/reader.html?chatId=${encodeURIComponent(chat.id)}`
  );
  browser.tabs.create({ url: readerUrl });
}

export function handleChatContextMenu(chat, event) {
  event.preventDefault();
  _state.contextMenuChat = chat;
  updateChatRatingWidget(chat.rating || 0);

  // C.19 — review date label
  const reviewSpan = document.getElementById('chatReviewDateSpan');
  if (reviewSpan) {
    if (chat.flaggedAsStale) {
      reviewSpan.textContent = chat.reviewDate
        ? `⚠ Review due: ${chat.reviewDate}`
        : '⚠ Update review date';
    } else if (chat.reviewDate) {
      reviewSpan.textContent = `Review: ${chat.reviewDate}`;
    } else {
      reviewSpan.textContent = 'Set review date';
    }
  }
  showChatContextMenu(event.clientX, event.clientY);
}

// ---------------------------------------------------------------------------
// Context-menu wire-up (called once during setupEventListeners)
// ---------------------------------------------------------------------------

export function setupChatContextMenuActions() {
  if (!elements.chatContextMenu) return;

  const actions = {
    open:              handleOpenChatAction,
    rename:            handleRenameChatAction,
    'edit-tags':       handleEditTagsAction,
    move:              handleMoveChatAction,
    export:            handleExportChatAction,
    copy:              handleCopyChatAction,
    delete:            handleDeleteChatAction,
    'set-review-date': handleSetReviewDateAction,
  };

  // C.15 — star rating (does NOT close the menu)
  const ratingWidget = elements.chatContextMenu.querySelector('#chatRatingWidget');
  ratingWidget?.querySelectorAll('.star-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await handleRateChatAction(parseInt(btn.dataset.value, 10));
    });
  });

  elements.chatContextMenu.querySelectorAll('[data-chat-action]').forEach(item => {
    item.addEventListener('click', async (e) => {
      e.stopPropagation();
      const action = item.dataset.chatAction;
      const chat   = _state.contextMenuChat;
      hideChatContextMenu();

      if (chat && actions[action]) {
        _state.contextMenuChat = chat;   // restore after hideChatContextMenu
        await actions[action]();
        _state.contextMenuChat = null;
      } else if (!chat) {
        logger.warn('No chat selected for action:', action);
      } else {
        logger.warn('Unknown chat action:', action);
      }
    });
  });
}

// ---------------------------------------------------------------------------
// C.15 — Rating widget
// ---------------------------------------------------------------------------

export function updateChatRatingWidget(rating) {
  const widget = document.getElementById('chatRatingWidget');
  if (!widget) return;
  widget.querySelectorAll('.star-btn').forEach(btn => {
    const val = parseInt(btn.dataset.value, 10);
    btn.classList.toggle('is-active',   val <= rating);
    btn.setAttribute('aria-pressed', val <= rating ? 'true' : 'false');
  });
}

export async function handleRateChatAction(value) {
  const chat = _state.contextMenuChat;
  if (!chat) return;
  const newRating = chat.rating === value ? null : value;
  _state.chats = await _state.chatRepo.updateChat(chat.id, { rating: newRating });
  _state.contextMenuChat = { ...chat, rating: newRating };
  updateChatRatingWidget(newRating || 0);
  _state.renderer.setChatData(_state.chats);
  renderTreeView();
}

// ---------------------------------------------------------------------------
// handleChatSaved — orchestrates the "save chat" flow (Issue 3.4 refactored).
//
// Steps:
//  1. Append new chat to in-memory list
//  2. Prompt user to assign it to a topic
//  3. Apply title / tag edits from dialog
//  4. Persist via ChatRepository.updateChat
//  5. Save tree
//  6. Re-render UI
//  7. Flash pop animation on new node
//  8. Refresh recent rail
// ---------------------------------------------------------------------------

export async function handleChatSaved(chatEntry) {
  // 1. Upsert into the in-memory list before the dialog (so the chat is
  //    visible immediately).  Remove any stale copy with the same id first
  //    to prevent transient duplicates if loadAll() ran after the background
  //    already wrote to storage.
  _state.chats = [..._state.chats.filter(c => c.id !== chatEntry.id), chatEntry];
  _state.renderer.setChatData(_state.chats);

  // 2. Prompt assignment — pass the same topic the button label shows so the
  //    select defaults to the one the user already has in mind.
  const preferredTopicId = _state.lastCreatedTopicId || _state.lastUsedTopicId || null;
  const result = await _state.chatDialogs.showAssignChat(chatEntry, preferredTopicId);
  if (!result) {
    // User cancelled — reset save button without marking success
    setSaveBtnState('default');
    return;
  }

  // 3. Apply mutations
  const updatedChat = assignChatToTopic(chatEntry, result.topicId, _state.tree);
  if (result.title && result.title !== chatEntry.title) updatedChat.title = result.title;
  if (result.tags  !== undefined)                       updatedChat.tags  = result.tags;

  // 4. Persist
  _state.chats = await _state.chatRepo.updateChat(chatEntry.id, updatedChat);

  // 5. Save tree
  await saveTree();

  // 6. Re-render
  _state.renderer.setChatData(_state.chats);
  renderTreeView();
  _state.renderer.expandToTopic(result.topicId);

  // Record the topic used so the button shows it as the default next time.
  // Also clear lastCreatedTopicId — it has been consumed by this save.
  _state.lastUsedTopicId    = result.topicId;
  _state.lastCreatedTopicId = null;

  // Now mark save as successful (auto-resets to 'default', which will show lastUsedTopicId)
  setSaveBtnState('success');

  // 7. Flash pop animation on the new node
  requestAnimationFrame(() => {
    const li = elements.treeView?.querySelector(`li[data-chat-id="${updatedChat.id}"]`);
    if (li) {
      li.classList.add('tree-node--pop');
      li.addEventListener('animationend', () => li.classList.remove('tree-node--pop'), { once: true });
    }
  });

  // 8. Refresh recent rail
  updateRecentRail(handleChatClick);
}

// ---------------------------------------------------------------------------
// Individual CRUD actions
// ---------------------------------------------------------------------------

function handleOpenChatAction() {
  if (_state.contextMenuChat) handleChatClick(_state.contextMenuChat);
}

async function handleRenameChatAction() {
  if (!_state.contextMenuChat) return;
  const result = await _state.chatDialogs.showRenameChat(_state.contextMenuChat);
  if (!result) return;

  const updates = { title: result.title };
  if (result.tags !== undefined) updates.tags = result.tags;
  _state.chats = await _state.chatRepo.updateChat(_state.contextMenuChat.id, updates);
  _state.renderer.setChatData(_state.chats);
  renderTreeView();
  updateRecentRail(handleChatClick);
}

async function handleEditTagsAction() {
  if (!_state.contextMenuChat) return;
  const result = await _state.chatDialogs.showEditTags(_state.contextMenuChat);
  if (!result) return;

  _state.chats = await _state.chatRepo.updateChat(_state.contextMenuChat.id, { tags: result.tags });
  _state.renderer.setChatData(_state.chats);
  renderTreeView();
}

async function handleMoveChatAction() {
  if (!_state.contextMenuChat) return;
  const result = await _state.chatDialogs.showMoveChat(_state.contextMenuChat);
  if (!result) return;

  const movedChat = moveChatToTopic(_state.contextMenuChat, result.topicId, _state.tree);
  _state.chats = await _state.chatRepo.updateChat(_state.contextMenuChat.id, movedChat);
  await saveTree();
  _state.renderer.setChatData(_state.chats);
  renderTreeView();
  _state.renderer.expandToTopic(result.topicId);
  saveExpandedState();
}

async function handleDeleteChatAction() {
  if (!_state.contextMenuChat) return;
  const result = await _state.chatDialogs.showDeleteChat(_state.contextMenuChat);
  if (!result) return;

  const chat = _state.contextMenuChat;
  if (chat.topicId) {
    removeChatFromTopic(chat.id, chat.topicId, _state.tree);
    await saveTree();
  }
  _state.chats = await _state.chatRepo.removeChat(chat.id);
  _state.renderer.setChatData(_state.chats);
  renderTreeView();
}

async function handleSetReviewDateAction() {
  if (!_state.contextMenuChat) return;
  const result = await _state.chatDialogs.showSetReviewDate(_state.contextMenuChat);
  if (!result) return;

  _state.chats = await _state.chatRepo.updateChat(
    _state.contextMenuChat.id,
    { reviewDate: result.reviewDate, flaggedAsStale: false }
  );
  _state.renderer.setChatData(_state.chats);
  renderTreeView();
}

async function handleExportChatAction() {
  if (!_state.contextMenuChat) return;
  try {
    await _state.exportDialog.showExportChat(_state.contextMenuChat, _state.tree);
  } catch (err) {
    logger.error('Export chat failed:', err);
    await _state.dialog.alert(err.message || 'Export failed', 'Export Error');
  }
}

export async function handleCopyChatAction() {
  const chat = _state.contextMenuChat;
  if (!chat) return;

  let fullChats;
  try {
    fullChats = await _state.chatRepo.loadFullByIds(new Set([chat.id]));
  } catch (err) {
    logger.warn('Copy: failed to load chat content', err);
    showNotification('Failed to load chat content', 'error');
    return;
  }

  if (!fullChats || fullChats.length === 0) {
    showNotification('Chat content not found', 'error');
    return;
  }

  const result = await copyChatsToClipboard(fullChats);

  if (result.tooLarge) {
    showNotification('Content too large to copy — use Export instead', 'error');
    return;
  }
  if (!result.ok) {
    showNotification('Failed to copy to clipboard', 'error');
    return;
  }
  showNotification('Copied to clipboard', 'success');
}
