/**
 * Minimal Markdown → HTML converter for chat export output.
 *
 * Handles: fenced code blocks, headings, horizontal rules, blockquotes,
 * unordered/ordered lists, bold, italic, inline code, strikethrough, links.
 *
 * NOTE: Input text portions are HTML-escaped before inline processing.
 * Code block contents are escaped with escCode() (preserves structure).
 */

import { esc, escCode } from './format-helpers.js';

/**
 * Convert a Markdown string to an HTML fragment.
 * @param {string} md
 * @returns {string}
 */
export function mdToHtml(md) {
  if (!md) return '';

  const lines   = md.split('\n');
  const out     = [];
  let inCode    = false;
  let codeLang  = '';
  let codeLines = [];
  let inList    = false;

  const flushList = () => {
    if (inList) { out.push('</ul>'); inList = false; }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // ── Fenced code block ──────────────────────────────────────────────────
    if (line.startsWith('```')) {
      if (!inCode) {
        flushList();
        inCode   = true;
        codeLang = line.slice(3).trim();
        codeLines = [];
      } else {
        const langAttr = codeLang ? ` class="language-${esc(codeLang)}"` : '';
        out.push(`<pre><code${langAttr}>${codeLines.join('\n')}</code></pre>`);
        inCode = false; codeLang = ''; codeLines = [];
      }
      continue;
    }
    if (inCode) { codeLines.push(escCode(line)); continue; }

    // ── Heading ────────────────────────────────────────────────────────────
    const hm = line.match(/^(#{1,6})\s+(.*)/);
    if (hm) {
      flushList();
      const lvl = hm[1].length;
      out.push(`<h${lvl}>${inlineMd(esc(hm[2]))}</h${lvl}>`);
      continue;
    }

    // ── Horizontal rule ────────────────────────────────────────────────────
    if (/^---+$/.test(line.trim()) || /^\*\*\*+$/.test(line.trim())) {
      flushList();
      out.push('<hr>');
      continue;
    }

    // ── Blockquote ─────────────────────────────────────────────────────────
    if (line.startsWith('> ')) {
      flushList();
      out.push(`<blockquote>${inlineMd(esc(line.slice(2)))}</blockquote>`);
      continue;
    }

    // ── Unordered list ─────────────────────────────────────────────────────
    if (/^[-*+] /.test(line)) {
      if (!inList) { out.push('<ul>'); inList = true; }
      out.push(`<li>${inlineMd(esc(line.slice(2)))}</li>`);
      continue;
    }

    // ── Ordered list ───────────────────────────────────────────────────────
    if (/^\d+\. /.test(line)) {
      flushList();
      out.push(`<li>${inlineMd(esc(line.replace(/^\d+\.\s+/, '')))}</li>`);
      continue;
    }

    // ── Blank line ─────────────────────────────────────────────────────────
    if (line.trim() === '') {
      flushList();
      out.push('');
      continue;
    }

    // ── Normal paragraph ───────────────────────────────────────────────────
    flushList();
    out.push(`<p>${inlineMd(esc(line))}</p>`);
  }

  // Flush any open code/list
  if (inCode && codeLines.length) {
    out.push(`<pre><code>${codeLines.join('\n')}</code></pre>`);
  }
  flushList();

  return out.join('\n');
}

/**
 * Apply inline Markdown rules to an already-HTML-escaped string.
 * Handles: **bold**, *italic*, `code`, ~~strikethrough~~, [link](url)
 *
 * Link URLs are scheme-checked: only https?:, mailto:, relative paths, and
 * fragment-only hrefs are permitted. Any other scheme (javascript:, data:,
 * vbscript:, …) is replaced with '#' so the link is inert in exported HTML.
 *
 * @param {string} s  HTML-escaped input
 * @returns {string}
 */
export function inlineMd(s) {
  const SAFE_HREF = /^(https?:|mailto:|\/|#|[^:]*$)/i;
  return s
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g,     '<em>$1</em>')
    .replace(/`([^`]+)`/g,     '<code>$1</code>')
    .replace(/~~(.+?)~~/g,     '<del>$1</del>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, text, href) => {
      const safe = SAFE_HREF.test(href.trim()) ? href : '#';
      return `<a href="${safe}" rel="noopener">${text}</a>`;
    });
}
