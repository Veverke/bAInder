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
import { showNotification } from '../notification.js';
import {
  saveTree,
  renderTreeView,
  saveExpandedState,
  collectDescendantChatIds,
} from './tree-controller.js';
import { setSaveBtnState } from '../features/save-banner.js';

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
  state.contextMenuTopic = topic;
  showContextMenu(event.clientX, event.clientY);
}

// ---------------------------------------------------------------------------
// Context-menu wire-up (called once during setupEventListeners)
// ---------------------------------------------------------------------------

export function setupContextMenuActions() {
  const actions = {
    rename: handleRenameTopic,
    move:   handleMoveTopic,
    merge:  handleMergeTopic,
    export: handleExportTopic,
    delete: handleDeleteTopic,
  };

  elements.contextMenu.querySelectorAll('[data-action]').forEach(item => {
    item.addEventListener('click', async (e) => {
      e.stopPropagation();
      const action = item.dataset.action;
      const topic  = state.contextMenuTopic;
      hideContextMenu();

      if (topic && actions[action]) {
        state.contextMenuTopic = topic;   // restore after hideContextMenu
        await actions[action]();
        state.contextMenuTopic = null;
      } else if (!topic) {
        console.warn('No topic selected for action:', action);
      } else {
        console.warn('Unknown topic action:', action);
      }
    });
  });
}

// ---------------------------------------------------------------------------
// CRUD actions
// ---------------------------------------------------------------------------

export async function handleAddTopic() {
  const result = await state.topicDialogs.showAddTopic();
  if (!result) return;

  await saveTree();
  renderTreeView();

  if (result.parentId) state.renderer.expandToTopic(result.topicId);
  state.renderer.selectNode(result.topicId);
  saveExpandedState();

  // Make the Save button suggest saving to this freshly-created topic
  state.lastCreatedTopicId = result.topicId;
  setSaveBtnState('default');
}

export async function handleRenameTopic() {
  if (!state.contextMenuTopic) return;
  const result = await state.topicDialogs.showRenameTopic(state.contextMenuTopic.id);
  if (!result) return;

  await saveTree();
  renderTreeView();
  state.renderer.selectNode(result.topicId);
}

export async function handleMoveTopic() {
  if (!state.contextMenuTopic) return;
  const result = await state.topicDialogs.showMoveTopic(state.contextMenuTopic.id);
  if (!result) return;

  await saveTree();
  renderTreeView();
  state.renderer.expandToTopic(result.topicId);
  state.renderer.selectNode(result.topicId);
  saveExpandedState();
}

export async function handleDeleteTopic() {
  if (!state.contextMenuTopic) return;

  // Collect descendant chat IDs BEFORE the tree mutation
  const chatIdsToDelete = collectDescendantChatIds(state.contextMenuTopic.id);

  const result = await state.topicDialogs.showDeleteTopic(state.contextMenuTopic.id);
  if (!result) return;

  if (chatIdsToDelete.length > 0) {
    state.chats = await state.chatRepo.removeManyChats(chatIdsToDelete);
    state.renderer.setChatData(state.chats);
    console.log(`Removed ${chatIdsToDelete.length} chat(s) from deleted topic tree`);
  }

  await saveTree();
  renderTreeView();
}

export async function handleMergeTopic() {
  if (!state.contextMenuTopic) return;
  const result = await state.topicDialogs.showMergeTopic(state.contextMenuTopic.id);
  if (!result) return;

  await saveTree();
  renderTreeView();
  state.renderer.expandToTopic(result.targetTopicId);
  state.renderer.selectNode(result.targetTopicId);
  saveExpandedState();
}

export async function handleExportTopic() {
  const topic = state.contextMenuTopic;
  if (!topic) return;
  try {
    await state.exportDialog.showExportTopic(topic, state.tree, state.chats);
  } catch (err) {
    console.error('Export failed:', err);
    await state.dialog.alert(err.message || 'Export failed', 'Export Error');
  }
}
