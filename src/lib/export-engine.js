/**
 * export-engine.js
 *
 * Pure export logic for bAInder — serialises topics and chats into Markdown,
 * HTML and a ZIP-ready payload.  No side effects except for `triggerDownload`
 * which interacts with the DOM to initiate a browser download.
 *
 * Depends only on `./markdown-serialiser.js` for the existing serialisation
 * helpers; JSZip is handled by the caller (export-dialog.js).
 */

import { messagesToMarkdown, parseFrontmatter, escapeYaml } from './markdown-serialiser.js';

// ─── Filename / path helpers ──────────────────────────────────────────────────

/**
 * Sanitise a string so it is safe to use as a file or folder name.
 *
 * Rules:
 *  - Strip characters invalid on Windows/macOS/Linux: `< > : " / \ | ? *`
 *    and ASCII control characters (codes 0-31).
 *  - Collapse runs of whitespace/hyphens into a single `-`.
 *  - Strip leading/trailing hyphens and dots.
 *  - Lowercase.
 *  - Truncate to 80 characters.
 *  - Return `"untitled"` when nothing remains.
 *
 * @param {string} name
 * @returns {string}
 */
export function sanitizeFilename(name) {
  if (!name || typeof name !== 'string') return 'untitled';

  let s = name
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1f<>:"/\\|?*]/g, ' ') // remove invalid chars
    .replace(/\s+/g, '-')                     // spaces → hyphens
    .replace(/-{2,}/g, '-')                   // collapse consecutive hyphens
    .replace(/^[.-]+|[.-]+$/g, '')            // strip leading/trailing . -
    .toLowerCase()
    .slice(0, 80)
    .replace(/[.-]+$/g, '');                  // strip again after truncation

  return s || 'untitled';
}

// ─── Topic path helper ────────────────────────────────────────────────────────

/**
 * Build a human-readable breadcrumb path for a topic using the flat topics
 * map (`tree.topics`).
 *
 * @param {string|null} topicId
 * @param {Object.<string, {name: string, parentId: string|null}>} topicsMap
 * @returns {string}  e.g. "Work > Projects" or "Uncategorised"
 */
export function buildTopicPath(topicId, topicsMap) {
  if (!topicId || !topicsMap || !topicsMap[topicId]) return 'Uncategorised';

  const parts = [];
  let current = topicId;
  const visited = new Set();

  while (current && topicsMap[current]) {
    if (visited.has(current)) break; // circular ref guard
    visited.add(current);
    parts.unshift(topicsMap[current].name);
    current = topicsMap[current].parentId;
  }

  return parts.join(' > ') || 'Uncategorised';
}

// ─── Markdown export ──────────────────────────────────────────────────────────

/**
 * Serialise a single chat object to a self-contained Markdown document
 * suitable for export (richer frontmatter than storage format).
 *
 * @param {Object} chat  - chat entry from storage
 * @param {string} topicPath  - breadcrumb string, e.g. "Work > Projects"
 * @returns {string}
 */
