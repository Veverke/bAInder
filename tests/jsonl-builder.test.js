/**
 * jsonl-builder.test.js
 *
 * Comprehensive unit tests for src/lib/export/jsonl-builder.js.
 *
 * Covers buildFineTuningJsonl() and buildFineTuningJsonlMulti().
 * No external mocks needed — the module is pure JS.
 */

import { describe, it, expect } from 'vitest';
import { buildFineTuningJsonl, buildFineTuningJsonlMulti } from '../src/lib/export/jsonl-builder.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const simpleChat = {
  id: 'chat-1',
  title: 'Simple Chat',
  messages: [
    { role: 'user', content: 'Hello' },
    { role: 'assistant', content: 'Hi there!' },
  ],
};

const multiTurnChat = {
  id: 'chat-2',
  title: 'Multi Turn',
  messages: [
    { role: 'user', content: 'Turn 1 user' },
    { role: 'assistant', content: 'Turn 1 assistant' },
    { role: 'user', content: 'Turn 2 user' },
    { role: 'assistant', content: 'Turn 2 assistant' },
    { role: 'user', content: 'Turn 3 user' },
    { role: 'assistant', content: 'Turn 3 assistant' },
  ],
};

const mixedRolesChat = {
  id: 'chat-3',
  title: 'Mixed Roles',
  messages: [
    { role: 'system', content: 'System prompt' },
    { role: 'user', content: 'User message' },
    { role: 'tool', content: 'Tool response' },
    { role: 'function', content: 'Function result' },
    { role: 'assistant', content: 'Assistant reply' },
  ],
};

const emptyMessagesChat = {
  id: 'chat-4',
  title: 'Empty Messages',
  messages: [],
};

const onlySystemChat = {
  id: 'chat-5',
  title: 'Only System',
  messages: [
    { role: 'system', content: 'Only a system message' },
    { role: 'tool', content: 'Tool only' },
  ],
};

// ─── buildFineTuningJsonl ─────────────────────────────────────────────────────

describe('buildFineTuningJsonl', () => {
  it('returns a valid JSON line for a chat with user+assistant messages', () => {
    const result = buildFineTuningJsonl(simpleChat);
    expect(typeof result).toBe('string');
    expect(result).not.toBe('');
    expect(() => JSON.parse(result)).not.toThrow();
  });

  it('the parsed line has messages array with correct roles and content', () => {
    const result = buildFineTuningJsonl(simpleChat);
    const parsed = JSON.parse(result);
    expect(parsed).toHaveProperty('messages');
    expect(Array.isArray(parsed.messages)).toBe(true);
    expect(parsed.messages).toHaveLength(2);
    expect(parsed.messages[0]).toEqual({ role: 'user', content: 'Hello' });
    expect(parsed.messages[1]).toEqual({ role: 'assistant', content: 'Hi there!' });
  });

  it('includes a system message when options.systemMessage is provided', () => {
    const result = buildFineTuningJsonl(simpleChat, { systemMessage: 'You are a helpful assistant.' });
    const parsed = JSON.parse(result);
    expect(parsed.messages[0]).toEqual({ role: 'system', content: 'You are a helpful assistant.' });
    expect(parsed.messages).toHaveLength(3);
  });

  it('does NOT include a system message when options.systemMessage is empty string', () => {
    const result = buildFineTuningJsonl(simpleChat, { systemMessage: '' });
    const parsed = JSON.parse(result);
    expect(parsed.messages.some((m) => m.role === 'system')).toBe(false);
    expect(parsed.messages).toHaveLength(2);
  });

  it('does NOT include a system message when options.systemMessage is absent', () => {
    const result = buildFineTuningJsonl(simpleChat);
    const parsed = JSON.parse(result);
    expect(parsed.messages.some((m) => m.role === 'system')).toBe(false);
  });

  it("skips messages with roles other than 'user' and 'assistant'", () => {
    const result = buildFineTuningJsonl(mixedRolesChat);
    const parsed = JSON.parse(result);
    const roles = parsed.messages.map((m) => m.role);
    expect(roles).not.toContain('system');
    expect(roles).not.toContain('tool');
    expect(roles).not.toContain('function');
    expect(parsed.messages).toHaveLength(2);
    expect(parsed.messages[0]).toEqual({ role: 'user', content: 'User message' });
    expect(parsed.messages[1]).toEqual({ role: 'assistant', content: 'Assistant reply' });
  });

  it("returns '' when chat.messages is empty after filtering", () => {
    expect(buildFineTuningJsonl(emptyMessagesChat)).toBe('');
  });

  it("returns '' when all messages have non-user/assistant roles after filtering", () => {
    expect(buildFineTuningJsonl(onlySystemChat)).toBe('');
  });

  it("returns '' when chat.messages is undefined", () => {
    expect(buildFineTuningJsonl({ id: 'x', title: 'x', messages: undefined })).toBe('');
  });

  it("returns '' when chat.messages is null", () => {
    expect(buildFineTuningJsonl({ id: 'x', title: 'x', messages: null })).toBe('');
  });

  it("returns '' when chat itself is null", () => {
    expect(buildFineTuningJsonl(null)).toBe('');
  });

  it("returns '' when chat itself is undefined", () => {
    expect(buildFineTuningJsonl(undefined)).toBe('');
  });

  it('handles a chat with multiple alternating user/assistant turns in a single JSON line', () => {
    const result = buildFineTuningJsonl(multiTurnChat);
    // Must be exactly one line (no newlines in output)
    expect(result.includes('\n')).toBe(false);
    const parsed = JSON.parse(result);
    expect(parsed.messages).toHaveLength(6);
    expect(parsed.messages[0]).toEqual({ role: 'user', content: 'Turn 1 user' });
    expect(parsed.messages[5]).toEqual({ role: 'assistant', content: 'Turn 3 assistant' });
  });

  it('correctly JSON-serialises content with special characters (quotes, newlines, Unicode)', () => {
    const specialChat = {
      id: 'special',
      title: 'Special Chars',
      messages: [
        { role: 'user', content: 'He said "hello"\nand then left. \u4e2d\u6587' },
        { role: 'assistant', content: 'Reply with backslash: c:\\path\\to\\file' },
      ],
    };
    const result = buildFineTuningJsonl(specialChat);
    expect(() => JSON.parse(result)).not.toThrow();
    const parsed = JSON.parse(result);
    expect(parsed.messages[0].content).toBe('He said "hello"\nand then left. \u4e2d\u6587');
    expect(parsed.messages[1].content).toBe('Reply with backslash: c:\\path\\to\\file');
  });
});

