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
import { parseZipEntries, buildImportPlan, executeImport } from '../../lib/io/import-parser.js';
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
    // ── Show progress dialog FIRST (before sending request) ───────────────
    // The bulk-fetcher may complete synchronously for DOM-based platforms
    // (e.g. M365 Copilot), so the listener must be ready before we inject.
    _state.dialog.show(`
      <div class="modal-header">
        <h2>Fetching all chats…</h2>
      </div>
      <div class="modal-body" style="display:flex;flex-direction:column;gap:var(--space-md)">
        <div style="flex-shrink:0">
          <p id="fetchProgressMsg">Starting…</p>
          <div class="progress-bar" style="background:var(--bg-tertiary);border-radius:4px;height:8px;overflow:hidden">
            <div id="fetchProgressFill" style="background:var(--accent);width:0%;height:100%;transition:width .3s"></div>
          </div>
        </div>
        <div style="flex:1;max-height:260px;overflow-y:auto;border:1px solid var(--border);border-radius:6px">
          <table id="extractTabTable" style="width:100%;border-collapse:collapse;font-size:12px">
            <thead style="position:sticky;top:0;z-index:1">
              <tr style="background:var(--bg-secondary);border-bottom:1px solid var(--border)">
                <th style="padding:6px 8px;text-align:left;width:60px">Tab #</th>
                <th style="padding:6px 8px;text-align:left">Status</th>
              </tr>
            </thead>
            <tbody id="extractTabBody">
              <tr><td colspan="2" style="padding:12px;text-align:center;color:var(--text-tertiary)">Waiting for tabs…</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    `);

    // ── Listen for progress and result BEFORE sending the request ─────────
    // This avoids a race where a fast (DOM-only) bulk-fetcher finishes before
    // the listener is registered.
    const result = await new Promise((resolve, reject) => {
      const listener = (msg) => {
        if (msg.type === 'SIDEPANEL_FETCH_ALL_CHATS_PROGRESS') {
          const { current, total, title } = msg.data || {};
          const pct = total > 0 ? Math.round((current / total) * 100) : 0;
          console.log(`[bAInder:sidepanel] Progress ${current}/${total} (${pct}%) — ${title || ''}`);
          const msgEl = document.getElementById('fetchProgressMsg');
          const fillEl = document.getElementById('fetchProgressFill');
          if (msgEl) msgEl.textContent = title ? `${current} of ${total} — ${title}` : `Fetched ${current} of ${total}`;
          if (fillEl) fillEl.style.width = `${pct}%`;
        } else if (msg.type === 'SIDEPANEL_EXTRACT_CHAT_PROGRESS') {
          const { states } = msg.data || {};
          if (!Array.isArray(states)) return;
          const tbody = document.getElementById('extractTabBody');
          if (!tbody) return;
          // Clear placeholder row if present
          if (tbody.children.length === 1 && tbody.children[0].colSpan) {
            tbody.innerHTML = '';
          }
          // Ensure we have a row for every known state
          for (const st of states) {
            // Remove row if tab is done — keep the table clean
            if (st.phase === 'done') {
              const row = document.getElementById(`tabrow-${st.tabIndex}`);
              if (row) row.remove();
              continue;
            }
            let row = document.getElementById(`tabrow-${st.tabIndex}`);
            if (!row) {
              row = document.createElement('tr');
              row.id = `tabrow-${st.tabIndex}`;
              row.style.borderBottom = '1px solid var(--border)';
              row.innerHTML = `<td style="padding:4px 8px;font-weight:500">#${st.tabIndex}</td><td style="padding:4px 8px" id="tabstatus-${st.tabIndex}"></td>`;
              tbody.appendChild(row);
            }
            const statusEl = document.getElementById(`tabstatus-${st.tabIndex}`);
            if (statusEl) {
              statusEl.textContent = _formatTabStatus(st);
            }
          }
        } else if (msg.type === 'SIDEPANEL_FETCH_ALL_CHATS_RESULT') {
          console.log(`[bAInder:sidepanel] Received result:`, JSON.stringify(msg.data).slice(0, 300));
          browser.runtime.onMessage.removeListener(listener);
          resolve(msg.data);
        }
      };
      browser.runtime.onMessage.addListener(listener);

      // Timeout after user-configurable minutes (default 90).
      // The progress bar keeps the user informed; they can close the dialog
      // to cancel if they wish.
      browser.storage.local.get(['extractSettings']).then(s => {
        const es = s.extractSettings || {};
        const timeoutMin = Math.max(1, parseInt(es.timeoutMin, 10) || 90);
        const timeoutMs = timeoutMin * 60 * 1000;
        setTimeout(() => {
          browser.runtime.onMessage.removeListener(listener);
          reject(new Error(`Fetch timed out after ${timeoutMin} minutes`));
        }, timeoutMs);
      }).catch(() => {
        // Fallback to 90 minutes if storage read fails
        setTimeout(() => {
          browser.runtime.onMessage.removeListener(listener);
          reject(new Error('Fetch timed out after 90 minutes'));
        }, 5_400_000);
      });

      // ── Ask background to inject bulk-fetcher into the active tab ──────
      // (do this AFTER the listener is registered)
      browser.runtime.sendMessage({ type: 'FETCH_ALL_CHATS' }).then(resp => {
        if (!resp?.success) {
          browser.runtime.onMessage.removeListener(listener);
          reject(new Error(resp?.error || 'Failed to start fetch'));
        }
      });
    });

    _state.dialog.close();

    if (!result?.success) {
      await _state.dialog.alert(result?.error || 'Fetch failed', 'Fetch All Chats');
      return;
    }

    const { platform, chats, needsExtract, errors = [], tabStates = [], totalOriginalChats } = result;

    if (!chats || chats.length === 0) {
      await _state.dialog.alert('No conversations found on this platform.', 'Fetch All Chats');
      return;
    }

    // ── Validate message counts ───────────────────────────────────────────
    // After extraction, check that each chat's messageCount matches the
    // actual number of messages in the scraped data.
    const validationWarnings = [];
    for (const chat of chats) {
      if (chat.messageCount != null && chat.messages && chat.messageCount !== chat.messages.length) {
        validationWarnings.push({
          title: chat.title || 'Untitled',
          url: chat.url || '',
          expected: chat.messageCount,
          actual: chat.messages.length,
        });
      }
    }

    // ── Build error log entries ───────────────────────────────────────────
    const logLines = [];
    logLines.push('=== bAInder Bulk Export Log ===');
    logLines.push(`Date: ${new Date().toISOString()}`);
    logLines.push(`Platform: ${platform}`);
    logLines.push(`Total chats discovered in cloud: ${totalOriginalChats != null ? totalOriginalChats : 'N/A'}`);
    logLines.push(`Chats processed (after range filter): ${chats.length}`);
    logLines.push('');

    if (errors.length > 0) {
      logLines.push('--- ERRORS ---');
      for (const e of errors) {
        const urlStr = e.url ? ` (${e.url})` : '';
        const errStr = e.error ? `: ${e.error}` : '';
        logLines.push(`  [#${e.tabIndex}] "${e.title}"${urlStr}${errStr}`);
      }
      logLines.push('');
    }

    if (validationWarnings.length > 0) {
      logLines.push('--- MESSAGE COUNT MISMATCHES ---');
      logLines.push('The following chats have a different number of messages than expected:');
      for (const v of validationWarnings) {
        logLines.push(`  "${v.title}"${v.url ? ` (${v.url})` : ''}: expected ${v.expected} messages, got ${v.actual}`);
      }
      logLines.push('');
    }

    // Determine which chats are missing (those in the original list but not extracted)
    const missingChats = [];
    if (totalOriginalChats != null && totalOriginalChats > chats.length) {
      logLines.push('--- MISSING CHATS ---');
      logLines.push(`Original cloud total: ${totalOriginalChats}, exported: ${chats.length}`);
      logLines.push(`Missing chats: ${totalOriginalChats - chats.length}`);
      // Collect missing chat info from tabStates that errored
      for (const st of tabStates) {
        if (st.phase === 'error') {
          missingChats.push({ title: st.title, url: st.url, error: st.error });
        }
      }
      if (missingChats.length > 0) {
        logLines.push('Chats that failed to export:');
        for (const m of missingChats) {
          const urlStr = m.url ? ` (${m.url})` : '';
          const errStr = m.error ? `: ${m.error}` : '';
          logLines.push(`  - "${m.title}"${urlStr}${errStr}`);
        }
      }
      logLines.push('');
    }

    if (errors.length === 0 && validationWarnings.length === 0 && missingChats.length === 0) {
      logLines.push('No errors or warnings. All chats exported successfully.');
    } else {
      logLines.push(`Summary: ${errors.length} error(s), ${validationWarnings.length} message count mismatch(es), ${missingChats.length} missing chat(s).`);
    }

    const logContent = logLines.join('\n');

    // Log to console for debugging
    if (errors.length > 0 || validationWarnings.length > 0 || missingChats.length > 0) {
      logger.warn(`Bulk export completed with issues:\n${logContent}`);
    }

    // ── Build ZIP from fetched chats ───────────────────────────────────────
    const dateTag = new Date().toISOString().slice(0, 10);

    // Use a human-readable topic name derived from the platform ID
    const topicName = {
      copilot: 'M365 Copilot',
      chatgpt: 'ChatGPT',
      gemini: 'Gemini',
      perplexity: 'Perplexity',
      deepseek: 'DeepSeek',
      claude: 'Claude',
    }[platform] || platform.charAt(0).toUpperCase() + platform.slice(1);

    const rootDir = `bAInder-bulk-${platform}-${dateTag}`;
    const topicDir = `${rootDir}/${topicName}`; // subfolder = topic in import parser
    const zip = new JSZip();
    const usedNames = new Map(); // safeName → count

    for (const chat of chats) {
      const title = chat.title || 'Untitled';
      const safeName = title.replace(/[<>:"/\\|?*]/g, '_').slice(0, 100);
      const deduped = _deduplicateName(safeName, usedNames);
      const md = _buildBulkMarkdown(chat);
      zip.file(`${topicDir}/${deduped}.md`, md);
    }

    // Add a metadata file at the root
    const meta = {
      exportDate: new Date().toISOString(),
      platform,
      totalChats: chats.length,
      needsExtract,
    };
    zip.file(`${rootDir}/_metadata.json`, JSON.stringify(meta, null, 2));

    // Add error/warning log to the ZIP
    if (logContent) {
      zip.file(`${rootDir}/_export-log.txt`, logContent);
    }

    const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });

    // ── Prompt user for import strategy, then auto-import ──────────────────
    const strategy = await _promptImportStrategy(chats.length, platform);
    if (!strategy) {
      // User cancelled — fall back to just downloading the ZIP
      triggerDownload(`bAInder-${platform}-all-chats-${dateTag}.zip`, blob, 'application/zip');
      showNotification(`Fetched ${chats.length} chat(s) from ${platform}`, 'success');
      return;
    }

    // User chose a strategy — import now
    _state.dialog.show(`
      <div class="modal-header">
        <h2>Importing chats…</h2>
      </div>
      <div class="modal-body">
        <p>Importing ${chats.length} chat(s) from ${platform}…</p>
        <div class="progress-bar" style="background:var(--bg-tertiary);border-radius:4px;height:8px;overflow:hidden">
          <div id="importProgressFill" style="background:var(--accent);width:50%;height:100%;transition:width .3s"></div>
        </div>
      </div>
    `);

    try {
      // Load ZIP entries and build import plan
      const jszip = await JSZip.loadAsync(blob);
      const entryPromises = [];
      jszip.forEach((relativePath, zipEntry) => {
        if (!zipEntry.dir) {
          entryPromises.push(
            zipEntry.async('string').then((content) => ({ path: relativePath, content }))
          );
        }
      });
      const entries = await Promise.all(entryPromises);
      const parsed = parseZipEntries(entries);
      const plan = buildImportPlan(parsed, _state.tree, strategy === 'new-root' ? 'create_root' : strategy);

      // Execute import
      const treeObj = strategy === 'replace' ? null : _state.tree;
      const chatArr = strategy === 'replace' ? [] : _state.chats;
      const result = executeImport(plan, treeObj ? treeObj.toObject() : null, chatArr);

      // Rebuild tree from imported data
      _state.tree  = TopicTree.fromObject({ topics: result.updatedTopics, rootTopicIds: result.updatedRootTopics });
      _state.chats = result.updatedChats;

      // Keep dialog instances' tree reference in sync
      _state.topicDialogs.tree = _state.tree;
      _state.chatDialogs.tree  = _state.tree;

      // Persist
      await saveTree();
      // Re-extract entities from imported chats
      for (const chat of _state.chats) {
        if (!chat.metadata?.importedAt) continue;
        if (!Array.isArray(chat.messages) || chat.messages.length === 0) continue;
        const entities = await extractChatEntities(chat.messages, null, chat.id);
        Object.assign(chat, entities);
      }
      _state.chats = await _state.chatRepo.replaceAll(_state.chats);

      // Refresh UI
      _state.renderer.setTree(_state.tree);
      _state.renderer.setChatData(_state.chats);
      renderTreeView();
      refreshEntityController();
      refreshEntityTypeChipVisibility();
      await updateStorageUsage();

      _state.dialog.close();
      const msg = `Imported ${result.summary.chatsImported} chat(s) from ${platform}.`;
      showNotification(msg, 'success');
    } catch (err) {
      _state.dialog.close();
      logger.error('Auto-import failed:', err);
      // Fall back to ZIP download so data isn't lost
      triggerDownload(`bAInder-${platform}-all-chats-${dateTag}.zip`, blob, 'application/zip');
      await _state.dialog.alert(
        `Import failed: ${err.message}\n\nThe ZIP file has been downloaded so your data is not lost.`,
        'Import Error'
      );
    }
  } catch (err) {
    logger.error('Fetch all chats failed:', err);
    // Close any open dialog first
    _state.dialog.close();
    await _state.dialog.alert(err.message || 'Fetch failed', 'Fetch All Chats');
  }
}