export function buildExportMarkdown(chat, topicPath) {
  if (!chat) return '';

  const title       = (chat.title || 'Untitled Chat').trim();
  const source      = chat.source || 'unknown';
  const url         = chat.url || '';
  const isExcerpt   = Boolean(chat.metadata?.isExcerpt);
  const exportedAt  = new Date().toISOString();
  const dateStr     = chat.timestamp ? new Date(chat.timestamp).toISOString() : '';
  const tags        = Array.isArray(chat.tags) && chat.tags.length ? chat.tags.join(', ') : '';

  // ── Enriched frontmatter ───────────────────────────────────────────────────
  const fm = [
    '---',
    `title: "${escapeYaml(title)}"`,
    `source: ${source}`,
  ];
  if (url)        fm.push(`url: ${url}`);
  if (dateStr)    fm.push(`date: ${dateStr}`);
  fm.push(`topic: "${escapeYaml(topicPath)}"`);
  fm.push(`chat_id: ${chat.id || 'unknown'}`);
  if (tags)       fm.push(`tags: [${tags}]`);
  fm.push(`exported: ${exportedAt}`);
  fm.push('contentFormat: markdown-v1');
  fm.push('---');
  fm.push('');

  const lines = [...fm];

  // ── Title heading ──────────────────────────────────────────────────────────
  if (!isExcerpt) {
    lines.push(`# ${title}`);
    lines.push('');
  }

  // ── Metadata block ─────────────────────────────────────────────────────────
  const sourceLabel = _sourceLabel(source);
  if (!isExcerpt) {
    lines.push(`**Source:** ${sourceLabel}  `);
    if (dateStr) {
      lines.push(`**Date:** ${_formatDateHuman(chat.timestamp)}  `);
    }
    lines.push(`**Topic:** ${topicPath}  `);
    if (tags) lines.push(`**Tags:** ${tags}  `);
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  // ── Conversation ───────────────────────────────────────────────────────────
  const messages = Array.isArray(chat.messages) ? chat.messages : [];

  if (messages.length > 0) {
    lines.push('## Conversation');
    lines.push('');
    messages.forEach((msg, idx) => {
      const role = msg.role === 'user' ? 'User' : msg.role === 'assistant' ? 'Assistant' : _cap(msg.role || 'Unknown');
      lines.push(`### ${role}`);
      lines.push('');
      lines.push((msg.content || '').trim());
      lines.push('');
      if (idx < messages.length - 1) {
        lines.push('---');
        lines.push('');
      }
    });
  } else {
    // Fall back to stored content (strip existing frontmatter first)
    const body = _stripFrontmatter(chat.content || '');
    lines.push(body.trim());
    lines.push('');
  }

  // ── Footer ─────────────────────────────────────────────────────────────────
  lines.push('---');
  lines.push('');
  lines.push(`*Exported from bAInder on ${_formatDateHuman(Date.now())}*`);

  return lines.join('\n');
}

// ─── HTML export ──────────────────────────────────────────────────────────────

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
  const dateStr   = chat.timestamp ? _formatDateHuman(chat.timestamp) : '';
  const messages  = Array.isArray(chat.messages) ? chat.messages : [];

  const isSerif   = style === 'academic' || style === 'blog';
  const fontStack = isSerif
    ? 'Georgia, "Times New Roman", serif'
    : 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

  const css = `
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: ${fontStack};
      font-size: 16px;
      line-height: 1.7;
      color: #1a1a1a;
      background: #fff;
      padding: 2rem 1rem;
    }
    .container { max-width: 800px; margin: 0 auto; }
    header.doc-header {
      border-bottom: 2px solid #e5e7eb;
      padding-bottom: 1.5rem;
      margin-bottom: 2rem;
    }
    h1 { font-size: 1.8rem; line-height: 1.3; margin-bottom: .5rem; }
    .meta { color: #6b7280; font-size: .875rem; margin-bottom: .25rem; }
    .source-badge {
      display: inline-block;
      background: #e0f2fe;
      color: #075985;
      border-radius: 9999px;
      padding: .15rem .65rem;
      font-size: .75rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: .05em;
    }
    .conversation { margin-top: 1.5rem; }
    .turn { margin-bottom: 1.5rem; }
    .turn-user {
      border-left: 4px solid #6366f1;
      padding-left: 1rem;
      background: #f8f7ff;
      border-radius: 0 .375rem .375rem 0;
      padding: .75rem 1rem;
    }
    .turn-assistant {
      border-left: 4px solid #10b981;
      padding-left: 1rem;
      background: #f0fdf4;
      border-radius: 0 .375rem .375rem 0;
      padding: .75rem 1rem;
    }
    .turn-label {
      font-size: .7rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: .08em;
      margin-bottom: .4rem;
      opacity: .6;
    }
    .turn-user .turn-label   { color: #4f46e5; }
    .turn-assistant .turn-label { color: #059669; }
    .turn-content { white-space: pre-wrap; word-break: break-word; }
    pre { background: #1e1e2e; color: #cdd6f4; padding: 1rem 1.25rem; border-radius: .5rem; overflow-x: auto; margin: .75rem 0; }
    code { font-family: "Cascadia Code", "Fira Code", monospace; font-size: .875em; }
    :not(pre) > code { background: #f3f4f6; padding: .1em .3em; border-radius: .25rem; }
    blockquote { border-left: 3px solid #d1d5db; padding-left: 1rem; color: #6b7280; margin: .75rem 0; }
    h2 { font-size: 1.25rem; margin: 1.25rem 0 .5rem; }
    h3 { font-size: 1.05rem; margin: 1rem 0 .4rem; }
    ul, ol { padding-left: 1.5rem; margin: .5rem 0; }
    li { margin-bottom: .2rem; }
    hr { border: none; border-top: 1px solid #e5e7eb; margin: 1.5rem 0; }
    footer.doc-footer {
      margin-top: 3rem;
      padding-top: 1rem;
      border-top: 1px solid #e5e7eb;
      color: #9ca3af;
      font-size: .8rem;
      font-style: italic;
    }
  `;

  const sourceLabel = _sourceLabel(source);
  const topicHtml   = `<span class="meta">📁 ${_esc(topicPath)}</span>`;
  const dateHtml    = dateStr ? `<span class="meta">📅 ${_esc(dateStr)}</span>` : '';

  // Build conversation turns as HTML
  let bodyHtml = '';
  if (messages.length > 0) {
    bodyHtml = messages.map(msg => {
      const cls   = msg.role === 'user' ? 'turn-user' : 'turn-assistant';
      const label = msg.role === 'user' ? 'User' : 'Assistant';
      const html  = _mdToHtml((msg.content || '').trim());
      return `
      <div class="turn ${_esc(cls)}">
        <div class="turn-label">${_esc(label)}</div>
        <div class="turn-content">${html}</div>
      </div>`;
    }).join('\n');
  } else {
    const body = _stripFrontmatter(chat.content || '');
    bodyHtml = `<div class="turn"><div class="turn-content">${_mdToHtml(body)}</div></div>`;
  }

  const titleBlock = isExcerpt
    ? `<span class="source-badge">${_esc(sourceLabel)}</span>`
    : `<h1>${_esc(title)}</h1>
       <div style="display:flex;align-items:center;gap:.75rem;flex-wrap:wrap;margin-top:.5rem">
         <span class="source-badge">${_esc(sourceLabel)}</span>
         ${topicHtml}
         ${dateHtml}
       </div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${_esc(title)} — bAInder Export</title>
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
      Exported from bAInder on ${_esc(_formatDateHuman(Date.now()))}
    </footer>
  </div>
</body>
</html>`;
}

