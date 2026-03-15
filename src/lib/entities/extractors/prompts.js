/**
 * prompts.js — extractor for Prompt entities.
 *
 * One Prompt entity is created for every user-role message in the chat.
 */

import { ENTITY_TYPES, createEntity } from '../chat-entity.js';

/**
 * Extract all user prompts from a message array.
 *
 * @param {Object[]}      messages  Array of message objects from the chat
 * @param {Document|null} _doc      Unused — prompts are text-only
 * @param {string}        chatId
 * @returns {Object[]}
 */
export function extractPrompts(messages, _doc, chatId) {
  return messages
    .filter(m => m.role === 'user')
    .map((m, i) => createEntity(ENTITY_TYPES.PROMPT, m.index ?? i, chatId, 'user', {
      roleOrdinal: i + 1,   // 1-based ordinal among user messages
      text:      m.content ?? '',
      wordCount: (m.content ?? '').trim().split(/\s+/).filter(Boolean).length,
    }));
}
