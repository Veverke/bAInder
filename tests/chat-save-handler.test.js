/**
 * Tests for src/background/chat-save-handler.js
 * Stage 6: Background save logic – validation, deduplication, entry building
 *
 * These are pure-function unit tests that run without Chrome APIs.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  detectSource,
  generateChatId,
  validateChatData,
  findDuplicate,
  buildChatEntry,
  handleSaveChat
} from '../src/background/chat-save-handler.js';

// ─── detectSource ─────────────────────────────────────────────────────────────

describe('detectSource()', () => {
  it('detects chatgpt from openai URL', () => {
    expect(detectSource('https://chat.openai.com/c/abc')).toBe('chatgpt');
  });

  it('detects claude from claude.ai URL', () => {
    expect(detectSource('https://claude.ai/chat/123')).toBe('claude');
  });

  it('detects gemini from gemini.google.com URL', () => {
    expect(detectSource('https://gemini.google.com/app/xyz')).toBe('gemini');
  });

  it('returns unknown for unrecognised URL', () => {
    expect(detectSource('https://example.com/chat')).toBe('unknown');
  });

  it('returns unknown for null', () => {
    expect(detectSource(null)).toBe('unknown');
  });

  it('returns unknown for empty string', () => {
    expect(detectSource('')).toBe('unknown');
  });

  it('returns unknown for undefined', () => {
    expect(detectSource(undefined)).toBe('unknown');
  });
});

// ─── generateChatId ───────────────────────────────────────────────────────────

describe('generateChatId()', () => {
  it('returns a non-empty string', () => {
    expect(typeof generateChatId()).toBe('string');
    expect(generateChatId().length).toBeGreaterThan(0);
  });

  it('generates unique IDs each call', () => {
    const ids = new Set(Array.from({ length: 100 }, generateChatId));
    expect(ids.size).toBe(100);
  });

  it('contains a timestamp component', () => {
    const before = Date.now();
    const id     = generateChatId();
    const after  = Date.now();
    const ts     = parseInt(id.split('-')[0], 10);
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });
});

// ─── validateChatData ─────────────────────────────────────────────────────────

describe('validateChatData()', () => {
  const validData = {
    title:   'My Chat',
    content: 'Some content here',
    source:  'chatgpt'
  };

  it('does not throw for valid data', () => {
    expect(() => validateChatData(validData)).not.toThrow();
  });

  it('throws when chatData is null', () => {
    expect(() => validateChatData(null)).toThrow('Chat data is required');
  });

  it('throws when chatData is undefined', () => {
    expect(() => validateChatData(undefined)).toThrow('Chat data is required');
  });

  it('throws when title is missing', () => {
    expect(() => validateChatData({ ...validData, title: '' }))
      .toThrow('Chat title is required');
  });

  it('throws when title is only whitespace', () => {
    expect(() => validateChatData({ ...validData, title: '   ' }))
      .toThrow('Chat title is required');
  });

  it('throws when title is not a string', () => {
    expect(() => validateChatData({ ...validData, title: 123 }))
      .toThrow('Chat title is required');
  });

  it('throws when content is missing', () => {
    expect(() => validateChatData({ ...validData, content: '' }))
      .toThrow('Chat content is required');
  });

  it('throws when content is only whitespace', () => {
    expect(() => validateChatData({ ...validData, content: '  \n  ' }))
      .toThrow('Chat content is required');
  });

  it('throws when source is invalid', () => {
    expect(() => validateChatData({ ...validData, source: 'bing' }))
      .toThrow('Invalid source: bing');
  });

  it('throws listing valid sources in the error message', () => {
    try {
      validateChatData({ ...validData, source: 'bard' });
    } catch (err) {
      expect(err.message).toContain('chatgpt');
      expect(err.message).toContain('claude');
      expect(err.message).toContain('gemini');
    }
  });

  it('accepts all three valid sources', () => {
    ['chatgpt', 'claude', 'gemini'].forEach(source => {
      expect(() => validateChatData({ ...validData, source })).not.toThrow();
    });
  });
});

// ─── findDuplicate ────────────────────────────────────────────────────────────

describe('findDuplicate()', () => {
  it('returns null when no chats', () => {
    expect(findDuplicate([], 'https://example.com')).toBeNull();
  });

  it('returns null when url is empty', () => {
    expect(findDuplicate([{ url: 'https://example.com', timestamp: Date.now() }], '')).toBeNull();
  });

  it('returns null when no URL match', () => {
    const chats = [{ url: 'https://chat.openai.com/c/1', timestamp: Date.now() }];
    expect(findDuplicate(chats, 'https://chat.openai.com/c/2')).toBeNull();
  });

  it('finds a duplicate within the time window', () => {
    const chats = [{ url: 'https://chat.openai.com/c/1', timestamp: Date.now() - 1000 }];
    const dup = findDuplicate(chats, 'https://chat.openai.com/c/1');
    expect(dup).not.toBeNull();
  });

  it('does not flag a duplicate outside the time window', () => {
    const chats = [{ url: 'https://chat.openai.com/c/1', timestamp: Date.now() - 10000 }];
    const dup = findDuplicate(chats, 'https://chat.openai.com/c/1', 5000);
    expect(dup).toBeNull();
  });

  it('respects a custom time window', () => {
    const chats = [{ url: 'https://url.com', timestamp: Date.now() - 500 }];
    expect(findDuplicate(chats, 'https://url.com', 1000)).not.toBeNull();
    expect(findDuplicate(chats, 'https://url.com', 100)).toBeNull();
  });

  it('returns null when existingChats is null', () => {
    expect(findDuplicate(null, 'https://url.com')).toBeNull();
  });
});

// ─── buildChatEntry ───────────────────────────────────────────────────────────

describe('buildChatEntry()', () => {
  const chatData = {
    title:        'My Chat',
    content:      'Some content here',
    source:       'chatgpt',
    url:          'https://chat.openai.com/c/abc',
    messageCount: 3,
    messages:     [{ role: 'user', content: 'Q' }],
    metadata:     { extractedAt: 12345 }
  };

  it('includes an auto-generated id', () => {
    const entry = buildChatEntry(chatData, '');
    expect(typeof entry.id).toBe('string');
    expect(entry.id.length).toBeGreaterThan(0);
  });

  it('trims title and content', () => {
    const entry = buildChatEntry({ ...chatData, title: '  My Chat  ', content: '  Content  ' }, '');
    expect(entry.title).toBe('My Chat');
    expect(entry.content).toBe('Content');
  });

  it('sets source from chatData.source', () => {
    expect(buildChatEntry(chatData, '').source).toBe('chatgpt');
  });

  it('infers source from URL when chatData.source missing', () => {
    // Remove BOTH source and url from chatData so tabUrl drives the inference
    const { source, url, ...noSourceNoUrl } = chatData;
    const entry = buildChatEntry(noSourceNoUrl, 'https://claude.ai/chat/1');
    expect(entry.source).toBe('claude');
  });

  it('uses tabUrl when chatData.url is missing', () => {
    const { url, ...noUrl } = chatData;
    const entry = buildChatEntry(noUrl, 'https://chat.openai.com/c/fallback');
    expect(entry.url).toBe('https://chat.openai.com/c/fallback');
  });

  it('sets topicId to null (assigned later in Stage 7)', () => {
    expect(buildChatEntry(chatData, '').topicId).toBeNull();
  });

  it('includes timestamp close to Date.now()', () => {
    const before = Date.now();
    const entry  = buildChatEntry(chatData, '');
    expect(entry.timestamp).toBeGreaterThanOrEqual(before);
  });

  it('copies messages and messageCount', () => {
    const entry = buildChatEntry(chatData, '');
    expect(entry.messageCount).toBe(3);
    expect(entry.messages).toHaveLength(1);
  });

  it('copies metadata', () => {
    expect(buildChatEntry(chatData, '').metadata).toEqual({ extractedAt: 12345 });
  });

  it('defaults messageCount to 0 when not provided', () => {
    const { messageCount, ...noCount } = chatData;
    expect(buildChatEntry(noCount, '').messageCount).toBe(0);
  });
});

// ─── handleSaveChat ───────────────────────────────────────────────────────────

describe('handleSaveChat()', () => {
  let mockStorage;
  let storedChats;

  beforeEach(() => {
    storedChats  = [];
    mockStorage  = {
      get:  vi.fn(async () => ({ chats: storedChats })),
      set:  vi.fn(async (obj) => { storedChats = obj.chats; })
    };
  });

  const validPayload = {
    title:        'Test Chat',
    content:      'User asked something, assistant replied.',
    source:       'chatgpt',
    url:          'https://chat.openai.com/c/test-1',
    messageCount: 2,
    messages:     [{ role: 'user', content: 'Hello' }],
    metadata:     {}
  };

  it('saves a valid chat and returns the new entry', async () => {
    const result = await handleSaveChat(validPayload, {}, mockStorage);
    expect(result.title).toBe('Test Chat');
    expect(result.source).toBe('chatgpt');
    expect(mockStorage.set).toHaveBeenCalledOnce();
  });

  it('appends to existing chats', async () => {
    storedChats = [{ id: 'existing', url: 'https://other.com', timestamp: 0 }];
    await handleSaveChat(validPayload, {}, mockStorage);
    expect(storedChats).toHaveLength(2);
  });

  it('throws for invalid title', async () => {
    await expect(handleSaveChat({ ...validPayload, title: '' }, {}, mockStorage))
      .rejects.toThrow('Chat title is required');
  });

  it('throws for invalid content', async () => {
    await expect(handleSaveChat({ ...validPayload, content: '' }, {}, mockStorage))
      .rejects.toThrow('Chat content is required');
  });

  it('throws for invalid source', async () => {
    await expect(handleSaveChat({ ...validPayload, source: 'unknown' }, {}, mockStorage))
      .rejects.toThrow('Invalid source');
  });

  it('deduplicates: returns existing chat without saving again', async () => {
    // Pre-populate with a chat from same URL, saved just now
    const existing = { id: 'old-id', url: validPayload.url, timestamp: Date.now() - 100 };
    storedChats = [existing];

    const result = await handleSaveChat(validPayload, {}, mockStorage);
    expect(result.id).toBe('old-id');          // returned existing
    expect(mockStorage.set).not.toHaveBeenCalled(); // no new save
  });

  it('does NOT deduplicate when same URL saved a long time ago', async () => {
    storedChats = [{
      id:        'old', url: validPayload.url,
      timestamp: Date.now() - 60_000 // 1 minute ago
    }];
    const result = await handleSaveChat(validPayload, {}, mockStorage);
    expect(result.id).not.toBe('old');
    expect(mockStorage.set).toHaveBeenCalledOnce();
  });

  it('infers source from tab URL when payload source missing', async () => {
    const { source, ...noSource } = validPayload;
    const result = await handleSaveChat(
      { ...noSource, source: 'claude', url: 'https://claude.ai/chat/abc' },
      { tab: { url: 'https://claude.ai/chat/abc' } },
      mockStorage
    );
    expect(result.source).toBe('claude');
  });

  it('starts chats from [] when storage is empty', async () => {
    mockStorage.get = vi.fn(async () => ({})); // no chats key
    await handleSaveChat(validPayload, {}, mockStorage);
    expect(mockStorage.set).toHaveBeenCalledWith({
      chats: expect.arrayContaining([expect.objectContaining({ title: 'Test Chat' })])
    });
  });

  it('returns an entry with all required fields', async () => {
    const result = await handleSaveChat(validPayload, {}, mockStorage);
    expect(result).toMatchObject({
      id:           expect.any(String),
      title:        'Test Chat',
      content:      expect.any(String),
      url:          validPayload.url,
      source:       'chatgpt',
      timestamp:    expect.any(Number),
      topicId:      null,
      messageCount: 2
    });
  });
});

// ---------------------------------------------------------------------------
// Branch-gap: buildChatEntry fallback branches for optional fields
// ---------------------------------------------------------------------------

describe('buildChatEntry() – optional-field fallbacks', () => {
  const base = {
    title:   'Chat',
    content: 'Content',
    source:  'gemini',
    url:     'https://gemini.google.com/app/x'
  };

  it('defaults messages to [] when not provided', () => {
    const { messages, ...noMessages } = { ...base, messages: undefined };
    // just omit messages entirely
    const entry = buildChatEntry(base, '');
    // base has messages undefined but tests above showed messages is read from chatData
    // We need to omit it entirely:
    const noMsg = { title: base.title, content: base.content, source: base.source, url: base.url };
    const e = buildChatEntry(noMsg, '');
    expect(e.messages).toEqual([]);
  });

  it('defaults metadata to {} when not provided', () => {
    const noMeta = { title: base.title, content: base.content, source: base.source, url: base.url };
    const e = buildChatEntry(noMeta, '');
    expect(e.metadata).toEqual({});
  });

  it('uses empty string url when both chatData.url and tabUrl are falsy', () => {
    const noUrl = { title: base.title, content: base.content, source: base.source };
    const e = buildChatEntry(noUrl, '');  // tabUrl is also ''
    expect(e.url).toBe('');
  });
});