// ─── ZIP payload builder ──────────────────────────────────────────────────────

/**
 * Build the complete set of files that should go into the export ZIP archive.
 *
 * Returns a flat array of `{ path, content }` objects.  The caller is
 * responsible for feeding these into JSZip.
 *
 * @param {import('./tree.js').TopicTree} tree
 * @param {Object[]} chats
 * @param {{
 *   scope?:   'all' | 'topic' | 'topic-recursive',
 *   topicId?: string,
 *   format?:  'markdown' | 'html',
 *   style?:   string
 * }} [options]
 * @returns {{ path: string, content: string }[]}
 */
export function buildZipPayload(tree, chats, options = {}) {
  const scope    = options.scope  || 'all';
  const fmt      = options.format || 'markdown';
  const style    = options.style  || 'raw';
  const topicsMap = (tree && tree.topics) ? tree.topics : {};
  const allChats  = Array.isArray(chats) ? chats : [];

  const dateTag   = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const rootDir   = `bAInder-export-${dateTag}`;

  // ── Determine which topics and chats are in scope ─────────────────────────
  let includedTopicIds;
  if (scope === 'all') {
    includedTopicIds = new Set(Object.keys(topicsMap));
  } else if (scope === 'topic' && options.topicId) {
    includedTopicIds = new Set([options.topicId]);
  } else if (scope === 'topic-recursive' && options.topicId) {
    includedTopicIds = _collectDescendants(options.topicId, topicsMap);
  } else {
    includedTopicIds = new Set(Object.keys(topicsMap));
  }

  const includedChats = allChats.filter(c =>
    c.topicId ? includedTopicIds.has(c.topicId) : scope === 'all'
  );

  // ── Build folder path for each topic ─────────────────────────────────────
  const topicFolderPath = _buildTopicFolderPaths(topicsMap);

  // ── Accumulate files ──────────────────────────────────────────────────────
  const files = [];

  // Track used filenames per folder to avoid collisions
  const usedNames = /** @type {Map<string, Set<string>>} */ (new Map());
  const _uniqueName = (folder, base) => {
    if (!usedNames.has(folder)) usedNames.set(folder, new Set());
    const set = usedNames.get(folder);
    let name = base;
    let i = 2;
    while (set.has(name)) name = `${base}-${i++}`;
    set.add(name);
    return name;
  };

  // _topic.json for each topic in scope
  for (const topicId of includedTopicIds) {
    const topic = topicsMap[topicId];
    if (!topic) continue;
    const folder = topicFolderPath.get(topicId) || sanitizeFilename(topic.name);
    const topicMeta = {
      name:       topic.name,
      topicId:    topic.id,
      chatCount:  Array.isArray(topic.chatIds) ? topic.chatIds.length : 0,
      dateRange:  {
        first: topic.firstChatDate ? new Date(topic.firstChatDate).toISOString() : null,
        last:  topic.lastChatDate  ? new Date(topic.lastChatDate).toISOString()  : null,
      }
    };
    files.push({
      path:    `${rootDir}/${folder}/_topic.json`,
      content: JSON.stringify(topicMeta, null, 2)
    });
  }

  // Chat files
  for (const chat of includedChats) {
    const topicId   = chat.topicId || null;
    const topicPath = buildTopicPath(topicId, topicsMap);
    const folderRel = topicId && topicFolderPath.has(topicId)
      ? topicFolderPath.get(topicId)
      : 'uncategorised';

    const ext      = fmt === 'html' ? '.html' : '.md';
    const baseName = sanitizeFilename(chat.title || 'untitled');
    const fileName = _uniqueName(`${rootDir}/${folderRel}`, baseName) + ext;

    const content = fmt === 'html'
      ? buildExportHtml(chat, topicPath, { style })
      : buildExportMarkdown(chat, topicPath);

    files.push({ path: `${rootDir}/${folderRel}/${fileName}`, content });
  }

  // Metadata
  files.push({
    path:    `${rootDir}/_metadata.json`,
    content: JSON.stringify(buildMetadataJson(tree, chats), null, 2)
  });

  // README
  const stats = {
    exportDate:  new Date().toISOString(),
    totalChats:  includedChats.length,
    totalTopics: includedTopicIds.size,
    format:      fmt
  };
  files.push({ path: `${rootDir}/README.md`, content: buildReadme(stats) });

  return files;
}

