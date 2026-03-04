/**
 * DOM utility helpers for chat extraction.
 * Low-level string and element text helpers shared by all platform extractors.
 */

/**
 * Strip HTML tags and normalise whitespace from a string.
 * @param {string} input
 * @returns {string}
 */
export function sanitizeContent(input) {
  if (!input || typeof input !== 'string') return '';
  // Remove HTML tags
  const stripped = input.replace(/<[^>]*>/g, ' ');
  // Decode HTML entities
  const decoded = stripped
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
  // Normalise whitespace
  return decoded.replace(/\s+/g, ' ').trim();
}

/**
 * Get text content from a DOM element, normalising whitespace.
 * Used only for plain-text contexts (title generation, fallbacks).
 * @param {Element|null} el
 * @returns {string}
 */
export function getTextContent(el) {
  if (!el) return '';
  return sanitizeContent(el.innerHTML || el.textContent || '');
}
