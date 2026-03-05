/**
 * Tests for src/lib/chat/annotations.js
 */

import { vi } from 'vitest';
import {
  ANNOTATION_COLORS,
  saveAnnotation,
  loadAnnotations,
  deleteAnnotation,
  getCharOffset,
  resolveCharOffset,
  serializeRange,
  highlightRange,
  applyAnnotations,
  parseBacklinks,
} from '../src/lib/chat/annotations.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeStorage(initialData = {}) {
  const store = { ...initialData };
  return {
    get: vi.fn(async (keys) => {
      const result = {};
      for (const k of keys) result[k] = store[k];
      return result;
    }),
    set: vi.fn(async (obj) => {
      Object.assign(store, obj);
    }),
    _store: store,
  };
}

// ─── ANNOTATION_COLORS ────────────────────────────────────────────────────────

describe('ANNOTATION_COLORS', () => {
  it('is a non-empty array of strings', () => {
    expect(Array.isArray(ANNOTATION_COLORS)).toBe(true);
    expect(ANNOTATION_COLORS.length).toBeGreaterThan(0);
    ANNOTATION_COLORS.forEach(c => expect(typeof c).toBe('string'));
  });
});

// ─── saveAnnotation ───────────────────────────────────────────────────────────

describe('saveAnnotation', () => {
  it('saves the first annotation and returns a list with one item', async () => {
    const storage = makeStorage();
    const ann = { id: 'ann-1', start: 0, end: 5, text: 'hello', color: '#fef08a' };
    const list = await saveAnnotation('chat-1', ann, storage);
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe('ann-1');
    expect(list[0].chatId).toBe('chat-1');
    expect(typeof list[0].createdAt).toBe('string');
  });

  it('appends to an existing list', async () => {
    const key = 'annotations:chat-1';
    const existing = [{ id: 'ann-0', start: 0, end: 2, text: 'hi', color: '#fff', chatId: 'chat-1', createdAt: new Date().toISOString() }];
    const storage = makeStorage({ [key]: existing });
    const ann = { id: 'ann-1', start: 5, end: 10, text: 'world', color: '#fef08a' };
    const list = await saveAnnotation('chat-1', ann, storage);
    expect(list).toHaveLength(2);
    expect(list[1].id).toBe('ann-1');
  });

  it('calls storage.set with the updated list', async () => {
    const storage = makeStorage();
    const ann = { id: 'ann-1', start: 0, end: 5, text: 'hello', color: '#fef08a' };
    await saveAnnotation('chat-2', ann, storage);
    expect(storage.set).toHaveBeenCalledOnce();
    const [setArg] = storage.set.mock.calls[0];
    expect(setArg['annotations:chat-2']).toHaveLength(1);
  });
});

// ─── loadAnnotations ──────────────────────────────────────────────────────────

describe('loadAnnotations', () => {
  it('returns empty array when nothing is stored', async () => {
    const storage = makeStorage();
    const list = await loadAnnotations('chat-1', storage);
    expect(list).toEqual([]);
  });

  it('returns stored annotations', async () => {
    const key = 'annotations:chat-1';
    const stored = [{ id: 'x', start: 0, end: 1, text: 'a', color: '#fff', chatId: 'chat-1', createdAt: '' }];
    const storage = makeStorage({ [key]: stored });
    const list = await loadAnnotations('chat-1', storage);
    expect(list).toEqual(stored);
  });
});

// ─── deleteAnnotation ────────────────────────────────────────────────────────

describe('deleteAnnotation', () => {
  it('removes the annotation with the matching id', async () => {
    const key = 'annotations:chat-1';
    const stored = [
      { id: 'ann-1', start: 0, end: 1, text: 'a', color: '#fff', chatId: 'chat-1', createdAt: '' },
      { id: 'ann-2', start: 2, end: 3, text: 'b', color: '#fff', chatId: 'chat-1', createdAt: '' },
    ];
    const storage = makeStorage({ [key]: stored });
    const list = await deleteAnnotation('chat-1', 'ann-1', storage);
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe('ann-2');
  });

  it('returns empty array when all annotations deleted', async () => {
    const key = 'annotations:chat-1';
    const stored = [{ id: 'ann-1', start: 0, end: 1, text: 'a', color: '#fff', chatId: 'chat-1', createdAt: '' }];
    const storage = makeStorage({ [key]: stored });
    const list = await deleteAnnotation('chat-1', 'ann-1', storage);
    expect(list).toHaveLength(0);
  });

  it('returns unchanged list when id not found', async () => {
    const key = 'annotations:chat-1';
    const stored = [{ id: 'ann-1', start: 0, end: 1, text: 'a', color: '#fff', chatId: 'chat-1', createdAt: '' }];
    const storage = makeStorage({ [key]: stored });
    const list = await deleteAnnotation('chat-1', 'nonexistent', storage);
    expect(list).toHaveLength(1);
  });

  it('returns empty list when no annotations exist', async () => {
    const storage = makeStorage();
    const list = await deleteAnnotation('chat-x', 'ann-1', storage);
    expect(list).toHaveLength(0);
  });
});

