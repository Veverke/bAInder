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
import { logger } from '../../lib/utils/logger.js';
import { TopicTree } from '../../lib/tree/tree.js';
import browser from '../../lib/vendor/browser.js';
import { showNotification } from '../notification.js';
import { saveTree, renderTreeView } from './tree-controller.js';
import { updateStorageUsage } from '../features/storage-usage.js';
import { updateRecentRail } from '../features/recent-rail.js';
import { handleChatClick } from './chat-actions.js';
let _state = state;
// ---------------------------------------------------------------------------
// Test injection hook - lets unit tests provide a mock app context instead of
// mutating the real singleton.  Never call from production code.
// ---------------------------------------------------------------------------
/** @internal */
export function _setContext(ctx) { _state = ctx; }


/** Export the entire tree (toolbar action). */
export async function handleExportAll() {
  try {
    await _state.exportDialog.showExportTree(_state.tree, _state.chats);
    // C.10 — record export timestamp; hide backup reminder banner
    await browser.storage.local.set({ lastExportTimestamp: Date.now() });
    if (elements.backupReminderBanner) elements.backupReminderBanner.style.display = 'none';
  } catch (err) {
    logger.error('Export failed:', err);
    await _state.dialog.alert(err.message || 'Export failed', 'Export Error');
  }
}

/** Import from a ZIP file (toolbar action). */
export async function handleImport() {
  try {
    await _state.importDialog.showImportDialog(
      _state.tree,
      _state.chats,
      async (updatedTopics, updatedRootTopics, updatedChats, summary) => {
        // Rebuild tree from imported data
        _state.tree  = TopicTree.fromObject({ topics: updatedTopics, rootTopicIds: updatedRootTopics });
        _state.chats = updatedChats;

        // Keep dialog instances' tree reference in sync
        _state.topicDialogs.tree = _state.tree;
        _state.chatDialogs.tree  = _state.tree;

        // Persist
        await saveTree();
        _state.chats = await _state.chatRepo.replaceAll(_state.chats);

        // Refresh UI
        _state.renderer.setTree(_state.tree);
        _state.renderer.setChatData(_state.chats);
        renderTreeView();
        await updateStorageUsage();

        const msg = `Imported ${summary.chatsImported} chat(s) into ${summary.topicsCreated + summary.topicsMerged} topic(s).`;
        showNotification(msg, 'success');
      }
    );
  } catch (err) {
    logger.error('Import failed:', err);
    await _state.dialog.alert(err.message || 'Import failed', 'Import Error');
  }
}

/** Clear all saved chats and topics (toolbar action). */
export async function handleClearAll() {
  const confirmed = await _state.dialog.confirm(
    'This will permanently delete all saved chats and topics. This cannot be undone.',
    'Clear All Saved Chats'
  );
  if (!confirmed) return;

  try {
    _state.tree  = new TopicTree();
    _state.chats = [];

    await Promise.all([
      _state.storage.saveTopicTree(_state.tree.toObject()),
      _state.chatRepo.replaceAll([]),
    ]);

    _state.renderer.setTree(_state.tree);
    _state.renderer.setChatData(_state.chats);
    renderTreeView();

    updateRecentRail(handleChatClick);
    await updateStorageUsage();

    showNotification('All saved chats cleared.', 'success');
  } catch (err) {
    logger.error('Clear all failed:', err);
    await _state.dialog.alert(err.message || 'Failed to clear data', 'Error');
  }
}
