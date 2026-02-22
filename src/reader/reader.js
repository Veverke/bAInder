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
 * Handles: **bold**, *italic*, _italic_, `inline code`.
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

    // ── Fenced code block ──────────────────────────────────────────────────
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
      const codeHtml = escapeHtml(codeLines.join('\n'));
      const langAttr = lang ? ` class="language-${escapeHtml(lang)}"` : '';
      htmlParts.push(`<pre><code${langAttr}>${codeHtml}</code></pre>`);
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
    const chatsRaw = result.chats;
    // chats may be stored as an array (primary format) or object map (legacy)
    let chat = null;
    if (Array.isArray(chatsRaw)) {
      chat = chatsRaw.find(c => c.id === chatId) || null;
    } else if (chatsRaw && typeof chatsRaw === 'object') {
      chat = chatsRaw[chatId] || null;
    }

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
