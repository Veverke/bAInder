/**
 * bAInder Reader â€” reader.js
 *
 * Loads a saved chat from browser.storage.local and renders it in the reader page.
 * Pure functions are exported so they can be unit tested independently.
 */

import { parseFrontmatter } from '../lib/io/markdown-serialiser.js';
import {
  loadAnnotations, saveAnnotation, deleteAnnotation,
  serializeRange,  applyAnnotations, parseBacklinks,
} from '../lib/chat/annotations.js';
import { setupStickyNotes } from '../lib/sticky-notes/sticky-notes-ui.js';
import browser from '../lib/vendor/browser.js';
import { escapeHtml, generateId } from '../lib/utils/search-utils.js';
export { escapeHtml };  // re-export: callers that import escapeHtml from reader.js continue to work

// â”€â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

// â”€â”€â”€ Markdown Renderer â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Apply inline markdown formatting to a text segment.
 * Handles: **bold**, *italic*, _italic_, `inline code`, ![alt](src) images,
 *          [text](url) links, and bare https?:// URLs (auto-linked).
 * Input text must already be HTML-escaped.
 * @param {string} escaped  HTML-escaped text
 * @returns {string}  HTML with inline elements applied
 */
export function applyInline(escaped) {
  // â”€â”€ Pass 1: protect inline code spans (\x00 placeholders) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // These must be shielded earliest so nothing inside backticks gets parsed.
  const codeMap = [];
  let s = escaped.replace(/`([^`]+)`/g, (_, code) => {
    codeMap.push(`<code>${code}</code>`);
    return `\x00${codeMap.length - 1}\x00`;
  });

  // â”€â”€ Pass 2: protect images + explicit markdown links (\x01 placeholders) â”€
  // Shielding them prevents the bare-URL pass from double-linking the href.
  const linkMap = [];
  const protect = html => { linkMap.push(html); return `\x01${linkMap.length - 1}\x01`; };

  // Inline images ![alt](src) â€” must come before link handling
  s = s.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, src) => {
    return protect(`<img class="chat-image" src="${src}" alt="${alt}" loading="lazy">`);
  });

  // Inline links [text](url)
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, text, href) => {
    // Internal navigation: select a chat in the sidepanel tree
    if (href.startsWith('bainder://select-chat?id=')) {
      const chatId = href.slice('bainder://select-chat?id='.length);
      return protect(`<a href="#" class="source-chat-link" data-select-chat="${chatId}" title="Select this chat in the tree">${text}</a>`);
    }
    return protect(`<a href="${href}" target="_blank" rel="noopener noreferrer">${text}</a>`);
  });

  // â”€â”€ Pass 3: auto-link bare https?:// URLs â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // All explicit links/images are placeholders here, so we can't accidentally
  // double-match inside an href="â€¦" attribute.
  s = s.replace(/https?:\/\/[^\s<>"\x01]+/g, (url) => {
    // Trim trailing punctuation chars that are almost certainly sentence
    // punctuation rather than part of the URL (e.g. "see https://foo.com.")
    const trimmed  = url.replace(/[.,;:!?)'"\]]+$/, '');
    const trailing = url.slice(trimmed.length);
    const display  = trimmed.replace(/&amp;/g, '&'); // human-readable display
    return protect(`<a href="${trimmed}" target="_blank" rel="noopener noreferrer">${display}</a>`) + trailing;
  });

  // â”€â”€ Pass 4: bold / italic â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  s = s
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/(?<!\w)_([^_]+)_(?!\w)/g, '<em>$1</em>');

  // â”€â”€ Restore placeholders (links first, then code) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  /** Flush a paragraph buffer as a <p> element.
   * Lines joined with '\n' (from soft-break detection) become <br> elements.
   */
  function flushPara(buf) {
    const trimmed = buf.trim();
    if (!trimmed) return;
    // Soft-break segments (each was a line ending with '  ') â†’ <br>
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
    // â”€â”€ Microsoft Designer generated-image card â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    {
      const designerMatch = line.match(/^\[Microsoft Designer generated image\]\(([^)]+)\)$/);
      if (designerMatch) {
        flushPara(paraBuf); paraBuf = '';
        flushList();
        const designerSrc    = designerMatch[1];
        const designerSrcEsc = designerSrc.replace(/&/g, '&amp;');
        htmlParts.push(
          `<div class="designer-card">` +
            `<div class="designer-card__icon">ðŸŽ¨</div>` +
            `<div class="designer-card__body">` +
              `<div class="designer-card__title">AI Generated Image</div>` +
              `<div class="designer-card__note">Session-bound Â· embedded preview unavailable</div>` +
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
    // â”€â”€ Standalone image line  ![alt](src) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    if (/^!\[/.test(line)) {
      flushPara(paraBuf); paraBuf = '';
      flushList();
      // applyInline handles the ![alt](src) â†’ <img> conversion
      htmlParts.push(`<p>${applyInline(escapeHtml(line))}</p>`);
      i++;
      continue;
    }
    // â”€â”€ Fenced code block â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

    // â”€â”€ Heading â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

    // â”€â”€ Horizontal rule â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    if (/^-{3,}\s*$/.test(line)) {
      flushPara(paraBuf); paraBuf = '';
      flushList();
      htmlParts.push('<hr>');
      i++;
      continue;
    }

    // â”€â”€ Blockquote â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    if (/^>\s?/.test(line)) {
      flushPara(paraBuf); paraBuf = '';
      flushList();
      const bqText = line.replace(/^>\s?/, '');
      htmlParts.push(`<blockquote><p>${applyInline(escapeHtml(bqText))}</p></blockquote>`);
      i++;
      continue;
    }

    // â”€â”€ Unordered list item â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const ulMatch = line.match(/^[-*]\s+(.*)/);
    if (ulMatch) {
      flushPara(paraBuf); paraBuf = '';
      if (inList !== 'ul') { flushList(); inList = 'ul'; }
      listBuf.push(ulMatch[1]);
      i++;
      continue;
    }

    // â”€â”€ Ordered list item â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const olMatch = line.match(/^\d+\.\s+(.*)/);
    if (olMatch) {
      flushPara(paraBuf); paraBuf = '';
      if (inList !== 'ol') { flushList(); inList = 'ol'; }
      listBuf.push(olMatch[1]);
      i++;
      continue;
    }

    // â”€â”€ Blank line â€” paragraph break â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    if (line.trim() === '') {
      flushList();
      if (paraBuf.trim()) {
        flushPara(paraBuf);
        paraBuf = '';
      }
      i++;
      continue;
    }

    // â”€â”€ HTML comment â€” skip silently (e.g. TOC anchor comments in digests) â”€â”€
    if (/^\s*<!--.*-->\s*$/.test(line)) {
      i++;
      continue;
    }

    // â”€â”€ Regular text â€” accumulate into paragraph â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    flushList();
    // Markdown soft break: line ending with two spaces â†’ insert \n as <br> marker
    const softBreak = line.endsWith('  ');
    const cleanLine = softBreak ? line.slice(0, -2) : line;
    paraBuf += (paraBuf ? (softBreak ? '\n' : ' ') : '') + cleanLine;
    i++;
  }

  flushPara(paraBuf);
  flushList();

  return htmlParts.join('\n');
}

// â”€â”€â”€ Post-render DOM processing â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Walk the flat rendered-markdown children of `contentEl` and group them into
 * role-aware `.chat-turn--user` / `.chat-turn--assistant` wrapper divs.
 *
 * The reader's markdown format produces a flat sequence of:
 *   <h3>User</h3>, <p>â€¦</p>, <hr>, <h3>Assistant</h3>, <p>â€¦</p>, <hr>, â€¦
 *
 * This function turns that into:
 *   <div class="chat-turn chat-turn--user">â€¦</div>
 *   <div class="chat-turn chat-turn--assistant">â€¦</div>
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

    // Non-role group â€” append nodes directly (preserves leading meta content)
    for (const n of nodes) contentEl.appendChild(n);
  }
}

/**
 * Post-process rendered markdown to replace each **Sources:** + list block
 * with a compact `.sources-trigger` chip button that opens the sources panel.
 *
 * `renderMarkdown` turns the serialiser's output of:
 *   **Sources:**
 *   - [Title](url)
 * into `<p><strong>Sources:</strong></p><ul><li><a href="â€¦">â€¦</a></li></ul>`.
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
    if (!ul || ul.tagName !== 'UL') return;

    const links = Array.from(ul.querySelectorAll('a[href]'))
      .map(a => ({ href: a.getAttribute('href'), text: (a.textContent || '').trim() || a.getAttribute('href') }))
      .filter(l => l.href);

    if (links.length === 0) return;

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

    p.replaceWith(chip);
    ul.remove();
  });
}

/**
 * Create the sources side-panel singleton and wire all interactions:
 *   â€“ clicking any `.sources-trigger` button populates and opens the panel
 *   â€“ the close button, overlay click, and Escape key all close it
 *
 * Idempotent: safe to call multiple times (returns early after first call).
 */
export function setupSourcesPanel() {
  if (document.getElementById('sources-panel')) return;

  // â”€â”€ Panel â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  // â”€â”€ Dim overlay â€” clicking outside closes the panel â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  // Trigger clicks â€” event delegation so dynamically added chips work too
  document.addEventListener('click', (e) => {
    const trigger = e.target.closest('.sources-trigger');
    if (!trigger) return;
    try { openPanel(JSON.parse(trigger.dataset.sources || '[]')); } catch (_) {}
  });

  document.getElementById('sources-panel-close')?.addEventListener('click', closePanel);
  overlay.addEventListener('click', closePanel);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePanel(); });
}

/**
 * Set up the text-selection annotation toolbar (R2).
 * Safe no-op when annotation elements are absent (e.g. unit tests).
 * @param {string} chatId
 * @param {object} storage  â€” browser.storage.local-like API
 */
export async function setupAnnotations(chatId, storage) {
  if (!chatId || !storage) return;
  const toolbar   = document.getElementById('annotation-toolbar');
  const contentEl = document.getElementById('reader-content');
  if (!toolbar || !contentEl) return;

  let selectedColor  = '#fef08a';
  let pendingRange   = null;
  let allAnnotations = [];

  // â”€â”€ Annotation count summary in header â€” built synchronously, before any
  //    await, so it lands in the DOM on every load regardless of timing. â”€â”€â”€â”€
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

  // â”€â”€ Re-apply stored annotations â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  try {
    const existing = await loadAnnotations(chatId, storage);
    allAnnotations = existing;
    applyAnnotations(contentEl, existing);
  } catch (_) {}

  // â”€â”€ Colour swatch selection â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  toolbar.querySelectorAll('.ann-color-btn').forEach(btn => {
    if (btn.dataset.color === selectedColor) btn.classList.add('selected');
    btn.addEventListener('click', () => {
      toolbar.querySelectorAll('.ann-color-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      selectedColor = btn.dataset.color;
    });
  });

  // â”€â”€ Render / update the header summary â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  // â”€â”€ Summary dropdown hover wiring â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  let _annHideTimer = null;
  function _showAnnDropdown() {
    if (!allAnnotations.length) return;
    clearTimeout(_annHideTimer);
    annDropdown.hidden = false;
  }
  function _scheduleAnnHide() {
    _annHideTimer = setTimeout(() => { annDropdown.hidden = true; }, 150);
  }
  if (annBtn) {
    annBtn.addEventListener('mouseenter', _showAnnDropdown);
    annBtn.addEventListener('mouseleave', _scheduleAnnHide);
  }
  if (annDropdown) {
    annDropdown.addEventListener('mouseenter', () => clearTimeout(_annHideTimer));
    annDropdown.addEventListener('mouseleave', _scheduleAnnHide);
  }

  // â”€â”€ Prevent toolbar interactions from clearing the text selection â”€â”€â”€â”€â”€â”€â”€â”€
  // preventDefault on ALL toolbar mousedowns stops the browser from clearing
  // the document text selection (which it does as part of the default focus
  // handling on mousedown).  For the note <input> we then call .focus()
  // manually â€” programmatic focus does NOT clear the document selection.
  toolbar.addEventListener('mousedown', (e) => {
    e.preventDefault();
    if (e.target === noteInput || noteInput?.contains(e.target)) {
      noteInput.focus();
    }
  });

  // â”€â”€ Show toolbar on text selection â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

    // Position toolbar ABOVE the selection (toolbar is position:fixed â€” no scrollY needed)
    const rect = range.getBoundingClientRect();
    // Use translateY(-100%) so the toolbar bottom sits 8 px above the selection top.
    // This avoids needing to measure offsetHeight before the element is visible.
    toolbar.style.top       = `${Math.max(8, rect.top - 8)}px`;
    toolbar.style.left      = `${Math.max(8, Math.min(rect.left, window.innerWidth - 240))}px`;
    toolbar.style.transform = 'translateY(-100%)';
    toolbar.hidden          = false;
  });

  // â”€â”€ Cancel button â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const cancelBtn = document.getElementById('annotation-cancel');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      toolbar.hidden = true;
      pendingRange   = null;
      window.getSelection()?.removeAllRanges();
    });
  }

  // â”€â”€ Save / highlight button â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  // â”€â”€ Click existing annotation to delete â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

// â”€â”€â”€ C.22 â€” Reading Progress Persistence â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
  } catch (_) { /* storage quota exceeded â€” skip silently */ }
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
    // C.22 â€” debounced persistence (500 ms)
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

// â”€â”€â”€ Page initialisation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

// â”€â”€â”€ C.8 Backlinks â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
  const referrers = new Map(); // chatId â†’ chat metadata

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
 * Pure-ish (operates on document) â€” exported for testing with a DOM.
 * @param {Object} chat
 */
export function renderChat(chat) {
  const content = chat.content || '';
  const meta    = chat.metadata || {};
  const fm      = parseFrontmatter(content);

  // â”€â”€ Header â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const isExcerpt = Boolean(meta.isExcerpt || fm.excerpt);
  const source    = fm.source || chat.source || 'unknown';
  const title     = fm.title  || chat.title  || 'Untitled Chat';
  const date      = fm.date   || (chat.timestamp ? new Date(chat.timestamp).toISOString() : '');
  const count     = typeof fm.messageCount === 'number' ? fm.messageCount : (chat.messageCount || 0);

  document.title = `${title} â€” bAInder`;

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

  // â”€â”€ Reading time (R3) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const readTimeEl = document.getElementById('meta-reading-time');
  if (readTimeEl) {
    const words = countWords(content);
    const mins  = estimateReadTime(words);
    readTimeEl.textContent = `${mins} min read`;
    readTimeEl.hidden = false;
  }

  // â”€â”€ Per-source body tint (T3) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const knownSources = ['chatgpt', 'claude', 'gemini', 'copilot'];
  if (knownSources.includes(source)) {
    document.body.setAttribute('data-source', source);
  }

  header.hidden = false;

  // â”€â”€ Content â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const contentEl = document.getElementById('reader-content');

  contentEl.innerHTML = renderMarkdown(content);
  wrapChatTurns(contentEl);
  processSources(contentEl);
  setupSourcesPanel();

  // â”€â”€ C.7 â€” Per-message copy button â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  contentEl.querySelectorAll('.chat-turn').forEach(turn => {
    const copyBtn = document.createElement('button');
    copyBtn.className = 'turn-copy-btn';
    copyBtn.setAttribute('aria-label', 'Copy message');
    copyBtn.title = 'Copy message';
    copyBtn.innerHTML =
      '<svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">' +
      '<path d="M7.09 3c.2-.58.76-1 1.41-1h3c.65 0 1.2.42 1.41 1h1.59c.83 0 1.5.67 1.5 1.5v12' +
      'c0 .83-.67 1.5-1.5 1.5h-9A1.5 1.5 0 0 1 4 16.5v-12C4 3.67 4.67 3 5.5 3h1.59Z' +
      'M8.5 3a.5.5 0 0 0 0 1h3a.5.5 0 0 0 0-1h-3Z"/></svg>';
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

  // â”€â”€ Prompts count + hover overlay â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Supports two markdown formats produced by the serializer:
  //   1. Emoji format (current): <p> elements whose text starts with ðŸ™‹
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
        el.id = `prompt-${i + 1}`;
        return { el, text: el.querySelector('.chat-turn__body')?.textContent?.trim() || '' };
      });
    } else {
      // Current emoji format: paragraphs that begin with the ðŸ™‹ emoji
      const USER_EMOJI = '\uD83D\uDE4B'; // ðŸ™‹
      const emojiEls = Array.from(contentEl.querySelectorAll('p')).filter(
        p => p.textContent.trimStart().startsWith(USER_EMOJI)
      );
      userTurns = emojiEls.map((el, i) => {
        el.id = `prompt-${i + 1}`;
        // Strip the leading ðŸ™‹ glyph (may be followed by gender/skin modifiers)
        // and any surrounding whitespace to obtain a clean snippet.
        const raw = el.textContent.replace(/^\s*\uD83D\uDE4B[\uD83C\uDFFB-\uD83C\uDFFF\u200D\u2640\u2642\uFE0F]*/u, '').trim();
        return { el, text: raw };
      });
    }

    if (userTurns.length > 0) {
      const trigger = document.createElement('span');
      trigger.className = 'meta-prompts__trigger';
      trigger.textContent = `${userTurns.length} prompt${userTurns.length !== 1 ? 's' : ''}`;

      const overlay = document.createElement('div');
      overlay.className = 'prompts-overlay';
      overlay.setAttribute('role', 'list');

      userTurns.forEach(({ text }, i) => {
        const snippet = text.length > 72 ? text.slice(0, 69) + '\u2026' : text;
        const a = document.createElement('a');
        a.href      = `#prompt-${i + 1}`;
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

  // â”€â”€ Assembled-chats header consolidation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
        trigger.textContent = `ðŸ”—Â ${n} chat${n !== 1 ? 's' : ''} assembled`;

        const overlay = document.createElement('div');
        overlay.className = 'assembled-overlay';
        overlay.setAttribute('role', 'list');

        sectionHeadings.forEach((h, i) => {
          const title   = h.textContent.trim();
          const snippet = title.length > 68 ? title.slice(0, 65) + 'â€¦' : title;
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

  // â”€â”€ Copy-code button wiring â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Use event delegation on the content container so no per-button listeners.
  contentEl.addEventListener('click', (e) => {
    const btn = e.target.closest('.code-block__copy');
    if (!btn) return;
    // Read raw text from the <code> element â€” textContent auto-decodes HTML entities.
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

  // â”€â”€ Source-chat link wiring â€” select originating chat in sidepanel tree â”€â”€
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
 * C.15 â€” Set up the interactive star-rating widget in the reader header.
 * Renders 5 clickable stars into #reader-rating and persists changes to storage.
 *
 * @param {string} chatId         ID of the currently displayed chat
 * @param {number|null} initRating Current rating (1â€“5) or null/0
 * @param {Object} storage        browser.storage.local-like object
 */
/**
 * C.19 â€” Show a dismissible stale-review banner when a chat is overdue.
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
    `<span class="stale-banner__icon" aria-hidden="true">âš </span>` +
    `<span class="stale-banner__text">${dateText}.</span>` +
    `<button class="stale-banner__dismiss" type="button">Mark as reviewed</button>`;
  banner.hidden = false;

  banner.querySelector('.stale-banner__dismiss')?.addEventListener('click', async () => {
    banner.hidden = true;
    try {
      const result  = await storage.get(['chats']);
      const chats   = result.chats || [];
      const updated = chats.map(c =>
        c.id === chatId ? { ...c, flaggedAsStale: false } : c
      );
      await storage.set({ chats: updated });
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
          const result = await storage.get(['chats']);
          const chats  = result.chats || [];
          const updated = chats.map(c => c.id === chatId ? { ...c, rating: rating || null } : c);
          await storage.set({ chats: updated });
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
 * Main entry point â€” reads chatId from URL, loads from storage, renders.
 * @param {Object} storage  Object with a `.get(keys)` method â€” injectable for testing
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
    restoreScrollPosition(chatId);        // C.22
    setupRating(chatId, chat.rating, storage);
    setupStaleBanner(chatId, chat, storage);
    setupScrollFeatures(chatId);          // C.22 â€” pass chatId for persistence
    setupAnnotations(chatId, storage);
    setupStickyNotes(chatId, storage, renderMarkdown);
    // C.8 â€” render backlinks: chats that reference this one in annotation notes
    await renderBacklinksSection(chatId, chat.title, chats, storage);
  } catch (err) {
    showError(`Failed to load conversation: ${err.message}`);
  }
}

// â”€â”€ Auto-run when loaded as a browser extension page â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Only run when the actual reader DOM (reader-content element) is present.
// This guard prevents accidental execution when reader.js is imported in tests.
/* c8 ignore next 4 */
if (typeof browser !== 'undefined' && browser.storage && document.getElementById('reader-content')) {
  init(browser.storage.local);
}
