/**
 * import-export-actions.js
 *
 * Responsibility: toolbar-level export and import actions — "Export All" and
 * "Import from ZIP".
 *
 * NOT responsible for: the export/import dialog UI itself (delegated to
 * ExportDialog / ImportDialog), tree persistence, or chat storage.
 */

import { state, elements } from '../app-context.js';
import { TopicTree } from '../../lib/tree.js';
import browser from '../../lib/vendor/browser.js';
import { showNotification } from '../notification.js';
import { saveTree, renderTreeView } from './tree-controller.js';
import { updateStorageUsage } from '../features/storage-usage.js';
import { updateRecentRail } from '../features/recent-rail.js';
import { handleChatClick } from './chat-actions.js';

/** Export the entire tree (toolbar action). */
export async function handleExportAll() {
  try {
    await state.exportDialog.showExportTree(state.tree, state.chats);
    // C.10 — record export timestamp; hide backup reminder banner
    await browser.storage.local.set({ lastExportTimestamp: Date.now() });
    if (elements.backupReminderBanner) elements.backupReminderBanner.style.display = 'none';
  } catch (err) {
    console.error('Export failed:', err);
    await state.dialog.alert(err.message || 'Export failed', 'Export Error');
  }
}

/** Import from a ZIP file (toolbar action). */
export async function handleImport() {
  try {
    await state.importDialog.showImportDialog(
      state.tree,
      state.chats,
      async (updatedTopics, updatedRootTopics, updatedChats, summary) => {
        // Rebuild tree from imported data
        state.tree  = TopicTree.fromObject({ topics: updatedTopics, rootTopicIds: updatedRootTopics });
        state.chats = updatedChats;

        // Keep dialog instances' tree reference in sync
        state.topicDialogs.tree = state.tree;
        state.chatDialogs.tree  = state.tree;

        // Persist
        await saveTree();
        state.chats = await state.chatRepo.replaceAll(state.chats);

        // Refresh UI
        state.renderer.setTree(state.tree);
        state.renderer.setChatData(state.chats);
        renderTreeView();
        await updateStorageUsage();

        const msg = `Imported ${summary.chatsImported} chat(s) into ${summary.topicsCreated + summary.topicsMerged} topic(s).`;
        showNotification(msg, 'success');
      }
    );
  } catch (err) {
    console.error('Import failed:', err);
    await state.dialog.alert(err.message || 'Import failed', 'Import Error');
  }
}

/** Clear all saved chats and topics (toolbar action). */
export async function handleClearAll() {
  const confirmed = await state.dialog.confirm(
    'This will permanently delete all saved chats and topics. This cannot be undone.',
    'Clear All Saved Chats'
  );
  if (!confirmed) return;

  try {
    state.tree  = new TopicTree();
    state.chats = [];

    await Promise.all([
      state.storage.saveTopicTree(state.tree.toObject()),
      state.chatRepo.replaceAll([]),
    ]);

    state.renderer.setTree(state.tree);
    state.renderer.setChatData(state.chats);
    renderTreeView();

    updateRecentRail(handleChatClick);
    await updateStorageUsage();

    showNotification('All saved chats cleared.', 'success');
  } catch (err) {
    console.error('Clear all failed:', err);
    await state.dialog.alert(err.message || 'Failed to clear data', 'Error');
  }
}
