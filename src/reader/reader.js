/**
 * bAInder Reader — reader.js
 *
 * Loads a saved chat from chrome.storage.local and renders it in the reader page.
 * Pure functions are exported so they can be unit tested independently.
 */

import { parseFrontmatter } from '../lib/markdown-serialiser.js';
import {
  loadAnnotations, saveAnnotation, deleteAnnotation,
  serializeRange,  applyAnnotations,
} from '../lib/annotations.js';
import { setupStickyNotes } from '../lib/sticky-notes-ui.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Count words in raw markdown text (strips frontmatter and code blocks).
 * @param {string} text
 * @returns {number}
 */
export function countWords(text) {
  if (!text) return 0;
  const stripped = text
    .replace(/^---[\s\S]*?---\n/, '')          // frontmatter
    .replace(/```[\s\S]*?```/g, '')            // fenced code blocks
    .replace(/`[^`]+`/g, '')                  // inline code
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')     // images
    .replace(/\[[^\]]*\]\([^)]*\)/g, '')      // links
    .replace(/[#*_~>|\-]/g, '')               // markdown symbols
    .trim();
  if (!stripped) return 0;
  return stripped.split(/\s+/).filter(w => w.length > 0).length;
}

/**
 * Estimate reading time in minutes at 200 wpm (minimum 1 min).
 * @param {number} wordCount
 * @returns {number}
 */
export function estimateReadTime(wordCount) {
  return Math.max(1, Math.round(wordCount / 200));
}

/**
 * Format an ISO date string to a human-readable locale string.
 * @param {string} isoStr
 * @returns {string}
 */
export function formatDate(isoStr) {
  if (!isoStr) return '';
  try {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return isoStr;
    return d.toLocaleString(undefined, {
      year:  'numeric', month: 'short', day: 'numeric',
      hour:  '2-digit', minute: '2-digit'
    });
  } catch (_) {
    return isoStr;
  }
}

/**
 * Escape a string for safe insertion as HTML text content.
 * @param {string} str
 * @returns {string}
 */
export function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Map a source string to a display label.
 * @param {string} source
 * @param {boolean} [isExcerpt]
 * @returns {string}
 */
export function sourceLabel(source, isExcerpt) {
  if (isExcerpt) return 'Excerpt';
  const map = {
    chatgpt: 'ChatGPT',
    claude:  'Claude',
    gemini:  'Gemini',
    copilot: 'Copilot',
  };
  return map[source] || source || 'Unknown';
}

/**
 * Return the CSS badge class for a source string.
 * @param {string} source
 * @param {boolean} [isExcerpt]
 * @returns {string}
 */
export function badgeClass(source, isExcerpt) {
  if (isExcerpt) return 'badge badge--excerpt';
  const known = ['chatgpt', 'claude', 'gemini', 'copilot'];
  return known.includes(source) ? `badge badge--${source}` : 'badge badge--unknown';
}

// ─── Markdown Renderer ────────────────────────────────────────────────────────

/**
 * Apply inline markdown formatting to a text segment.
 * Handles: **bold**, *italic*, _italic_, `inline code`, ![alt](src) images.
 * Input text must already be HTML-escaped.
 * @param {string} escaped  HTML-escaped text
 * @returns {string}  HTML with inline elements applied
 */
export function applyInline(escaped) {
  // Protect inline code spans first (use null-byte placeholders so bold/italic
  // regexes cannot accidentally match content inside backtick spans)
  const codeMap = [];
  let s = escaped.replace(/`([^`]+)`/g, (_, code) => {
    codeMap.push(`<code>${code}</code>`);
    return `\x00${codeMap.length - 1}\x00`;
  });

  // Inline images ![alt](src) — must come before link handling
  s = s.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, src) => {
    // src has already been through escapeHtml so & is already &amp; — keep it
    return `<img class="chat-image" src="${src}" alt="${alt}" loading="lazy">`;
  });

  // Inline links [text](url)
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, text, href) => {
    // href has already been through escapeHtml so & is already &amp; — keep it
    return `<a href="${href}" target="_blank" rel="noopener noreferrer">${text}</a>`;
  });

  // Bold **text** and italic *text* / _text_
  s = s
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/(?<!\w)_([^_]+)_(?!\w)/g, '<em>$1</em>');

  // Restore code spans
  return s.replace(/\x00(\d+)\x00/g, (_, i) => codeMap[parseInt(i, 10)]);
}

