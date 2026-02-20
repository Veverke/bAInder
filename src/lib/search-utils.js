/**
 * Search utilities for Stage 8: Search Functionality.
 * Pure functions — no DOM, no storage access, fully testable.
 */

/**
 * Escape HTML special characters in a string.
 * @param {string} text
 * @returns {string}
 */
export function escapeHtml(text) {
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
