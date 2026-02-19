/**
 * bAInder Markdown Serialiser
 *
 * Converts a saved chat (messages array + metadata) into a self-contained
 * Markdown document that can be stored in chrome.storage and rendered by the
 * reader page without any network access.
 *
 * Output format:
 *
 *   ---
 *   title: "…"
 *   source: chatgpt|claude|gemini|copilot
 *   url: https://…
 *   date: 2026-02-20T10:30:00.000Z
 *   messageCount: 12
 *   ---
 *
 *   # Title
 *
 *   **User**
 *
 *   First user message …
 *
 *   ---
 *
 *   **Assistant**
 *
 *   First assistant response …
 *
 *   ---
 *
 *   … (repeating)
 */

/**
 * Escape a string for safe use inside a YAML double-quoted scalar.
 * @param {string} value
 * @returns {string}
 */
export function escapeYaml(value) {
  if (!value || typeof value !== 'string') return '';
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/**
 * Format a role label for display in the markdown body.
 * @param {string} role  'user' | 'assistant' | anything else
 * @returns {string}
 */
export function formatRoleLabel(role) {
  if (role === 'user')      return 'User';
  if (role === 'assistant') return 'Assistant';
  // Capitalise whatever custom role string was stored
  return role ? role.charAt(0).toUpperCase() + role.slice(1) : 'Unknown';
}

/**
 * Format an ISO date string from a timestamp (ms since epoch) or ISO string.
 * Returns empty string for invalid / missing values.
 * @param {number|string|null|undefined} timestamp
 * @returns {string}
 */
export function formatTimestamp(timestamp) {
  if (!timestamp) return '';
  try {
    const d = new Date(timestamp);
    if (isNaN(d.getTime())) return '';
    return d.toISOString();
  } catch (_) {
    return '';
  }
}

/**
 * Convert a messages array + metadata into a Markdown document string.
 *
 * @param {Array<{role: string, content: string}>} messages
 * @param {{
 *   title?:        string,
 *   source?:       string,
 *   url?:          string,
 *   timestamp?:    number|string,
 *   messageCount?: number,
 *   isExcerpt?:    boolean,
 *   body?:         string   Raw markdown / plain text for excerpt saves (used when messages is empty)
 * }} meta
 * @returns {string}  Complete markdown document
 */
export function messagesToMarkdown(messages, meta = {}) {
  const title        = (meta.title        || 'Untitled Chat').trim();
  const source       = (meta.source       || 'unknown').trim();
  const url          = (meta.url          || '').trim();
  const dateStr      = formatTimestamp(meta.timestamp);
  const messageCount = typeof meta.messageCount === 'number'
    ? meta.messageCount
    : (Array.isArray(messages) ? messages.length : 0);
  const isExcerpt    = Boolean(meta.isExcerpt);
  const body         = meta.body ? String(meta.body).trim() : null;

  // ── Frontmatter ─────────────────────────────────────────────────────────
  const lines = [
    '---',
    `title: "${escapeYaml(title)}"`,
    `source: ${source}`,
  ];
  if (url)     lines.push(`url: ${url}`);
  if (dateStr) lines.push(`date: ${dateStr}`);
  lines.push(`messageCount: ${messageCount}`);
  if (isExcerpt) lines.push('excerpt: true');
  lines.push('contentFormat: markdown-v1');
  lines.push('---');
  lines.push('');

  // ── Title heading ────────────────────────────────────────────────────────
  lines.push(`# ${title}`);
  lines.push('');

  // ── Conversation body ────────────────────────────────────────────────────
  if (!Array.isArray(messages) || messages.length === 0) {
    // Excerpt or empty — render body text if provided, then stop
    if (body) {
      lines.push(body);
      lines.push('');
    }
    return lines.join('\n');
  }

  messages.forEach((msg, idx) => {
    const label   = formatRoleLabel(msg.role);
    const content = (msg.content || '').trim();

    lines.push(`**${label}**`);
    lines.push('');
    lines.push(content);

    // Divider between turns, but not after the last one
    if (idx < messages.length - 1) {
      lines.push('');
      lines.push('---');
    }
    lines.push('');
  });

  return lines.join('\n');
}

/**
 * Parse the YAML frontmatter block from a markdown document produced by
 * messagesToMarkdown.  Returns a plain object; missing keys are omitted.
 *
 * NOTE: This is a minimal parser for the specific keys we emit — it is NOT a
 * general YAML parser.
 *
 * @param {string} markdown
 * @returns {{
 *   title?:         string,
 *   source?:        string,
 *   url?:           string,
 *   date?:          string,
 *   messageCount?:  number,
 *   excerpt?:       boolean,
 *   contentFormat?: string
 * }}
 */
export function parseFrontmatter(markdown) {
  if (!markdown || typeof markdown !== 'string') return {};

  // Frontmatter must start at the very beginning of the document
  if (!markdown.startsWith('---')) return {};

  const endIdx = markdown.indexOf('\n---', 3);
  if (endIdx === -1) return {};

  const block = markdown.slice(3, endIdx).trim();
  const result = {};

  for (const line of block.split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key   = line.slice(0, colonIdx).trim();
    const raw   = line.slice(colonIdx + 1).trim();

    switch (key) {
      case 'title': {
        // Strip surrounding double-quotes if present
        const m = raw.match(/^"(.*)"$/);
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
        result.messageCount = parseInt(raw, 10);
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
