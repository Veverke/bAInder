import browser from './vendor/browser.js';
import { logger } from './utils/logger.js';
/**
 * bAInder Storage Service
 * Stage 2: Storage Abstraction Layer
 * 
 * Provides a flexible storage interface that can be swapped between
 * browser.storage.local (MVP) and IndexedDB (future enhancement).
 */

/**
 * Storage Service Interface
 * Defines the contract that all storage adapters must implement
 */
export class IStorageService {
  /**
   * Save the entire topic tree structure
   * @param {Object} tree - The topic tree object
   * @returns {Promise<void>}
   */
  async saveTopicTree(tree) {
    throw new Error('Method not implemented');
  }

  /**
   * Load the entire topic tree structure
   * @returns {Promise<Object>} The topic tree object
   */
  async loadTopicTree() {
    throw new Error('Method not implemented');
  }

  /**
   * Search chats by query string.
   * @param {string}       query  - The search query
   * @param {Object[]|null} [chats] - Optional pre-loaded chats array; if provided
   *                                  the storage read is skipped entirely.
   * @returns {Promise<Array>} Array of matching chat entries (capped at SEARCH_RESULT_CAP)
   */
  async searchChats(query, chats = null) {
    throw new Error('Method not implemented');
  }

  /**
   * Get storage usage statistics.
   * @param {{ topicCount: number, chatCount: number }|null} [counts=null]
   *   Optional in-memory counts.  When supplied the method skips the data
   *   reads for tree and chats and only calls `getBytesInUse()`.
   * @returns {Promise<Object>} Object with bytes used and quota info
   */
  async getStorageUsage(counts = null) {
    throw new Error('Method not implemented');
  }

  /**
   * Clear all data (for testing/reset)
   * @returns {Promise<void>}
   */
  async clearAll() {
    throw new Error('Method not implemented');
  }

  /**
   * Low-level key/value read — mirrors `browser.storage.local.get(keys)`.
   * Intended for use by `ChatRepository` and similar focused repositories
   * that own a specific key space but should not bypass the service layer.
   * @param {string|string[]} keys
   * @returns {Promise<object>}
   */
  async get(keys) {
    throw new Error('Method not implemented');
  }

  /**
   * Low-level key/value write — mirrors `browser.storage.local.set(data)`.
   * @param {object} data
   * @returns {Promise<void>}
   */
  async set(data) {
    throw new Error('Method not implemented');
  }
}

/** Maximum number of results returned by {@link ChromeStorageAdapter#searchChats}. */
export const SEARCH_RESULT_CAP = 200;

/** storage.local key for the user-chosen warning threshold (in MB). */
export const STORAGE_WARN_THRESHOLD_KEY = 'storageWarnThresholdMB';

/** Default warning threshold when no setting is saved (500 MB). */
export const STORAGE_WARN_THRESHOLD_DEFAULT_MB = 500;

/**
 * Chrome Storage Adapter
 * Implementation using browser.storage.local API
 */
export class ChromeStorageAdapter extends IStorageService {
  constructor() {
    super();
    this.KEYS = {
      TOPIC_TREE: 'topicTree',
      CHATS: 'chats',
      METADATA: 'metadata'
    };
  }

  /**
   * Save the topic tree structure
   */
  async saveTopicTree(tree) {
    try {
      await browser.storage.local.set({
        [this.KEYS.TOPIC_TREE]: tree
      });
      await this._updateMetadata();
      return true;
    } catch (error) {
      logger.error('Error saving topic tree:', error);
      throw new Error(`Failed to save topic tree: ${error.message}`);
    }
  }

  /**
   * Load the topic tree structure
   */
  async loadTopicTree() {
    try {
      const result = await browser.storage.local.get(this.KEYS.TOPIC_TREE);
      return result[this.KEYS.TOPIC_TREE] || {
        topics: {},
        rootTopicIds: [],
        version: 1
      };
    } catch (error) {
      logger.error('Error loading topic tree:', error);
      throw new Error(`Failed to load topic tree: ${error.message}`);
    }
  }

