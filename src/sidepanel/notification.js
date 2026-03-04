/**
 * notification.js
 *
 * Responsibility: display transient toast notifications.
 *
 * This is a pure UI utility shared across all sidepanel modules.
 * It only touches the `#toast` element and the `state._toastTimer` handle.
 */

import { state } from './app-context.js';

/**
 * Show a toast notification.
 *
 * @param {string} message
 * @param {'info'|'success'|'error'|'loading'} type
 *   Pass `'loading'` for a persistent spinner that stays until the next call.
 */
export function showNotification(message, type = 'info') {
  console.log(`[${type.toUpperCase()}] ${message}`);
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.className = `toast toast--${type} toast--visible`;
  clearTimeout(state._toastTimer);
  if (type !== 'loading') {
    state._toastTimer = setTimeout(() => {
      toast.className = 'toast';
    }, 3000);
  }
}
