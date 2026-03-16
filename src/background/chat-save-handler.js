/**
 * bAInder Background - Chat Save Handler
 * Stage 6: Extracted for testability
 *
 * Pure handler functions used by background.js, exported as an ES module
 * so unit tests can import and exercise them directly.
 */

import { messagesToMarkdown } from '../lib/io/markdown-serialiser.js';
import { generateId } from '../lib/utils/search-utils.js';
import { logger } from '../lib/utils/logger.js';
import { extractChatEntities } from '../lib/entities/entity-extractor.js';
// Register Phase-A extractors (prompts, citations, tables) as a side effect.
import '../lib/entities/extractors/index.js';

// ── Audio text heuristics ────────────────────────────────────────────────────
// When conversation content is captured from AI platforms that generate audio
// via JavaScript blobs (ChatGPT code-interpreter, Gemini), no <audio> element
// or src attribute is present in the DOM at save time.  These heuristics detect
// common textual patterns in the captured markdown and inject a
// [🔊 Generated audio (not captured)] placeholder so the reader and entity
// extractor know audio is present.
//
// Run in the background (not only the content-script) so that existing tabs
// with old content-script versions still benefit after an extension update.

const _AUDIO_GENERAL_RE   = /\b(wav|mp3|ogg|webm|m4a|aac|flac|opus|audio|sound|ambient|soundscape)\b/i;
// ChatGPT code-interpreter: always writes "**Download it here:**" before the download widget.
const _CHATGPT_DOWNLOAD_RE = /(\*{0,2}Download(?:\s+it)?\s*here:?\*{0,2}[ \t]*)\n/i;
// Gemini: writes phrases like "It's ready to play!" / "ready to listen" when an audio widget is shown.
// Match to end of sentence so we insert the marker after the full sentence, not mid-word.
const _GEMINI_READY_RE = /\b(ready\s+to\s+play|ready\s+to\s+listen|you\s+can\s+(?:play|listen)|play\s+it\s+(?:here|below|now))([^\n.!?]*[.!?]?)/i;

/**
 * Post-process extracted messages to inject audio markers where the AI platform
 * generated an audio file but the download widget had no static DOM src.
 * Also strips ChatGPT response-variant pagination ("1 / 2") from trailing content.
 *
 * Mutates the array in place; always returns the same array.
 *
 * @param {Array<{role:string, content:string}>} messages
 * @param {string} source  'chatgpt' | 'gemini' | 'claude' | 'copilot' | 'unknown'
 * @returns {Array}
 */
export function normaliseMessages(messages, source) {
  if (!Array.isArray(messages)) return messages;

  for (const msg of messages) {
    if (msg.role !== 'assistant' || typeof msg.content !== 'string') continue;

    // Skip if audio already captured (either a full marker or a placeholder).
    if (msg.content.includes('🔊')) continue;

    const hasAudioSignal = _AUDIO_GENERAL_RE.test(msg.content);

    // ChatGPT: "**Download it here:**" gap heuristic
    if ((source === 'chatgpt' || source === 'unknown') &&
        _CHATGPT_DOWNLOAD_RE.test(msg.content) && hasAudioSignal) {
      logger.info('[chat-save-handler] audio heuristic (chatgpt): injecting placeholder');
      msg.content = msg.content.replace(
        _CHATGPT_DOWNLOAD_RE,
        '$1\n[🔊 Generated audio (not captured)]\n'
      );
    }

    // Gemini: "It's ready to play!" heuristic
    if ((source === 'gemini' || source === 'unknown') &&
        _GEMINI_READY_RE.test(msg.content) && hasAudioSignal) {
      logger.info('[chat-save-handler] audio heuristic (gemini): injecting placeholder');
      // Append after the "ready to play" sentence so it reads naturally.
      msg.content = msg.content.replace(
        _GEMINI_READY_RE,
        '$1$2\n\n[🔊 Generated audio (not captured)]'
      );
    }

    // Strip ChatGPT response-variant pagination ("1 / 2", "2/3", …) from the end.
    msg.content = msg.content.replace(/\n+\d+\s*\/\s*\d+\s*$/, '').trimEnd();
  }

  return messages;
}