// ─── getCharOffset ────────────────────────────────────────────────────────────

describe('getCharOffset', () => {
  it('returns 0 for the first char of the first text node', () => {
    const div = document.createElement('div');
    div.textContent = 'hello world';
    document.body.appendChild(div);
    const textNode = div.firstChild;
    const offset = getCharOffset(div, textNode, 0);
    expect(offset).toBe(0);
    div.remove();
  });

  it('returns the correct offset within a single text node', () => {
    const div = document.createElement('div');
    div.textContent = 'hello world';
    document.body.appendChild(div);
    const textNode = div.firstChild;
    const offset = getCharOffset(div, textNode, 5);
    expect(offset).toBe(5);
    div.remove();
  });

  it('returns cumulative offset across multiple text nodes', () => {
    const div = document.createElement('div');
    const span1 = document.createElement('span');
    span1.textContent = 'abc';
    const span2 = document.createElement('span');
    span2.textContent = 'def';
    div.appendChild(span1);
    div.appendChild(span2);
    document.body.appendChild(div);
    const textNode2 = span2.firstChild;
    const offset = getCharOffset(div, textNode2, 2);
    expect(offset).toBe(5); // 3 from 'abc' + 2 from 'def'
    div.remove();
  });

  it('returns fallback offset when node not found (total text length + offset)', () => {
    const div = document.createElement('div');
    div.textContent = 'hello'; // 5 chars
    document.body.appendChild(div);
    const outsideNode = document.createTextNode('outside');
    const offset = getCharOffset(div, outsideNode, 3);
    // walker traverses 'hello' (5 chars), then returns total(5) + offset(3) = 8
    expect(offset).toBe(8);
    div.remove();
  });
});

// ─── resolveCharOffset ────────────────────────────────────────────────────────

describe('resolveCharOffset', () => {
  it('returns null for empty container', () => {
    const div = document.createElement('div');
    document.body.appendChild(div);
    const result = resolveCharOffset(div, 0);
    expect(result).toBeNull();
    div.remove();
  });

  it('resolves offset 0 to start of first text node', () => {
    const div = document.createElement('div');
    div.textContent = 'hello';
    document.body.appendChild(div);
    const result = resolveCharOffset(div, 0);
    expect(result).not.toBeNull();
    expect(result.offset).toBe(0);
    div.remove();
  });

  it('resolves offset to correct node and offset within text', () => {
    const div = document.createElement('div');
    div.textContent = 'hello world';
    document.body.appendChild(div);
    const result = resolveCharOffset(div, 6);
    expect(result).not.toBeNull();
    expect(result.offset).toBe(6);
    div.remove();
  });

  it('resolves offset spanning two text nodes', () => {
    const div = document.createElement('div');
    const span1 = document.createElement('span');
    span1.textContent = 'abc';      // chars 0-2
    const span2 = document.createElement('span');
    span2.textContent = 'def';      // chars 3-5
    div.appendChild(span1);
    div.appendChild(span2);
    document.body.appendChild(div);
    const result = resolveCharOffset(div, 4);
    expect(result).not.toBeNull();
    expect(result.node).toBe(span2.firstChild);
    expect(result.offset).toBe(1);
    div.remove();
  });

  it('resolves to end of last text node', () => {
    const div = document.createElement('div');
    div.textContent = 'abc';
    document.body.appendChild(div);
    const result = resolveCharOffset(div, 3);
    expect(result).not.toBeNull();
    div.remove();
  });
});

// ─── serializeRange ───────────────────────────────────────────────────────────

describe('serializeRange', () => {
  it('returns null when range is outside container', () => {
    const container = document.createElement('div');
    container.textContent = 'inside';
    document.body.appendChild(container);

    const outside = document.createElement('div');
    outside.textContent = 'outside';
    document.body.appendChild(outside);

    const range = document.createRange();
    range.selectNodeContents(outside);

    const result = serializeRange(range, container);
    expect(result).toBeNull();
    container.remove();
    outside.remove();
  });

  it('returns null when start >= end', () => {
    const container = document.createElement('div');
    container.textContent = 'hello';
    document.body.appendChild(container);

    const range = document.createRange();
    range.setStart(container.firstChild, 3);
    range.setEnd(container.firstChild, 3); // collapsed

    const result = serializeRange(range, container);
    expect(result).toBeNull();
    container.remove();
  });

  it('serializes a valid range', () => {
    const container = document.createElement('div');
    container.textContent = 'hello world';
    document.body.appendChild(container);

    const range = document.createRange();
    range.setStart(container.firstChild, 0);
    range.setEnd(container.firstChild, 5);

    const result = serializeRange(range, container);
    expect(result).not.toBeNull();
    expect(result.start).toBe(0);
    expect(result.end).toBe(5);
    expect(result.text).toBe('hello');
    container.remove();
  });
});

