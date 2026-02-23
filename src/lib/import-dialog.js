// JSZip is loaded as a classic <script> in sidepanel.html and available via globalThis.JSZip
// (bare-specifier imports like 'jszip' are not resolved by the browser in source-loaded extensions)
import {
  validateZipFile,
  parseZipEntries,
  buildImportPlan,
  executeImport,
} from './import-parser.js';

/**
 * Handles the import-from-ZIP dialog workflow for bAInder.
 * Manages three phases: file selection, preview, and progress/done.
 */
export class ImportDialog {
  /**
   * @param {Object} dialogManager — instance of DialogManager
   */
  constructor(dialogManager) {
    this.dialog = dialogManager;
  }

  /**
   * Show the import from ZIP dialog.
   * @param {Object}   tree       — live TopicTree instance
   * @param {Array}    chats      — current chats array
   * @param {Function} onComplete — async callback called with
   *   (updatedTopics, updatedRootTopics, updatedChats, summary) after
   *   a successful import
   * @returns {Promise<void>}
   */
  async showImportDialog(tree, chats, onComplete) {
    const html = this._buildDialogHtml();

    // Do NOT await — DialogManager.show() only resolves when close() is called,
    // so awaiting it would permanently block _initDialog() from running and
    // leave the dialog with no event listeners attached.
    this.dialog.show(html, { size: 'large' });

    // Wire up all interactivity immediately (DOM is synchronously available
    // because DialogManager.show() appends it before returning the promise).
    this._initDialog(tree, chats ?? [], onComplete ?? (() => {}));
  }

  // ---------------------------------------------------------------------------
  // Private — HTML construction
  // ---------------------------------------------------------------------------

