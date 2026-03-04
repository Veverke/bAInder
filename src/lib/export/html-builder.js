/**
 * HTML export builders.
 * Serialises single chats and multi-chat digests to standalone HTML documents.
 */

import { buildTopicPath }                               from './filename-utils.js';
import { esc, sourceLabel, formatDateHuman, stripFrontmatter, digestAnchor } from './format-helpers.js';
import { mdToHtml }                                     from './md-to-html.js';
import { getExportCss, getDigestCss, fontStackForStyle } from './html-styles.js';

// ─── Single-chat ──────────────────────────────────────────────────────────────

/**
 * Convert a single chat to a complete, standalone HTML document.
 *
 * @param {Object} chat
 * @param {string} topicPath
 * @param {{ style?: string }} [options]
 * @returns {string}
 */
export function buildExportHtml(chat, topicPath, options = {}) {
  if (!chat) return '<html><body></body></html>';

  const style     = options.style || 'raw';
  const title     = (chat.title || 'Untitled Chat').trim();
  const source    = chat.source || 'unknown';
  const isExcerpt = Boolean(chat.metadata?.isExcerpt);
  const dateStr   = chat.timestamp ? formatDateHuman(chat.timestamp) : '';
  const messages  = Array.isArray(chat.messages) ? chat.messages : [];

  const fontStack = fontStackForStyle(style);
  const css       = getExportCss(fontStack);

  const srcLabel  = sourceLabel(source);
  const topicHtml = `<span class="meta">📁 ${esc(topicPath)}</span>`;
  const dateHtml  = dateStr ? `<span class="meta">📅 ${esc(dateStr)}</span>` : '';

  // Build conversation turns as HTML
  let bodyHtml = '';
  if (messages.length > 0) {
    bodyHtml = messages.map(msg => {
      const cls   = msg.role === 'user' ? 'turn-user' : 'turn-assistant';
      const label = msg.role === 'user' ? 'User' : 'Assistant';
      const html  = mdToHtml((msg.content || '').trim());
      return `
      <div class="turn ${esc(cls)}">
        <div class="turn-label">${esc(label)}</div>
        <div class="turn-content">${html}</div>
      </div>`;
    }).join('\n');
  } else {
    const body = stripFrontmatter(chat.content || '');
    bodyHtml = `<div class="turn"><div class="turn-content">${mdToHtml(body)}</div></div>`;
  }

  const titleBlock = isExcerpt
    ? `<span class="source-badge">${esc(srcLabel)}</span>`
    : `<h1>${esc(title)}</h1>
       <div style="display:flex;align-items:center;gap:.75rem;flex-wrap:wrap;margin-top:.5rem">
         <span class="source-badge">${esc(srcLabel)}</span>
         ${topicHtml}
         ${dateHtml}
       </div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${esc(title)} — bAInder Export</title>
  <style>${css}</style>
</head>
<body>
  <div class="container">
    <header class="doc-header">
      ${titleBlock}
    </header>
    <main class="conversation">
      ${bodyHtml}
    </main>
    <footer class="doc-footer">
      Exported from bAInder on ${esc(formatDateHuman(Date.now()))}
    </footer>
  </div>
</body>
</html>`;
}

// ─── Multi-chat digest ────────────────────────────────────────────────────────

/**
 * Build a single, standalone HTML document from multiple chats.
 *
 * @param {Object[]} chats
 * @param {Object}   topicsMap
 * @param {{ style?: string, includeToc?: boolean }} [options]
 * @returns {string}
 */
export function buildDigestHtml(chats, topicsMap, options = {}) {
  if (!Array.isArray(chats) || chats.length === 0) return '<html><body></body></html>';

  const style      = options.style || 'raw';
  const includeToc = options.includeToc !== false;
  const topics     = topicsMap || {};
  const exportedAt = Date.now();
  const count      = chats.length;

  const fontStack = fontStackForStyle(style);
  const css       = getDigestCss(fontStack);

  // ── TOC ────────────────────────────────────────────────────────────────────
  let tocHtml = '';
  if (includeToc) {
    const items = chats.map((chat, idx) => {
      const title  = esc((chat.title || 'Untitled Chat').trim());
      const anchor = digestAnchor(chat.title || 'Untitled Chat', idx);
      return `<li><a href="#${anchor}">${title}</a></li>`;
    }).join('\n      ');
    tocHtml = `
    <nav class="toc">
      <h2>Contents</h2>
      <ol>
        ${items}
      </ol>
    </nav>`;
  }

  // ── Chat sections ──────────────────────────────────────────────────────────
  const sectionsHtml = chats.map((chat, idx) => {
    const title      = esc((chat.title || 'Untitled Chat').trim());
    const topicPath  = esc(buildTopicPath(chat.topicId, topics));
    const srcLabel   = esc(sourceLabel(chat.source || 'unknown'));
    const dateStr    = chat.timestamp ? esc(formatDateHuman(chat.timestamp)) : '';
    const messages   = Array.isArray(chat.messages) ? chat.messages : [];
    const anchor     = digestAnchor(chat.title || 'Untitled Chat', idx);

    let bodyHtml = '';
    if (messages.length > 0) {
      bodyHtml = messages.map(msg => {
        const cls   = msg.role === 'user' ? 'turn-user' : 'turn-assistant';
        const label = msg.role === 'user' ? 'User' : 'Assistant';
        const html  = mdToHtml((msg.content || '').trim());
        return `<div class="turn ${esc(cls)}"><div class="turn-label">${esc(label)}</div><div class="turn-content">${html}</div></div>`;
      }).join('\n');
    } else {
      const body = stripFrontmatter(chat.content || '');
      bodyHtml   = `<div class="turn"><div class="turn-content">${mdToHtml(body)}</div></div>`;
    }

    return `
    <section class="chat-section" id="${anchor}">
      <h2 class="chat-title">${title}</h2>
      <div class="chat-meta">
        <span class="source-badge">${srcLabel}</span>
        <span class="meta">📁 ${topicPath}</span>
        ${dateStr ? `<span class="meta">📅 ${dateStr}</span>` : ''}
      </div>
      <div class="conversation">
        ${bodyHtml}
      </div>
    </section>`;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>bAInder Digest — ${count} chats</title>
  <style>${css}</style>
</head>
<body>
  <div class="container">
    <header class="doc-header">
      <h1>bAInder Digest</h1>
      <p class="meta">${count} chat${count !== 1 ? 's' : ''} compiled on ${esc(formatDateHuman(exportedAt))}</p>
    </header>
    ${tocHtml}
    ${sectionsHtml}
    <footer class="doc-footer">
      Exported from bAInder on ${esc(formatDateHuman(Date.now()))}
    </footer>
  </div>
</body>
</html>`;
}
