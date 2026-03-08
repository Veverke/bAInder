/**
 * Tests for src/sidepanel/services/chat-repository.js
 *
 * All tests use constructor-injected mock storage adapters — no browser
 * global or chrome.storage.local mock is required.  This validates both the
 * repository behaviour AND the DI benefit described in issue 8.4.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChatRepository, MAX_CHATS_IN_MEMORY } from '../src/sidepanel/services/chat-repository.js';
import { StorageService } from '../src/lib/storage.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a minimal in-memory storage adapter that satisfies the `get`/`set`
 * contract without touching any browser API.  Spied methods allow assertions
 * on call counts and arguments.
 */
function makeAdapter(initial = {}) {
  const store = { ...initial };
  return {
    get: vi.fn(async (keys) => {
      const keyArr = Array.isArray(keys) ? keys : [keys];
      return Object.fromEntries(keyArr.map(k => [k, store[k]]));
    }),
    set: vi.fn(async (data) => {
      Object.assign(store, data);
    }),
    _store: store,
  };
}

function chat(overrides = {}) {
  return {
    id: 'chat_1',
    title: 'Test chat',
    source: 'chatgpt',
    timestamp: 1000,
    content: 'full content here',
    tags: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Constructor
// ---------------------------------------------------------------------------

describe('ChatRepository — constructor injection', () => {
  it('accepts an explicit storage adapter without throwing', () => {
    const adapter = makeAdapter();
    expect(() => new ChatRepository(adapter)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// loadAll
// ---------------------------------------------------------------------------

describe('ChatRepository.loadAll()', () => {
  it('returns an empty array when storage has no chats', async () => {
    const repo = new ChatRepository(makeAdapter());
    await expect(repo.loadAll()).resolves.toEqual([]);
  });

  it('strips the content field from each chat', async () => {
    const adapter = makeAdapter({ chats: [chat()] });
    const repo = new ChatRepository(adapter);
    const result = await repo.loadAll();
    expect(result).toHaveLength(1);
    expect(result[0]).not.toHaveProperty('content');
  });

  it('preserves all other metadata fields', async () => {
    const adapter = makeAdapter({ chats: [chat({ id: 'c1', title: 'Hello', tags: ['ai'] })] });
    const repo = new ChatRepository(adapter);
    const [meta] = await repo.loadAll();
    expect(meta.id).toBe('c1');
    expect(meta.title).toBe('Hello');
    expect(meta.tags).toEqual(['ai']);
  });

  it('returns empty array when storage.get rejects', async () => {
    const adapter = { get: vi.fn().mockRejectedValue(new Error('boom')), set: vi.fn() };
    const repo = new ChatRepository(adapter);
    await expect(repo.loadAll()).resolves.toEqual([]);
  });

  it('never calls adapter.set', async () => {
    const adapter = makeAdapter({ chats: [chat()] });
    const repo = new ChatRepository(adapter);
    await repo.loadAll();
    expect(adapter.set).not.toHaveBeenCalled();
  });

  it('returns chats sorted by timestamp descending (most-recent first)', async () => {
    const c1 = chat({ id: 'c1', timestamp: 1000, content: 'x' });
    const c2 = chat({ id: 'c2', timestamp: 3000, content: 'x' });
    const c3 = chat({ id: 'c3', timestamp: 2000, content: 'x' });
    const adapter = makeAdapter({ chats: [c1, c2, c3] });
    const repo = new ChatRepository(adapter);
    const result = await repo.loadAll();
    expect(result.map(c => c.id)).toEqual(['c2', 'c3', 'c1']);
  });

  it('treats missing timestamp as 0 when sorting', async () => {
    const c1 = chat({ id: 'c1', timestamp: 500, content: 'x' });
    // Build c2 without a timestamp field (not using chat() helper which defaults to 1000)
    const c2 = { id: 'c2', title: 'No timestamp', source: 'chatgpt', content: 'x', tags: [] };
    const adapter = makeAdapter({ chats: [c1, c2] });
    const repo = new ChatRepository(adapter);
    const result = await repo.loadAll();
    expect(result[0].id).toBe('c1');
    expect(result[1].id).toBe('c2');
  });

  it('caps the returned array at MAX_CHATS_IN_MEMORY', async () => {
    const many = Array.from({ length: MAX_CHATS_IN_MEMORY + 10 }, (_, i) =>
      chat({ id: `c${i}`, timestamp: i, content: 'x' })
    );
    const adapter = makeAdapter({ chats: many });
    const repo = new ChatRepository(adapter);
    const result = await repo.loadAll();
    expect(result).toHaveLength(MAX_CHATS_IN_MEMORY);
  });

  it('cap keeps the most-recent entries', async () => {
    // Create MAX+1 chats; highest timestamps should survive the cap.
    const many = Array.from({ length: MAX_CHATS_IN_MEMORY + 1 }, (_, i) =>
      chat({ id: `c${i}`, timestamp: i, content: 'x' })
    );
    const adapter = makeAdapter({ chats: many });
    const repo = new ChatRepository(adapter);
    const result = await repo.loadAll();
    // The oldest chat (timestamp 0, id c0) must be evicted.
    expect(result.find(c => c.id === 'c0')).toBeUndefined();
    // The newest chat (timestamp MAX_CHATS_IN_MEMORY, id c{MAX}) must be present.
    expect(result.find(c => c.id === `c${MAX_CHATS_IN_MEMORY}`)).toBeDefined();
  });

  it('logs a warning when the cap is applied', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const many = Array.from({ length: MAX_CHATS_IN_MEMORY + 1 }, (_, i) =>
      chat({ id: `c${i}`, timestamp: i, content: 'x' })
    );
    const adapter = makeAdapter({ chats: many });
    const repo = new ChatRepository(adapter);
    await repo.loadAll();
    expect(warnSpy).toHaveBeenCalledWith(
      '[bAInder]',
      '[WARN]',
      expect.stringContaining('exceeds MAX_CHATS_IN_MEMORY')
    );
    warnSpy.mockRestore();
  });

  it('does not warn when count is at or below MAX_CHATS_IN_MEMORY', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const exactly = Array.from({ length: MAX_CHATS_IN_MEMORY }, (_, i) =>
      chat({ id: `c${i}`, timestamp: i, content: 'x' })
    );
    const adapter = makeAdapter({ chats: exactly });
    const repo = new ChatRepository(adapter);
    await repo.loadAll();
    const warnedAboutCap = warnSpy.mock.calls.some(args =>
      args.some(a => typeof a === 'string' && a.includes('exceeds MAX_CHATS_IN_MEMORY'))
    );
    expect(warnedAboutCap).toBe(false);
    warnSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// getFullContent
// ---------------------------------------------------------------------------

describe('ChatRepository.getFullContent()', () => {
  it('returns the content field of the matching chat', async () => {
    const adapter = makeAdapter({ chats: [chat({ id: 'c1', content: 'hello world' })] });
    const repo = new ChatRepository(adapter);
    await expect(repo.getFullContent('c1')).resolves.toBe('hello world');
  });

  it('returns null when the chat does not exist', async () => {
    const adapter = makeAdapter({ chats: [] });
    const repo = new ChatRepository(adapter);
    await expect(repo.getFullContent('missing')).resolves.toBeNull();
  });

  it('returns null when storage.get rejects', async () => {
    const adapter = { get: vi.fn().mockRejectedValue(new Error('fail')), set: vi.fn() };
    const repo = new ChatRepository(adapter);
    await expect(repo.getFullContent('x')).resolves.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// updateChat
// ---------------------------------------------------------------------------

describe('ChatRepository.updateChat()', () => {
  it('merges updates into the matching chat and persists', async () => {
    const adapter = makeAdapter({ chats: [chat({ id: 'c1', title: 'Old' })] });
    const repo = new ChatRepository(adapter);
    await repo.updateChat('c1', { title: 'New' });
    const { chats } = adapter._store;
    expect(chats.find(c => c.id === 'c1').title).toBe('New');
  });

  it('returns metadata-only list (no content field)', async () => {
    const adapter = makeAdapter({ chats: [chat({ id: 'c1' })] });
    const repo = new ChatRepository(adapter);
    const result = await repo.updateChat('c1', { title: 'Updated' });
    expect(result[0]).not.toHaveProperty('content');
  });

  it('does not mutate other chats', async () => {
    const adapter = makeAdapter({ chats: [chat({ id: 'c1' }), chat({ id: 'c2', title: 'Other' })] });
    const repo = new ChatRepository(adapter);
    await repo.updateChat('c1', { title: 'Changed' });
    const { chats } = adapter._store;
    expect(chats.find(c => c.id === 'c2').title).toBe('Other');
  });
});

// ---------------------------------------------------------------------------
// addChat
// ---------------------------------------------------------------------------

describe('ChatRepository.addChat()', () => {
  it('appends a new chat and returns updated metadata list', async () => {
    const adapter = makeAdapter({ chats: [] });
    const repo = new ChatRepository(adapter);
    const result = await repo.addChat(chat({ id: 'c1' }));
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('c1');
    expect(result[0]).not.toHaveProperty('content');
  });

  it('deduplicates — replaces an existing entry with the same id', async () => {
    const adapter = makeAdapter({ chats: [chat({ id: 'c1', title: 'Old' })] });
    const repo = new ChatRepository(adapter);
    await repo.addChat(chat({ id: 'c1', title: 'New' }));
    const { chats } = adapter._store;
    expect(chats).toHaveLength(1);
    expect(chats[0].title).toBe('New');
  });

  it('persists via adapter.set', async () => {
    const adapter = makeAdapter({ chats: [] });
    const repo = new ChatRepository(adapter);
    await repo.addChat(chat({ id: 'c1' }));
    expect(adapter.set).toHaveBeenCalledTimes(1);
    expect(adapter.set).toHaveBeenCalledWith(expect.objectContaining({ chats: expect.any(Array) }));
  });
});

// ---------------------------------------------------------------------------
// removeChat
// ---------------------------------------------------------------------------

describe('ChatRepository.removeChat()', () => {
  it('removes the chat with the given id', async () => {
    const adapter = makeAdapter({ chats: [chat({ id: 'c1' }), chat({ id: 'c2' })] });
    const repo = new ChatRepository(adapter);
    const result = await repo.removeChat('c1');
    expect(result.map(c => c.id)).toEqual(['c2']);
  });

  it('returns an empty list when the only chat is removed', async () => {
    const adapter = makeAdapter({ chats: [chat({ id: 'c1' })] });
    const repo = new ChatRepository(adapter);
    await expect(repo.removeChat('c1')).resolves.toEqual([]);
  });

  it('persists via adapter.set', async () => {
    const adapter = makeAdapter({ chats: [chat({ id: 'c1' })] });
    const repo = new ChatRepository(adapter);
    await repo.removeChat('c1');
    expect(adapter.set).toHaveBeenCalledWith({ chats: [] });
  });
});

// ---------------------------------------------------------------------------
// removeManyChats
// ---------------------------------------------------------------------------

describe('ChatRepository.removeManyChats()', () => {
  it('removes all specified chats', async () => {
    const adapter = makeAdapter({
      chats: [chat({ id: 'c1' }), chat({ id: 'c2' }), chat({ id: 'c3' })],
    });
    const repo = new ChatRepository(adapter);
    const result = await repo.removeManyChats(['c1', 'c2']);
    expect(result.map(c => c.id)).toEqual(['c3']);
  });

  it('accepts a Set as the ids argument', async () => {
    const adapter = makeAdapter({ chats: [chat({ id: 'c1' }), chat({ id: 'c2' })] });
    const repo = new ChatRepository(adapter);
    const result = await repo.removeManyChats(new Set(['c1']));
    expect(result.map(c => c.id)).toEqual(['c2']);
  });

  it('returns full list when no ids match', async () => {
    const adapter = makeAdapter({ chats: [chat({ id: 'c1' })] });
    const repo = new ChatRepository(adapter);
    const result = await repo.removeManyChats(['zzz']);
    expect(result).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// replaceAll
// ---------------------------------------------------------------------------

describe('ChatRepository.replaceAll()', () => {
  it('overwrites the entire chats array in storage', async () => {
    const adapter = makeAdapter({ chats: [chat({ id: 'old' })] });
    const repo = new ChatRepository(adapter);
    await repo.replaceAll([chat({ id: 'new1' }), chat({ id: 'new2' })]);
    const { chats } = adapter._store;
    expect(chats.map(c => c.id)).toEqual(['new1', 'new2']);
  });

  it('returns metadata-only list', async () => {
    const adapter = makeAdapter();
    const repo = new ChatRepository(adapter);
    const result = await repo.replaceAll([chat({ id: 'c1' })]);
    expect(result[0]).not.toHaveProperty('content');
  });

  it('calls adapter.set exactly once', async () => {
    const adapter = makeAdapter();
    const repo = new ChatRepository(adapter);
    await repo.replaceAll([]);
    expect(adapter.set).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// loadFullByIds
// ---------------------------------------------------------------------------

describe('ChatRepository.loadFullByIds()', () => {
  it('returns full objects (with content) for matching ids', async () => {
    const adapter = makeAdapter({
      chats: [
        chat({ id: 'c1', content: 'content-1' }),
        chat({ id: 'c2', content: 'content-2' }),
        chat({ id: 'c3', content: 'content-3' }),
      ],
    });
    const repo = new ChatRepository(adapter);
    const result = await repo.loadFullByIds(['c1', 'c3']);
    expect(result.map(c => c.id)).toEqual(['c1', 'c3']);
    expect(result[0].content).toBe('content-1');
  });

  it('returns an empty array when no ids match', async () => {
    const adapter = makeAdapter({ chats: [chat({ id: 'c1' })] });
    const repo = new ChatRepository(adapter);
    await expect(repo.loadFullByIds(['zzz'])).resolves.toEqual([]);
  });

  it('accepts a Set as the ids argument', async () => {
    const adapter = makeAdapter({ chats: [chat({ id: 'c1' }), chat({ id: 'c2' })] });
    const repo = new ChatRepository(adapter);
    const result = await repo.loadFullByIds(new Set(['c2']));
    expect(result.map(c => c.id)).toEqual(['c2']);
  });

  it('never calls adapter.set', async () => {
    const adapter = makeAdapter({ chats: [chat({ id: 'c1' })] });
    const repo = new ChatRepository(adapter);
    await repo.loadFullByIds(['c1']);
    expect(adapter.set).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// DI isolation proof — no browser global required
// ---------------------------------------------------------------------------

describe('ChatRepository — DI isolation', () => {
  it('completes a full save/load cycle using only the injected adapter', async () => {
    // Deliberately does NOT use global.chrome or any browser API
    const adapter = makeAdapter({ chats: [] });
    const repo = new ChatRepository(adapter);

    await repo.addChat(chat({ id: 'c1', title: 'Alpha', content: 'text' }));
    await repo.addChat(chat({ id: 'c2', title: 'Beta',  content: 'more' }));
    await repo.updateChat('c1', { title: 'Alpha Updated' });
    await repo.removeChat('c2');

    const metas = await repo.loadAll();
    expect(metas).toHaveLength(1);
    expect(metas[0].id).toBe('c1');
    expect(metas[0].title).toBe('Alpha Updated');
    expect(metas[0]).not.toHaveProperty('content');

    const fullContent = await repo.getFullContent('c1');
    expect(fullContent).toBe('text');
  });
});

// ---------------------------------------------------------------------------
// Constructor – default (singleton) path: storageAdapter ?? StorageService.getInstance()
// ---------------------------------------------------------------------------

describe('ChatRepository — constructor without explicit adapter', () => {
  beforeEach(() => {
    StorageService.resetInstance();
  });

  afterEach(() => {
    StorageService.resetInstance();
  });

  it('uses StorageService singleton when no adapter is provided (right-hand of ?? is taken)', async () => {
    // This exercises the `?? StorageService.getInstance()` branch.
    // The chrome mock is active so storage reads return empty results.
    const repo = new ChatRepository(); // no adapter
    const result = await repo.loadAll();
    expect(Array.isArray(result)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Array.isArray false-branch: methods with storage that has no chats key
// ---------------------------------------------------------------------------

describe('ChatRepository — Array.isArray false branch (no chats key in storage)', () => {
  it('updateChat returns [] metadata when storage has no chats key', async () => {
    const adapter = makeAdapter({}); // no 'chats' key → result.chats = undefined
    const repo = new ChatRepository(adapter);
    const result = await repo.updateChat('ghost', { title: 'x' });
    expect(Array.isArray(result)).toBe(true);
  });

  it('addChat creates first entry when storage has no chats key', async () => {
    const adapter = makeAdapter({});
    const repo = new ChatRepository(adapter);
    const result = await repo.addChat(chat({ id: 'c1' }));
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('c1');
  });

  it('removeChat returns [] when storage has no chats key', async () => {
    const adapter = makeAdapter({});
    const repo = new ChatRepository(adapter);
    const result = await repo.removeChat('c1');
    expect(result).toEqual([]);
  });

  it('removeManyChats returns [] when storage has no chats key', async () => {
    const adapter = makeAdapter({});
    const repo = new ChatRepository(adapter);
    const result = await repo.removeManyChats(['c1', 'c2']);
    expect(result).toEqual([]);
  });

  it('loadFullByIds returns [] when storage has no chats key', async () => {
    const adapter = makeAdapter({});
    const repo = new ChatRepository(adapter);
    const result = await repo.loadFullByIds(['c1']);
    expect(result).toEqual([]);
  });
});
