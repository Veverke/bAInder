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
import JSZip from '../../lib/vendor/jszip-esm.js';
import { triggerDownload } from '../../lib/export/download.js';
import { showNotification } from '../notification.js';
import { saveTree, renderTreeView } from './tree-controller.js';
import { updateStorageUsage } from '../features/storage-usage.js';
import { updateRecentRail } from '../features/recent-rail.js';
import { handleChatClick } from './chat-actions.js';
import { refresh as refreshEntityController } from './entity-controller.js';
import { refreshEntityTypeChipVisibility } from './search-controller.js';
import { extractChatEntities } from '../../lib/entities/entity-extractor.js';
import '../../lib/entities/extractors/index.js'; // registers all extractors so re-extraction works in sidepanel context
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
        // Re-extract entities from imported chats (ZIP markdown → messages was
        // parsed in parseChatFromMarkdown; run extractors now that messages exist).
        for (const chat of updatedChats) {
          if (!chat.metadata?.importedAt) continue; // skip pre-existing chats
          if (!Array.isArray(chat.messages) || chat.messages.length === 0) continue;
          const entities = await extractChatEntities(chat.messages, null, chat.id);
          Object.assign(chat, entities);  // mutates in-place; _state.chats already === updatedChats
        }

        _state.chats = await _state.chatRepo.replaceAll(_state.chats);

        // Refresh UI
        _state.renderer.setTree(_state.tree);
        _state.renderer.setChatData(_state.chats);
        renderTreeView();
        refreshEntityController();       // keep entity panel in sync after import
        refreshEntityTypeChipVisibility(); // show/hide type chips accurately
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

    // Keep dialog instances' tree reference in sync (same pattern as handleImport)
    if (_state.topicDialogs) _state.topicDialogs.tree = _state.tree;
    if (_state.chatDialogs)  _state.chatDialogs.tree  = _state.tree;

    // Clear stale topic references so the save button doesn't show a deleted topic
    _state.lastUsedTopicId    = null;
    _state.lastCreatedTopicId = null;

    await Promise.all([
      _state.storage.saveTopicTree(_state.tree.toObject()),
      _state.chatRepo.replaceAll([]),
    ]);

    _state.renderer.setTree(_state.tree);
    _state.renderer.setChatData(_state.chats);
    renderTreeView();
    refreshEntityController();       // entity panel has no data after clear
    refreshEntityTypeChipVisibility();

    // Hide backup reminder banner — there is nothing left to back up
    if (elements.backupReminderBanner) elements.backupReminderBanner.style.display = 'none';

    updateRecentRail(handleChatClick);
    await updateStorageUsage();

    showNotification('All saved chats cleared.', 'success');
  } catch (err) {
    logger.error('Clear all failed:', err);
    await _state.dialog.alert(err.message || 'Failed to clear data', 'Error');
  }
}

/**
 * Fetch all chats from the currently active AI chat platform tab.
 * Injects bulk-fetcher.js, listens for progress/result, builds a ZIP download.
 */
export async function handleFetchAllChats() {
  try {
    // ── Ask background to inject bulk-fetcher into the active tab ──────────
    const resp = await browser.runtime.sendMessage({ type: 'FETCH_ALL_CHATS' });
    if (!resp?.success) {
      await _state.dialog.alert(resp?.error || 'Failed to start fetch', 'Fetch All Chats');
      return;
    }

    // ── Show a simple "in progress" dialog ─────────────────────────────────
    _state.dialog.show(`
      <div class="modal-header">
        <h2>Fetching all chats…</h2>
      </div>
      <div class="modal-body">
        <p id="fetchProgressMsg">Starting…</p>
        <div class="progress-bar" style="background:var(--bg-tertiary);border-radius:4px;height:8px;overflow:hidden">
          <div id="fetchProgressFill" style="background:var(--accent);width:0%;height:100%;transition:width .3s"></div>
        </div>
      </div>
    `);

    // ── Listen for progress and result ─────────────────────────────────────
    const result = await new Promise((resolve, reject) => {
      const listener = (msg) => {
        if (msg.type === 'SIDEPANEL_FETCH_ALL_CHATS_PROGRESS') {
          const { current, total, title } = msg.data || {};
          const pct = total > 0 ? Math.round((current / total) * 100) : 0;
          const msgEl = document.getElementById('fetchProgressMsg');
          const fillEl = document.getElementById('fetchProgressFill');
          if (msgEl) msgEl.textContent = title ? `${current} of ${total} — ${title}` : `Fetched ${current} of ${total}`;
          if (fillEl) fillEl.style.width = `${pct}%`;
        } else if (msg.type === 'SIDEPANEL_FETCH_ALL_CHATS_RESULT') {
          browser.runtime.onMessage.removeListener(listener);
          resolve(msg.data);
        }
      };
      browser.runtime.onMessage.addListener(listener);

      // Timeout after 10 minutes
      setTimeout(() => {
        browser.runtime.onMessage.removeListener(listener);
        reject(new Error('Fetch timed out after 10 minutes'));
      }, 600_000);
    });

    _state.dialog.close();

    if (!result?.success) {
      await _state.dialog.alert(result?.error || 'Fetch failed', 'Fetch All Chats');
      return;
    }

    const { platform, chats, needsExtract } = result;

    if (!chats || chats.length === 0) {
      await _state.dialog.alert('No conversations found on this platform.', 'Fetch All Chats');
      return;
    }

    // ── Build ZIP from fetched chats ───────────────────────────────────────
    const dateTag = new Date().toISOString().slice(0, 10);
    const rootDir = `bAInder-bulk-${platform}-${dateTag}`;
    const zip = new JSZip();

    for (const chat of chats) {
      const title = chat.title || 'Untitled';
      const safeName = title.replace(/[<>:"/\\|?*]/g, '_').slice(0, 100);
      const md = _buildBulkMarkdown(chat);
      zip.file(`${rootDir}/${safeName}.md`, md);
    }

    // Add a metadata file
    const meta = {
      exportDate: new Date().toISOString(),
      platform,
      totalChats: chats.length,
      needsExtract,
    };
    zip.file(`${rootDir}/_metadata.json`, JSON.stringify(meta, null, 2));

    const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
    triggerDownload(`bAInder-${platform}-all-chats-${dateTag}.zip`, blob, 'application/zip');

    showNotification(`Fetched ${chats.length} chat(s) from ${platform}`, 'success');
  } catch (err) {
    logger.error('Fetch all chats failed:', err);
    // Close any open dialog first
    _state.dialog.close();
    await _state.dialog.alert(err.message || 'Fetch failed', 'Fetch All Chats');
  }
}

/**
 * Build a simple markdown string from a fetched chat object.
 * @param {{ title: string, messages: Array<{role: string, content: string}>, source: string, url: string }} chat
 * @returns {string}
 */
function _buildBulkMarkdown(chat) {
  const lines = [];
  lines.push(`# ${chat.title || 'Untitled'}`);
  lines.push('');
  lines.push(`- **Source:** ${chat.source || 'unknown'}`);
  if (chat.url) lines.push(`- **URL:** ${chat.url}`);
  lines.push('');
  lines.push('---');
  lines.push('');

  if (Array.isArray(chat.messages)) {
    for (const msg of chat.messages) {
      const label = msg.role === 'user' ? '**User**' : '**Assistant**';
      lines.push(`${label}:`);
      lines.push('');
      lines.push(msg.content || '');
      lines.push('');
      lines.push('---');
      lines.push('');
    }
  }

  return lines.join('\n');
}
