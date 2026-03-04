/**
 * bAInder Sticky Notes UI — src/lib/sticky-notes-ui.js
 *
 * Renders sticky-note overlays in the reader page, wires the context-menu
 * "Add Sticky Note" action, handles the show/hide header toggle, and provides
 * auto-save + Markdown preview for each note.
 *
 * Public API
 * ──────────
 *   setupStickyNotes(chatId, storage)  — call once after renderChat()
 */

import {
  loadStickyNotes,
  saveStickyNote,
  updateStickyNote,
  deleteStickyNote,
  loadNotesVisible,
  saveNotesVisible,
} from './sticky-notes.js';

// renderMarkdown is injected at call time to avoid a circular import
// (reader.js ← sticky-notes-ui.js ← reader.js).
// Default: plain-text passthrough so the module is safe to import standalone.
const plainTextRender = text => `<pre style="white-space:pre-wrap">${
  text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
}</pre>`;

// ─── Constants ────────────────────────────────────────────────────────────────

/** Two notes whose anchorPageY values differ by ≤ this are "in the same area" */
const SAME_AREA_THRESHOLD_PX = 100;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Format a Unix ms timestamp as a short locale string.
 * @param {number} ms
 * @returns {string}
 */
function fmtTs(ms) {
  if (!ms) return '';
  try {
    return new Date(ms).toLocaleString(undefined, {
      month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch (_) {
    return '';
  }
}

/**
 * Group notes into clusters where each cluster's notes are all within
 * SAME_AREA_THRESHOLD_PX of each other (sorted by anchorPageY).
 * @param {StickyNote[]} notes
 * @returns {StickyNote[][]}
 */
export function clusterNotes(notes) {
  if (!notes.length) return [];
  const sorted = [...notes].sort((a, b) => a.anchorPageY - b.anchorPageY);
  const clusters = [];
  let current    = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    if (curr.anchorPageY - prev.anchorPageY <= SAME_AREA_THRESHOLD_PX) {
      current.push(curr);
    } else {
      clusters.push(current);
      current = [curr];
    }
  }
  clusters.push(current);
  return clusters;
}

// ─── Markdown toolbar helpers ─────────────────────────────────────────────────

/**
 * Wrap the current textarea selection with prefix/suffix.
 * If nothing is selected, inserts `prefix + defaultText + suffix` and
 * selects the defaultText so the user can immediately type over it.
 * Dispatches a synthetic `input` event to trigger auto-save.
 *
 * @param {HTMLTextAreaElement} ta
 * @param {string} prefix
 * @param {string} suffix
 * @param {string} [defaultText]
 */
export function wrapSelection(ta, prefix, suffix, defaultText = '') {
  const { selectionStart: ss, selectionEnd: se, value } = ta;
  const selected = value.slice(ss, se) || defaultText;
  const before   = value.slice(0, ss);
  const after    = value.slice(se);
  ta.value = `${before}${prefix}${selected}${suffix}${after}`;
  // If we used the default text, select it so the user can type over it.
  // If there was a selection, keep the selection around the wrapped content.
  const cursorStart = ss + prefix.length;
  const cursorEnd   = cursorStart + selected.length;
  ta.setSelectionRange(cursorStart, cursorEnd);
  ta.focus();
  ta.dispatchEvent(new Event('input', { bubbles: true }));
}

/**
 * Wrap the current textarea selection as a Markdown link `[text](url)`.
 * After insertion the `https://` URL placeholder is selected so the user
 * can type the URL without extra navigation.
 * Dispatches a synthetic `input` event to trigger auto-save.
 *
 * @param {HTMLTextAreaElement} ta
 */
export function wrapLink(ta) {
  const { selectionStart: ss, selectionEnd: se, value } = ta;
  const selected       = value.slice(ss, se) || 'link text';
  const urlPlaceholder = 'https://';
  const before         = value.slice(0, ss);
  const after          = value.slice(se);
  ta.value = `${before}[${selected}](${urlPlaceholder})${after}`;
  // Select just the URL placeholder: position = ss + 1 (for '[') + selected.length + 2 (for '](')
  const urlStart = ss + 1 + selected.length + 2;
  ta.setSelectionRange(urlStart, urlStart + urlPlaceholder.length);
  ta.focus();
  ta.dispatchEvent(new Event('input', { bubbles: true }));
}

/**
 * Build the formatting toolbar element for a note textarea.
 * @param {HTMLTextAreaElement} ta
 * @returns {HTMLElement}
 */
/**
 * Build the formatting toolbar element for a note textarea.
 * @param {HTMLTextAreaElement} ta
 * @param {Function} [onPreview]  — called when the Preview button is clicked
 * @returns {HTMLElement}
 */
function buildToolbar(ta, onPreview) {
  const toolbar = document.createElement('div');
  toolbar.className = 'sticky-note__toolbar';

  const buttons = [
    { label: 'B',    title: 'Bold',        fn: () => wrapSelection(ta, '**', '**', 'bold text')  },
    { label: 'I',    title: 'Italic',      fn: () => wrapSelection(ta, '*',  '*',  'italic text') },
    { label: '`',    title: 'Inline code', fn: () => wrapSelection(ta, '`',  '`',  'code')        },
    { label: '🔗',   title: 'Link',        fn: () => wrapLink(ta)                                 },
    { label: '</>',  title: 'Code block',  fn: () => wrapSelection(ta, '```\n', '\n```', 'code here') },
  ];

  for (const { label, title, fn } of buttons) {
    const btn = document.createElement('button');
    btn.className = 'sticky-note__toolbar-btn';
    btn.textContent = label;
    btn.title = title;
    btn.setAttribute('aria-label', title);
    btn.type = 'button';
    btn.addEventListener('mousedown', (e) => {
      // Prevent the textarea from losing focus on button click
      e.preventDefault();
      fn();
    });
    toolbar.appendChild(btn);
  }

  // ── Preview button (right-aligned) ────────────────────────────────────
  if (onPreview) {
    const sep = document.createElement('span');
    sep.className = 'sticky-note__toolbar-sep';
    toolbar.appendChild(sep);

    const previewBtn = document.createElement('button');
    previewBtn.className = 'sticky-note__toolbar-btn sticky-note__toolbar-btn--preview';
    previewBtn.textContent = '👁 Preview';
    previewBtn.title = 'Preview rendered markdown';
    previewBtn.setAttribute('aria-label', 'Preview');
    previewBtn.type = 'button';
    previewBtn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      onPreview();
    });
    toolbar.appendChild(previewBtn);
  }

  return toolbar;
}

