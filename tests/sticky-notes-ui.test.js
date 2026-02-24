/**
 * Tests for src/lib/sticky-notes-ui.js (pure functions only)
 */
import { describe, it, expect } from 'vitest';
import { clusterNotes, wrapSelection, wrapLink } from '../src/lib/sticky-notes-ui.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeNote(id, anchorPageY) {
  return { id, chatId: 'chat-1', anchorPageY, content: '', createdAt: 1, updatedAt: 1 };
}

/**
 * Lightweight textarea stand-in for wrapSelection / wrapLink tests.
 * Implements the exact interface those helpers use.
 */
function makeTa(value = '', ss = 0, se = 0) {
  return {
    value,
    selectionStart: ss,
    selectionEnd:   se,
    _focused: false,
    _events:  [],
    setSelectionRange(s, e) { this.selectionStart = s; this.selectionEnd = e; },
    focus()               { this._focused = true; },
    dispatchEvent(e)      { this._events.push(e.type); return true; },
  };
}

// ─── clusterNotes ─────────────────────────────────────────────────────────────

describe('clusterNotes', () => {
  it('returns empty array for empty input', () => {
    expect(clusterNotes([])).toEqual([]);
  });

  it('single note → single cluster with one note', () => {
    const notes    = [makeNote('a', 100)];
    const clusters = clusterNotes(notes);
    expect(clusters).toHaveLength(1);
    expect(clusters[0]).toHaveLength(1);
    expect(clusters[0][0].id).toBe('a');
  });

  it('two notes within threshold → same cluster', () => {
    const notes    = [makeNote('a', 100), makeNote('b', 180)]; // diff = 80 ≤ 100
    const clusters = clusterNotes(notes);
    expect(clusters).toHaveLength(1);
    expect(clusters[0]).toHaveLength(2);
  });

  it('two notes exactly at threshold boundary → same cluster', () => {
    const notes    = [makeNote('a', 0), makeNote('b', 100)]; // diff = 100 ≤ 100
    const clusters = clusterNotes(notes);
    expect(clusters).toHaveLength(1);
  });

  it('two notes beyond threshold → separate clusters', () => {
    const notes    = [makeNote('a', 0), makeNote('b', 101)]; // diff = 101 > 100
    const clusters = clusterNotes(notes);
    expect(clusters).toHaveLength(2);
    expect(clusters[0][0].id).toBe('a');
    expect(clusters[1][0].id).toBe('b');
  });

  it('sorts notes by anchorPageY before clustering', () => {
    // Unsorted input: b(500), a(100), c(150)  →  a+c cluster, b cluster
    const notes    = [makeNote('b', 500), makeNote('a', 100), makeNote('c', 150)];
    const clusters = clusterNotes(notes);
    expect(clusters).toHaveLength(2);
    // First cluster: a(100) and c(150) — diff = 50
    expect(clusters[0].map(n => n.id).sort()).toEqual(['a', 'c']);
    // Second cluster: b(500)
    expect(clusters[1][0].id).toBe('b');
  });

  it('three notes all within threshold → one cluster', () => {
    const notes = [makeNote('a', 0), makeNote('b', 50), makeNote('c', 100)];
    expect(clusterNotes(notes)).toHaveLength(1);
    expect(clusterNotes(notes)[0]).toHaveLength(3);
  });

  it('does not mutate the original array', () => {
    const notes  = [makeNote('b', 200), makeNote('a', 100)];
    const before = notes.map(n => n.id);
    clusterNotes(notes);
    expect(notes.map(n => n.id)).toEqual(before);
  });

  it('consecutive notes with equal anchor → same cluster', () => {
    const notes = [makeNote('a', 200), makeNote('b', 200), makeNote('c', 200)];
    const clusters = clusterNotes(notes);
    expect(clusters).toHaveLength(1);
    expect(clusters[0]).toHaveLength(3);
  });
});

// ─── wrapSelection ────────────────────────────────────────────────────────────

describe('wrapSelection', () => {
  it('wraps selected text with prefix and suffix', () => {
    const ta = makeTa('hello world', 6, 11); // "world" selected
    wrapSelection(ta, '**', '**');
    expect(ta.value).toBe('hello **world**');
  });

  it('inserts defaultText when nothing is selected', () => {
    const ta = makeTa('hello ', 6, 6);
    wrapSelection(ta, '**', '**', 'bold text');
    expect(ta.value).toBe('hello **bold text**');
  });

  it('selects the wrapped content so the user can type over it', () => {
    const ta = makeTa('x', 0, 0); // no selection
    wrapSelection(ta, '*', '*', 'italic');
    // cursor: `*italic*` → selected range is [1, 7]
    expect(ta.selectionStart).toBe(1);
    expect(ta.selectionEnd).toBe(1 + 'italic'.length);
  });

  it('wraps inline code with backticks', () => {
    const ta = makeTa('call foo now', 5, 8); // "foo" selected
    wrapSelection(ta, '`', '`');
    expect(ta.value).toBe('call `foo` now');
  });

  it('wraps code block with fenced syntax', () => {
    const ta = makeTa('', 0, 0);
    wrapSelection(ta, '```\n', '\n```', 'code here');
    expect(ta.value).toBe('```\ncode here\n```');
  });

  it('dispatches an input event to trigger auto-save', () => {
    const ta = makeTa('text', 0, 4);
    wrapSelection(ta, '**', '**');
    expect(ta._events).toContain('input');
  });

  it('focuses the textarea after wrapping', () => {
    const ta = makeTa('text', 0, 4);
    wrapSelection(ta, '_', '_');
    expect(ta._focused).toBe(true);
  });
});

// ─── wrapLink ─────────────────────────────────────────────────────────────────

describe('wrapLink', () => {
  it('wraps selected text as [text](https://)', () => {
    const ta = makeTa('visit example now', 6, 13); // "example" selected
    wrapLink(ta);
    expect(ta.value).toBe('visit [example](https://) now');
  });

  it('uses "link text" placeholder when nothing is selected', () => {
    const ta = makeTa('see ', 4, 4);
    wrapLink(ta);
    expect(ta.value).toBe('see [link text](https://)');
  });

  it('selects the URL placeholder after insertion', () => {
    const ta = makeTa('see ', 4, 4);
    wrapLink(ta);
    // "see [link text](https://)" → URL starts at 4 + 1 + 9 + 2 = 16
    const urlStart = 4 + 1 + 'link text'.length + 2; // ss + '[' + text + ']('
    expect(ta.selectionStart).toBe(urlStart);
    expect(ta.selectionEnd).toBe(urlStart + 'https://'.length);
  });

  it('selects the URL placeholder when text was already selected', () => {
    const ta = makeTa('open label here', 5, 10); // "label" selected
    wrapLink(ta);
    expect(ta.value).toBe('open [label](https://) here');
    const urlStart = 5 + 1 + 'label'.length + 2;
    expect(ta.selectionStart).toBe(urlStart);
    expect(ta.selectionEnd).toBe(urlStart + 'https://'.length);
  });

  it('dispatches an input event to trigger auto-save', () => {
    const ta = makeTa('x', 0, 0);
    wrapLink(ta);
    expect(ta._events).toContain('input');
  });

  it('focuses the textarea after wrapping', () => {
    const ta = makeTa('x', 0, 0);
    wrapLink(ta);
    expect(ta._focused).toBe(true);
  });
});
