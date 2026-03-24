/**
 * multi-select.js
 *
 * Responsibility: the C.17 multi-select mode — entering/exiting selection,
 * tracking the selection count, triggering chat join (save to tree), and
 * optionally exporting a digest.
 *
 * NOT responsible for: export dialog (delegates to ExportDialog), or chat
 * storage (delegates to ChatRepository).
 */

import { state, elements } from '../app-context.js';
import { showNotification } from '../notification.js';
import { buildDigestMarkdown } from '../../lib/export/markdown-builder.js';
import { saveTree, renderTreeView } from '../controllers/tree-controller.js';
import { assignChatToTopic } from '../../lib/chat/chat-manager.js';
import { copyChatsToClipboard } from '../../lib/export/clipboard-serialiser.js';

// Maximum chats that can be loaded simultaneously for bulk operations.
// Above this threshold the heap cost is too high for typical devices.
const MAX_BULK_EXPORT_CHATS = 100;

// ---------------------------------------------------------------------------
// Mode management
// ---------------------------------------------------------------------------

export function handleMultiSelectToggle() {
  if (!state.renderer) return;
  if (state.renderer.multiSelectMode) {
    exitMultiSelectMode();
  } else {
    state.renderer.enterMultiSelectMode();
    elements.multiSelectToggleBtn?.classList.add('section-toggle--active');
    elements.multiSelectToggleBtn?.setAttribute('aria-pressed', 'true');
    if (elements.multiSelectToggleBtn) elements.multiSelectToggleBtn.title = 'Exit selection mode';
    if (elements.selectionBar) elements.selectionBar.style.display = 'flex';
    updateSelectionBar(0);
  }
}

export function exitMultiSelectMode() {
  if (!state.renderer) return;
  state.renderer.exitMultiSelectMode();
  elements.multiSelectToggleBtn?.classList.remove('section-toggle--active');
  elements.multiSelectToggleBtn?.setAttribute('aria-pressed', 'false');
  if (elements.multiSelectToggleBtn) elements.multiSelectToggleBtn.title = 'Select chats';
  if (elements.selectionBar) elements.selectionBar.style.display = 'none';
}

// ---------------------------------------------------------------------------
// Callbacks from TreeRenderer
// ---------------------------------------------------------------------------

/** Registered on the renderer as `onSelectionChange`. */
export function handleSelectionChange(selectedIds, _selectedChats) {
  updateSelectionBar(selectedIds.size);
}

export function updateSelectionBar(count) {
  if (elements.selectionCount) {
    elements.selectionCount.textContent =
      count === 1 ? '1 chat selected' : `${count} chats selected`;
  }
  if (elements.joinBtn) {
    elements.joinBtn.disabled = count < 2;
    elements.joinBtn.title = count < 2
      ? 'Select at least 2 chats to join into a new chat'
      : `Join ${count} chats into a new chat`;
  }
  if (elements.exportDigestBtn) {
    elements.exportDigestBtn.disabled = count < 2;
    elements.exportDigestBtn.title = count < 2
      ? 'Select at least 2 chats to export a digest'
      : `Export digest of ${count} chats`;
  }
  if (elements.copyAllBtn) {
    elements.copyAllBtn.disabled = count < 2;
    elements.copyAllBtn.title = count < 2
      ? 'Select at least 2 chats to copy'
      : `Copy ${count} chats to clipboard`;
  }
  if (elements.compareBtn) {
    elements.compareBtn.disabled = count < 2;
    elements.compareBtn.title = count < 2
      ? 'Select at least 2 chats to compare'
      : `Compare ${count} chats`;
  }
}

// ---------------------------------------------------------------------------
// Join — create a new chat node in the tree from selected chats
// ---------------------------------------------------------------------------

