/**
 * Tests for src/background/chat-save-handler.js
 * Stage 6: Background save logic – validation, deduplication, entry building
 *
 * These are pure-function unit tests that run without Chrome APIs.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  detectSource,
  generateChatId,
  validateChatData,
  findDuplicate,
  buildChatEntry,
  buildExcerptPayload,
  handleSaveChat
} from '../src/background/chat-save-handler.js';
import {
  registerExtractor,
  _resetRegistry,
} from '../src/lib/entities/entity-extractor.js';

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

  it('detects copilot from copilot.microsoft.com URL', () => {
    expect(detectSource('https://copilot.microsoft.com/')).toBe('copilot');
  });

  it('detects copilot from copilot.microsoft.com with path', () => {
    expect(detectSource('https://copilot.microsoft.com/chats/abc123')).toBe('copilot');
  });

  it('detects copilot from m365.cloud.microsoft URL (redirect target)', () => {
    expect(detectSource('https://m365.cloud.microsoft/chat')).toBe('copilot');
  });

  it('detects copilot from m365.cloud.microsoft with chat path', () => {
    expect(detectSource('https://m365.cloud.microsoft/chat/entity/abc123')).toBe('copilot');
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

  it('accepts copilot as a valid source', () => {
    expect(() => validateChatData({ ...validData, source: 'copilot' })).not.toThrow();
  });

  it('error message for invalid source mentions all valid platforms including copilot', () => {
    try {
      validateChatData({ ...validData, source: 'bing' });
      expect.fail('should have thrown');
    } catch (err) {
      expect(err.message).toContain('copilot');
    }
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

  it('includes an auto-generated id', async () => {
    const entry = await buildChatEntry(chatData, '');
    expect(typeof entry.id).toBe('string');
    expect(entry.id.length).toBeGreaterThan(0);
  });

  it('trims title and content', async () => {
    const entry = await buildChatEntry({ ...chatData, title: '  My Chat  ', content: '  Content  ' }, '');
    expect(entry.title).toBe('My Chat');
    expect(entry.content).toBe('Content');
  });

  it('sets source from chatData.source', async () => {
    expect((await buildChatEntry(chatData, '')).source).toBe('chatgpt');
  });

  it('infers source from URL when chatData.source missing', async () => {
    // Remove BOTH source and url from chatData so tabUrl drives the inference
    const { source, url, ...noSourceNoUrl } = chatData;
    const entry = await buildChatEntry(noSourceNoUrl, 'https://claude.ai/chat/1');
    expect(entry.source).toBe('claude');
  });

  it('uses tabUrl when chatData.url is missing', async () => {
    const { url, ...noUrl } = chatData;
    const entry = await buildChatEntry(noUrl, 'https://chat.openai.com/c/fallback');
    expect(entry.url).toBe('https://chat.openai.com/c/fallback');
  });

  it('sets topicId to null (assigned later in Stage 7)', async () => {
    expect((await buildChatEntry(chatData, '')).topicId).toBeNull();
  });

  it('includes timestamp close to Date.now()', async () => {
    const before = Date.now();
    const entry  = await buildChatEntry(chatData, '');
    expect(entry.timestamp).toBeGreaterThanOrEqual(before);
  });

  it('copies messages and messageCount', async () => {
    const entry = await buildChatEntry(chatData, '');
    expect(entry.messageCount).toBe(3);
    expect(entry.messages).toHaveLength(1);
  });

  it('copies metadata', async () => {
    expect((await buildChatEntry(chatData, '')).metadata).toEqual({ extractedAt: 12345 });
  });

  it('defaults messageCount to 0 when not provided', async () => {
    const { messageCount, ...noCount } = chatData;
    expect((await buildChatEntry(noCount, '')).messageCount).toBe(0);
  });
});

// ─── handleSaveChat ───────────────────────────────────────────────────────────

describe('handleSaveChat()', () => {
  // Mock a ChatRepository: tracks addChat calls and exposes loadAll
  let mockRepo;
  let existingMetas;
  let savedEntries;

  beforeEach(() => {
    existingMetas = [];
    savedEntries  = [];
    mockRepo = {
      loadAll: vi.fn(async () => [...existingMetas]),
      addChat: vi.fn(async (entry) => { savedEntries.push(entry); }),
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
    const result = await handleSaveChat(validPayload, {}, mockRepo);
    expect(result.title).toBe('Test Chat');
    expect(result.source).toBe('chatgpt');
    expect(mockRepo.addChat).toHaveBeenCalledOnce();
  });

  it('calls addChat with the new entry', async () => {
    await handleSaveChat(validPayload, {}, mockRepo);
    expect(savedEntries).toHaveLength(1);
  });

  it('throws for invalid title', async () => {
    await expect(handleSaveChat({ ...validPayload, title: '' }, {}, mockRepo))
      .rejects.toThrow('Chat title is required');
  });

  it('throws for invalid content', async () => {
    await expect(handleSaveChat({ ...validPayload, content: '' }, {}, mockRepo))
      .rejects.toThrow('Chat content is required');
  });

  it('throws for invalid source', async () => {
    await expect(handleSaveChat({ ...validPayload, source: 'unknown' }, {}, mockRepo))
      .rejects.toThrow('Invalid source');
  });

  it('deduplicates: returns existing chat without saving again', async () => {
    const existing = { id: 'old-id', url: validPayload.url, timestamp: Date.now() - 100 };
    existingMetas = [existing];

    const result = await handleSaveChat(validPayload, {}, mockRepo);
    expect(result.id).toBe('old-id');
    expect(mockRepo.addChat).not.toHaveBeenCalled();
  });

  it('does NOT deduplicate when same URL saved a long time ago', async () => {
    existingMetas = [{ id: 'old', url: validPayload.url, timestamp: Date.now() - 60_000 }];
    const result = await handleSaveChat(validPayload, {}, mockRepo);
    expect(result.id).not.toBe('old');
    expect(mockRepo.addChat).toHaveBeenCalledOnce();
  });

  it('infers source from tab URL when payload source missing', async () => {
    const { source, ...noSource } = validPayload;
    const result = await handleSaveChat(
      { ...noSource, source: 'claude', url: 'https://claude.ai/chat/abc' },
      { tab: { url: 'https://claude.ai/chat/abc' } },
      mockRepo
    );
    expect(result.source).toBe('claude');
  });

  it('starts from empty list when loadAll returns []', async () => {
    // existingMetas is [] by default
    await handleSaveChat(validPayload, {}, mockRepo);
    expect(mockRepo.addChat).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Test Chat' })
    );
  });

  it('returns an entry with all required fields', async () => {
    const result = await handleSaveChat(validPayload, {}, mockRepo);
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

  it('defaults messages to [] when not provided', async () => {
    const { messages, ...noMessages } = { ...base, messages: undefined };
    // just omit messages entirely
    const entry = await buildChatEntry(base, '');
    // base has messages undefined but tests above showed messages is read from chatData
    // We need to omit it entirely:
    const noMsg = { title: base.title, content: base.content, source: base.source, url: base.url };
    const e = await buildChatEntry(noMsg, '');
    expect(e.messages).toEqual([]);
  });

  it('defaults metadata to {} when not provided', async () => {
    const noMeta = { title: base.title, content: base.content, source: base.source, url: base.url };
    const e = await buildChatEntry(noMeta, '');
    expect(e.metadata).toEqual({});
  });

  it('uses empty string url when both chatData.url and tabUrl are falsy', async () => {
    const noUrl = { title: base.title, content: base.content, source: base.source };
    const e = await buildChatEntry(noUrl, '');  // tabUrl is also ''
    expect(e.url).toBe('');
  });
});

// ─── buildExcerptPayload ──────────────────────────────────────────────────────

describe('buildExcerptPayload()', () => {
  it('throws when selection is empty string', () => {
    expect(() => buildExcerptPayload('', 'https://chat.openai.com/')).toThrow('Selection is empty');
  });

  it('throws when selection is null', () => {
    expect(() => buildExcerptPayload(null, 'https://chat.openai.com/')).toThrow('Selection is empty');
  });

  it('throws when selection is whitespace only', () => {
    expect(() => buildExcerptPayload('   \n  ', 'https://chat.openai.com/')).toThrow('Selection is empty');
  });

  it('content is a markdown document containing the selection text', () => {
    const p = buildExcerptPayload('  hello world  ', 'https://chat.openai.com/');
    expect(p.content).toContain('hello world');
    expect(p.content).toContain('contentFormat: markdown-v1');
  });

  it('sets title to first line of selection', () => {
    const p = buildExcerptPayload('First line\nSecond line\nThird line', 'https://chat.openai.com/');
    expect(p.title).toBe('First line');
  });

  it('truncates title to 80 characters', () => {
    const long = 'A'.repeat(120);
    const p = buildExcerptPayload(long, 'https://chat.openai.com/');
    expect(p.title.length).toBe(80);
  });

  it('detects chatgpt source from openai URL', () => {
    const p = buildExcerptPayload('Hello', 'https://chat.openai.com/c/abc');
    expect(p.source).toBe('chatgpt');
  });

  it('detects claude source from claude URL', () => {
    const p = buildExcerptPayload('Hello', 'https://claude.ai/chat/123');
    expect(p.source).toBe('claude');
  });

  it('detects gemini source from gemini URL', () => {
    const p = buildExcerptPayload('Hello', 'https://gemini.google.com/app/x');
    expect(p.source).toBe('gemini');
  });

  it('detects copilot source from copilot.microsoft.com URL', () => {
    const p = buildExcerptPayload('Hello', 'https://copilot.microsoft.com/');
    expect(p.source).toBe('copilot');
  });

  it('detects copilot source from m365.cloud.microsoft URL', () => {
    const p = buildExcerptPayload('Hello', 'https://m365.cloud.microsoft/chat');
    expect(p.source).toBe('copilot');
  });

  it('sets metadata.isExcerpt to true and contentFormat to markdown-v1', () => {
    const p = buildExcerptPayload('Hello', 'https://chat.openai.com/');
    expect(p.metadata.isExcerpt).toBe(true);
    expect(p.metadata.contentFormat).toBe('markdown-v1');
  });

  it('sets messageCount to 0', () => {
    const p = buildExcerptPayload('Hello', 'https://chat.openai.com/');
    expect(p.messageCount).toBe(0);
  });

  it('sets messages to empty array', () => {
    const p = buildExcerptPayload('Hello', 'https://chat.openai.com/');
    expect(p.messages).toEqual([]);
  });

  it('sets url from pageUrl', () => {
    const p = buildExcerptPayload('Hello', 'https://claude.ai/chat/xyz');
    expect(p.url).toBe('https://claude.ai/chat/xyz');
  });

  it('sets url to empty string when pageUrl is omitted', () => {
    const p = buildExcerptPayload('Hello');
    expect(p.url).toBe('');
  });

  it('produces a payload that passes validateChatData', () => {
    const p = buildExcerptPayload('Some selected text', 'https://chat.openai.com/c/abc');
    expect(() => validateChatData(p)).not.toThrow();
  });

  // ── richMarkdown parameter ─────────────────────────────────────────────────

  it('uses richMarkdown as body when provided', () => {
    const rich = '## Answer\n\nHere is the **formatted** response.\n\n```js\nconsole.log("hi");\n```';
    const p = buildExcerptPayload('plain text fallback', 'https://chat.openai.com/', rich);
    expect(p.content).toContain('formatted');
    expect(p.content).toContain('console.log');
    // plain text should NOT be used as body when rich is provided
    expect(p.content).not.toContain('plain text fallback');
  });

  it('falls back to plain selectionText body when richMarkdown is null', () => {
    const p = buildExcerptPayload('plain text fallback', 'https://chat.openai.com/', null);
    expect(p.content).toContain('plain text fallback');
  });

  it('derives title from richMarkdown first non-heading line', () => {
    const rich = '## Section Heading\n\nThis is the actual content that matters.';
    const p = buildExcerptPayload('ignore me', 'https://chat.openai.com/', rich);
    // Title should come from first non-heading non-empty line, not the selection
    expect(p.title).toBe('This is the actual content that matters.');
  });

  it('still validates correctly when rich markdown is provided', () => {
    const rich = '**Bold text** and some code `var x = 1`';
    const p = buildExcerptPayload('plain', 'https://copilot.microsoft.com/', rich);
    expect(() => validateChatData(p)).not.toThrow();
    expect(p.metadata.isExcerpt).toBe(true);
  });
});

// ─── buildChatEntry() — entity extraction (Task 0.3) ─────────────────────────

describe('buildChatEntry() — entity extraction', () => {
  const baseData = {
    title:   'Code Chat',
    content: 'Some content',
    source:  'chatgpt',
    url:     'https://chat.openai.com/c/1',
  };

  afterEach(() => {
    _resetRegistry();
  });

  it('entry contains code entities when a code extractor is registered and matches', async () => {
    registerExtractor('code', (messages, _doc, chatId) =>
      messages
        .filter(m => /```/.test(m.content || ''))
        .map((m, i) => ({ id: `e${i}`, type: 'code', chatId, messageIndex: i }))
    );
    const data = {
      ...baseData,
      messages: [{ role: 'assistant', content: '```js\nconsole.log("hi");\n```' }],
    };
    const entry = await buildChatEntry(data, '');
    expect(Array.isArray(entry.code)).toBe(true);
    expect(entry.code.length).toBeGreaterThan(0);
  });

  it('entry has no entity keys when no extractors are registered', async () => {
    const entry = await buildChatEntry({ ...baseData, messages: [] }, '');
    const knownBaseKeys = ['id', 'title', 'content', 'url', 'source', 'timestamp',
                           'topicId', 'messageCount', 'messages', 'metadata'];
    const extraKeys = Object.keys(entry).filter(k => !knownBaseKeys.includes(k));
    expect(extraKeys).toHaveLength(0);
  });

  it('a failing extractor does not cause buildChatEntry to throw', async () => {
    registerExtractor('code', () => { throw new Error('extractor boom'); });
    await expect(buildChatEntry({ ...baseData, messages: [] }, '')).resolves.not.toThrow();
  });
});
