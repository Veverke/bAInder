/**
 * bAInder Chat Extractor
 * Stage 6: Content Script - Chat Detection & Extraction
 *
 * Pure functions for extracting chat content from AI platforms.
 * Designed as an ES module for testability; content.js inlines the same logic.
 *
 * Supported platforms:
 *   - ChatGPT (chat.openai.com)
 *   - Claude  (claude.ai)
 *   - Gemini  (gemini.google.com)
 *   - Copilot (copilot.microsoft.com → redirects to m365.cloud.microsoft/chat)
 */

import { messagesToMarkdown } from '../lib/markdown-serialiser.js';

// ─── Platform Detection ──────────────────────────────────────────────────────

/**
 * Detect the AI platform from a hostname.
 * @param {string} hostname
 * @returns {'chatgpt'|'claude'|'gemini'|'copilot'|null}
 */
export function detectPlatform(hostname) {
  if (!hostname || typeof hostname !== 'string') return null;
  const h = hostname.toLowerCase();
  if (h.includes('chat.openai.com'))   return 'chatgpt';
  if (h.includes('claude.ai'))         return 'claude';
  if (h.includes('gemini.google.com')) return 'gemini';
  if (h.includes('copilot.microsoft.com') || h.includes('m365.cloud.microsoft')) return 'copilot';
  return null;
}

// ─── Content Sanitisation ────────────────────────────────────────────────────

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

/**
 * Convert a DOM element's content to Markdown, preserving structure.
 * Handles: headings, bold/italic, inline code, fenced code blocks,
 * ordered/unordered lists, blockquotes, paragraphs, line breaks, links.
 * Skips: script, style, svg, button, aria-hidden elements.
 *
 * @param {Element|null} el
 * @returns {string}  Markdown string
 */
