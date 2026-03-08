/**
 * ChatGPT conversation extractor.
 * Targets: chat.openai.com, chatgpt.com
 *
 * ChatGPT DOM (as of 2025/2026):
 *   Each turn:  article[data-testid^="conversation-turn"]
 *   Role attr:  [data-message-author-role]
 *   Content:    .markdown, .text-base, or direct text nodes
 */

import { htmlToMarkdown }        from './html-to-markdown.js';
import { extractSourceLinks, stripSourceContainers } from './source-links.js';
import { formatMessage, generateTitle }              from './message-utils.js';

/**
 * Extract messages from a ChatGPT conversation page.
 * @param {Document} doc
 * @returns {{title: string, messages: Array, messageCount: number}}
 */
export function extractChatGPT(doc) {
  if (!doc) throw new Error('Document is required');

  const messages = [];

  // Primary selector – role is stored on a child element inside the article
  const turns = doc.querySelectorAll('article[data-testid^="conversation-turn"]');

  turns.forEach(turn => {
    const roleEl = turn.querySelector('[data-message-author-role]');
    if (!roleEl) return;

    const rawRole = roleEl.getAttribute('data-message-author-role') || '';
    const role = rawRole === 'user' ? 'user' : 'assistant';

    // Try .markdown first (richer content), fall back to innerText
    const contentEl =
      turn.querySelector('.markdown') ||
      turn.querySelector('[class*="prose"]') ||
      turn.querySelector('[class*="whitespace-pre"]') ||
      roleEl;

    const processEl = role === 'assistant' ? stripSourceContainers(contentEl) : contentEl;
    let content = htmlToMarkdown(processEl);
    if (role === 'assistant') content += extractSourceLinks(turn, contentEl);
    if (content) messages.push(formatMessage(role, content));
  });

  // Fallback: role attribute on the turn article itself
  if (messages.length === 0) {
    const fallbackTurns = doc.querySelectorAll('[data-message-author-role]');
    fallbackTurns.forEach(el => {
      const role = el.getAttribute('data-message-author-role') === 'user' ? 'user' : 'assistant';
      const processEl = role === 'assistant' ? stripSourceContainers(el) : el;
      const content = htmlToMarkdown(processEl);
      if (content) messages.push(formatMessage(role, content));
    });
  }

  const title = generateTitle(messages, doc.location?.href || '');
  return { title, messages, messageCount: messages.length };
}