// ─── Note overlay ─────────────────────────────────────────────────────────────

/**
 * Build and return a sticky-note overlay element for the given cluster.
 * When the cluster has multiple notes a disambiguation nav is shown.
 *
 * @param {StickyNote[]} cluster  — one or more notes at the same anchor area
 * @param {string}       chatId
 * @param {object}       storage
 * @param {Function}     onDelete — called with () to trigger a full re-render
 * @returns {HTMLElement}
 */
export function buildNoteOverlay(cluster, chatId, storage, onDelete, renderFn, onUpdate) {
  const _render = renderFn || plainTextRender;
  let activeIdx       = 0;
  let lastRenderedIdx = -1;   // tracks which note index was last rendered
  let isPreview       = Boolean(cluster[0].content); // hoisted; survives refresh()

  const overlay = document.createElement('div');
  overlay.className = 'sticky-note';
  overlay.dataset.clusterId = cluster[0].id;
  overlay.style.top = `${cluster[0].anchorPageY}px`;

  // If this cluster was previously dragged, restore the saved X position.
  // Otherwise leave 'right' to the CSS default (right-of-content rule).
  if (cluster[0].anchorPageX != null) {
    overlay.style.left  = `${cluster[0].anchorPageX}px`;
    overlay.style.right = 'auto';
  }

  // ── Drag-to-move ──────────────────────────────────────────────────────────
  /**
   * Attach pointer-capture drag to a header element.
   * Called at the end of every refresh() because the header is rebuilt then.
   * @param {HTMLElement} headerEl
   */
  function makeDraggable(headerEl) {
    headerEl.title = 'Drag to move';
    headerEl.addEventListener('pointerdown', (e) => {
      // Ignore clicks on interactive children (buttons, inputs)
      if (e.target.closest('button, input, textarea')) return;
      e.preventDefault();

      // Snapshot current page-coords position
      const rect      = overlay.getBoundingClientRect();
      const startLeft = rect.left + window.scrollX;
      const startTop  = rect.top  + window.scrollY;
      const startX    = e.clientX;
      const startY    = e.clientY;

      // Switch from CSS `right` to explicit `left` so we can position freely
      overlay.style.left  = `${startLeft}px`;
      overlay.style.right = 'auto';
      overlay.style.top   = `${startTop}px`;
      overlay.classList.add('sticky-note--dragging');

      headerEl.setPointerCapture(e.pointerId);

      function onMove(ev) {
        overlay.style.left = `${startLeft + (ev.clientX - startX)}px`;
        overlay.style.top  = `${startTop  + (ev.clientY - startY)}px`;
      }

      async function onUp(ev) {
        headerEl.releasePointerCapture(ev.pointerId);
        headerEl.removeEventListener('pointermove', onMove);
        headerEl.removeEventListener('pointerup',   onUp);
        overlay.classList.remove('sticky-note--dragging');

        const newLeft = parseFloat(overlay.style.left);
        const newTop  = parseFloat(overlay.style.top);

        // Clamp horizontally so the note stays within the page
        const maxLeft     = Math.max(0, document.body.offsetWidth - overlay.offsetWidth - 8);
        const clampedLeft = Math.max(8, Math.min(newLeft, maxLeft));
        overlay.style.left = `${clampedLeft}px`;

        // Persist new position for every note in this cluster
        for (const note of cluster) {
          note.anchorPageY = newTop;
          note.anchorPageX = clampedLeft;
          await updateStickyNote(chatId, note.id,
            { anchorPageY: newTop, anchorPageX: clampedLeft }, storage);
        }
      }

      headerEl.addEventListener('pointermove', onMove);
      headerEl.addEventListener('pointerup',   onUp);
    });
  }

  function refresh() {
    overlay.innerHTML = '';
    const note = cluster[activeIdx];

    // Reset preview/edit mode only when navigating to a different note
    if (activeIdx !== lastRenderedIdx) {
      isPreview       = Boolean(note.content);
      lastRenderedIdx = activeIdx;
    }

    // ── Header bar ────────────────────────────────────────────────────────
    const header = document.createElement('div');
    header.className = 'sticky-note__header';

    // Multi-note disambiguation nav
    if (cluster.length > 1) {
      const nav = document.createElement('span');
      nav.className = 'sticky-note__nav';

      const prevBtn = document.createElement('button');
      prevBtn.className = 'sticky-note__nav-btn';
      prevBtn.setAttribute('aria-label', 'Previous note');
      prevBtn.textContent = '◀';
      prevBtn.addEventListener('click', () => {
        activeIdx = (activeIdx - 1 + cluster.length) % cluster.length;
        refresh();
      });

      const label = document.createElement('span');
      label.className = 'sticky-note__nav-label';
      label.textContent = `${activeIdx + 1} / ${cluster.length}`;

      const nextBtn = document.createElement('button');
      nextBtn.className = 'sticky-note__nav-btn';
      nextBtn.setAttribute('aria-label', 'Next note');
      nextBtn.textContent = '▶';
      nextBtn.addEventListener('click', () => {
        activeIdx = (activeIdx + 1) % cluster.length;
        refresh();
      });

      nav.appendChild(prevBtn);
      nav.appendChild(label);
      nav.appendChild(nextBtn);
      header.appendChild(nav);
    }

    // Timestamp
    const ts = document.createElement('span');
    ts.className = 'sticky-note__ts';
    ts.title = `Created: ${fmtTs(note.createdAt)}`;
    ts.textContent = fmtTs(note.updatedAt || note.createdAt);
    header.appendChild(ts);

    // Edit / Preview toggle
    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'sticky-note__mode-btn';
    toggleBtn.setAttribute('aria-label', 'Toggle edit/preview');
    toggleBtn.textContent = isPreview ? '✎' : '👁';
    header.appendChild(toggleBtn);

    // Delete button
    const delBtn = document.createElement('button');
    delBtn.className = 'sticky-note__del-btn';
    delBtn.setAttribute('aria-label', 'Delete this sticky note');
    delBtn.textContent = '✕';
    delBtn.addEventListener('click', async () => {
      if (!window.confirm('Delete this sticky note?')) return;
      cluster.splice(activeIdx, 1);
      await deleteStickyNote(chatId, note.id, storage);
      if (cluster.length === 0) {
        overlay.remove();
      } else {
        activeIdx = Math.min(activeIdx, cluster.length - 1);
        refresh();
      }
      onDelete?.();
    });
    header.appendChild(delBtn);

    overlay.appendChild(header);

    // ── Body ──────────────────────────────────────────────────────────────
    const body = document.createElement('div');
    body.className = 'sticky-note__body';

    if (isPreview) {
      const preview = document.createElement('div');
      preview.className = 'sticky-note__preview';
      preview.innerHTML = note.content
        ? _render(note.content)
        : '<em class="sticky-note__empty">Empty note — click ✎ to edit.</em>';
      body.appendChild(preview);
    } else {
      const ta = document.createElement('textarea');
      ta.className = 'sticky-note__textarea';
      ta.placeholder = 'Write your note here… (Markdown supported)';
      ta.value = note.content || '';
      ta.rows = 5;

      // Auto-save on every keystroke
      ta.addEventListener('input', async () => {
        note.content = ta.value;
        note.updatedAt = Date.now();
        ts.textContent = fmtTs(note.updatedAt);
        await updateStickyNote(chatId, note.id, { content: ta.value }, storage);
        onUpdate?.();
      });

      body.appendChild(buildToolbar(ta, () => { isPreview = true; refresh(); }));
      body.appendChild(ta);
      // Auto-focus the textarea for new / edit mode
      requestAnimationFrame(() => ta.focus());
    }

    overlay.appendChild(body);

    // ── Toggle handler (wired after body is in DOM) ────────────────────
    toggleBtn.addEventListener('click', () => {
      isPreview = !isPreview;
      refresh();
    });

    // ── Drag handle (re-wired every refresh because header is rebuilt) ──
    makeDraggable(header);
  }

  refresh();
  return overlay;
}

