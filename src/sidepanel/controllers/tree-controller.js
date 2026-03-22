/**
 * tree-controller.js
 *
 * Responsibility: all interactions with the TopicTree data model and the
 * TreeRenderer — loading, saving, initialising, rendering, expand/collapse
 * persistence, drag-and-drop, topic pin, and skeleton loading-state helpers.
 *
 * NOT responsible for: topic/chat dialog flows, search, feature panels, or
 * any other UI beyond the tree itself.
 */

import { TopicTree } from '../../lib/tree/tree.js';
import { TreeRenderer } from '../../lib/renderer/tree-renderer.js';
import { moveChatToTopic } from '../../lib/chat/chat-manager.js';
import { state, elements } from '../app-context.js';
import { logger } from '../../lib/utils/logger.js';
import { showNotification } from '../notification.js';
import { updateStorageUsage } from '../features/storage-usage.js';
let _state = state;
// ---------------------------------------------------------------------------
// Test injection hook - lets unit tests provide a mock app context instead of
// mutating the real singleton.  Never call from production code.
// ---------------------------------------------------------------------------
/** @internal */
export function _setContext(ctx) { _state = ctx; }


// ---------------------------------------------------------------------------
// Tree skeleton helpers
// ---------------------------------------------------------------------------

export function showTreeSkeleton() {
  if (!elements.treeView) return;
  const frag = document.createDocumentFragment();
  const widths = ['72%', '58%', '85%', '63%'];
  widths.forEach((w, i) => {
    const row = document.createElement('div');
    row.className = 'skeleton-row';
    row.setAttribute('aria-hidden', 'true');
    row.innerHTML = `
      <span class="skeleton-icon"></span>
      <span class="skeleton-text" style="width:${w}; animation-delay:${i * 80}ms"></span>
    `;
    frag.appendChild(row);
  });
  elements.treeView.appendChild(frag);
}

