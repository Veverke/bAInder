/**
 * backup-reminder.js
 *
 * Responsibility: display a periodic reminder banner prompting the user
 * to export (back up) their saved chats.
 *
 * NOT responsible for: performing the export (delegates to handleExportAll),
 * storage I/O beyond reading/writing reminder timestamps.
 */

import { state, elements } from '../app-context.js';
import browser from '../../lib/vendor/browser.js';
import { handleExportAll } from '../controllers/import-export-actions.js';
let _state = state;
// ---------------------------------------------------------------------------
// Test injection hook - lets unit tests provide a mock app context instead of
// mutating the real singleton.  Never call from production code.
// ---------------------------------------------------------------------------
/** @internal */
export function _setContext(ctx) { _state = ctx; }


const BACKUP_REMINDER_DAYS_DEFAULT = 30;
const BACKUP_SNOOZE_DAYS           =  7;
const BACKUP_SNOOZE_MS             = BACKUP_SNOOZE_DAYS * 24 * 60 * 60 * 1000;

export async function initBackupReminder() {
  const banner = elements.backupReminderBanner;
  if (!banner) return;
  try {
    const data = await browser.storage.local.get([
      'lastExportTimestamp', 'nextReminderAt', 'backupReminderDisabled',
      'backupReminderIntervalDays',
    ]);

    if (data.backupReminderDisabled) return;
    if (data.nextReminderAt && Date.now() < data.nextReminderAt) return;

    const reminderDays = data.backupReminderIntervalDays ?? BACKUP_REMINDER_DAYS_DEFAULT;
    const reminderMs   = reminderDays * 24 * 60 * 60 * 1000;

    const lastExport = data.lastExportTimestamp || null;
    const overdue    = !lastExport || (Date.now() - lastExport) > reminderMs;
    if (!overdue) return;

    const daysSince  = lastExport
      ? Math.floor((Date.now() - lastExport) / (24 * 60 * 60 * 1000))
      : null;
    const chatCount  = _state.chats.length;
    const msg = lastExport
      ? `${chatCount} saved chat${chatCount !== 1 ? 's' : ''} · Last exported ${daysSince} day${daysSince !== 1 ? 's' : ''} ago`
      : `${chatCount} saved chat${chatCount !== 1 ? 's' : ''} · Never exported`;

    if (elements.backupReminderMsg) elements.backupReminderMsg.textContent = msg;
    banner.style.display = 'flex';

    elements.backupExportNowBtn?.addEventListener('click', async () => {
      banner.style.display = 'none';
      handleExportAll();
    }, { once: true });

    elements.backupRemindLaterBtn?.addEventListener('click', async () => {
      banner.style.display = 'none';
      await browser.storage.local.set({ nextReminderAt: Date.now() + BACKUP_SNOOZE_MS });
    }, { once: true });

    elements.backupNeverRemindBtn?.addEventListener('click', async () => {
      banner.style.display = 'none';
      await browser.storage.local.set({ backupReminderDisabled: true });
    }, { once: true });

    elements.backupDismissBtn?.addEventListener('click', async () => {
      banner.style.display = 'none';
      await browser.storage.local.set({ nextReminderAt: Date.now() + BACKUP_SNOOZE_MS });
    }, { once: true });

  } catch (_) {
    // Non-fatal — silently skip
  }
}
