/**
 * @file export-dialog.js
 * @description Export dialog UI for bAInder.
 *
 * Presents a modal with Format / Scope / Style radio groups and delegates all
 * heavy lifting to export-engine.js.  Depends on DialogManager for the modal
 * lifecycle; never touches the DOM directly outside of wiring event listeners
 * onto the container that DialogManager already owns.
 */

import JSZip from './vendor/jszip-esm.js';
import {
  buildExportMarkdown,
  buildExportHtml,
  buildZipPayload,
  buildTopicPath,
  triggerDownload,
  sanitizeFilename,
  buildDigestMarkdown,
  buildDigestHtml,
} from './export-engine.js';
import { STYLES, STYLE_LABELS } from './style-transformer.js';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Formats available in topic (bulk) mode. */
const TOPIC_FORMATS = [
  { value: 'markdown', label: 'Markdown' },
  { value: 'html',     label: 'HTML'     },
  { value: 'pdf',      label: 'PDF'      },
  { value: 'zip',      label: 'ZIP'      },
];

/** Formats available in single-chat mode (no ZIP). */
const CHAT_FORMATS = [
  { value: 'markdown', label: 'Markdown' },
  { value: 'html',     label: 'HTML'     },
  { value: 'pdf',      label: 'PDF'      },
];

/** Scope options shown only in topic mode. */
const SCOPE_OPTIONS = [
  { value: 'this-topic',       label: 'This topic only'         },
  { value: 'topic-recursive',  label: 'Topic + all subtopics'   },
  { value: 'entire-tree',      label: 'Entire tree'             },
];

// ─── ExportDialog ─────────────────────────────────────────────────────────────

