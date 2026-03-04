/**
 * Claude conversation extractor.
 * Targets: claude.ai
 *
 * Claude DOM (as of 2025/2026):
 *   Human turns:   [data-testid="human-turn"]    or .human-turn
 *   AI turns:      [data-testid="ai-turn"]        or .ai-turn
 *   Content lives inside those containers.
 */

import { htmlToMarkdown }        from './html-to-markdown.js';
import { extractSourceLinks, stripSourceContainers } from './source-links.js';
import { formatMessage, generateTitle }              from './message-utils.js';

/**
 * Extract messages from a Claude conversation page.
 * @param {Document} doc
 * @returns {{title: string, messages: Array, messageCount: number}}
 */
export function extractClaude(doc) {
  if (!doc) throw new Error('Document is required');

  const messages = [];

  // Collect all turn elements in document order
  const humanTurns = Array.from(
    doc.querySelectorAll('[data-testid="human-turn"], .human-turn, .human-message')
  );
  const aiTurns = Array.from(
    doc.querySelectorAll('[data-testid="ai-turn"], .ai-turn, .ai-message, .bot-turn')
  );

  // Build a combined list ordered by DOM position
  const allTurns = [
    ...humanTurns.map(el => ({ el, role: 'user' })),
    ...aiTurns.map(el => ({ el, role: 'assistant' }))
  ].sort((a, b) => {
    const pos = a.el.compareDocumentPosition(b.el);
    return pos & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
  });

  allTurns.forEach(({ el, role }) => {
    const processEl = role === 'assistant' ? stripSourceContainers(el) : el;
    let content = htmlToMarkdown(processEl);
    if (role === 'assistant') content += extractSourceLinks(el);
    if (content) messages.push(formatMessage(role, content));
  });

  const title = generateTitle(messages, doc.location?.href || '');
  return { title, messages, messageCount: messages.length };
}
