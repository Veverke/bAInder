/**
 * bAInder Chat Extractor
 * Stage 6: Content Script - Chat Detection & Extraction
 *
 * Thin orchestrator — all extraction logic lives in ./extractors/.
 * Exports the full public API so all callers and tests remain unchanged.
 *
 * Supported platforms:
 *   - ChatGPT (chat.openai.com)
 *   - Claude  (claude.ai)
 *   - Gemini  (gemini.google.com)
 *   - Copilot (copilot.microsoft.com → redirects to m365.cloud.microsoft/chat)
 */

import { messagesToMarkdown }                        from '../lib/io/markdown-serialiser.js';
import { sanitizeContent, getTextContent }           from './extractors/dom-utils.js';
import { htmlToMarkdown }                            from './extractors/html-to-markdown.js';
import { generateTitle, formatMessage }              from './extractors/message-utils.js';
import { extractSourceLinks }                        from './extractors/source-links.js';
import { extractChatGPT }                            from './extractors/chatgpt.js';
import { extractClaude }                             from './extractors/claude.js';
import { extractGemini }                             from './extractors/gemini.js';
import { extractCopilot }                            from './extractors/copilot.js';

// Re-export all implementation-level public APIs so callers stay unchanged.
export {
  sanitizeContent,
  getTextContent,
  htmlToMarkdown,
  generateTitle,
  formatMessage,
  extractSourceLinks,
  extractChatGPT,
  extractClaude,
  extractGemini,
  extractCopilot,
};

// ─── Platform Detection ──────────────────────────────────────────────────────

/**
 * Detect the AI platform from a hostname.
 * @param {string} hostname
 * @returns {'chatgpt'|'claude'|'gemini'|'copilot'|null}
 */
export function detectPlatform(hostname) {
  if (!hostname || typeof hostname !== 'string') return null;
  const h = hostname.toLowerCase();
  if (h.includes('chat.openai.com') || h.includes('chatgpt.com')) return 'chatgpt';
  if (h.includes('claude.ai'))         return 'claude';
  if (h.includes('gemini.google.com')) return 'gemini';
  if (h.includes('copilot.microsoft.com') || h.includes('m365.cloud.microsoft')) return 'copilot';
  return null;
}

// ─── Orchestration ────────────────────────────────────────────────────────────

export async function extractChat(platform, doc, url) {
  if (!platform) throw new Error('Platform is required');

  let result;

  switch (platform) {
    case 'chatgpt':
      if (!doc) throw new Error('Document is required');
      result = await extractChatGPT(doc);
      break;
    case 'claude':
      result = await extractClaude();
      break;
    case 'gemini':
      if (!doc) throw new Error('Document is required');
      result = await extractGemini(doc);
      break;
    case 'copilot':
      if (!doc) throw new Error('Document is required');
      result = await extractCopilot(doc);
      break;
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }

  const finalUrl = url || (doc?.location && doc.location.href) || '';

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