/**
 * Convert a markdown string (as produced by messagesToMarkdown) to an HTML string.
 *
 * Supports:
 *   - YAML frontmatter (stripped silently)
 *   - ATX headings: # h1  ## h2  ### h3
 *   - Horizontal rules: --- (on its own line)
 *   - Fenced code blocks: ```[lang]\n...\n```
 *   - Blockquotes: > text
 *   - Unordered lists: - item  or * item
 *   - Ordered lists: 1. item
 *   - Blank-line separated paragraphs
 *   - Inline: **bold**, *italic*, `code`
 *
 * @param {string} markdown
 * @returns {string}  HTML string
 */
export function renderMarkdown(markdown) {
  if (!markdown || typeof markdown !== 'string') return '';

  // Strip YAML frontmatter
  let text = markdown;
  if (text.startsWith('---')) {
    const end = text.indexOf('\n---', 3);
    if (end !== -1) {
      text = text.slice(end + 4); // skip past the closing ---\n
    }
  }

  const lines      = text.split('\n');
  const htmlParts  = [];
  let i = 0;

  /** Flush a paragraph buffer as a <p> element. */
  function flushPara(buf) {
    const trimmed = buf.trim();
    if (!trimmed) return;
    htmlParts.push(`<p>${applyInline(escapeHtml(trimmed))}</p>`);
  }

  let paraBuf     = '';
  let inList      = null;   // 'ul' | 'ol' | null
  let listBuf     = [];

  function flushList() {
    if (!inList) return;
    const items = listBuf.map(t => `<li>${applyInline(escapeHtml(t))}</li>`).join('');
    htmlParts.push(`<${inList}>${items}</${inList}>`);
    inList   = null;
    listBuf  = [];
  }

  while (i < lines.length) {
    const raw  = lines[i];
    const line = raw; // keep original for whitespace checks
    // ── Microsoft Designer generated-image card ──────────────────────────
    {
      const designerMatch = line.match(/^\[Microsoft Designer generated image\]\(([^)]+)\)$/);
      if (designerMatch) {
        flushPara(paraBuf); paraBuf = '';
        flushList();
        const designerSrc    = designerMatch[1];
        const designerSrcEsc = designerSrc.replace(/&/g, '&amp;');
        htmlParts.push(
          `<div class="designer-card">` +
            `<div class="designer-card__icon">🎨</div>` +
            `<div class="designer-card__body">` +
              `<div class="designer-card__title">AI Generated Image</div>` +
              `<div class="designer-card__note">Session-bound · embedded preview unavailable</div>` +
            `</div>` +
            `<a class="designer-card__link" href="${designerSrcEsc}" target="_blank" rel="noopener noreferrer">` +
              `Open in Designer &#8599;` +
            `</a>` +
          `</div>`
        );
        i++;
        continue;
      }
    }
    // ── Standalone image line  ![alt](src) ─────────────────────────────
    if (/^!\[/.test(line)) {
      flushPara(paraBuf); paraBuf = '';
      flushList();
      // applyInline handles the ![alt](src) → <img> conversion
      htmlParts.push(`<p>${applyInline(escapeHtml(line))}</p>`);
      i++;
      continue;
    }
    // ── Fenced code block ──────────────────────────────────────────
    if (/^```/.test(line)) {
      flushPara(paraBuf); paraBuf = '';
      flushList();
      const lang  = line.slice(3).trim();
      const codeLines = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) {
        codeLines.push(lines[i]);
        i++;
      }
      // i now points at closing ``` (or past end)
      const codeText = codeLines.join('\n');
      const codeHtml = escapeHtml(codeText);
      const langAttr  = lang ? ` class="language-${escapeHtml(lang)}"` : '';
      const langLabel = lang
        ? `<span class="code-block__lang">${escapeHtml(lang)}</span>`
        : `<span class="code-block__lang"></span>`;
      htmlParts.push(
        `<div class="code-block">` +
          `<div class="code-block__header">` +
            langLabel +
            `<button class="code-block__copy" aria-label="Copy code">` +
              `<svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M7.09 3c.2-.58.76-1 1.41-1h3c.65 0 1.2.42 1.41 1h1.59c.83 0 1.5.67 1.5 1.5v12c0 .83-.67 1.5-1.5 1.5h-9A1.5 1.5 0 0 1 4 16.5v-12C4 3.67 4.67 3 5.5 3h1.59ZM8.5 3a.5.5 0 0 0 0 1h3a.5.5 0 0 0 0-1h-3Z"/></svg>` +
              `<span class="code-block__copy-label">Copy</span>` +
            `</button>` +
          `</div>` +
          `<pre class="code-block__pre"><code${langAttr}>${codeHtml}</code></pre>` +
        `</div>`
      );
      i++;
      continue;
    }

    // ── Heading ────────────────────────────────────────────────────────────
    const headingMatch = line.match(/^(#{1,3})\s+(.*)/);
    if (headingMatch) {
      flushPara(paraBuf); paraBuf = '';
      flushList();
      const level = headingMatch[1].length;
      const text2 = applyInline(escapeHtml(headingMatch[2]));
      htmlParts.push(`<h${level}>${text2}</h${level}>`);
      i++;
      continue;
    }

    // ── Horizontal rule ────────────────────────────────────────────────────
    if (/^-{3,}\s*$/.test(line)) {
      flushPara(paraBuf); paraBuf = '';
      flushList();
      htmlParts.push('<hr>');
      i++;
      continue;
    }

    // ── Blockquote ─────────────────────────────────────────────────────────
    if (/^>\s?/.test(line)) {
      flushPara(paraBuf); paraBuf = '';
      flushList();
      const bqText = line.replace(/^>\s?/, '');
      htmlParts.push(`<blockquote><p>${applyInline(escapeHtml(bqText))}</p></blockquote>`);
      i++;
      continue;
    }

    // ── Unordered list item ────────────────────────────────────────────────
    const ulMatch = line.match(/^[-*]\s+(.*)/);
    if (ulMatch) {
      flushPara(paraBuf); paraBuf = '';
      if (inList !== 'ul') { flushList(); inList = 'ul'; }
      listBuf.push(ulMatch[1]);
      i++;
      continue;
    }

    // ── Ordered list item ──────────────────────────────────────────────────
    const olMatch = line.match(/^\d+\.\s+(.*)/);
    if (olMatch) {
      flushPara(paraBuf); paraBuf = '';
      if (inList !== 'ol') { flushList(); inList = 'ol'; }
      listBuf.push(olMatch[1]);
      i++;
      continue;
    }

    // ── Blank line — paragraph break ───────────────────────────────────────
    if (line.trim() === '') {
      flushList();
      if (paraBuf.trim()) {
        flushPara(paraBuf);
        paraBuf = '';
      }
      i++;
      continue;
    }

    // ── Regular text — accumulate into paragraph ───────────────────────────
    flushList();
    paraBuf += (paraBuf ? ' ' : '') + line;
    i++;
  }

  flushPara(paraBuf);
  flushList();

  return htmlParts.join('\n');
}

// ─── Post-render DOM processing ───────────────────────────────────────────────

/**
 * Walk the flat rendered-markdown children of `contentEl` and group them into
 * role-aware `.chat-turn--user` / `.chat-turn--assistant` wrapper divs.
 *
 * The reader's markdown format produces a flat sequence of:
 *   <h3>User</h3>, <p>…</p>, <hr>, <h3>Assistant</h3>, <p>…</p>, <hr>, …
 *
 * This function turns that into:
 *   <div class="chat-turn chat-turn--user">…</div>
 *   <div class="chat-turn chat-turn--assistant">…</div>
 *
 * If no recognised role headings are found the DOM is left unchanged.
 * @param {Element} contentEl
 */
export function wrapChatTurns(contentEl) {
  const USER_ROLES      = new Set(['user', 'you', 'human']);
  const ASSISTANT_ROLES = new Set(['assistant', 'chatgpt', 'claude', 'gemini', 'copilot']);

  // Quick guard: skip if no role h3s present (e.g. plain excerpts)
  const hasRoles = Array.from(contentEl.querySelectorAll('h3')).some(h => {
    const t = h.textContent.trim().toLowerCase();
    return USER_ROLES.has(t) || ASSISTANT_ROLES.has(t);
  });
  if (!hasRoles) return;

  // Collect top-level child nodes, splitting at <hr> boundaries
  const groups = [];
  let current = [];
  for (const node of Array.from(contentEl.childNodes)) {
    if (node.nodeName === 'HR') {
      if (current.length) groups.push(current);
      current = [];
    } else {
      current.push(node);
    }
  }
  if (current.length) groups.push(current);

  contentEl.innerHTML = '';

  for (const group of groups) {
    // Drop whitespace-only text nodes
    const nodes = group.filter(
      n => !(n.nodeType === 3 /* TEXT_NODE */ && n.textContent.trim() === '')
    );
    if (!nodes.length) continue;

    const first = nodes[0];
    if (first.nodeType === 1 /* ELEMENT_NODE */ && first.tagName === 'H3') {
      const roleKey = first.textContent.trim().toLowerCase();
      const isUser      = USER_ROLES.has(roleKey);
      const isAssistant = ASSISTANT_ROLES.has(roleKey);

      if (isUser || isAssistant) {
        const turn = document.createElement('div');
        turn.className = `chat-turn ${isUser ? 'chat-turn--user' : 'chat-turn--assistant'}`;

        const roleDiv = document.createElement('div');
        roleDiv.className = 'chat-turn__role';
        roleDiv.textContent = first.textContent.trim();

        const bodyDiv = document.createElement('div');
        bodyDiv.className = 'chat-turn__body';
        for (const n of nodes.slice(1)) bodyDiv.appendChild(n);

        turn.appendChild(roleDiv);
        turn.appendChild(bodyDiv);
        contentEl.appendChild(turn);
        continue;
      }
    }

    // Non-role group — append nodes directly (preserves leading meta content)
    for (const n of nodes) contentEl.appendChild(n);
  }
}

/**
 * Set up the text-selection annotation toolbar (R2).
 * Safe no-op when annotation elements are absent (e.g. unit tests).
 * @param {string} chatId
 * @param {object} storage  — chrome.storage.local-like API
 */
export async function setupAnnotations(chatId, storage) {
  if (!chatId || !storage) return;
  const toolbar   = document.getElementById('annotation-toolbar');
  const contentEl = document.getElementById('reader-content');
  if (!toolbar || !contentEl) return;

  let selectedColor = '#fef08a';
  let pendingRange  = null;

  // ── Re-apply stored annotations ──────────────────────────────────────────
  try {
    const existing = await loadAnnotations(chatId, storage);
    applyAnnotations(contentEl, existing);
  } catch (_) {}

  // ── Colour swatch selection ───────────────────────────────────────────────
  toolbar.querySelectorAll('.ann-color-btn').forEach(btn => {
    if (btn.dataset.color === selectedColor) btn.classList.add('selected');
    btn.addEventListener('click', () => {
      toolbar.querySelectorAll('.ann-color-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      selectedColor = btn.dataset.color;
    });
  });

  // ── Show toolbar on text selection ───────────────────────────────────────
  document.addEventListener('mouseup', (e) => {
    // Clicks inside the toolbar should not dismiss it
    if (toolbar.contains(e.target)) return;

    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) {
      toolbar.hidden = true;
      pendingRange   = null;
      return;
    }
    const range = sel.getRangeAt(0);
    if (!contentEl.contains(range.commonAncestorContainer)) {
      toolbar.hidden = true;
      return;
    }
    const serialized = serializeRange(range, contentEl);
    if (!serialized) return;

    pendingRange = serialized;

    // Position toolbar below the selection
    const rect        = range.getBoundingClientRect();
    toolbar.style.top  = `${rect.bottom + window.scrollY + 8}px`;
    toolbar.style.left = `${Math.max(8, rect.left  + window.scrollX)}px`;
    toolbar.hidden     = false;
  });

  // ── Cancel button ─────────────────────────────────────────────────────────
  const cancelBtn = document.getElementById('annotation-cancel');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      toolbar.hidden = true;
      pendingRange   = null;
      window.getSelection()?.removeAllRanges();
    });
  }

  // ── Save / highlight button ───────────────────────────────────────────────
  const saveBtn   = document.getElementById('annotation-save');
  const noteInput = document.getElementById('annotation-note');
  if (saveBtn) {
    saveBtn.addEventListener('click', async () => {
      if (!pendingRange) return;
      const ann = {
        id:    `ann-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        ...pendingRange,
        color: selectedColor,
        note:  noteInput?.value.trim() || '',
      };
      try {
        await saveAnnotation(chatId, ann, storage);
        applyAnnotations(contentEl, [ann]);
      } catch (_) {}
      toolbar.hidden = true;
      pendingRange   = null;
      window.getSelection()?.removeAllRanges();
      if (noteInput) noteInput.value = '';
    });
  }

  // ── Click existing annotation to delete ──────────────────────────────────
  contentEl.addEventListener('click', async (e) => {
    const mark  = e.target.closest('.annotation-highlight');
    if (!mark) return;
    const annId = mark.dataset.annotationId;
    if (!annId) return;

    /* c8 ignore next */
    if (!window.confirm('Delete this annotation?')) return;

    try { await deleteAnnotation(chatId, annId, storage); } catch (_) {}
    // Unwrap: replace <mark> with its children
    const parent = mark.parentNode;
    while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
    parent.removeChild(mark);
  });
}

/**
 * Wire up the scroll-progress bar and jump-to-top button.
 * Safe to call in environments where the elements don't exist (tests).
 */
export function setupScrollFeatures() {
  const progressEl = document.getElementById('scroll-progress');
  const jumpBtn    = document.getElementById('jump-top');
  if (!progressEl && !jumpBtn) return;

  function onScroll() {
    const scrollTop  = window.scrollY || document.documentElement.scrollTop;
    const docHeight  = document.documentElement.scrollHeight - document.documentElement.clientHeight;

    if (progressEl && docHeight > 0) {
      progressEl.style.width = `${(scrollTop / docHeight) * 100}%`;
    }
    if (jumpBtn) {
      jumpBtn.classList.toggle('jump-top--visible', scrollTop > 300);
    }
  }

  window.addEventListener('scroll', onScroll, { passive: true });

  if (jumpBtn) {
    jumpBtn.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }
}

// ─── Page initialisation ──────────────────────────────────────────────────────

/**
 * Show the error state.
 * @param {string} message
 */
export function showError(message) {
  const el = document.getElementById('state-error');
  el.hidden = false;
  document.getElementById('error-message').textContent = message;
}

/**
 * Render a loaded chat object into the page.
 * Pure-ish (operates on document) — exported for testing with a DOM.
 * @param {Object} chat
 */
export function renderChat(chat) {
  const content = chat.content || '';
  const meta    = chat.metadata || {};
  const fm      = parseFrontmatter(content);

  // ── Header ────────────────────────────────────────────────────────────────
  const isExcerpt = Boolean(meta.isExcerpt || fm.excerpt);
  const source    = fm.source || chat.source || 'unknown';
  const title     = fm.title  || chat.title  || 'Untitled Chat';
  const date      = fm.date   || (chat.timestamp ? new Date(chat.timestamp).toISOString() : '');
  const count     = typeof fm.messageCount === 'number' ? fm.messageCount : (chat.messageCount || 0);

  document.title = `${title} — bAInder`;

  const srcEl    = document.getElementById('meta-source');
  const dateEl   = document.getElementById('meta-date');
  const countEl  = document.getElementById('meta-count');
  const titleEl  = document.getElementById('reader-title');
  const header   = document.getElementById('reader-header');

  srcEl.className   = badgeClass(source, isExcerpt);
  srcEl.textContent = sourceLabel(source, isExcerpt);
  dateEl.textContent  = date ? formatDate(date) : '';
  countEl.textContent = count > 0 ? `${count} messages` : '';
  titleEl.textContent = title;

  // ── Reading time (R3) ──────────────────────────────────────────────────────
  const readTimeEl = document.getElementById('meta-reading-time');
  if (readTimeEl) {
    const words = countWords(content);
    const mins  = estimateReadTime(words);
    readTimeEl.textContent = `${mins} min read`;
    readTimeEl.hidden = false;
  }

  // ── Per-source body tint (T3) ──────────────────────────────────────────────
  const knownSources = ['chatgpt', 'claude', 'gemini', 'copilot'];
  if (knownSources.includes(source)) {
    document.body.setAttribute('data-source', source);
  }

  header.hidden = false;

  // ── Content ──────────────────────────────────────────────────────────────
  const contentEl = document.getElementById('reader-content');

  contentEl.innerHTML = renderMarkdown(content);
  wrapChatTurns(contentEl);
  contentEl.hidden = false;

  // ── Copy-code button wiring ─────────────────────────────────────────
  // Use event delegation on the content container so no per-button listeners.
  contentEl.addEventListener('click', (e) => {
    const btn = e.target.closest('.code-block__copy');
    if (!btn) return;
    // Read raw text from the <code> element — textContent auto-decodes HTML entities.
    const code = btn.closest('.code-block')?.querySelector('.code-block__pre code')?.textContent || '';
    const label = btn.querySelector('.code-block__copy-label');
    navigator.clipboard.writeText(code).then(() => {
      btn.classList.add('code-block__copy--copied');
      if (label) label.textContent = 'Copied!';
      setTimeout(() => {
        btn.classList.remove('code-block__copy--copied');
        if (label) label.textContent = 'Copy';
      }, 2000);
    }).catch(() => {});
  });
}

/**
 * Main entry point — reads chatId from URL, loads from storage, renders.
 * @param {Object} storage  Object with a `.get(keys)` method — injectable for testing
 */
export async function init(storage) {
  try {
    const params  = new URLSearchParams(window.location.search);
    const chatId  = params.get('chatId');

    if (!chatId) {
      showError('No chatId specified in the URL.');
      return;
    }

    const result = await storage.get(['chats']);
    const chats = result.chats || [];
    const chat = chats.find(c => c.id === chatId) || null;

    if (!chat) {
      showError(`Conversation not found (id: ${chatId}). It may have been deleted.`);
      return;
    }

    renderChat(chat);
    setupScrollFeatures();
    setupAnnotations(chatId, storage);
    setupStickyNotes(chatId, storage, renderMarkdown);
  } catch (err) {
    showError(`Failed to load conversation: ${err.message}`);
  }
}

// ── Auto-run when loaded as a browser extension page ──────────────────────────
// Only run when the actual reader DOM (reader-content element) is present.
// This guard prevents accidental execution when reader.js is imported in tests.
/* c8 ignore next 3 */
if (typeof chrome !== 'undefined' && chrome.storage && document.getElementById('reader-content')) {
  init(chrome.storage.local);
}