// ─── Metadata JSON ────────────────────────────────────────────────────────────

/**
 * Build the _metadata.json object for a ZIP export.
 *
 * @param {import('./tree.js').TopicTree} tree
 * @param {Object[]} chats
 * @returns {Object}
 */
export function buildMetadataJson(tree, chats) {
  const topicsMap = (tree && tree.topics) ? tree.topics : {};
  const allChats  = Array.isArray(chats) ? chats : [];

  // Source counts
  const sources = {};
  let firstChat = Infinity;
  let lastChat  = -Infinity;

  for (const chat of allChats) {
    const src = chat.source || 'unknown';
    sources[src] = (sources[src] || 0) + 1;
    if (chat.timestamp) {
      if (chat.timestamp < firstChat) firstChat = chat.timestamp;
      if (chat.timestamp > lastChat)  lastChat  = chat.timestamp;
    }
  }

  const topicsArr = Object.values(topicsMap).map(t => ({
    id:        t.id,
    name:      t.name,
    parentId:  t.parentId,
    chatCount: Array.isArray(t.chatIds) ? t.chatIds.length : 0
  }));

  return {
    export_version:   '1.0',
    export_date:      new Date().toISOString(),
    bainder_version:  '1.0.0',
    tree_structure: {
      topics:       topicsArr,
      total_chats:  allChats.length,
      total_topics: topicsArr.length
    },
    statistics: {
      date_range: {
        first_chat: firstChat !== Infinity ? new Date(firstChat).toISOString() : null,
        last_chat:  lastChat  !== -Infinity ? new Date(lastChat).toISOString()  : null,
      },
      sources
    }
  };
}

