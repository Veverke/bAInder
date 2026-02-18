/**
 * bAInder Storage Service
 * Stage 2: Storage Abstraction Layer
 * 
 * Provides a flexible storage interface that can be swapped between
 * chrome.storage.local (MVP) and IndexedDB (future enhancement).
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
   * Save a chat entry to a specific topic
   * @param {string} topicId - The topic ID to save the chat under
   * @param {Object} chatData - The chat entry data
   * @returns {Promise<string>} The chat ID
   */
  async saveChat(topicId, chatData) {
    throw new Error('Method not implemented');
  }

  /**
   * Load a specific chat by ID
   * @param {string} chatId - The chat ID to load
   * @returns {Promise<Object|null>} The chat entry or null if not found
   */
  async loadChat(chatId) {
    throw new Error('Method not implemented');
  }

  /**
   * Search chats by query string
   * @param {string} query - The search query
   * @returns {Promise<Array>} Array of matching chat entries
   */
  async searchChats(query) {
    throw new Error('Method not implemented');
  }

  /**
   * Delete a chat entry
   * @param {string} chatId - The chat ID to delete
   * @returns {Promise<boolean>} Success status
   */
  async deleteChat(chatId) {
    throw new Error('Method not implemented');
  }

  /**
   * Delete a topic and optionally its chats
   * @param {string} topicId - The topic ID to delete
   * @param {boolean} deleteChats - Whether to delete associated chats
   * @returns {Promise<boolean>} Success status
   */
  async deleteTopic(topicId, deleteChats = false) {
    throw new Error('Method not implemented');
  }

  /**
   * Get storage usage statistics
   * @returns {Promise<Object>} Object with bytes used and quota info
   */
  async getStorageUsage() {
    throw new Error('Method not implemented');
  }

  /**
   * Clear all data (for testing/reset)
   * @returns {Promise<void>}
   */
  async clearAll() {
    throw new Error('Method not implemented');
  }
}

