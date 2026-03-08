/**
 * bAInder Sticky Notes — src/lib/sticky-notes/sticky-notes.js
 *
 * Stores and retrieves sticky notes attached to saved chats.
 * Sticky notes are additive annotations that never alter the original chat
 * content.  They live in chrome.storage.local (or any injected storage-like
 * object with `.get(keys)` / `.set(obj)` methods).
 *
 * Storage keys
 * ─────────────
 *   `sticky-notes:<chatId>`         → StickyNote[]
 *   `sticky-notes-visible:<chatId>` → boolean  (show/hide toggle state)
 *
 * StickyNote schema
 * ─────────────────
 *   {
 *     id:          string   — "sn-<timestamp>-<random>"
 *     chatId:      string   — owning chat id
 *     anchorPageY: number   — document Y coordinate at creation time (px)
 *     content:     string   — raw Markdown text entered by the user
 *     createdAt:   number   — Unix ms timestamp
 *     updatedAt:   number   — Unix ms timestamp
 *   }
 */

// ─── Key helpers ──────────────────────────────────────────────────────────────

/** @param {string} chatId */
const notesKey = chatId => `sticky-notes:${chatId}`;

/** @param {string} chatId */
const visKey = chatId => `sticky-notes-visible:${chatId}`;

// ─── CRUD ─────────────────────────────────────────────────────────────────────

/**
 * Load all sticky notes for a chat.
 * @param {string} chatId
 * @param {object} storage  — chrome.storage.local-like API
 * @returns {Promise<StickyNote[]>}
 */
export async function loadStickyNotes(chatId, storage) {
  const key    = notesKey(chatId);
  const result = await storage.get([key]);
  return result[key] || [];
}

/**
 * Persist a brand-new sticky note, returning the updated list.
 * @param {string}     chatId
 * @param {object}     note   — partial note; must include anchorPageY
 * @param {object}     storage
 * @returns {Promise<StickyNote[]>}
 */
export async function saveStickyNote(chatId, note, storage) {
  const key    = notesKey(chatId);
  const result = await storage.get([key]);
  const list   = result[key] || [];
  const now    = Date.now();
  const full   = {
    anchorPageY: 0,
    content:     '',
    ...note,
    id:        note.id || `sn-${now}-${Math.random().toString(36).slice(2, 7)}`,
    chatId,
    createdAt: now,
    updatedAt: now,
  };
  list.push(full);
  await storage.set({ [key]: list });
  return list;
}

/**
 * Apply a partial update to an existing sticky note (e.g. updated content).
 * `updatedAt` is automatically refreshed.
 * @param {string} chatId
 * @param {string} noteId
 * @param {object} patch   — partial fields to merge
 * @param {object} storage
 * @returns {Promise<StickyNote[]>}
 */
export async function updateStickyNote(chatId, noteId, patch, storage) {
  const key    = notesKey(chatId);
  const result = await storage.get([key]);
  const list   = (result[key] || []).map(n =>
    n.id === noteId
      ? { ...n, ...patch, id: n.id, chatId, updatedAt: Date.now() }
      : n
  );
  await storage.set({ [key]: list });
  return list;
}

/**
 * Delete a sticky note by id, returning the updated list.
 * @param {string} chatId
 * @param {string} noteId
 * @param {object} storage
 * @returns {Promise<StickyNote[]>}
 */
export async function deleteStickyNote(chatId, noteId, storage) {
  const key    = notesKey(chatId);
  const result = await storage.get([key]);
  const list   = (result[key] || []).filter(n => n.id !== noteId);
  await storage.set({ [key]: list });
  return list;
}

// ─── Visibility toggle ────────────────────────────────────────────────────────

/**
 * Load the show/hide toggle state for a chat's sticky notes.
 * Defaults to `true` (visible) when never set.
 * @param {string} chatId
 * @param {object} storage
 * @returns {Promise<boolean>}
 */
export async function loadNotesVisible(chatId, storage) {
  const key    = visKey(chatId);
  const result = await storage.get([key]);
  // Treat `undefined` (never stored) as true — notes visible by default
  return result[key] !== false;
}

/**
 * Persist the show/hide toggle state for a chat's sticky notes.
 * @param {string}  chatId
 * @param {boolean} visible
 * @param {object}  storage
 * @returns {Promise<void>}
 */
export async function saveNotesVisible(chatId, visible, storage) {
  const key = visKey(chatId);
  await storage.set({ [key]: visible });
}