/**
 * Prompt the user to choose an import strategy for the fetched chats.
 * @param {number} count  Number of chats collected
 * @param {string} platform
 * @returns {Promise<string|null>} 'merge' | 'replace' | 'new-root' | null if cancelled
 */
function _promptImportStrategy(count, platform) {
  return new Promise((resolve) => {
    _state.dialog.show(`
      <div class="modal-header">
        <h2>Import ${count} chat(s) from ${platform}?</h2>
      </div>
      <div class="modal-body">
        <p style="margin-bottom:var(--space-md)">Choose how to import the fetched chats into bAInder:</p>
        <div class="dim-strategy-list">
          <label class="dim-strategy-row">
            <input type="radio" name="importStrategy" value="merge" checked>
            <span class="dim-str-icon" aria-hidden="true">🔀</span>
            <span class="dim-str-body">
              <span class="dim-str-name">Merge</span>
              <span class="dim-str-desc">Combine with your existing data</span>
            </span>
          </label>
          <label class="dim-strategy-row">
            <input type="radio" name="importStrategy" value="replace">
            <span class="dim-str-icon" aria-hidden="true">⚠️</span>
            <span class="dim-str-body">
              <span class="dim-str-name">Replace</span>
              <span class="dim-str-desc">Clear all existing data, then import</span>
            </span>
          </label>
          <label class="dim-strategy-row">
            <input type="radio" name="importStrategy" value="new-root">
            <span class="dim-str-icon" aria-hidden="true">📂</span>
            <span class="dim-str-body">
              <span class="dim-str-name">New Root</span>
              <span class="dim-str-desc">Import as new root topics alongside existing data</span>
            </span>
          </label>
        </div>
        <div class="dim-notice dim-notice--warning" id="importReplaceWarning" style="display:none">
          ⚠️ Replace will permanently delete <em>all</em> existing topics and chats.
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" id="strategyCancelBtn">Cancel</button>
        <button class="btn-primary" id="strategyImportBtn">Import</button>
      </div>
    `);

    // Toggle replace warning
    document.querySelectorAll('input[name="importStrategy"]').forEach(radio => {
      radio.addEventListener('change', () => {
        const warn = document.getElementById('importReplaceWarning');
        if (warn) warn.style.display = radio.value === 'replace' ? 'block' : 'none';
      });
    });

    document.getElementById('strategyCancelBtn').addEventListener('click', () => {
      _state.dialog.close();
      resolve(null);
    });

    document.getElementById('strategyImportBtn').addEventListener('click', () => {
      const checked = document.querySelector('input[name="importStrategy"]:checked');
      _state.dialog.close();
      resolve(checked ? checked.value : 'merge');
    });
  });
}

