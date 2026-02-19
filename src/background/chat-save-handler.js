/**
 * bAInder Background - Chat Save Handler
 * Stage 6: Extracted for testability
 *
 * Pure handler functions used by background.js, exported as an ES module
 * so unit tests can import and exercise them directly.
 */

/**
 * Detect the AI source platform from a URL string.
 * @param {string} url
 * @returns {'chatgpt'|'claude'|'gemini'|'unknown'}
 */
export function detectSource(url) {
  if (!url || typeof url !== 'string') return 'unknown';
  if (url.includes('chat.openai.com')) return 'chatgpt';
  if (url.includes('claude.ai'))       return 'claude';
  if (url.includes('gemini.google.com')) return 'gemini';
  return 'unknown';
}

/**
 * Generate a simple unique ID for a chat entry.
 * @returns {string}
 */
export function generateChatId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
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
  const validSources = ['chatgpt', 'claude', 'gemini'];
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
 * @returns {Object}
 */
export function buildChatEntry(chatData, tabUrl) {
  const url    = chatData.url || tabUrl || '';
  const source = chatData.source || detectSource(url);

  return {
    id:           generateChatId(),
    title:        chatData.title.trim(),
    content:      chatData.content.trim(),
    url,
    source,
    timestamp:    Date.now(),
    topicId:      null,
    messageCount: chatData.messageCount || 0,
    messages:     chatData.messages     || [],
    metadata:     chatData.metadata     || {}
  };
}

/**
 * High-level save handler – reads from storage, deduplicates, appends, writes.
 *
 * @param {Object}   chatData   Payload from content script SAVE_CHAT message
 * @param {Object}   sender     chrome.runtime.MessageSender
 * @param {Object}   storage    chrome.storage.local (injected for testability)
 * @returns {Promise<Object>}   The saved chat entry
 */
export async function handleSaveChat(chatData, sender, storage) {
  validateChatData(chatData);

  const tabUrl = sender?.tab?.url || '';

  // Get existing chats
  const result = await storage.get(['chats']);
  const chats  = result.chats || [];

  // Deduplication
  const duplicate = findDuplicate(chats, chatData.url || tabUrl);
  if (duplicate) {
    console.log('bAInder: Skipping duplicate save', duplicate.id);
    return duplicate;
  }

  const newChat = buildChatEntry(chatData, tabUrl);
  chats.push(newChat);
  await storage.set({ chats });

  console.log('Chat saved successfully:', newChat.id);
  return newChat;
}