// ─── buildFineTuningJsonlMulti ────────────────────────────────────────────────

describe('buildFineTuningJsonlMulti', () => {
  it('returns a JSONL string with one line per chat', () => {
    const result = buildFineTuningJsonlMulti([simpleChat, multiTurnChat]);
    const lines = result.split('\n');
    expect(lines).toHaveLength(2);
  });

  it('each line parses as valid JSON with a messages array', () => {
    const result = buildFineTuningJsonlMulti([simpleChat, multiTurnChat]);
    for (const line of result.split('\n')) {
      const parsed = JSON.parse(line);
      expect(parsed).toHaveProperty('messages');
      expect(Array.isArray(parsed.messages)).toBe(true);
    }
  });

  it('skips chats that produce an empty line and does not emit blank lines', () => {
    const result = buildFineTuningJsonlMulti([simpleChat, emptyMessagesChat, multiTurnChat]);
    const lines = result.split('\n');
    expect(lines).toHaveLength(2);
    for (const line of lines) {
      expect(line).not.toBe('');
    }
  });

  it("returns '' for an empty chats array", () => {
    expect(buildFineTuningJsonlMulti([])).toBe('');
  });

  it("returns '' when chats is null", () => {
    expect(buildFineTuningJsonlMulti(null)).toBe('');
  });

  it("returns '' when chats is undefined", () => {
    expect(buildFineTuningJsonlMulti(undefined)).toBe('');
  });

  it('passes systemMessage option through to each line', () => {
    const result = buildFineTuningJsonlMulti([simpleChat, multiTurnChat], {
      systemMessage: 'Be concise.',
    });
    for (const line of result.split('\n')) {
      const parsed = JSON.parse(line);
      expect(parsed.messages[0]).toEqual({ role: 'system', content: 'Be concise.' });
    }
  });

  it('a single chat array produces output identical to buildFineTuningJsonl for that chat', () => {
    const multi = buildFineTuningJsonlMulti([simpleChat]);
    const single = buildFineTuningJsonl(simpleChat);
    expect(multi).toBe(single);
  });
});

// ─── prettyPrint option ───────────────────────────────────────────────────────

describe('prettyPrint option', () => {
  describe('buildFineTuningJsonl with prettyPrint: true', () => {
    it('returns multi-line JSON when prettyPrint is true', () => {
      const result = buildFineTuningJsonl(simpleChat, { prettyPrint: true });
      expect(result.includes('\n')).toBe(true);
    });

    it('still parses to the same data as compact mode', () => {
      const compact = JSON.parse(buildFineTuningJsonl(simpleChat));
      const pretty  = JSON.parse(buildFineTuningJsonl(simpleChat, { prettyPrint: true }));
      expect(pretty).toEqual(compact);
    });

    it('uses 2-space indentation', () => {
      const result = buildFineTuningJsonl(simpleChat, { prettyPrint: true });
      expect(result).toContain('  "messages"');
    });

    it('returns compact JSON when prettyPrint is false', () => {
      const result = buildFineTuningJsonl(simpleChat, { prettyPrint: false });
      expect(result.includes('\n')).toBe(false);
    });

    it('returns compact JSON when prettyPrint is absent', () => {
      const result = buildFineTuningJsonl(simpleChat);
      expect(result.includes('\n')).toBe(false);
    });
  });

  describe('buildFineTuningJsonlMulti with prettyPrint: true', () => {
    it('separates records with a blank line between them', () => {
      const result = buildFineTuningJsonlMulti([simpleChat, multiTurnChat], { prettyPrint: true });
      expect(result.includes('\n\n')).toBe(true);
    });

    it('each record still parses as valid JSON', () => {
      const result = buildFineTuningJsonlMulti([simpleChat, multiTurnChat], { prettyPrint: true });
      // split on the blank-line separator
      const blocks = result.split('\n\n');
      expect(blocks).toHaveLength(2);
      for (const block of blocks) {
        expect(() => JSON.parse(block)).not.toThrow();
      }
    });

    it('compact mode joins with single newline', () => {
      const result = buildFineTuningJsonlMulti([simpleChat, multiTurnChat]);
      const lines = result.split('\n');
      expect(lines).toHaveLength(2);
      expect(result.includes('\n\n')).toBe(false);
    });
  });
});
