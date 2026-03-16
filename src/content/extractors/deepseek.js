/**
 * DeepSeek conversation extractor.
 * Targets: chat.deepseek.com
 *
 * DOM signals (verified March 2026):
 *   All messages:      .ds-message
 *   Assistant turns:   .ds-message[style*="--assistant"]
 *   User turns:        .ds-message:not([style*="--assistant"])
 *
 * Title strategy (priority order):
 *   1. document.title minus " - DeepSeek" suffix
 *   2. First user message content
 *   3. generateTitle(messages, url) fallback
 */

import { htmlToMarkdown }                from './html-to-markdown.js';
import { formatMessage, generateTitle } from './message-utils.js';
import { removeDescendants }            from './shared.js';

const _TITLE_SUFFIX_RE = /\s*[-|\u2013]\s*deepseek\s*$/i;
const _UI_NOISE_RE     = /^(retry|copy|share|edit|regenerate)$/i;

function _stripDeepSeekUILabels(content) {
  return String(content || '')
    .split('\n')
    .filter(line => !_UI_NOISE_RE.test(line.trim()))
    .join('\n')
    .trim();
}

/**
 * Extract messages from a DeepSeek conversation page.
 * @param {Document} doc
 * @returns {Promise<{title: string, messages: Array, messageCount: number}>}
 */
export async function extractDeepSeek(doc) {
  if (!doc) throw new Error('Document is required');

  const messages = [];
  const nodes = removeDescendants(Array.from(doc.querySelectorAll('.ds-message')));

  for (const el of nodes) {
    const style = (el.getAttribute('style') || '').toLowerCase();
    const role  = style.includes('--assistant') ? 'assistant' : 'user';
    const content = _stripDeepSeekUILabels(htmlToMarkdown(el));
    if (!content) continue;
    messages.push(formatMessage(role, content));
  }

  const pageTitle = (doc.title || '').replace(_TITLE_SUFFIX_RE, '').trim();
  const firstUser = messages.find(m => m.role === 'user')?.content || '';
  const title = pageTitle || firstUser || generateTitle(messages, doc.location?.href || '');

  return { title, messages, messageCount: messages.length };
}
