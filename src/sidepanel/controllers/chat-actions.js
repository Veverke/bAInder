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
import { showNotification } from '../notification.js';
import {
  assignChatToTopic,
  moveChatToTopic,
  removeChatFromTopic,
} from '../../lib/chat-manager.js';
import browser from '../../lib/vendor/browser.js';
import {
  saveTree,
  renderTreeView,
  saveExpandedState,
} from './tree-controller.js';
import { setSaveBtnState } from '../features/save-banner.js';
import { updateRecentRail } from '../features/recent-rail.js';

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
  state.contextMenuChat = chat;
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
      const chat   = state.contextMenuChat;
      hideChatContextMenu();

      if (chat && actions[action]) {
        state.contextMenuChat = chat;   // restore after hideChatContextMenu
        await actions[action]();
        state.contextMenuChat = null;
      } else if (!chat) {
        console.warn('No chat selected for action:', action);
      } else {
        console.warn('Unknown chat action:', action);
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
  const chat = state.contextMenuChat;
  if (!chat) return;
  const newRating = chat.rating === value ? null : value;
  state.chats = await state.chatRepo.updateChat(chat.id, { rating: newRating });
  state.contextMenuChat = { ...chat, rating: newRating };
  updateChatRatingWidget(newRating || 0);
  state.renderer.setChatData(state.chats);
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
  // 1. Update in-memory list before the dialog (so the chat is visible)
  state.chats = [...state.chats, chatEntry];
  state.renderer.setChatData(state.chats);

  // 2. Prompt assignment
  const result = await state.chatDialogs.showAssignChat(chatEntry);
  if (!result) {
    // User cancelled — reset save button without marking success
    setSaveBtnState('default');
    return;
  }

  // 3. Apply mutations
  const updatedChat = assignChatToTopic(chatEntry, result.topicId, state.tree);
  if (result.title && result.title !== chatEntry.title) updatedChat.title = result.title;
  if (result.tags  !== undefined)                       updatedChat.tags  = result.tags;

  // 4. Persist
  state.chats = await state.chatRepo.updateChat(chatEntry.id, updatedChat);

  // 5. Save tree
  await saveTree();

  // 6. Re-render
  state.renderer.setChatData(state.chats);
  renderTreeView();
  state.renderer.expandToTopic(result.topicId);

  // Record the topic used so the button shows it as the default next time.
  // Also clear lastCreatedTopicId — it has been consumed by this save.
  state.lastUsedTopicId    = result.topicId;
  state.lastCreatedTopicId = null;

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
  if (state.contextMenuChat) handleChatClick(state.contextMenuChat);
}

async function handleRenameChatAction() {
  if (!state.contextMenuChat) return;
  const result = await state.chatDialogs.showRenameChat(state.contextMenuChat);
  if (!result) return;

  const updates = { title: result.title };
  if (result.tags !== undefined) updates.tags = result.tags;
  state.chats = await state.chatRepo.updateChat(state.contextMenuChat.id, updates);
  state.renderer.setChatData(state.chats);
  renderTreeView();
}

async function handleEditTagsAction() {
  if (!state.contextMenuChat) return;
  const result = await state.chatDialogs.showEditTags(state.contextMenuChat);
  if (!result) return;

  state.chats = await state.chatRepo.updateChat(state.contextMenuChat.id, { tags: result.tags });
  state.renderer.setChatData(state.chats);
  renderTreeView();
}

async function handleMoveChatAction() {
  if (!state.contextMenuChat) return;
  const result = await state.chatDialogs.showMoveChat(state.contextMenuChat);
  if (!result) return;

  const movedChat = moveChatToTopic(state.contextMenuChat, result.topicId, state.tree);
  state.chats = await state.chatRepo.updateChat(state.contextMenuChat.id, movedChat);
  await saveTree();
  state.renderer.setChatData(state.chats);
  renderTreeView();
  state.renderer.expandToTopic(result.topicId);
  saveExpandedState();
}

async function handleDeleteChatAction() {
  if (!state.contextMenuChat) return;
  const result = await state.chatDialogs.showDeleteChat(state.contextMenuChat);
  if (!result) return;

  const chat = state.contextMenuChat;
  if (chat.topicId) {
    removeChatFromTopic(chat.id, chat.topicId, state.tree);
    await saveTree();
  }
  state.chats = await state.chatRepo.removeChat(chat.id);
  state.renderer.setChatData(state.chats);
  renderTreeView();
}

async function handleSetReviewDateAction() {
  if (!state.contextMenuChat) return;
  const result = await state.chatDialogs.showSetReviewDate(state.contextMenuChat);
  if (!result) return;

  state.chats = await state.chatRepo.updateChat(
    state.contextMenuChat.id,
    { reviewDate: result.reviewDate, flaggedAsStale: false }
  );
  state.renderer.setChatData(state.chats);
  renderTreeView();
}