export function htmlToMarkdown(el) {
  if (!el) return '';

  function walk(node) {
    // Text node — return its content, normalising non-breaking spaces
    if (node.nodeType === 3 /* TEXT_NODE */) {
      return (node.textContent || '').replace(/\u00a0/g, ' ');
    }
    if (node.nodeType !== 1 /* ELEMENT_NODE */) return '';

    // Skip decorative / hidden nodes
    if (node.getAttribute('aria-hidden') === 'true') return '';

    const tag = node.tagName.toLowerCase();
    if (['script', 'style', 'svg', 'noscript', 'button', 'template', 'img'].includes(tag)) return '';

    // Build inner content first (needed by most cases)
    const inner = Array.from(node.childNodes).map(walk).join('');

    switch (tag) {
      // ── Headings ─────────────────────────────────────────────────────────
      // Skip headings that are purely Copilot/M365 role labels ("You said:", "Copilot said:").
      // These are UI chrome injected into the message DOM element, not actual content.
      case 'h1': case 'h2': case 'h3': case 'h4': case 'h5': case 'h6': {
        const t = inner.trim();
        if (/^(you said|i said|copilot said|copilot):?\s*$/i.test(t)) return '';
        const level = parseInt(tag[1], 10);
        return `\n${'#'.repeat(level)} ${t}\n`;
      }

      // ── Inline formatting ─────────────────────────────────────────────────
      case 'strong': case 'b': {
        const t = inner.trim();
        return t ? `**${t}**` : '';
      }
      case 'em': case 'i': {
        const t = inner.trim();
        return t ? `*${t}*` : '';
      }

      // ── Code ──────────────────────────────────────────────────────────────
      case 'code': {
        // Inside <pre> — let pre handler wrap in fences
        if (node.parentElement && node.parentElement.tagName.toLowerCase() === 'pre') {
          return node.textContent || '';
        }
        // Multi-line standalone <code> (no <pre> wrapper) → fenced block
        const rawText = node.textContent || '';
        if (rawText.includes('\n')) {
          const lang = ((node.className || '').match(/language-(\S+)/) || [])[1] || '';
          return `\n\`\`\`${lang}\n${rawText.trimEnd()}\n\`\`\`\n`;
        }
        const t = inner.trim();
        return t ? `\`${t}\`` : '';
      }
      case 'pre': {
        const codeEl = node.querySelector('code');
        // Language: check <code class="language-*"> first, then parent class
        // (e.g., GitHub-style <div class="highlight-source-python"><pre>…</pre></div>)
        const langFromCode   = codeEl ? ((codeEl.className || '').match(/language-(\S+)/) || [])[1] || '' : '';
        const parentClass    = node.parentElement ? (node.parentElement.className || '') : '';
        const langFromParent = (parentClass.match(/(?:highlight-source|language)[- ](\w+)/i) || [])[1] || '';
        const lang = langFromCode || langFromParent;
        const code = (codeEl ? codeEl.textContent : node.textContent) || '';
        return `\n\`\`\`${lang}\n${code.trimEnd()}\n\`\`\`\n`;
      }

      // ── Lists ─────────────────────────────────────────────────────────────
      case 'ul': {
        const items = Array.from(node.childNodes)
          .filter(n => n.nodeType === 1 && n.tagName.toLowerCase() === 'li')
          .map(li => `- ${walk(li).trim()}`)
          .join('\n');
        return items ? `\n${items}\n` : '';
      }
      case 'ol': {
        const lis = Array.from(node.childNodes)
          .filter(n => n.nodeType === 1 && n.tagName.toLowerCase() === 'li');
        const items = lis.map((li, i) => `${i + 1}. ${walk(li).trim()}`).join('\n');
        return items ? `\n${items}\n` : '';
      }
      case 'li': return inner;

      // ── Block elements ────────────────────────────────────────────────────
      case 'p': {
        const t = inner.trim();
        return t ? `\n${t}\n` : '';
      }
      case 'br': return '\n';
      case 'hr': return '\n---\n';
      case 'blockquote': {
        const t = inner.trim().split('\n').map(l => `> ${l}`).join('\n');
        return `\n${t}\n`;
      }

      // ── Anchor ────────────────────────────────────────────────────────────
      case 'a': {
        const href = node.getAttribute('href');
        const text = inner.trim();
        return href && text ? `[${text}](${href})` : text;
      }

      // ── Everything else (div, span, section, article, …) ─────────────────
      case 'div': case 'section': case 'article': case 'aside': case 'main': case 'header': case 'footer': {
        // Skip code-block decoration elements (language label bars, copy-code toolbars).
        // Heuristic: a <div> whose parent also has a <pre> sibling, but which
        // itself has no <pre>/<code> descendants, is header/toolbar chrome.
        if (node.parentElement) {
          const siblingHasPre = Array.from(node.parentElement.children)
            .some(c => c !== node && c.tagName.toLowerCase() === 'pre');
          if (siblingHasPre && !node.querySelector('pre, code')) return '';
        }
        // Treat as block: wrap in newlines so lines don't concatenate.
        const bt = inner.trim();
        return bt ? `\n${bt}\n` : '';
      }
      default: {
        // Inline elements (span, etc.) — skip code-block toolbar spans.
        if (tag === 'span' && node.parentElement) {
          const siblingHasPre = Array.from(node.parentElement.children)
            .some(c => c !== node && c.tagName.toLowerCase() === 'pre');
          if (siblingHasPre && !node.querySelector('pre, code')) return '';
        }
        return inner;
      }
    }
  }

  return walk(el)
    .replace(/\n{3,}/g, '\n\n')   // collapse runs of 3+ newlines → 2
    .trim();
}

// ─── Title Generation ────────────────────────────────────────────────────────

/**
 * Generate a chat title from the message array or fall back to URL / default.
 * @param {Array<{role:string, content:string}>} messages
 * @param {string} [url]
 * @returns {string}
 */
