/**
 * bAInder Reader \u2014 reader.js
 *
 * Loads a saved chat from browser.storage.local and renders it in the reader page.
 * Pure functions are exported so they can be unit tested independently.
 */

import { parseFrontmatter, messagesToMarkdown } from '../lib/io/markdown-serialiser.js';
import { ENTITY_TYPES } from '../lib/entities/chat-entity.js';
import {
  loadAnnotations, saveAnnotation, deleteAnnotation,
  serializeRange,  applyAnnotations, parseBacklinks,
} from '../lib/chat/annotations.js';
import { setupStickyNotes } from '../lib/sticky-notes/sticky-notes-ui.js';
import browser from '../lib/vendor/browser.js';
import { escapeHtml, generateId } from '../lib/utils/search-utils.js';
import { logger } from '../lib/utils/logger.js';
import { HOVER_OUT_DISMISS_MS } from '../lib/utils/constants.js';
import {
  getClipboardSettings,
  serialiseChats,
  writeToClipboard,
  writeToClipboardHtml,
  MAX_CLIPBOARD_CHARS,
} from '../lib/export/clipboard-serialiser.js';
export { escapeHtml };  // re-export: callers that import escapeHtml from reader.js continue to work

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
 * Map a source string to a display label.
 * @param {string} source
 * @param {boolean} [isExcerpt]
 * @returns {string}
 */
