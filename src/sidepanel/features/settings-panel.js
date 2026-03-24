/**
 * settings-panel.js
 *
 * Responsibility: open/close the settings slide-in panel and wire its
 * internal controls (log-level selector).
 *
 * NOT responsible for: persisting settings (delegated to the logger module).
 */

import { logger } from '../../lib/utils/logger.js';
import browser from '../../lib/vendor/browser.js';
import { sanitiseSeparator, DEFAULT_CLIPBOARD_SETTINGS } from '../../lib/export/clipboard-serialiser.js';
import {
  getAutoExportDirHandle,
  storeAutoExportDirHandle,
  clearAutoExportDirHandle,
} from '../../lib/export/auto-export.js';

export function openSettingsPanel() {
  const panel = document.getElementById('settingsPanel');
  if (!panel) return;
  panel.classList.add('settings-panel--open');
  panel.setAttribute('aria-hidden', 'false');

  // Backdrop click closes the panel (once listener — re-attached each open)
  panel.querySelector('.settings-panel__backdrop')
    ?.addEventListener('click', closeSettingsPanel, { once: true });

  document.getElementById('settingsPanelClose')
    ?.addEventListener('click', closeSettingsPanel, { once: true });

  // Wire log-level selector (idempotent — guard with data attribute)
  const logLevelSelect = document.getElementById('logLevelSelect');
  if (logLevelSelect) {
    logLevelSelect.value = logger.getLevel();
    if (!logLevelSelect.dataset.loggerWired) {
      logLevelSelect.dataset.loggerWired = '1';
      logLevelSelect.addEventListener('change', () => logger.setLevel(logLevelSelect.value));
    }
  }

  // Wire backup-reminder toggle (idempotent)
  const backupToggle = document.getElementById('backupReminderToggle');
  if (backupToggle && !backupToggle.dataset.wired) {
    backupToggle.dataset.wired = '1';
    browser.storage.local.get(['backupReminderDisabled']).then(data => {
      backupToggle.checked = !data.backupReminderDisabled;
    }).catch(() => {});
    backupToggle.addEventListener('change', () => {
      browser.storage.local.set({ backupReminderDisabled: !backupToggle.checked }).catch(() => {});
    });
  }

  // Wire backup-reminder interval selector (idempotent)
  const intervalSelect = document.getElementById('backupReminderIntervalSelect');
  if (intervalSelect && !intervalSelect.dataset.wired) {
    intervalSelect.dataset.wired = '1';
    browser.storage.local.get(['backupReminderIntervalDays']).then(data => {
      const saved = data.backupReminderIntervalDays;
      if (saved != null) intervalSelect.value = String(saved);
    }).catch(() => {});
    intervalSelect.addEventListener('change', () => {
      const days = parseInt(intervalSelect.value, 10);
      browser.storage.local.set({ backupReminderIntervalDays: days }).catch(() => {});
    });
  }

  // Wire clipboard settings (idempotent) — C.26
  const clipboardFormatSel = document.getElementById('clipboardFormatSelect');
  if (clipboardFormatSel && !clipboardFormatSel.dataset.wired) {
    clipboardFormatSel.dataset.wired = '1';
    const emojisChk     = document.getElementById('clipboardIncludeEmojis');
    const imagesChk     = document.getElementById('clipboardIncludeImages');
    const imagesRow     = document.getElementById('clipboardImagesRow');
    const attachChk     = document.getElementById('clipboardIncludeAttachments');
    const separatorInp  = document.getElementById('clipboardSeparatorInput');
    const sepPreview    = document.getElementById('clipboardSeparatorPreview');
    const turnSepInp    = document.getElementById('clipboardTurnSeparatorInput');
    const turnSepPreview = document.getElementById('clipboardTurnSeparatorPreview');

    function syncImagesRow() {
      if (imagesRow) imagesRow.hidden = clipboardFormatSel.value !== 'html';
    }

    function syncPreview() {
      const slot = sepPreview?.querySelector('.settings-separator-preview__content');
      if (!slot) return;
      const raw = (separatorInp?.value || DEFAULT_CLIPBOARD_SETTINGS.separator).trim();
      slot.innerHTML = sanitiseSeparator(raw) || DEFAULT_CLIPBOARD_SETTINGS.separator;
      if (sepPreview) sepPreview.hidden = false;
    }

    function syncTurnPreview() {
      const slot = turnSepPreview?.querySelector('.settings-separator-preview__content');
      if (!slot) return;
      const raw = (turnSepInp?.value || DEFAULT_CLIPBOARD_SETTINGS.turnSeparator).trim();
      slot.innerHTML = sanitiseSeparator(raw) || DEFAULT_CLIPBOARD_SETTINGS.turnSeparator;
      if (turnSepPreview) turnSepPreview.hidden = false;
    }

    function persist() {
      const settings = {
        format:             clipboardFormatSel.value,
        includeEmojis:      emojisChk?.checked     ?? true,
        includeImages:      imagesChk?.checked     ?? false,
        includeAttachments: attachChk?.checked     ?? false,
        separator:          separatorInp?.value    ?? DEFAULT_CLIPBOARD_SETTINGS.separator,
        turnSeparator:      turnSepInp?.value      ?? DEFAULT_CLIPBOARD_SETTINGS.turnSeparator,
      };
      browser.storage.local.set({ clipboardSettings: settings }).catch(() => {});
    }

    // Load saved settings and apply to controls
    browser.storage.local.get(['clipboardSettings', 'clipboardFormat']).then(data => {
      const legacy = data.clipboardFormat;
      const stored = data.clipboardSettings ?? (legacy ? { format: legacy } : {});
      clipboardFormatSel.value              = stored.format             ?? 'plain';
      if (emojisChk)    emojisChk.checked   = stored.includeEmojis      ?? true;
      if (imagesChk)    imagesChk.checked   = stored.includeImages       ?? false;
      if (attachChk)    attachChk.checked   = stored.includeAttachments  ?? false;
      if (separatorInp) separatorInp.value  = stored.separator      ?? DEFAULT_CLIPBOARD_SETTINGS.separator;
      if (turnSepInp)   turnSepInp.value    = stored.turnSeparator   ?? DEFAULT_CLIPBOARD_SETTINGS.turnSeparator;
      syncImagesRow();
      syncPreview();
      syncTurnPreview();
    }).catch(() => {});

    clipboardFormatSel.addEventListener('change', () => { syncImagesRow(); persist(); });
    emojisChk?.addEventListener('change',   persist);
    imagesChk?.addEventListener('change',   persist);
    attachChk?.addEventListener('change',   persist);
    separatorInp?.addEventListener('input', () => { syncPreview(); persist(); });
    turnSepInp?.addEventListener('input',   () => { syncTurnPreview(); persist(); });
  }

  // Wire show-ordinals toggle (idempotent) — C.28
  const showOrdinalsToggle = document.getElementById('showOrdinalsToggle');
  if (showOrdinalsToggle && !showOrdinalsToggle.dataset.wired) {
    showOrdinalsToggle.dataset.wired = '1';
    browser.storage.local.get(['readerSettings']).then(data => {
      showOrdinalsToggle.checked = data.readerSettings?.showOrdinals ?? true;
    }).catch(() => {});
    showOrdinalsToggle.addEventListener('change', () => {
      browser.storage.local.get(['readerSettings']).then(data => {
        const current = data.readerSettings ?? {};
        return browser.storage.local.set({
          readerSettings: { ...current, showOrdinals: showOrdinalsToggle.checked },
        });
      }).catch(() => {});
    });
  }

  // Wire auto-export settings (idempotent)
  const autoExportToggle          = document.getElementById('autoExportToggle');
  const autoExportThresholdInput  = document.getElementById('autoExportThresholdInput');
  const autoExportTopicsInput     = document.getElementById('autoExportTopicsInput');
  const autoExportFolderName      = document.getElementById('autoExportFolderName');
  const autoExportFolderBrowseBtn = document.getElementById('autoExportFolderBrowseBtn');
  const autoExportFolderClearBtn  = document.getElementById('autoExportFolderClearBtn');

  function _syncFolderDisplay(handle) {
    if (handle) {
      if (autoExportFolderName)     autoExportFolderName.textContent = handle.name;
      if (autoExportFolderClearBtn) autoExportFolderClearBtn.hidden  = false;
    } else {
      if (autoExportFolderName)     autoExportFolderName.textContent = 'Downloads (default)';
      if (autoExportFolderClearBtn) autoExportFolderClearBtn.hidden  = true;
    }
  }

  if (autoExportToggle && !autoExportToggle.dataset.wired) {
    autoExportToggle.dataset.wired = '1';

    function _syncThresholdEnabled() {
      if (autoExportThresholdInput) autoExportThresholdInput.disabled = !autoExportToggle.checked;
    }

    // Load persisted scalar settings
    browser.storage.local.get(['autoExportEnabled', 'autoExportThreshold', 'autoExportTopics'])
      .then(data => {
        autoExportToggle.checked = !!data.autoExportEnabled;
        if (autoExportThresholdInput) {
          autoExportThresholdInput.value = data.autoExportThreshold ?? 10;
        }
        if (autoExportTopicsInput) {
          autoExportTopicsInput.value = data.autoExportTopics || '';
        }
        _syncThresholdEnabled();
      }).catch(() => {});

    // Load persisted folder handle and update display
    getAutoExportDirHandle().then(_syncFolderDisplay).catch(() => {});

    // Toggle — also enables/disables threshold input
    autoExportToggle.addEventListener('change', () => {
      browser.storage.local.set({ autoExportEnabled: autoExportToggle.checked }).catch(() => {});
      _syncThresholdEnabled();
    });

    // Threshold
    autoExportThresholdInput?.addEventListener('change', () => {
      let val = parseInt(autoExportThresholdInput.value, 10);
      if (!val || val < 1) { val = 1; autoExportThresholdInput.value = '1'; }
      browser.storage.local.set({ autoExportThreshold: val }).catch(() => {});
    });

    // Topics filter
    autoExportTopicsInput?.addEventListener('input', () => {
      browser.storage.local.set({ autoExportTopics: autoExportTopicsInput.value }).catch(() => {});
    });

    // Browse button — opens native folder picker
    autoExportFolderBrowseBtn?.addEventListener('click', async () => {
      try {
        const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
        await storeAutoExportDirHandle(handle);
        _syncFolderDisplay(handle);
      } catch (err) {
        // User cancelled or API unavailable — ignore
        if (err.name !== 'AbortError') {
          logger.warn('Folder picker error:', err);
        }
      }
    });

    // Clear button — removes stored handle
    autoExportFolderClearBtn?.addEventListener('click', async () => {
      await clearAutoExportDirHandle().catch(() => {});
      _syncFolderDisplay(null);
    });
  }
}

export function closeSettingsPanel() {
  const panel = document.getElementById('settingsPanel');
  if (!panel) return;
  panel.classList.remove('settings-panel--open');
  panel.setAttribute('aria-hidden', 'true');
}
