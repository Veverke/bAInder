/**
 * chat-repository.js
 *
 * Responsibility: all browser.storage I/O for the `chats` array.
 *
 * Previously this logic was scattered across sidepanel.js as inline
 * `browser.storage.local.get(['chats'])` calls with a repetitive
 * get-check-mutate-set pattern (Issues 1.5 & 4.2).  Centralising it here:
 *
 *  - gives every caller a single, testable abstraction
 *  - removes reliance on the raw browser API across feature modules
 *  - makes the repeated pattern DRY
 *
 * NOT responsible for: tree persistence, UI rendering, or business logic.
 */

import browser from '../../lib/vendor/browser.js';
import { updateChatInArray, removeChatFromArray } from '../../lib/chat-manager.js';
import { logger } from '../../lib/logger.js';

/** Strip the heavy `content` field — only metadata is needed in the panel UI. */
function toMeta({ content: _c, ...meta }) {
  return meta;
}

export class ChatRepository {
  /**
   * Load all chats from storage.
   * Returns metadata-only objects (content field stripped).
   * @returns {Promise<object[]>}
   */
  async loadAll() {
    try {
      const result = await browser.storage.local.get(['chats']);
      const rawChats = Array.isArray(result.chats) ? result.chats : [];
      const metas = rawChats.map(toMeta);
      logger.log(`ChatRepository: loaded ${metas.length} chats (metadata only)`);
      return metas;
    } catch (err) {
      console.error('ChatRepository.loadAll error:', err);
      return [];
    }
  }

  /**
   * Fetch the full content of a single chat on demand.
   * @param {string} chatId
   * @returns {Promise<string|null>}
   */
  async getFullContent(chatId) {
    try {
      const result = await browser.storage.local.get(['chats']);
      const chats = Array.isArray(result.chats) ? result.chats : [];
      const chat = chats.find(c => c.id === chatId);
      return chat?.content ?? null;
    } catch (err) {
      console.error('ChatRepository.getFullContent error:', err);
      return null;
    }
  }

  /**
   * Persist an update to a single chat.
   * Reads the full list, applies `updates`, writes back, and returns the new
   * metadata-only list for state.chats.
   *
   * @param {string} chatId
   * @param {object} updates  Partial chat fields to merge.
   * @returns {Promise<object[]>}  Updated metadata array.
   */
  async updateChat(chatId, updates) {
    const result = await browser.storage.local.get(['chats']);
    const full = Array.isArray(result.chats) ? result.chats : [];
    const updated = updateChatInArray(chatId, updates, full);
    await browser.storage.local.set({ chats: updated });
    return updated.map(toMeta);
  }

  /**
   * Append a new chat entry to storage and return the updated metadata list.
   * @param {object} chatEntry  Full chat object (including content).
   * @returns {Promise<object[]>}
   */
  async addChat(chatEntry) {
    const result = await browser.storage.local.get(['chats']);
    const full = Array.isArray(result.chats) ? result.chats : [];
    // Avoid duplicates — remove any existing entry with the same id first
    const deduped = full.filter(c => c.id !== chatEntry.id);
    const updated = [...deduped, chatEntry];
    await browser.storage.local.set({ chats: updated });
    return updated.map(toMeta);
  }

  /**
   * Remove a chat from storage and return the updated metadata list.
   * @param {string} chatId
   * @returns {Promise<object[]>}
   */
  async removeChat(chatId) {
    const result = await browser.storage.local.get(['chats']);
    const full = Array.isArray(result.chats) ? result.chats : [];
    const updated = removeChatFromArray(chatId, full);
    await browser.storage.local.set({ chats: updated });
    return updated.map(toMeta);
  }

  /**
   * Remove multiple chats at once (e.g. when deleting a topic with all its chats).
   * @param {Set<string>|string[]} chatIds
   * @returns {Promise<object[]>}
   */
  async removeManyChats(chatIds) {
    const deleteSet = new Set(chatIds);
    const result = await browser.storage.local.get(['chats']);
    const full = Array.isArray(result.chats) ? result.chats : [];
    const updated = full.filter(c => !deleteSet.has(c.id));
    await browser.storage.local.set({ chats: updated });
    return updated.map(toMeta);
  }

  /**
   * Replace the entire chats array in storage (used by import).
   * @param {object[]} chats  Full chat objects.
   * @returns {Promise<object[]>}  Metadata array.
   */
  async replaceAll(chats) {
    await browser.storage.local.set({ chats });
    return chats.map(toMeta);
  }

  /**
   * Load all full chat objects (with content) matching the given IDs.
   * Used for export/digest workflows that need full content on demand.
   * @param {Set<string>|string[]} ids
   * @returns {Promise<object[]>}
   */
  async loadFullByIds(ids) {
    const idSet = new Set(ids);
    const result = await browser.storage.local.get(['chats']);
    const full = Array.isArray(result.chats) ? result.chats : [];
    return full.filter(c => idSet.has(c.id));
  }
}