export function sourceLabel(source, isExcerpt) {
  if (isExcerpt) return 'Excerpt';
  const map = {
    chatgpt:    'ChatGPT',
    claude:     'Claude',
    gemini:     'Gemini',
    copilot:    'Copilot',
    perplexity: 'Perplexity',
    deepseek:   'DeepSeek',
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
  const known = ['chatgpt', 'claude', 'gemini', 'copilot', 'perplexity', 'deepseek'];
  return known.includes(source) ? `badge badge--${source}` : 'badge badge--unknown';
}

// ─── Markdown Renderer ────────────────────────────────────────────────────────

/**
 * Apply inline markdown formatting to a text segment.
 * Handles: **bold**, *italic*, _italic_, `inline code`, ![alt](src) images,
 *          [text](url) links, and bare https?:// URLs (auto-linked).
 * Input text must already be HTML-escaped.
 * @param {string} escaped  HTML-escaped text
 * @returns {string}  HTML with inline elements applied
 */
export function applyInline(escaped) {
  // ── Pass 1: protect inline code spans (\x00 placeholders) ──────────────
  // These must be shielded earliest so nothing inside backticks gets parsed.
  const codeMap = [];
  let s = escaped.replace(/`([^`]+)`/g, (_, code) => {
    codeMap.push(`<code>${code}</code>`);
    return `\x00${codeMap.length - 1}\x00`;
  });

  // ── Pass 2: protect images + explicit markdown links (\x01 placeholders) ─
  // Shielding them prevents the bare-URL pass from double-linking the href.
  const linkMap = [];
  const protect = html => { linkMap.push(html); return `\x01${linkMap.length - 1}\x01`; };

  // Inline images ![alt](src) \u2014 must come before link handling
  s = s.replace(/!\[([^\]]*)\]\(([^)]+)\)(\{[^}]*\})?/g, (_, alt, src, attrs) => {
    let extra = '';
    if (attrs) {
      const wm = attrs.match(/width=(\d+)/);
      if (wm) extra += ' style="width:' + wm[1] + 'px"';
    }
    return protect('<img class="chat-image" src="' + src + '" alt="' + alt + '" loading="lazy"' + extra + '>');
  });

  // Inline links [text](url)
  const SAFE_HREF = /^(https?:|mailto:|\/|#|[^:]*$)/i;
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, text, href) => {
    // Internal navigation: select a chat in the sidepanel tree
    if (href.startsWith('bainder://select-chat?id=')) {
      const chatId = href.slice('bainder://select-chat?id='.length);
      return protect(`<a href="#" class="source-chat-link" data-select-chat="${chatId}" title="Select this chat in the tree">${text}</a>`);
    }
    const safeHref = SAFE_HREF.test(href) ? href : '#';
    return protect(`<a href="${safeHref}" target="_blank" rel="noopener noreferrer">${text}</a>`);
  });

  // ── Pass 3: auto-link bare https?:// URLs ──────────────────────────────
  // All explicit links/images are placeholders here, so we can't accidentally
  // double-match inside an href="\u2026" attribute.
  s = s.replace(/https?:\/\/[^\s<>"\x01]+/g, (url) => {
    // Trim trailing punctuation chars that are almost certainly sentence
    // punctuation rather than part of the URL (e.g. "see https://foo.com.")
    const trimmed  = url.replace(/[.,;:!?)'"\]]+$/, '');
    const trailing = url.slice(trimmed.length);
    const display  = trimmed.replace(/&amp;/g, '&'); // human-readable display
    return protect(`<a href="${trimmed}" target="_blank" rel="noopener noreferrer">${display}</a>`) + trailing;
  });

  // ── Pass 4: bold / italic ─────────────────────────────────────────────
  s = s
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/(?<!\w)_([^_]+)_(?!\w)/g, '<em>$1</em>');

  // ── Restore placeholders (links first, then code) ─────────────────────
  s = s.replace(/\x01(\d+)\x01/g, (_, i) => linkMap[parseInt(i, 10)]);
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
 * @param {{ sourceUrl?: string }} [options]
 * @returns {string}  HTML string
 */
export function renderMarkdown(markdown, options = {}) {
  if (!markdown || typeof markdown !== 'string') return '';
  const _sourceUrl = (options.sourceUrl && typeof options.sourceUrl === 'string')
    ? options.sourceUrl.trim() : '';

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

  /** Flush a paragraph buffer as a <p> element.
   * Lines joined with '\n' (from soft-break detection) become <br> elements.
   */
  function flushPara(buf) {
    const trimmed = buf.trim();
    if (!trimmed) return;
    // Soft-break segments (each was a line ending with '  ') → <br>
    const segments = trimmed.split('\n');
    const html = segments.map(seg => applyInline(escapeHtml(seg))).join('<br>');
    htmlParts.push(`<p>${html}</p>`);
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
            `<div class="designer-card__icon">\u{1F3A8}</div>` +
            `<div class="designer-card__body">` +
              `<div class="designer-card__title">AI Generated Image</div>` +
              `<div class="designer-card__note">Session-bound \u00B7 embedded preview unavailable</div>` +
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
    // ── Generated audio block ─────────────────────────────────────────────
    // Matches the marker emitted by htmlToMarkdown's <audio> case:
    //   [🔊 Generated audio](src)              → playable <audio> element
    //   [🔊 Generated audio (session-only)](blob:…) → session-expired notice
    //   [🔊 Generated audio (not captured)]    → capture-failed notice  (no URL)
    {
      const audioMarkerRe = /^\[🔊 Generated audio([^\]]*)\](?:\(([^)]*)\))?$/;
      const audioMatch = line.trim().match(audioMarkerRe);
      if (audioMatch) {
        flushPara(paraBuf); paraBuf = '';
        flushList();
        const note = (audioMatch[1] || '').trim();  // e.g. ' (session-only)'
        const src  = audioMatch[2] || '';

        const isLikelyBlockedCrossSiteMedia =
          /^https?:\/\/contribution\.usercontent\.google\.com\//i.test(src);
        const originalChatUrl = _sourceUrl || src;

        let cardHtml;
        if (src.startsWith('data:')) {
          // Permanently captured data: URI — render player + download button
          const srcEsc = escapeHtml(src);
          const ext = (src.match(/^data:audio\/([^;,]+)/) || [])[1]?.replace('mpeg', 'mp3') || 'audio';
          const dlHtml = `<a class="audio-card__download" href="${srcEsc}" download="generated-audio.${ext}" title="Download audio">⬇️</a>`;
          cardHtml =
            `<div class="audio-card">` +
              `<div class="audio-card__icon">🔊</div>` +
              `<div class="audio-card__body">` +
                `<div class="audio-card__label">Generated audio${dlHtml}</div>` +
                `<audio controls class="audio-card__player" src="${srcEsc}"></audio>` +
              `</div>` +
            `</div>`;
        } else if (note.includes('not captured') && src && /^https?:\/\//i.test(src)) {
          // Detected but not captured — src is the original chat URL, not an audio file.
          const srcEsc = escapeHtml(src);
          cardHtml =
            `<div class="audio-card audio-card--unavailable">` +
              `<div class="audio-card__icon">🔊</div>` +
              `<div class="audio-card__body">` +
                `<div class="audio-card__label">Generated audio · not captured</div>` +
                `<a class="audio-card__original-link" href="${srcEsc}" target="_blank" rel="noopener noreferrer">Open original chat ↗</a>` +
              `</div>` +
            `</div>`;
        } else if (isLikelyBlockedCrossSiteMedia && src) {
          // URL points to cross-site media that often cannot be fetched/played from extension pages.
          const originalEsc = escapeHtml(originalChatUrl);
          cardHtml =
            `<div class="audio-card audio-card--unavailable">` +
              `<div class="audio-card__icon">🔊</div>` +
              `<div class="audio-card__body">` +
                `<div class="audio-card__label">Generated audio · open original chat to play</div>` +
                `<a class="audio-card__original-link" href="${originalEsc}" target="_blank" rel="noopener noreferrer">Open original chat ↗</a>` +
              `</div>` +
            `</div>`;
        } else if (src && /^https?:\/\//i.test(src)) {
          // Session-limited https: CDN URL — render player (may expire)
          const srcEsc = escapeHtml(src);
          cardHtml =
            `<div class="audio-card">` +
              `<div class="audio-card__icon">🔊</div>` +
              `<div class="audio-card__body">` +
                `<div class="audio-card__label">Generated audio</div>` +
                `<audio controls class="audio-card__player" src="${srcEsc}"></audio>` +
              `</div>` +
            `</div>`;
        } else {
          // Blob: URL (session expired) or no URL (not captured)
          const label = src.startsWith('blob:')
            ? 'Generated audio · session expired — open original chat to play'
            : `Generated audio${note || ' · not captured'}`;
          cardHtml =
            `<div class="audio-card audio-card--unavailable">` +
              `<div class="audio-card__icon">🔊</div>` +
              `<div class="audio-card__label">${escapeHtml(label)}</div>` +
            `</div>`;
        }
        htmlParts.push(cardHtml);
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
              `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="13" height="13" x="9" y="9" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>` +
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

    // -- GFM pipe table --------------------------------------------------------
    // Detect: current line starts+ends with | and next line is a separator row
    if (/^\|.+\|/.test(line) && i + 1 < lines.length && /^\|[-:| ]+\|\s*$/.test(lines[i + 1])) {
      flushPara(paraBuf); paraBuf = '';
      flushList();

      const parseRow = raw => raw
        .replace(/^\|/, '').replace(/\|$/, '')
        .split('|')
        .map(cell => applyInline(escapeHtml(cell.trim())));

      const headers = parseRow(line);
      i++; // move to separator row
      const aligns = lines[i]
        .replace(/^\|/, '').replace(/\|$/, '')
        .split('|')
        .map(c => {
          const t = c.trim();
          if (t.startsWith(':') && t.endsWith(':')) return 'center';
          if (t.endsWith(':'))   return 'right';
          if (t.startsWith(':')) return 'left';
          return '';
        });
      i++; // first data row

      const dataRows = [];
      while (i < lines.length && /^\|/.test(lines[i])) {
        dataRows.push(parseRow(lines[i]));
        i++;
      }

      const thCells = headers.map((h, j) => {
        const align = aligns[j] ? ` style="text-align:${aligns[j]}"` : '';
        return `<th${align}>${h}</th>`;
      }).join('');
      const tbRows = dataRows.map(row =>
        `<tr>${row.map((cell, j) => {
          const align = aligns[j] ? ` style="text-align:${aligns[j]}"` : '';
          return `<td${align}>${cell}</td>`;
        }).join('')}</tr>`
      ).join('');

      htmlParts.push(
        `<div class="table-wrapper">` +
        `<table><thead><tr>${thCells}</tr></thead>` +
        (tbRows ? `<tbody>${tbRows}</tbody>` : '') +
        `</table></div>`
      );
      continue; // i already advanced past all table rows
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






    // Assembled-chat section divider (===) � marks where one chat ends, the next begins
    if (/^={3,}\s*$/.test(line)) {
      flushPara(paraBuf); paraBuf = '';
      flushList();
      htmlParts.push(
        '<div class="chat-section-divider" role="separator" aria-label="Chat boundary">' +
          '<span class="chat-section-divider__label">next chat</span>' +
        '</div>'
      );
      i++;
      continue;
    }

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

    // ── Blank line \u2014 paragraph break ───────────────────────────────────────
    if (line.trim() === '') {
      flushList();
      if (paraBuf.trim()) {
        flushPara(paraBuf);
        paraBuf = '';
      }
      i++;
      continue;
    }

    // ── HTML comment \u2014 skip silently (e.g. TOC anchor comments in digests) ──
    if (/^\s*<!--.*-->\s*$/.test(line)) {
      i++;
      continue;
    }

    // ── File attachment chip ───────────────────────────────────────────────
    // Matches a standalone filename line (e.g. "report.pdf" or "data.xlsx").
    // messagesToMarkdown prepends a role emoji (🙋 / 🤖) to the first content
    // line, so strip it before matching (e.g. "🤖 report.pdf" → "report.pdf").
    // Only fires when we're NOT mid-paragraph so we never break prose sentences.
    {
      const _EXT = 'pdf|docx?|xlsx?|pptx?|csv|txt|md|json|xml|ya?ml|' +
                   'zip|gz|tar|rar|7z|' +
                   'png|jpe?g|gif|webp|svg|bmp|ico|' +
                   'mp3|wav|ogg|flac|aac|' +
                   'mp4|mov|avi|mkv|webm|' +
                   'py|js|ts|rb|java|cs|cpp?|h|go|rs|sh|bat|ps1';
      const _attachRe = new RegExp(
        `^([\\w][\\w .,'\\-()\\[\\]]{0,197}\\.(?:${_EXT}))\\s*$`, 'i'
      );
      const _typeLabelRe = /^[A-Z]{2,6}(\s+File)?\s*$/;

      // Strip leading role emoji + space (added by messagesToMarkdown).
      // Capture the emoji so we can re-emit it as a turn-marker <p> for
      // wrapChatTurns — if we just swallow it the turn boundary is lost.
      const _roleEmojiRe = /^([\u{1F300}-\u{1FFFF}\u{2600}-\u{27BF}])\s+/u;
      const _emojiPrefix = line.match(_roleEmojiRe);
      const _lineForAttach = _emojiPrefix ? line.slice(_emojiPrefix[0].length) : line;
      const attachMatch = !paraBuf.trim() && _lineForAttach.match(_attachRe);
      // Log any line with a known file extension so we can trace detection
      if (/\.[a-z]{2,5}\s*$/i.test(_lineForAttach)) {
        logger.debug('[reader] attach-check line:', JSON.stringify(line),
          '→ stripped:', JSON.stringify(_lineForAttach), '| paraBuf empty:', !paraBuf.trim(),
          '| match:', !!attachMatch);
      }
      if (attachMatch) {
        flushList();
        const fname = attachMatch[1].trim();
        logger.debug('[reader] rendering chip for:', fname);
        // If the original line carried a role emoji, re-emit it as a lone <p>
        // so wrapChatTurns can still identify the turn boundary.  After
        // wrapChatTurns processes it, the empty <p> becomes invisible.
        if (_emojiPrefix) {
          htmlParts.push(`<p>${_emojiPrefix[1]}</p>`);
        }
        const ext   = fname.split('.').pop().toUpperCase();
        const iconMap = {
          PDF: '📄',
          DOC: '📝', DOCX: '📝', TXT: '📝', MD: '📝',
          XLS: '📊', XLSX: '📊', CSV: '📊',
          PPT: '📊', PPTX: '📊',
          PNG: '🖼', JPG: '🖼', JPEG: '🖼', GIF: '🖼', WEBP: '🖼',
          SVG: '🖼', BMP: '🖼', ICO: '🖼',
          MP3: '🎵', WAV: '🎵', OGG: '🎵', FLAC: '🎵', AAC: '🎵',
          MP4: '🎬', MOV: '🎬', AVI: '🎬', MKV: '🎬', WEBM: '🎬',
          ZIP: '🗜', GZ: '🗜', TAR: '🗜', RAR: '🗜',
          PY: '📜', JS: '📜', TS: '📜', RB: '📜', JAVA: '📜',
          CS: '📜', CPP: '📜', GO: '📜', RS: '📜', SH: '📜',
        };
        const icon    = iconMap[ext] ?? '📎';
        const nameEsc = escapeHtml(fname);
        const extEsc  = escapeHtml(ext);
        const urlEsc  = _sourceUrl ? escapeHtml(_sourceUrl) : '';
        // Inner chip markup
        const chipInner =
          `<span class="file-attachment-chip__icon">${icon}</span>` +
          `<span class="file-attachment-chip__name">${nameEsc}</span>` +
          `<span class="file-attachment-chip__ext">${extEsc}</span>` +
          `<span class="file-attachment-chip__note">session·go to original chat to download</span>`;
        // Wrap in a link to the source chat if the URL is available
        const chipHtml = urlEsc
          ? `<a class="file-attachment-chip" href="${urlEsc}" target="_blank" rel="noopener noreferrer" title="Open original chat to download ${nameEsc}">${chipInner}</a>`
          : `<div class="file-attachment-chip" title="Session-bound — open the original chat to download">${chipInner}</div>`;
        htmlParts.push(chipHtml);
        i++;
        // Skip any following blank lines
        while (i < lines.length && lines[i].trim() === '') i++;
        // Skip a bare type-label line (e.g. "PDF" or "PDF File")
        if (i < lines.length && _typeLabelRe.test(lines[i].trim())) i++;
        continue;
      }
    }

    // ── Regular text \u2014 accumulate into paragraph ───────────────────────────
    flushList();
    // Markdown soft break: line ending with two spaces → insert \n as <br> marker
    const softBreak = line.endsWith('  ');
    const cleanLine = softBreak ? line.slice(0, -2) : line;
    paraBuf += (paraBuf ? (softBreak ? '\n' : ' ') : '') + cleanLine;
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
 * Supports two serialiser formats:
 *
 *  Legacy (h3 headings):
 *   <h3>User</h3>, <p>�</p>, <hr>, <h3>Assistant</h3>, <p>�</p>, <hr>, �
 *
 *  Current (emoji prefix � produced by markdown-serialiser.js messagesToMarkdown):
 *   <p>?? prompt text</p>, <hr>, <p>?? response text</p>, <hr>, �
 *
 * If neither format is detected the DOM is left unchanged (e.g. plain excerpts).
 * @param {Element} contentEl
 */
export function wrapChatTurns(contentEl) {
  const USER_EMOJI = '\u{1F64B}'; // ??
  const ASST_EMOJI = '\u{1F916}'; // ??
  const USER_ROLES      = new Set(['user', 'you', 'human']);
  const ASSISTANT_ROLES = new Set(['assistant', 'chatgpt', 'claude', 'gemini', 'copilot']);

  // Detect which format is in use
  const hasLegacyRoles = Array.from(contentEl.querySelectorAll('h3')).some(h => {
    const t = h.textContent.trim().toLowerCase();
    return USER_ROLES.has(t) || ASSISTANT_ROLES.has(t);
  });
  const hasEmojiRoles = !hasLegacyRoles && Array.from(contentEl.querySelectorAll('p')).some(p => {
    const t = p.textContent.trimStart();
    return t.startsWith(USER_EMOJI) || t.startsWith(ASST_EMOJI);
  });

  if (!hasLegacyRoles && !hasEmojiRoles) return;

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

  // For the emoji format, merge groups that have no role-emoji paragraph with
  // the preceding group.  A Markdown HR (---) embedded *inside* a message body
  // is indistinguishable from the turn-separator HR in the stored markdown, so
  // renderMarkdown converts both to <hr>.  Without this merge step, any HR
  // within a ChatGPT (or other) response splits that response into multiple
  // raw/unstyled blocks — only the first sub-block (which has the 🤖 prefix)
  // ends up inside the styled .chat-turn--assistant wrapper.
  if (hasEmojiRoles) {
    const hasRoleEmoji = grp => grp.some(n =>
      n.nodeType === 1 && n.nodeName === 'P' &&
      (n.textContent.trimStart().startsWith(USER_EMOJI) ||
       n.textContent.trimStart().startsWith(ASST_EMOJI))
    );
    const merged = [];
    for (const grp of groups) {
      if (!hasRoleEmoji(grp) && merged.length > 0) {
        // Continuation of the previous turn — merge it in, inserting a visual
        // <hr> so the intra-message horizontal rule is still rendered.
        const hr = document.createElement('hr');
        merged[merged.length - 1].push(hr, ...grp);
      } else {
        merged.push([...grp]);
      }
    }
    groups.length = 0;
    groups.push(...merged);
  }

  for (const group of groups) {
    // Drop whitespace-only text nodes
    const nodes = group.filter(
      n => !(n.nodeType === 3 /* TEXT_NODE */ && n.textContent.trim() === '')
    );
    if (!nodes.length) continue;

    // -- Legacy format: <h3>User</h3> heading ---------------------------------
    // Scan for the first H3 role heading in the group — it may not be the first
    // node (e.g. exported chats open with a <h1> title before the first turn).
    if (hasLegacyRoles) {
      const h3Idx  = nodes.findIndex(n => n.nodeType === 1 && n.tagName === 'H3');
      const h3Node = h3Idx >= 0 ? nodes[h3Idx] : null;
      const roleKey = h3Node ? h3Node.textContent.trim().toLowerCase() : '';
      const isUser      = USER_ROLES.has(roleKey);
      const isAssistant = ASSISTANT_ROLES.has(roleKey);

      if (h3Node && (isUser || isAssistant)) {
        // Flush any prefix nodes (e.g. <h1> title before first turn) directly.
        for (const n of nodes.slice(0, h3Idx)) contentEl.appendChild(n);

        const turn = document.createElement('div');
        turn.className = `chat-turn ${isUser ? 'chat-turn--user' : 'chat-turn--assistant'}`;

        const roleDiv = document.createElement('div');
        roleDiv.className = 'chat-turn__role';
        const iconSpan = document.createElement('span');
        iconSpan.className = 'turn-role-icon';
        iconSpan.setAttribute('aria-hidden', 'true');
        iconSpan.textContent = isUser ? '\u{1F64B}' : '\u{1F916}';
        const labelSpan = document.createElement('span');
        labelSpan.className = 'turn-role-label';
        labelSpan.textContent = h3Node.textContent.trim();
        roleDiv.append(iconSpan, labelSpan);

        const bodyDiv = document.createElement('div');
        bodyDiv.className = 'chat-turn__body';
        for (const n of nodes.slice(h3Idx + 1)) bodyDiv.appendChild(n);

        turn.appendChild(roleDiv);
        turn.appendChild(bodyDiv);
        contentEl.appendChild(turn);
        continue;
      }
    }

    // -- Current emoji format: ?? / ?? prefixed paragraph ---------------------
    // Scan the whole group � the emoji-P may not be the first node (e.g. when
    // the group starts with a <h1> title followed by the first user message).
    if (hasEmojiRoles) {
      const emojiIdx = nodes.findIndex(n =>
        n.nodeType === 1 && n.tagName === 'P' &&
        (n.textContent.trimStart().startsWith(USER_EMOJI) ||
         n.textContent.trimStart().startsWith(ASST_EMOJI))
      );

      if (emojiIdx >= 0) {
        // Flush any prefix nodes (e.g. <h1> title before first message) directly
        for (const n of nodes.slice(0, emojiIdx)) contentEl.appendChild(n);

        const emojiP  = nodes[emojiIdx];
        const txt     = emojiP.textContent.trimStart();
        const isUser  = txt.startsWith(USER_EMOJI);

        const turn = document.createElement('div');
        turn.className = `chat-turn ${isUser ? 'chat-turn--user' : 'chat-turn--assistant'}`;

        const roleDiv = document.createElement('div');
        roleDiv.className = 'chat-turn__role';
        const iconSpan2 = document.createElement('span');
        iconSpan2.className = 'turn-role-icon';
        iconSpan2.setAttribute('aria-hidden', 'true');
        iconSpan2.textContent = isUser ? USER_EMOJI : ASST_EMOJI;
        const labelSpan2 = document.createElement('span');
        labelSpan2.className = 'turn-role-label';
        labelSpan2.textContent = isUser ? 'You' : 'Assistant';
        roleDiv.append(iconSpan2, labelSpan2);

        // Strip the leading emoji (and any trailing space) from the first text node
        const emoji = isUser ? USER_EMOJI : ASST_EMOJI;
        for (const child of emojiP.childNodes) {
          if (child.nodeType === 3 /* TEXT_NODE */) {
            if (child.textContent.startsWith(emoji)) {
              child.textContent = child.textContent.slice(emoji.length).trimStart();
            }
            break;
          }
        }

        const bodyDiv = document.createElement('div');
        bodyDiv.className = 'chat-turn__body';
        for (const n of nodes.slice(emojiIdx)) bodyDiv.appendChild(n);

        turn.appendChild(roleDiv);
        turn.appendChild(bodyDiv);
        contentEl.appendChild(turn);
        continue;
      }
    }

    // Non-role group � append nodes directly (preserves leading meta content)
    for (const n of nodes) contentEl.appendChild(n);
  }
}

/**
 * Count user-prompt and assistant-response turns in the rendered content element.
 * @param {Element} contentEl
 * @returns {{ prompts: number, responses: number }}
 */
export function countTurns(contentEl) {
  if (!contentEl) return { prompts: 0, responses: 0 };
  // Wrapped format (legacy serialiser)
  const prompts   = contentEl.querySelectorAll('.chat-turn--user').length;
  const responses = contentEl.querySelectorAll('.chat-turn--assistant').length;
  if (prompts > 0 || responses > 0) return { prompts, responses };
  // Emoji format (current serialiser: ?? / ?? paragraphs)
  const USER_EMOJI = '\uD83D\uDE4B'; // ??
  const ASST_EMOJI = '\uD83E\uDD16'; // ??
  let p = 0, r = 0;
  for (const para of contentEl.querySelectorAll('p')) {
    const t = para.textContent.trimStart();
    if (t.startsWith(USER_EMOJI))      p++;
    else if (t.startsWith(ASST_EMOJI)) r++;
  }
  return { prompts: p, responses: r };
}

/**
 * Add ordinal labels (P1, P2�/R1, R2�) to each chat turn and assign deep-link
 * anchor ids (p1, p2�/r1, r2�) for URL-fragment navigation.
 *
 * Labels are injected as <span class="msg-ordinal" aria-hidden="true"> prepended
 * inside '.chat-turn__role'. Any existing labels are removed first (idempotent).
 *
 * @param {Element} contentEl
 */
export function addOrdinalLabels(contentEl) {
  if (!contentEl) return;
  // Remove all existing ordinal labels first (idempotent)
  contentEl.querySelectorAll('.msg-ordinal').forEach(el => el.remove());
  let promptIdx = 0;
  let responseIdx = 0;

  const wrappedTurns = contentEl.querySelectorAll('.chat-turn--user, .chat-turn--assistant');
  if (wrappedTurns.length > 0) {
    // Wrapped format (legacy serialiser: ### User / ### Assistant headings)
    for (const turn of wrappedTurns) {
      const isUser  = turn.classList.contains('chat-turn--user');
      const roleDiv = turn.querySelector('.chat-turn__role');
      if (!roleDiv) continue;

      const label = document.createElement('span');
      label.className = 'msg-ordinal';
      label.setAttribute('aria-hidden', 'true');

      if (isUser) {
        promptIdx++;
        turn.id = `p${promptIdx}`;
        label.textContent = `P${promptIdx}`;
      } else {
        responseIdx++;
        turn.id = `r${responseIdx}`;
        label.textContent = `R${responseIdx}`;
      }
      roleDiv.prepend(label);
    }
  } else {
    // Emoji format (current serialiser): ?? = user, ?? = assistant
    // Labels are injected as the first child of the paragraph, preceding the emoji.
    const USER_EMOJI = '\uD83D\uDE4B'; // ??
    const ASST_EMOJI = '\uD83E\uDD16'; // ??
    for (const p of contentEl.querySelectorAll('p')) {
      const text   = p.textContent.trimStart();
      const isUser = text.startsWith(USER_EMOJI);
      const isAsst = text.startsWith(ASST_EMOJI);
      if (!isUser && !isAsst) continue;

      const label = document.createElement('span');
      label.className = 'msg-ordinal';
      label.setAttribute('aria-hidden', 'true');

      if (isUser) {
        promptIdx++;
        p.id = `p${promptIdx}`;
        label.textContent = `P${promptIdx}`;
      } else {
        responseIdx++;
        p.id = `r${responseIdx}`;
        label.textContent = `R${responseIdx}`;
      }
      p.prepend(label);
    }
  }
}

// Module-level reference set by setupSourcesPanel so processSources can wire
// direct listeners on each chip (more reliable than document-level delegation).
let _openPanel = null;

/**
 * Post-process rendered markdown to replace each **Sources:** + list block
 * with a compact `.sources-trigger` chip button that opens the sources panel.
 *
 * `renderMarkdown` turns the serialiser's output of:
 *   **Sources:**
 *   - [Title](url)
 * into `<p><strong>Sources:</strong></p><ul><li><a href="\u2026">\u2026</a></li></ul>`.
 * This function replaces that `<p>` + `<ul>` pair with a single button whose
 * `data-sources` attribute carries the JSON-serialised link list.
 *
 * @param {Element} contentEl
 */
export function processSources(contentEl) {
  if (!contentEl) return;

  Array.from(contentEl.querySelectorAll('p')).forEach(p => {
    if (!/^sources:?$/i.test((p.textContent || '').trim())) return;

    const ul = p.nextElementSibling;
    if (!ul || ul.tagName !== 'UL') {
      console.debug('[bAInder] processSources: found Sources p but nextElementSibling is', ul?.tagName ?? 'null', '� skipping');
      return;
    }

    const links = Array.from(ul.querySelectorAll('a[href]'))
      .map(a => ({ href: a.getAttribute('href'), text: (a.textContent || '').trim() || a.getAttribute('href') }))
      .filter(l => l.href);

    if (links.length === 0) { console.debug('[bAInder] processSources: Sources ul has no valid links'); return; }
    console.debug('[bAInder] processSources: creating chip with', links.length, 'link(s)');

    const n     = links.length;
    const label = `${n} source${n !== 1 ? 's' : ''}`;

    const chip  = document.createElement('button');
    chip.type   = 'button';
    chip.className = 'sources-trigger';
    chip.setAttribute('aria-label', `Show ${label}`);
    chip.dataset.sources = JSON.stringify(links);
    chip.innerHTML =
      `<svg class="sources-trigger__icon" width="12" height="12" viewBox="0 0 16 16" ` +
      `fill="currentColor" aria-hidden="true">` +
      `<path d="M3 4h10v1.5H3V4Zm0 3.25h10v1.5H3V7.25ZM3 10.5h7v1.5H3v-1.5Z"/></svg>` +
      `<span>${label}</span>`;

    // Wire click directly so it works regardless of event-delegation conditions.
    chip.addEventListener('click', (e) => {
      e.stopPropagation(); // prevent document-level delegation from also firing
      if (_openPanel) _openPanel(links);
    });

    p.replaceWith(chip);
    ul.remove();
  });
}

/**
 * Create the sources side-panel singleton and wire all interactions:
 *   – clicking any `.sources-trigger` button populates and opens the panel
 *   – the close button, overlay click, and Escape key all close it
 *
 * Idempotent: safe to call multiple times (returns early after first call).
 */
export function setupSourcesPanel() {
  if (document.getElementById('sources-panel')) return;

  // ── Panel ──────────────────────────────────────────────────────────────────
  const panel = document.createElement('aside');
  panel.id        = 'sources-panel';
  panel.className = 'sources-panel';
  panel.setAttribute('aria-label', 'Sources');
  panel.setAttribute('aria-hidden', 'true');
  panel.innerHTML =
    `<div class="sources-panel__header">` +
      `<div class="sources-panel__title-group">` +
        `<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" ` +
             `stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" ` +
             `aria-hidden="true" style="color:var(--text-secondary);flex-shrink:0">` +
          `<circle cx="8" cy="8" r="7"/>` +
          `<path d="M8 1c-2 2.5-3 4.5-3 7s1 4.5 3 7M8 1c2 2.5 3 4.5 3 7s-1 4.5-3 7M1 8h14"/>` +
        `</svg>` +
        `<span class="sources-panel__title">Sources</span>` +
        `<span class="sources-panel__count" id="sources-panel-count" aria-live="polite"></span>` +
      `</div>` +
      `<button class="sources-panel__close" id="sources-panel-close" ` +
              `aria-label="Close sources panel" type="button">` +
        `<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">` +
          `<path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708` +
          `L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708` +
          `-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708Z"/>` +
        `</svg>` +
      `</button>` +
    `</div>` +
    `<ul class="sources-panel__list" id="sources-panel-list" role="list"></ul>`;
  document.body.appendChild(panel);

  // ── Dim overlay \u2014 clicking outside closes the panel ────────────────────────
  const overlay   = document.createElement('div');
  overlay.id        = 'sources-overlay';
  overlay.className = 'sources-overlay';
  document.body.appendChild(overlay);

  function openPanel(links) {
    const list  = document.getElementById('sources-panel-list');
    const count = document.getElementById('sources-panel-count');
    if (!list) return;
    list.innerHTML = '';

    if (count) count.textContent = links.length || '';

    if (links.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'sources-panel__empty';
      empty.textContent = 'No sources recorded for this response.';
      list.appendChild(empty);
    } else {
      links.forEach(({ href, text }) => {
        let domain = text;
        try { domain = new URL(href).hostname.replace(/^www\./, ''); } catch (_) {}

        const li = document.createElement('li');
        li.className = 'sources-panel__item';

        const a  = document.createElement('a');
        a.href   = href;
        a.target = '_blank';
        a.rel    = 'noopener noreferrer';
        a.className = 'sources-panel__link';
        a.title  = href;

        // Favicon
        const fav = document.createElement('img');
        fav.className = 'sources-panel__favicon';
        fav.src = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=32`;
        fav.alt = '';
        fav.addEventListener('error', () => fav.setAttribute('data-error', '1'));

        // Text body
        const body = document.createElement('span');
        body.className = 'sources-panel__link-body';

        const domainEl = document.createElement('span');
        domainEl.className = 'sources-panel__link-domain';
        domainEl.textContent = domain;

        const urlEl = document.createElement('span');
        urlEl.className = 'sources-panel__link-url';
        urlEl.textContent = href;

        body.appendChild(domainEl);
        body.appendChild(urlEl);

        // Arrow icon
        const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        arrow.setAttribute('width', '12'); arrow.setAttribute('height', '12');
        arrow.setAttribute('viewBox', '0 0 16 16'); arrow.setAttribute('fill', 'none');
        arrow.setAttribute('stroke', 'currentColor'); arrow.setAttribute('stroke-width', '2');
        arrow.setAttribute('stroke-linecap', 'round'); arrow.setAttribute('stroke-linejoin', 'round');
        arrow.setAttribute('aria-hidden', 'true'); arrow.className = 'sources-panel__link-arrow';
        arrow.innerHTML = '<path d="M3 13L13 3M7 3h6v6"/>';

        a.appendChild(fav);
        a.appendChild(body);
        a.appendChild(arrow);
        li.appendChild(a);
        list.appendChild(li);
      });
    }
    panel.classList.add('sources-panel--open');
    panel.setAttribute('aria-hidden', 'false');
    overlay.classList.add('sources-overlay--visible');
  }

  function closePanel() {
    panel.classList.remove('sources-panel--open');
    panel.setAttribute('aria-hidden', 'true');
    overlay.classList.remove('sources-overlay--visible');
  }

  // Expose openPanel so processSources can wire chips directly.
  _openPanel = openPanel;

  // Delegation fallback — catches chips created outside processSources (e.g. tests).
  document.addEventListener('click', (e) => {
    const trigger = e.target.closest('.sources-trigger');
    if (!trigger) return;
    try {
      openPanel(JSON.parse(trigger.dataset.sources || '[]'));
    } catch (err) {
      console.error('[bAInder] openPanel error:', err);
    }
  });

  document.getElementById('sources-panel-close')?.addEventListener('click', closePanel);
  overlay.addEventListener('click', closePanel);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePanel(); });
}

/**
 * Set up the text-selection annotation toolbar (R2).
 * Safe no-op when annotation elements are absent (e.g. unit tests).
 * @param {string}      chatId
 * @param {object}      storage  \u2014 browser.storage.local-like API
 * @param {Object|null} [chat]   Full chat object; when provided enables the
 *                               "Delete" button that removes selected text
 *                               from the stored message content.
 */
export async function setupAnnotations(chatId, storage, chat = null) {
  if (!chatId || !storage) return;
  const toolbar   = document.getElementById('annotation-toolbar');
  const contentEl = document.getElementById('reader-content');
  if (!toolbar || !contentEl) return;

  let selectedColor  = '#fef08a';
  let pendingRange   = null;
  let allAnnotations = [];

  // ── Annotation count summary in header \u2014 built synchronously, before any
  //    await, so it lands in the DOM on every load regardless of timing. ────
  const readerHeader = document.getElementById('reader-header');
  let annWrapper     = document.getElementById('ann-summary-wrapper');
  let annBtn         = document.getElementById('ann-summary-btn');
  let annDropdown    = document.getElementById('ann-summary-dropdown');

  if (!annWrapper && readerHeader) {
    annWrapper = document.createElement('div');
    annWrapper.id        = 'ann-summary-wrapper';
    annWrapper.className = 'ann-summary-wrapper';

    annBtn = document.createElement('button');
    annBtn.id        = 'ann-summary-btn';
    annBtn.className = 'ann-summary-btn';
    annBtn.setAttribute('aria-label', 'Highlighted sections');
    annBtn.type = 'button';
    annBtn.hidden = true;   // hidden until we know the count

    annDropdown = document.createElement('div');
    annDropdown.id        = 'ann-summary-dropdown';
    annDropdown.className = 'ann-summary-dropdown';
    annDropdown.setAttribute('role', 'menu');
    annDropdown.hidden = true;

    annWrapper.appendChild(annBtn);
    annWrapper.appendChild(annDropdown);

    const metaRow = readerHeader.querySelector('.reader-header__meta');
    if (metaRow) metaRow.appendChild(annWrapper);
    else readerHeader.querySelector('.reader-header__inner')?.appendChild(annWrapper);
  }

  // ── Re-apply stored annotations ──────────────────────────────────────────
  try {
    const existing = await loadAnnotations(chatId, storage);
    allAnnotations = existing;
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

  // ── Render / update the header summary ───────────────────────────────────
  function renderAnnSummary() {
    if (!annBtn || !annDropdown) return;
    const count = allAnnotations.length;
    annBtn.hidden = count === 0;
    annBtn.textContent = `\uD83D\uDD0D ${count} ${count === 1 ? 'highlight' : 'highlights'}`;

    annDropdown.innerHTML = '';
    if (!count) return;
    const sorted = [...allAnnotations].sort((a, b) => a.start - b.start);
    for (const ann of sorted) {
      const item = document.createElement('button');
      item.className = 'ann-summary-dropdown__item';
      item.setAttribute('role', 'menuitem');
      item.type = 'button';

      const swatch = document.createElement('span');
      swatch.className = 'ann-summary-dropdown__swatch';
      swatch.style.background = ann.color || '#fef08a';

      const textEl = document.createElement('span');
      textEl.className = 'ann-summary-dropdown__text';
      const snippet = (ann.text || '').replace(/\s+/g, ' ').trim();
      textEl.textContent = snippet.length > 60 ? snippet.slice(0, 60) + '\u2026' : (snippet || '(empty)');

      item.appendChild(swatch);
      item.appendChild(textEl);

      if (ann.note) {
        const noteEl = document.createElement('span');
        noteEl.className = 'ann-summary-dropdown__note';
        noteEl.textContent = ann.note.length > 50 ? ann.note.slice(0, 50) + '\u2026' : ann.note;
        item.appendChild(noteEl);
      }

      item.addEventListener('click', () => {
        annDropdown.hidden = true;
        const markEl = contentEl.querySelector(`[data-annotation-id="${ann.id}"]`);
        if (markEl) markEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });

      annDropdown.appendChild(item);
    }
  }

  renderAnnSummary();

  // ── Summary dropdown hover wiring ─────────────────────────────────────────
  let _annHideTimer = null;
  function _showAnnDropdown() {
    if (!allAnnotations.length) return;
    clearTimeout(_annHideTimer);
    annDropdown.hidden = false;
  }
  function _scheduleAnnHide() {
    _annHideTimer = setTimeout(() => { annDropdown.hidden = true; }, HOVER_OUT_DISMISS_MS);
  }
  if (annBtn) {
    annBtn.addEventListener('mouseenter', _showAnnDropdown);
    annBtn.addEventListener('mouseleave', _scheduleAnnHide);
  }
  if (annDropdown) {
    annDropdown.addEventListener('mouseenter', () => clearTimeout(_annHideTimer));
    annDropdown.addEventListener('mouseleave', _scheduleAnnHide);
  }

  // ── Prevent toolbar interactions from clearing the text selection ────────
  // preventDefault on ALL toolbar mousedowns stops the browser from clearing
  // the document text selection (which it does as part of the default focus
  // handling on mousedown).  For the note <input> we then call .focus()
  // manually \u2014 programmatic focus does NOT clear the document selection.
  toolbar.addEventListener('mousedown', (e) => {
    e.preventDefault();
    if (e.target === noteInput || noteInput?.contains(e.target)) {
      noteInput.focus();
    }
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

    // Ignore selections that contain only whitespace (e.g. accidental double-clicks)
    if (!sel.toString().trim()) {
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

    // Position toolbar ABOVE the selection (toolbar is position:fixed \u2014 no scrollY needed)
    // Position toolbar relative to the selection.
    // Prefer above; fall back to below when the sticky header would obscure it.
    const rect         = range.getBoundingClientRect();
    const headerEl     = document.getElementById('reader-header');
    const headerBottom = headerEl ? headerEl.getBoundingClientRect().bottom : 0;
    // 168px is a safe upper-bound for the toolbar height (colours + note input + actions).
    // If there isn't that much clearance between header and selection, show below instead.
    const showBelow    = rect.top - headerBottom < 168;

    toolbar.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - 240))}px`;
    if (showBelow) {
      toolbar.style.top       = `${rect.bottom + 8}px`;
      toolbar.style.transform = 'none';
    } else {
      toolbar.style.top       = `${rect.top - 8}px`;
      toolbar.style.transform = 'translateY(-100%)';
    }
    toolbar.hidden = false;
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
        id:    generateId('ann'),
        ...pendingRange,
        color: selectedColor,
        note:  noteInput?.value.trim() || '',
      };
      try {
        const updatedList = await saveAnnotation(chatId, ann, storage);
        allAnnotations = updatedList;
        applyAnnotations(contentEl, [ann]);
      } catch (_) {}
      toolbar.hidden = true;
      pendingRange   = null;
      window.getSelection()?.removeAllRanges();
      if (noteInput) noteInput.value = '';
      renderAnnSummary();
    });
  }

  // ── Delete selected text from stored chat ────────────────────────────────
  const deleteTextBtn = document.getElementById('annotation-delete-text');
  if (deleteTextBtn && chat && Array.isArray(chat.messages) && chat.messages.length > 0) {
    deleteTextBtn.hidden = false;
    deleteTextBtn.addEventListener('click', async () => {
      if (!pendingRange) return;

      // Selection is still alive (toolbar mousedown used preventDefault)
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.rangeCount) return;
      const range = sel.getRangeAt(0);

      // Capture selected text before clearing the selection
      const textToDelete = range.toString();

      // Resolve the .chat-turn containing each edge of the selection
      function _turnFor(node) {
        const el = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
        return el?.closest?.('.chat-turn') ?? null;
      }
      const startTurn = _turnFor(range.startContainer);
      const endTurn   = _turnFor(range.endContainer);

      toolbar.hidden = true;
      pendingRange   = null;
      window.getSelection()?.removeAllRanges();

      if (!startTurn || startTurn !== endTurn) {
        // Cross-turn selections are not supported
        return;
      }

      const msgIndex = parseInt(startTurn.dataset.msgIndex ?? '-1', 10);
      if (msgIndex < 0) return;

      if (!textToDelete.trim()) return;

      /* c8 ignore next 4 */
      if (!window.confirm(
        `Delete the selected text from this saved chat? This cannot be undone.\n\n` +
        `Note: any text highlights in this chat will also be cleared.`
      )) return;

      const updatedChat = deleteExcerptFromChat(chat, msgIndex, textToDelete);
      if (!updatedChat) {
        // Exact text not found in stored markdown (selection may include
        // HTML-rendered characters that differ from the raw markdown source).
        /* c8 ignore next 3 */
        window.alert(
          'Could not locate the selected text in the stored markdown.\n' +
          'Try selecting plain text without special formatting.'
        );
        return;
      }

      try {
        const r = await storage.get([`chat:${chatId}`, 'chats', 'chatIndex']);

        if (r[`chat:${chatId}`]) {
          await storage.set({ [`chat:${chatId}`]: updatedChat });
        } else {
          const chats   = Array.isArray(r.chats) ? r.chats : [];
          const updated = chats.map(c => c.id === chatId ? updatedChat : c);
          await storage.set({ chats: updated });
        }

        // Clear annotations — character offsets are invalid after content removal
        await storage.set({ [`annotations:${chatId}`]: [] });

        /* c8 ignore next */
        window.location.reload();
      } catch (err) {
        logger.error('[reader] deleteExcerpt: failed to persist:', err);
      }
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

    try {
      const updatedList = await deleteAnnotation(chatId, annId, storage);
      allAnnotations = updatedList;
    } catch (_) {}
    // Unwrap: replace <mark> with its children
    const parent = mark.parentNode;
    while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
    parent.removeChild(mark);
    renderAnnSummary();
  });
}

// ─── C.22 \u2014 Reading Progress Persistence ─────────────────────────────────────

const SCROLL_STORAGE_KEY   = 'bAInder_scrollPositions';
const SCROLL_MAX_ENTRIES   = 100;

/**
 * Read the full scroll-position map from localStorage.
 * Always returns a plain object (never throws).
 * @returns {{ [chatId: string]: number }}
 */
export function getScrollPositions() {
  try {
    return JSON.parse(localStorage.getItem(SCROLL_STORAGE_KEY) || '{}');
  } catch (_) {
    return {};
  }
}

/**
 * Persist the scroll position for a chat, evicting the oldest entry when the
 * store exceeds SCROLL_MAX_ENTRIES.
 * @param {string} chatId
 * @param {number} scrollY
 */
export function saveScrollPosition(chatId, scrollY) {
  if (!chatId) return;
  const positions = getScrollPositions();
  // Remove first to re-insert at end (LRU ordering by key-insertion)
  delete positions[chatId];
  positions[chatId] = scrollY;
  // Evict oldest entries beyond the cap
  const keys = Object.keys(positions);
  if (keys.length > SCROLL_MAX_ENTRIES) {
    const excess = keys.slice(0, keys.length - SCROLL_MAX_ENTRIES);
    for (const k of excess) delete positions[k];
  }
  try {
    localStorage.setItem(SCROLL_STORAGE_KEY, JSON.stringify(positions));
  } catch (_) { /* storage quota exceeded \u2014 skip silently */ }
}

/**
 * Restore a previously saved scroll position for a chat.
 * No-op when no position has been stored.
 * @param {string} chatId
 */
export function restoreScrollPosition(chatId) {
  if (!chatId) return;
  const y = getScrollPositions()[chatId];
  if (y) window.scrollTo(0, y);
}

/**
 * Wire up the scroll-progress bar and jump-to-top button.
 * When chatId is supplied, also persists scroll position (C.22).
 * Safe to call in environments where the elements don't exist (tests).
 * @param {string} [chatId]
 */
export function setupScrollFeatures(chatId) {
  const progressEl = document.getElementById('scroll-progress');
  const jumpBtn    = document.getElementById('jump-top');
  if (!progressEl && !jumpBtn) return;

  let scrollSaveTimer;

  function onScroll() {
    const scrollTop  = window.scrollY || document.documentElement.scrollTop;
    const docHeight  = document.documentElement.scrollHeight - document.documentElement.clientHeight;

    if (progressEl && docHeight > 0) {
      progressEl.style.width = `${(scrollTop / docHeight) * 100}%`;
    }
    if (jumpBtn) {
      jumpBtn.classList.toggle('jump-top--visible', scrollTop > 300);
    }
    // C.22 \u2014 debounced persistence (500 ms)
    if (chatId) {
      clearTimeout(scrollSaveTimer);
      scrollSaveTimer = setTimeout(() => saveScrollPosition(chatId, scrollTop), 500);
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

// ─── C.8 Backlinks ──────────────────────────────────────────────────────────

/**
 * Scan all other chats' annotations for `[[current chat title]]` references
 * and render a "Referenced by" section at the bottom of reader-content.
 *
 * @param {string}   chatId      The currently displayed chat's id
 * @param {string}   chatTitle   The currently displayed chat's title
 * @param {Array}    chats       Full chat list (metadata only)
 * @param {object}   storage     browser.storage.local-like API
 */
export async function renderBacklinksSection(chatId, chatTitle, chats, storage) {
  const contentEl = document.getElementById('reader-content');
  if (!contentEl || !chatTitle) return;

  const otherChats = chats.filter(c => c.id !== chatId);
  if (!otherChats.length) return;

  const keys = otherChats.map(c => `annotations:${c.id}`);
  let result;
  try {
    result = await storage.get(keys);
  } catch (_) { return; }

  const titleLower = chatTitle.toLowerCase();
  const referrers = new Map(); // chatId → chat metadata

  for (const chat of otherChats) {
    const key = `annotations:${chat.id}`;
    const annotations = result[key];
    if (!Array.isArray(annotations)) continue;
    for (const ann of annotations) {
      if (!ann.note) continue;
      const refs = parseBacklinks(ann.note);
      if (refs.some(r => r.toLowerCase() === titleLower)) {
        referrers.set(chat.id, chat);
        break;
      }
    }
  }

  if (referrers.size === 0) return;

  const section = document.createElement('section');
  section.className = 'backlinks-section';

  const heading = document.createElement('h4');
  heading.className = 'backlinks-section__title';
  heading.textContent = 'Referenced by';
  section.appendChild(heading);

  const list = document.createElement('ul');
  list.className = 'backlinks-list';
  list.setAttribute('role', 'list');

  for (const [refId, refChat] of referrers) {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.className = 'backlinks-list__link';
    a.href = `reader.html?chatId=${encodeURIComponent(refId)}`;
    a.textContent = refChat.title || 'Untitled Chat';
    li.appendChild(a);
    list.appendChild(li);
  }

  section.appendChild(list);
  contentEl.appendChild(section);
}

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
 * Pure-ish (operates on document) \u2014 exported for testing with a DOM.
 * @param {Object} chat
 */
export function renderChat(chat) {
  const content = chat.content || '';
  const meta    = chat.metadata || {};
  const fm      = parseFrontmatter(content);

  // ── Header ────────────────────────────────────────────────────────────────
  const isExcerpt = Boolean(meta.isExcerpt || fm.excerpt);
  const source    = fm.source || chat.source || 'unknown';
  const title     = chat.title || fm.title  || 'Untitled Chat';
  const date      = fm.date   || (chat.timestamp ? new Date(chat.timestamp).toISOString() : '');
  const count     = typeof fm.messageCount === 'number' ? fm.messageCount : (chat.messageCount || 0);

  document.title = `${title} \u2014 bAInder`;

  const srcEl    = document.getElementById('meta-source');
  const dateEl   = document.getElementById('meta-date');
  const countEl  = document.getElementById('meta-count');
  const titleEl  = document.getElementById('reader-title');
  const header   = document.getElementById('reader-header');

  srcEl.className   = badgeClass(source, isExcerpt);
  srcEl.textContent = sourceLabel(source, isExcerpt);
  dateEl.innerHTML  = date ? `<span class="meta-chip__icon" aria-hidden="true">\u{1F4C5}</span> ${formatDate(date)}` : '';
  countEl.innerHTML = count > 0 ? `<span class="meta-chip__icon" aria-hidden="true">\u{1F4AC}</span> ${count} messages` : '';
  titleEl.textContent = title;

  // ── Reading time (R3) ──────────────────────────────────────────────────────
  const readTimeEl = document.getElementById('meta-reading-time');
  if (readTimeEl) {
    const words = countWords(content);
    const mins  = estimateReadTime(words);
    readTimeEl.innerHTML = `<span class="meta-chip__icon" aria-hidden="true">\u23F1</span> ${mins} min read`;
    readTimeEl.hidden = false;
  }

  // ── Per-source body tint (T3) ──────────────────────────────────────────────
  const knownSources = ['chatgpt', 'claude', 'gemini', 'copilot', 'perplexity', 'deepseek'];
  if (knownSources.includes(source)) {
    document.body.setAttribute('data-source', source);
  }

  header.hidden = false;

  // ── Content ──────────────────────────────────────────────────────────────
  const contentEl = document.getElementById('reader-content');

  // Log key lines in the content so we can trace attachment / audio rendering
  const _pdfLines   = content.split('\n').filter(l => /\.[a-z]{2,5}\s*$/i.test(l.trim()));
  const _audioLines = content.split('\n').filter(l => l.includes('🔊'));
  logger.info('[reader] renderMarkdown: content length', content.length,
    '| audio markers:', _audioLines.length,
    '| lines with file extensions:', _pdfLines.map(l => JSON.stringify(l)));
  if (_audioLines.length) logger.info('[reader] audio marker lines:', _audioLines.map(l => l.slice(0, 100)));
  // Dump full assistant message content for diagnostics (first 2000 chars)
  const _fullContent = content.length > 200 ? content.slice(0, 2000) + (content.length > 2000 ? '…' : '') : content;
  logger.info('[reader] full content dump:', JSON.stringify(_fullContent));

  contentEl.innerHTML = renderMarkdown(content, { sourceUrl: chat.url || '' });
  wrapChatTurns(contentEl);

  // Assign 0-based message index to each turn — used by setupTurnDeleteMode
  contentEl.querySelectorAll('.chat-turn').forEach((turn, i) => {
    turn.dataset.msgIndex = i;
  });

  processSources(contentEl);
  setupSourcesPanel();

  // ── C.7 \u2014 Per-message copy button ────────────────────────────────────────
  contentEl.querySelectorAll('.chat-turn').forEach(turn => {
    const copyBtn = document.createElement('button');
    copyBtn.className = 'turn-copy-btn';
    copyBtn.setAttribute('aria-label', 'Copy message');
    copyBtn.title = 'Copy message';
    copyBtn.innerHTML =
      '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<rect width="13" height="13" x="9" y="9" rx="2"/>' +
      '<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>' +
      '</svg>';
    copyBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const text = (turn.querySelector('.chat-turn__body')?.textContent ?? turn.textContent).trim();
      navigator.clipboard.writeText(text).then(() => {
        copyBtn.classList.add('turn-copy-btn--copied');
        copyBtn.setAttribute('aria-label', 'Copied!');
        setTimeout(() => {
          copyBtn.classList.remove('turn-copy-btn--copied');
          copyBtn.setAttribute('aria-label', 'Copy message');
        }, 2000);
      }).catch(() => {});
    });
    turn.appendChild(copyBtn);
  });

  contentEl.hidden = false;

  // ── Prompts count + hover overlay ─────────────────────────────────────────
  // Supports two markdown formats produced by the serializer:
  //   1. Emoji format (current): <p> elements whose text starts with 🙋
  //   2. Heading format (legacy): .chat-turn--user divs from wrapChatTurns
  const promptsEl = document.getElementById('meta-prompts');
  if (promptsEl) {
    promptsEl.innerHTML = '';

    // Gather user-turn elements and their display text
    let userTurns; // Array<{ el: Element, text: string }>

    const wrappedEls = Array.from(contentEl.querySelectorAll('.chat-turn--user'));
    if (wrappedEls.length > 0) {
      // Legacy heading format
      userTurns = wrappedEls.map((el, i) => {
        el.id = `p${i + 1}`;
        return { el, text: el.querySelector('.chat-turn__body')?.textContent?.trim() || '' };
      });
    } else {
      // Current emoji format: paragraphs that begin with the 🙋 emoji
      const USER_EMOJI = '\uD83D\uDE4B'; // 🙋
      const emojiEls = Array.from(contentEl.querySelectorAll('p')).filter(
        p => p.textContent.trimStart().startsWith(USER_EMOJI)
      );
      userTurns = emojiEls.map((el, i) => {
        el.id = `p${i + 1}`;
        // Strip the leading 🙋 glyph (may be followed by gender/skin modifiers)
        // and any surrounding whitespace to obtain a clean snippet.
        const raw = el.textContent.replace(/^\s*\uD83D\uDE4B[\uD83C\uDFFB-\uD83C\uDFFF\u200D\u2640\u2642\uFE0F]*/u, '').trim();
        return { el, text: raw };
      });
    }

    if (userTurns.length > 0) {
      const trigger = document.createElement('span');
      trigger.className = 'meta-prompts__trigger';
      trigger.innerHTML = `<span class="meta-chip__icon" aria-hidden="true">\u2753</span> ${userTurns.length} prompt${userTurns.length !== 1 ? 's' : ''}`;

      const overlay = document.createElement('div');
      overlay.className = 'prompts-overlay';
      overlay.setAttribute('role', 'list');

      userTurns.forEach(({ text }, i) => {
        const snippet = text.length > 72 ? text.slice(0, 69) + '\u2026' : text;
        const a = document.createElement('a');
        a.href      = `#p${i + 1}`;
        a.className = 'prompts-overlay__item';
        a.setAttribute('role', 'listitem');
        a.title     = text.slice(0, 300);
        a.innerHTML = `<span class="prompts-overlay__num">${i + 1}.</span> ${escapeHtml(snippet)}`;
        overlay.appendChild(a);
      });

      promptsEl.appendChild(trigger);
      promptsEl.appendChild(overlay);
      promptsEl.hidden = false;
    } else {
      promptsEl.hidden = true;
    }
  }

  // ── Assembled-chats header consolidation ──────────────────────────────
  // -- C.28 � Responses count + hover overlay -------------------------------
  // Mirrors the prompts overlay above: gather assistant-turn elements,
  // build a trigger badge and a dropdown list of clickable anchors.
  const responsesEl = document.getElementById('meta-responses');
  if (responsesEl) {
    responsesEl.innerHTML = '';

    let asstTurns; // Array<{ el: Element, text: string }>

    const wrappedAsstEls = Array.from(contentEl.querySelectorAll('.chat-turn--assistant'));
    if (wrappedAsstEls.length > 0) {
      // Legacy heading format
      asstTurns = wrappedAsstEls.map((el, i) => {
        el.id = `r${i + 1}`;
        return { el, text: el.querySelector('.chat-turn__body')?.textContent?.trim() || '' };
      });
    } else {
      // Current emoji format: paragraphs that begin with the ?? emoji
      const ASST_EMOJI = '\uD83E\uDD16'; // ??
      const emojiEls = Array.from(contentEl.querySelectorAll('p')).filter(
        p => p.textContent.trimStart().startsWith(ASST_EMOJI)
      );
      asstTurns = emojiEls.map((el, i) => {
        el.id = `r${i + 1}`;
        // Strip the leading ?? glyph (may be followed by gender/skin modifiers)
        const raw = el.textContent.replace(/^\s*\uD83E\uDD16[\uD83C\uDFFB-\uD83C\uDFFF\u200D\u2640\u2642\uFE0F]*/u, '').trim();
        return { el, text: raw };
      });
    }

    if (asstTurns.length > 0) {
      const trigger = document.createElement('span');
      trigger.className = 'meta-responses__trigger';
      trigger.innerHTML = `<span class="meta-chip__icon" aria-hidden="true">\u{1F4A1}</span> ${asstTurns.length} response${asstTurns.length !== 1 ? 's' : ''}`;

      const overlay = document.createElement('div');
      overlay.className = 'responses-overlay';
      overlay.setAttribute('role', 'list');

      asstTurns.forEach(({ text }, i) => {
        const snippet = text.length > 72 ? text.slice(0, 69) + '\u2026' : text;
        const a = document.createElement('a');
        a.href      = `#r${i + 1}`;
        a.className = 'responses-overlay__item';
        a.setAttribute('role', 'listitem');
        a.title     = text.slice(0, 300);
        a.innerHTML = `<span class="responses-overlay__num">${i + 1}.</span> ${escapeHtml(snippet)}`;
        overlay.appendChild(a);
      });

      responsesEl.appendChild(trigger);
      responsesEl.appendChild(overlay);
      responsesEl.hidden = false;
    } else {
      responsesEl.hidden = true;
    }
  }

  // -- C.28 � Per-message ordinal labels ----------------------------------
  // Always inject; visibility is controlled by body.ordinals-hidden CSS class
  // applied by init() based on the readerSettings.showOrdinals setting.
  addOrdinalLabels(contentEl);

  // When the chat was created by assembling multiple source chats, show a
  // header badge listing each source section with a click-to-scroll link.
  const assembledEl = document.getElementById('meta-assembled');
  if (assembledEl) {
    assembledEl.innerHTML = '';
    const isAssembled = Boolean(meta.isAssembled);
    if (isAssembled) {
      // The digest markdown emits `## <title>` for each source section.
      // We skip the optional "Contents" TOC heading.
      const sectionHeadings = Array.from(contentEl.querySelectorAll('h2')).filter(
        h => h.textContent.trim().toLowerCase() !== 'contents'
      );

      if (sectionHeadings.length > 0) {
        sectionHeadings.forEach((h, i) => { h.id = `assembled-section-${i}`; });

        const n = sectionHeadings.length;
        const trigger = document.createElement('span');
        trigger.className = 'meta-assembled__trigger';
        trigger.textContent = `\u{1F517} ${n} chat${n !== 1 ? 's' : ''} assembled`;

        const overlay = document.createElement('div');
        overlay.className = 'assembled-overlay';
        overlay.setAttribute('role', 'list');

        sectionHeadings.forEach((h, i) => {
          const title   = h.textContent.trim();
          const snippet = title.length > 68 ? title.slice(0, 65) + '\u2026' : title;
          const a = document.createElement('a');
          a.href      = `#assembled-section-${i}`;
          a.className = 'assembled-overlay__item';
          a.setAttribute('role', 'listitem');
          a.title     = title;
          a.innerHTML = `<span class="assembled-overlay__num">${i + 1}.</span> ${escapeHtml(snippet)}`;
          overlay.appendChild(a);
        });

        assembledEl.appendChild(trigger);
        assembledEl.appendChild(overlay);
        assembledEl.hidden = false;
      } else {
        assembledEl.hidden = true;
      }
    } else {
      assembledEl.hidden = true;
    }
  }

  // ── Copy-code button wiring ─────────────────────────────────────────
  // Use event delegation on the content container so no per-button listeners.
  contentEl.addEventListener('click', (e) => {
    const btn = e.target.closest('.code-block__copy');
    if (!btn) return;
    // Read raw text from the <code> element \u2014 textContent auto-decodes HTML entities.
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

  // ── Source-chat link wiring \u2014 select originating chat in sidepanel tree ──
  contentEl.addEventListener('click', (e) => {
    const link = e.target.closest('.source-chat-link');
    if (!link) return;
    e.preventDefault();
    const chatId = link.dataset.selectChat;
    if (!chatId) return;
    browser.runtime.sendMessage({ type: 'SELECT_CHAT', chatId }).catch(() => {});
  });
}

/**
 * C.15 \u2014 Set up the interactive star-rating widget in the reader header.
 * Renders 5 clickable stars into #reader-rating and persists changes to storage.
 *
 * @param {string} chatId         ID of the currently displayed chat
 * @param {number|null} initRating Current rating (1–5) or null/0
 * @param {Object} storage        browser.storage.local-like object
 */
/**
 * C.19 \u2014 Show a dismissible stale-review banner when a chat is overdue.
 * Banner renders inside #stale-banner and lets the user mark as reviewed.
 *
 * @param {string} chatId
 * @param {Object} chat     chat metadata (needs flaggedAsStale, reviewDate)
 * @param {Object} storage  browser.storage.local-like API
 */
export function setupStaleBanner(chatId, chat, storage) {
  const banner = document.getElementById('stale-banner');
  if (!banner || !chat || !chat.flaggedAsStale) return;

  const dateText = chat.reviewDate
    ? `This content was due for review on ${chat.reviewDate}`
    : 'This content has been flagged as stale';

  banner.innerHTML =
    `<span class="stale-banner__icon" aria-hidden="true">\u26A0</span>` +
    `<span class="stale-banner__text">${dateText}.</span>` +
    `<button class="stale-banner__dismiss" type="button">Mark as reviewed</button>`;
  banner.hidden = false;

  banner.querySelector('.stale-banner__dismiss')?.addEventListener('click', async () => {
    banner.hidden = true;
    try {
      // New per-chat-key format: patch only the individual key.
      const r = await storage.get([`chat:${chatId}`, 'chats']);
      if (r[`chat:${chatId}`]) {
        await storage.set({ [`chat:${chatId}`]: { ...r[`chat:${chatId}`], flaggedAsStale: false } });
      } else {
        // Legacy format fallback.
        const chats   = r.chats || [];
        const updated = chats.map(c =>
          c.id === chatId ? { ...c, flaggedAsStale: false } : c
        );
        await storage.set({ chats: updated });
      }
    } catch (err) {
      console.error('Failed to mark chat as reviewed:', err);
    }
  });
}

export function setupRating(chatId, initRating, storage) {
  const el = document.getElementById('reader-rating');
  if (!el || !chatId || !storage) return;

  let rating = initRating || 0;

  function renderStars() {
    el.innerHTML = '';
    for (let i = 1; i <= 5; i++) {
      const btn = document.createElement('button');
      btn.className = `reader-star-btn${i <= rating ? ' is-set' : ''}`;
      btn.textContent = '\u2605';
      btn.setAttribute('aria-label', `${i} star${i > 1 ? 's' : ''}`);
      btn.setAttribute('aria-pressed', i <= rating ? 'true' : 'false');
      btn.addEventListener('click', async () => {
        // Toggle off when clicking the current top star
        rating = (rating === i) ? 0 : i;
        renderStars();
        try {
          // New per-chat-key format: patch only the individual key.
          const r = await storage.get([`chat:${chatId}`, 'chats']);
          if (r[`chat:${chatId}`]) {
            await storage.set({ [`chat:${chatId}`]: { ...r[`chat:${chatId}`], rating: rating || null } });
          } else {
            // Legacy format fallback.
            const chats  = r.chats || [];
            const updated = chats.map(c => c.id === chatId ? { ...c, rating: rating || null } : c);
            await storage.set({ chats: updated });
          }
        } catch (err) {
          console.error('Failed to save rating:', err);
        }
      });
      el.appendChild(btn);
    }
    el.hidden = false;
  }

  renderStars();
}

/**
 * C.26 \u2014 Wire the "Copy" button in the reader header for the currently displayed chat.
 * Reads the clipboard format from storage, serialises the chat, writes to clipboard.
 * Shows visual feedback on the button (\u2713 Copied / fallback textarea prompt).
 * @param {Object} chat       \u2014 full chat object (with content and messages)
 * @param {Object} storage    \u2014 browser.storage.local-like object
 */
export async function setupReaderCopyButton(chat, storage) {
  const btn = document.getElementById('reader-copy-btn');
  if (!btn) return;

  btn.addEventListener('click', async () => {
    const label = btn.querySelector('.btn-reader-action__label');
    try {
      const settings = await getClipboardSettings(storage);
      const text     = serialiseChats([chat], settings);

      if (text.length > MAX_CLIPBOARD_CHARS) {
        if (label) label.textContent = 'Too large';
        btn.classList.add('btn-reader-action--error');
        setTimeout(() => {
          if (label) label.textContent = 'Copy';
          btn.classList.remove('btn-reader-action--error');
        }, 2000);
        return;
      }

      let result;
      if (settings.format === 'html') {
        const plain = serialiseChats([chat], { ...settings, format: 'plain' });
        result = await writeToClipboardHtml(text, plain);
      } else {
        result = await writeToClipboard(text);
      }
      const { success, usedFallback } = result;

      if (success) {
        if (label) label.textContent = '\u2713 Copied';
        btn.classList.add('btn-reader-action--success');
        setTimeout(() => {
          if (label) label.textContent = 'Copy';
          btn.classList.remove('btn-reader-action--success');
        }, 2000);
      } else if (usedFallback) {
        if (label) label.textContent = 'Select all + paste';
        setTimeout(() => {
          if (label) label.textContent = 'Copy';
        }, 3000);
      }
    } catch (_err) {
      if (label) label.textContent = 'Failed';
      btn.classList.add('btn-reader-action--error');
      setTimeout(() => {
        if (label) label.textContent = 'Copy';
        btn.classList.remove('btn-reader-action--error');
      }, 2000);
    }
  });
}

/**
 * Main entry point \u2014 reads chatId from URL, loads from storage, renders.
 * @param {Object} storage  Object with a `.get(keys)` method \u2014 injectable for testing
 */
export async function init(storage) {
  try {
    const params  = new URLSearchParams(window.location.search);
    const chatId  = params.get('chatId');

    if (!chatId) {
      showError('No chatId specified in the URL.');
      return;
    }

    const result = await storage.get([`chat:${chatId}`, 'chats']);
    // Support both new per-chat-key format and legacy 'chats' array.
    const chat = result[`chat:${chatId}`]
      || (Array.isArray(result.chats) ? result.chats.find(c => c.id === chatId) : null)
      || null;

    if (!chat) {
      showError(`Conversation not found (id: ${chatId}). It may have been deleted.`);
      return;
    }

    // C.28 � Apply show-ordinals setting before rendering
    try {
      const rs = await storage.get(['readerSettings']);
      const showOrdinals = rs.readerSettings?.showOrdinals ?? true;
      if (!showOrdinals) {
        document.body.classList.add('ordinals-hidden');
      } else {
        document.body.classList.remove('ordinals-hidden');
      }
    } catch (_) {}

    // For backlinks we need metadata about other chats.
    // Try new chatIndex first, fall back to legacy chats array.
    const idxResult = await storage.get(['chatIndex', 'chats']);
    const chats = Array.isArray(idxResult.chatIndex)
      ? idxResult.chatIndex
      : (Array.isArray(idxResult.chats) ? idxResult.chats : []);

    renderChat(chat);
    setupReaderCopyButton(chat, storage);  // C.26 — copy button
    setupRating(chatId, chat.rating, storage);
    setupStaleBanner(chatId, chat, storage);
    setupScrollFeatures(chatId);          // C.22 — pass chatId for persistence
    setupAnnotations(chatId, storage, chat);
    setupStickyNotes(chatId, storage, renderMarkdown);
    setupTurnDeleteMode(chatId, chat, storage);
    // C.8 — render backlinks: chats that reference this one in annotation notes
    await renderBacklinksSection(chatId, chat.title, chats, storage);

    // C.22 -- Restore saved scroll position OR navigate to hash anchor.
    // Deferred to AFTER all awaits so every async DOM mutation (backlinks,
    // sticky-note overlays, annotation counts) has settled before we read
    // getBoundingClientRect().  A double-rAF ensures the browser has had at
    // least one layout pass to compute stable element positions.
    if (window.location.hash) {
      const hash        = window.location.hash.slice(1);
      const snippetHint = new URLSearchParams(window.location.search).get('snippet');
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const anchorEl = document.getElementById(hash);
        if (!anchorEl) return;
        // Offset by the sticky header height so the target isn't hidden behind it.
        const header  = document.getElementById('reader-header');
        const headerH = header ? header.offsetHeight : 0;

        // If a snippet hint was provided, try to locate the specific block within
        // the turn and scroll to it instead of just the message start.
        if (snippetHint) {
          const target = _findEntityBlock(anchorEl, snippetHint);
          if (target) {
            const blockTop = target.getBoundingClientRect().top + window.scrollY - headerH - 12;
            window.scrollTo({ top: Math.max(0, blockTop), behavior: 'instant' });
            _flashEntityTarget(target);
            return;
          }
        }

        const top = anchorEl.getBoundingClientRect().top + window.scrollY - headerH - 8;
        window.scrollTo({ top: Math.max(0, top), behavior: 'instant' });
      }));
    } else {
      restoreScrollPosition(chatId);        // C.22
    }
  } catch (err) {
    showError(`Failed to load conversation: ${err.message}`);
  }
}

// ── Entity-target helpers ──────────────────────────────────────────────────────

/**
 * Given a turn anchor element and a snippet hint string, locate the best
 * matching entity block (code block, citation link, table) within that turn's
 * rendered content.
 *
 * For code blocks the hint is the first non-empty line of the code body.
 * The search walks forward from anchorEl through all subsequent siblings until
 * the next same-level turn anchor is encountered.
 *
 * @param {Element} anchorEl  The turn element (#r1, #p2, …)
 * @param {string}  hint      Short identifying string built by entity-navigation.js
 * @returns {Element|null}    The best matching block element, or null
 */
export function _findEntityBlock(anchorEl, hint) {
  if (!hint) return null;
  const hintLc = hint.toLowerCase().trim();

  // Sentinel: flash the anchor element itself (used for prompt, toolCall, artifact, etc.)
  if (hintLc === 'turn:self') return anchorEl;

  // Audio cards use an index-based hint ("audio:N") — return the Nth .audio-card in the turn.
  const audioHintMatch = hintLc.match(/^audio:(\d+)$/);
  if (audioHintMatch) {
    const targetIdx = parseInt(audioHintMatch[1], 10);
    const audioCards = [];
    let scanEl = anchorEl;
    while (scanEl) {
      scanEl.querySelectorAll('.audio-card').forEach(card => audioCards.push(card));
      scanEl = scanEl.nextElementSibling;
      if (scanEl && /^[pr]\d+$/.test(scanEl.id ?? '')) break;
    }
    return audioCards[targetIdx] ?? audioCards[0] ?? null;
  }

  // Collect all candidate blocks from anchorEl downwards until the next turn.
  const candidates = [];
  let el = anchorEl;
  // Include anchorEl itself, then walk nextElementSibling until we hit another
  // turn anchor (id="p..." or id="r...") or run out of siblings.
  while (el) {
    // Fenced code blocks → .code-block
    el.querySelectorAll('.code-block').forEach(block => {
      const codeEl = block.querySelector('code');
      if (codeEl) {
        const text = codeEl.textContent ?? '';
        const firstLine = text.split('\n').find(l => l.trim() !== '') ?? '';
        if (firstLine.toLowerCase().trim() === hintLc) candidates.push({ el: block, score: 2 });
        else if (text.toLowerCase().includes(hintLc))  candidates.push({ el: block, score: 1 });
      }
    });
    // Attachment chips → .file-attachment-chip (matched by filename)
    el.querySelectorAll('.file-attachment-chip').forEach(chip => {
      const nameEl = chip.querySelector('.file-attachment-chip__name');
      if (nameEl && nameEl.textContent.toLowerCase().trim() === hintLc) {
        candidates.push({ el: chip, score: 2 });
      }
    });
    // Inline images → img.chat-image (hint = altText)
    el.querySelectorAll('img.chat-image').forEach(img => {
      const alt = (img.alt ?? '').toLowerCase().trim();
      if (alt && alt === hintLc)           candidates.push({ el: img, score: 2 });
      else if (alt && alt.includes(hintLc)) candidates.push({ el: img, score: 1 });
    });
    // GFM pipe tables → .table-wrapper (hint = first raw markdown row, e.g. "| col1 | col2 |")
    el.querySelectorAll('.table-wrapper').forEach(wrapper => {
      const headerCells = [...wrapper.querySelectorAll('thead th')]
        .map(th => th.textContent.trim().toLowerCase());
      if (headerCells.length === 0) return;
      // Normalise hint: strip leading/trailing pipes, split on |, trim each cell
      const hintCells = hintLc.replace(/^\||\|$/g, '').split('|').map(c => c.trim());
      if (hintCells.length === headerCells.length && hintCells.every((c, i) => c === headerCells[i])) {
        candidates.push({ el: wrapper, score: 2 });
      } else if (hintCells.some(c => c && headerCells.some(h => h.includes(c)))) {
        candidates.push({ el: wrapper, score: 1 });
      }
    });
    // Anchor links (citation hint = url or title)
    el.querySelectorAll('a[href]').forEach(a => {
      if (a.href.toLowerCase().includes(hintLc) ||
          a.textContent.toLowerCase().trim() === hintLc) {
        candidates.push({ el: a, score: 2 });
      }
    });
    el = el.nextElementSibling;
    // Stop when we reach the next turn anchor
    if (el && /^[pr]\d+$/.test(el.id ?? '')) break;
  }

  if (candidates.length === 0) return null;
  // Return highest-scored candidate (first one wins ties — document order)
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0].el;
}

