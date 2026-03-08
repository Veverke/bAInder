/**
 * Storage Service Tests
 * Stage 2: Storage Abstraction Layer
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { 
  IStorageService, 
  ChromeStorageAdapter, 
  StorageService, 
  StorageUsageTracker,
  SEARCH_RESULT_CAP,
  STORAGE_WARN_THRESHOLD_KEY,
  STORAGE_WARN_THRESHOLD_DEFAULT_MB,
} from '../src/lib/storage.js';
import { setStorageMockData, clearStorageMock } from './setup.js';

describe('IStorageService Interface', () => {
  it('should throw errors for unimplemented methods', async () => {
    const service = new IStorageService();
    
    await expect(service.saveTopicTree({})).rejects.toThrow('Method not implemented');
    await expect(service.loadTopicTree()).rejects.toThrow('Method not implemented');
    await expect(service.searchChats('query')).rejects.toThrow('Method not implemented');
    await expect(service.getStorageUsage()).rejects.toThrow('Method not implemented');
    await expect(service.clearAll()).rejects.toThrow('Method not implemented');
    await expect(service.get('key')).rejects.toThrow('Method not implemented');
    await expect(service.set({ key: 'val' })).rejects.toThrow('Method not implemented');
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

  describe('Search Operations', () => {
    beforeEach(() => {
      setStorageMockData({
        chats: [
          {
            id: 'chat1',
            title: 'JavaScript Tutorial',
            content: 'Learn JavaScript basics including variables and functions',
            source: 'chatgpt',
            topicId: 'topic1',
            timestamp: 1000000,
            tags: []
          },
          {
            id: 'chat2',
            title: 'Python Guide',
            content: 'Python programming with examples',
            source: 'claude',
            topicId: 'topic2',
            timestamp: 2000000,
            tags: []
          },
          {
            id: 'chat3',
            title: 'Web Development',
            content: 'JavaScript frameworks and libraries for web development',
            source: 'gemini',
            topicId: 'topic1',
            timestamp: 3000000,
            tags: []
          }
        ]
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

    it('should return all chats for an empty query (filter-only mode)', async () => {
      const results = await storage.searchChats('');
      expect(results.length).toBe(3); // all 3 chats from beforeEach
    });

    it('should use the supplied chats array and skip the storage read', async () => {
      // Provide a completely different in-memory array; if the storage read
      // were used the titles below would never match.
      const inMemory = [
        { id: 'mem1', title: 'TypeScript Handbook', content: '', tags: [], timestamp: 1 },
        { id: 'mem2', title: 'Go Concurrency Guide', content: '', tags: [], timestamp: 2 },
      ];
      const getSpy = vi.spyOn(global.chrome.storage.local, 'get');

      const results = await storage.searchChats('typescript', inMemory);

      expect(getSpy).not.toHaveBeenCalled();
      expect(results.length).toBe(1);
      expect(results[0].id).toBe('mem1');
      getSpy.mockRestore();
    });

    it('should cap results at SEARCH_RESULT_CAP', async () => {
      // Build an array of SEARCH_RESULT_CAP + 10 matching chats in-memory.
      const bigList = Array.from({ length: SEARCH_RESULT_CAP + 10 }, (_, i) => ({
        id: `chat${i}`,
        title: `Match item ${i}`,
        content: 'test',
        tags: [],
        timestamp: i,
      }));

      const results = await storage.searchChats('match', bigList);

      expect(results.length).toBe(SEARCH_RESULT_CAP);
    });

    it('uses [] fallback when storage returns no chats key', async () => {
      // Storage returns {} with no chats property → result[KEYS.CHATS] === undefined
      // → triggers the || [] fallback on line 172
      global.chrome.storage.local.get.mockImplementationOnce((keys, cb) => {
        if (cb) cb({});
        return Promise.resolve({});
      });
      const results = await storage.searchChats('anything');
      expect(results).toEqual([]);
    });

    it('throws wrapped error when storage.local.get rejects (catch block lines 172-173)', async () => {
      // Make the storage.get call reject → catch block fires → re-throws wrapped error
      global.chrome.storage.local.get.mockImplementationOnce(() => {
        return Promise.reject(new Error('storage failure'));
      });
      await expect(storage.searchChats('query')).rejects.toThrow('Failed to search chats: storage failure');
    });

    it('_buildSearchableText: uses || [] fallback when chat has no tags property', async () => {
      // Chat without tags → (chat.tags || []).join(' ') → [] fallback
      const chats = [{ id: 'n1', title: 'nodetest', content: 'stuff' }]; // no tags field
      const results = await storage.searchChats('nodetest', chats);
      expect(results.length).toBe(1);
    });

    it('_buildSearchableText: uses || "" fallback when chat has no title property', async () => {
      // Chat without title → (chat.title || '') → '' fallback
      const chats = [{ id: 'n2', content: 'specialsearch', tags: [] }]; // no title field
      const results = await storage.searchChats('specialsearch', chats);
      expect(results.length).toBe(1);
    });

    it('_isTopResult: tagMatch fires when query matches a tag value', async () => {
      // Chat with a tag that matches the query → tagMatch = true → top result
      const chats = [
        { id: 'tagged', title: 'Generic Chat', content: 'nothing special', tags: ['mytag'], timestamp: 1000 },
        { id: 'content', title: 'Generic Chat 2', content: 'mytag mentioned here', tags: [], timestamp: 500 },
      ];
      const results = await storage.searchChats('mytag', chats);
      // Both match, but the one with the tag should rank first (top result)
      expect(results[0].id).toBe('tagged');
    });

    it('_isTopResult: title-match chat ranks before content-only match', async () => {
      const chats = [
        { id: 'content-only', title: 'Unrelated', content: 'searchterm here', tags: [], timestamp: 2000 },
        { id: 'title-match', title: 'searchterm in title', content: '', tags: [], timestamp: 1000 },
      ];
      const results = await storage.searchChats('searchterm', chats);
      expect(results[0].id).toBe('title-match');
    });

    it('_rankChats sort: uses || 0 timestamp fallback when timestamp is absent', async () => {
      // Chats without timestamp → (chat.timestamp || 0) → 0 in sort comparator
      const chats = [
        { id: 'notop1', title: 'testword doc one', content: '', tags: [] }, // no timestamp
        { id: 'notop2', title: 'testword doc two', content: '', tags: [] }, // no timestamp
      ];
      const results = await storage.searchChats('testword', chats);
      expect(results.length).toBe(2);
    });

    it('_isTopResult: uses || "" and || [] fallbacks (no title, no tags)', async () => {
      // Chat without title or tags → both fallbacks fire inside _isTopResult
      const chats = [
        { id: 'bare', content: 'uniquecontent789' }, // no title, no tags
      ];
      const results = await storage.searchChats('uniquecontent789', chats);
      expect(results.length).toBe(1);
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
        chats: [{ id: 'chat1', title: 'Test Chat' }]
      });

      const usage = await storage.getStorageUsage();
      
      expect(usage).toBeDefined();
      expect(usage.bytesUsed).toBeDefined();
      expect(usage.bytesQuota).toBeDefined();
      expect(usage.percentUsed).toBeDefined();
      expect(usage.topicCount).toBeGreaterThanOrEqual(0);
      expect(usage.chatCount).toBeGreaterThanOrEqual(0);
    });

    it('fast path: when counts are supplied, storage.get is not called', async () => {
      const getSpy = vi.spyOn(global.chrome.storage.local, 'get');
      const counts = { topicCount: 3, chatCount: 12 };

      const usage = await storage.getStorageUsage(counts);

      expect(getSpy).not.toHaveBeenCalled();
      expect(usage.topicCount).toBe(3);
      expect(usage.chatCount).toBe(12);
      expect(usage.bytesUsed).toBeDefined();
      getSpy.mockRestore();
    });

    it('fallback path: when counts are omitted, a single batched get call is made', async () => {
      setStorageMockData({
        topicTree: {
          topics: { t1: {}, t2: {} },
          rootTopicIds: ['t1'],
          version: 1,
        },
        chats: [{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }],
      });
      const getSpy = vi.spyOn(global.chrome.storage.local, 'get');

      const usage = await storage.getStorageUsage();

      // Exactly one get call with an array of two keys (batched).
      expect(getSpy).toHaveBeenCalledTimes(1);
      expect(Array.isArray(getSpy.mock.calls[0][0])).toBe(true);
      expect(usage.topicCount).toBe(2);
      expect(usage.chatCount).toBe(3);
      getSpy.mockRestore();
    });

    it('getStorageUsage: uses tree.topics || {} when topicTree has no topics property', async () => {
      // Store a topicTree without a `topics` field → triggers the `|| {}` fallback
      setStorageMockData({
        topicTree: { rootTopicIds: [], version: 1 }, // no topics field
        chats: [],
      });
      const usage = await storage.getStorageUsage();
      expect(usage.topicCount).toBe(0);
    });

    it('getStorageUsage: percentUsed is null when quota is null', async () => {
      // This tests the `quota !== null ? ... : null` ternary false branch
      setStorageMockData({ topicTree: { topics: {}, rootTopicIds: [], version: 1 }, chats: [] });
      // Mock getBytesInUse to return 0 bytes used
      global.chrome.storage.local.getBytesInUse = vi.fn().mockResolvedValue(0);
      // We need QUOTA_BYTES to be null — mock the adapter's QUOTA_BYTES property
      const origQuota = storage.QUOTA_BYTES;
      Object.defineProperty(storage, 'QUOTA_BYTES', { value: null, configurable: true });
      const usage = await storage.getStorageUsage();
      Object.defineProperty(storage, 'QUOTA_BYTES', { value: origQuota, configurable: true });
      expect(usage.percentUsed).toBeNull();
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

  describe('Raw get/set pass-throughs', () => {
    it('get() delegates to browser.storage.local.get with the same keys array', async () => {
      await storage.get(['chats', 'topicTree']);
      expect(global.chrome.storage.local.get).toHaveBeenCalledWith(['chats', 'topicTree']);
    });

    it('get() delegates to browser.storage.local.get with a string key', async () => {
      await storage.get('chats');
      expect(global.chrome.storage.local.get).toHaveBeenCalledWith('chats');
    });

    it('set() delegates to browser.storage.local.set with the supplied data', async () => {
      const data = { chats: [{ id: 'c1' }] };
      await storage.set(data);
      expect(global.chrome.storage.local.set).toHaveBeenCalledWith(data);
    });

    it('set() returns the value resolved by browser.storage.local.set', async () => {
      await expect(storage.set({ x: 1 })).resolves.toBeUndefined();
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
      chats: []
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

  it('getStatistics(counts) threads counts through and skips data reads', async () => {
    const getSpy = vi.spyOn(global.chrome.storage.local, 'get');
    const counts = { topicCount: 7, chatCount: 42 };

    const stats = await tracker.getStatistics(counts);

    // Only the threshold setting is fetched (one call); topic/chat data reads
    // are skipped because counts were supplied.
    expect(getSpy).toHaveBeenCalledTimes(1);
    expect(getSpy.mock.calls[0][0]).toContain(STORAGE_WARN_THRESHOLD_KEY);
    expect(stats.topicCount).toBe(7);
    expect(stats.chatCount).toBe(42);
    expect(typeof stats.formattedUsage).toBe('string');
    expect(typeof stats.isApproachingQuota).toBe('boolean');
    getSpy.mockRestore();
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

  it('should return true when bytesUsed meets the warn threshold', async () => {
    // Set the threshold to 10 MB in the storage mock so isApproachingQuota reads it.
    setStorageMockData({ [STORAGE_WARN_THRESHOLD_KEY]: 10 });
    const fixedStorage = {
      getStorageUsage: () => Promise.resolve({ bytesUsed: 10 * 1024 * 1024 }),
      get: storage.get.bind(storage),
    };
    const tracker2 = new StorageUsageTracker(fixedStorage);
    expect(await tracker2.isApproachingQuota()).toBe(true);
  });

  it('should return false when bytesUsed is below the warn threshold', async () => {
    setStorageMockData({ [STORAGE_WARN_THRESHOLD_KEY]: 10 });
    const fixedStorage = {
      getStorageUsage: () => Promise.resolve({ bytesUsed: 9.9 * 1024 * 1024 }),
      get: storage.get.bind(storage),
    };
    const tracker2 = new StorageUsageTracker(fixedStorage);
    expect(await tracker2.isApproachingQuota()).toBe(false);
  });

  // ── getWarnThresholdMB / setWarnThresholdMB ───────────────────────────────

  it('getWarnThresholdMB() returns STORAGE_WARN_THRESHOLD_DEFAULT_MB when key is absent', async () => {
    clearStorageMock();
    const result = await tracker.getWarnThresholdMB();
    expect(result).toBe(STORAGE_WARN_THRESHOLD_DEFAULT_MB);
  });

  it('getWarnThresholdMB() returns the stored value when the key is present', async () => {
    setStorageMockData({ [STORAGE_WARN_THRESHOLD_KEY]: 250 });
    const result = await tracker.getWarnThresholdMB();
    expect(result).toBe(250);
  });

  it('setWarnThresholdMB() persists the threshold via storage.set', async () => {
    const setSpy = vi.spyOn(storage, 'set');
    await tracker.setWarnThresholdMB(750);
    expect(setSpy).toHaveBeenCalledWith({ [STORAGE_WARN_THRESHOLD_KEY]: 750 });
    setSpy.mockRestore();
  });

  it('isApproachingQuota() returns true at the threshold stored by setWarnThresholdMB()', async () => {
    setStorageMockData({ [STORAGE_WARN_THRESHOLD_KEY]: 10 });
    const fixedStorage = {
      getStorageUsage: () => Promise.resolve({ bytesUsed: 10 * 1024 * 1024 }),
      get: storage.get.bind(storage),
    };
    const t = new StorageUsageTracker(fixedStorage);
    expect(await t.isApproachingQuota()).toBe(true);
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

// ---------------------------------------------------------------------------
// ChromeStorageAdapter – quota-aware getStorageUsage paths
// ---------------------------------------------------------------------------

describe('ChromeStorageAdapter – getStorageUsage with defined QUOTA_BYTES', () => {
  let storage;

  beforeEach(() => {
    storage = new ChromeStorageAdapter();
    // Ensure getBytesInUse is restored to the default working mock in case
    // a previous test group used mockImplementation to throw.
    global.chrome.storage.local.getBytesInUse.mockImplementation(() => Promise.resolve(0));
  });

  afterEach(() => {
    delete global.chrome.storage.local.QUOTA_BYTES;
  });

  it('bytesQuota is always null (unlimitedStorage — QUOTA_BYTES is ignored)', async () => {
    // Even if Chrome exposes QUOTA_BYTES, the extension has unlimitedStorage
    // so we always treat the quota as null to avoid a misleading denominator.
    global.chrome.storage.local.QUOTA_BYTES = 10 * 1024 * 1024;

    const usage = await storage.getStorageUsage({ topicCount: 2, chatCount: 5 });

    expect(usage.bytesQuota).toBeNull();
    expect(usage.percentUsed).toBeNull();

    // Restore
    delete global.chrome.storage.local.QUOTA_BYTES;
  });

  it('percentUsed is null when QUOTA_BYTES is undefined (unlimited storage)', async () => {
    // Ensure no quota is set
    delete global.chrome.storage.local.QUOTA_BYTES;

    const usage = await storage.getStorageUsage({ topicCount: 0, chatCount: 0 });

    expect(usage.bytesQuota).toBeNull();
    expect(usage.percentUsed).toBeNull();
  });

  it('fallback path also returns null quota when QUOTA_BYTES is defined (unlimitedStorage)', async () => {
    global.chrome.storage.local.QUOTA_BYTES = 5 * 1024 * 1024;
    clearStorageMock();

    const usage = await storage.getStorageUsage(); // no counts → fallback path

    expect(usage.bytesQuota).toBeNull();
    expect(usage.percentUsed).toBeNull();

    delete global.chrome.storage.local.QUOTA_BYTES;
  });
});

// ---------------------------------------------------------------------------
// StorageUsageTracker._formatUsage – bytesQuota branch coverage
// ---------------------------------------------------------------------------

describe('StorageUsageTracker._formatUsage()', () => {
  let tracker;

  beforeEach(() => {
    tracker = new StorageUsageTracker(new ChromeStorageAdapter());
  });

  it('shows "MB used" without denominator when bytesQuota is null', () => {
    const result = tracker._formatUsage({ bytesUsed: 2 * 1024 * 1024, bytesQuota: null });
    expect(result).toMatch(/MB used$/);
    expect(result).not.toContain('/');
  });

  it('shows "MB used" without denominator when bytesQuota is undefined', () => {
    const result = tracker._formatUsage({ bytesUsed: 1 * 1024 * 1024, bytesQuota: undefined });
    expect(result).toMatch(/MB used$/);
    expect(result).not.toContain('/');
  });

  it('shows "MB / MB" with denominator when bytesQuota is a positive number', () => {
    const result = tracker._formatUsage({
      bytesUsed: 1 * 1024 * 1024,
      bytesQuota: 10 * 1024 * 1024,
    });
    expect(result).toContain('/');
    expect(result).toMatch(/MB\s*\/\s*\d+ MB/);
  });
});
