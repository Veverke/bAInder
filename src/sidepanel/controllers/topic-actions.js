/**
 * topic-actions.js
 *
 * Responsibility: all user-driven topic CRUD operations and the topic
 * context-menu interactions.
 *
 * Covers: add, rename, move, delete, merge, export, drag-and-drop initiating,
 * context-menu show/hide, and context-menu action dispatch.
 *
 * NOT responsible for: rendering, tree persistence (delegates to tree-controller),
 * or chat storage (delegates to chat-repository).
 */

import { state, elements } from '../app-context.js';
import { logger } from '../../lib/utils/logger.js';
import { showNotification } from '../notification.js';
import { copyChatsToClipboard } from '../../lib/export/clipboard-serialiser.js';
import {
  saveTree,
  renderTreeView,
  saveExpandedState,
  collectDescendantChatIds,
} from './tree-controller.js';
import { setSaveBtnState } from '../features/save-banner.js';
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

export function showContextMenu(x, y) {
  elements.contextMenu.style.left = `${x}px`;
  elements.contextMenu.style.top  = `${y}px`;
  elements.contextMenu.style.display = 'block';

  setTimeout(() => {
    const rect = elements.contextMenu.getBoundingClientRect();
    if (rect.right  > window.innerWidth)  elements.contextMenu.style.left = `${window.innerWidth  - rect.width  - 10}px`;
    if (rect.bottom > window.innerHeight) elements.contextMenu.style.top  = `${window.innerHeight - rect.height - 10}px`;
  }, 0);
}

export function hideContextMenu() {
  elements.contextMenu.style.display = 'none';
}

// ---------------------------------------------------------------------------
// Event handlers wired by TreeRenderer
// ---------------------------------------------------------------------------

export function handleTopicClick(_topic) {
  // Expand-state bookkeeping is handled inside tree-controller.handleTopicClick;
  // this export exists so tree-controller can register it as a renderer callback.
  saveExpandedState();
}

export async function handleTopicContextMenu(topic, event) {
  event.preventDefault();
  _state.contextMenuTopic = topic;
  showContextMenu(event.clientX, event.clientY);
}

// ---------------------------------------------------------------------------
// Context-menu wire-up (called once during setupEventListeners)
// ---------------------------------------------------------------------------

export function setupContextMenuActions() {
  const actions = {
    rename:     handleRenameTopic,
    move:       handleMoveTopic,
    merge:      handleMergeTopic,
    export:     handleExportTopic,
    delete:     handleDeleteTopic,
    'copy-all': handleCopyAllTopicChats,
  };

  elements.contextMenu.querySelectorAll('[data-action]').forEach(item => {
    item.addEventListener('click', async (e) => {
      e.stopPropagation();
      const action = item.dataset.action;
      const topic  = _state.contextMenuTopic;
      hideContextMenu();

      if (topic && actions[action]) {
        _state.contextMenuTopic = topic;   // restore after hideContextMenu
        await actions[action]();
        _state.contextMenuTopic = null;
      } else if (!topic) {
        logger.warn('No topic selected for action:', action);
      } else {
        logger.warn('Unknown topic action:', action);
      }
    });
  });
}

// ---------------------------------------------------------------------------
// CRUD actions
// ---------------------------------------------------------------------------

export async function handleAddTopic() {
  const result = await _state.topicDialogs.showAddTopic();
  if (!result) return;

  await saveTree();
  renderTreeView();

  if (result.parentId) _state.renderer.expandToTopic(result.topicId);
  _state.renderer.selectNode(result.topicId);
  saveExpandedState();

  // Make the Save button suggest saving to this freshly-created topic
  _state.lastCreatedTopicId = result.topicId;
  setSaveBtnState('default');
}

export async function handleRenameTopic() {
  if (!_state.contextMenuTopic) return;
  const result = await _state.topicDialogs.showRenameTopic(_state.contextMenuTopic.id);
  if (!result) return;

  await saveTree();
  renderTreeView();
  _state.renderer.selectNode(result.topicId);
}

export async function handleMoveTopic() {
  if (!_state.contextMenuTopic) return;
  const result = await _state.topicDialogs.showMoveTopic(_state.contextMenuTopic.id);
  if (!result) return;

  await saveTree();
  renderTreeView();
  _state.renderer.expandToTopic(result.topicId);
  _state.renderer.selectNode(result.topicId);
  saveExpandedState();
}

export async function handleDeleteTopic() {
  if (!_state.contextMenuTopic) return;

  // Collect descendant chat IDs BEFORE the tree mutation
  const chatIdsToDelete = collectDescendantChatIds(_state.contextMenuTopic.id);

  const result = await _state.topicDialogs.showDeleteTopic(_state.contextMenuTopic.id);
  if (!result) return;

  if (chatIdsToDelete.length > 0) {
    _state.chats = await _state.chatRepo.removeManyChats(chatIdsToDelete);
    _state.renderer.setChatData(_state.chats);
    logger.log(`Removed ${chatIdsToDelete.length} chat(s) from deleted topic tree`);
  }

  await saveTree();
  renderTreeView();
}

export async function handleMergeTopic() {
  if (!_state.contextMenuTopic) return;
  const result = await _state.topicDialogs.showMergeTopic(_state.contextMenuTopic.id);
  if (!result) return;

  await saveTree();
  renderTreeView();
  _state.renderer.expandToTopic(result.targetTopicId);
  _state.renderer.selectNode(result.targetTopicId);
  saveExpandedState();
}

export async function handleExportTopic() {
  const topic = _state.contextMenuTopic;
  if (!topic) return;
  try {
    await _state.exportDialog.showExportTopic(topic, _state.tree, _state.chats);
  } catch (err) {
    logger.error('Export failed:', err);
    await _state.dialog.alert(err.message || 'Export failed', 'Export Error');
  }
}

export async function handleCopyAllTopicChats() {
  const topic = _state.contextMenuTopic;
  if (!topic) return;

  const chatIds = collectDescendantChatIds(topic.id);
  if (chatIds.length === 0) {
    showNotification('No chats to copy in this topic', 'info');
    return;
  }

  let fullChats;
  try {
    fullChats = await _state.chatRepo.loadFullByIds(new Set(chatIds));
  } catch (err) {
    logger.warn('Copy all: failed to load chat content', err);
    showNotification('Failed to load chat content', 'error');
    return;
  }

  if (fullChats.length === 0) {
    showNotification('No chats found to copy', 'info');
    return;
  }

  if (fullChats.length >= 20) {
    showNotification(`Copying ${fullChats.length} chats — this may be slow`, 'info');
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
  showNotification(`Copied ${fullChats.length} chat${fullChats.length !== 1 ? 's' : ''} to clipboard`, 'success');
}
