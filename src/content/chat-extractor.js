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
 */

// ─── Platform Detection ──────────────────────────────────────────────────────

/**
 * Detect the AI platform from a hostname.
 * @param {string} hostname
 * @returns {'chatgpt'|'claude'|'gemini'|null}
 */
export function detectPlatform(hostname) {
  if (!hostname || typeof hostname !== 'string') return null;
  const h = hostname.toLowerCase();
  if (h.includes('chat.openai.com')) return 'chatgpt';
  if (h.includes('claude.ai'))       return 'claude';
  if (h.includes('gemini.google.com')) return 'gemini';
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
 * @param {Element|null} el
 * @returns {string}
 */
export function getTextContent(el) {
  if (!el) return '';
  return sanitizeContent(el.innerHTML || el.textContent || '');
}

// ─── Title Generation ────────────────────────────────────────────────────────

/**
 * Generate a chat title from the message array or fall back to URL / default.
 * @param {Array<{role:string, content:string}>} messages
 * @param {string} [url]
 * @returns {string}
 */
export function generateTitle(messages, url) {
  // Use first user message (truncated)
  const firstUser = messages.find(m => m.role === 'user');
  if (firstUser && firstUser.content) {
    const text = firstUser.content.trim();
    if (text.length > 0) {
      return text.length > 80 ? text.slice(0, 77) + '...' : text;
    }
  }

  // Fall back to page URL-derived name
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

    const content = getTextContent(contentEl);
    if (content) messages.push(formatMessage(role, content));
  });

  // Fallback: role attribute on the turn article itself
  if (messages.length === 0) {
    const fallbackTurns = doc.querySelectorAll('[data-message-author-role]');
    fallbackTurns.forEach(el => {
      const role = el.getAttribute('data-message-author-role') === 'user' ? 'user' : 'assistant';
      const content = getTextContent(el);
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
    const content = getTextContent(el);
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
    const content = getTextContent(el);
    if (content) messages.push(formatMessage(role, content));
  });

  const title = generateTitle(messages, doc.location?.href || '');
  return { title, messages, messageCount: messages.length };
}

// ─── Main Dispatch ───────────────────────────────────────────────────────────

/**
 * Extract a chat from the given document for the detected platform.
 * @param {'chatgpt'|'claude'|'gemini'} platform
 * @param {Document} doc
 * @param {string} [url]  Explicit URL (optional, used in title generation)
 * @returns {{
 *   platform: string,
 *   url: string,
 *   title: string,
 *   messages: Array<{role:string, content:string}>,
 *   messageCount: number,
 *   extractedAt: number
 * }}
 * @throws {Error} for unsupported platforms or extraction failures
 */
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

  const content = chatData.messages
    .map(m => `[${m.role.toUpperCase()}]\n${m.content}`)
    .join('\n\n---\n\n');

  return {
    title:       chatData.title,
    content,
    url:         chatData.url,
    source:      chatData.platform,
    messageCount: chatData.messageCount,
    messages:    chatData.messages,
    metadata: {
      extractedAt: chatData.extractedAt,
      messageCount: chatData.messageCount
    }
  };
}
