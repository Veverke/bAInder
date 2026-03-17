/**
 * Tests for src/sidepanel/notification.js
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { showNotification, showUndoToast } from '../src/sidepanel/notification.js';
import { state } from '../src/sidepanel/app-context.js';

// ── DOM setup ─────────────────────────────────────────────────────────────────

function makeToast() {
  const toast = document.createElement('div');
  toast.id = 'toast';
  document.body.appendChild(toast);
  return toast;
}

beforeEach(() => {
  document.body.innerHTML = '';
  state._toastTimer = undefined;
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

// ─────────────────────────────────────────────────────────────────────────────
// showNotification
// ─────────────────────────────────────────────────────────────────────────────

describe('showNotification()', () => {
  it('does nothing when there is no #toast element in the DOM', () => {
    // No toast element created — should not throw
    expect(() => showNotification('Hello')).not.toThrow();
  });

  it('sets toast textContent to the given message', () => {
    const toast = makeToast();
    showNotification('Saved!');
    expect(toast.textContent).toBe('Saved!');
  });

  it('sets the toast className to include the type', () => {
    const toast = makeToast();
    showNotification('Done', 'success');
    expect(toast.className).toContain('toast--success');
    expect(toast.className).toContain('toast--visible');
  });

  it('defaults type to "info" when not specified', () => {
    const toast = makeToast();
    showNotification('Yo');
    expect(toast.className).toContain('toast--info');
  });

  it('uses types: error', () => {
    const toast = makeToast();
    showNotification('Oops', 'error');
    expect(toast.className).toContain('toast--error');
  });

  it('sets a dismiss timeout for regular (non-loading) notifications', () => {
    const toast = makeToast();
    showNotification('Info msg', 'info');
    expect(toast.className).toContain('toast--visible');
    // Advance timers past TOAST_DISMISS_MS (3000 ms default)
    vi.advanceTimersByTime(5000);
    // After timeout, className should reset to 'toast' (no --visible)
    expect(toast.className).toBe('toast');
  });

  it('does NOT set a dismiss timeout for "loading" type', () => {
    const toast = makeToast();
    showNotification('Loading…', 'loading');
    expect(toast.className).toContain('toast--loading');
    vi.advanceTimersByTime(10000);
    // Still visible — no auto-dismiss for loading type
    expect(toast.className).toContain('toast--loading');
  });

  it('clears any previous timer when called a second time', () => {
    const toast = makeToast();
    showNotification('First', 'info');
    // Advances half the dismiss window
    vi.advanceTimersByTime(1500);
    // Second notification should reset the timer
    showNotification('Second', 'success');
    // Even though we've advanced 1500ms, the first timer is cancelled
    vi.advanceTimersByTime(1500); // total 3000ms — but timer was reset
    expect(toast.textContent).toBe('Second');
    // Complete the new timer
    vi.advanceTimersByTime(5000);
    expect(toast.className).toBe('toast');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// showUndoToast
// ─────────────────────────────────────────────────────────────────────────────

describe('showUndoToast()', () => {
  it('does nothing when there is no #toast element', () => {
    expect(() => showUndoToast('Chat deleted', () => {})).not.toThrow();
  });

  it('shows the message and an Undo button', () => {
    const toast = makeToast();
    showUndoToast('Chat deleted', () => {});
    expect(toast.textContent).toContain('Chat deleted');
    expect(toast.querySelector('.toast__undo')).not.toBeNull();
  });

  it('sets the toast className to toast--undo toast--visible', () => {
    const toast = makeToast();
    showUndoToast('Removed', () => {});
    expect(toast.className).toContain('toast--undo');
    expect(toast.className).toContain('toast--visible');
  });

  it('calls onUndo when the Undo button is clicked', () => {
    const toast  = makeToast();
    const onUndo = vi.fn();
    showUndoToast('Deleted topic', onUndo);
    const btn = toast.querySelector('.toast__undo');
    btn.click();
    expect(onUndo).toHaveBeenCalledOnce();
  });

  it('hides the toast after Undo is clicked', () => {
    const toast = makeToast();
    showUndoToast('Deleted', () => {});
    const btn = toast.querySelector('.toast__undo');
    btn.click();
    expect(toast.className).toBe('toast');
    expect(toast.children.length).toBe(0);
  });

  it('auto-dismisses the toast after the given timeoutMs', () => {
    const toast = makeToast();
    showUndoToast('Item deleted', () => {}, 4000);
    vi.advanceTimersByTime(4000);
    expect(toast.className).toBe('toast');
  });

  it('cancels the previous toast timer when called again', () => {
    const toast = makeToast();
    showUndoToast('First', () => {}, 5000);
    vi.advanceTimersByTime(2000);
    showUndoToast('Second', () => {}, 5000);
    // First toast timer was cancelled; should still show 'Second'
    expect(toast.textContent).toContain('Second');
  });

  it('does not fire onUndo twice when Undo clicked multiple times', () => {
    const toast  = makeToast();
    const onUndo = vi.fn();
    showUndoToast('Deleted', onUndo);
    const btn = toast.querySelector('.toast__undo');
    btn.click();
    btn.click();
    btn.click();
    expect(onUndo).toHaveBeenCalledOnce();
  });
});
