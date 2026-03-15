/**
 * chat-repository.js
 *
 * Responsibility: all browser.storage I/O for chats.
 *
 * Storage format (P1.1 scalability fix):
 *   chatIndex          — Array of metadata-only chat objects (no `content`).
 *   chatSearchIndex    — Array of {id, title, tags, timestamp, searchableText}
 *                        where searchableText has base64 images stripped.
 *   chat:<id>          — Full chat object (including content) for each chat.
 *
 * The previous monolithic `chats` key is automatically migrated on the first
 * call to `loadAll()` when the new keys are absent.
 *
 * NOT responsible for: tree persistence, UI rendering, or business logic.
 */

import { StorageService } from '../../lib/storage.js';
import { logger } from '../../lib/utils/logger.js';


/**
 * Maximum number of chat metadata entries held in memory via `state.chats`.
 */
export const MAX_CHATS_IN_MEMORY = 5000;

/** Storage key for the metadata-only index array. */
export const CHAT_INDEX_KEY = 'chatIndex';

/** Storage key for the text-search index (images stripped). */
export const CHAT_SEARCH_INDEX_KEY = 'chatSearchIndex';

/** Prefix for per-chat full-content keys. */
const CHAT_KEY_PREFIX = 'chat:';

/** Return the storage key for a specific chat. */
function chatKey(id) { return `${CHAT_KEY_PREFIX}${id}`; }

/** Strip the heavy `content` field — only metadata is needed in the panel UI. */
function toMeta({ content: _c, ...meta }) { return meta; }

/**
 * Build a compact search entry from a full chat.
 * Strips base64 data URIs so the search index stays small.
 */
function toSearchEntry(chat) {
  const searchableText = (chat.content ?? '')
    .replace(/data:[^,]+,[A-Za-z0-9+/=\r\n]+/g, '')
    .trim();
  return {
    id:            chat.id,
    title:         chat.title,
    tags:          chat.tags ?? [],
    timestamp:     chat.timestamp,
    searchableText,
  };
}

export class ChatRepository {
  /**
   * @param {import('../../lib/storage.js').IStorageService} [storageAdapter]
   *   Defaults to the StorageService singleton.  Pass a mock for unit tests.
   */
  constructor(storageAdapter) {
    this._storage = storageAdapter ?? StorageService.getInstance();
  }

  /**
   * Load all chat metadata from storage, sorted by timestamp desc and capped
   * at MAX_CHATS_IN_MEMORY.  Automatically migrates from the legacy monolithic
   * 'chats' key to the per-chat-key format on first call if needed.
   * @returns {Promise<object[]>}
   */
  async loadAll() {
    try {
      const result = await this._storage.get([CHAT_INDEX_KEY]);
      let index = result[CHAT_INDEX_KEY];

      if (!Array.isArray(index)) {
        // Check for legacy 'chats' key and migrate if present
        const legacyResult = await this._storage.get(['chats']);
        const legacy = legacyResult.chats;
        if (Array.isArray(legacy) && legacy.length > 0) {
          index = await this._migrateFromLegacy(legacy);
        } else {
          index = [];
        }
      }

      const sorted = index.slice().sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0));

      if (sorted.length > MAX_CHATS_IN_MEMORY) {
        logger.warn(
          `ChatRepository.loadAll: ${sorted.length} chats in storage exceeds MAX_CHATS_IN_MEMORY (${MAX_CHATS_IN_MEMORY}). ` +
          `Loading most-recent ${MAX_CHATS_IN_MEMORY} only.`
        );
      }