// ─── highlightRange ───────────────────────────────────────────────────────────

describe('highlightRange', () => {
  it('wraps a valid range with a <mark> element', () => {
    const container = document.createElement('div');
    container.textContent = 'hello world';
    document.body.appendChild(container);

    highlightRange(container, { id: 'ann-1', start: 0, end: 5, color: '#fef08a', note: '' });
    const mark = container.querySelector('mark.annotation-highlight');
    expect(mark).not.toBeNull();
    expect(mark.dataset.annotationId).toBe('ann-1');
    container.remove();
  });

  it('sets title when note is provided', () => {
    const container = document.createElement('div');
    container.textContent = 'hello world';
    document.body.appendChild(container);

    highlightRange(container, { id: 'ann-1', start: 0, end: 5, color: '#fef08a', note: 'my note' });
    const mark = container.querySelector('mark');
    expect(mark.title).toBe('my note');
    container.remove();
  });

  it('uses default color when no color provided', () => {
    const container = document.createElement('div');
    container.textContent = 'hello';
    document.body.appendChild(container);

    highlightRange(container, { id: 'ann-1', start: 0, end: 3, color: '', note: '' });
    const mark = container.querySelector('mark');
    // Default color applied via CSS property — just check mark exists
    expect(mark).not.toBeNull();
    container.remove();
  });

  it('skips when startPos not resolved', () => {
    const container = document.createElement('div');
    // Empty container — nothing to resolve
    document.body.appendChild(container);

    expect(() => {
      highlightRange(container, { id: 'ann-1', start: 0, end: 5, color: '#fef08a', note: '' });
    }).not.toThrow();
    container.remove();
  });

  it('skips when endPos not resolved', () => {
    const container = document.createElement('div');
    container.textContent = 'hi'; // only 2 chars
    document.body.appendChild(container);

    expect(() => {
      highlightRange(container, { id: 'ann-1', start: 0, end: 100, color: '#fef08a', note: '' });
    }).not.toThrow();
    container.remove();
  });
});

// ─── applyAnnotations ─────────────────────────────────────────────────────────

describe('applyAnnotations', () => {
  it('applies multiple annotations from last to first', () => {
    const container = document.createElement('div');
    container.textContent = 'hello world test';
    document.body.appendChild(container);

    applyAnnotations(container, [
      { id: 'ann-1', start: 0, end: 5, color: '#fef08a', note: '' },
      { id: 'ann-2', start: 12, end: 16, color: '#bbf7d0', note: '' },
    ]);

    const marks = container.querySelectorAll('mark.annotation-highlight');
    expect(marks.length).toBeGreaterThanOrEqual(1);
    container.remove();
  });

  it('handles empty annotations array', () => {
    const container = document.createElement('div');
    container.textContent = 'text';
    document.body.appendChild(container);
    expect(() => applyAnnotations(container, [])).not.toThrow();
    container.remove();
  });

  it('does not mutate the original array', () => {
    const container = document.createElement('div');
    container.textContent = 'text content here';
    document.body.appendChild(container);

    const anns = [
      { id: 'ann-1', start: 0, end: 4, color: '#fef08a', note: '' },
      { id: 'ann-2', start: 5, end: 12, color: '#bbf7d0', note: '' },
    ];
    const original = [...anns];
    applyAnnotations(container, anns);
    expect(anns[0].id).toBe(original[0].id);
    expect(anns[1].id).toBe(original[1].id);
    container.remove();
  });
});

// ─── parseBacklinks ───────────────────────────────────────────────────────────

describe('parseBacklinks', () => {
  it('returns empty array for falsy input', () => {
    expect(parseBacklinks(null)).toEqual([]);
    expect(parseBacklinks(undefined)).toEqual([]);
    expect(parseBacklinks('')).toEqual([]);
  });

  it('returns empty array for non-string input', () => {
    expect(parseBacklinks(42)).toEqual([]);
    expect(parseBacklinks({})).toEqual([]);
  });

  it('returns empty array when no [[...]] found', () => {
    expect(parseBacklinks('No backlinks here')).toEqual([]);
  });

  it('extracts a single backlink', () => {
    expect(parseBacklinks('see [[My Chat]]')).toEqual(['My Chat']);
  });

  it('extracts multiple backlinks', () => {
    const result = parseBacklinks('see [[Chat One]] and [[Chat Two]]');
    expect(result).toEqual(['Chat One', 'Chat Two']);
  });

  it('trims whitespace inside backlinks', () => {
    expect(parseBacklinks('[[ My Chat ]]')).toEqual(['My Chat']);
  });

  it('ignores empty backlinks', () => {
    expect(parseBacklinks('see [[]] and [[ ]]')).toEqual([]);
  });

  it('handles complex titles with spaces and slashes', () => {
    const result = parseBacklinks('[[Topic / Review]] is here');
    expect(result).toEqual(['Topic / Review']);
  });
});
