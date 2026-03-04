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

import { TopicTree } from '../../lib/tree.js';
import { TreeRenderer } from '../../lib/tree-renderer.js';
import { moveChatToTopic } from '../../lib/chat-manager.js';
import { state, elements } from '../app-context.js';
import { showNotification } from '../notification.js';
import { updateStorageUsage } from '../features/storage-usage.js';

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
 * Load the topic tree from storage into state.tree.
 * Initialises an empty tree on error.
 */
export async function loadTree() {
  try {
    const treeData = await state.storage.loadTopicTree();
    state.tree = TopicTree.fromObject(treeData);
    console.log(`Loaded tree with ${state.tree.getAllTopics().length} topics`);
  } catch (error) {
    console.error('Error loading tree:', error);
    state.tree = new TopicTree();
  }
}

/**
 * Persist state.tree to storage and refresh the storage usage display.
 */
export async function saveTree() {
  try {
    await state.storage.saveTopicTree(state.tree.toObject());
    console.log('Tree saved successfully');
    await updateStorageUsage();
  } catch (error) {
    console.error('Error saving tree:', error);
    showNotification('Error saving changes', 'error');
  }
}

// ---------------------------------------------------------------------------
// Expand state
// ---------------------------------------------------------------------------

/** Persist the current expanded-node set to localStorage. */
export function saveExpandedState() {
  if (state.renderer) {
    const expandedIds = state.renderer.getExpandedState();
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
  state.renderer = new TreeRenderer(elements.treeView, state.tree);
  showTreeSkeleton();

  // Topic events
  state.renderer.onTopicClick       = callbacks.onTopicClick       ?? handleTopicClick;
  state.renderer.onTopicContextMenu = callbacks.onTopicContextMenu ?? (() => {});
  state.renderer.onTopicDrop        = handleTopicDrop;
  state.renderer.onTopicPin         = handleTopicPin;

  // Chat events
  state.renderer.setChatData(state.chats);
  state.renderer.onChatClick        = callbacks.onChatClick        ?? (() => {});
  state.renderer.onChatContextMenu  = callbacks.onChatContextMenu  ?? (() => {});
  state.renderer.onChatDrop         = handleChatDrop;

  // C.17 — multi-select
  if (callbacks.onSelectionChange) {
    state.renderer.onSelectionChange = callbacks.onSelectionChange;
  }

  // C.9 — apply saved sort mode
  state.renderer.sortMode = state.sortMode;

  // Restore expanded state
  const savedExpanded = localStorage.getItem('expandedNodes');
  if (savedExpanded) {
    try {
      state.renderer.setExpandedState(JSON.parse(savedExpanded));
    } catch (error) {
      console.error('Error loading expanded state:', error);
    }
  }

  state.renderer.render();
  removeTreeSkeleton();
  state.renderer.updateTopicCount();

  // C.3 — populate topic-scope dropdown (injected to avoid import cycle)
  callbacks.populateTopicScope?.();
}

/**
 * Re-render the tree and refresh the topic count badge.
 * Call this after any mutation to state.tree or state.chats.
 */
export function renderTreeView() {
  if (state.renderer) {
    state.renderer.render();
    state.renderer.updateTopicCount();
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
  if (!state.tree) return;
  const dragged = state.tree.topics[draggedTopicId];
  if (!dragged) return;
  if (dragged.parentId === targetTopicId) return; // no-op

  try {
    state.tree.moveTopic(draggedTopicId, targetTopicId);
    await saveTree();
    renderTreeView();
    state.renderer.expandToTopic(draggedTopicId);
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
  const chat = state.chats.find(c => c.id === chatId);
  if (!chat) return;
  if (chat.topicId === targetTopicId) return;

  const movedChat = moveChatToTopic(chat, targetTopicId, state.tree);
  state.chats = await state.chatRepo.updateChat(chatId, movedChat);
  await saveTree();
  state.renderer.setChatData(state.chats);
  renderTreeView();
  state.renderer.expandToTopic(targetTopicId);
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
  if (!state.tree) return;
  const topic = state.tree.topics[topicId];
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
  const topic = state.tree && state.tree.topics[topicId];
  if (!topic) return [];
  const ids = [...(topic.chatIds || [])];
  for (const childId of (topic.children || [])) {
    ids.push(...collectDescendantChatIds(childId));
  }
  return ids;
}