  /**
   * Search chats by query string.
   * Orchestrates: (load or reuse) → early-exit → filter → rank → cap.
   *
   * @param {string}        query        - Search query; returns [] when empty.
   * @param {Object[]|null} [chats=null] - Pre-loaded chats array.  When
   *   supplied the method operates entirely in-memory — no storage read is
   *   performed.  Pass `null` (or omit) to fall back to a storage read.
   * @returns {Promise<Object[]>} Ranked array of up to SEARCH_RESULT_CAP chats.
   */
  async searchChats(query, chats = null) {
    try {
      // ── Resolve chats array ──────────────────────────────────────────────
      // Prefer the caller-supplied in-memory array so the storage read can be
      // skipped entirely for every keystroke after the initial load.
      let chatList;
      if (chats !== null) {
        chatList = chats;
      } else {
        const result = await browser.storage.local.get(this.KEYS.CHATS);
        chatList = result[this.KEYS.CHATS] || [];
      }

      // ── Filter-only mode: no query text, return all chats unranked ───────
      if (!query) return chatList.filter(Boolean);

      // ── Filter → rank → cap ──────────────────────────────────────────────
      const lowerQuery = query.toLowerCase();
      const matches = chatList.filter(chat => chat && this._matchesQuery(chat, lowerQuery));
      const ranked  = this._rankChats(matches, lowerQuery);
      return ranked.slice(0, SEARCH_RESULT_CAP);
    } catch (error) {
      logger.error('Error searching chats:', error);
      throw new Error(`Failed to search chats: ${error.message}`);
    }
  }

  /**
   * Build the full searchable text for one chat.
   * Concatenates title, content, and tags so the caller can do a single
   * `.includes()` check instead of probing each field individually.
   * @param {Object} chat
   * @returns {string} Lower-cased, space-joined text
   */
  _buildSearchableText(chat) {
    const tagText = (chat.tags || []).join(' ');
    return `${chat.title || ''} ${chat.content || ''} ${tagText}`.toLowerCase();
  }

  /**
   * Return true when `chat` contains `lowerQuery` in any searchable field.
   * @param {Object} chat
   * @param {string} lowerQuery — already lower-cased query string
   * @returns {boolean}
   */
  _matchesQuery(chat, lowerQuery) {
    return this._buildSearchableText(chat).includes(lowerQuery);
  }

  /**
   * Sort an array of matching chats by relevance:
   *   1. Title or tag match  (highest priority)
   *   2. Content-only match  (lower priority, falls through to…)
   *   3. Most-recent timestamp (tie-breaker)
   *
   * Uses a Schwartzian transform (decorate → sort → undecorate) so that
   * `_isTopResult` is called exactly once per element — O(n×k) — rather than
   * once per comparator invocation — O(n log n × k).  The sort itself only
   * touches cheap boolean and numeric comparisons.
   *
   * @param {Object[]} matches  — already-filtered chats
   * @param {string}   lowerQuery
   * @returns {Object[]} new sorted array (original is not mutated)
   */
  _rankChats(matches, lowerQuery) {
    return matches
      .map(chat => ({ chat, isTop: this._isTopResult(chat, lowerQuery) }))
      .sort((a, b) => {
        if (a.isTop && !b.isTop) return -1;
        if (!a.isTop && b.isTop) return  1;
        return (b.chat.timestamp || 0) - (a.chat.timestamp || 0);
      })
      .map(({ chat }) => chat);
  }

  /**
   * Return true when `lowerQuery` appears in the chat's title or any tag.
   * These matches are considered higher-relevance than content-only matches.
   * @param {Object} chat
   * @param {string} lowerQuery
   * @returns {boolean}
   */
  _isTopResult(chat, lowerQuery) {
    const titleMatch = (chat.title || '').toLowerCase().includes(lowerQuery);
    const tagMatch   = (chat.tags  || []).some(t => t.toLowerCase().includes(lowerQuery));
    return titleMatch || tagMatch;
  }

