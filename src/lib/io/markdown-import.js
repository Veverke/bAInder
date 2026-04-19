/**
 * markdown-import.js
 *
 * Pure ES module — no side effects, no DOM access, no external dependencies.
 *
 * Parses an arbitrary Markdown file into the bAInder messages + metadata
 * shape so it can be stored as a saved chat.
 *
 * Supported source formats (priority order):
 *   1. bAInder own export  — frontmatter + ### User / ### Assistant headings
 *   2. Frontmatter only    — parse metadata + heuristic body parse
 *   3. Bold role labels    — **User** / **You** / **Human** / **Copilot** / **Assistant** / **AI**
 *   4. Heading role labels — # / ## / ### prefixed role names
 *   5. Blockquote role     — "> Human:" / "> Assistant:"
 *   6. HR separators       — alternating --- sections (user first)
 *   7. Single block        — entire document as one assistant message
 */

// ─── Frontmatter parser ───────────────────────────────────────────────────────

/**
 * Minimal YAML frontmatter parser.  Handles only the key:value pairs
 * present in bAInder export files.
 *
 * @param {string} markdown
 * @returns {{ title?: string, source?: string, url?: string, date?: string,
 *             messageCount?: number, excerpt?: boolean, contentFormat?: string }}
 */
export function parseFrontmatter(markdown) {
  if (!markdown || typeof markdown !== 'string') return {};
  if (!markdown.startsWith('---')) return {};

  const endIdx = markdown.indexOf('\n---', 3);
  if (endIdx === -1) return {};

  const block = markdown.slice(3, endIdx).trim();
  const result = {};

  for (const line of block.split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    const raw = line.slice(colonIdx + 1).trim();

    switch (key) {
      case 'title': {
        const m = raw.match(/^"(.*)"$/s);
        result.title = m ? m[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\') : raw;
        break;
      }
      case 'source':
        result.source = raw;
        break;
      case 'url':
        result.url = raw;
        break;
      case 'date':
        result.date = raw;
        break;
      case 'messageCount':
        result.messageCount = parseInt(raw, 10) || 0;
        break;
      case 'excerpt':
        result.excerpt = raw === 'true';
        break;
      case 'contentFormat':
        result.contentFormat = raw;
        break;
    }
  }
  return result;
}

// ─── Body stripping ───────────────────────────────────────────────────────────

/**
 * Strip the YAML frontmatter block from a markdown string.
 * Returns the original string unchanged if there is no frontmatter.
 *
 * @param {string} markdown
 * @returns {string}
 */
function stripFrontmatter(markdown) {
  if (!markdown.startsWith('---')) return markdown;
  const endIdx = markdown.indexOf('\n---', 3);
  if (endIdx === -1) return markdown;
  return markdown.slice(endIdx + 4);
}

// ─── Title extraction from body ───────────────────────────────────────────────

/**
 * Extract a title from the body of a markdown document.
 * Returns the text of the first H1 heading, stripping Markdown syntax.
 *
 * @param {string} body
 * @returns {string|null}
 */
function titleFromBody(body) {
  const m = body.match(/^#\s+(.+)$/m);
  if (!m) return null;
  // Strip any remaining inline markdown (bold, italic, backticks)
  return m[1].replace(/[*_`~]/g, '').trim() || null;
}

/**
 * Derive a title from a filename, stripping the extension and converting
 * hyphens/underscores to spaces.
 *
 * @param {string} filename
 * @returns {string}
 */
function titleFromFilename(filename) {
  if (!filename) return 'Imported chat';
  return filename
    .replace(/\.[^.]+$/, '')   // remove extension
    .replace(/[-_]/g, ' ')
    .trim() || 'Imported chat';
}

// ─── Detection strategies ─────────────────────────────────────────────────────

// 1.  bAInder v1 export — has ### User / ### Assistant headings
function isBainderV1(body) {
  return /^###\s+(User|Assistant)\s*$/im.test(body);
}

// 3.  Bold role labels on their own line
const BOLD_ROLE_RE = /^\*\*(You|User|Human|Copilot|Assistant|AI|Bot)\**\s*$/im;
function hasBoldRoles(body) {
  return BOLD_ROLE_RE.test(body);
}

// 4.  Heading role labels (# User, ## Assistant, ### Copilot …)
const HEADING_ROLE_RE = /^#{1,3}\s+(You|User|Human|Copilot|Assistant|AI|Bot)\s*$/im;
function hasHeadingRoles(body) {
  return HEADING_ROLE_RE.test(body);
}

// 5.  Blockquote role labels ("> Human:" / "> Assistant:")
const BLOCKQUOTE_ROLE_RE = /^>\s*(User|Human|Copilot|Assistant|AI|Bot)\s*:\s*$/im;
function hasBlockquoteRoles(body) {
  return BLOCKQUOTE_ROLE_RE.test(body);
}

// 6.  HR separators (at least one "---" on its own line)
function hasHrSeparators(body) {
  return /^---\s*$/m.test(body);
}

// ─── Role classifiers ─────────────────────────────────────────────────────────

/**
 * Map a raw role string extracted from the markdown to 'user' or 'assistant'.
 *
 * @param {string} raw
 * @returns {'user'|'assistant'}
 */
function classifyRole(raw) {
  const r = raw.toLowerCase().trim();
  if (r === 'user' || r === 'you' || r === 'human') return 'user';
  return 'assistant';
}

// ─── Parse strategies ─────────────────────────────────────────────────────────

/**
 * Strategy 1: bAInder v1 — ### User / ### Assistant headings.
 * Reuses the same logic as parseMessagesFromExportMarkdown in import-parser.js
 * but is kept here as a standalone pure function.
 *
 * @param {string} body  (frontmatter already stripped)
 * @returns {Array<{role:string, content:string}>}
 */
function parseBainderV1Messages(body) {
  const HEADING_RE = /^###\s+(User|Assistant)\s*$/gim;
  const headings = [];
  let m;
  HEADING_RE.lastIndex = 0;
  while ((m = HEADING_RE.exec(body)) !== null) {
    const eol = body.indexOf('\n', m.index);
    headings.push({
      role:         m[1].toLowerCase() === 'user' ? 'user' : 'assistant',
      headingStart: m.index,
      contentStart: eol === -1 ? body.length : eol + 1,
    });
  }
  if (headings.length === 0) return [];

  const messages = [];
  for (let i = 0; i < headings.length; i++) {
    const from = headings[i].contentStart;
    const to   = i + 1 < headings.length ? headings[i + 1].headingStart : body.length;
    let text   = body.slice(from, to);
    // Strip trailing export footer (*Exported from bAInder…*)
    text = text.replace(/\n---\n\s*\*Exported from bAInder[\s\S]*$/, '');
    // Strip trailing turn separator
    text = text.replace(/\n---\s*$/, '').trim();
    if (text) messages.push({ role: headings[i].role, content: text });
  }
  return messages;
}

/**
 * Strategy 3: bold role labels (**User**, **Copilot** …) on their own line.
 *
 * @param {string} body
 * @returns {Array<{role:string, content:string}>}
 */
function parseBoldRoleMessages(body) {
  // Split on lines that are exactly **RoleName** (with optional trailing **)
  const SPLIT_RE = /^(\*\*(You|User|Human|Copilot|Assistant|AI|Bot)\**)\s*$/im;
  const parts = body.split(SPLIT_RE);
  // parts layout after split with a capturing group: [pre, fullMatch, roleName, pre, fullMatch, roleName, …]
  // Actually with 2 capturing groups the split gives: [before, g1, g2, segment, g1, g2, …]
  const messages = [];
  // first element is content before the first label (discard)
  let i = 1;
  while (i + 1 < parts.length) {
    const roleName = parts[i + 1];    // capturing group 2
    const content  = (parts[i + 2] || '').trim();
    if (content) messages.push({ role: classifyRole(roleName), content });
    i += 3;
  }
  return messages;
}

/**
 * Strategy 4: heading role labels (# User, ## Assistant …).
 *
 * @param {string} body
 * @returns {Array<{role:string, content:string}>}
 */
function parseHeadingRoleMessages(body) {
  const SPLIT_RE = /^#{1,3}\s+(You|User|Human|Copilot|Assistant|AI|Bot)\s*$/im;
  const parts = body.split(SPLIT_RE);
  const messages = [];
  let i = 1;
  while (i < parts.length) {
    const roleName = parts[i];
    const content  = (parts[i + 1] || '').trim();
    if (content) messages.push({ role: classifyRole(roleName), content });
    i += 2;
  }
  return messages;
}

/**
 * Strategy 5: blockquote role labels (> Human: / > Assistant:).
 *
 * @param {string} body
 * @returns {Array<{role:string, content:string}>}
 */
function parseBlockquoteRoleMessages(body) {
  const SPLIT_RE = /^>\s*(User|Human|Copilot|Assistant|AI|Bot)\s*:\s*$/im;
  const parts = body.split(SPLIT_RE);
  const messages = [];
  let i = 1;
  while (i < parts.length) {
    const roleName = parts[i];
    const content  = (parts[i + 1] || '').trim();
    if (content) messages.push({ role: classifyRole(roleName), content });
    i += 2;
  }
  return messages;
}

/**
 * Strategy 6: HR separators — treat alternating sections as user/assistant
 * starting with user.
 *
 * @param {string} body
 * @returns {Array<{role:string, content:string}>}
 */
function parseHrSeparatedMessages(body) {
  const sections = body.split(/^---\s*$/m);
  const messages = [];
  for (let i = 0; i < sections.length; i++) {
    const content = sections[i].trim();
    if (!content) continue;
    messages.push({ role: i % 2 === 0 ? 'user' : 'assistant', content });
  }
  return messages;
}

// ─── Main export ─────────────────────────────────────────────────────────────

/**
 * Parse any Markdown document into the bAInder messages + metadata shape.
 *
 * @param {string} content    Full text of the markdown file
 * @param {string} [filename] Original filename (used for title fallback)
 * @param {number} [fileLastModified] File lastModified timestamp in ms (used for date fallback)
 * @returns {{
 *   title:          string,
 *   source:         string,
 *   url:            string,
 *   timestamp:      number,
 *   messages:       Array<{role: string, content: string}>,
 *   detectedFormat: string
 * }}
 */
export function parseMarkdownImport(content, filename = '', fileLastModified = 0) {
  if (!content || typeof content !== 'string') {
    return {
      title: titleFromFilename(filename),
      source: 'external',
      url: '',
      timestamp: fileLastModified || Date.now(),
      messages: [],
      detectedFormat: 'empty',
    };
  }

  // ── Extract frontmatter metadata ────────────────────────────────────────
  const fm = parseFrontmatter(content);

  // ── Strip frontmatter to get body for detection ─────────────────────────
  const body = stripFrontmatter(content).trim();

  // ── Detect format and parse messages ────────────────────────────────────
  let messages = [];
  let detectedFormat = 'single-block';

  // 1. bAInder v1 export
  if (isBainderV1(body)) {
    messages = parseBainderV1Messages(body);
    detectedFormat = 'bainder-v1';
  }
  // 3. Bold role labels
  else if (hasBoldRoles(body)) {
    messages = parseBoldRoleMessages(body);
    detectedFormat = 'bold-roles';
  }
  // 4. Heading role labels
  else if (hasHeadingRoles(body)) {
    messages = parseHeadingRoleMessages(body);
    detectedFormat = 'heading-roles';
  }
  // 5. Blockquote role labels
  else if (hasBlockquoteRoles(body)) {
    messages = parseBlockquoteRoleMessages(body);
    detectedFormat = 'blockquote-roles';
  }
  // 6. HR separators (only if body has multiple non-empty sections)
  else if (hasHrSeparators(body)) {
    const candidate = parseHrSeparatedMessages(body);
    if (candidate.length > 1) {
      messages = candidate;
      detectedFormat = 'alternating-sections';
    }
  }

  // 7. Single block fallback
  if (messages.length === 0 && body) {
    messages = [{ role: 'assistant', content: body }];
    detectedFormat = 'single-block';
  }

  // ── Derive metadata ──────────────────────────────────────────────────────
  const title =
    fm.title ||
    titleFromBody(body) ||
    titleFromFilename(filename);

  const source    = fm.source || 'external';
  const url       = fm.url    || '';
  const timestamp = fm.date
    ? (new Date(fm.date).getTime() || fileLastModified || Date.now())
    : (fileLastModified || Date.now());

  return { title, source, url, timestamp, messages, detectedFormat };
}