/**
 * Detect the AI source platform from a URL string.
 * @param {string} url
 * @returns {'chatgpt'|'claude'|'gemini'|'unknown'}
 */
export function detectSource(url) {
  if (!url || typeof url !== 'string') return 'unknown';
  if (url.includes('chat.openai.com') || url.includes('chatgpt.com')) return 'chatgpt';
  if (url.includes('claude.ai'))         return 'claude';
  if (url.includes('gemini.google.com')) return 'gemini';
  if (url.includes('copilot.microsoft.com') || url.includes('m365.cloud.microsoft')) return 'copilot';
  return 'unknown';
}

/**
 * Generate a simple unique ID for a chat entry.
 * Delegates to the shared generateId() utility from search-utils.js.
 * Format: `{timestamp}-{random}` (no prefix — backwards-compatible).
 * @returns {string}
 */
export function generateChatId() {
  return generateId();
}

/**
 * Validate chat data before saving.
 * @param {Object} chatData
 * @throws {Error} with a descriptive message if invalid
 */
export function validateChatData(chatData) {
  if (!chatData) throw new Error('Chat data is required');
  if (!chatData.title || typeof chatData.title !== 'string' || !chatData.title.trim()) {
    throw new Error('Chat title is required');
  }
  if (!chatData.content || typeof chatData.content !== 'string' || !chatData.content.trim()) {
    throw new Error('Chat content is required');
  }
  const validSources = ['chatgpt', 'claude', 'gemini', 'copilot', 'perplexity'];
  const source = chatData.source || 'unknown';
  if (!validSources.includes(source)) {
    throw new Error(`Invalid source: ${source}. Must be one of: ${validSources.join(', ')}`);
  }
}

/**
 * Check if a chat with the same URL was saved recently (deduplication).
 * @param {Array} existingChats
 * @param {string} url
 * @param {number} [windowMs=5000]  Time window in ms
 * @returns {Object|null}  The duplicate chat, or null
 */
export function findDuplicate(existingChats, url, windowMs = 5000) {
  if (!url || !existingChats) return null;
  const now = Date.now();
  return existingChats.find(c =>
    c.url === url && (now - (c.timestamp || 0)) < windowMs
  ) || null;
}

/**
 * Build the chat entry object to persist.
 * @param {Object} chatData
 * @param {string} tabUrl   URL of the sender tab (from chrome.runtime message sender)
 * @returns {Promise<Object>}
 */
export async function buildChatEntry(chatData, tabUrl) {
  const url    = chatData.url || tabUrl || '';
  const source = chatData.source || detectSource(url);

  const generatedId = generateId();

  // Normalise messages: inject audio markers, strip pagination artefacts.
  // Run before entity extraction so extractors see the corrected content.
  const messages = normaliseMessages(chatData.messages ?? [], source);

  // Run entity extraction — doc is null in background context; extractors handle this gracefully.
  const entities = await extractChatEntities(messages, null, generatedId);
  logger.debug('buildChatEntry: entity types extracted:', Object.keys(entities), '| message count:', messages.length);

  // Apply the same normalisation patches to the stored content string so that
  // the reader sees the corrected markdown.  We patch the content directly rather
  // than re-serialising to avoid changing the frontmatter or formatting.
  let content = chatData.content.trim();
  if (messages.length > 0 && content.startsWith('---')) {
    // Apply ChatGPT download-gap heuristic to content string
    if ((source === 'chatgpt' || source === 'unknown') &&
        !content.includes('🔊') &&
        _CHATGPT_DOWNLOAD_RE.test(content) &&
        _AUDIO_GENERAL_RE.test(content)) {
      content = content.replace(
        _CHATGPT_DOWNLOAD_RE,
        '$1\n[🔊 Generated audio (not captured)]\n'
      );
    }
    // Apply Gemini "ready to play" heuristic to content string
    if ((source === 'gemini' || source === 'unknown') &&
        !content.includes('🔊') &&
        _GEMINI_READY_RE.test(content) &&
        _AUDIO_GENERAL_RE.test(content)) {
      content = content.replace(
        _GEMINI_READY_RE,
        '$1$2\n\n[🔊 Generated audio (not captured)]'
      );
    }
    // Strip ChatGPT response-variant pagination from content string
    content = content.replace(/\n+\d+\s*\/\s*\d+\s*$/, '').trimEnd();
  }

  return {
    id:           generatedId,
    title:        chatData.title.trim(),
    content,
    url,
    source,
    timestamp:    Date.now(),
    topicId:      null,
    messageCount: chatData.messageCount || 0,
    messages,
    metadata:     chatData.metadata     || {},
    ...entities,
  };
}