// ─── README ───────────────────────────────────────────────────────────────────

/**
 * Build a README.md string for the export archive.
 *
 * @param {{ exportDate: string, totalChats: number, totalTopics: number, format: string }} stats
 * @returns {string}
 */
export function buildReadme(stats) {
  const { exportDate, totalChats, totalTopics, format } = stats || {};
  const dateHuman = exportDate ? _formatDateHuman(new Date(exportDate).getTime()) : 'Unknown';
  const ext = format === 'html' ? '.html' : '.md';

  return `# bAInder Export

This archive was exported from **bAInder**, an AI Chat Organizer browser extension.

## Export Details

- **Exported:** ${dateHuman}
- **Topics:** ${totalTopics || 0}
- **Chats:** ${totalChats || 0}
- **Format:** ${format === 'html' ? 'HTML' : 'Markdown'}

## Folder Structure

Each folder corresponds to a topic in your bAInder topic tree.
Sub-folders represent child topics.  Each \`${ext}\` file is a chat conversation.

- \`_topic.json\` — metadata for that topic (name, chat count, date range)
- \`_metadata.json\` — full tree structure and export statistics (root level)
- \`README.md\` — this file

## Searching Your Chats

**VS Code:** Open this folder and use \`Ctrl+Shift+F\` (Find in Files) to search all chats at once.

**Terminal / grep:**
\`\`\`bash
# Find chats mentioning "async await"
grep -r "async await" . --include="*${ext}" -l

# Show matching lines with context
grep -r "machine learning" . --include="*${ext}" -n -C 2
\`\`\`

## Re-importing

This archive can be re-imported into bAInder via the **Import from ZIP** option to restore
or merge your chat history on another device.

---

*Generated by bAInder v1.0.0*
`;
}

// ─── Download trigger ─────────────────────────────────────────────────────────

/**
 * Trigger a file download in the browser.
 *
 * This is the only function that interacts with the DOM.
 *
 * @param {string} filename
 * @param {string | Blob | ArrayBuffer} content
 * @param {string} [mimeType]
 */
export function triggerDownload(filename, content, mimeType) {
  const mime = mimeType || _guessMime(filename);
  const blob = content instanceof Blob
    ? content
    : new Blob([content], { type: mime });

  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href     = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

// ─── Private helpers ──────────────────────────────────────────────────────────

/** @param {string} s */
function _cap(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
}

/** HTML-escape for attribute and text content use */
function _esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Human-readable source label.
 * @param {string} source
 * @returns {string}
 */
function _sourceLabel(source) {
  const map = {
    chatgpt: 'ChatGPT',
    claude:  'Claude',
    gemini:  'Gemini',
    copilot: 'Copilot',
    imported:'Imported'
  };
  return map[source] || _cap(source) || 'Unknown';
}

/**
 * Format a millisecond timestamp as a human-readable date string.
 * e.g. "March 15, 2024 at 10:30 AM"
 * @param {number} ts
 * @returns {string}
 */
function _formatDateHuman(ts) {
  if (!ts) return '';
  try {
    return new Date(ts).toLocaleString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric',
      hour: 'numeric', minute: '2-digit'
    });
  } catch (_) {
    return new Date(ts).toISOString();
  }
}

/**
 * Strip YAML frontmatter from a markdown string.
 * @param {string} md
 * @returns {string}
 */
function _stripFrontmatter(md) {
  if (!md || !md.startsWith('---')) return md || '';
  const end = md.indexOf('\n---', 3);
  if (end === -1) return md;
  return md.slice(end + 4).trimStart();
}

/**
 * Collect all descendant topic IDs (including the root itself).
 * @param {string} rootId
 * @param {Object} topicsMap
 * @returns {Set<string>}
 */
function _collectDescendants(rootId, topicsMap) {
  const result = new Set();
  const queue  = [rootId];
  const visited = new Set();
  while (queue.length) {
    const id = queue.shift();
    if (visited.has(id)) continue;
    visited.add(id);
    result.add(id);
    const topic = topicsMap[id];
    if (topic && Array.isArray(topic.children)) {
      for (const childId of topic.children) queue.push(childId);
    }
  }
  return result;
}

