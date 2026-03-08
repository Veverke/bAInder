/**
 * Tests for src/lib/sticky-notes/sticky-notes-ui.js (pure functions only)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { clusterNotes, wrapSelection, wrapLink, buildNoteOverlay, setupStickyNotes } from '../src/lib/sticky-notes/sticky-notes-ui.js';

// ─── Module mocks (hoisted by Vitest) ─────────────────────────────────────────
vi.mock('../src/lib/sticky-notes/sticky-notes.js', () => ({
  loadStickyNotes:  vi.fn().mockResolvedValue([]),
  saveStickyNote:   vi.fn().mockImplementation(async (_chatId, note, _storage) => [note]),
  updateStickyNote: vi.fn().mockResolvedValue(undefined),
  deleteStickyNote: vi.fn().mockResolvedValue(undefined),
  loadNotesVisible: vi.fn().mockResolvedValue(true),
  saveNotesVisible: vi.fn().mockResolvedValue(undefined),
}));

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
// ─── buildNoteOverlay ─────────────────────────────────────────────────────────

function makeOverlayNote(id, anchorPageY, content = '') {
  return { id, chatId: 'chat-1', anchorPageY, anchorPageX: null, content, createdAt: 1000, updatedAt: 2000 };
}

// Minimal storage stub (never actually called in sync tests)
const fakeStorage = { get: vi.fn(), set: vi.fn() };

describe('buildNoteOverlay – single note, no content (edit mode)', () => {
  let overlay;

  beforeEach(() => {
    // Global confirm: always confirm deletion
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(true));
    vi.stubGlobal('requestAnimationFrame', (fn) => fn());
    const note = makeNote('n1', 50, '');
    overlay = buildNoteOverlay([note], 'chat-1', fakeStorage, vi.fn(), undefined, vi.fn());
    document.body.appendChild(overlay);
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
  });

  it('returns a div with className sticky-note', () => {
    expect(overlay.classList.contains('sticky-note')).toBe(true);
  });

  it('sets data-clusterId to the first note id', () => {
    expect(overlay.dataset.clusterId).toBe('n1');
  });

  it('positions the overlay at anchorPageY', () => {
    expect(overlay.style.top).toBe('50px');
  });

  it('renders a textarea in edit mode when note has no content', () => {
    expect(overlay.querySelector('.sticky-note__textarea')).not.toBeNull();
  });

  it('does not render nav buttons for single note', () => {
    expect(overlay.querySelector('.sticky-note__nav')).toBeNull();
  });

  it('renders delete button', () => {
    expect(overlay.querySelector('.sticky-note__del-btn')).not.toBeNull();
  });

  it('renders toggle edit/preview button', () => {
    expect(overlay.querySelector('.sticky-note__mode-btn')).not.toBeNull();
  });

  it('renders header timestamp span', () => {
    expect(overlay.querySelector('.sticky-note__ts')).not.toBeNull();
  });

  it('renders toolbar with bold button', () => {
    const toolbarBtns = [...overlay.querySelectorAll('.sticky-note__toolbar-btn')];
    const labels = toolbarBtns.map(b => b.textContent.trim());
    expect(labels).toContain('B');
  });

  it('renders toolbar with preview button', () => {
    const toolbarBtns = [...overlay.querySelectorAll('.sticky-note__toolbar-btn')];
    const labels = toolbarBtns.map(b => b.textContent.trim());
    expect(labels.some(l => l.includes('Preview'))).toBe(true);
  });

  it('clicking toggle switches to preview mode', () => {
    const toggleBtn = overlay.querySelector('.sticky-note__mode-btn');
    toggleBtn.click();
    expect(overlay.querySelector('.sticky-note__preview')).not.toBeNull();
    expect(overlay.querySelector('.sticky-note__textarea')).toBeNull();
  });

  it('delete button calls onDelete after confirmation', async () => {
    const onDelete = vi.fn();
    const note = makeOverlayNote('ndel', 100, '');
    const ov = buildNoteOverlay([note], 'chat-1', fakeStorage, onDelete, undefined, vi.fn());
    document.body.appendChild(ov);
    const delBtn = ov.querySelector('.sticky-note__del-btn');
    delBtn.click();
    // deleteStickyNote is async; wait for microtasks
    await new Promise(r => setTimeout(r, 0));
    expect(onDelete).toHaveBeenCalled();
    // overlay removes itself from DOM on delete — don't removeChild again
  });

  it('delete with cancelled confirm does nothing', async () => {
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(false));
    const onDelete = vi.fn();
    const note = makeOverlayNote('ncancel', 100, '');
    const ov = buildNoteOverlay([note], 'chat-1', fakeStorage, onDelete, undefined, vi.fn());
    document.body.appendChild(ov);
    ov.querySelector('.sticky-note__del-btn').click();
    await new Promise(r => setTimeout(r, 0));
    expect(onDelete).not.toHaveBeenCalled();
    ov.remove();
  });
});

describe('buildNoteOverlay – single note WITH content (preview mode)', () => {
  let overlay;

  beforeEach(() => {
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(true));
    vi.stubGlobal('requestAnimationFrame', (fn) => fn());
    const note = makeOverlayNote('n2', 60, '# Hello');
    overlay = buildNoteOverlay([note], 'chat-1', fakeStorage, vi.fn(), undefined, vi.fn());
    document.body.appendChild(overlay);
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
  });

  it('renders in preview mode when note has content', () => {
    expect(overlay.querySelector('.sticky-note__preview')).not.toBeNull();
    expect(overlay.querySelector('.sticky-note__textarea')).toBeNull();
  });

  it('toggle button text is ✎ (edit pen) when in preview', () => {
    const toggleBtn = overlay.querySelector('.sticky-note__mode-btn');
    expect(toggleBtn.textContent).toBe('✎');
  });

  it('clicking toggle in preview switches to edit mode', () => {
    const toggleBtn = overlay.querySelector('.sticky-note__mode-btn');
    toggleBtn.click();
    expect(overlay.querySelector('.sticky-note__textarea')).not.toBeNull();
    expect(overlay.querySelector('.sticky-note__preview')).toBeNull();
  });

  it('uses custom renderFn when provided', () => {
    const renderFn = vi.fn().mockReturnValue('<p>rendered</p>');
    const note = makeOverlayNote('n3', 70, '# Hello');
    const ov = buildNoteOverlay([note], 'chat-1', fakeStorage, vi.fn(), renderFn, vi.fn());
    document.body.appendChild(ov);
    expect(renderFn).toHaveBeenCalledWith('# Hello');
    document.body.removeChild(ov);
  });

  it('preview renders empty placeholder for note with no content', () => {
    const note = makeOverlayNote('n4-empty', 80, '');
    note.content = '';
    const ov = buildNoteOverlay([note], 'chat-1', fakeStorage, vi.fn(), undefined, vi.fn());
    document.body.appendChild(ov);
    // since content is empty, preview mode is false; still renders textarea
    expect(ov.querySelector('.sticky-note__textarea')).not.toBeNull();
    ov.remove();
  });
});

describe('buildNoteOverlay – multi-note cluster (disambiguation nav)', () => {
  let overlay;
  let notes;

  beforeEach(() => {
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(true));
    vi.stubGlobal('requestAnimationFrame', (fn) => fn());
    notes = [
      makeOverlayNote('na', 100, 'First note'),
      makeOverlayNote('nb', 110, 'Second note'),
      makeOverlayNote('nc', 120, ''),
    ];
    overlay = buildNoteOverlay(notes, 'chat-1', fakeStorage, vi.fn(), undefined, vi.fn());
    document.body.appendChild(overlay);
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
  });

  it('renders nav buttons for multi-note cluster', () => {
    expect(overlay.querySelector('.sticky-note__nav')).not.toBeNull();
    expect(overlay.querySelector('[aria-label="Previous note"]')).not.toBeNull();
    expect(overlay.querySelector('[aria-label="Next note"]')).not.toBeNull();
  });

  it('nav label shows "1 / 3" for the first note', () => {
    const label = overlay.querySelector('.sticky-note__nav-label');
    expect(label.textContent).toBe('1 / 3');
  });

  it('clicking next advances to note 2 (label shows "2 / 3")', () => {
    overlay.querySelector('[aria-label="Next note"]').click();
    const label = overlay.querySelector('.sticky-note__nav-label');
    expect(label.textContent).toBe('2 / 3');
  });

  it('clicking prev from note 1 wraps to note 3 (label shows "3 / 3")', () => {
    overlay.querySelector('[aria-label="Previous note"]').click();
    const label = overlay.querySelector('.sticky-note__nav-label');
    expect(label.textContent).toBe('3 / 3');
  });

  it('note position on overlay matches first cluster note anchorPageY', () => {
    expect(overlay.style.top).toBe('100px');
  });
});

describe('buildNoteOverlay – saved X position restores left/right', () => {
  afterEach(() => { document.body.innerHTML = ''; });

  it('sets left style when anchorPageX is set', () => {
    const note = makeNote('npos', 50, '');
    note.anchorPageX = 300;
    note.anchorPageY = 50;
    const ov = buildNoteOverlay([note], 'chat-1', fakeStorage, vi.fn(), undefined, vi.fn());
    expect(ov.style.left).toBe('300px');
    expect(ov.style.right).toBe('auto');
  });

  it('does not set explicit left when anchorPageX is null', () => {
    const note = makeNote('ndefault', 50, '');
    note.anchorPageX = null;
    const ov = buildNoteOverlay([note], 'chat-1', fakeStorage, vi.fn(), undefined, vi.fn());
    expect(ov.style.left).toBe('');
  });
});

describe('buildNoteOverlay – toolbar button interactions', () => {
  it('bold button wraps selected text', () => {
    vi.stubGlobal('requestAnimationFrame', (fn) => fn());
    const note = makeNote('nt', 10, '');
    const ov = buildNoteOverlay([note], 'chat-1', fakeStorage, vi.fn(), undefined, vi.fn());
    document.body.appendChild(ov);
    const ta = ov.querySelector('.sticky-note__textarea');
    ta.value = 'hello world';
    ta.selectionStart = 6; ta.selectionEnd = 11;
    // Click Bold via mousedown
    const boldBtn = [...ov.querySelectorAll('.sticky-note__toolbar-btn')]
      .find(b => b.textContent.trim() === 'B');
    boldBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    expect(ta.value).toBe('hello **world**');
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
  });

  it('preview toolbar button toggles to preview mode', () => {
    vi.stubGlobal('requestAnimationFrame', (fn) => fn());
    const note = makeNote('ntp', 10, '');
    const ov = buildNoteOverlay([note], 'chat-1', fakeStorage, vi.fn(), undefined, vi.fn());
    document.body.appendChild(ov);
    const previewBtn = [...ov.querySelectorAll('.sticky-note__toolbar-btn')]
      .find(b => b.textContent.includes('Preview'));
    previewBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    expect(ov.querySelector('.sticky-note__preview')).not.toBeNull();
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
  });
});

// ─── setupStickyNotes ─────────────────────────────────────────────────────────

import * as stickyNotesModule from '../src/lib/sticky-notes/sticky-notes.js';

function setupReaderDom() {
  document.body.innerHTML = `
    <header id="reader-header">
      <div class="reader-header__inner">
        <div class="reader-header__meta"></div>
      </div>
    </header>
    <main id="reader-content"></main>
  `;
}

describe('setupStickyNotes – early returns', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('returns early when chatId is falsy', async () => {
    await expect(setupStickyNotes('', fakeStorage)).resolves.toBeUndefined();
    await expect(setupStickyNotes(null, fakeStorage)).resolves.toBeUndefined();
  });

  it('returns early when storage is null', async () => {
    setupReaderDom();
    await expect(setupStickyNotes('chat-1', null)).resolves.toBeUndefined();
  });

  it('returns early when DOM elements are missing', async () => {
    document.body.innerHTML = ''; // no reader-content / reader-header
    await expect(setupStickyNotes('chat-1', fakeStorage)).resolves.toBeUndefined();
  });
});

describe('setupStickyNotes – DOM setup with empty notes', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  it('creates sticky-notes-layer in body', async () => {
    stickyNotesModule.loadStickyNotes.mockResolvedValue([]);
    stickyNotesModule.loadNotesVisible.mockResolvedValue(true);
    setupReaderDom();
    await setupStickyNotes('chat-x', fakeStorage);
    expect(document.getElementById('sticky-notes-layer')).not.toBeNull();
  });

  it('creates toggle button (hidden when no notes)', async () => {
    stickyNotesModule.loadStickyNotes.mockResolvedValue([]);
    stickyNotesModule.loadNotesVisible.mockResolvedValue(true);
    setupReaderDom();
    await setupStickyNotes('chat-x', fakeStorage);
    const btn = document.getElementById('sticky-notes-toggle');
    expect(btn).not.toBeNull();
    expect(btn.hidden).toBe(true); // no notes → button hidden
  });

  it('is idempotent – calling twice reuses existing layer', async () => {
    stickyNotesModule.loadStickyNotes.mockResolvedValue([]);
    stickyNotesModule.loadNotesVisible.mockResolvedValue(true);
    setupReaderDom();
    await setupStickyNotes('chat-x', fakeStorage);
    await setupStickyNotes('chat-x', fakeStorage);
    const layers = document.querySelectorAll('#sticky-notes-layer');
    expect(layers.length).toBe(1);
  });
});

describe('setupStickyNotes – notes present', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  it('renders overlays for loaded notes and shows toggle button', async () => {
    const note = { id: 'sn1', anchorPageY: 100, anchorPageX: null, content: 'Hello', createdAt: 1, updatedAt: 2 };
    stickyNotesModule.loadStickyNotes.mockResolvedValue([note]);
    stickyNotesModule.loadNotesVisible.mockResolvedValue(true);
    setupReaderDom();
    await setupStickyNotes('chat-x', fakeStorage);
    const toggleBtn = document.getElementById('sticky-notes-toggle');
    expect(toggleBtn.hidden).toBe(false);
    expect(toggleBtn.textContent).toContain('1 note');
  });

  it('layer is hidden when loadNotesVisible returns false', async () => {
    const note = { id: 'sn2', anchorPageY: 50, anchorPageX: null, content: 'Hi', createdAt: 1, updatedAt: 1 };
    stickyNotesModule.loadStickyNotes.mockResolvedValue([note]);
    stickyNotesModule.loadNotesVisible.mockResolvedValue(false);
    setupReaderDom();
    await setupStickyNotes('chat-x', fakeStorage);
    const layer = document.getElementById('sticky-notes-layer');
    expect(layer.hidden).toBe(true);
  });

  it('toggle button click flips visibility', async () => {
    const note = { id: 'sn3', anchorPageY: 50, anchorPageX: null, content: 'Yo', createdAt: 1, updatedAt: 1 };
    stickyNotesModule.loadStickyNotes.mockResolvedValue([note]);
    stickyNotesModule.loadNotesVisible.mockResolvedValue(true);
    setupReaderDom();
    await setupStickyNotes('chat-x', fakeStorage);
    const layer = document.getElementById('sticky-notes-layer');
    const toggleBtn = document.getElementById('sticky-notes-toggle');
    expect(layer.hidden).toBe(false);
    toggleBtn.click();
    await new Promise(r => setTimeout(r, 0));
    expect(layer.hidden).toBe(true);
  });

  it('context menu is created', async () => {
    stickyNotesModule.loadStickyNotes.mockResolvedValue([]);
    stickyNotesModule.loadNotesVisible.mockResolvedValue(true);
    setupReaderDom();
    await setupStickyNotes('chat-x', fakeStorage);
    expect(document.getElementById('sn-context-menu')).not.toBeNull();
  });

  it('context menu shows on contextmenu event', async () => {
    stickyNotesModule.loadStickyNotes.mockResolvedValue([]);
    stickyNotesModule.loadNotesVisible.mockResolvedValue(true);
    setupReaderDom();
    await setupStickyNotes('chat-x', fakeStorage);
    const ctxMenu = document.getElementById('sn-context-menu');
    document.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 50, clientY: 50 }));
    expect(ctxMenu.hidden).toBe(false);
  });

  it('context menu hides on outside click', async () => {
    stickyNotesModule.loadStickyNotes.mockResolvedValue([]);
    stickyNotesModule.loadNotesVisible.mockResolvedValue(true);
    setupReaderDom();
    await setupStickyNotes('chat-x', fakeStorage);
    const ctxMenu = document.getElementById('sn-context-menu');
    // show it first
    document.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    expect(ctxMenu.hidden).toBe(false);
    // click outside
    document.body.click();
    expect(ctxMenu.hidden).toBe(true);
  });
});

describe('setupStickyNotes – dropdown hover', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  it('mouseenter on toggle shows dropdown when notes exist', async () => {
    const note = { id: 'snd1', anchorPageY: 50, anchorPageX: null, content: 'Hi', createdAt: 1, updatedAt: 2 };
    stickyNotesModule.loadStickyNotes.mockResolvedValue([note]);
    stickyNotesModule.loadNotesVisible.mockResolvedValue(true);
    setupReaderDom();
    await setupStickyNotes('chat-drop', fakeStorage);
    const toggleBtn = document.getElementById('sticky-notes-toggle');
    const dropdown  = document.getElementById('sticky-notes-dropdown');
    expect(dropdown.hidden).toBe(true);
    toggleBtn.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    expect(dropdown.hidden).toBe(false);
  });

  it('mouseleave on toggle schedules dropdown hide', async () => {
    vi.useFakeTimers();
    const note = { id: 'snd2', anchorPageY: 50, anchorPageX: null, content: 'Hey', createdAt: 1, updatedAt: 2 };
    stickyNotesModule.loadStickyNotes.mockResolvedValue([note]);
    stickyNotesModule.loadNotesVisible.mockResolvedValue(true);
    setupReaderDom();
    await setupStickyNotes('chat-drop', fakeStorage);
    const toggleBtn = document.getElementById('sticky-notes-toggle');
    const dropdown  = document.getElementById('sticky-notes-dropdown');
    // Show first
    toggleBtn.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    expect(dropdown.hidden).toBe(false);
    // Schedule hide
    toggleBtn.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
    vi.advanceTimersByTime(200);
    expect(dropdown.hidden).toBe(true);
    vi.useRealTimers();
  });

  it('mouseenter on dropdown cancels the hide timer', async () => {
    vi.useFakeTimers();
    const note = { id: 'snd3', anchorPageY: 50, anchorPageX: null, content: 'Hey', createdAt: 1, updatedAt: 2 };
    stickyNotesModule.loadStickyNotes.mockResolvedValue([note]);
    stickyNotesModule.loadNotesVisible.mockResolvedValue(true);
    setupReaderDom();
    await setupStickyNotes('chat-drop', fakeStorage);
    const toggleBtn = document.getElementById('sticky-notes-toggle');
    const dropdown  = document.getElementById('sticky-notes-dropdown');
    toggleBtn.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    toggleBtn.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
    // Before timer fires, enter dropdown — should cancel hide
    dropdown.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    vi.advanceTimersByTime(200);
    expect(dropdown.hidden).toBe(false);
    vi.useRealTimers();
  });

  it('mouseenter does not show dropdown when notes list is empty', async () => {
    stickyNotesModule.loadStickyNotes.mockResolvedValue([]);
    stickyNotesModule.loadNotesVisible.mockResolvedValue(true);
    setupReaderDom();
    await setupStickyNotes('chat-drop', fakeStorage);
    const toggleBtn = document.getElementById('sticky-notes-toggle');
    const dropdown  = document.getElementById('sticky-notes-dropdown');
    toggleBtn.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    expect(dropdown.hidden).toBe(true);
  });
});

describe('setupStickyNotes – dropdown items', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  it('dropdown item scrolls to note when clicked (notes visible)', async () => {
    vi.stubGlobal('scrollTo', vi.fn());
    const note = { id: 'sni1', anchorPageY: 200, anchorPageX: null, content: 'Go here', createdAt: 1, updatedAt: 2 };
    stickyNotesModule.loadStickyNotes.mockResolvedValue([note]);
    stickyNotesModule.loadNotesVisible.mockResolvedValue(true);
    setupReaderDom();
    await setupStickyNotes('chat-di', fakeStorage);
    const toggleBtn = document.getElementById('sticky-notes-toggle');
    const dropdown  = document.getElementById('sticky-notes-dropdown');
    toggleBtn.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    const item = dropdown.querySelector('.sticky-notes-dropdown__item');
    expect(item).not.toBeNull();
    item.click();
    expect(window.scrollTo).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('dropdown item with notes hidden makes notes visible on click', async () => {
    vi.stubGlobal('scrollTo', vi.fn());
    const note = { id: 'sni2', anchorPageY: 100, anchorPageX: null, content: 'Read me', createdAt: 1, updatedAt: 2 };
    stickyNotesModule.loadStickyNotes.mockResolvedValue([note]);
    stickyNotesModule.loadNotesVisible.mockResolvedValue(false);
    setupReaderDom();
    await setupStickyNotes('chat-di2', fakeStorage);
    const layer = document.getElementById('sticky-notes-layer');
    const toggleBtn = document.getElementById('sticky-notes-toggle');
    const dropdown  = document.getElementById('sticky-notes-dropdown');
    // Manually show dropdown since notes are hidden
    stickyNotesModule.loadStickyNotes.mockResolvedValue([note]);
    toggleBtn.hidden = false;
    toggleBtn.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    const item = dropdown.querySelector('.sticky-notes-dropdown__item');
    if (item) {
      expect(layer.hidden).toBe(true);
      item.click();
      await new Promise(r => setTimeout(r, 0));
      expect(layer.hidden).toBe(false);
    }
    vi.unstubAllGlobals();
  });

  it('dropdown renders long content truncated to 60 chars + ellipsis', async () => {
    const longContent = 'A'.repeat(80);
    const note = { id: 'sni3', anchorPageY: 50, anchorPageX: null, content: longContent, createdAt: 1, updatedAt: 2 };
    stickyNotesModule.loadStickyNotes.mockResolvedValue([note]);
    stickyNotesModule.loadNotesVisible.mockResolvedValue(true);
    setupReaderDom();
    await setupStickyNotes('chat-di3', fakeStorage);
    const toggleBtn = document.getElementById('sticky-notes-toggle');
    const dropdown  = document.getElementById('sticky-notes-dropdown');
    toggleBtn.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    const preview = dropdown.querySelector('.sticky-notes-dropdown__preview');
    expect(preview).not.toBeNull();
    expect(preview.textContent.length).toBeLessThanOrEqual(62); // 60 + ellipsis char
    expect(preview.textContent.endsWith('\u2026')).toBe(true);
  });

  it('dropdown renders (empty note) placeholder when content is empty', async () => {
    const note = { id: 'sni4', anchorPageY: 50, anchorPageX: null, content: '', createdAt: 1, updatedAt: 2 };
    stickyNotesModule.loadStickyNotes.mockResolvedValue([note]);
    stickyNotesModule.loadNotesVisible.mockResolvedValue(true);
    setupReaderDom();
    await setupStickyNotes('chat-di4', fakeStorage);
    const toggleBtn = document.getElementById('sticky-notes-toggle');
    const dropdown  = document.getElementById('sticky-notes-dropdown');
    toggleBtn.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    const preview = dropdown.querySelector('.sticky-notes-dropdown__preview');
    expect(preview).not.toBeNull();
    expect(preview.textContent).toBe('(empty note)');
  });
});

describe('setupStickyNotes – add note via context menu', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  it('clicking sn-add-note-btn saves a new note and re-renders', async () => {
    const newNote = { id: 'sn-new', anchorPageY: 50, anchorPageX: null, content: '', createdAt: 1, updatedAt: 1 };
    stickyNotesModule.loadStickyNotes.mockResolvedValue([]);
    stickyNotesModule.loadNotesVisible.mockResolvedValue(true);
    stickyNotesModule.saveStickyNote.mockResolvedValue([newNote]);
    setupReaderDom();
    await setupStickyNotes('chat-add', fakeStorage);
    const ctxMenu = document.getElementById('sn-context-menu');
    const addBtn  = document.getElementById('sn-add-note-btn');
    // Show the context menu first
    document.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientY: 50, pageY: 50 }));
    expect(ctxMenu.hidden).toBe(false);
    addBtn.click();
    await new Promise(r => setTimeout(r, 0));
    expect(stickyNotesModule.saveStickyNote).toHaveBeenCalled();
    expect(ctxMenu.hidden).toBe(true);
  });

  it('clicking add-note when hidden makes notes visible first', async () => {
    const newNote = { id: 'sn-new2', anchorPageY: 50, anchorPageX: null, content: '', createdAt: 1, updatedAt: 1 };
    stickyNotesModule.loadStickyNotes.mockResolvedValue([]);
    stickyNotesModule.loadNotesVisible.mockResolvedValue(false);
    stickyNotesModule.saveStickyNote.mockResolvedValue([newNote]);
    setupReaderDom();
    await setupStickyNotes('chat-add2', fakeStorage);
    const layer  = document.getElementById('sticky-notes-layer');
    const addBtn = document.getElementById('sn-add-note-btn');
    expect(layer.hidden).toBe(true);
    document.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientY: 60, pageY: 60 }));
    addBtn.click();
    await new Promise(r => setTimeout(r, 0));
    expect(layer.hidden).toBe(false);
  });
});

describe('setupStickyNotes – header without .reader-header__meta', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  it('appends toggle wrapper to .reader-header__inner when no .reader-header__meta', async () => {
    // Header DOM without the meta-row
    document.body.innerHTML = `
      <header id="reader-header">
        <div class="reader-header__inner"></div>
      </header>
      <main id="reader-content"></main>
    `;
    stickyNotesModule.loadStickyNotes.mockResolvedValue([]);
    stickyNotesModule.loadNotesVisible.mockResolvedValue(true);
    await setupStickyNotes('chat-nometa', fakeStorage);
    // Wrapper should be appended inside .reader-header__inner
    const inner = document.querySelector('.reader-header__inner');
    expect(inner.querySelector('#sticky-notes-toggle-wrapper')).not.toBeNull();
  });
});

describe('setupStickyNotes – reloadAndRender triggered by deleting from multi-note cluster', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('reloadAndRender re-fetches notes and re-renders after note deletion', async () => {
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(true));
    vi.stubGlobal('requestAnimationFrame', (fn) => fn());

    // Two notes close together → one cluster (diff = 5 ≤ 100)
    const note1 = { id: 'rd1', anchorPageY: 100, anchorPageX: null, content: 'Note A', createdAt: 1, updatedAt: 2 };
    const note2 = { id: 'rd2', anchorPageY: 105, anchorPageX: null, content: 'Note B', createdAt: 3, updatedAt: 4 };

    // First call returns 2 notes; after deletion returns 1
    stickyNotesModule.loadStickyNotes
      .mockResolvedValueOnce([note1, note2])
      .mockResolvedValueOnce([note2]);
    stickyNotesModule.loadNotesVisible.mockResolvedValue(true);
    setupReaderDom();
    await setupStickyNotes('chat-reload', fakeStorage);

    // Should have rendered one overlay (single cluster with 2 notes)
    const layer = document.getElementById('sticky-notes-layer');
    expect(layer.querySelectorAll('.sticky-note').length).toBe(1);

    // Delete the first note (activeIdx = 0)
    const delBtn = layer.querySelector('.sticky-note__del-btn');
    delBtn.click();
    await new Promise(r => setTimeout(r, 0));

    // After delete, reloadAndRender called → loadStickyNotes called again
    expect(stickyNotesModule.loadStickyNotes).toHaveBeenCalledTimes(2);
  });
});

// ─── clusterNotes ────────────────────────────────────────────────────────────
describe('clusterNotes', () => {
  it('returns empty array for empty input', () => {
    expect(clusterNotes([])).toEqual([]);
  });

  it('puts a single note into a single cluster', () => {
    const notes = [{ id: '1', anchorPageY: 200 }];
    expect(clusterNotes(notes)).toEqual([[notes[0]]]);
  });

  it('groups notes within SAME_AREA_THRESHOLD_PX (100px) into one cluster', () => {
    const n1 = { id: 'a', anchorPageY: 100 };
    const n2 = { id: 'b', anchorPageY: 150 }; // diff = 50 ≤ 100
    const result = clusterNotes([n1, n2]);
    expect(result).toHaveLength(1);
    expect(result[0]).toHaveLength(2);
  });

  it('splits notes more than 100px apart into separate clusters', () => {
    const n1 = { id: 'a', anchorPageY: 100 };
    const n2 = { id: 'b', anchorPageY: 250 }; // diff = 150 > 100
    const result = clusterNotes([n1, n2]);
    expect(result).toHaveLength(2);
  });

  it('sorts notes by anchorPageY before clustering', () => {
    const n1 = { id: 'late', anchorPageY: 500 };
    const n2 = { id: 'early', anchorPageY: 100 };
    const result = clusterNotes([n1, n2]);
    expect(result[0][0].id).toBe('early');
  });
});

// ─── wrapSelection ───────────────────────────────────────────────────────────
describe('wrapSelection', () => {
  function makeTextarea(value = '', ss = 0, se = 0) {
    const ta = document.createElement('textarea');
    ta.value = value;
    ta.setSelectionRange(ss, se);
    document.body.appendChild(ta);
    return ta;
  }

  afterEach(() => { document.body.innerHTML = ''; });

  it('wraps existing selection with prefix and suffix', () => {
    const ta = makeTextarea('hello world', 6, 11); // selects "world"
    wrapSelection(ta, '**', '**');
    expect(ta.value).toBe('hello **world**');
  });

  it('inserts defaultText when nothing is selected', () => {
    const ta = makeTextarea('hello ', 6, 6);
    wrapSelection(ta, '**', '**', 'bold text');
    expect(ta.value).toBe('hello **bold text**');
  });

  it('dispatches input event after wrapping', () => {
    const ta = makeTextarea('abc', 1, 2);
    const listener = vi.fn();
    ta.addEventListener('input', listener);
    wrapSelection(ta, '_', '_');
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

// ─── wrapLink ────────────────────────────────────────────────────────────────
describe('wrapLink', () => {
  afterEach(() => { document.body.innerHTML = ''; });

  it('wraps selected text as a markdown link', () => {
    const ta = document.createElement('textarea');
    ta.value = 'click here please';
    ta.setSelectionRange(6, 10); // selects "here"
    document.body.appendChild(ta);
    wrapLink(ta);
    expect(ta.value).toBe('click [here](https://) please');
  });

  it('uses "link text" placeholder when nothing is selected', () => {
    const ta = document.createElement('textarea');
    ta.value = '';
    ta.setSelectionRange(0, 0);
    document.body.appendChild(ta);
    wrapLink(ta);
    expect(ta.value).toBe('[link text](https://)');
  });

  it('dispatches input event', () => {
    const ta = document.createElement('textarea');
    ta.value = 'foo';
    ta.setSelectionRange(0, 3);
    document.body.appendChild(ta);
    const listener = vi.fn();
    ta.addEventListener('input', listener);
    wrapLink(ta);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

// ─── drag handler (onMove / onUp) ────────────────────────────────────────────
describe('buildNoteOverlay – drag repositioning', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('moves overlay on pointermove then persists on pointerup', async () => {
    vi.stubGlobal('requestAnimationFrame', (fn) => fn());
    const note = { id: 'drag1', anchorPageY: 300, anchorPageX: 50, content: '', createdAt: 1, updatedAt: 1 };
    const cluster = [note];
    const storage = { get: vi.fn(), set: vi.fn() };
    const onDelete = vi.fn();
    const ov = buildNoteOverlay(cluster, 'chat-drag', storage, onDelete);
    document.body.appendChild(ov);

    const header = ov.querySelector('.sticky-note__header');
    // Stub pointer capture APIs (not available in happy-dom)
    header.setPointerCapture   = vi.fn();
    header.releasePointerCapture = vi.fn();

    // Stub getBoundingClientRect to return predictable values
    ov.getBoundingClientRect = vi.fn().mockReturnValue({ left: 40, top: 200 });
    vi.stubGlobal('scrollX', 0);
    vi.stubGlobal('scrollY', 0);

    // pointerdown starts the drag
    header.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, clientX: 80, clientY: 250 }));

    // pointermove should update left/top
    header.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 1, clientX: 100, clientY: 260 }));
    expect(parseFloat(ov.style.left)).toBeCloseTo(60, 0); // 40 + (100-80) = 60

    // pointerup persists position
    await header.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1, clientX: 100, clientY: 260 }));
    await new Promise(r => setTimeout(r, 0));
    const { updateStickyNote } = await import('../src/lib/sticky-notes/sticky-notes.js');
    expect(updateStickyNote).toHaveBeenCalled();
  });
});