export class ExportDialog {
  /**
   * @param {import('./dialog-manager.js').DialogManager} dialogManager
   */
  constructor(dialogManager) {
    this.dialog = dialogManager;
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Show the export dialog for a topic context-menu action.
   *
   * Presents Format (Markdown / HTML / PDF / ZIP), Scope (this topic /
   * recursive / entire tree), and Style options.  On confirmation the
   * appropriate export function is called.
   *
   * @param {Object} topic   — the topic to export (from state.contextMenuTopic)
   * @param {Object} tree    — TopicTree instance (has .topics map and .rootTopics)
   * @param {Array}  chats   — all chat entries from storage
   * @returns {Promise<void>}
   */
  async showExportTopic(topic, tree, chats) {
    if (!topic) {
      await this.dialog.alert('No topic selected for export.', 'Export');
      return;
    }
    if (!Array.isArray(chats)) {
      await this.dialog.alert('Chat data is unavailable.', 'Export');
      return;
    }

    const html = this._buildDialogHtml({
      title:   this.dialog.escapeHtml(topic.name || 'Topic'),
      formats: TOPIC_FORMATS,
      scopes:  SCOPE_OPTIONS,
      showScope: true,
    });

    this.dialog.show(html, { size: 'large' });
    this._wireDialogEvents({ mode: 'topic', topic, tree, chats });
  }

  /**
   * Show the export dialog for a single chat.
   *
   * Only Format (Markdown / HTML / PDF) and Style are shown; Scope is hidden
   * because the export target is always exactly one chat.
   *
   * @param {Object} chat  — chat entry from storage
   * @param {Object} tree  — TopicTree instance
   * @returns {Promise<void>}
   */
  /**
   * Show the export dialog pre-set to export the entire tree.
   *
   * The Scope selector defaults to "Entire tree"; the user can still change it
   * if they want.  Because scope is "entire-tree" the topic argument is
   * irrelevant inside _doExportTopic, so we pass null.
   *
   * @param {Object} tree   — TopicTree instance
   * @param {Array}  chats  — all chat entries from storage
   * @returns {Promise<void>}
   */
  async showExportTree(tree, chats) {
    if (!Array.isArray(chats)) {
      await this.dialog.alert('Chat data is unavailable.', 'Export');
      return;
    }

    const html = this._buildDialogHtml({
      title:        'Entire Tree',
      formats:      TOPIC_FORMATS,
      scopes:       SCOPE_OPTIONS,
      showScope:    true,
      defaultScope: 'entire-tree',
    });

    this.dialog.show(html, { size: 'large' });
    this._wireDialogEvents({ mode: 'topic', topic: null, tree, chats });
  }

  async showExportChat(chat, tree) {
    if (!chat) {
      await this.dialog.alert('No chat selected for export.', 'Export');
      return;
    }

    const html = this._buildDialogHtml({
      title:     this.dialog.escapeHtml(chat.title || 'Chat'),
      formats:   CHAT_FORMATS,
      scopes:    [],
      showScope: false,
    });

    this.dialog.show(html, { size: 'large' });
    this._wireDialogEvents({ mode: 'chat', chat, tree });
  }

  /**
   * C.17 — Show the export dialog for a multi-chat digest.
   *
   * Presents Format (Markdown / HTML / PDF) and Style options, plus a
   * "Include table of contents" toggle.  On confirmation all selected chats
   * are merged into a single digest document.
   *
   * @param {Object[]} selectedChats  - array of full chat entries (with messages)
   * @param {Object}   tree           - TopicTree instance
   * @returns {Promise<void>}
   */
  async showExportDigest(selectedChats, tree) {
    if (!Array.isArray(selectedChats) || selectedChats.length < 2) {
      await this.dialog.alert('Select at least 2 chats to create a digest.', 'Export Digest');
      return;
    }

    const n    = selectedChats.length;
    const html = this._buildDigestDialogHtml(n);

    this.dialog.show(html, { size: 'large' });
    this._wireDialogEvents({ mode: 'digest', chats: selectedChats, tree });
  }

  // ── Private: HTML builder ──────────────────────────────────────────────────

  /**
   * Build the full inner HTML (contentHTML) passed to DialogManager.show().
   *
   * @private
   * @param {{ title: string, formats: Array, scopes: Array, showScope: boolean }} opts
   * @returns {string}
   */
  _buildDialogHtml({ title, formats, scopes, showScope, defaultScope = null }) {
    const formatRadios = formats.map(({ value, label }, i) => /* html */`
      <label class="radio-label">
        <input type="radio" name="export-format" value="${value}"${i === 0 ? ' checked' : ''}>
        ${label}
      </label>`).join('');

    const scopeRadios = scopes.map(({ value, label }, i) => /* html */`
      <label class="radio-label">
        <input type="radio" name="export-scope" value="${value}"${
          defaultScope ? (value === defaultScope ? ' checked' : '') : (i === 0 ? ' checked' : '')
        }>
        ${label}
      </label>`).join('');

    const styleRadios = Object.entries(STYLE_LABELS).map(([value, label], i) => /* html */`
      <label class="radio-label">
        <input type="radio" name="export-style" value="${value}"${i === 0 ? ' checked' : ''}>
        ${label}
      </label>`).join('');

    const scopeSection = showScope ? /* html */`
      <fieldset class="export-fieldset" id="export-scope-group">
        <legend class="export-legend">Scope</legend>
        <div class="radio-group vertical">
          ${scopeRadios}
        </div>
      </fieldset>` : '';

    return /* html */`
      <style>
        /* ── Export dialog scoped styles ─────────────────────────────────── */
        .export-dialog {
          font-size: 0.92rem;
        }

        .export-form {
          display: grid;
          grid-template-columns: 110px 1fr;
          gap: 20px 0;
          align-items: start;
          padding: 4px 0;
        }

        .export-fieldset {
          display: contents;
          border: none;
          padding: 0;
          margin: 0;
        }

        .export-legend {
          font-weight: 600;
          font-size: 0.8rem;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: var(--text-muted, #888);
          padding-top: 5px;
          white-space: nowrap;
        }

        .radio-group {
          display: flex;
          flex-wrap: wrap;
          gap: 6px 12px;
          align-items: center;
        }

        .radio-group.vertical {
          flex-direction: column;
          align-items: flex-start;
          gap: 6px;
        }

        .radio-label {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 4px 10px;
          border-radius: 5px;
          cursor: pointer;
          transition: background 0.12s;
          line-height: 1.3;
          white-space: nowrap;
        }

        .radio-label:hover {
          background: var(--hover-bg, rgba(0, 0, 0, 0.05));
        }

        .radio-label:has(input[type="radio"]:checked) {
          background: var(--accent-light, rgba(99, 102, 241, 0.12));
          color: var(--accent, #6366f1);
          font-weight: 500;
        }

        .radio-label input[type="radio"] {
          accent-color: var(--accent, #6366f1);
          width: 14px;
          height: 14px;
          flex-shrink: 0;
        }

        .export-note {
          display: none;
          grid-column: 2;
          font-size: 0.8rem;
          color: var(--text-muted, #888);
          padding: 2px 10px;
          font-style: italic;
          margin-top: -12px;
        }

        .export-note.visible {
          display: block;
        }
      </style>

      <div class="modal-header">
        <h2>Export — ${title}</h2>
        <button class="modal-close-btn" data-action="close" aria-label="Close">✕</button>
      </div>

      <div class="modal-body export-dialog">
        <div class="export-form">

          <fieldset class="export-fieldset" id="export-format-group">
            <legend class="export-legend">Format</legend>
            <div class="radio-group" id="format-radios">
              ${formatRadios}
            </div>
          </fieldset>

          <p class="export-note" id="export-zip-note">
            ZIP exports raw Markdown with full folder structure.
          </p>

          ${scopeSection}

          <fieldset class="export-fieldset" id="export-style-group">
            <legend class="export-legend">Style</legend>
            <div class="radio-group vertical" id="style-radios">
              ${styleRadios}
            </div>
          </fieldset>

        </div>
      </div>

      <div class="modal-footer">
        <button class="btn-secondary" data-action="cancel">Cancel</button>
        <button class="btn-primary" data-action="export">Export ▼</button>
      </div>`;
  }

  /**
   * C.17 — Build the inner HTML for the digest export dialog.
   *
   * @private
   * @param {number} count  number of selected chats
   * @returns {string}
   */
  _buildDigestDialogHtml(count) {
    const formatRadios = CHAT_FORMATS.map(({ value, label }, i) => /* html */`
      <label class="radio-label">
        <input type="radio" name="export-format" value="${value}"${i === 0 ? ' checked' : ''}>
        ${label}
      </label>`).join('');

    const styleRadios = Object.entries(STYLE_LABELS).map(([value, label], i) => /* html */`
      <label class="radio-label">
        <input type="radio" name="export-style" value="${value}"${i === 0 ? ' checked' : ''}>
        ${label}
      </label>`).join('');

    return /* html */`
      <style>
        /* reuse export-dialog scoped styles */
        .export-dialog { font-size: 0.92rem; }
        .export-form { display: grid; grid-template-columns: 110px 1fr; gap: 20px 0; align-items: start; padding: 4px 0; }
        .export-fieldset { display: contents; border: none; padding: 0; margin: 0; }
        .export-legend { font-weight: 600; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-muted, #888); padding-top: 5px; white-space: nowrap; }
        .radio-group { display: flex; flex-wrap: wrap; gap: 6px 12px; align-items: center; }
        .radio-group.vertical { flex-direction: column; align-items: flex-start; gap: 6px; }
        .radio-label { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 5px; cursor: pointer; transition: background 0.12s; line-height: 1.3; white-space: nowrap; }
        .radio-label:hover { background: var(--hover-bg, rgba(0,0,0,0.05)); }
        .radio-label:has(input[type="radio"]:checked) { background: var(--accent-light, rgba(99,102,241,0.12)); color: var(--accent, #6366f1); font-weight: 500; }
        .radio-label input[type="radio"] { accent-color: var(--accent, #6366f1); width: 14px; height: 14px; flex-shrink: 0; }
        .export-toc-row { display: contents; }
        .toc-toggle-label { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 5px; cursor: pointer; font-size: 0.9rem; }
        .toc-toggle-label:hover { background: var(--hover-bg, rgba(0,0,0,0.05)); }
        .toc-toggle-label input[type="checkbox"] { accent-color: var(--accent, #6366f1); width: 14px; height: 14px; }
      </style>

      <div class="modal-header">
        <h2>Export Digest — ${count} chats</h2>
        <button class="modal-close-btn" data-action="close" aria-label="Close">✕</button>
      </div>

      <div class="modal-body export-dialog">
        <div class="export-form">

          <fieldset class="export-fieldset" id="export-format-group">
            <legend class="export-legend">Format</legend>
            <div class="radio-group" id="format-radios">
              ${formatRadios}
            </div>
          </fieldset>

          <fieldset class="export-fieldset" id="export-style-group">
            <legend class="export-legend">Style</legend>
            <div class="radio-group vertical" id="style-radios">
              ${styleRadios}
            </div>
          </fieldset>

          <div class="export-toc-row">
            <legend class="export-legend">Options</legend>
            <label class="toc-toggle-label">
              <input type="checkbox" id="digest-include-toc" checked>
              Include table of contents
            </label>
          </div>

        </div>
      </div>

      <div class="modal-footer">
        <button class="btn-secondary" data-action="cancel">Cancel</button>
        <button class="btn-primary" data-action="export">Export Digest ▼</button>
      </div>`;
  }

  // ── Private: event wiring ──────────────────────────────────────────────────

  /**
   * Wire all interactive behaviour onto the rendered modal.
   * Called synchronously after DialogManager.show() because the DOM mutations
   * inside show() happen synchronously before the Promise is returned.
   *
   * @private
   * @param {{ mode: 'topic'|'chat', topic?: Object, tree: Object, chats?: Array, chat?: Object }} ctx
   */
  _wireDialogEvents(ctx) {
    const container = this.dialog.container;

    // ── Format change → toggle style / zip-note sections ──────────────────
    const formatInputs   = container.querySelectorAll('input[name="export-format"]');
    const styleGroup     = container.querySelector('#export-style-group');
    const zipNote        = container.querySelector('#export-zip-note');

    const updateVisibility = () => {
      const fmt = container.querySelector('input[name="export-format"]:checked')?.value;
      const hideStyle = fmt === 'pdf' || fmt === 'zip';

      if (styleGroup) {
        // legend + radio-group div are the two grid children produced by display:contents
        styleGroup.querySelectorAll('legend, .radio-group').forEach(el => {
          el.style.visibility = hideStyle ? 'hidden' : '';
        });
      }

      if (zipNote) {
        zipNote.classList.toggle('visible', fmt === 'zip');
      }
    };

    formatInputs.forEach(input => input.addEventListener('change', updateVisibility));
    updateVisibility(); // initial state

    // ── Cancel / close ─────────────────────────────────────────────────────
    const cancelBtn = container.querySelector('[data-action="cancel"]');
    const closeBtn  = container.querySelector('[data-action="close"]');

    const handleCancel = () => this.dialog.close(null);
    cancelBtn?.addEventListener('click', handleCancel);
    closeBtn?.addEventListener('click', handleCancel);

    // ── Export button ──────────────────────────────────────────────────────
    const exportBtn = container.querySelector('[data-action="export"]');
    exportBtn?.addEventListener('click', async () => {
      const format = container.querySelector('input[name="export-format"]:checked')?.value || 'markdown';
      const scope  = container.querySelector('input[name="export-scope"]:checked')?.value  || 'this-topic';
      const style  = container.querySelector('input[name="export-style"]:checked')?.value  || STYLES.RAW;

      if (ctx.mode === 'digest') {
        const includeToc = container.querySelector('#digest-include-toc')?.checked !== false;
        await this._doExportDigest(ctx.chats, ctx.tree, format, style, includeToc);
      } else if (ctx.mode === 'chat') {
        await this._doExportChat(ctx.chat, ctx.tree, format, style);
      } else {
        await this._doExportTopic(ctx.topic, ctx.tree, ctx.chats, format, scope, style);
      }
    });
  }

  // ── Private: export orchestration ─────────────────────────────────────────

  /**
   * Execute export for a single chat.
   *
   * @private
   * @param {Object} chat
   * @param {Object} tree
   * @param {string} format — 'markdown' | 'html' | 'pdf'
   * @param {string} style  — one of the STYLES constants
   * @returns {Promise<void>}
   */
  async _doExportChat(chat, tree, format, style) {
    try {
      const topicsMap = tree?.topics || {};
      const topicPath = buildTopicPath(chat.topicId, topicsMap);
      const safeName  = sanitizeFilename(chat.title || 'chat');

      if (format === 'pdf') {
        this._openPrintWindow(buildExportHtml(chat, topicPath, { style }));
        this.dialog.close(null);
        return;
      }

      if (format === 'markdown') {
        triggerDownload(`${safeName}.md`, buildExportMarkdown(chat, topicPath), 'text/markdown');
      } else {
        triggerDownload(`${safeName}.html`, buildExportHtml(chat, topicPath, { style }), 'text/html');
      }

      this.dialog.close(null);
    } catch (err) {
      await this.dialog.alert(`Export failed: ${err.message}`, 'Export Error');
    }
  }

  /**
   * C.17 — Execute a digest export over multiple chats.
   *
   * @private
   * @param {Object[]} chats
   * @param {Object}   tree
   * @param {string}   format     — 'markdown' | 'html' | 'pdf'
   * @param {string}   style
   * @param {boolean}  includeToc
   * @returns {Promise<void>}
   */
  async _doExportDigest(chats, tree, format, style, includeToc) {
    try {
      if (!Array.isArray(chats) || chats.length === 0) {
        await this.dialog.alert('No chats to export.', 'Export');
        return;
      }

      const topicsMap = tree?.topics || {};
      const date      = new Date().toISOString().slice(0, 10);
      const filename  = `bAInder-digest-${date}`;

      if (format === 'pdf') {
        this._openPrintWindow(buildDigestHtml(chats, topicsMap, { style, includeToc }));
        this.dialog.close(null);
        return;
      }

      if (format === 'markdown') {
        triggerDownload(
          `${filename}.md`,
          buildDigestMarkdown(chats, topicsMap, { includeToc }),
          'text/markdown'
        );
      } else {
        triggerDownload(
          `${filename}.html`,
          buildDigestHtml(chats, topicsMap, { style, includeToc }),
          'text/html'
        );
      }

      this.dialog.close(null);
    } catch (err) {
      await this.dialog.alert(`Digest export failed: ${err.message}`, 'Export Error');
    }
  }

  /**
   * Execute export for a topic (potentially multi-chat).
   *
   * @private
   * @param {Object} topic
   * @param {Object} tree
   * @param {Array}  allChats
   * @param {string} format   — 'markdown' | 'html' | 'pdf' | 'zip'
   * @param {string} scope    — 'this-topic' | 'topic-recursive' | 'entire-tree'
   * @param {string} style
   * @returns {Promise<void>}
   */
  async _doExportTopic(topic, tree, allChats, format, scope, style) {
    try {
      const topicsMap = tree?.topics || {};
      const date      = new Date().toISOString().slice(0, 10);
      const safeName  = sanitizeFilename(topic?.name || 'export');

      // ── ZIP format: delegate entirely to buildZipPayload ──────────────────
      if (format === 'zip') {
        const zipOptions = this._scopeToOptions(scope, topic);
        const files = buildZipPayload(tree, allChats, { ...zipOptions, format: 'markdown', style: 'raw' });

        const zip = new JSZip();
        files.forEach(({ path, content }) => zip.file(path, content));
        const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
        triggerDownload(`bAInder-export-${date}.zip`, blob, 'application/zip');
        this.dialog.close(null);
        return;
      }

      // Collect chats for the chosen scope
      const targetChats = this._collectChats(scope, topic, topicsMap, allChats);

      if (targetChats.length === 0) {
        await this.dialog.alert('No chats found for the selected scope.', 'Export');
        return;
      }

      // ── PDF format ────────────────────────────────────────────────────────
      if (format === 'pdf') {
        if (targetChats.length > 1) {
          await this.dialog.alert(
            'PDF export works one chat at a time. Exporting as an HTML ZIP instead.',
            'PDF Export'
          );
          const zip = new JSZip();
          for (const c of targetChats) {
            const cPath = buildTopicPath(c.topicId, topicsMap);
            zip.file(
              `${sanitizeFilename(c.title || 'chat')}.html`,
              buildExportHtml(c, cPath, { style })
            );
          }
          const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
          triggerDownload(`bAInder-export-${date}.zip`, blob, 'application/zip');
          this.dialog.close(null);
          return;
        }

        const c = targetChats[0];
        this._openPrintWindow(buildExportHtml(c, buildTopicPath(c.topicId, topicsMap), { style }));
        this.dialog.close(null);
        return;
      }

      // ── Markdown / HTML ───────────────────────────────────────────────────
      if (targetChats.length === 1) {
        const c    = targetChats[0];
        const cPath = buildTopicPath(c.topicId, topicsMap);
        if (format === 'markdown') {
          triggerDownload(`${safeName}.md`, buildExportMarkdown(c, cPath), 'text/markdown');
        } else {
          triggerDownload(`${safeName}.html`, buildExportHtml(c, cPath, { style }), 'text/html');
        }
      } else {
        // Multiple chats — bundle into ZIP with flat file list
        const zip = new JSZip();
        for (const c of targetChats) {
          const cPath = buildTopicPath(c.topicId, topicsMap);
          const name  = sanitizeFilename(c.title || 'chat');
          if (format === 'markdown') {
            zip.file(`${name}.md`, buildExportMarkdown(c, cPath));
          } else {
            zip.file(`${name}.html`, buildExportHtml(c, cPath, { style }));
          }
        }
        const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
        triggerDownload(`bAInder-export-${date}.zip`, blob, 'application/zip');
      }

      this.dialog.close(null);
    } catch (err) {
      await this.dialog.alert(`Export failed: ${err.message}`, 'Export Error');
    }
  }

  // ── Private: helpers ───────────────────────────────────────────────────────

  /**
   * Build the `options` object expected by `buildZipPayload` from a scope
   * string and a topic.
   *
   * @private
   * @param {string} scope
   * @param {Object} topic
   * @returns {{ scope: string, topicId?: string }}
   */
  _scopeToOptions(scope, topic) {
    if (scope === 'this-topic')      return { scope: 'topic',          topicId: topic.id };
    if (scope === 'topic-recursive') return { scope: 'topic-recursive', topicId: topic.id };
    return { scope: 'all' };
  }

  /**
   * Filter the full chat list down to only those covered by `scope`.
   *
   * @private
   * @param {string} scope       — 'this-topic' | 'topic-recursive' | 'entire-tree'
   * @param {Object} topic
   * @param {Object} topicsMap   — tree.topics
   * @param {Array}  allChats
   * @returns {Array}
   */
  _collectChats(scope, topic, topicsMap, allChats) {
    if (scope === 'entire-tree')      return allChats.slice();
    if (scope === 'this-topic')       return allChats.filter(c => c.topicId === topic.id);
    // topic-recursive
    const ids = this._collectSubtopicIds(topic.id, topicsMap);
    return allChats.filter(c => ids.has(c.topicId));
  }

  /**
   * Recursively collect a topic's own ID and all descendant IDs.
   *
   * @private
   * @param {string} rootId
   * @param {Object} topicsMap
   * @returns {Set<string>}
   */
  _collectSubtopicIds(rootId, topicsMap) {
    const ids     = new Set([rootId]);
    const pending = [rootId];

    while (pending.length) {
      const current = pending.pop();
      for (const [id, t] of Object.entries(topicsMap)) {
        if (t.parentId === current && !ids.has(id)) {
          ids.add(id);
          pending.push(id);
        }
      }
    }

    return ids;
  }

  /**
   * Open a new browser tab with the given HTML and trigger the print dialog.
   *
   * @private
   * @param {string} htmlContent
   */
  _openPrintWindow(htmlContent) {
    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url  = URL.createObjectURL(blob);
    const win  = window.open(url, '_blank');

    if (!win) {
      this.dialog.alert(
        'Could not open a new tab for PDF printing. Please allow pop-ups for this page.',
        'PDF Export'
      );
      URL.revokeObjectURL(url);
      return;
    }

    win.onload = () => {
      win.print();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    };
  }
}
