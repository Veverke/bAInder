/**
 * Search utilities for Stage 8: Search Functionality.
 * Pure functions — no DOM, no storage access, fully testable.
 */

/**
 * Escape HTML special characters in a string.
 * Canonical implementation — imported by reader.js, style-transformer.js,
 * dialog-manager.js, and export/format-helpers.js instead of each defining
 * their own copy.
 * @param {string} text
 * @returns {string}
 */
export function escapeHtml(text) {
  if (text === null || text === undefined) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Strip YAML frontmatter from markdown content so snippets show body text.
 * @param {string} content
 * @returns {string}
 */
function stripFrontmatter(content) {
  if (!content.startsWith('---')) return content;
  const end = content.indexOf('\n---', 3);
  if (end === -1) return content;
  return content.slice(end + 4).trimStart();
}

/**
 * Extract a short text snippet centred around the first occurrence of `query`
 * within `content`.  Strips markdown frontmatter first.
 *
 * @param {string} content   Full chat content (may include frontmatter)
 * @param {string} query     Search term
 * @param {number} [contextChars=120]  Characters of context on each side of match
 * @returns {string}         Plain-text snippet, may start/end with '…'
 */
export function extractSnippet(content, query, contextChars = 120) {
  if (!content || !query) return '';

  const body  = stripFrontmatter(content);
  const lower = body.toLowerCase();
  const idx   = lower.indexOf(query.toLowerCase());

  if (idx === -1) {
    // Query not found in body — return the opening text
    const opening = body.slice(0, contextChars * 2).replace(/\s+/g, ' ').trim();
    return opening.length < body.replace(/\s+/g, ' ').trim().length
      ? opening + '…'
      : opening;
  }

  const start  = Math.max(0, idx - contextChars);
  const end    = Math.min(body.length, idx + query.length + contextChars);
  let snippet  = body.slice(start, end).replace(/\s+/g, ' ').trim();

  if (start > 0) snippet = '…' + snippet;
  if (end < body.length) snippet = snippet + '…';

  return snippet;
}

/**
 * Wrap occurrences of `query` in a `plain` text string with
 * `<mark class="search-highlight">…</mark>`, after HTML-escaping.
 *
 * @param {string} text   Plain-text string (will be HTML-escaped)
 * @param {string} query  Search term (case-insensitive)
 * @returns {string}      HTML string safe to set as innerHTML
 */
export function highlightTerms(text, query) {
  if (!text) return '';
  const escaped = escapeHtml(text);
  if (!query) return escaped;

  const escapedQuery = escapeHtml(query);
  // Build a regex that matches the query case-insensitively
  const safeQuery = escapedQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex     = new RegExp(`(${safeQuery})`, 'gi');

  return escaped.replace(regex, '<mark class="search-highlight">$1</mark>');
}

/**
 * Convert a `tree.getTopicPath(topicId)` result into a readable breadcrumb string.
 * Returns 'Uncategorised' when the path is empty or topicId is null/undefined.
 *
 * @param {Array<{id: string, name: string}>} path  Result of tree.getTopicPath()
 * @returns {string}
 */
export function formatBreadcrumb(path) {
  if (!Array.isArray(path) || path.length === 0) return 'Uncategorised';
  return path.map(p => p.name).join(' › ');
}

// ─── C.3 Search Filters ───────────────────────────────────────────────────────

/**
 * Apply source / date-range / topic-scope filters to an array of chat results.
 * All filter fields are optional — an absent or empty filter matches everything.
 *
 * @param {Array}  results  Chat objects (must have .source, .timestamp, .topicId)
 * @param {object} filters
 *   @param {Set<string>}  [filters.sources]   Active source keys (empty = all)
 *   @param {string|null}  [filters.dateFrom]  ISO date string "YYYY-MM-DD"
 *   @param {string|null}  [filters.dateTo]    ISO date string "YYYY-MM-DD"
 *   @param {string}       [filters.topicId]   Root topic id to scope to subtree
 *   @param {number|null}  [filters.minRating] Minimum star rating (1–5), null = all
 * @param {object|null}   tree   TopicTree instance (needed for topicId scope)
 * @returns {Array}
 */
export function applySearchFilters(results, filters, tree = null) {
  if (!filters) return results;
  const { sources, dateFrom, dateTo, topicId, minRating } = filters;

  let out = results;

  // Source filter
  if (sources && sources.size > 0) {
    out = out.filter(c => sources.has(c.source));
  }

  // Date range filter
  if (dateFrom || dateTo) {
    const from = dateFrom ? new Date(dateFrom).getTime()                   : 0;
    const to   = dateTo   ? new Date(dateTo + 'T23:59:59.999').getTime()   : Infinity;
    out = out.filter(c => {
      const ts = c.timestamp || 0;
      return ts >= from && ts <= to;
    });
  }

  // Topic scope filter — restrict to topics within the selected subtree
  if (topicId && tree) {
    const subtreeIds = new Set();
    const collect = (tid) => {
      subtreeIds.add(tid);
      const topic = tree.topics[tid];
      if (topic) topic.children.forEach(child => collect(child));
    };
    collect(topicId);
    out = out.filter(c => c.topicId && subtreeIds.has(c.topicId));
  }

  // C.15 — Min-rating filter
  if (minRating != null && minRating > 0) {
    out = out.filter(c => (c.rating || 0) >= minRating);
  }

  return out;
}

/**
 * Generate a unique, time-based ID with a cryptographically random component.
 *
 * Canonical implementation — previously copy-pasted in Topic, ChatEntry,
 * chat-save-handler.js, and reader.js as four independent inline expressions.
 *
 * The random segment is produced with `crypto.getRandomValues` (6 bytes →
 * 12 hex chars, 48 bits of entropy) instead of `Math.random()`, making IDs
 * non-predictable even when the timestamp is known.
 *
 * @param {string} [prefix]  Optional prefix (e.g. 'topic', 'chat', 'ann').
 *   With prefix:  `{prefix}_{timestamp}_{12 hex chars}`
 *   Without:      `{timestamp}-{12 hex chars}`  (backwards-compat for generateChatId)
 * @returns {string}
 */
export function generateId(prefix) {
  const ts  = Date.now();
  const buf = new Uint8Array(6);
  crypto.getRandomValues(buf);
  const rnd = Array.from(buf, b => b.toString(16).padStart(2, '0')).join('');
  return prefix ? `${prefix}_${ts}_${rnd}` : `${ts}-${rnd}`;
}
