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

import { StorageService } from '../../lib/storage.js';
import { updateChatInArray, removeChatFromArray } from '../../lib/chat/chat-manager.js';
import { logger } from '../../lib/utils/logger.js';

/**
 * Maximum number of chat metadata entries held in memory via `state.chats`.
 *
 * Chrome's `storage.local` quota (~5–10 MB) naturally caps total data, but an
 * in-memory array of all metadata can still grow large for heavy users.  This
 * constant caps `loadAll()` to the N most-recent chats (sorted by `timestamp`
 * descending) so the panel's heap footprint stays bounded regardless of how
 * many chats are stored.  Chats beyond the cap remain safely in storage and
 * re-appear as the user deletes older items.
 */
export const MAX_CHATS_IN_MEMORY = 5000;

/** Strip the heavy `content` field — only metadata is needed in the panel UI. */
function toMeta({ content: _c, ...meta }) {
  return meta;
}

export class ChatRepository {
  /**
   * @param {import('../../lib/storage.js').IStorageService} [storageAdapter]
   *   The storage service to delegate all reads and writes to.
   *   Defaults to the `StorageService` singleton so that callers that do not
   *   hold a reference (e.g. background workers) remain zero-config.
   *   Pass an explicit instance (or a mock) for constructor-injection and
   *   unit testing — no `browser` global is required by the repository itself.
   */
  constructor(storageAdapter) {
    this._storage = storageAdapter ?? StorageService.getInstance();
  }

  /**
   * Load all chats from storage.
   * Returns metadata-only objects (content field stripped), sorted by
   * `timestamp` descending (most-recent first) and capped at
   * `MAX_CHATS_IN_MEMORY` entries.  A warning is logged if the cap is applied
   * so operators can detect unusually large collections.
   * @returns {Promise<object[]>}
   */
  async loadAll() {
    try {
      const result = await this._storage.get(['chats']);
      const rawChats = Array.isArray(result.chats) ? result.chats : [];

      // Sort by recency so the cap always keeps the most recent chats.
      const sorted = rawChats.slice().sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0));

      if (sorted.length > MAX_CHATS_IN_MEMORY) {
        logger.warn(
          `ChatRepository.loadAll: ${sorted.length} chats in storage exceeds MAX_CHATS_IN_MEMORY (${MAX_CHATS_IN_MEMORY}). ` +
          `Loading most-recent ${MAX_CHATS_IN_MEMORY} only.`
        );
      }

      const capped = sorted.slice(0, MAX_CHATS_IN_MEMORY);
      const metas = capped.map(toMeta);
      logger.info('Chats loaded:', metas.length);
      return metas;
    } catch (err) {
      logger.error('ChatRepository.loadAll error:', err);
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
      const result = await this._storage.get(['chats']);
      const chats = Array.isArray(result.chats) ? result.chats : [];
      const chat = chats.find(c => c.id === chatId);
      return chat?.content ?? null;
    } catch (err) {
      logger.error('ChatRepository.getFullContent error:', err);
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
    const result = await this._storage.get(['chats']);
    const full = Array.isArray(result.chats) ? result.chats : [];
    const updated = updateChatInArray(chatId, updates, full);
    await this._storage.set({ chats: updated });
    return updated.map(toMeta);
  }

  /**
   * Append a new chat entry to storage and return the updated metadata list.
   * @param {object} chatEntry  Full chat object (including content).
   * @returns {Promise<object[]>}
   */
  async addChat(chatEntry) {
    const result = await this._storage.get(['chats']);
    const full = Array.isArray(result.chats) ? result.chats : [];
    // Avoid duplicates — remove any existing entry with the same id first
    const deduped = full.filter(c => c.id !== chatEntry.id);
    const updated = [...deduped, chatEntry];
    await this._storage.set({ chats: updated });
    return updated.map(toMeta);
  }

  /**
   * Remove a chat from storage and return the updated metadata list.
   * @param {string} chatId
   * @returns {Promise<object[]>}
   */
  async removeChat(chatId) {
    const result = await this._storage.get(['chats']);
    const full = Array.isArray(result.chats) ? result.chats : [];
    const updated = removeChatFromArray(chatId, full);
    await this._storage.set({ chats: updated });
    return updated.map(toMeta);
  }

  /**
   * Remove multiple chats at once (e.g. when deleting a topic with all its chats).
   * @param {Set<string>|string[]} chatIds
   * @returns {Promise<object[]>}
   */
  async removeManyChats(chatIds) {
    const deleteSet = new Set(chatIds);
    const result = await this._storage.get(['chats']);
    const full = Array.isArray(result.chats) ? result.chats : [];
    const updated = full.filter(c => !deleteSet.has(c.id));
    await this._storage.set({ chats: updated });
    return updated.map(toMeta);
  }

  /**
   * Replace the entire chats array in storage (used by import).
   * @param {object[]} chats  Full chat objects.
   * @returns {Promise<object[]>}  Metadata array.
   */
  async replaceAll(chats) {
    await this._storage.set({ chats });
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
    const result = await this._storage.get(['chats']);
    const full = Array.isArray(result.chats) ? result.chats : [];
    return full.filter(c => idSet.has(c.id));
  }
}
