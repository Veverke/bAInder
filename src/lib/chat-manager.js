/**
 * bAInder Chat Manager
 * Stage 7: Chat assignment, movement, deletion, and display logic
 *
 * Pure functions that operate on in-memory data structures.
 * All storage persistence is the caller's responsibility.
 */

/**
 * Return chats that have not been assigned to any topic.
 * @param {Array} chats
 * @returns {Array}
 */
export function getUnassignedChats(chats) {
  if (!Array.isArray(chats)) return [];
  return chats.filter(c => !c.topicId);
}

/**
 * Return all chats belonging to a specific topic.
 * @param {string} topicId
 * @param {Array} chats
 * @returns {Array}
 */
export function getChatsForTopic(topicId, chats) {
  if (!topicId || !Array.isArray(chats)) return [];
  return chats.filter(c => c.topicId === topicId);
}

/**
 * Assign a chat to a topic in the in-memory TopicTree.
 * Mutates topic.chatIds and updates topic date range.
 * Returns the updated chat object (with topicId set).
 * Caller must persist both the updated chats array and the tree.
 *
 * @param {Object} chat
 * @param {string} topicId
 * @param {Object} tree  TopicTree instance
 * @returns {Object}  Updated chat with topicId set
 */
export function assignChatToTopic(chat, topicId, tree) {
  if (!chat) throw new Error('Chat is required');
  if (!topicId) throw new Error('Topic ID is required');
  if (!tree) throw new Error('Tree is required');

  const topic = tree.topics[topicId];
  if (!topic) throw new Error(`Topic not found: ${topicId}`);

  if (!topic.chatIds.includes(chat.id)) {
    topic.chatIds.push(chat.id);
  }

  if (chat.timestamp && tree.updateTopicDateRange) {
    tree.updateTopicDateRange(topicId, chat.timestamp);
  }

  return { ...chat, topicId };
}

/**
 * Remove a chat ID from a topic's chatIds list in the in-memory tree.
 * Does NOT delete the chat from storage — only unlinks from the topic.
 *
 * @param {string} chatId
 * @param {string} topicId
 * @param {Object} tree  TopicTree instance
 */
export function removeChatFromTopic(chatId, topicId, tree) {
  if (!chatId) throw new Error('Chat ID is required');
  if (!topicId || !tree) return;
  const topic = tree.topics[topicId];
  if (!topic) return;
  topic.chatIds = topic.chatIds.filter(id => id !== chatId);
}

/**
 * Move a chat from its current topic to a new topic.
 * Mutates the tree. Returns the updated chat object.
 *
 * @param {Object} chat
 * @param {string} newTopicId
 * @param {Object} tree
 * @returns {Object}  Updated chat with new topicId
 */
export function moveChatToTopic(chat, newTopicId, tree) {
  if (!chat) throw new Error('Chat is required');
  if (!newTopicId) throw new Error('New topic ID is required');
  if (!tree) throw new Error('Tree is required');

  if (chat.topicId) {
    removeChatFromTopic(chat.id, chat.topicId, tree);
  }
  return assignChatToTopic(chat, newTopicId, tree);
}

/**
 * Return a new chats array with the specified chat updated (immutable).
 *
 * @param {string} chatId
 * @param {Object} updates  Partial fields to merge
 * @param {Array} chats
 * @returns {Array}
 */
export function updateChatInArray(chatId, updates, chats) {
  if (!chatId) throw new Error('Chat ID is required');
  if (!Array.isArray(chats)) return [];
  return chats.map(c => c.id === chatId ? { ...c, ...updates } : c);
}

/**
 * Return a new chats array with the specified chat removed (immutable).
 *
 * @param {string} chatId
 * @param {Array} chats
 * @returns {Array}
 */
export function removeChatFromArray(chatId, chats) {
  if (!chatId) throw new Error('Chat ID is required');
  if (!Array.isArray(chats)) return [];
  return chats.filter(c => c.id !== chatId);
}

/**
 * Return a display-ready title string for a chat entry.
 * Prefixes with ✂️ for excerpts, 💬 for full chats.
 *
 * @param {Object} chat
 * @returns {string}
 */
export function buildChatDisplayTitle(chat) {
  if (!chat) return '';
  const prefix = chat.metadata?.isExcerpt ? '✂️ ' : '💬 ';
  return prefix + (chat.title || 'Untitled Chat');
}