export function removeTreeSkeleton() {
  elements.treeView?.querySelectorAll('.skeleton-row').forEach(el => el.remove());
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

/**
 * Load the topic tree from storage into _state.tree.
 * Initialises an empty tree on error.
 */
export async function loadTree() {
  try {
    const treeData = await _state.storage.loadTopicTree();
    _state.tree = TopicTree.fromObject(treeData);
    logger.log(`Loaded tree with ${_state.tree.getAllTopics().length} topics`);
  } catch (error) {
    logger.error('Error loading tree:', error);
    _state.tree = new TopicTree();
  }
}

/**
 * Persist _state.tree to storage and refresh the storage usage display.
 */
export async function saveTree() {
  try {
    await _state.storage.saveTopicTree(_state.tree.toObject());
    logger.log('Tree saved successfully');
    await updateStorageUsage();
  } catch (error) {
    logger.error('Error saving tree:', error);
    showNotification('Error saving changes', 'error');
  }
}

// ---------------------------------------------------------------------------
// Expand state
// ---------------------------------------------------------------------------

/** Persist the current expanded-node set to localStorage. */
export function saveExpandedState() {
  if (_state.renderer) {
    const expandedIds = _state.renderer.getExpandedState();
    localStorage.setItem('expandedNodes', JSON.stringify(expandedIds));
  }
}

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------

/**
 * Initialise the TreeRenderer singleton.
 *
 * Callbacks are injected by sidepanel.js (the orchestrator) so this module
 * has no import-time dependency on topic-actions or chat-actions — avoiding
 * circular imports.
 *
 * @param {{
 *   onTopicClick:        Function,
 *   onTopicContextMenu:  Function,
 *   onChatClick:         Function,
 *   onChatContextMenu:   Function,
 *   onSelectionChange:   Function,
 *   populateTopicScope:  Function,
 * }} callbacks
 */
export function initTreeRenderer(callbacks = {}) {
  _state.renderer = new TreeRenderer(elements.treeView, _state.tree);
  showTreeSkeleton();

  // Topic events
  _state.renderer.onTopicClick       = callbacks.onTopicClick       ?? handleTopicClick;
  _state.renderer.onTopicContextMenu = callbacks.onTopicContextMenu ?? (() => {});
  _state.renderer.onTopicDrop        = handleTopicDrop;
  _state.renderer.onTopicPin         = handleTopicPin;

  // Chat events
  _state.renderer.setChatData(_state.chats);
  _state.renderer.onChatClick        = callbacks.onChatClick        ?? (() => {});
  _state.renderer.onChatContextMenu  = callbacks.onChatContextMenu  ?? (() => {});
  _state.renderer.onChatDrop         = handleChatDrop;

  // C.17 — multi-select
  if (callbacks.onSelectionChange) {
    _state.renderer.onSelectionChange = callbacks.onSelectionChange;
  }

  // C.9 — apply saved sort modes
  _state.renderer.sortMode     = _state.sortMode;
  _state.renderer.chatSortMode = _state.chatSortMode || 'date-desc';

  // Restore expanded state
  const savedExpanded = localStorage.getItem('expandedNodes');
  if (savedExpanded) {
    try {
      _state.renderer.setExpandedState(JSON.parse(savedExpanded));
    } catch (error) {
      logger.error('Error loading expanded state:', error);
    }
  }

  _state.renderer.render();
  removeTreeSkeleton();
  _state.renderer.updateTopicCount();

  // C.3 — populate topic-scope dropdown (injected to avoid import cycle)
  callbacks.populateTopicScope?.();
}

/**
 * Re-render the tree and refresh the topic count badge.
 * Call this after any mutation to _state.tree or _state.chats.
 */
export function renderTreeView() {
  if (_state.renderer) {
    _state.renderer.render();
    _state.renderer.updateTopicCount();
  }
}

// ---------------------------------------------------------------------------
// Drag-and-drop handlers
// ---------------------------------------------------------------------------

/**
 * Called by TreeRenderer when a topic is dropped onto another topic or root.
 * @param {string} draggedTopicId
 * @param {string|null} targetTopicId  null = move to root
 */
export async function handleTopicDrop(draggedTopicId, targetTopicId) {
  if (!_state.tree) return;
  const dragged = _state.tree.topics[draggedTopicId];
  if (!dragged) return;
  if (dragged.parentId === targetTopicId) return; // no-op

  try {
    _state.tree.moveTopic(draggedTopicId, targetTopicId);
    await saveTree();
    renderTreeView();
    _state.renderer.expandToTopic(draggedTopicId);
    saveExpandedState();
    showNotification(`Moved "${dragged.name}"`, 'success');
  } catch (err) {
    showNotification(err.message, 'error');
  }
}

/**
 * Called by TreeRenderer when a chat is dropped onto a topic node.
 * @param {string} chatId
 * @param {string} targetTopicId
 */
export async function handleChatDrop(chatId, targetTopicId) {
  const chat = _state.chats.find(c => c.id === chatId);
  if (!chat) return;
  if (chat.topicId === targetTopicId) return;

  const movedChat = moveChatToTopic(chat, targetTopicId, _state.tree);
  _state.chats = await _state.chatRepo.updateChat(chatId, movedChat);
  await saveTree();
  _state.renderer.setChatData(_state.chats);
  renderTreeView();
  _state.renderer.expandToTopic(targetTopicId);
  saveExpandedState();
  showNotification(`Moved "${chat.title}"`, 'success');
}

// ---------------------------------------------------------------------------
// Topic pin (U2)
// ---------------------------------------------------------------------------

/**
 * @param {string}  topicId
 * @param {boolean} pinned
 */
export async function handleTopicPin(topicId, pinned) {
  if (!_state.tree) return;
  const topic = _state.tree.topics[topicId];
  if (!topic) return;
  topic.pinned = pinned;
  await saveTree();
  renderTreeView();
  showNotification(
    pinned ? `📌 "${topic.name}" pinned` : `"${topic.name}" unpinned`,
    'success'
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Recursively collect all chat IDs from a topic and its descendants.
 * @param {string} topicId
 * @returns {string[]}
 */
export function collectDescendantChatIds(topicId) {
  const topic = _state.tree && _state.tree.topics[topicId];
  if (!topic) return [];
  const ids = [...(topic.chatIds || [])];
  for (const childId of (topic.children || [])) {
    ids.push(...collectDescendantChatIds(childId));
  }
  return ids;
}
