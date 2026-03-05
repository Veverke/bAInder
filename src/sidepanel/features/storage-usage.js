/**
 * storage-usage.js
 *
 * Responsibility: query and display the current extension storage consumption
 * in the status bar, using StorageUsageTracker for quota-aware formatting.
 */

import { state, elements } from '../app-context.js';
import { logger } from '../../lib/utils/logger.js';
import { StorageUsageTracker } from '../../lib/storage.js';
let _state = state;
// ---------------------------------------------------------------------------
// Test injection hook - lets unit tests provide a mock app context instead of
// mutating the real singleton.  Never call from production code.
// ---------------------------------------------------------------------------
/** @internal */
export function _setContext(ctx) { _state = ctx; }


export async function updateStorageUsage() {
  try {
    const tracker = new StorageUsageTracker(_state.storage);
    const [text, warn] = await Promise.all([
      tracker.getFormattedUsage(),
      tracker.isApproachingQuota(),
    ]);
    elements.storageUsage.textContent = text;
    elements.storageUsage.closest('.storage-info')
      ?.classList.toggle('storage-info--warn', warn);
  } catch (error) {
    logger.error('Error getting storage usage:', error);
    elements.storageUsage.textContent = 'Unknown';
  }
}
