/**
 * Storage Service Tests
 * Stage 2: Storage Abstraction Layer
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { 
  IStorageService, 
  ChromeStorageAdapter, 
  StorageService, 
  StorageUsageTracker 
} from '../src/lib/storage.js';
import { setStorageMockData, clearStorageMock } from './setup.js';

describe('IStorageService Interface', () => {
  it('should throw errors for unimplemented methods', async () => {
    const service = new IStorageService();
    
    await expect(service.saveTopicTree({})).rejects.toThrow('Method not implemented');
    await expect(service.loadTopicTree()).rejects.toThrow('Method not implemented');
    await expect(service.saveChat('topic1', {})).rejects.toThrow('Method not implemented');
    await expect(service.loadChat('chat1')).rejects.toThrow('Method not implemented');
    await expect(service.searchChats('query')).rejects.toThrow('Method not implemented');
    await expect(service.deleteChat('chat1')).rejects.toThrow('Method not implemented');
    await expect(service.deleteTopic('topic1')).rejects.toThrow('Method not implemented');
    await expect(service.getStorageUsage()).rejects.toThrow('Method not implemented');
    await expect(service.clearAll()).rejects.toThrow('Method not implemented');
  });
});

describe('ChromeStorageAdapter', () => {
  let storage;

  beforeEach(() => {
    storage = new ChromeStorageAdapter();
    clearStorageMock();
  });

  afterEach(() => {
    clearStorageMock();
  });

  describe('Topic Tree Operations', () => {
    it('should save and load an empty topic tree', async () => {
      const emptyTree = {
        topics: {},
        rootTopicIds: [],
        version: 1
      };

      await storage.saveTopicTree(emptyTree);
      const loaded = await storage.loadTopicTree();
      
      expect(loaded).toEqual(emptyTree);
    });

    it('should save and load a topic tree with topics', async () => {
      const tree = {
        topics: {
          'topic1': {
            id: 'topic1',
            name: 'Programming',
            parentId: null,
            children: ['topic2'],
            chatIds: [],
            createdAt: Date.now(),
            updatedAt: Date.now()
          },
          'topic2': {
            id: 'topic2',
            name: 'JavaScript',
            parentId: 'topic1',
            children: [],
            chatIds: [],
            createdAt: Date.now(),
            updatedAt: Date.now()
          }
        },
        rootTopicIds: ['topic1'],
        version: 1
      };

      await storage.saveTopicTree(tree);
      
      setStorageMockData({ topicTree: tree });
      const loaded = await storage.loadTopicTree();
      
      expect(loaded.topics).toBeDefined();
      expect(loaded.rootTopicIds).toEqual(['topic1']);
      expect(loaded.topics['topic1'].name).toBe('Programming');
      expect(loaded.topics['topic2'].name).toBe('JavaScript');
    });

    it('should return default tree structure if none exists', async () => {
      const loaded = await storage.loadTopicTree();
      
      expect(loaded).toEqual({
        topics: {},
        rootTopicIds: [],
        version: 1
      });
    });
  });

  describe('Chat Operations', () => {
    it('should save a chat with valid data', async () => {
      const chatData = {
        title: 'Test Chat',
        content: 'This is a test chat conversation',
        url: 'https://chat.openai.com/c/123',
        source: 'chatgpt',
        timestamp: Date.now()
      };

      const chatId = await storage.saveChat('topic1', chatData);
      
      expect(chatId).toBeDefined();
      expect(typeof chatId).toBe('string');
      expect(chatId).toMatch(/^chat_/);
    });

    it('should load a saved chat', async () => {
      const chatData = {
        title: 'Test Chat',
        content: 'This is a test chat conversation',
        url: 'https://chat.openai.com/c/123',
        source: 'chatgpt',
        timestamp: Date.now()
      };

      const chatId = await storage.saveChat('topic1', chatData);
      
      // Mock the storage with the chat
      setStorageMockData({
        chats: {
          [chatId]: {
            ...chatData,
            id: chatId,
            topicId: 'topic1',
            savedAt: Date.now()
          }
        }
      });
      
      const loaded = await storage.loadChat(chatId);
      
      expect(loaded).toBeDefined();
      expect(loaded.title).toBe('Test Chat');
      expect(loaded.source).toBe('chatgpt');
      expect(loaded.topicId).toBe('topic1');
    });

    it('should return null for non-existent chat', async () => {
      const loaded = await storage.loadChat('nonexistent');
      expect(loaded).toBeNull();
    });

    it('should validate chat data on save', async () => {
      // Missing title
      await expect(
        storage.saveChat('topic1', { content: 'test', source: 'chatgpt' })
      ).rejects.toThrow('Chat must have a title');

      // Missing content
      await expect(
        storage.saveChat('topic1', { title: 'test', source: 'chatgpt' })
      ).rejects.toThrow('Chat must have content');

      // Invalid source
      await expect(
        storage.saveChat('topic1', { 
          title: 'test', 
          content: 'test', 
          source: 'invalid' 
        })
      ).rejects.toThrow('Chat must have a valid source');
    });

    it('should delete a chat', async () => {
      const chatId = 'chat_123';
      
      setStorageMockData({
        chats: {
          [chatId]: {
            id: chatId,
            title: 'Test',
            content: 'Content',
            source: 'chatgpt',
            topicId: 'topic1'
          }
        }
      });

      const result = await storage.deleteChat(chatId);
      expect(result).toBe(true);
    });

    it('should return false when deleting non-existent chat', async () => {
      const result = await storage.deleteChat('nonexistent');
      expect(result).toBe(false);
    });
  });

  describe('Search Operations', () => {
    beforeEach(() => {
      setStorageMockData({
        chats: {
          'chat1': {
            id: 'chat1',
            title: 'JavaScript Tutorial',
            content: 'Learn JavaScript basics including variables and functions',
            source: 'chatgpt',
            topicId: 'topic1',
            timestamp: 1000000
          },
          'chat2': {
            id: 'chat2',
            title: 'Python Guide',
            content: 'Python programming with examples',
            source: 'claude',
            topicId: 'topic2',
            timestamp: 2000000
          },
          'chat3': {
            id: 'chat3',
            title: 'Web Development',
            content: 'JavaScript frameworks and libraries for web development',
            source: 'gemini',
            topicId: 'topic1',
            timestamp: 3000000
          }
        }
      });
    });

    it('should search chats by title', async () => {
      const results = await storage.searchChats('javascript');
      
      expect(results.length).toBeGreaterThan(0);
      expect(results.some(chat => chat.title.includes('JavaScript'))).toBe(true);
    });

    it('should search chats by content', async () => {
      const results = await storage.searchChats('python');
      
      expect(results.length).toBeGreaterThan(0);
      expect(results.some(chat => chat.content.includes('Python'))).toBe(true);
    });

    it('should return empty array for no matches', async () => {
      const results = await storage.searchChats('xyz123nonexistent');
      expect(results).toEqual([]);
    });

    it('should be case-insensitive', async () => {
      const results1 = await storage.searchChats('JAVASCRIPT');
      const results2 = await storage.searchChats('javascript');
      
      expect(results1.length).toBe(results2.length);
    });

    it('should prioritize title matches over content matches', async () => {
      const results = await storage.searchChats('javascript');
      
      // First result should have JavaScript in title
      if (results.length > 0) {
        const firstResult = results[0];
        expect(firstResult.title.toLowerCase()).toContain('javascript');
      }
    });
  });

  describe('Storage Usage', () => {
    it('should get storage usage statistics', async () => {
      setStorageMockData({
        topicTree: {
          topics: {
            'topic1': { id: 'topic1', name: 'Test' }
          },
          rootTopicIds: ['topic1'],
          version: 1
        },
        chats: {
          'chat1': { id: 'chat1', title: 'Test Chat' }
        }
      });

      const usage = await storage.getStorageUsage();
      
      expect(usage).toBeDefined();
      expect(usage.bytesUsed).toBeDefined();
      expect(usage.bytesQuota).toBeDefined();
      expect(usage.percentUsed).toBeDefined();
      expect(usage.topicCount).toBeGreaterThanOrEqual(0);
      expect(usage.chatCount).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Clear Operations', () => {
    it('should clear all storage', async () => {
      await storage.clearAll();
      
      const tree = await storage.loadTopicTree();
      expect(tree.topics).toEqual({});
      expect(tree.rootTopicIds).toEqual([]);
    });
  });

  describe('ID Generation', () => {
    it('should generate unique IDs', () => {
      const id1 = storage._generateId('test');
      const id2 = storage._generateId('test');
      
      expect(id1).not.toBe(id2);
      expect(id1).toMatch(/^test_/);
      expect(id2).toMatch(/^test_/);
    });
  });
});

describe('StorageService Factory', () => {
  afterEach(() => {
    StorageService.resetInstance();
  });

  it('should create Chrome storage adapter by default', () => {
    const service = StorageService.getInstance();
    expect(service).toBeInstanceOf(ChromeStorageAdapter);
  });

  it('should create Chrome storage adapter explicitly', () => {
    const service = StorageService.getInstance('chrome');
    expect(service).toBeInstanceOf(ChromeStorageAdapter);
  });

  it('should throw error for unknown storage type', () => {
    expect(() => {
      StorageService.getInstance('unknown');
    }).toThrow('Unknown storage type');
  });

  it('should throw error for IndexedDB (not implemented yet)', () => {
    expect(() => {
      StorageService.getInstance('indexeddb');
    }).toThrow('IndexedDB adapter not yet implemented');
  });

  it('should return same instance (singleton)', () => {
    const service1 = StorageService.getInstance();
    const service2 = StorageService.getInstance();
    
    expect(service1).toBe(service2);
  });

  it('should reset instance', () => {
    const service1 = StorageService.getInstance();
    StorageService.resetInstance();
    const service2 = StorageService.getInstance();
    
    expect(service1).not.toBe(service2);
  });
});

describe('StorageUsageTracker', () => {
  let storage;
  let tracker;

  beforeEach(() => {
    storage = new ChromeStorageAdapter();
    tracker = new StorageUsageTracker(storage);
    
    setStorageMockData({
      topicTree: {
        topics: { 'topic1': { id: 'topic1', name: 'Test' } },
        rootTopicIds: ['topic1'],
        version: 1
      },
      chats: {}
    });
  });

  it('should get formatted usage string', async () => {
    const formatted = await tracker.getFormattedUsage();
    
    expect(formatted).toBeDefined();
    expect(typeof formatted).toBe('string');
    expect(formatted).toMatch(/MB/);
  });

  it('should check if approaching quota', async () => {
    const approaching = await tracker.isApproachingQuota(80);
    
    expect(typeof approaching).toBe('boolean');
  });

  it('should get statistics', async () => {
    const stats = await tracker.getStatistics();
    
    expect(stats).toBeDefined();
    expect(stats.bytesUsed).toBeDefined();
    expect(stats.formattedUsage).toBeDefined();
    expect(stats.isApproachingQuota).toBeDefined();
  });

  it('should handle errors gracefully', async () => {
    // Create tracker with broken storage
    const brokenStorage = {
      getStorageUsage: () => Promise.reject(new Error('Test error'))
    };
    const brokenTracker = new StorageUsageTracker(brokenStorage);
    
    const formatted = await brokenTracker.getFormattedUsage();
    expect(formatted).toBe('Unknown');
    
    const approaching = await brokenTracker.isApproachingQuota();
    expect(approaching).toBe(false);
    
    const stats = await brokenTracker.getStatistics();
    expect(stats).toBeNull();
  });
});