// ─── Custom context menu ──────────────────────────────────────────────────────

/**
 * Build and inject a custom context-menu element (hidden by default).
 * Returns the element for further wiring.
 * @returns {HTMLElement}
 */
function createContextMenu() {
  const existing = document.getElementById('sn-context-menu');
  if (existing) return existing;

  const menu = document.createElement('div');
  menu.id = 'sn-context-menu';
  menu.className = 'sn-context-menu';
  menu.hidden = true;
  menu.innerHTML = `
    <button class="sn-context-menu__item" id="sn-add-note-btn">
      📌 Add Sticky Note
    </button>
  `;
  document.body.appendChild(menu);
  return menu;
}

// ─── Main setup ───────────────────────────────────────────────────────────────

/**
 * Set up sticky notes for the reader page.
 * Safe no-op when required DOM elements are absent (e.g. unit tests without DOM).
 *
 * @param {string} chatId
 * @param {object} storage  — chrome.storage.local-like API
 */
export async function setupStickyNotes(chatId, storage, renderFn) {
  if (!chatId || !storage) return;

  const contentEl = document.getElementById('reader-content');
  const header    = document.getElementById('reader-header');
  if (!contentEl || !header) return;

  // ── Sticky-notes layer ────────────────────────────────────────────────────
  let layer = document.getElementById('sticky-notes-layer');
  if (!layer) {
    layer = document.createElement('div');
    layer.id = 'sticky-notes-layer';
    layer.className = 'sticky-notes-layer';
    document.body.appendChild(layer);
  }

  // ── Visibility toggle + hover-dropdown in header ──────────────────────────
  let wrapper   = document.getElementById('sticky-notes-toggle-wrapper');
  let toggleBtn = document.getElementById('sticky-notes-toggle');
  let dropdown  = document.getElementById('sticky-notes-dropdown');
  if (!wrapper) {
    wrapper = document.createElement('div');
    wrapper.id = 'sticky-notes-toggle-wrapper';
    wrapper.className = 'sticky-notes-toggle-wrapper';

    toggleBtn = document.createElement('button');
    toggleBtn.id = 'sticky-notes-toggle';
    toggleBtn.className = 'sticky-notes-toggle';
    toggleBtn.setAttribute('aria-label', 'Show/hide sticky notes');

    dropdown = document.createElement('div');
    dropdown.id = 'sticky-notes-dropdown';
    dropdown.className = 'sticky-notes-dropdown';
    dropdown.setAttribute('role', 'menu');
    dropdown.hidden = true;

    wrapper.appendChild(toggleBtn);
    wrapper.appendChild(dropdown);

    const metaRow = header.querySelector('.reader-header__meta');
    if (metaRow) metaRow.appendChild(wrapper);
    else header.querySelector('.reader-header__inner')?.appendChild(wrapper);
  }

  // ── Load initial state ───────────────────────────────────────────────────
  let [notes, visible] = await Promise.all([
    loadStickyNotes(chatId, storage),
    loadNotesVisible(chatId, storage),
  ]);

  // ── Helper: reload notes from storage then re-render (used by onDelete) ──
  async function reloadAndRender() {
    notes = await loadStickyNotes(chatId, storage);
    renderLayer();
  }

  // ── Helper: re-render all overlays ───────────────────────────────────────
  function renderLayer() {
    layer.innerHTML = '';
    const clusters = clusterNotes(notes);
    for (const cluster of clusters) {
      const overlay = buildNoteOverlay(cluster, chatId, storage, reloadAndRender, renderFn, renderDropdown);
      layer.appendChild(overlay);
    }
    // Update toggle button label and visibility
    const count = notes.length;
    toggleBtn.hidden = count === 0;
    toggleBtn.textContent = `📌 ${count} ${count === 1 ? 'note' : 'notes'}`;
    renderDropdown();
  }

  // ── Helper: populate the hover dropdown ──────────────────────────────────
  function renderDropdown() {
    dropdown.innerHTML = '';
    if (!notes.length) return;
    const sorted = [...notes].sort((a, b) => a.anchorPageY - b.anchorPageY);
    for (const note of sorted) {
      const item = document.createElement('button');
      item.className = 'sticky-notes-dropdown__item';
      item.setAttribute('role', 'menuitem');
      item.type = 'button';

      const tsEl = document.createElement('span');
      tsEl.className = 'sticky-notes-dropdown__ts';
      tsEl.textContent = fmtTs(note.updatedAt || note.createdAt);

      const raw = note.content
        ? note.content.replace(/\s+/g, ' ').trim()
        : '';
      const preview = raw.length > 60 ? raw.slice(0, 60) + '\u2026' : (raw || '(empty note)');
      const previewEl = document.createElement('span');
      previewEl.className = 'sticky-notes-dropdown__preview';
      previewEl.textContent = preview;

      item.appendChild(tsEl);
      item.appendChild(previewEl);
      item.addEventListener('click', () => {
        dropdown.hidden = true;
        // Ensure notes are visible before scrolling
        if (!visible) {
          visible = true;
          applyVisibility();
          saveNotesVisible(chatId, visible, storage);
        }
        // Scroll to anchor — offset by ~80 px to clear the sticky header
        window.scrollTo({ top: Math.max(0, note.anchorPageY - 80), behavior: 'smooth' });
      });
      dropdown.appendChild(item);
    }
  }

  // ── Apply visibility ─────────────────────────────────────────────────────
  function applyVisibility() {
    layer.hidden = !visible;
    toggleBtn.classList.toggle('sticky-notes-toggle--active', visible);
    toggleBtn.title = `${visible ? 'Hide' : 'Show'} sticky notes (${notes.length})`;
  }

  renderLayer();
  applyVisibility();

  // ── Toggle button handler ────────────────────────────────────────────────
  toggleBtn.addEventListener('click', async () => {
    dropdown.hidden = true;  // dismiss dropdown on deliberate toggle click
    visible = !visible;
    applyVisibility();
    await saveNotesVisible(chatId, visible, storage);
  });

  // ── Dropdown hover wiring ─────────────────────────────────────────────────
  let _dropdownHideTimer = null;

  function _showDropdown() {
    if (!notes.length) return;
    clearTimeout(_dropdownHideTimer);
    dropdown.hidden = false;
  }

  function _scheduleHide() {
    _dropdownHideTimer = setTimeout(() => { dropdown.hidden = true; }, 150);
  }

  toggleBtn.addEventListener('mouseenter', _showDropdown);
  toggleBtn.addEventListener('mouseleave', _scheduleHide);
  dropdown.addEventListener('mouseenter', () => clearTimeout(_dropdownHideTimer));
  dropdown.addEventListener('mouseleave', _scheduleHide);

  // ── Custom context menu ──────────────────────────────────────────────────
  const ctxMenu  = createContextMenu();
  const addBtn   = document.getElementById('sn-add-note-btn');
  let pendingY   = 0;

  document.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    pendingY = e.pageY;

    ctxMenu.style.top  = `${e.clientY + window.scrollY}px`;
    ctxMenu.style.left = `${e.clientX}px`;
    ctxMenu.hidden     = false;
  });

  // Dismiss context menu on outside click
  document.addEventListener('click', (e) => {
    if (!ctxMenu.contains(e.target)) {
      ctxMenu.hidden = true;
    }
  });

  // ── Add note action ──────────────────────────────────────────────────────
  addBtn?.addEventListener('click', async () => {
    ctxMenu.hidden = true;

    const newNote = {
      anchorPageY: pendingY,
      content:     '',
    };

    // Make visible if currently hidden
    if (!visible) {
      visible = true;
      applyVisibility();
      await saveNotesVisible(chatId, true, storage);
    }

    const updatedList = await saveStickyNote(chatId, newNote, storage);
    notes = updatedList;
    renderLayer();
  });
}
