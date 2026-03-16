/**
 * notification.js
 *
 * Responsibility: display transient toast notifications.
 *
 * This is a pure UI utility shared across all sidepanel modules.
 * It only touches the `#toast` element and the `state._toastTimer` handle.
 */

import { state } from './app-context.js';
import { logger } from '../lib/utils/logger.js';
import { TOAST_DISMISS_MS } from '../lib/utils/constants.js';

/**
 * Show a toast notification.
 *
 * @param {string} message
 * @param {'info'|'success'|'error'|'loading'} type
 *   Pass `'loading'` for a persistent spinner that stays until the next call.
 */
export function showNotification(message, type = 'info') {
  logger.debug('Toast:', type, message);
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.className = `toast toast--${type} toast--visible`;
  clearTimeout(state._toastTimer);
  if (type !== 'loading') {
    state._toastTimer = setTimeout(() => {
      toast.className = 'toast';
    }, TOAST_DISMISS_MS);
  }
}

/**
 * Show a dismissible "undo" toast with an action button.
 * The deferred callback is NOT called here — the caller is responsible for
 * scheduling the permanent action after `timeoutMs` and cancelling it if
 * `onUndo` fires.
 *
 * @param {string}   message    — e.g. "Chat deleted"
 * @param {Function} onUndo     — called immediately when the user clicks Undo
 * @param {number}   [timeoutMs=6000]
 */
export function showUndoToast(message, onUndo, timeoutMs = 6000) {
  const toast = document.getElementById('toast');
  if (!toast) return;

  // Clear any existing toast / timer
  clearTimeout(state._toastTimer);
  toast.className = 'toast';

  // Build content safely (no innerHTML with user data)
  const msgSpan = document.createElement('span');
  msgSpan.textContent = message;

  const undoBtn = document.createElement('button');
  undoBtn.className = 'toast__undo';
  undoBtn.textContent = 'Undo';

  toast.replaceChildren(msgSpan, undoBtn);
  toast.className = 'toast toast--undo toast--visible';

  const hide = () => {
    toast.className = 'toast';
    toast.replaceChildren();
  };

  state._toastTimer = setTimeout(hide, timeoutMs);

  undoBtn.addEventListener('click', () => {
    clearTimeout(state._toastTimer);
    hide();
    onUndo();
  }, { once: true });
}