  /**
   * Get storage usage statistics.
   *
   * When `counts` is supplied the caller already holds the data in memory;
   * only `getBytesInUse()` is called (one network hop instead of three).
   * When `counts` is omitted the two content reads are batched into a single
   * `browser.storage.local.get([tree, chats])` call that runs in parallel
   * with `getBytesInUse()` via `Promise.all`.
   *
   * @param {{ topicCount: number, chatCount: number }|null} [counts=null]
   * @returns {Promise<Object>}
   */
  async getStorageUsage(counts = null) {
    try {
      // This extension declares unlimitedStorage in its manifest, so Chrome
      // does not enforce any quota.  QUOTA_BYTES is a fixed constant on the
      // API object (10 MB) that Chrome never clears even when the permission
      // is granted, so reading it produces a misleading denominator.  We
      // always treat bytesQuota as null (unlimited) so the display shows
      // "X.XX MB used" with no fabricated ceiling.
      const quota = null;

      if (counts !== null) {
        // ── Fast path: caller supplied in-memory counts ─────────────────────
        // Only the byte total requires a storage call.
        const bytesInUse = await browser.storage.local.getBytesInUse();
        return {
          bytesUsed:   bytesInUse,
          bytesQuota:  quota,
          percentUsed: null,
          topicCount:  counts.topicCount,
          chatCount:   counts.chatCount,
        };
      }

      // ── Fallback: fetch counts from storage ─────────────────────────────
      // Batch getBytesInUse with a single get([tree, chats]) so both run in
      // parallel and we make only two round-trips instead of three.
      const [bytesInUse, storageData] = await Promise.all([
        browser.storage.local.getBytesInUse(),
        browser.storage.local.get([this.KEYS.TOPIC_TREE, this.KEYS.CHATS]),
      ]);
      const tree  = storageData[this.KEYS.TOPIC_TREE] || { topics: {} };
      const chats = storageData[this.KEYS.CHATS] || [];

      return {
        bytesUsed:   bytesInUse,
        bytesQuota:  quota,
        percentUsed: null,
        topicCount:  Object.keys(tree.topics || {}).length,
        chatCount:   chats.length,
      };
    } catch (error) {
      logger.error('Error getting storage usage:', error);
      throw new Error(`Failed to get storage usage: ${error.message}`);
    }
  }

  /**
   * Clear all data
   */
  async clearAll() {
    try {
      await browser.storage.local.clear();
      return true;
    } catch (error) {
      logger.error('Error clearing storage:', error);
      throw new Error(`Failed to clear storage: ${error.message}`);
    }
  }

  /**
   * Low-level key/value read — thin proxy to `browser.storage.local.get(keys)`.
   * Allows `ChatRepository` (and similar data repositories) to delegate
   * storage reads through the service layer without duplicating the import.
   * @param {string|string[]} keys
   * @returns {Promise<object>}
   */
  async get(keys) {
    return browser.storage.local.get(keys);
  }

  /**
   * Low-level key/value write — thin proxy to `browser.storage.local.set(data)`.
   * @param {object} data
   * @returns {Promise<void>}
   */
  async set(data) {
    return browser.storage.local.set(data);
  }

  /**
   * Private: Update metadata (last updated timestamp, counts)
   */
  async _updateMetadata() {
    try {
      const metadata = {
        lastUpdated: Date.now(),
        version: 1
      };
      await browser.storage.local.set({
        [this.KEYS.METADATA]: metadata
      });
    } catch (error) {
      logger.error('Error updating metadata:', error);
    }
  }

}

/**
 * Storage Service Factory
 * Creates and returns the appropriate storage adapter
 */
export class StorageService {
  static _instance = null;