export async function handleJoin() {
  if (!state.renderer) return;
  const metaChats = state.renderer.getSelectedChats();
  if (metaChats.length < 2) {
    showNotification('Select at least 2 chats to join', 'error');
    return;
  }

  // Suggest a title derived from the selected chat titles
  const defaultTitle = metaChats
    .map(c => c.title || 'Untitled')
    .join(' + ')
    .slice(0, 80);

  const title = await state.dialog.prompt(
    `Name this joined chat (combining ${metaChats.length} chats):`,
    defaultTitle,
    'Join Chats'
  );
  if (!title) return; // user cancelled

  // Prompt the user to choose which folder to place the joined chat in
  const existingJoined = state.tree.getAllTopics()
    .find(t => t.name === 'Joined' && !t.parentId);
  const topicOptions = state.topicDialogs.buildTopicOptions(existingJoined?.id || null);
  const folderOptions = existingJoined
    ? topicOptions
    : [{ value: '__joined__', label: "📁 Create 'Joined' folder", selected: true }, ...topicOptions];

  const folderResult = await state.dialog.form([
    {
      name: 'topicId',
      label: 'Save joined chat to',
      type: 'select',
      options: folderOptions,
      hint: 'Choose which folder to place this joined chat in'
    }
  ], 'Choose Folder', 'Join');
  if (!folderResult) return; // user cancelled

  let fullChats;
  try {
    const selectedIds = new Set(metaChats.map(c => c.id));
    if (selectedIds.size > MAX_BULK_EXPORT_CHATS) {
      showNotification(`Cannot join more than ${MAX_BULK_EXPORT_CHATS} chats at once — select fewer`, 'error');
      return;
    }
    fullChats = await state.chatRepo.loadFullByIds(selectedIds);
  } catch (err) {
    console.error('Failed to load full chat content for join:', err);
    showNotification('Failed to load chats for join', 'error');
    return;
  }

  // Build combined markdown content (TOC only for larger joins).
  // forJoin: true selects the messagesToMarkdown-based per-chat serialisation
  // that matches the reader's turn styling, instead of the ### Role export format.
  const topicsMap = state.tree?.topics || {};
  const content   = buildDigestMarkdown(fullChats, topicsMap, { includeToc: fullChats.length > 3, forJoin: true });

  const joinedChat = {
    id:           `joined_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    title:        title.trim(),
    content,
    url:          '',
    source:       'joined',
    timestamp:    Date.now(),
    topicId:      null,
    messageCount: fullChats.reduce((n, c) => n + (c.messageCount || 0), 0),
    messages:     fullChats.flatMap(c => Array.isArray(c.messages) ? c.messages : []),
    metadata: {
      isJoined:  true,
      sourceIds: fullChats.map(c => c.id),
      joinedAt:  new Date().toISOString(),
    },
  };

  try {
    // Save the joined chat to storage
    await state.chatRepo.addChat(joinedChat);

    // Resolve the target folder from the user's selection
    let targetTopicId;
    if (folderResult.topicId === '__joined__') {
      // Create or reuse the 'Joined' root topic
      let joinedTopicId = state.tree.getAllTopics()
        .find(t => t.name === 'Joined' && !t.parentId)?.id;
      if (!joinedTopicId) {
        joinedTopicId = state.tree.addTopic('Joined');
      }
      targetTopicId = joinedTopicId;
    } else {
      targetTopicId = folderResult.topicId;
    }

    // Link the new chat to the topic in-memory and persist
    assignChatToTopic(joinedChat, targetTopicId, state.tree);
    await state.chatRepo.updateChat(joinedChat.id, { topicId: targetTopicId });
    await saveTree();

    // Reload chats and re-render tree
    state.chats = await state.chatRepo.loadAll();
    state.renderer.setChatData(state.chats);
    state.renderer.expandNode(targetTopicId);
    renderTreeView();

    exitMultiSelectMode();
    showNotification(`🔗 "${title.trim()}" joined from ${fullChats.length} chats`, 'success');
  } catch (err) {
    console.error('Join failed:', err);
    showNotification('Join failed: ' + (err.message || 'Unknown error'), 'error');
  }
}

// ---------------------------------------------------------------------------
// Digest export (secondary action — exports without saving to tree)
// ---------------------------------------------------------------------------

export async function handleExportDigest() {
  if (!state.renderer) return;
  const metaChats = state.renderer.getSelectedChats();
  if (metaChats.length < 2) {
    showNotification('Select at least 2 chats to export a digest', 'error');
    return;
  }

  let fullChats;
  try {
    const selectedIds = new Set(metaChats.map(c => c.id));
    if (selectedIds.size > MAX_BULK_EXPORT_CHATS) {
      showNotification(`Cannot export more than ${MAX_BULK_EXPORT_CHATS} chats at once — select fewer`, 'error');
      return;
    }
    fullChats = await state.chatRepo.loadFullByIds(selectedIds);
  } catch (err) {
    console.error('Failed to load full chat content for digest export:', err);
    showNotification('Failed to load chats for export', 'error');
    return;
  }

  try {
    await state.exportDialog.showExportDigest(fullChats, state.tree);
  } catch (err) {
    console.error('Digest export failed:', err);
    await state.dialog.alert(err.message || 'Digest export failed', 'Export Error');
  }
}

// ---------------------------------------------------------------------------
// Copy all — copy selected chats to clipboard (C.26)
// ---------------------------------------------------------------------------

export async function handleCopyAll() {
  if (!state.renderer) return;
  const metaChats = state.renderer.getSelectedChats();
  if (metaChats.length < 2) {
    showNotification('Select at least 2 chats to copy', 'error');
    return;
  }

  let fullChats;
  try {
    const selectedIds = new Set(metaChats.map(c => c.id));
    fullChats = await state.chatRepo.loadFullByIds(selectedIds);
  } catch (err) {
    console.error('Copy all: failed to load chat content:', err);
    showNotification('Failed to load chats for copying', 'error');
    return;
  }

  if (fullChats.length >= 20) {
    showNotification(`Copying ${fullChats.length} chats — this may be slow`, 'info');
  }

  const result = await copyChatsToClipboard(fullChats);

  if (result.tooLarge) {
    showNotification('Content too large to copy — use Export Digest instead', 'error');
    return;
  }
  if (!result.ok) {
    showNotification('Failed to copy to clipboard', 'error');
    return;
  }
  showNotification(`Copied ${fullChats.length} chat${fullChats.length !== 1 ? 's' : ''} to clipboard`, 'success');
}
