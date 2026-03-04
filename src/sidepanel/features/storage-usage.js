/**
 * storage-usage.js
 *
 * Responsibility: query and display the current extension storage consumption
 * in the status bar, using StorageUsageTracker for quota-aware formatting.
 */

import { state, elements } from '../app-context.js';
import { StorageUsageTracker } from '../../lib/storage.js';

export async function updateStorageUsage() {
  try {
    const tracker = new StorageUsageTracker(state.storage);
    const [text, warn] = await Promise.all([
      tracker.getFormattedUsage(),
      tracker.isApproachingQuota(),
    ]);
    elements.storageUsage.textContent = text;
    elements.storageUsage.closest('.storage-info')
      ?.classList.toggle('storage-info--warn', warn);
  } catch (error) {
    console.error('Error getting storage usage:', error);
    elements.storageUsage.textContent = 'Unknown';
  }
}
