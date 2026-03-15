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
  it('calls each registered extractor with messages, doc, chatId', async () => {
    const calls = [];
    const fn = (messages, doc, chatId) => {
      calls.push({ messages, doc, chatId });
      return [{ id: '1' }];
    };
    registerExtractor('code', fn);
    await extractChatEntities([{ role: 'user' }], null, 'chat-1');
    expect(calls).toHaveLength(1);
    expect(calls[0].chatId).toBe('chat-1');
    expect(calls[0].doc).toBeNull();
  });

  it('returns results from all registered extractors', async () => {
    registerExtractor('code', () => [{ id: 'c1' }]);
    registerExtractor('table', () => [{ id: 't1' }, { id: 't2' }]);
    const result = await extractChatEntities([], null, 'chat-1');
    expect(result.code).toHaveLength(1);
    expect(result.table).toHaveLength(2);
  });
});

describe('extractChatEntities() — error isolation', () => {
  it('extractor that throws does not abort the pipeline', async () => {
    registerExtractor('code', () => { throw new Error('boom'); });
    registerExtractor('table', () => [{ id: 't1' }]);
    const result = await extractChatEntities([], null, 'chat-1');
    expect(result.code).toBeUndefined();
    expect(result.table).toHaveLength(1);
  });
});

describe('extractChatEntities() — empty results omitted', () => {
  it('empty extractor results are omitted from the output', async () => {
    registerExtractor('code', () => []);
    registerExtractor('table', () => [{ id: 't1' }]);
    const result = await extractChatEntities([], null, 'chat-1');
    expect('code' in result).toBe(false);
    expect(result.table).toBeDefined();
  });

  it('returns empty object when no extractors registered', async () => {
    const result = await extractChatEntities([], null, 'chat-1');
    expect(Object.keys(result)).toHaveLength(0);
  });
});

describe('extractChatEntities() — chatId passthrough', () => {
  it('chatId is passed through to each extractor call', async () => {
    const received = [];
    registerExtractor('prompt', (_msgs, _doc, chatId) => { received.push(chatId); return [{}]; });
    registerExtractor('code',   (_msgs, _doc, chatId) => { received.push(chatId); return [{}]; });
    await extractChatEntities([], null, 'my-chat-id');
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
    const result = await extractChatEntities(msgs, null, 'chat-e2e');
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
    const result = await extractChatEntities(msgs, null, 'chat-e2e-2');
    expect(Array.isArray(result.table)).toBe(true);
    expect(result.table).toHaveLength(1);
    expect(result.table[0].headers).toEqual(['A', 'B']);
  });
});

// ---------------------------------------------------------------------------
// D.6 — async extractor behaviour
// ---------------------------------------------------------------------------

describe('extractChatEntities() — async extractor support (D.6)', () => {
  it('awaits an async extractor (returns a Promise)', async () => {
    const asyncExtractor = async (_msgs, _doc, _chatId) => {
      await new Promise(r => setTimeout(r, 0));
      return [{ id: 'async-entity' }];
    };
    registerExtractor('audio', asyncExtractor);
    const result = await extractChatEntities([], null, 'chat-1');
    expect(Array.isArray(result.audio)).toBe(true);
    expect(result.audio[0].id).toBe('async-entity');
  });

  it('async extractor that rejects does not abort the pipeline', async () => {
    registerExtractor('audio',  async () => { throw new Error('async boom'); });
    registerExtractor('image',  () => [{ id: 'img-1' }]);
    const result = await extractChatEntities([], null, 'chat-1');
    expect(result.audio).toBeUndefined();
    expect(result.image).toHaveLength(1);
  });

  it('mix of sync and async extractors both produce results', async () => {
    registerExtractor('image', () => [{ id: 'img-sync' }]);
    registerExtractor('audio', async () => [{ id: 'aud-async' }]);
    const result = await extractChatEntities([], null, 'chat-1');
    expect(result.image).toHaveLength(1);
    expect(result.audio).toHaveLength(1);
  });
});

