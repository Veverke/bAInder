import { describe, it, expect } from 'vitest';
import { EntityStore } from '../src/lib/entities/entity-store.js';

// Helper: build a minimal chat entry with entity arrays
function makeChat(id, topicId, entityMap = {}) {
  return { id, topicId, ...entityMap };
}

describe('EntityStore.getAllByType()', () => {
  it('returns all code entities across multiple chats', () => {
    const chats = [
      makeChat('c1', 't1', { code: [{ id: 'e1', chatId: 'c1', messageIndex: 0 }] }),
      makeChat('c2', 't1', { code: [{ id: 'e2', chatId: 'c2', messageIndex: 1 }] }),
    ];
    const store = new EntityStore(() => chats);
    const result = store.getAllByType('code');
    expect(result).toHaveLength(2);
    expect(result.map(e => e.id)).toContain('e1');
    expect(result.map(e => e.id)).toContain('e2');
  });

  it('sorts by chatId then messageIndex', () => {
    const chats = [
      makeChat('b', 't1', { code: [{ id: 'b0', chatId: 'b', messageIndex: 0 }] }),
      makeChat('a', 't1', {
        code: [
          { id: 'a2', chatId: 'a', messageIndex: 2 },
          { id: 'a0', chatId: 'a', messageIndex: 0 },
        ],
      }),
    ];
    const store = new EntityStore(() => chats);
    const ids = store.getAllByType('code').map(e => e.id);
    expect(ids).toEqual(['a0', 'a2', 'b0']);
  });

  it('returns empty array when no chats have that type', () => {
    const chats = [makeChat('c1', 't1', { table: [{ id: 't1' }] })];
    const store = new EntityStore(() => chats);
    expect(store.getAllByType('code')).toEqual([]);
  });

  it('returns empty array when chats array is empty', () => {
    const store = new EntityStore(() => []);
    expect(store.getAllByType('code')).toEqual([]);
  });
});

describe('EntityStore.getForChat()', () => {
  it('returns only that chat\'s entities', () => {
    const chats = [
      makeChat('c1', 't1', {
        code:  [{ id: 'c1-code', chatId: 'c1' }],
        table: [{ id: 'c1-tab', chatId: 'c1' }],
      }),
      makeChat('c2', 't1', { code: [{ id: 'c2-code', chatId: 'c2' }] }),
    ];
    const store = new EntityStore(() => chats);
    const forC1 = store.getForChat('c1');
    expect(forC1.map(e => e.id)).toContain('c1-code');
    expect(forC1.map(e => e.id)).toContain('c1-tab');
    expect(forC1.map(e => e.id)).not.toContain('c2-code');
  });

  it('returns only the specified type when type is provided', () => {
    const chats = [
      makeChat('c1', 't1', {
        code:  [{ id: 'c1-code', chatId: 'c1' }],
        table: [{ id: 'c1-tab',  chatId: 'c1' }],
      }),
    ];
    const store = new EntityStore(() => chats);
    const result = store.getForChat('c1', 'code');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('c1-code');
  });

  it('returns empty array for unknown chatId', () => {
    const store = new EntityStore(() => [makeChat('c1', 't1')]);
    expect(store.getForChat('unknown-id')).toEqual([]);
  });

  it('returns empty array when chats array is empty', () => {
    const store = new EntityStore(() => []);
    expect(store.getForChat('any')).toEqual([]);
  });
});

describe('EntityStore.getPresentTypes()', () => {
  it('returns only types that have ≥ 1 entity', () => {
    const chats = [
      makeChat('c1', 't1', {
        code:  [{ id: 'e1' }],
        table: [{ id: 'e2' }],
      }),
    ];
    const store = new EntityStore(() => chats);
    const types = store.getPresentTypes();
    expect(types).toContain('code');
    expect(types).toContain('table');
    expect(types).not.toContain('prompt');
  });

  it('returns empty array when chats array is empty', () => {
    const store = new EntityStore(() => []);
    expect(store.getPresentTypes()).toEqual([]);
  });

  it('returns empty array when no chat has any entity arrays', () => {
    const store = new EntityStore(() => [makeChat('c1', 't1')]);
    expect(store.getPresentTypes()).toEqual([]);
  });
});
