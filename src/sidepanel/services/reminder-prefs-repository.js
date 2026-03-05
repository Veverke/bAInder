/**
 * reminder-prefs-repository.js
 *
 * Responsibility: all browser.storage I/O for backup-reminder user preferences.
 *
 * Previously this logic was scattered as raw `browser.storage.local.get/set` calls
 * across two different modules (Issues 8.2 & 8.3):
 *   - features/backup-reminder.js — read + snooze + dismiss
 *   - controllers/import-export-actions.js — write lastExportTimestamp
 *
 * Centralising here:
 *  - gives both consumers a single, named abstraction with clear intent
 *  - removes raw API calls from feature/controller modules
 *  - makes the prefs testable without a `browser` global (inject a stub adapter)
 *
 * NOT responsible for: banner DOM manipulation, export logic, or any business
 * rules beyond reading and writing the four known preference keys.
 */

import browser from '../../lib/vendor/browser.js';
import { logger } from '../../lib/utils/logger.js';

/** @typedef {{ lastExportTimestamp: number|null, nextReminderAt: number|null, backupReminderDisabled: boolean, backupReminderIntervalDays: number|null }} ReminderPrefs */

const PREFS_KEYS = [
  'lastExportTimestamp',
  'nextReminderAt',
  'backupReminderDisabled',
  'backupReminderIntervalDays',
];

export class ReminderPrefsRepository {
  /**
   * @param {typeof browser.storage.local} [storageAdapter]
   *   Defaults to `browser.storage.local`; pass a stub in tests.
   */
  constructor(storageAdapter = browser.storage.local) {
    this._storage = storageAdapter;
  }

  /**
   * Load all four reminder preference values from storage.
   * @returns {Promise<ReminderPrefs>}
   */
  async loadPrefs() {
    try {
      const data = await this._storage.get(PREFS_KEYS);
      return {
        lastExportTimestamp:      data.lastExportTimestamp       ?? null,
        nextReminderAt:           data.nextReminderAt            ?? null,
        backupReminderDisabled:   data.backupReminderDisabled    ?? false,
        backupReminderIntervalDays: data.backupReminderIntervalDays ?? null,
      };
    } catch (err) {
      logger.error('ReminderPrefsRepository.loadPrefs error:', err);
      return { lastExportTimestamp: null, nextReminderAt: null, backupReminderDisabled: false, backupReminderIntervalDays: null };
    }
  }

  /**
   * Postpone the next reminder by the given number of milliseconds.
   * @param {number} durationMs
   */
  async snooze(durationMs) {
    try {
      await this._storage.set({ nextReminderAt: Date.now() + durationMs });
    } catch (err) {
      logger.error('ReminderPrefsRepository.snooze error:', err);
    }
  }

  /**
   * Permanently disable backup reminders for this user.
   */
  async dismiss() {
    try {
      await this._storage.set({ backupReminderDisabled: true });
    } catch (err) {
      logger.error('ReminderPrefsRepository.dismiss error:', err);
    }
  }

  /**
   * Record that the user just performed an export (resets the overdue clock).
   */
  async recordExport() {
    try {
      await this._storage.set({ lastExportTimestamp: Date.now() });
    } catch (err) {
      logger.error('ReminderPrefsRepository.recordExport error:', err);
    }
  }

  /**
   * Enable or disable backup reminders.
   * @param {boolean} enabled  `true` to enable reminders, `false` to disable.
   */
  async setEnabled(enabled) {
    try {
      await this._storage.set({ backupReminderDisabled: !enabled });
    } catch (err) {
      logger.error('ReminderPrefsRepository.setEnabled error:', err);
    }
  }

  /**
   * Set the backup-reminder interval in whole days.
   * @param {number} days
   */
  async setReminderInterval(days) {
    try {
      await this._storage.set({ backupReminderIntervalDays: days });
    } catch (err) {
      logger.error('ReminderPrefsRepository.setReminderInterval error:', err);
    }
  }
}
