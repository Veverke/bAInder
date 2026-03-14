import { describe, it, expect, beforeEach } from 'vitest';
import {
  registerExtractor,
  extractChatEntities,
  _resetRegistry,
} from '../src/lib/entities/entity-extractor.js';

beforeEach(() => {
  _resetRegistry();
});

describe('registerExtractor() + extractChatEntities()', () => {
  it('calls each registered extractor with messages, doc, chatId', () => {
    const calls = [];
    const fn = (messages, doc, chatId) => {
      calls.push({ messages, doc, chatId });
      return [{ id: '1' }];
    };
    registerExtractor('code', fn);
    extractChatEntities([{ role: 'user' }], null, 'chat-1');
    expect(calls).toHaveLength(1);
    expect(calls[0].chatId).toBe('chat-1');
    expect(calls[0].doc).toBeNull();
  });

  it('returns results from all registered extractors', () => {
    registerExtractor('code', () => [{ id: 'c1' }]);
    registerExtractor('table', () => [{ id: 't1' }, { id: 't2' }]);
    const result = extractChatEntities([], null, 'chat-1');
    expect(result.code).toHaveLength(1);
    expect(result.table).toHaveLength(2);
  });
});

describe('extractChatEntities() — error isolation', () => {
  it('extractor that throws does not abort the pipeline', () => {
    registerExtractor('code', () => { throw new Error('boom'); });
    registerExtractor('table', () => [{ id: 't1' }]);
    const result = extractChatEntities([], null, 'chat-1');
    expect(result.code).toBeUndefined();
    expect(result.table).toHaveLength(1);
  });
});

describe('extractChatEntities() — empty results omitted', () => {
  it('empty extractor results are omitted from the output', () => {
    registerExtractor('code', () => []);
    registerExtractor('table', () => [{ id: 't1' }]);
    const result = extractChatEntities([], null, 'chat-1');
    expect('code' in result).toBe(false);
    expect(result.table).toBeDefined();
  });

  it('returns empty object when no extractors registered', () => {
    const result = extractChatEntities([], null, 'chat-1');
    expect(Object.keys(result)).toHaveLength(0);
  });
});

describe('extractChatEntities() — chatId passthrough', () => {
  it('chatId is passed through to each extractor call', () => {
    const received = [];
    registerExtractor('prompt', (_msgs, _doc, chatId) => { received.push(chatId); return [{}]; });
    registerExtractor('code',   (_msgs, _doc, chatId) => { received.push(chatId); return [{}]; });
    extractChatEntities([], null, 'my-chat-id');
    expect(received).toEqual(['my-chat-id', 'my-chat-id']);
  });
});

// ---------------------------------------------------------------------------
// A.4 — end-to-end with real Phase-A extractors
// ---------------------------------------------------------------------------

describe('extractChatEntities() — end-to-end with real extractors (A.4)', () => {
  // Import real extractors and register them manually for this isolated test.
  it('extracts prompt entities from real extractPrompts', async () => {
    const { extractPrompts } = await import('../src/lib/entities/extractors/prompts.js');
    registerExtractor('prompt', extractPrompts);

    const msgs = [
      { role: 'user',      index: 0, content: 'Hello universe' },
      { role: 'assistant', index: 1, content: 'Hi there!' },
    ];
    const result = extractChatEntities(msgs, null, 'chat-e2e');
    expect(Array.isArray(result.prompt)).toBe(true);
    expect(result.prompt).toHaveLength(1);
    expect(result.prompt[0].text).toBe('Hello universe');
  });

  it('extracts table entities from real extractTables', async () => {
    const { extractTables } = await import('../src/lib/entities/extractors/tables.js');
    registerExtractor('table', extractTables);

    const msgs = [
      { role: 'assistant', index: 1, content: '| A | B |\n| --- | --- |\n| 1 | 2 |' },
    ];
    const result = extractChatEntities(msgs, null, 'chat-e2e-2');
    expect(Array.isArray(result.table)).toBe(true);
    expect(result.table).toHaveLength(1);
    expect(result.table[0].headers).toEqual(['A', 'B']);
  });
});

