/**
 * Tests for src/lib/sticky-notes.js
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  loadStickyNotes,
  saveStickyNote,
  updateStickyNote,
  deleteStickyNote,
  loadNotesVisible,
  saveNotesVisible,
} from '../src/lib/sticky-notes/sticky-notes.js';

// ─── Mock storage factory ─────────────────────────────────────────────────────

function makeStorage(initial = {}) {
  const store = { ...initial };
  return {
    get: vi.fn(async (keys) => {
      const result = {};
      for (const k of keys) {
        if (k in store) result[k] = store[k];
      }
      return result;
    }),
    set: vi.fn(async (obj) => {
      Object.assign(store, obj);
    }),
    _store: store,
  };
}

const CHAT_ID = 'chat-abc-123';
const NOTES_KEY = `sticky-notes:${CHAT_ID}`;
const VIS_KEY   = `sticky-notes-visible:${CHAT_ID}`;

// ─── loadStickyNotes ──────────────────────────────────────────────────────────

describe('loadStickyNotes', () => {
  it('returns empty array when no notes stored', async () => {
    const storage = makeStorage();
    const notes = await loadStickyNotes(CHAT_ID, storage);
    expect(notes).toEqual([]);
  });

  it('returns stored notes', async () => {
    const existing = [
      { id: 'sn-1', chatId: CHAT_ID, anchorPageY: 200, content: 'hello', createdAt: 1000, updatedAt: 1000 },
    ];
    const storage = makeStorage({ [NOTES_KEY]: existing });
    const notes = await loadStickyNotes(CHAT_ID, storage);
    expect(notes).toEqual(existing);
  });
});

// ─── saveStickyNote ───────────────────────────────────────────────────────────

describe('saveStickyNote', () => {
  it('adds a note and returns full list', async () => {
    const storage = makeStorage();
    const list = await saveStickyNote(CHAT_ID, { anchorPageY: 300 }, storage);
    expect(list).toHaveLength(1);
    expect(list[0].chatId).toBe(CHAT_ID);
    expect(list[0].anchorPageY).toBe(300);
    expect(list[0].content).toBe('');
    expect(typeof list[0].id).toBe('string');
    expect(list[0].id).toMatch(/^sn-/);
    expect(typeof list[0].createdAt).toBe('number');
    expect(typeof list[0].updatedAt).toBe('number');
  });

  it('accumulates multiple notes', async () => {
    const storage = makeStorage();
    await saveStickyNote(CHAT_ID, { anchorPageY: 100 }, storage);
    const list = await saveStickyNote(CHAT_ID, { anchorPageY: 500 }, storage);
    expect(list).toHaveLength(2);
    expect(list[0].anchorPageY).toBe(100);
    expect(list[1].anchorPageY).toBe(500);
  });

  it('persists note with provided id if supplied', async () => {
    const storage = makeStorage();
    const list = await saveStickyNote(CHAT_ID, { anchorPageY: 0, id: 'sn-custom' }, storage);
    expect(list[0].id).toBe('sn-custom');
  });

  it('persists the content field', async () => {
    const storage = makeStorage();
    const list = await saveStickyNote(CHAT_ID, { anchorPageY: 0, content: 'Some **insight**' }, storage);
    expect(list[0].content).toBe('Some **insight**');
  });
});

// ─── updateStickyNote ─────────────────────────────────────────────────────────

describe('updateStickyNote', () => {
  it('patches the matching note and refreshes updatedAt', async () => {
    const before = Date.now();
    const storage = makeStorage({
      [NOTES_KEY]: [
        { id: 'sn-1', chatId: CHAT_ID, anchorPageY: 100, content: 'old', createdAt: 1000, updatedAt: 1000 },
      ],
    });
    const list = await updateStickyNote(CHAT_ID, 'sn-1', { content: 'new' }, storage);
    expect(list[0].content).toBe('new');
    expect(list[0].updatedAt).toBeGreaterThanOrEqual(before);
    // id and chatId must be preserved
    expect(list[0].id).toBe('sn-1');
    expect(list[0].chatId).toBe(CHAT_ID);
  });

  it('leaves other notes unchanged', async () => {
    const storage = makeStorage({
      [NOTES_KEY]: [
        { id: 'sn-1', chatId: CHAT_ID, anchorPageY: 100, content: 'a', createdAt: 1, updatedAt: 1 },
        { id: 'sn-2', chatId: CHAT_ID, anchorPageY: 200, content: 'b', createdAt: 2, updatedAt: 2 },
      ],
    });
    const list = await updateStickyNote(CHAT_ID, 'sn-1', { content: 'updated' }, storage);
    expect(list).toHaveLength(2);
    expect(list[1].content).toBe('b'); // untouched
  });

  it('returns unchanged list when noteId not found', async () => {
    const storage = makeStorage({
      [NOTES_KEY]: [
        { id: 'sn-1', chatId: CHAT_ID, anchorPageY: 100, content: 'a', createdAt: 1, updatedAt: 1 },
      ],
    });
    const list = await updateStickyNote(CHAT_ID, 'sn-unknown', { content: 'x' }, storage);
    expect(list[0].content).toBe('a');
  });
});

// ─── deleteStickyNote ─────────────────────────────────────────────────────────

describe('deleteStickyNote', () => {
  it('removes the note with the given id', async () => {
    const storage = makeStorage({
      [NOTES_KEY]: [
        { id: 'sn-1', chatId: CHAT_ID, anchorPageY: 100, content: 'a', createdAt: 1, updatedAt: 1 },
        { id: 'sn-2', chatId: CHAT_ID, anchorPageY: 200, content: 'b', createdAt: 2, updatedAt: 2 },
      ],
    });
    const list = await deleteStickyNote(CHAT_ID, 'sn-1', storage);
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe('sn-2');
  });

  it('returns empty array when last note is deleted', async () => {
    const storage = makeStorage({
      [NOTES_KEY]: [
        { id: 'sn-1', chatId: CHAT_ID, anchorPageY: 100, content: 'a', createdAt: 1, updatedAt: 1 },
      ],
    });
    const list = await deleteStickyNote(CHAT_ID, 'sn-1', storage);
    expect(list).toEqual([]);
  });

  it('is a no-op for unknown id', async () => {
    const storage = makeStorage({
      [NOTES_KEY]: [
        { id: 'sn-1', chatId: CHAT_ID, anchorPageY: 100, content: 'a', createdAt: 1, updatedAt: 1 },
      ],
    });
    const list = await deleteStickyNote(CHAT_ID, 'sn-nope', storage);
    expect(list).toHaveLength(1);
  });

  it('returns empty array when storage was empty', async () => {
    const storage = makeStorage();
    const list = await deleteStickyNote(CHAT_ID, 'sn-1', storage);
    expect(list).toEqual([]);
  });
});

// ─── loadNotesVisible ─────────────────────────────────────────────────────────

describe('loadNotesVisible', () => {
  it('defaults to true when never stored', async () => {
    const storage = makeStorage();
    const v = await loadNotesVisible(CHAT_ID, storage);
    expect(v).toBe(true);
  });

  it('returns stored true', async () => {
    const storage = makeStorage({ [VIS_KEY]: true });
    expect(await loadNotesVisible(CHAT_ID, storage)).toBe(true);
  });

  it('returns stored false', async () => {
    const storage = makeStorage({ [VIS_KEY]: false });
    expect(await loadNotesVisible(CHAT_ID, storage)).toBe(false);
  });
});

// ─── saveNotesVisible ─────────────────────────────────────────────────────────

describe('saveNotesVisible', () => {
  it('persists true', async () => {
    const storage = makeStorage();
    await saveNotesVisible(CHAT_ID, true, storage);
    expect(storage._store[VIS_KEY]).toBe(true);
  });

  it('persists false', async () => {
    const storage = makeStorage();
    await saveNotesVisible(CHAT_ID, false, storage);
    expect(storage._store[VIS_KEY]).toBe(false);
  });

  it('calls storage.set exactly once', async () => {
    const storage = makeStorage();
    await saveNotesVisible(CHAT_ID, true, storage);
    expect(storage.set).toHaveBeenCalledTimes(1);
  });
});