export function generateTitle(messages, url) {
  // Strategy 1: first complete sentence (ending with . ? !) from the user's first message.
  // Strip markdown artefacts since content is stored as markdown after htmlToMarkdown.
  const firstUser = messages.find(m => m.role === 'user');
  if (firstUser && firstUser.content) {
    // Role labels (e.g. "You said:") that survive extraction are meaningless as titles.
    const ROLE_LABEL_RE = /^(you said|i said|copilot said|copilot):?\s*$/i;
    const firstLine = firstUser.content
      .split('\n')
      .map(l => l
        .replace(/^#{1,6}\s+/, '')          // strip ATX heading markers
        .replace(/\*\*(.+?)\*\*/g, '$1')    // strip bold
        .replace(/\*(.+?)\*/g, '$1')        // strip italic
        .replace(/`([^`]*)`/g, '$1')        // strip inline code
        .trim()
      )
      .filter(l => l.length > 0 && !ROLE_LABEL_RE.test(l))
      [0] || '';
    if (firstLine) {
      // Try to extract the first complete sentence
      const sentenceMatch = firstLine.match(/^(.+?[.?!])\s/);
      if (sentenceMatch && sentenceMatch[1].length >= 8) return sentenceMatch[1].trim();
      // Otherwise return the full cleaned first line
      return firstLine;
    }
  }

  // Strategy 3: URL-derived name
  if (url) {
    try {
      const u = new URL(url);
      const parts = u.pathname.split('/').filter(Boolean);
      if (parts.length > 0) {
        const last = parts[parts.length - 1];
        if (last && last !== 'c' && last.length > 3) {
          return `Chat ${last.slice(0, 40)}`;
        }
      }
    } catch (_) { /* ignore invalid URLs */ }
  }

  return 'Untitled Chat';
}

// ─── Message Formatting ──────────────────────────────────────────────────────

/**
 * Create a normalised message object.
 * @param {'user'|'assistant'|'system'} role
 * @param {string} content
 * @returns {{role: string, content: string}}
 */
export function formatMessage(role, content) {
  return {
    role: role || 'unknown',
    content: (content || '').trim()
  };
}

// ─── Platform Extractors ─────────────────────────────────────────────────────

/**
 * Extract messages from a ChatGPT conversation page.
 *
 * ChatGPT DOM (as of 2025/2026):
 *   Each turn:  article[data-testid^="conversation-turn"]
 *   Role attr:  [data-message-author-role]
 *   Content:    .markdown, .text-base, or direct text nodes
 *
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

    const content = htmlToMarkdown(contentEl);
    if (content) messages.push(formatMessage(role, content));
  });

  // Fallback: role attribute on the turn article itself
  if (messages.length === 0) {
    const fallbackTurns = doc.querySelectorAll('[data-message-author-role]');
    fallbackTurns.forEach(el => {
      const role = el.getAttribute('data-message-author-role') === 'user' ? 'user' : 'assistant';
      const content = htmlToMarkdown(el);
      if (content) messages.push(formatMessage(role, content));
    });
  }

  const title = generateTitle(messages, doc.location?.href || '');
  return { title, messages, messageCount: messages.length };
}

/**
 * Extract messages from a Claude conversation page.
 *
 * Claude DOM (as of 2025/2026):
 *   Human turns:   [data-testid="human-turn"]    or .human-turn
 *   AI turns:      [data-testid="ai-turn"]        or .ai-turn
 *   Content lives inside those containers.
 *
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
    const content = htmlToMarkdown(el);
    if (content) messages.push(formatMessage(role, content));
  });

  const title = generateTitle(messages, doc.location?.href || '');
  return { title, messages, messageCount: messages.length };
}

/**
 * Extract messages from a Gemini conversation page.
 *
 * Gemini DOM (as of 2025/2026):
 *   User queries:      .user-query-content,  .query-text,   [class*="user-query"]
 *   Model responses:   .model-response-text, .response-text,[class*="model-response"]
 *
 * @param {Document} doc
 * @returns {{title: string, messages: Array, messageCount: number}}
 */
export function extractGemini(doc) {
  if (!doc) throw new Error('Document is required');

  const messages = [];

  // Collect all elements in document order
  const userEls = Array.from(
    doc.querySelectorAll('.user-query-content, .query-text, [class*="user-query"]')
  );
  const modelEls = Array.from(
    doc.querySelectorAll('.model-response-text, .response-text, [class*="model-response"]')
  );

  const allEls = [
    ...userEls.map(el => ({ el, role: 'user' })),
    ...modelEls.map(el => ({ el, role: 'assistant' }))
  ].sort((a, b) => {
    const pos = a.el.compareDocumentPosition(b.el);
    return pos & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
  });

  allEls.forEach(({ el, role }) => {
    const content = htmlToMarkdown(el);
    if (content) messages.push(formatMessage(role, content));
  });

  const title = generateTitle(messages, doc.location?.href || '');
  return { title, messages, messageCount: messages.length };
}

// ─── Copilot Extraction Helpers ─────────────────────────────────────────────────────

/**
 * Remove elements that are descendants of another element in the same list.
 * Prevents nested DOM nodes (all matching a selector) from producing duplicate turns.
 * @param {Element[]} els
 * @returns {Element[]}
 */
function removeDescendants(els) {
  return els.filter(el => !els.some(other => other !== el && other.contains(el)));
}

/**
 * Strip Copilot UI role-label lines from extracted markdown content.
 * Copilot injects headings such as “You said:” and “Copilot said:” into message
 * DOM elements as visual chrome.  After htmlToMarkdown they appear as
 * “##### You said:” (or plain “You said:”) and must be removed before storing.
 * @param {string} content
 * @returns {string}
 */
function stripRoleLabels(content) {
  const LABEL_RE = /^#{0,6}\s*(you said|i said|copilot said|copilot):?\s*$/i;
  return content
    .split('\n')
    .filter(line => !LABEL_RE.test(line.trim()))
    .join('\n')
    .replace(/^\s+/, '');
}

/**
 * Extract messages from a GitHub Copilot conversation page.
 *
 * Copilot DOM (copilot.microsoft.com / m365.cloud.microsoft/chat, as of 2025/2026):
 *   User messages:      [data-testid="user-message"],  .UserMessage,  [class*="UserMessage"]
 *   Copilot responses:  [data-testid="copilot-message"],[class*="CopilotMessage"],
 *                       [data-testid="assistant-message"],[class*="AssistantMessage"],
 *                       .markdown-body (inside a copilot turn container)
 *
 * @param {Document} doc
 * @returns {{title: string, messages: Array, messageCount: number}}
 */
export function extractCopilot(doc) {
  if (!doc) throw new Error('Document is required');

  const messages = [];

  // Scope to the main conversation area so sidebar history items
  // (which may share the same class patterns) are not included.
  const chatScope =
    doc.querySelector('main') ||
    doc.querySelector('[role="main"]') ||
    doc.querySelector('[class*="conversation"][class*="container"]') ||
    doc;

  // Predicate: true when an element is inside a history side-panel / nav drawer.
  // On Copilot these are typically <aside> or [role="complementary"] elements.
  const inHistoryPanel = el =>
    !!el.closest('aside, [role="complementary"], [role="navigation"], [class*="history"], [class*="sidebar"]');

  const rawUserEls = Array.from(
    chatScope.querySelectorAll(
      '[data-testid="user-message"], .UserMessage, [class*="UserMessage"], [class*="user-message"]'
    )
  ).filter(el => !inHistoryPanel(el));

  const rawCopilotEls = Array.from(
    chatScope.querySelectorAll(
      '[data-testid="copilot-message"], [data-testid="assistant-message"], ' +
      '[class*="CopilotMessage"], [class*="AssistantMessage"], [class*="copilot-message"]'
    )
  ).filter(el => !inHistoryPanel(el));

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
    // Strip any Copilot UI role-label headings (“You said:”, “Copilot said:”).
    const content = stripRoleLabels(htmlToMarkdown(el));
    if (content) messages.push(formatMessage(role, content));
  });

  const title = generateTitle(messages, doc.location?.href || '');
  return { title, messages, messageCount: messages.length };
}

export function extractChat(platform, doc, url) {
  if (!platform) throw new Error('Platform is required');
  if (!doc)      throw new Error('Document is required');

  let result;

  switch (platform) {
    case 'chatgpt':
      result = extractChatGPT(doc);
      break;
    case 'claude':
      result = extractClaude(doc);
      break;
    case 'gemini':
      result = extractGemini(doc);
      break;
    case 'copilot':
      result = extractCopilot(doc);
      break;
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }

  const finalUrl = url || (doc.location && doc.location.href) || '';

  return {
    platform,
    url: finalUrl,
    title: result.title,
    messages: result.messages,
    messageCount: result.messageCount,
    extractedAt: Date.now()
  };
}

/**
 * Format extracted chat data for saving (adds content summary).
 * @param {{platform:string, url:string, title:string, messages:Array, messageCount:number, extractedAt:number}} chatData
 * @returns {Object}  Ready to send to background.js / storage
 */
export function prepareChatForSave(chatData) {
  if (!chatData) throw new Error('Chat data is required');

  const content = messagesToMarkdown(chatData.messages, {
    title:        chatData.title,
    source:       chatData.platform,
    url:          chatData.url,
    timestamp:    chatData.extractedAt,
    messageCount: chatData.messageCount,
  });

  return {
    title:        chatData.title,
    content,
    url:          chatData.url,
    source:       chatData.platform,
    messageCount: chatData.messageCount,
    messages:     chatData.messages,
    metadata: {
      extractedAt:   chatData.extractedAt,
      messageCount:  chatData.messageCount,
      contentFormat: 'markdown-v1',
    }
  };
}
