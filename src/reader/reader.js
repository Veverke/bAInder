/**
 * bAInder Reader — reader.js
 *
 * Loads a saved chat from chrome.storage.local and renders it in the reader page.
 * Pure functions are exported so they can be unit tested independently.
 */

import { parseFrontmatter } from '../lib/markdown-serialiser.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

  header.hidden = false;

  // ── Content ──────────────────────────────────────────────────────────────
  const contentEl = document.getElementById('reader-content');

  contentEl.innerHTML = renderMarkdown(content);
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
