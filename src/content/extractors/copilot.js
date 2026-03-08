/**
 * Copilot conversation extractor.
 * Targets: copilot.microsoft.com, m365.cloud.microsoft/chat
 *
 * Copilot DOM (as of March 2026):
 *   User messages:      [data-content="user-message"], [data-testid="user-message"],
 *                       [class*="user-message"], [class*="UserMessage"]
 *   Copilot responses:  [data-content="ai-message"], [data-testid="ai-message"],
 *                       [data-testid="copilot-message"], [class*="CopilotMessage"],
 *                       [data-testid="assistant-message"], [class*="AssistantMessage"]
 */

import { htmlToMarkdown }        from './html-to-markdown.js';
import { extractSourceLinks, stripSourceContainers } from './source-links.js';
import { formatMessage, generateTitle }              from './message-utils.js';
import { removeDescendants }                         from './shared.js';

// ─── Private helpers ──────────────────────────────────────────────────────────

const _LABEL_RE    = /^#{0,6}\s*(you said|i said|copilot said|copilot):?\s*$/i;
const _UI_NOISE_RE = /^(provide your feedback on (bizchat|copilot|m365|microsoft 365|bing)|was this (response|answer) helpful\??|helpful\s*not helpful|thumbs up|thumbs down|report a concern|give feedback|feedback on this response|like\s*dislike)\s*$/i;

/**
 * Strip Copilot UI role-label lines ("You said:", "Copilot said:") and
 * BizChat / M365 feedback UI noise from extracted markdown content.
 * @param {string} content
 * @returns {string}
 */
function stripRoleLabels(content) {
  return content
    .split('\n')
    .filter(line => {
      const t = line.trim();
      return !_LABEL_RE.test(t) && !_UI_NOISE_RE.test(t);
    })
    .join('\n')
    .replace(/^\s+/, '');
}

// ─── Extractor ────────────────────────────────────────────────────────────────

/**
 * Extract messages from a GitHub Copilot / M365 conversation page.
 * @param {Document} doc
 * @returns {{title: string, messages: Array, messageCount: number}}
 */
export function extractCopilot(doc) {
  if (!doc) throw new Error('Document is required');

  const messages = [];

  // Scope to the main conversation area so sidebar history items
  // (which may share the same class patterns) are not included.
  const chatScope =
    doc.querySelector('[data-testid="chat-page"]') ||
    doc.querySelector('main') ||
    doc.querySelector('[role="main"]') ||
    doc.querySelector('[class*="conversation"][class*="container"]') ||
    doc;

  // Predicate: true when an element is inside a history side-panel / nav drawer.
  // Use specific data-testid anchors instead of [class*="sidebar"] which can match
  // layout wrappers that span both the sidebar and the conversation area.
  const inHistoryPanel = el =>
    !!el.closest(
      'aside, [role="complementary"], [role="navigation"], [class*="history"],' +
      '[data-testid="sidebar-container"], [data-testid="backstage-chats"],' +
      '[data-testid="highlighted-chats"]'
    );

  // Fast path: [data-content] is a stable, Copilot-assigned semantic attribute
  // that only appears on real conversation messages — sidebar history items do not
  // carry it.  Query the whole document (not chatScope) so nothing is missed.
  const trustedUserEls   = Array.from(doc.querySelectorAll('[data-content="user-message"]'));
  const trustedAssistEls = Array.from(doc.querySelectorAll('[data-content="ai-message"]'));

  let rawUserEls, rawCopilotEls;

  if (trustedUserEls.length > 0 || trustedAssistEls.length > 0) {
    rawUserEls    = trustedUserEls;
    rawCopilotEls = trustedAssistEls;
  } else {
    // Fallback: broad class/testid selectors scoped to chatScope + history-panel filter.
    rawUserEls = Array.from(
      chatScope.querySelectorAll(
        '[class~="group/user-message"], [data-testid="user-message"], .UserMessage, [class*="UserMessage"], [class*="user-message"]'
      )
    ).filter(el => !inHistoryPanel(el));

    rawCopilotEls = Array.from(
      chatScope.querySelectorAll(
        '[class~="group/ai-message-item"], [class~="group/ai-message"], ' +
        '[data-testid="ai-message"], [data-testid="copilot-message"], [data-testid="assistant-message"], ' +
        '[class*="ai-message"], [class*="CopilotMessage"], [class*="AssistantMessage"], [class*="copilot-message"]'
      )
    ).filter(el => !inHistoryPanel(el));
  }

  // Keep only the outermost matched element when nested elements all match a selector.
  const userEls    = removeDescendants(rawUserEls);
  const copilotEls = removeDescendants(rawCopilotEls);

  const allEls = [
    ...userEls.map(el => ({ el, role: 'user' })),
    ...copilotEls.map(el => ({ el, role: 'assistant' }))
  ].sort((a, b) => {
    const pos = a.el.compareDocumentPosition(b.el);
    return pos & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
  });

  allEls.forEach(({ el, role }) => {
    // Strip any Copilot UI role-label headings ("You said:", "Copilot said:").
    const processEl = role === 'assistant' ? stripSourceContainers(el) : el;
    let content = stripRoleLabels(htmlToMarkdown(processEl));
    if (role === 'assistant') content += extractSourceLinks(el);
    if (content) messages.push(formatMessage(role, content));
  });

  const title = generateTitle(messages, doc.location?.href || '');
  return { title, messages, messageCount: messages.length };
}