/**
 * Build a save payload from a text selection (context menu excerpt save).
 * The returned object is compatible with validateChatData / handleSaveChat.
 *
 * @param {string} selectionText  The user-selected text (plain text fallback)
 * @param {string} pageUrl        URL of the page where the selection was made
 * @param {string|null} richMarkdown  Rich markdown extracted via content script (preferred)
 * @returns {Object}  chatData payload ready for handleSaveChat
 * @throws {Error} if selection is empty
 */
export function buildExcerptPayload(selectionText, pageUrl, richMarkdown = null) {
  if (!selectionText || !selectionText.trim()) {
    throw new Error('Selection is empty');
  }
  const text   = selectionText.trim();
  // Derive a clean title from whichever body we're using.
  // Pick the first non-empty non-heading line, then trim to a sentence or
  // word boundary so it doesn't cut mid-word.
  const bodyForTitle = richMarkdown
    ? richMarkdown.split('\n').find(l => l.trim() && !/^#{1,6} /.test(l.trim())) || text.split('\n')[0]
    : text.split('\n')[0];
  const rawTitle = bodyForTitle.replace(/^#+\s*/, '').replace(/\*\*/g, '').trim();
  // Cap at 80 characters but break at a word boundary; append ellipsis if cut
  const title = rawTitle.length <= 80
    ? (rawTitle || 'Excerpt')
    : ((rawTitle.slice(0, 79).replace(/\s\S*$/, '') || rawTitle.slice(0, 79)) + '\u2026');
  const source = detectSource(pageUrl || '');
  const body   = richMarkdown || text;   // prefer rich markdown when available
  const content = messagesToMarkdown([], {
    title,
    source,
    url:       pageUrl || '',
    isExcerpt: true,
    body,
  });
  return {
    title,
    content,
    url:          pageUrl || '',
    source,
    messageCount: 0,
    messages:     [],
    metadata:     { isExcerpt: true, contentFormat: 'markdown-v1' }
  };
}

/**
 * High-level save handler – deduplicates and persists a new chat via
 * the ChatRepository abstraction.
 *
 * @param {Object}   chatData   Payload from content script SAVE_CHAT message
 * @param {Object}   sender     chrome.runtime.MessageSender
 * @param {import('../sidepanel/services/chat-repository.js').ChatRepository} repo
 *   A ChatRepository instance (injected for testability).
 * @returns {Promise<Object>}   The saved (or existing) chat entry
 */
export async function handleSaveChat(chatData, sender, repo) {
  validateChatData(chatData);

  const tabUrl = sender?.tab?.url || '';

  // loadAll() returns metadata-only; url and timestamp suffice for deduplication.
  const existingMetas = await repo.loadAll();

  const duplicate = findDuplicate(existingMetas, chatData.url || tabUrl);
  if (duplicate) {
    logger.info('Duplicate save skipped — returning existing:', duplicate.id);
    return duplicate;
  }

  const newChat = await buildChatEntry(chatData, tabUrl);
  await repo.addChat(newChat);

  logger.info('Chat saved:', newChat.id);
  return newChat;
}
