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

  it('should return true when exactly at quota threshold', async () => {
    // percentUsed == threshold should be considered "approaching"
    const fixedStorage = {
      getStorageUsage: () => Promise.resolve({
        bytesUsed: 8 * 1024 * 1024,   // 8 MB
        bytesQuota: 10 * 1024 * 1024, // 10 MB  → 80 %
        percentUsed: 80
      })
    };
    const tracker2 = new StorageUsageTracker(fixedStorage);
    const approaching = await tracker2.isApproachingQuota(80);
    expect(approaching).toBe(true);
  });

  it('should return false when just below quota threshold', async () => {
    const fixedStorage = {
      getStorageUsage: () => Promise.resolve({
        bytesUsed: 7.9 * 1024 * 1024,
        bytesQuota: 10 * 1024 * 1024,
        percentUsed: 79
      })
    };
    const tracker2 = new StorageUsageTracker(fixedStorage);
    const approaching = await tracker2.isApproachingQuota(80);
    expect(approaching).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ChromeStorageAdapter – deleteTopic (entirely untested previously)
// ---------------------------------------------------------------------------

describe('ChromeStorageAdapter – deleteTopic', () => {
  let storage;

  beforeEach(() => {
    storage = new ChromeStorageAdapter();
    clearStorageMock();
  });

  afterEach(() => {
    clearStorageMock();
  });

  it('should return false when topicId does not exist', async () => {
    const tree = { topics: {}, rootTopicIds: [], version: 1 };
    setStorageMockData({ topicTree: tree });

    const result = await storage.deleteTopic('nonexistent');

    expect(result).toBe(false);
  });

  it('should delete a root-level topic (deleteChats=false)', async () => {
    const tree = {
      topics: {
        'topic-root': {
          id: 'topic-root', name: 'Root', parentId: null,
          children: [], chatIds: ['c1'], createdAt: 0, updatedAt: 0,
          firstChatDate: null, lastChatDate: null
        }
      },
      rootTopicIds: ['topic-root'],
      version: 1
    };
    setStorageMockData({ topicTree: tree });

    const result = await storage.deleteTopic('topic-root', false);

    expect(result).toBe(true);

    // Verify saveTopicTree was called and the topic is removed
    const savedTree = global.chrome.storage.local.set.mock.calls
      .flatMap(c => Object.values(c[0]))
      .find(v => v && v.topics !== undefined);

    expect(savedTree.topics['topic-root']).toBeUndefined();
    // Root-level: topic removed from rootTopicIds
    expect(savedTree.rootTopicIds).not.toContain('topic-root');
  });

  it('should not delete chats when deleteChats=false', async () => {
    const tree = {
      topics: {
        't1': { id: 't1', name: 'T1', parentId: null, children: [], chatIds: ['c1'],
                createdAt: 0, updatedAt: 0, firstChatDate: null, lastChatDate: null }
      },
      rootTopicIds: ['t1'],
      version: 1
    };
    const chats = { 'c1': { id: 'c1', topicId: 't1', title: 'Chat 1' } };
    setStorageMockData({ topicTree: tree, chats });

    await storage.deleteTopic('t1', false);

    // chrome.storage.local.set should NOT have been called with a chats object
    // that has had c1 removed (deleteChats=false means chats untouched for the bulk-delete path)
    const chatSetCalls = global.chrome.storage.local.set.mock.calls
      .filter(call => call[0] && call[0].chats !== undefined);

    // No chats-clearing call should have happened (only tree saved, not chats)
    expect(chatSetCalls.length).toBe(0);
  });

  it('should delete associated chats when deleteChats=true', async () => {
    const tree = {
      topics: {
        't1': { id: 't1', name: 'T1', parentId: null, children: [], chatIds: ['c1', 'c2'],
                createdAt: 0, updatedAt: 0, firstChatDate: null, lastChatDate: null }
      },
      rootTopicIds: ['t1'],
      version: 1
    };
    const chats = {
      'c1': { id: 'c1', topicId: 't1', title: 'Chat 1' },
      'c2': { id: 'c2', topicId: 't1', title: 'Chat 2' },
      'c3': { id: 'c3', topicId: 'other', title: 'Other chat' }
    };
    setStorageMockData({ topicTree: tree, chats });

    const result = await storage.deleteTopic('t1', true);

    expect(result).toBe(true);

    // Find the chats set call
    const chatSetCall = global.chrome.storage.local.set.mock.calls
      .find(call => call[0] && call[0].chats !== undefined);

    expect(chatSetCall).toBeTruthy();
    const savedChats = chatSetCall[0].chats;

    // Chats belonging to 't1' should be gone
    expect(savedChats['c1']).toBeUndefined();
    expect(savedChats['c2']).toBeUndefined();
    // Chats belonging to another topic should remain
    expect(savedChats['c3']).toBeDefined();
  });

  it('should remove topic from root when no chats to delete', async () => {
    const tree = {
      topics: {
        'r1': { id: 'r1', name: 'Root', parentId: null, children: [], chatIds: [],
                createdAt: 0, updatedAt: 0, firstChatDate: null, lastChatDate: null }
      },
      rootTopicIds: ['r1', 'other-root'],
      version: 1
    };
    setStorageMockData({ topicTree: tree });

    await storage.deleteTopic('r1');

    const savedTree = global.chrome.storage.local.set.mock.calls
      .flatMap(c => Object.values(c[0]))
      .find(v => v && v.topics !== undefined);

    expect(savedTree.rootTopicIds).toEqual(['other-root']);
    expect(savedTree.topics['r1']).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// ChromeStorageAdapter – error propagation paths
// ---------------------------------------------------------------------------

describe('ChromeStorageAdapter – error propagation', () => {
  let storage;

  beforeEach(() => {
    storage = new ChromeStorageAdapter();
  });

  it('should throw wrapped error when loadTopicTree fails', async () => {
    global.chrome.storage.local.get.mockImplementation((keys, callback) => {
      throw new Error('storage gone');
    });

    await expect(storage.loadTopicTree()).rejects.toThrow('Failed to load topic tree');
  });

  it('should throw wrapped error when saveTopicTree fails', async () => {
    global.chrome.storage.local.set.mockImplementation((items, callback) => {
      throw new Error('quota exceeded');
    });

    await expect(storage.saveTopicTree({ topics: {}, rootTopicIds: [], version: 1 }))
      .rejects.toThrow('Failed to save topic tree');
  });

  it('should throw wrapped error when saveChat fails on set', async () => {
    clearStorageMock();
    global.chrome.storage.local.set.mockImplementation((items, callback) => {
      throw new Error('write error');
    });

    await expect(storage.saveChat('topic1', {
      title: 'T', content: 'C', url: 'https://chatgpt.com', source: 'chatgpt'
    })).rejects.toThrow('Failed to save chat');
  });

  it('should throw wrapped error when getStorageUsage fails', async () => {
    global.chrome.storage.local.getBytesInUse.mockImplementation(() => {
      throw new Error('Permission denied');
    });

    await expect(storage.getStorageUsage()).rejects.toThrow('Failed to get storage usage');
  });

  it('should throw wrapped error when clearAll fails', async () => {
    global.chrome.storage.local.clear.mockImplementation(() => {
      throw new Error('Permission denied');
    });

    await expect(storage.clearAll()).rejects.toThrow('Failed to clear storage');
  });

  it('should handle _updateMetadata error gracefully (no rethrow)', async () => {
    // _updateMetadata catches its own error and logs it without rethrowing
    global.chrome.storage.local.set.mockImplementation(() => {
      throw new Error('metadata write failed');
    });
    // Should NOT throw
    await expect(storage._updateMetadata()).resolves.toBeUndefined();
  });
});