/**
 * Format a tab status object into a human-readable string for the progress table.
 * @param {{ phase: string, remaining?: number, title?: string }} st
 * @returns {string}
 */
function _formatTabStatus(st) {
  switch (st.phase) {
    case 'waiting':
      return `⏳ Waiting… ${st.remaining != null ? `${st.remaining}s` : ''}`;
    case 'loading':
      return '🔄 Loading tab…';
    case 'activating':
      return '⚡ Activating tab…';
    case 'scrolling':
      return '📜 Scrolling to load messages…';
    case 'scraping':
      return '🔍 Extracting messages…';
    case 'saving':
      return '💾 Saving…';
    case 'done':
      return '✅ Done';
    case 'error':
      return '❌ Error';
    default:
      return st.phase || '…';
  }
}

/**
 * Deduplicate a filename within a ZIP by appending _1, _2, etc.
 * when collisions occur.
 * @param {string} name  Base filename (no extension)
 * @param {Map<string, number>} used  Map tracking prior occurrences
 * @returns {string}  Unique name
 */
function _deduplicateName(name, used) {
  const count = (used.get(name) || 0) + 1;
  used.set(name, count);
  return count === 1 ? name : `${name}_${count - 1}`;
}

/**
 * Build markdown for a fetched chat, using the same format as buildExportMarkdown
 * so the ZIP can be re-imported via bAInder's native import pipeline.
 *
 * @param {{ title: string, content?: string, messages: Array<{role: string, content: string}>, source: string, url: string, messageCount?: number, extractedAt?: number, chatDate?: string }} chat
 * @returns {string}
 */
