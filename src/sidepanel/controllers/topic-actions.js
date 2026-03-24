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
import { showNotification, showUndoToast } from '../notification.js';
import { copyChatsToClipboard } from '../../lib/export/clipboard-serialiser.js';
import { Topic } from '../../lib/tree/tree.js';
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
    rename:              handleRenameTopic,
    move:                handleMoveTopic,
    merge:               handleMergeTopic,
    export:              handleExportTopic,
    delete:              handleDeleteTopic,
    'copy-all':          handleCopyAllTopicChats,
    'add-child-topic':   handleAddChildTopic,
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

export async function handleAddChildTopic() {
  if (!_state.contextMenuTopic) return;
  const result = await _state.topicDialogs.showAddTopic(_state.contextMenuTopic.id);
  if (!result) return;

  await saveTree();
  renderTreeView();

  _state.renderer.expandToTopic(result.topicId);
  _state.renderer.selectNode(result.topicId);
  saveExpandedState();

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
  const topicId = _state.contextMenuTopic.id;

  // Capture subtree snapshot and related chats BEFORE any mutation
  const subtreeSnapshot = _captureSubtree(_state.tree, topicId);
  const parentId        = _state.tree.topics[topicId]?.parentId ?? null;
  const chatIdsToDelete = collectDescendantChatIds(topicId);
  const chatsSnapshot   = _state.chats.filter(c => chatIdsToDelete.includes(c.id));

  // Show confirm dialog (tree mutation happens inside showDeleteTopic)
  const result = await _state.topicDialogs.showDeleteTopic(topicId);
  if (!result) return;

  // Optimistic UI: remove chats from memory, re-render (tree already mutated by dialog)
  _state.chats = _state.chats.filter(c => !chatIdsToDelete.includes(c.id));
  _state.renderer.setChatData(_state.chats);
  renderTreeView();

  // Deferred storage delete — runs only if undo is not clicked
  const deleteTimer = setTimeout(async () => {
    try {
      if (chatIdsToDelete.length > 0) {
        await _state.chatRepo.removeManyChats(chatIdsToDelete);
      }
      await saveTree();
    } catch (err) {
      logger.error('Deferred topic delete failed:', err);
    }
  }, 6000);

  showUndoToast(`Topic "${result.name}" deleted`, () => {
    clearTimeout(deleteTimer);
    // Restore topic nodes as proper Topic instances
    for (const [id, plain] of Object.entries(subtreeSnapshot)) {
      _state.tree.topics[id] = Topic.fromObject(plain);
    }
    // Reattach root-level hook
    if (parentId) {
      const parent = _state.tree.topics[parentId];
      if (parent && !parent.children.includes(topicId)) parent.children.push(topicId);
    } else {
      if (!_state.tree.rootTopicIds.includes(topicId)) _state.tree.rootTopicIds.push(topicId);
    }
    // Restore chats
    _state.chats = [..._state.chats, ...chatsSnapshot];
    _state.renderer.setChatData(_state.chats);
    renderTreeView();
    showNotification('Topic restored', 'success');
  });
}

/**
 * Deep-clone all topic nodes in the subtree rooted at `topicId`.
 * Returns a plain-object map { [id]: topicPlainObject }.
 * @param {import('../../lib/tree/tree.js').TopicTree} tree
 * @param {string} topicId
 * @returns {Object}
 */
function _captureSubtree(tree, topicId) {
  const snapshot = {};
  function collect(id) {
    const topic = tree.topics[id];
    if (!topic) return;
    snapshot[id] = JSON.parse(JSON.stringify(topic));
    for (const childId of topic.children) collect(childId);
  }
  collect(topicId);
  return snapshot;
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