const FLASH_CLASS = 'entity-target';
const FLASH_DURATION_MS = 2400;

/**
 * Briefly apply `.entity-target` to the matched block so users can see which
 * element was navigated to.  The class is removed after the animation completes.
 */
export function _flashEntityTarget(el) {
  el.classList.add(FLASH_CLASS);
  setTimeout(() => el.classList.remove(FLASH_CLASS), FLASH_DURATION_MS);
}

// ─── Excerpt Deletion ─────────────────────────────────────────────────────────

/**
 * Returns true when an entity's characteristic text content still appears in
 * the given (updated) message markdown.  Used by deleteExcerptFromChat to
 * prune entities whose defining text was removed.
 *
 * @param {Object} entity      Entity object
 * @param {string} entityType  One of ENTITY_TYPES values
 * @param {string} content     Updated message markdown
 * @returns {boolean}
 */
export function _entityPresentInContent(entity, entityType, content) {
  switch (entityType) {
    case ENTITY_TYPES.CODE:
      return !entity.code || content.includes(entity.code);
    case ENTITY_TYPES.CITATION:
      return !entity.url || content.includes(entity.url);
    case ENTITY_TYPES.TABLE:
      return !Array.isArray(entity.headers) || entity.headers.length === 0
        || content.includes(entity.headers[0]);
    case ENTITY_TYPES.DIAGRAM:
      if (!entity.source) return true;
      return content.includes(entity.source.slice(0, Math.min(30, entity.source.length)));
    default:
      // artifact, image, audio, attachment, toolCall: keep conservatively
      return true;
  }
}