  /**
   * Get or create storage service instance (singleton)
   * @param {string} type - Storage type ('chrome' or 'indexeddb' - future)
   * @returns {IStorageService} Storage service instance
   */
  static getInstance(type = 'chrome') {
    if (!this._instance) {
      switch (type) {
        case 'chrome':
          this._instance = new ChromeStorageAdapter();
          break;
        case 'indexeddb':
          throw new Error('IndexedDB adapter not yet implemented');
        default:
          throw new Error(`Unknown storage type: ${type}`);
      }
    }
    return this._instance;
  }

  /**
   * Reset the singleton instance (for testing)
   */
  static resetInstance() {
    this._instance = null;
  }
}

/**
 * Storage Usage Tracker Utility
 * Provides convenient methods for monitoring storage usage
 */
export class StorageUsageTracker {
  constructor(storageService) {
    this.storage = storageService;
  }

  // ── Private sync helpers (operate on an already-fetched usage object) ──────

  /**
   * Format a usage object into a human-readable string.
   * When `bytesQuota` is null (unlimited storage, no real cap) only the
   * bytes-used value is shown so the display is never misleading.
   * @param {{ bytesUsed: number, bytesQuota: number|null }} usage
   * @returns {string}
   */
  _formatUsage(usage) {
    const usedMB = (usage.bytesUsed / (1024 * 1024)).toFixed(2);
    if (usage.bytesQuota === null || usage.bytesQuota === undefined) {
      return `${usedMB} MB used`;
    }
    const quotaMB = (usage.bytesQuota / (1024 * 1024)).toFixed(0);
    return `${usedMB} MB / ${quotaMB} MB`;
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /**
   * Get formatted storage usage string.
   * Returns e.g. "2.50 MB used" (no denominator when storage is unlimited).
   * @returns {Promise<string>}
   */
  async getFormattedUsage() {
    try {
      const usage = await this.storage.getStorageUsage();
      return this._formatUsage(usage);
    } catch (error) {
      return 'Unknown';
    }
  }

  /**
   * Read the user-configured storage-warning threshold.
   * @returns {Promise<number>} Threshold in megabytes (defaults to
   *   {@link STORAGE_WARN_THRESHOLD_DEFAULT_MB} when no value is stored).
   */
  async getWarnThresholdMB() {
    const stored = await this.storage.get([STORAGE_WARN_THRESHOLD_KEY]);
    return stored[STORAGE_WARN_THRESHOLD_KEY] ?? STORAGE_WARN_THRESHOLD_DEFAULT_MB;
  }

  /**
   * Persist the storage-warning threshold.
   * @param {number} mb - Threshold in megabytes (must be a positive integer).
   * @returns {Promise<void>}
   */
  async setWarnThresholdMB(mb) {
    await this.storage.set({ [STORAGE_WARN_THRESHOLD_KEY]: mb });
  }

  /**
   * Check whether the data currently stored meets or exceeds the user's
   * configured warning threshold.  This is purely advisory — storage is not capped.
   * @returns {Promise<boolean>}
   */
  async isApproachingQuota() {
    try {
      const [usage, thresholdMB] = await Promise.all([
        this.storage.getStorageUsage(),
        this.getWarnThresholdMB(),
      ]);
      return usage.bytesUsed >= thresholdMB * 1024 * 1024;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get storage statistics — batches all reads into two parallel calls.
   * @param {{ topicCount: number, chatCount: number }|null} [counts=null]
   *   Optional in-memory counts forwarded to `getStorageUsage()`.
   *   When supplied the content reads inside `getStorageUsage` are skipped.
   * @returns {Promise<Object|null>}
   */
  async getStatistics(counts = null) {
    try {
      const [usage, thresholdMB] = await Promise.all([
        this.storage.getStorageUsage(counts),
        this.getWarnThresholdMB(),
      ]);
      return {
        ...usage,
        formattedUsage:     this._formatUsage(usage),
        isApproachingQuota: usage.bytesUsed >= thresholdMB * 1024 * 1024,
      };
    } catch (error) {
      return null;
    }
  }
}