/**
 * Build a map of `topicId → relative folder path` for every topic.
 * Uses sanitized topic names to build `Parent/Child` folder paths.
 * @param {Object} topicsMap
 * @returns {Map<string, string>}
 */
function _buildTopicFolderPaths(topicsMap) {
  const result = new Map();

  const _getPath = (topicId, visited = new Set()) => {
    if (result.has(topicId)) return result.get(topicId);
    if (visited.has(topicId)) return sanitizeFilename('circular');
    visited.add(topicId);

    const topic = topicsMap[topicId];
    if (!topic) return 'unknown';

    const safeName = sanitizeFilename(topic.name);
    if (!topic.parentId || !topicsMap[topic.parentId]) {
      result.set(topicId, safeName);
      return safeName;
    }

    const parentPath = _getPath(topic.parentId, new Set(visited));
    const path = `${parentPath}/${safeName}`;
    result.set(topicId, path);
    return path;
  };

  for (const id of Object.keys(topicsMap)) _getPath(id);
  return result;
}

/**
 * Minimal Markdown → HTML converter for chat content.
 * Handles: code blocks, inline code, bold, italic, headings, lists,
 * blockquotes, horizontal rules, and plain text.
 *
 * NOTE: Input must already be escaped at the call site if untrusted.
 * Here we escape the text portions only (not code block contents).
 *
 * @param {string} md
 * @returns {string}
 */
export function _mdToHtml(md) {
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
        const langAttr = codeLang ? ` class="language-${_esc(codeLang)}"` : '';
        out.push(`<pre><code${langAttr}>${codeLines.join('\n')}</code></pre>`);
        inCode = false; codeLang = ''; codeLines = [];
      }
      continue;
    }
    if (inCode) { codeLines.push(_escCode(line)); continue; }

    // ── Heading ────────────────────────────────────────────────────────────
    const hm = line.match(/^(#{1,6})\s+(.*)/);
    if (hm) {
      flushList();
      const lvl = hm[1].length;
      out.push(`<h${lvl}>${_inlineMd(_esc(hm[2]))}</h${lvl}>`);
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
      out.push(`<blockquote>${_inlineMd(_esc(line.slice(2)))}</blockquote>`);
      continue;
    }

    // ── Unordered list ─────────────────────────────────────────────────────
    if (/^[-*+] /.test(line)) {
      if (!inList) { out.push('<ul>'); inList = true; }
      out.push(`<li>${_inlineMd(_esc(line.slice(2)))}</li>`);
      continue;
    }

    // ── Ordered list ───────────────────────────────────────────────────────
    if (/^\d+\. /.test(line)) {
      flushList();
      out.push(`<li>${_inlineMd(_esc(line.replace(/^\d+\.\s+/, '')))}</li>`);
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
    out.push(`<p>${_inlineMd(_esc(line))}</p>`);
  }

  // Flush any open code/list
  if (inCode && codeLines.length) {
    out.push(`<pre><code>${codeLines.join('\n')}</code></pre>`);
  }
  flushList();

  return out.join('\n');
}

/**
 * Apply inline markdown rules to an already-HTML-escaped string.
 * Handles: **bold**, *italic*, `code`, ~~strikethrough~~, [link](url)
 * @param {string} s  HTML-escaped input
 * @returns {string}
 */
function _inlineMd(s) {
  return s
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g,     '<em>$1</em>')
    .replace(/`([^`]+)`/g,     '<code>$1</code>')
    .replace(/~~(.+?)~~/g,     '<del>$1</del>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" rel="noopener">$1</a>');
}

/** Escape HTML but preserve newlines for code blocks */
function _escCode(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Guess a MIME type from a filename.
 * @param {string} filename
 * @returns {string}
 */
function _guessMime(filename) {
  if (filename.endsWith('.html')) return 'text/html;charset=utf-8';
  if (filename.endsWith('.zip'))  return 'application/zip';
  if (filename.endsWith('.json')) return 'application/json';
  if (filename.endsWith('.pdf'))  return 'application/pdf';
  return 'text/markdown;charset=utf-8';
}
