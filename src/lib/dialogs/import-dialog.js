import JSZip from '../vendor/jszip-esm.js';
import {
  validateZipFile,
  parseZipEntries,
  buildImportPlan,
  executeImport,
} from '../io/import-parser.js';
import { logger } from '../utils/logger.js';

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


<div class="modal-header">
  <h2>Import from ZIP</h2>
  <button class="modal-close-btn" id="importCloseBtn" aria-label="Close">✕</button>
</div>

<div class="modal-body" id="importDialogRoot">

  <!-- ===== Phase 1 : File selection + strategy ===== -->
  <div class="dim-phase active" id="importPhase1">

    <input type="file" id="importFileInput" accept=".zip" style="display:none">

    <label for="importFileInput" class="dim-dropzone" id="importDropZone"
           aria-label="Drop a bAInder ZIP here or click to browse">
      <span class="dim-dz-icon" id="importDropIcon">📦</span>
      <span class="dim-dz-label" id="importDropLabel">Drag &amp; drop your bAInder ZIP here</span>
      <span class="dim-dz-sub">or</span>
      <span class="dim-dz-browse" id="importBrowseBtn">Browse files</span>
    </label>

    <div class="dim-file-chip" id="importFileChip">
      <span>✓</span>
      <span class="dim-file-name" id="importFileName"></span>
      <span class="dim-file-size" id="importFileSize"></span>
      <span class="dim-file-change">click to change</span>
    </div>

    <div class="dim-error" id="importPhase1Error"></div>

    <div class="dim-section" id="importStrategySection" style="display:none">
      <p class="dim-section-label">Import Strategy</p>
      <div class="dim-strategy-list">

        <label class="dim-strategy-row">
          <input type="radio" name="importStrategy" value="merge" checked>
          <span class="dim-str-icon" aria-hidden="true">🔀</span>
          <span class="dim-str-body">
            <span class="dim-str-name">Merge</span>
            <span class="dim-str-desc">Combine ZIP contents with your existing data</span>
          </span>
          <svg class="dim-str-check" width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path d="M2.5 7L5.5 10L11.5 4" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </label>

        <label class="dim-strategy-row">
          <input type="radio" name="importStrategy" value="replace">
          <span class="dim-str-icon" aria-hidden="true">⚠️</span>
          <span class="dim-str-body">
            <span class="dim-str-name">Replace</span>
            <span class="dim-str-desc">Clear all existing data, then import</span>
          </span>
          <svg class="dim-str-check" width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path d="M2.5 7L5.5 10L11.5 4" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </label>

        <label class="dim-strategy-row">
          <input type="radio" name="importStrategy" value="new-root">
          <span class="dim-str-icon" aria-hidden="true">📂</span>
          <span class="dim-str-body">
            <span class="dim-str-name">New Root</span>
            <span class="dim-str-desc">Import as new root topics alongside existing data</span>
          </span>
          <svg class="dim-str-check" width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path d="M2.5 7L5.5 10L11.5 4" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </label>

      </div>
    </div>

    <div class="dim-btn-row" id="importPhase1Btns" style="display:none">
      <button id="importCancelBtn1" class="btn-secondary">Cancel</button>
      <button id="importStartBtn" class="btn-primary" disabled>Preview Import</button>
    </div>
  </div>

  <!-- ===== Phase 2 : Preview ===== -->
  <div class="dim-phase" id="importPhase2">

    <p class="dim-section-label" style="margin-bottom:var(--space-md)">Import Preview</p>

    <div class="dim-stats-grid">
      <div class="dim-stat dim-stat--create">
        <span class="dim-stat-value" id="sumTopicsCreate">0</span>
        <span class="dim-stat-label">Topics to create</span>
      </div>
      <div class="dim-stat dim-stat--merge">
        <span class="dim-stat-value" id="sumTopicsMerge">0</span>
        <span class="dim-stat-label">Topics to merge</span>
      </div>
      <div class="dim-stat dim-stat--chat">
        <span class="dim-stat-value" id="sumChats">0</span>
        <span class="dim-stat-label">Chats to import</span>
      </div>
      <div class="dim-stat dim-stat--conflict">
        <span class="dim-stat-value" id="sumConflicts">0</span>
        <span class="dim-stat-label">Conflicts</span>
      </div>
    </div>

    <ul class="dim-notice dim-notice--warning" id="importWarningsList" style="display:none"></ul>

    <div class="dim-notice dim-notice--error" id="importReplaceWarning" style="display:none">
      ⚠️ <strong>Replace</strong> will permanently delete <em>all</em> existing topics and chats before importing. This cannot be undone.
    </div>

    <div class="dim-btn-row">
      <button id="importBackBtn" class="btn-secondary">← Back</button>
      <button id="importNowBtn" class="btn-primary">Import Now</button>
    </div>
  </div>

  <!-- ===== Phase 3 : Progress / Done ===== -->
  <div class="dim-phase" id="importPhase3">

    <div class="dim-progress" id="importInProgress" style="display:none">
      <div class="dim-spinner"></div>
      <p class="dim-progress-text">Importing, please wait…</p>
    </div>

    <div id="importDoneContent" style="display:none">
      <div class="dim-done-header">
        <span>✅</span>
        <span>Import complete</span>
      </div>
      <div class="dim-done-grid">
        <div class="dim-done-row">
          <span class="dim-done-label">Topics created</span>
          <span class="dim-done-value" id="doneTopicsCreated">0</span>
        </div>
        <div class="dim-done-row">
          <span class="dim-done-label">Topics merged</span>
          <span class="dim-done-value" id="doneTopicsMerged">0</span>
        </div>
        <div class="dim-done-row">
          <span class="dim-done-label">Chats imported</span>
          <span class="dim-done-value" id="doneChatsImported">0</span>
        </div>
        <div class="dim-done-row">
          <span class="dim-done-label">Errors</span>
          <span class="dim-done-value dim-done-value--errors" id="doneErrors">0</span>
        </div>
      </div>
      <ul class="dim-notice dim-notice--error" id="doneErrorsList" style="display:none"></ul>
    </div>

    <div class="dim-btn-row dim-btn-row--end" id="importDoneBtnRow" style="display:none">
      <button id="importDoneBtn" class="btn-primary">Done ✓</button>
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
    if (!root) { logger.error('[ImportDialog] _initDialog: importDialogRoot not found — aborting'); return; }

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

    if (!importNowBtn) { logger.error('[ImportDialog] _initDialog: importNowBtn not found — import will not work'); return; }

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

      // Update browse button label
      const browseBtn = document.getElementById('importBrowseBtn');
      if (browseBtn) browseBtn.textContent = 'Change file';

      // Persistent chip showing the filename underneath
      fileName.textContent = file.name;
      fileSize.textContent = `${sizeKB} KB`;
      fileChip.classList.add('visible');

      // Clear any previous error
      phase1Error.textContent = '';
      phase1Error.classList.remove('visible');

      // Reveal strategy and button row (progressive disclosure)
      const strategySection = document.getElementById('importStrategySection');
      const phase1Btns = document.getElementById('importPhase1Btns');
      if (strategySection) strategySection.style.display = '';
      if (phase1Btns) phase1Btns.style.display = '';

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
          { sumCreate, sumMerge, sumChats, sumConflicts, warningsList },
          getStrategy()
        );
        showPhase(2);
      } catch (err) {
        const msg = err?.message ?? String(err);
        phase1Error.textContent = `❌ ${this.dialog.escapeHtml(msg)}`;
        phase1Error.classList.add('visible');
      } finally {
        importStartBtn.disabled    = false;
        importStartBtn.textContent = 'Preview Import';
      }
    });

    // ---- Phase 2 buttons ----

    backBtn.addEventListener('click', () => showPhase(1));

    importNowBtn.addEventListener('click', async () => {
      if (!importPlan) return;

      const strategy = getStrategy();

      showPhase(3);
      doneContent.style.display  = 'none';
      inProgress.style.display   = 'block';
      doneBtnRow.style.display   = 'none';

      try {
        const result = executeImport(
          importPlan,
          strategy === 'replace' ? null : tree,
          strategy === 'replace' ? [] : chats
        );
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
    const zip = await JSZip.loadAsync(file);

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
    const plan = buildImportPlan(parsed, tree, strategy);
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
   * @param {string} strategy
   */
  _populatePreview(plan, warnings, els, strategy) {
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

    // Show inline replace warning banner only for replace strategy
    const replaceWarning = document.getElementById('importReplaceWarning');
    if (replaceWarning) {
      replaceWarning.style.display = strategy === 'replace' ? 'block' : 'none';
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

}