/**
 * Delete a text excerpt from a specific message in the chat.
 *
 * Searches for `selectedText` in `chat.messages[msgIndex].content` (first
 * occurrence) and removes it.  Rebuilds `chat.content` via messagesToMarkdown,
 * prunes entity arrays for the affected message (removing entities whose
 * characteristic text is no longer present), and returns a new chat object
 * without mutating the original.
 *
 * Returns null when:
 * - The chat has no messages array, or msgIndex is out of range
 * - selectedText is empty or not found in the message markdown
 *
 * Note: messageCount is intentionally unchanged — the turn still exists, it
 * just has less content.
 *
 * @param {Object} chat          Full chat object with .messages and .content
 * @param {number} msgIndex      0-based index of the message to edit
 * @param {string} selectedText  Exact text excerpt to remove
 * @returns {Object|null}        Updated chat object, or null on failure
 */

/**
 * Strip any markdown prefix that the renderer removes before displaying a line
 * to the user (list markers, heading hashes, blockquote >, horizontal-rule ---,
 * and the leading role emoji added by messagesToMarkdown).
 *
 * @param {string} line
 * @returns {string}
 */
function _stripMarkdownPrefix(line) {
  return line
    .replace(/^#{1,6}\s+/, '')          // ## heading
    .replace(/^[-*]\s+/, '')            // - or * list item
    .replace(/^\d+\.\s+/, '')           // 1. ordered list
    .replace(/^>\s?/, '')               // > blockquote
    // Role emoji added by messagesToMarkdown (🙋 or 🤖) + space
    .replace(/^[\u{1F300}-\u{1FFFF}\u{2600}-\u{27BF}]\s+/u, '');
}

/**
 * Strip inline markdown formatting so that the visible text can be compared
 * against DOM-selected text (which never contains the markers).
 * Handles: **bold**, *italic*, _italic_, `code`, ~~strike~~, [text](url),
 * ![alt](url), and table-pipe `|` characters.
 */
function _stripMarkdownInline(text) {
  return text
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')   // ![alt](url) → alt
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')     // [text](url) → text
    .replace(/\*\*([^*]+)\*\*/g, '$1')            // **bold**
    .replace(/\*([^*]+)\*/g, '$1')                // *italic*
    .replace(/(?<!\w)_([^_]+)_(?!\w)/g, '$1')    // _italic_
    .replace(/`([^`]+)`/g, '$1')                  // `code`
    .replace(/~~([^~]+)~~/g, '$1')                // ~~strikethrough~~
    .replace(/\|/g, ' ')                           // table pipes → space
    .replace(/\s+/g, ' ')                          // normalise whitespace
    .trim();
}

/** Matches GFM table separator rows: | --- | :---: | ---: | */
const _TABLE_SEP_RE = /^\|(\s*:?-+:?\s*\|)+\s*$/

/**
 * After an exact substring match, expand the range to cover any immediately
 * surrounding inline-formatting markers so that removing the visible text of
 * "**bold**" also removes the "**" delimiters.
 * Checks longest markers first (** before *) to avoid partial expansion.
 */
function _expandInlineRange(src, start, end) {
  const PAIRS = [['**', '**'], ['~~', '~~'], ['*', '*'], ['`', '`']];
  for (const [open, close] of PAIRS) {
    if (
      start >= open.length &&
      src.slice(start - open.length, start) === open &&
      src.slice(end, end + close.length) === close
    ) {
      return { start: start - open.length, end: end + close.length };
    }
  }
  return { start, end };
}

/**
 * Given text as the user selected it from the rendered DOM, find the
 * corresponding byte range [start, end) in the stored `markdownSrc`.
 *
 * Strategy:
 *  1. First try a plain indexOf (works for prose / already-matching text).
 *  2. If that fails, split the selection into non-empty lines, strip each
 *     line's markdown prefix, then look for a contiguous sequence of
 *     markdown source lines whose stripped form matches.  The returned range
 *     covers the whole block of markdown lines (including prefixes and the
 *     trailing newline of the last matched line).
 *
 * Returns { start, end } or null when no match is found.
 *
 * @param {string} markdownSrc
 * @param {string} selectedText
 * @returns {{ start: number, end: number }|null}
 */
export function _findMarkdownRange(markdownSrc, selectedText) {
  // ── 1. Exact match ───────────────────────────────────────────────────────
  const exactIdx = markdownSrc.indexOf(selectedText);
  if (exactIdx !== -1) {
    // Expand to cover surrounding inline markers (**bold**, `code`, ~~strike~~)
    // so that deleting a word rendered from "**word**" also removes the "**".
    return _expandInlineRange(markdownSrc, exactIdx, exactIdx + selectedText.length);
  }

  // ── 2. Line-by-line matching ─────────────────────────────────────────────
  // Build a list of non-empty lines from the selection (as the user sees them).
  // Apply inline stripping so that tab/space-separated table cell text matches
  // normalised source lines regardless of bold/italic markers or pipe chars.
  const selLines = selectedText
    .split('\n')
    .map(l => _stripMarkdownInline(l))
    .filter(l => l.length > 0);

  if (selLines.length === 0) return null;

  // Index all markdown source lines with their byte offsets.
  const srcLines = [];
  let pos = 0;
  for (const l of markdownSrc.split('\n')) {
    srcLines.push({ text: l, start: pos, end: pos + l.length });
    pos += l.length + 1; // +1 for '\n'
  }

  // For each source line, compute the fully "visible" text: strip line prefix
  // (##, -, >, …) then inline markers (**bold**, `code`, |pipes|, …).
  const stripped = srcLines.map(({ text }) =>
    _stripMarkdownInline(_stripMarkdownPrefix(text))
  );

  // Returns true for source lines that produce no visible selectable text.
  const isInvisibleLine = (raw) =>
    /^```/.test(raw) ||
    /^-{3,}\s*$/.test(raw) ||
    _TABLE_SEP_RE.test(raw);

  // Try to find, starting at each source line, a contiguous run whose stripped
  // forms equal (or contain) the selLines sequence.
  outer: for (let si = 0; si < srcLines.length; si++) {
    // Skip source lines that produce no visible text the user can select.
    if (!stripped[si] || isInvisibleLine(srcLines[si].text)) continue;

    let li = 0; // index into selLines

    // Walk through selLines trying to match src lines.
    let sj = si;
    while (li < selLines.length && sj < srcLines.length) {
      const strippedLine = stripped[sj];
      // Skip invisible source lines that produce no visible text
      if (!strippedLine || isInvisibleLine(srcLines[sj].text)) {
        sj++;
        continue;
      }
      // The normalised src line must contain the sel line (or vice-versa for
      // partial-line selections)
      if (!strippedLine.includes(selLines[li]) && !selLines[li].includes(strippedLine)) {
        continue outer; // mismatch — try next starting position
      }
      li++;
      sj++;
    }

    if (li < selLines.length) continue; // didn't match all selection lines

    // Found a match: range covers srcLines[si..sj-1]
    // Find the actual last matched line (sj-1 might have been incremented past blanks)
    const firstLine = srcLines[si];
    const lastLine  = srcLines[sj - 1];
    // Include the trailing newline so the blank that was between paragraphs is
    // preserved — but avoid eating the newline if sj is the last line.
    const end = sj < srcLines.length ? lastLine.end + 1 : lastLine.end;
    return { start: firstLine.start, end };
  }

  return null; // no match
}