function _buildBulkMarkdown(chat) {
  const title = (chat.title || 'Untitled').trim();
  const source = chat.source || 'unknown';
  const url = chat.url || '';
  const now = new Date().toISOString();
  // Prefer chatDate (from date-divider on Copilot pages), then extractedAt, then now
  const date = chat.chatDate
    ? new Date(chat.chatDate).toISOString()
    : chat.extractedAt
      ? new Date(chat.extractedAt).toISOString()
      : now;

  // If we already have pre-formatted content from prepareChatForSave()
  // (i.e. the chat was extracted via parallel tabs), use it directly.
  // We only need to fix up the date in frontmatter if different from extractedAt.
  if (chat.content && !chat._apiFetched) {
    // Replace the date in the existing frontmatter with the original extractedAt
    const updated = chat.content.replace(
      /^date: .+$/m,
      `date: ${date}`
    );
    return updated;
  }

  // Fallback for API-fetched chats (ChatGPT, Claude) — build from messages
  const lines = [
    '---',
    `title: "${title.replace(/[\\"]/g, '\\$&')}"`,
    `source: ${source}`,
  ];
  if (url) lines.push(`url: ${url}`);
  lines.push('date: ' + date);
  lines.push(`messageCount: ${chat.messageCount || chat.messages?.length || 0}`);
  lines.push('contentFormat: markdown-v1');
  lines.push('---');
  lines.push('');

  if (Array.isArray(chat.messages)) {
    for (const msg of chat.messages) {
      const role = msg.role === 'user' ? 'User' : 'Assistant';
      lines.push(`### ${role}`);
      lines.push('');
      lines.push(msg.content || '');
      lines.push('');
      lines.push('---');
      lines.push('');
    }
  }

  return lines.join('\n');
}