      const capped = sorted.slice(0, MAX_CHATS_IN_MEMORY);
      logger.info('Chats loaded:', capped.length);
      return capped; // chatIndex entries are already metadata-only
    } catch (err) {
      logger.error('ChatRepository.loadAll error:', err);
      return [];
    }
  }

  /**
   * Migrate the legacy monolithic 'chats' array to per-chat-key format.
   * Writes chatIndex, chatSearchIndex, and individual chat:<id> keys,
   * then removes the legacy 'chats' key.
   * @private
   * @param {object[]} legacyChats
   * @returns {Promise<object[]>} The new chatIndex (metadata-only entries)
   */
  async _migrateFromLegacy(legacyChats) {
    logger.info(`ChatRepository: migrating ${legacyChats.length} chats to per-key format`);
    const writes = {};
    legacyChats.forEach(c => { writes[chatKey(c.id)] = c; });
    const index = legacyChats.map(toMeta);
    writes[CHAT_INDEX_KEY]        = index;
    writes[CHAT_SEARCH_INDEX_KEY] = legacyChats.map(toSearchEntry);
    await this._storage.set(writes);
    try { await this._storage.remove(['chats']); } catch { /* best-effort */ }
    return index;
  }

  /**
   * Fetch the full content of a single chat on demand.
   * @param {string} chatId
   * @returns {Promise<string|null>}
   */
  async getFullContent(chatId) {
    try {
      const result = await this._storage.get([chatKey(chatId)]);
      return result[chatKey(chatId)]?.content ?? null;
    } catch (err) {
      logger.error('ChatRepository.getFullContent error:', err);
      return null;
    }
  }

  /**
   * Update a single chat in place.
   * Reads and writes only the one chat key + the index — no full-array
   * roundtrip regardless of collection size.
   * @param {string} chatId
   * @param {object} updates  Partial fields to merge.
   * @returns {Promise<object[]>}  Updated metadata index.
   */
  async updateChat(chatId, updates) {
    const [chatResult, indexResult] = await Promise.all([
      this._storage.get([chatKey(chatId)]),
      this._storage.get([CHAT_INDEX_KEY]),
    ]);

    const existing = chatResult[chatKey(chatId)];
    const index    = Array.isArray(indexResult[CHAT_INDEX_KEY]) ? indexResult[CHAT_INDEX_KEY] : [];
    const inIndex  = index.some(m => m.id === chatId);

    // If the chat doesn't exist anywhere, there is nothing to update.
    if (!existing && !inIndex) return index;

    const updatedChat = { ...(existing ?? {}), ...updates };
    const chatMeta    = toMeta(updatedChat);
    const newIndex    = inIndex
      ? index.map(m => m.id === chatId ? chatMeta : m)
      : [...index, chatMeta];

    const writes = {
      [chatKey(chatId)]: updatedChat,
      [CHAT_INDEX_KEY]:  newIndex,
    };

    if ('content' in updates) {
      const searchResult = await this._storage.get([CHAT_SEARCH_INDEX_KEY]);
      const si = Array.isArray(searchResult[CHAT_SEARCH_INDEX_KEY]) ? searchResult[CHAT_SEARCH_INDEX_KEY] : [];
      const newEntry = toSearchEntry(updatedChat);
      writes[CHAT_SEARCH_INDEX_KEY] = si.some(e => e.id === chatId)
        ? si.map(e => e.id === chatId ? newEntry : e)
        : [...si, newEntry];
    }

    await this._storage.set(writes);
    return newIndex;
  }

  /**
   * Append (or replace by id) a chat entry.
   * Writes only the new chat key, the index, and the search index.
   * @param {object} chatEntry  Full chat object (including content).
   * @returns {Promise<object[]>} Updated metadata index.
   */
  async addChat(chatEntry) {
    const [indexResult, searchResult] = await Promise.all([
      this._storage.get([CHAT_INDEX_KEY]),
      this._storage.get([CHAT_SEARCH_INDEX_KEY]),
    ]);

    const index       = Array.isArray(indexResult[CHAT_INDEX_KEY])          ? indexResult[CHAT_INDEX_KEY]          : [];
    const searchIndex = Array.isArray(searchResult[CHAT_SEARCH_INDEX_KEY]) ? searchResult[CHAT_SEARCH_INDEX_KEY] : [];

    // Deduplicate by id (replace any existing entry with the same id)
    const newIndex       = [...index.filter(m => m.id !== chatEntry.id),       toMeta(chatEntry)];
    const newSearchIndex = [...searchIndex.filter(e => e.id !== chatEntry.id), toSearchEntry(chatEntry)];

    await this._storage.set({
      [chatKey(chatEntry.id)]: chatEntry,
      [CHAT_INDEX_KEY]:        newIndex,
      [CHAT_SEARCH_INDEX_KEY]: newSearchIndex,
    });

    return newIndex;
  }

  /**
   * Remove a single chat from storage.
   * @param {string} chatId
   * @returns {Promise<object[]>} Updated metadata index.
   */
  async removeChat(chatId) {
    const [indexResult, searchResult] = await Promise.all([
      this._storage.get([CHAT_INDEX_KEY]),
      this._storage.get([CHAT_SEARCH_INDEX_KEY]),
    ]);

    const index       = Array.isArray(indexResult[CHAT_INDEX_KEY])          ? indexResult[CHAT_INDEX_KEY]          : [];
    const searchIndex = Array.isArray(searchResult[CHAT_SEARCH_INDEX_KEY]) ? searchResult[CHAT_SEARCH_INDEX_KEY] : [];

    const newIndex       = index.filter(m => m.id !== chatId);
    const newSearchIndex = searchIndex.filter(e => e.id !== chatId);

    await this._storage.set({
      [CHAT_INDEX_KEY]:        newIndex,
      [CHAT_SEARCH_INDEX_KEY]: newSearchIndex,
    });

    try { await this._storage.remove([chatKey(chatId)]); } catch { /* best-effort */ }

    return newIndex;
  }

  /**
   * Remove multiple chats at once (e.g. deleting an entire topic).
   * @param {Set<string>|string[]} chatIds
   * @returns {Promise<object[]>} Updated metadata index.
   */
  async removeManyChats(chatIds) {
    const deleteSet = new Set(chatIds);

    const [indexResult, searchResult] = await Promise.all([
      this._storage.get([CHAT_INDEX_KEY]),
      this._storage.get([CHAT_SEARCH_INDEX_KEY]),
    ]);

    const index       = Array.isArray(indexResult[CHAT_INDEX_KEY])          ? indexResult[CHAT_INDEX_KEY]          : [];
    const searchIndex = Array.isArray(searchResult[CHAT_SEARCH_INDEX_KEY]) ? searchResult[CHAT_SEARCH_INDEX_KEY] : [];

    const newIndex       = index.filter(m => !deleteSet.has(m.id));
    const newSearchIndex = searchIndex.filter(e => !deleteSet.has(e.id));

    await this._storage.set({
      [CHAT_INDEX_KEY]:        newIndex,
      [CHAT_SEARCH_INDEX_KEY]: newSearchIndex,
    });

    if (deleteSet.size > 0) {
      try { await this._storage.remove([...deleteSet].map(chatKey)); } catch { /* best-effort */ }
    }

    return newIndex;
  }

  /**
   * Replace the entire chat collection in storage (used by import).
   * Deletes orphaned per-chat keys from the previous collection.
   * @param {object[]} chats  Full chat objects (including content).
   * @returns {Promise<object[]>} Metadata array for the new collection.
   */
  async replaceAll(chats) {
    // Read old index to identify orphaned per-chat keys to clean up
    const indexResult = await this._storage.get([CHAT_INDEX_KEY]);
    const oldIndex    = Array.isArray(indexResult[CHAT_INDEX_KEY]) ? indexResult[CHAT_INDEX_KEY] : [];
    const newIds      = new Set(chats.map(c => c.id));

    const writes = {};
    chats.forEach(c => { writes[chatKey(c.id)] = c; });
    writes[CHAT_INDEX_KEY]        = chats.map(toMeta);
    writes[CHAT_SEARCH_INDEX_KEY] = chats.map(toSearchEntry);

    await this._storage.set(writes);

    const orphans = oldIndex.map(m => m.id).filter(id => !newIds.has(id));
    if (orphans.length > 0) {
      try { await this._storage.remove(orphans.map(chatKey)); } catch { /* best-effort */ }
    }

    return chats.map(toMeta);
  }

  /**
   * Load full chat objects (with content) for the specified IDs.
   * Reads only the relevant per-chat keys — no full-collection scan.
   * @param {Set<string>|string[]} ids
   * @returns {Promise<object[]>}
   */
  async loadFullByIds(ids) {
    const idArr = [...new Set(ids)];
    if (idArr.length === 0) return [];
    const keys   = idArr.map(chatKey);
    const result = await this._storage.get(keys);
    return keys.map(k => result[k]).filter(Boolean);
  }
}