  /** @returns {string} */
  _buildDialogHtml() {
    return /* html */ `
<style>
  /* ── Import dialog scoped styles ──────────────────────────────────────── */
  .import-dialog { font-size: 0.92rem; }

  /* Phase visibility */
  .import-dialog .phase { display: none; }
  .import-dialog .phase.active { display: block; }

  /* Drop zone — <label> opens file picker natively without JS .click() */
  .import-dialog .drop-zone {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    border: 2px dashed var(--border-secondary);
    border-radius: var(--radius-md);
    padding: 28px 20px;
    text-align: center;
    cursor: pointer;
    transition: border-color var(--transition-fast), background var(--transition-fast),
                color var(--transition-fast);
    user-select: none;
    margin-bottom: 16px;
    color: var(--text-secondary);
  }
  .import-dialog .drop-zone:hover,
  .import-dialog .drop-zone.drag-over {
    border-color: var(--primary);
    background: var(--primary-light);
    color: var(--primary);
  }
  .import-dialog .drop-zone.file-selected {
    border-color: var(--success);
    background: var(--success-bg);
    color: var(--success);
  }
  .import-dialog .drop-zone .dz-icon  { font-size: 2em; line-height: 1; }
  .import-dialog .drop-zone .dz-label { font-size: 0.95em; font-weight: 500; }
  .import-dialog .drop-zone .dz-sub   { font-size: 0.82em; color: var(--text-tertiary); }
  .import-dialog .drop-zone.file-selected .dz-sub { color: inherit; opacity: 0.75; }

  /* File selected chip — shown below drop zone once a file is chosen */
  .import-dialog .file-chip {
    display: none;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    background: var(--success-bg);
    border: 1px solid var(--success);
    border-radius: var(--radius-sm);
    font-size: 0.88em;
    color: var(--success);
    font-weight: 500;
    margin-bottom: 14px;
    margin-top: -10px;
  }
  .import-dialog .file-chip.visible { display: flex; }
  .import-dialog .file-chip .fc-name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--text-primary);
  }
  .import-dialog .file-chip .fc-size { color: var(--text-tertiary); font-size: 0.9em; white-space: nowrap; }

  /* Inline error */
  .import-dialog .inline-error {
    display: none;
    padding: 10px 14px;
    background: var(--danger-bg);
    border-left: 3px solid var(--danger);
    border-radius: var(--radius-sm);
    font-size: 0.88em;
    color: var(--text-primary);
    margin-bottom: 12px;
  }
  .import-dialog .inline-error.visible { display: block; }

  /* Strategy radios */
  .import-dialog .strategy-section { margin-bottom: 16px; }
  .import-dialog .section-label {
    font-weight: 600;
    font-size: 0.78rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-tertiary);
    margin-bottom: 6px;
  }
  .import-dialog .radio-group { display: flex; flex-direction: column; gap: 2px; }
  .import-dialog .radio-label {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 5px 10px;
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: background var(--transition-fast);
    font-size: 0.92em;
    line-height: 1.4;
  }
  .import-dialog .radio-label:hover { background: var(--bg-hover); }
  .import-dialog .radio-label:has(input:checked) {
    background: var(--primary-light);
    color: var(--primary);
    font-weight: 500;
  }
  .import-dialog .radio-label input[type="radio"] {
    accent-color: var(--primary);
    width: 14px; height: 14px; flex-shrink: 0;
  }

  /* Summary box */
  .import-dialog .summary-box {
    background: var(--bg-secondary);
    border: 1px solid var(--border-primary);
    border-radius: var(--radius-md);
    padding: 14px 16px;
    margin-bottom: 14px;
  }
  .import-dialog .summary-title {
    font-weight: 600;
    font-size: 0.78rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-tertiary);
    margin-bottom: 10px;
  }
  .import-dialog .summary-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 5px 0;
    font-size: 0.92em;
    border-bottom: 1px solid var(--border-primary);
  }
  .import-dialog .summary-row:last-child { border-bottom: none; }
  .import-dialog .s-label { color: var(--text-secondary); flex: 1; }
  .import-dialog .s-value { font-weight: 600; min-width: 28px; text-align: right; color: var(--text-primary); }
  .import-dialog .s-icon { width: 20px; flex-shrink: 0; text-align: center; }
  .import-dialog .s-icon.create   { color: var(--success); }
  .import-dialog .s-icon.merge    { color: var(--primary); }
  .import-dialog .s-icon.chat     { color: var(--info); }
  .import-dialog .s-icon.conflict { color: var(--warning); }

  /* Notices (warnings / errors) */
  .import-dialog .notice-box {
    list-style: none;
    padding: 10px 14px;
    border-radius: var(--radius-sm);
    font-size: 0.88em;
    max-height: 110px;
    overflow-y: auto;
    margin-bottom: 12px;
  }
  .import-dialog .notice-box.warning {
    background: var(--warning-bg);
    border-left: 3px solid var(--warning);
    color: var(--text-primary);
  }
  .import-dialog .notice-box.error {
    background: var(--danger-bg);
    border-left: 3px solid var(--danger);
    color: var(--text-primary);
  }
  .import-dialog .notice-box li { padding: 2px 0; }

  /* Done screen */
  .import-dialog .done-header {
    font-size: 1em;
    font-weight: 700;
    color: var(--success);
    margin-bottom: 14px;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .import-dialog .done-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 6px 0;
    font-size: 0.92em;
    border-bottom: 1px solid var(--border-primary);
    color: var(--text-secondary);
  }
  .import-dialog .done-row:last-child { border-bottom: none; }
  .import-dialog .done-row span:last-child { font-weight: 600; color: var(--text-primary); }

  /* Status text while importing */
  .import-dialog .status-text {
    color: var(--text-tertiary);
    font-size: 0.9em;
    text-align: center;
    padding: 20px 0;
  }

  /* Button row */
  .import-dialog .btn-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 20px;
    gap: 8px;
  }
  .import-dialog .btn-row.end { justify-content: flex-end; }
</style>

<div class="modal-header">
  <h2>Import from ZIP</h2>
  <button class="modal-close-btn" id="importCloseBtn" aria-label="Close">✕</button>
</div>

<div class="modal-body import-dialog" id="importDialogRoot">

  <!-- ===== Phase 1: File Selection ===== -->
  <div class="phase active" id="importPhase1">

    <input type="file" id="importFileInput" accept=".zip" style="display:none">

    <label for="importFileInput" class="drop-zone" id="importDropZone"
           aria-label="Drop ZIP file here or click to browse">
      <span class="dz-icon" id="importDropIcon">📦</span>
      <span class="dz-label" id="importDropLabel">Drag &amp; drop a bAInder ZIP here</span>
      <span class="dz-sub">or click to browse</span>
    </label>

    <div class="file-chip" id="importFileChip">
      <span>✓</span>
      <span class="fc-name" id="importFileName"></span>
      <span class="fc-size" id="importFileSize"></span>
      <span style="margin-left:auto;opacity:0.6;font-size:0.85em;">click drop zone to change</span>
    </div>

    <div class="inline-error" id="importPhase1Error"></div>

    <div class="strategy-section">
      <div class="section-label">Import Strategy</div>
      <div class="radio-group">
        <label class="radio-label">
          <input type="radio" name="importStrategy" value="merge" checked>
          <span><strong>Merge</strong> — combine with existing data</span>
        </label>
        <label class="radio-label">
          <input type="radio" name="importStrategy" value="replace">
          <span><strong>Replace</strong> — clear existing data first</span>
        </label>
        <label class="radio-label">
          <input type="radio" name="importStrategy" value="new-root">
          <span><strong>New Root</strong> — import under a new parent topic</span>
        </label>
      </div>
    </div>

    <div class="btn-row">
      <button id="importCancelBtn1" class="btn btn-secondary">Cancel</button>
      <button id="importStartBtn" class="btn btn-primary" disabled>Import ▶</button>
    </div>
  </div>

  <!-- ===== Phase 2: Preview ===== -->
  <div class="phase" id="importPhase2">

    <div class="summary-box" id="importSummaryBox">
      <div class="summary-title">Import Summary</div>
      <div class="summary-row">
        <span class="s-icon create">✓</span>
        <span class="s-label">Topics to create</span>
        <span class="s-value" id="sumTopicsCreate">0</span>
      </div>
      <div class="summary-row">
        <span class="s-icon merge">⟳</span>
        <span class="s-label">Topics to merge</span>
        <span class="s-value" id="sumTopicsMerge">0</span>
      </div>
      <div class="summary-row">
        <span class="s-icon chat">💬</span>
        <span class="s-label">Chats to import</span>
        <span class="s-value" id="sumChats">0</span>
      </div>
      <div class="summary-row">
        <span class="s-icon conflict">⚠</span>
        <span class="s-label">Conflicts</span>
        <span class="s-value" id="sumConflicts">0</span>
      </div>
    </div>

    <ul class="notice-box warning" id="importWarningsList" style="display:none"></ul>

    <div class="btn-row">
      <button id="importBackBtn" class="btn btn-secondary">← Back</button>
      <button id="importNowBtn" class="btn btn-primary">Import Now ▶</button>
    </div>
  </div>

  <!-- ===== Phase 3: Progress / Done ===== -->
  <div class="phase" id="importPhase3">

    <p class="status-text" id="importInProgress">Importing, please wait…</p>

    <div id="importDoneContent" style="display:none">
      <div class="done-header">✅ Import Complete</div>
      <div class="done-row"><span>Topics created</span> <span id="doneTopicsCreated">0</span></div>
      <div class="done-row"><span>Topics merged</span>  <span id="doneTopicsMerged">0</span></div>
      <div class="done-row"><span>Chats imported</span> <span id="doneChatsImported">0</span></div>
      <div class="done-row"><span>Errors</span>         <span id="doneErrors">0</span></div>
      <ul class="notice-box error" id="doneErrorsList" style="display:none"></ul>
    </div>

    <div class="btn-row end" id="importDoneBtnRow" style="display:none">
      <button id="importDoneBtn" class="btn btn-primary">Done ✓</button>
    </div>
  </div>

</div>`;
  }

