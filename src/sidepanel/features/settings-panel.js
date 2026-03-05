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
}

export function closeSettingsPanel() {
  const panel = document.getElementById('settingsPanel');
  if (!panel) return;
  panel.classList.remove('settings-panel--open');
  panel.setAttribute('aria-hidden', 'true');
}