export function deleteExcerptFromChat(chat, msgIndex, selectedText) {
  if (!Array.isArray(chat.messages) || msgIndex < 0 || msgIndex >= chat.messages.length) return null;
  if (!selectedText || !selectedText.trim()) return null;

  const originalContent = chat.messages[msgIndex].content || '';
  const range = _findMarkdownRange(originalContent, selectedText);
  if (!range) return null; // text not found in stored markdown

  const updatedMsgContent =
    originalContent.slice(0, range.start) + originalContent.slice(range.end);

  const updatedMessages = chat.messages.map((m, i) =>
    i === msgIndex ? { ...m, content: updatedMsgContent } : m
  );

  // Update entity arrays for the affected message
  const entityUpdates = {};
  for (const entityType of Object.values(ENTITY_TYPES)) {
    if (!Array.isArray(chat[entityType])) continue;
    const updated = chat[entityType]
      .filter(e => {
        if (e.messageIndex !== msgIndex) return true; // other turns: unchanged
        if (entityType === ENTITY_TYPES.PROMPT) {
          // Prompt entity stays as long as the edited message is non-empty
          return updatedMsgContent.trim().length > 0;
        }
        return _entityPresentInContent(e, entityType, updatedMsgContent);
      })
      .map(e => {
        // For prompt entities in the edited turn: refresh cached text + word count
        if (e.messageIndex === msgIndex && entityType === ENTITY_TYPES.PROMPT) {
          return {
            ...e,
            text:      updatedMsgContent,
            wordCount: updatedMsgContent.trim().split(/\s+/).filter(Boolean).length,
          };
        }
        return e;
      });
    entityUpdates[entityType] = updated.length > 0 ? updated : undefined;
  }

  const fm = parseFrontmatter(chat.content || '');
  const updatedContent = messagesToMarkdown(updatedMessages, {
    title:        fm.title     || chat.title  || 'Untitled Chat',
    source:       fm.source    || chat.source || 'unknown',
    url:          fm.url       || chat.url    || '',
    timestamp:    chat.timestamp,
    messageCount: chat.messages.length, // turn count unchanged
  });

  const updatedChat = {
    ...chat,
    messages: updatedMessages,
    content:  updatedContent,
    // messageCount unchanged — the turn still exists, just edited
  };

  for (const [key, val] of Object.entries(entityUpdates)) {
    if (val === undefined) {
      delete updatedChat[key];
    } else {
      updatedChat[key] = val;
    }
  }

  return updatedChat;
}