  // ---------------------------------------------------------------------------
  // Private — dialog wiring
  // ---------------------------------------------------------------------------

  /**
   * Wire up all event listeners after the dialog HTML has been injected into
   * the DOM by DialogManager.show().
   *
   * @param {Object}   tree
   * @param {Array}    chats
   * @param {Function} onComplete
   */
  _initDialog(tree, chats, onComplete) {
    /** @type {File|null} */
    let selectedFile = null;
    /** @type {Object|null} */
    let parsedData = null;
    /** @type {Object|null} */
    let importPlan = null;

    // ----- Element references -----
    const root        = document.getElementById('importDialogRoot');
    if (!root) return;

    const phase1      = document.getElementById('importPhase1');
    const phase2      = document.getElementById('importPhase2');
    const phase3      = document.getElementById('importPhase3');

    const fileInput   = document.getElementById('importFileInput');
    const dropZone    = document.getElementById('importDropZone');
    const dropLabel   = document.getElementById('importDropLabel');
    const dropIcon    = document.getElementById('importDropIcon');
    const fileChip    = document.getElementById('importFileChip');
    const fileName    = document.getElementById('importFileName');
    const fileSize    = document.getElementById('importFileSize');
    const phase1Error = document.getElementById('importPhase1Error');

    const importStartBtn = document.getElementById('importStartBtn');
    const cancelBtn1  = document.getElementById('importCancelBtn1');
    const backBtn     = document.getElementById('importBackBtn');
    const importNowBtn= document.getElementById('importNowBtn');
    const doneBtn     = document.getElementById('importDoneBtn');

    const sumCreate   = document.getElementById('sumTopicsCreate');
    const sumMerge    = document.getElementById('sumTopicsMerge');
    const sumChats    = document.getElementById('sumChats');
    const sumConflicts= document.getElementById('sumConflicts');

    const warningsList= document.getElementById('importWarningsList');

    const doneContent = document.getElementById('importDoneContent');
    const inProgress  = document.getElementById('importInProgress');
    const doneBtnRow  = document.getElementById('importDoneBtnRow');

    const doneCreated = document.getElementById('doneTopicsCreated');
    const doneMerged  = document.getElementById('doneTopicsMerged');
    const doneImported= document.getElementById('doneChatsImported');
    const doneErrorsCnt = document.getElementById('doneErrors');
    const doneErrorsList= document.getElementById('doneErrorsList');
    const closeBtn      = document.getElementById('importCloseBtn');

    // ---- Helpers ----

    const showPhase = (n) => {
      [phase1, phase2, phase3].forEach((p, i) => {
        p.classList.toggle('active', i + 1 === n);
      });
    };

    const getStrategy = () => {
      const checked = root.querySelector('input[name="importStrategy"]:checked');
      return checked ? checked.value : 'merge';
    };

    const setFileSelected = (file) => {
      selectedFile = file;
      const sizeKB = (file.size / 1024).toFixed(1);

      // Drop zone: compact state showing it's been loaded
      dropIcon.textContent  = '✅';
      dropLabel.textContent = 'File ready to import';
      dropZone.classList.add('file-selected');

      // Persistent chip showing the filename underneath
      fileName.textContent = file.name;
      fileSize.textContent = `${sizeKB} KB`;
      fileChip.classList.add('visible');

      // Clear any previous error
      phase1Error.textContent = '';
      phase1Error.classList.remove('visible');

      importStartBtn.disabled = false;
    };

    // ---- Drop zone / file input ----
    // Note: dropZone is a <label for="importFileInput">, so clicks open the
    // file picker natively — no JS .click() relay needed.

    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.classList.add('drag-over');
    });
    dropZone.addEventListener('dragleave', () => {
      dropZone.classList.remove('drag-over');
    });
    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.classList.remove('drag-over');
      const file = e.dataTransfer?.files?.[0];
      if (file) this._handleFileChosen(file, setFileSelected);
    });

    fileInput.addEventListener('change', () => {
      const file = fileInput.files?.[0];
      if (file) this._handleFileChosen(file, setFileSelected);
      fileInput.value = ''; // reset so same file can be re-chosen
    });

    // ---- Header close button & phase 1 cancel ----

    if (closeBtn) closeBtn.addEventListener('click', () => this.dialog.close(null));
    cancelBtn1.addEventListener('click', () => {
      this.dialog.close(null);
    });

    importStartBtn.addEventListener('click', async () => {
      if (!selectedFile) return;
      importStartBtn.disabled = true;
      importStartBtn.textContent = 'Preparing…';
      try {
        const { parsed, plan } = await this._prepareImport(
          selectedFile, tree, getStrategy()
        );
        parsedData = parsed;
        importPlan = plan;
        this._populatePreview(
          plan, parsed.warnings ?? [],
          { sumCreate, sumMerge, sumChats, sumConflicts, warningsList }
        );
        showPhase(2);
      } catch (err) {
        const msg = err?.message ?? String(err);
        phase1Error.textContent = `❌ ${this.dialog.escapeHtml(msg)}`;
        phase1Error.classList.add('visible');
      } finally {
        importStartBtn.disabled   = false;
        importStartBtn.textContent = 'Import ▶';
      }
    });

    // ---- Phase 2 buttons ----

    backBtn.addEventListener('click', () => showPhase(1));

    importNowBtn.addEventListener('click', async () => {
      if (!importPlan) return;

      const strategy = getStrategy();

      if (strategy === 'replace') {
        const confirmed = await this._confirmReplace();
        if (!confirmed) return;
      }

      showPhase(3);
      doneContent.style.display = 'none';
      inProgress.style.display  = 'block';
      doneBtnRow.style.display  = 'none';

      try {
        const result = executeImport(importPlan, tree, chats);
        await onComplete(
          result.updatedTopics,
          result.updatedRootTopics,
          result.updatedChats,
          result.summary
        );
        this._populateDone(
          result.summary,
          { doneContent, inProgress, doneBtnRow,
            doneCreated, doneMerged, doneImported, doneErrorsCnt, doneErrorsList }
        );
      } catch (err) {
        inProgress.style.display = 'none';
        await this.dialog.alert(
          `Import failed: ${this.dialog.escapeHtml(String(err?.message ?? err))}`,
          'Import Error'
        );
        showPhase(2);
      }
    });

    // ---- Phase 3 button ----

    doneBtn.addEventListener('click', () => {
      this.dialog.close(null);
    });
  }

  // ---------------------------------------------------------------------------
  // Private — file validation
  // ---------------------------------------------------------------------------

  /**
   * Validate the chosen file and call the setter if valid; alert otherwise.
   *
   * @param {File}     file
   * @param {Function} setFileSelected
   */
  _handleFileChosen(file, setFileSelected) {
    if (!file) return;
    const validation = validateZipFile(file);
    if (!validation.valid) {
      this.dialog.alert(
        this.dialog.escapeHtml(validation.error ?? 'Invalid file.'),
        'Invalid File'
      );
      return;
    }
    setFileSelected(file);
  }

  // ---------------------------------------------------------------------------
  // Private — ZIP loading
  // ---------------------------------------------------------------------------

  /**
   * Load the ZIP, extract entries, parse them and build the import plan.
   *
   * @param {File}   file
   * @param {Object} tree
   * @param {string} strategy
   * @returns {Promise<{ parsed: Object, plan: Object }>}
   */
  async _prepareImport(file, tree, strategy) {
    const zip = await globalThis.JSZip.loadAsync(file);

    const entryPromises = [];
    zip.forEach((relativePath, zipEntry) => {
      if (!zipEntry.dir) {
        entryPromises.push(
          zipEntry.async('string').then((content) => ({
            path: relativePath,
            content,
            _entry: zipEntry,
          }))
        );
      }
    });

    const entries = await Promise.all(entryPromises);

    const parsed = parseZipEntries(entries);
    const plan   = buildImportPlan(parsed, tree, strategy);

    return { parsed, plan };
  }

  // ---------------------------------------------------------------------------
  // Private — UI population
  // ---------------------------------------------------------------------------

  /**
   * Populate the Phase 2 preview with plan summary and warnings.
   *
   * @param {Object} plan
   * @param {Array}  warnings
   * @param {Object} els — references to DOM elements
   */
  _populatePreview(plan, warnings, els) {
    const s = plan.summary ?? {};
    els.sumCreate.textContent    = String(s.topicsToCreate   ?? (plan.topicsToCreate?.length  ?? 0));
    els.sumMerge.textContent     = String(s.topicsToMerge    ?? (plan.topicsToMerge?.length   ?? 0));
    els.sumChats.textContent     = String(s.chatsToImport    ?? (plan.chatsToImport?.length   ?? 0));
    els.sumConflicts.textContent = String(s.conflicts        ?? (plan.conflicts?.length       ?? 0));

    if (warnings && warnings.length > 0) {
      els.warningsList.innerHTML = warnings
        .map((w) => `<li>${this.dialog.escapeHtml(String(w))}</li>`)
        .join('');
      els.warningsList.style.display = 'block';
    } else {
      els.warningsList.style.display = 'none';
    }
  }

  /**
   * Populate the Phase 3 done screen with import results.
   *
   * @param {Object} summary
   * @param {Object} els — references to DOM elements
   */
  _populateDone(summary, els) {
    const s = summary ?? {};

    els.inProgress.style.display  = 'none';
    els.doneContent.style.display = 'block';
    els.doneBtnRow.style.display  = 'flex';

    els.doneCreated.textContent  = s.topicsCreated  ?? 0;
    els.doneMerged.textContent   = s.topicsMerged   ?? 0;
    els.doneImported.textContent = s.chatsImported  ?? 0;

    const errors = s.errors ?? [];
    els.doneErrorsCnt.textContent = errors.length;

    if (errors.length > 0) {
      els.doneErrorsList.innerHTML = errors
        .map((e) => `<li>${this.dialog.escapeHtml(String(e))}</li>`)
        .join('');
      els.doneErrorsList.style.display = 'block';
    } else {
      els.doneErrorsList.style.display = 'none';
    }
  }

  // ---------------------------------------------------------------------------
  // Private — confirmation helper
  // ---------------------------------------------------------------------------

  /**
   * Ask the user to confirm the Replace strategy.
   * Falls back to a plain browser confirm if `dialog.confirm` is not available.
   *
   * @returns {Promise<boolean>}
   */
  async _confirmReplace() {
    const message = 'This will replace ALL existing topics and chats. Are you sure?';
    if (typeof this.dialog.confirm === 'function') {
      return this.dialog.confirm(message, 'Confirm Replace');
    }
    // Fallback
    return Promise.resolve(window.confirm(message));
  }
}
