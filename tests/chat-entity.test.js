import { describe, it, expect } from 'vitest';
import { ENTITY_TYPES, createEntity } from '../src/lib/entities/chat-entity.js';

describe('ENTITY_TYPES', () => {
  it('all values are distinct strings', () => {
    const values = Object.values(ENTITY_TYPES);
    const unique = new Set(values);
    expect(unique.size).toBe(values.length);
    values.forEach(v => expect(typeof v).toBe('string'));
  });

  it('contains the 10 expected types', () => {
    expect(ENTITY_TYPES.PROMPT).toBe('prompt');
    expect(ENTITY_TYPES.CITATION).toBe('citation');
    expect(ENTITY_TYPES.TABLE).toBe('table');
    expect(ENTITY_TYPES.CODE).toBe('code');
    expect(ENTITY_TYPES.DIAGRAM).toBe('diagram');
    expect(ENTITY_TYPES.TOOL_CALL).toBe('toolCall');
    expect(ENTITY_TYPES.ATTACHMENT).toBe('attachment');
    expect(ENTITY_TYPES.IMAGE).toBe('image');
    expect(ENTITY_TYPES.AUDIO).toBe('audio');
    expect(ENTITY_TYPES.ARTIFACT).toBe('artifact');
  });

  it('is frozen (immutable)', () => {
    expect(Object.isFrozen(ENTITY_TYPES)).toBe(true);
  });
});

describe('createEntity()', () => {
  it('populates all base fields', () => {
    const entity = createEntity('code', 2, 'chat-1', 'assistant', { language: 'js' });
    expect(entity.type).toBe('code');
    expect(entity.messageIndex).toBe(2);
    expect(entity.chatId).toBe('chat-1');
    expect(entity.role).toBe('assistant');
    expect(entity.language).toBe('js');
  });

  it('generates a non-empty string id', () => {
    const entity = createEntity('prompt', 0, 'chat-1', 'user');
    expect(typeof entity.id).toBe('string');
    expect(entity.id.length).toBeGreaterThan(0);
  });

  it('generates unique ids across calls', () => {
    const ids = new Set(
      Array.from({ length: 50 }, () => createEntity('code', 0, 'c', 'user').id)
    );
    expect(ids.size).toBe(50);
  });

  it('spreads extra fields onto the entity', () => {
    const entity = createEntity('table', 1, 'chat-2', 'assistant', {
      rows: 3,
      cols: 4,
      caption: 'Summary',
    });
    expect(entity.rows).toBe(3);
    expect(entity.cols).toBe(4);
    expect(entity.caption).toBe('Summary');
  });

  it('works with no fields argument', () => {
    const entity = createEntity('prompt', 0, 'chat-3', 'user');
    expect(entity.type).toBe('prompt');
    expect(entity.messageIndex).toBe(0);
  });
});
