/**
 * constants.js — shared UI timing constants
 *
 * Centralises magic numeric literals that are either shared across modules
 * or benefit from a named, self-documenting identifier.
 */

/** Milliseconds before a toast notification is auto-dismissed. */
export const TOAST_DISMISS_MS = 3000;

/** Milliseconds before the save button resets to its default state. */
export const SAVE_BTN_RESET_MS = 3500;

/** Milliseconds that the tree-item flash highlight remains visible. */
export const TREE_FLASH_MS = 1500;

/**
 * Milliseconds after the pointer leaves a floating panel (annotation dropdown,
 * sticky-note dropdown) before the panel is hidden.
 * Used in reader.js and sticky-notes-ui.js.
 */
export const HOVER_OUT_DISMISS_MS = 150;