// ─── Turn Deletion ────────────────────────────────────────────────────────────

/**
 * Remove specific turns from a chat by 0-based index, rebuilding the content
 * markdown from the updated messages array.
 *
 * Returns a copy of the chat with an empty messages array when turnIndices is
 * empty (no-op copy).  Returns null when the chat has no stored messages
 * (e.g. pure excerpts without a messages array).
 *
 * @param {Object}   chat         Full chat object with .messages and .content
 * @param {number[]} turnIndices  0-based indices of turns to delete
 * @returns {Object|null}  Updated chat object, or null when not applicable
 */
export function deleteTurnsFromChat(chat, turnIndices) {
  if (!Array.isArray(chat.messages) || chat.messages.length === 0) return null;
  if (!Array.isArray(turnIndices) || turnIndices.length === 0) return { ...chat };
  const indexSet        = new Set(turnIndices);
  const updatedMessages = chat.messages.filter((_, i) => !indexSet.has(i));

  // Build old-index → new-index remapping for entity messageIndex updates
  const indexMap = new Map();
  let newIdx = 0;
  for (let oldIdx = 0; oldIdx < chat.messages.length; oldIdx++) {
    if (!indexSet.has(oldIdx)) indexMap.set(oldIdx, newIdx++);
  }

  // Filter and remap every entity type stored on the chat object
  const entityUpdates = {};
  for (const entityType of Object.values(ENTITY_TYPES)) {
    if (!Array.isArray(chat[entityType])) continue;
    const updated = chat[entityType]
      .filter(e => !indexSet.has(e.messageIndex))
      .map(e => ({ ...e, messageIndex: indexMap.get(e.messageIndex) ?? e.messageIndex }));
    // Always write the key so deleted-all cases clear the array
    entityUpdates[entityType] = updated.length > 0 ? updated : undefined;
  }

  const fm = parseFrontmatter(chat.content || '');
  const updatedContent = messagesToMarkdown(updatedMessages, {
    title:        fm.title     || chat.title  || 'Untitled Chat',
    source:       fm.source    || chat.source || 'unknown',
    url:          fm.url       || chat.url    || '',
    timestamp:    chat.timestamp,
    messageCount: updatedMessages.length,
  });

  const updatedChat = {
    ...chat,
    messages:     updatedMessages,
    content:      updatedContent,
    messageCount: updatedMessages.length,
  };

  // Apply entity updates: set present arrays, delete empty ones
  for (const [key, val] of Object.entries(entityUpdates)) {
    if (val === undefined) {
      delete updatedChat[key];
    } else {
      updatedChat[key] = val;
    }
  }

  return updatedChat;
}