/**
 * Chrome Storage Adapter
 * Implementation using chrome.storage.local API
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
      await chrome.storage.local.set({
        [this.KEYS.TOPIC_TREE]: tree
      });
      await this._updateMetadata();
      return true;
    } catch (error) {
      console.error('Error saving topic tree:', error);
      throw new Error(`Failed to save topic tree: ${error.message}`);
    }
  }

  /**
   * Load the topic tree structure
   */
  async loadTopicTree() {
    try {
      const result = await chrome.storage.local.get(this.KEYS.TOPIC_TREE);
      return result[this.KEYS.TOPIC_TREE] || {
        topics: {},
        rootTopicIds: [],
        version: 1
      };
    } catch (error) {
      console.error('Error loading topic tree:', error);
      throw new Error(`Failed to load topic tree: ${error.message}`);
    }
  }

  /**
   * Save a chat entry
   */
  async saveChat(topicId, chatData) {
    try {
      // Generate ID if not provided
      const chatId = chatData.id || this._generateId('chat');
      
      // Validate required fields
      this._validateChatData(chatData);
      
      // Load existing chats
      const result = await chrome.storage.local.get(this.KEYS.CHATS);
      const chats = result[this.KEYS.CHATS] || {};
      
      // Add topic ID and ensure proper structure
      const chat = {
        ...chatData,
        id: chatId,
        topicId: topicId,
        savedAt: Date.now()
      };
      
      // Save chat
      chats[chatId] = chat;
      await chrome.storage.local.set({
        [this.KEYS.CHATS]: chats
      });
      
      await this._updateMetadata();
      return chatId;
    } catch (error) {
      console.error('Error saving chat:', error);
      throw new Error(`Failed to save chat: ${error.message}`);
    }
  }

  /**
   * Load a specific chat
   */
  async loadChat(chatId) {
    try {
      const result = await chrome.storage.local.get(this.KEYS.CHATS);
      const chats = result[this.KEYS.CHATS] || {};
      return chats[chatId] || null;
    } catch (error) {
      console.error('Error loading chat:', error);
      throw new Error(`Failed to load chat: ${error.message}`);
    }
  }

  /**
   * Search chats by query
   */
  async searchChats(query) {
    try {
      const result = await chrome.storage.local.get(this.KEYS.CHATS);
      const chats = result[this.KEYS.CHATS] || {};
      
      const lowerQuery = query.toLowerCase();
      const matches = [];
      
      for (const chatId in chats) {
        const chat = chats[chatId];
        const searchText = `${chat.title} ${chat.content}`.toLowerCase();
        
        if (searchText.includes(lowerQuery)) {
          matches.push(chat);
        }
      }
      
      // Sort by relevance (title matches first, then by timestamp)
      return matches.sort((a, b) => {
        const aTitle = a.title.toLowerCase().includes(lowerQuery);
        const bTitle = b.title.toLowerCase().includes(lowerQuery);
        
        if (aTitle && !bTitle) return -1;
        if (!aTitle && bTitle) return 1;
        return (b.timestamp || 0) - (a.timestamp || 0);
      });
    } catch (error) {
      console.error('Error searching chats:', error);
      throw new Error(`Failed to search chats: ${error.message}`);
    }
  }

  /**
   * Delete a chat entry
   */
  async deleteChat(chatId) {
    try {
      const result = await chrome.storage.local.get(this.KEYS.CHATS);
      const chats = result[this.KEYS.CHATS] || {};
      
      if (!chats[chatId]) {
        return false;
      }
      
      delete chats[chatId];
      await chrome.storage.local.set({
        [this.KEYS.CHATS]: chats
      });
      
      await this._updateMetadata();
      return true;
    } catch (error) {
      console.error('Error deleting chat:', error);
      throw new Error(`Failed to delete chat: ${error.message}`);
    }
  }

  /**
   * Delete a topic and optionally its chats
   */
  async deleteTopic(topicId, deleteChats = false) {
    try {
      // Load topic tree
      const tree = await this.loadTopicTree();
      
      if (!tree.topics[topicId]) {
        return false;
      }
      
      // Get chat IDs if we need to delete them
      if (deleteChats) {
        const result = await chrome.storage.local.get(this.KEYS.CHATS);
        const chats = result[this.KEYS.CHATS] || {};
        
        // Delete all chats in this topic
        for (const chatId in chats) {
          if (chats[chatId].topicId === topicId) {
            delete chats[chatId];
          }
        }
        
        await chrome.storage.local.set({
          [this.KEYS.CHATS]: chats
        });
      }
      
      // Remove topic from tree
      delete tree.topics[topicId];
      
      // Remove from parent's children or root
      const topic = tree.topics[topicId];
      if (topic && topic.parentId) {
        const parent = tree.topics[topic.parentId];
        if (parent) {
          parent.children = parent.children.filter(id => id !== topicId);
        }
      } else {
        tree.rootTopicIds = tree.rootTopicIds.filter(id => id !== topicId);
      }
      
      await this.saveTopicTree(tree);
      return true;
    } catch (error) {
      console.error('Error deleting topic:', error);
      throw new Error(`Failed to delete topic: ${error.message}`);
    }
  }

  /**
   * Get storage usage statistics
   */
  async getStorageUsage() {
    try {
      const bytesInUse = await chrome.storage.local.getBytesInUse();
      const quota = chrome.storage.local.QUOTA_BYTES || 10485760; // 10MB default
      
      // Get counts
      const tree = await this.loadTopicTree();
      const result = await chrome.storage.local.get(this.KEYS.CHATS);
      const chats = result[this.KEYS.CHATS] || {};
      
      return {
        bytesUsed: bytesInUse,
        bytesQuota: quota,
        percentUsed: (bytesInUse / quota) * 100,
        topicCount: Object.keys(tree.topics || {}).length,
        chatCount: Object.keys(chats).length
      };
    } catch (error) {
      console.error('Error getting storage usage:', error);
      throw new Error(`Failed to get storage usage: ${error.message}`);
    }
  }

  /**
   * Clear all data
   */
  async clearAll() {
    try {
      await chrome.storage.local.clear();
      return true;
    } catch (error) {
      console.error('Error clearing storage:', error);
      throw new Error(`Failed to clear storage: ${error.message}`);
    }
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
      await chrome.storage.local.set({
        [this.KEYS.METADATA]: metadata
      });
    } catch (error) {
      console.error('Error updating metadata:', error);
    }
  }

  /**
   * Private: Generate a unique ID
   */
  _generateId(prefix = 'item') {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Private: Validate chat data structure
   */
  _validateChatData(chatData) {
    if (!chatData.title || typeof chatData.title !== 'string') {
      throw new Error('Chat must have a title (string)');
    }
    if (!chatData.content || typeof chatData.content !== 'string') {
      throw new Error('Chat must have content (string)');
    }
    if (!chatData.source || !['chatgpt', 'claude', 'gemini'].includes(chatData.source)) {
      throw new Error('Chat must have a valid source (chatgpt, claude, or gemini)');
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

  /**
   * Get formatted storage usage string
   * @returns {Promise<string>} Formatted usage string (e.g., "2.5 MB / 10 MB")
   */
  async getFormattedUsage() {
    try {
      const usage = await this.storage.getStorageUsage();
      const usedMB = (usage.bytesUsed / (1024 * 1024)).toFixed(2);
      const quotaMB = (usage.bytesQuota / (1024 * 1024)).toFixed(0);
      return `${usedMB} MB / ${quotaMB} MB`;
    } catch (error) {
      return 'Unknown';
    }
  }

  /**
   * Check if storage is approaching quota
   * @param {number} threshold - Warning threshold percentage (default 80)
   * @returns {Promise<boolean>} True if approaching quota
   */
  async isApproachingQuota(threshold = 80) {
    try {
      const usage = await this.storage.getStorageUsage();
      return usage.percentUsed >= threshold;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get storage statistics
   * @returns {Promise<Object>} Detailed statistics object
   */
  async getStatistics() {
    try {
      const usage = await this.storage.getStorageUsage();
      return {
        ...usage,
        formattedUsage: await this.getFormattedUsage(),
        isApproachingQuota: await this.isApproachingQuota()
      };
    } catch (error) {
      return null;
    }
  }
}
