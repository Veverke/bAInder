/**
 * tests/chat-turns.test.js — Phase 2
 * Tests for extractAssistantTurns() utility.
 */

import { describe, it, expect } from 'vitest';
import { extractAssistantTurns } from '../src/lib/analysis/chat-turns.js';

describe('extractAssistantTurns', () => {
  it('returns [] for chat with only user messages', () => {
    const chat = {
      messages: [
        { role: 'user', content: 'Hello' },
        { role: 'user', content: 'World' },
      ],
    };
    expect(extractAssistantTurns(chat)).toEqual([]);
  });

  it('returns only assistant content strings for alternating messages', () => {
    const chat = {
      messages: [
        { role: 'user',      content: 'Question 1' },
        { role: 'assistant', content: 'Answer 1'   },
        { role: 'user',      content: 'Question 2' },
        { role: 'assistant', content: 'Answer 2'   },
      ],
    };
    expect(extractAssistantTurns(chat)).toEqual(['Answer 1', 'Answer 2']);
  });

  it('maps assistant turn with empty content to empty string (not dropped)', () => {
    const chat = {
      messages: [
        { role: 'assistant', content: ''        },
        { role: 'assistant', content: 'Non-empty' },
      ],
    };
    const result = extractAssistantTurns(chat);
    expect(result).toHaveLength(2);
    expect(result[0]).toBe('');
    expect(result[1]).toBe('Non-empty');
  });

  it('maps assistant turn with missing content to empty string', () => {
    const chat = {
      messages: [{ role: 'assistant' }],
    };
    expect(extractAssistantTurns(chat)).toEqual(['']);
  });

  it('returns [] for chat with no messages', () => {
    expect(extractAssistantTurns({ messages: [] })).toEqual([]);
  });

  it('returns [] for null input', () => {
    expect(extractAssistantTurns(null)).toEqual([]);
  });

  it('returns [] for chat without messages property', () => {
    expect(extractAssistantTurns({})).toEqual([]);
  });
});