/**
 * Wire up the turn-deletion feature in the reader.
 *
 * Adds a "Select" toggle button to .reader-actions that attaches checkboxes
 * to each .chat-turn.  When at least one turn is checked, a "Delete" button
 * becomes visible.  On confirmation the selected turns are removed from the
 * stored chat, annotations are cleared (since character offsets shift), and
 * the page reloads to reflect the change.
 *
 * No-op when the chat has no messages array (excerpts) or when the required
 * DOM elements are absent.
 *
 * @param {string} chatId
 * @param {Object} chat     Full chat object (needs .messages)
 * @param {Object} storage  browser.storage.local-like API
 */
export function setupTurnDeleteMode(chatId, chat, storage) {
  const contentEl = document.getElementById('reader-content');
  if (!contentEl || !chatId || !storage) return;
  if (!Array.isArray(chat.messages) || chat.messages.length === 0) return;
  const actionsEl = document.querySelector('.reader-actions');
  if (!actionsEl) return;

  let selectMode = false;
  const selectedIndices = new Set();

  // ── Select toggle button ─────────────────────────────────────────────────
  const selectBtn = document.createElement('button');
  selectBtn.id        = 'reader-select-btn';
  selectBtn.className = 'btn-reader-action';
  selectBtn.type      = 'button';
  selectBtn.title     = 'Select turns to delete';
  selectBtn.setAttribute('aria-label', 'Select turns to delete');
  selectBtn.innerHTML =
    `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" ` +
    `stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">` +
      `<rect x="3" y="3" width="18" height="18" rx="2"/>` +
      `<polyline points="9 11 12 14 22 4"/>` +
    `</svg>` +
    `<span class="btn-reader-action__label">Select</span>`;

  // ── Delete button ────────────────────────────────────────────────────────
  const deleteBtn = document.createElement('button');
  deleteBtn.id        = 'reader-delete-turns-btn';
  deleteBtn.className = 'btn-reader-action btn-reader-action--danger';
  deleteBtn.type      = 'button';
  deleteBtn.title     = 'Delete selected turns';
  deleteBtn.setAttribute('aria-label', 'Delete selected turns');
  deleteBtn.hidden    = true;
  deleteBtn.innerHTML =
    `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" ` +
    `stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">` +
      `<polyline points="3 6 5 6 21 6"/>` +
      `<path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>` +
      `<path d="M10 11v6M14 11v6"/>` +
      `<path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>` +
    `</svg>` +
    `<span class="btn-reader-action__label">Delete ` +
      `<span id="reader-delete-count"></span>` +
    `</span>`;

  actionsEl.appendChild(selectBtn);
  actionsEl.appendChild(deleteBtn);

  // ── Helpers ──────────────────────────────────────────────────────────────
  function updateDeleteBtn() {
    const count = selectedIndices.size;
    deleteBtn.hidden = count === 0;
    const countEl = document.getElementById('reader-delete-count');
    if (countEl) countEl.textContent = count > 0 ? `(${count})` : '';
  }

  function addCheckboxes() {
    contentEl.querySelectorAll('.chat-turn').forEach(turn => {
      const idx = parseInt(turn.dataset.msgIndex ?? '-1', 10);
      if (idx < 0) return;
      const cb = document.createElement('input');
      cb.type      = 'checkbox';
      cb.className = 'turn-select-cb';
      cb.setAttribute('aria-label',
        `Select this ${turn.classList.contains('chat-turn--user') ? 'prompt' : 'response'}`);
      cb.dataset.msgIndex = idx;
      cb.checked = selectedIndices.has(idx);
      cb.addEventListener('change', () => {
        if (cb.checked) {
          selectedIndices.add(idx);
          turn.classList.add('turn-selected');
        } else {
          selectedIndices.delete(idx);
          turn.classList.remove('turn-selected');
        }
        updateDeleteBtn();
      });
      // Insert checkbox before the role icon/label
      const roleEl = turn.querySelector('.chat-turn__role');
      if (roleEl) roleEl.prepend(cb);
      else turn.prepend(cb);
    });
  }

  function removeCheckboxes() {
    contentEl.querySelectorAll('.turn-select-cb').forEach(cb => cb.remove());
    contentEl.querySelectorAll('.turn-selected').forEach(el => el.classList.remove('turn-selected'));
    selectedIndices.clear();
    updateDeleteBtn();
  }

  // Clicking a turn body (not on interactive child elements) toggles checkbox
  contentEl.addEventListener('click', (e) => {
    if (!selectMode) return;
    const turn = e.target.closest('.chat-turn');
    if (!turn) return;
    if (e.target.closest(
      '.turn-select-cb, .turn-copy-btn, .code-block__copy, .sources-trigger, a[href], button'
    )) return;
    const cb = turn.querySelector('.turn-select-cb');
    if (!cb) return;
    cb.checked = !cb.checked;
    cb.dispatchEvent(new Event('change'));
  });

  // ── Select toggle ────────────────────────────────────────────────────────
  selectBtn.addEventListener('click', () => {
    selectMode = !selectMode;
    document.body.classList.toggle('turn-select-mode', selectMode);
    selectBtn.classList.toggle('btn-reader-action--active', selectMode);
    const label = selectBtn.querySelector('.btn-reader-action__label');
    if (label) label.textContent = selectMode ? 'Cancel' : 'Select';
    if (selectMode) {
      addCheckboxes();
    } else {
      removeCheckboxes();
      deleteBtn.hidden = true;
    }
  });

  // ── Delete handler ───────────────────────────────────────────────────────
  deleteBtn.addEventListener('click', async () => {
    const indices = Array.from(selectedIndices);
    if (indices.length === 0) return;

    const noun = indices.length === 1 ? 'turn' : 'turns';
    /* c8 ignore next 3 */
    if (!window.confirm(
      `Delete ${indices.length} selected ${noun}? This cannot be undone.\n\n` +
      `Note: any text highlights in this chat will also be cleared.`
    )) return;

    const labelEl = deleteBtn.querySelector('.btn-reader-action__label');
    if (labelEl) labelEl.textContent = 'Deleting\u2026';
    deleteBtn.disabled = true;

    const updatedChat = deleteTurnsFromChat(chat, indices);
    if (!updatedChat) {
      /* c8 ignore next 4 */
      if (labelEl) labelEl.textContent = 'Error';
      deleteBtn.disabled = false;
      setTimeout(() => { if (labelEl) labelEl.textContent = `Delete (${indices.length})`; }, 2000);
      return;
    }

    try {
      const r = await storage.get([`chat:${chatId}`, 'chats', 'chatIndex']);

      // Persist updated chat (per-key format first, legacy array fallback)
      if (r[`chat:${chatId}`]) {
        await storage.set({ [`chat:${chatId}`]: updatedChat });
      } else {
        const chats   = Array.isArray(r.chats) ? r.chats : [];
        const updated = chats.map(c => c.id === chatId ? updatedChat : c);
        await storage.set({ chats: updated });
      }

      // Keep chatIndex metadata in sync (messageCount only)
      if (Array.isArray(r.chatIndex)) {
        const updatedIndex = r.chatIndex.map(c =>
          c.id === chatId ? { ...c, messageCount: updatedChat.messageCount } : c
        );
        await storage.set({ chatIndex: updatedIndex });
      }

      // Clear annotations — character offsets are invalid after turn removal
      await storage.set({ [`annotations:${chatId}`]: [] });

      // Reload to re-render content and update all header metadata
      /* c8 ignore next */
      window.location.reload();
    } catch (err) {
      logger.error('[reader] deleteTurns: failed to persist:', err);
      /* c8 ignore next 4 */
      if (labelEl) labelEl.textContent = 'Error';
      deleteBtn.disabled = false;
      setTimeout(() => { if (labelEl) labelEl.textContent = `Delete (${indices.length})`; }, 2000);
    }
  });
}

// ── Auto-run when loaded as a browser extension page ──────────────────────────
// This guard prevents accidental execution when reader.js is imported in tests.
/* c8 ignore next 4 */
if (typeof browser !== 'undefined' && browser.storage && document.getElementById('reader-content')) {
  init(browser.storage.local);
}
