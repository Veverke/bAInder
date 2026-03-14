/**
 * tests/extractors/prompts.test.js — Task A.1
 */
import { describe, it, expect } from 'vitest';
import { extractPrompts } from '../../src/lib/entities/extractors/prompts.js';

const MESSAGES = [
  { role: 'user',      index: 0, content: 'Hello world, how are you?' },
  { role: 'assistant', index: 1, content: 'I am fine, thank you.' },
  { role: 'user',      index: 2, content: 'Great to hear!' },
  { role: 'assistant', index: 3, content: 'Indeed.' },
];

describe('extractPrompts()', () => {
  it('2 user turns from 4-message array → 2 prompt entities', () => {
    const result = extractPrompts(MESSAGES, null, 'chat-1');
    expect(result).toHaveLength(2);
  });

  it('entities have type "prompt"', () => {
    extractPrompts(MESSAGES, null, 'chat-1').forEach(e => {
      expect(e.type).toBe('prompt');
    });
  });

  it('entities have role "user"', () => {
    extractPrompts(MESSAGES, null, 'chat-1').forEach(e => {
      expect(e.role).toBe('user');
    });
  });

  it('entities carry the correct text', () => {
    const result = extractPrompts(MESSAGES, null, 'chat-1');
    expect(result[0].text).toBe('Hello world, how are you?');
    expect(result[1].text).toBe('Great to hear!');
  });

  it('wordCount is computed correctly', () => {
    const result = extractPrompts(MESSAGES, null, 'chat-1');
    // 'Hello world, how are you?' → 5 words
    expect(result[0].wordCount).toBe(5);
    // 'Great to hear!' → 3 words
    expect(result[1].wordCount).toBe(3);
  });

  it('uses m.index for messageIndex when available', () => {
    const result = extractPrompts(MESSAGES, null, 'chat-1');
    expect(result[0].messageIndex).toBe(0);
    expect(result[1].messageIndex).toBe(2);
  });

  it('falls back to filtered-array position when m.index is absent', () => {
    const msgs = [
      { role: 'user',      content: 'A' },
      { role: 'assistant', content: 'B' },
      { role: 'user',      content: 'C' },
    ];
    const result = extractPrompts(msgs, null, 'chat-1');
    // i = 0 for first user in filtered array, i = 1 for second
    expect(result[0].messageIndex).toBe(0);
    expect(result[1].messageIndex).toBe(1);
  });

  it('assistant turns are excluded', () => {
    const msgs = [{ role: 'assistant', content: 'Hi' }];
    expect(extractPrompts(msgs, null, 'chat-1')).toHaveLength(0);
  });

  it('empty messages array returns empty result', () => {
    expect(extractPrompts([], null, 'chat-1')).toHaveLength(0);
  });

  it('chatId is stamped on every entity', () => {
    extractPrompts(MESSAGES, null, 'chat-XYZ').forEach(e => {
      expect(e.chatId).toBe('chat-XYZ');
    });
  });

  it('entities have a unique non-empty id', () => {
    const result = extractPrompts(MESSAGES, null, 'chat-1');
    const ids = result.map(e => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    ids.forEach(id => expect(id.length).toBeGreaterThan(0));
  });
});
