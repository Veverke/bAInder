/**
 * entity-store.js — cross-chat entity query API.
 *
 * Reads entity arrays directly from the in-memory chats array (already loaded
 * in state.chats), so no additional storage calls are needed.
 */

import { ENTITY_TYPES } from './chat-entity.js';

const ALL_TYPES = Object.values(ENTITY_TYPES);

export class EntityStore {
  /**
   * @param {Function} getChatsFn  () => ChatEntry[]  — injected to avoid coupling to state
   */
  constructor(getChatsFn) {
    this._getChats = getChatsFn;
  }

  /**
   * All entities of a given type across all chats, sorted by chatId then messageIndex.
   * @param {string} type  One of ENTITY_TYPES values
   * @returns {Object[]}
   */
  getAllByType(type) {
    const chats = this._getChats();
    const result = [];
    for (const chat of chats) {
      const entities = chat[type];
      if (Array.isArray(entities)) result.push(...entities);
    }
    return result.sort((a, b) => {
      if (a.chatId < b.chatId) return -1;
      if (a.chatId > b.chatId) return 1;
      return (a.messageIndex ?? 0) - (b.messageIndex ?? 0);
    });
  }

  /**
   * All entities within a specific chat, optionally filtered to one type.
   * @param {string}      chatId
   * @param {string|null} [type=null]  null = all types
   * @returns {Object[]}
   */
  getForChat(chatId, type = null) {
    const chats = this._getChats();
    const chat = chats.find(c => c.id === chatId);
    if (!chat) return [];
    const types = type ? [type] : ALL_TYPES;
    const result = [];
    for (const t of types) {
      const entities = chat[t];
      if (Array.isArray(entities)) result.push(...entities);
    }
    return result;
  }

  /**
   * All entity types that have at least one entity across all chats.
   * @returns {string[]}
   */
  getPresentTypes() {
    const chats = this._getChats();
    const present = new Set();
    for (const chat of chats) {
      for (const type of ALL_TYPES) {
        if (Array.isArray(chat[type]) && chat[type].length > 0) {
          present.add(type);
        }
      }
    }
    return [...present];
  }

  /**
   * Look up a single chat by id — used by ChatEntityTree for topic grouping.
   * @param {string} chatId
   * @returns {Object|null}
   */
  getChatById(chatId) {
    return this._getChats().find(c => c.id === chatId) ?? null;
  }
}
