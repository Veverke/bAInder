/**
 * Gemini conversation extractor.
 * Targets: gemini.google.com
 *
 * Gemini DOM (as of 2025/2026):
 *   User queries:      .user-query-content,  .query-text,   [class*="user-query"]
 *   Model responses:   .model-response-text, .response-text,[class*="model-response"]
 */

import { htmlToMarkdown }        from './html-to-markdown.js';
import { extractSourceLinks, stripSourceContainers } from './source-links.js';
import { formatMessage, generateTitle }              from './message-utils.js';
import { removeDescendants }                         from './shared.js';

/**
 * Extract messages from a Gemini conversation page.
 * @param {Document} doc
 * @returns {{title: string, messages: Array, messageCount: number}}
 */
export function extractGemini(doc) {
  if (!doc) throw new Error('Document is required');

  const messages = [];

  // Collect all elements in document order.
  // removeDescendants filters out any element whose ancestor also matched the
  // selector — e.g. an outer "user-query-container" wrapper that is caught by
  // [class*="user-query"] in addition to the inner "user-query-content" child.
  // Without this, Gemini pages produce duplicate user messages.
  const userEls = removeDescendants(Array.from(
    doc.querySelectorAll('.user-query-content, .query-text, [class*="user-query"]')
  ));
  const modelEls = removeDescendants(Array.from(
    doc.querySelectorAll('.model-response-text, .response-text, [class*="model-response"]')
  ));

  const allEls = [
    ...userEls.map(el => ({ el, role: 'user' })),
    ...modelEls.map(el => ({ el, role: 'assistant' }))
  ].sort((a, b) => {
    const pos = a.el.compareDocumentPosition(b.el);
    return pos & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
  });

  allEls.forEach(({ el, role }) => {
    const processEl = role === 'assistant' ? stripSourceContainers(el) : el;
    let content = htmlToMarkdown(processEl);
    if (role === 'assistant') content += extractSourceLinks(el);
    if (content) messages.push(formatMessage(role, content));
  });

  const title = generateTitle(messages, doc.location?.href || '');
  return { title, messages, messageCount: messages.length };
}
