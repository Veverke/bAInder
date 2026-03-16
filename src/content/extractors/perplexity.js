/**
 * Perplexity conversation extractor.
 * Targets: www.perplexity.ai, perplexity.ai
 *
 * Perplexity DOM (as of March 2026):
 *
 *   Overall container:
 *     main                              — primary scroll viewport
 *     main .scrollable-container        — inner scrollable wrapper (SPA layout)
 *
 *   User queries (confirmed from ai-injector.js live-tested selectors):
 *     [class*="query"]                  — CONFIRMED: the outermost user turn container
 *     [class*="UserMessage"]            — confirmed fallback
 *     [class*="user-message"]           — confirmed fallback
 *     [class*="Question"]               — confirmed fallback
 *     .break-words                      — tight text-wrapping class on the query text node
 *
 *   AI answers (from SaveMyPhind / community extractors, verified against
 *               the same Perplexity React build that ai-injector.js targets):
 *     .prose                            — Tailwind prose wrapper around the markdown body
 *     .relative.default > div > div     — fallback: the outermost rendered answer container
 *
 *   Sources / citations:
 *     DECISION: strip entirely — not captured.
 *     Perplexity inlines numbered footnote markers ([1], [2] …) and renders
 *     the full source list in a separate panel/modal that is not part of the
 *     main conversation thread.  Stripping keeps message content clean,
 *     consistent with how other extractors handle source chrome.
 *
 *   Shadow DOM: NO — Perplexity is a standard React/Next.js SPA with no
 *     shadow roots on conversation content.
 *
 *   Inline images: YES — standard <img> tags with https: src URLs (CDN-hosted).
 *     resolveImageBlobs() is NOT needed (no blob: or data: URIs to resolve).
 *     bgFetch via service worker IS needed for cross-origin CDN images if we
 *     choose to embed them.  For now keep it simple: emit alt text / URL only.
 *
 *   Title extraction:
 *     1. First <h1> on the page (Perplexity renders the query as an <h1>)
 *     2. document.title (stripped of " - Perplexity" suffix)
 *     3. generateTitle(messages, url) as final fallback
 *
 *   UI noise to strip:
 *     - Source section headers ("Sources", "N sources")
 *     - Follow-up suggestion chips ("Why does …", "How does …")  — these live
 *       outside the answer container and are not captured by .prose, so stripping
 *       is a no-op in most cases.
 *     - Footnote reference markers inside prose ("[1]", "[2]" …) if they appear
 *       as text nodes — left for Phase 2 implementation decision.
 */

import { htmlToMarkdown }                from './html-to-markdown.js';
import { stripSourceContainers }        from './source-links.js';
import { formatMessage, generateTitle } from './message-utils.js';
import { removeDescendants }                         from './shared.js';

// ─── Private helpers ──────────────────────────────────────────────────────────

// Strip Perplexity UI noise lines from markdown content.
// Covers: "Sources" header lines, footnote-only lines like "[1] [2]",
// "N sources" count lines.
const _SOURCES_HEADER_RE = /^#{0,6}\s*sources?\s*$/i;
const _SOURCE_COUNT_RE   = /^\d+\s+sources?\s*$/i;
const _FOOTNOTE_ONLY_RE  = /^(\s*\[\d+\]\s*)+$/;

function _stripPerplexityUILabels(content) {
  return content
    .split('\n')
    .filter(line => {
      const t = line.trim();
      return !_SOURCES_HEADER_RE.test(t) &&
             !_SOURCE_COUNT_RE.test(t) &&
             !_FOOTNOTE_ONLY_RE.test(t);
    })
    .join('\n')
    .replace(/^\s+/, '');
}

// ─── Extractor ────────────────────────────────────────────────────────────────

/**
 * Extract messages from a Perplexity conversation page.
 * @param {Document} doc
 * @returns {Promise<{title: string, messages: Array, messageCount: number}>}
 */
export async function extractPerplexity(doc) {
  if (!doc) throw new Error('Document is required');

  const messages = [];

  // ── Conversation scope ──────────────────────────────────────────────────
  // Scope queries to the main element to exclude sidebar / history panels.
  const chatScope =
    doc.querySelector('main') ||
    doc.querySelector('[role="main"]') ||
    doc;

  // ── User query selectors (priority order) ───────────────────────────────
  // [class*="query"] is confirmed live-tested in ai-injector.js.
  const USER_SEL = [
    '[class*="query"]',
    '[class*="UserMessage"]',
    '[class*="user-message"]',
    '[class*="Question"]',
  ].join(', ');

  // ── AI answer selectors ─────────────────────────────────────────────────
  // .prose is the Tailwind prose wrapper around the markdown body.
  // .relative.default is the outer answer card shell.
  const ANSWER_SEL = [
    '.prose',
    '.relative.default > div > div',
  ].join(', ');

  const rawUserEls   = removeDescendants(Array.from(chatScope.querySelectorAll(USER_SEL)));
  const rawAnswerEls = removeDescendants(Array.from(chatScope.querySelectorAll(ANSWER_SEL)));

  console.debug('[bAInder] Perplexity extraction: user=%d answer=%d',
    rawUserEls.length, rawAnswerEls.length);

  const allEls = [
    ...rawUserEls.map(el => ({ el, role: 'user' })),
    ...rawAnswerEls.map(el => ({ el, role: 'assistant' })),
  ].sort((a, b) => {
    const pos = a.el.compareDocumentPosition(b.el);
    return pos & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
  });

  for (const { el, role } of allEls) {
    // Strip source citation containers from assistant turns before converting.
    const processEl = role === 'assistant' ? stripSourceContainers(el) : el;
    let content = htmlToMarkdown(processEl);
    if (role === 'assistant') {
      content = _stripPerplexityUILabels(content);
    }
    const msg = formatMessage(role, content);
    if (msg) messages.push(msg);
  }

  // ── Title ──────────────────────────────────────────────────────────────
  // Prefer the first <h1> (Perplexity renders the query as one),
  // then fall back to <title> minus the site suffix, then generate from messages.
  let title = '';
  const h1 = doc.querySelector('h1');
  if (h1 && h1.textContent?.trim()) {
    title = h1.textContent.trim();
  } else {
    const rawTitle = doc.title || '';
    title = rawTitle.replace(/\s*[-|–]\s*perplexity\s*$/i, '').trim();
  }
  if (!title) {
    title = generateTitle(messages, doc.location?.href || '');
  }

  return { title, messages, messageCount: messages.length };
}
