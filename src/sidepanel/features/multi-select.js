/**
 * multi-select.js
 *
 * Responsibility: the C.17 multi-select mode — entering/exiting selection,
 * tracking the selection count, triggering chat assembly (save to tree), and
 * optionally exporting a digest.
 *
 * NOT responsible for: export dialog (delegates to ExportDialog), or chat
 * storage (delegates to ChatRepository).
 */

import { state, elements } from '../app-context.js';
import { showNotification } from '../notification.js';
import { buildDigestMarkdown } from '../../lib/export/markdown-builder.js';
import { saveTree, renderTreeView } from '../controllers/tree-controller.js';
import { assignChatToTopic } from '../../lib/chat-manager.js';

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
  if (elements.assembleBtn) {
    elements.assembleBtn.disabled = count < 2;
    elements.assembleBtn.title = count < 2
      ? 'Select at least 2 chats to assemble into a new chat'
      : `Assemble ${count} chats into a new chat`;
  }
  if (elements.exportDigestBtn) {
    elements.exportDigestBtn.disabled = count < 2;
    elements.exportDigestBtn.title = count < 2
      ? 'Select at least 2 chats to export a digest'
      : `Export digest of ${count} chats`;
  }
}

// ---------------------------------------------------------------------------
// Assembly — create a new chat node in the tree from selected chats
// ---------------------------------------------------------------------------

export async function handleAssemble() {
  if (!state.renderer) return;
  const metaChats = state.renderer.getSelectedChats();
  if (metaChats.length < 2) {
    showNotification('Select at least 2 chats to assemble', 'error');
    return;
  }

  // Suggest a title derived from the selected chat titles
  const defaultTitle = metaChats
    .map(c => c.title || 'Untitled')
    .join(' + ')
    .slice(0, 80);

  const title = await state.dialog.prompt(
    `Name this assembled chat (combining ${metaChats.length} chats):`,
    defaultTitle,
    'Assemble Chats'
  );
  if (!title) return; // user cancelled

  let fullChats;
  try {
    const selectedIds = new Set(metaChats.map(c => c.id));
    fullChats = await state.chatRepo.loadFullByIds(selectedIds);
  } catch (err) {
    console.error('Failed to load full chat content for assembly:', err);
    showNotification('Failed to load chats for assembly', 'error');
    return;
  }

  // Build combined markdown content (TOC only for larger assemblies).
  // forAssembly: true selects the messagesToMarkdown-based per-chat serialisation
  // that matches the reader's turn styling, instead of the ### Role export format.
  const topicsMap = state.tree?.topics || {};
  const content   = buildDigestMarkdown(fullChats, topicsMap, { includeToc: fullChats.length > 3, forAssembly: true });

  const assembledChat = {
    id:           `assembled_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    title:        title.trim(),
    content,
    url:          '',
    source:       'assembled',
    timestamp:    Date.now(),
    topicId:      null,
    messageCount: fullChats.reduce((n, c) => n + (c.messageCount || 0), 0),
    messages:     [],
    metadata: {
      isAssembled: true,
      sourceIds:   fullChats.map(c => c.id),
      assembledAt: new Date().toISOString(),
    },
  };

  try {
    // Save the assembled chat to storage
    await state.chatRepo.addChat(assembledChat);

    // Find or create the "Assemblies" topic at the root level
    let assembliesTopicId = state.tree.getAllTopics()
      .find(t => t.name === 'Assemblies' && !t.parentId)?.id;
    if (!assembliesTopicId) {
      assembliesTopicId = state.tree.addTopic('Assemblies');
    }

    // Link the new chat to the topic in-memory and persist
    assignChatToTopic(assembledChat, assembliesTopicId, state.tree);
    await state.chatRepo.updateChat(assembledChat.id, { topicId: assembliesTopicId });
    await saveTree();

    // Reload chats and re-render tree
    state.chats = await state.chatRepo.loadAll();
    state.renderer.setChatData(state.chats);
    state.renderer.expandNode(assembliesTopicId);
    renderTreeView();

    exitMultiSelectMode();
    showNotification(`🔗 “${title.trim()}” assembled from ${fullChats.length} chats`, 'success');
  } catch (err) {
    console.error('Assembly failed:', err);
    showNotification('Assembly failed: ' + (err.message || 'Unknown error'), 'error');
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
