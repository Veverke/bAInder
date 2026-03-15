/**
 * tests/extractors/tool-calls.test.js — Task C.1
 */
import { describe, it, expect } from 'vitest';
import { extractToolCalls } from '../../src/lib/entities/extractors/tool-calls.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function msg(overrides) {
  return { role: 'assistant', index: 0, content: '', ...overrides };
}

// ---------------------------------------------------------------------------
// Structured strategy — role === 'tool'
// ---------------------------------------------------------------------------

describe('extractToolCalls() — structured: role "tool"', () => {
  it('message with role "tool" → entity with input/output populated', () => {
    const messages = [
      msg({ role: 'tool', name: 'web_search', input: 'AI news', content: 'Result text', index: 1 }),
    ];
    const result = extractToolCalls(messages, null, 'chat-1');
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('toolCall');
    expect(result[0].tool).toBe('web_search');
    expect(result[0].input).toBe('AI news');
    expect(result[0].output).toBe('Result text');
  });

  it('role "tool" without a name → tool "unknown"', () => {
    const messages = [msg({ role: 'tool', content: 'some output', index: 2 })];
    const result = extractToolCalls(messages, null, 'chat-1');
    expect(result).toHaveLength(1);
    expect(result[0].tool).toBe('unknown');
  });

  it('chatId is stamped on each entity', () => {
    const messages = [msg({ role: 'tool', content: 'x', index: 0 })];
    const result = extractToolCalls(messages, null, 'chat-xyz');
    expect(result[0].chatId).toBe('chat-xyz');
  });

  it('messageIndex is taken from message.index', () => {
    const messages = [msg({ role: 'tool', content: 'x', index: 5 })];
    const result = extractToolCalls(messages, null, 'chat-1');
    expect(result[0].messageIndex).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// Structured strategy — type === 'tool_use' (Claude)
// ---------------------------------------------------------------------------

describe('extractToolCalls() — structured: type "tool_use"', () => {
  it('message with type "tool_use" and name "web_search" → entity with tool "web_search"', () => {
    const messages = [
      msg({ type: 'tool_use', name: 'web_search', input: 'latest AI', index: 2 }),
    ];
    const result = extractToolCalls(messages, null, 'chat-1');
    expect(result).toHaveLength(1);
    expect(result[0].tool).toBe('web_search');
    expect(result[0].input).toBe('latest AI');
  });

  it('type "tool_use" with code interpreter name → tool "code_interpreter"', () => {
    const messages = [
      msg({ type: 'tool_use', name: 'code_interpreter', input: 'print(42)', index: 3 }),
    ];
    const result = extractToolCalls(messages, null, 'chat-1');
    expect(result[0].tool).toBe('code_interpreter');
  });
});

// ---------------------------------------------------------------------------
// Structured strategy — type === 'tool_result' (Claude)
// ---------------------------------------------------------------------------

describe('extractToolCalls() — structured: type "tool_result"', () => {
  it('message with type "tool_result" → entity with output populated', () => {
    const messages = [
      msg({ type: 'tool_result', content: 'Tool execution result', index: 4 }),
    ];
    const result = extractToolCalls(messages, null, 'chat-1');
    expect(result).toHaveLength(1);
    expect(result[0].output).toBe('Tool execution result');
  });
});

// ---------------------------------------------------------------------------
// Truncation
// ---------------------------------------------------------------------------

describe('extractToolCalls() — output truncation', () => {
  it('output longer than 10 000 chars is truncated', () => {
    const longOutput = 'x'.repeat(15_000);
    const messages = [
      msg({ role: 'tool', content: longOutput, index: 0 }),
    ];
    const result = extractToolCalls(messages, null, 'chat-1');
    expect(result[0].output.length).toBeLessThan(15_000);
    expect(result[0].output).toMatch(/…$/);
  });

  it('output exactly 10 000 chars is NOT truncated', () => {
    const exactOutput = 'y'.repeat(10_000);
    const messages = [msg({ role: 'tool', content: exactOutput, index: 0 })];
    const result = extractToolCalls(messages, null, 'chat-1');
    expect(result[0].output).toBe(exactOutput);
  });
});

// ---------------------------------------------------------------------------
// No-match cases
// ---------------------------------------------------------------------------

describe('extractToolCalls() — no tool messages', () => {
  it('regular user+assistant messages → empty result', () => {
    const messages = [
      msg({ role: 'user', content: 'Hello', index: 0 }),
      msg({ role: 'assistant', content: 'Hi there!', index: 1 }),
    ];
    expect(extractToolCalls(messages, null, 'chat-1')).toHaveLength(0);
  });

  it('empty messages array → empty result', () => {
    expect(extractToolCalls([], null, 'chat-1')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Heuristic prose scan (fallback when no structured messages found)
// ---------------------------------------------------------------------------

describe('extractToolCalls() — heuristic prose scan', () => {
  it('"Web search:" prose pattern → entity with tool "web_search"', () => {
    const messages = [
      msg({ role: 'assistant', content: '> Web search: AI progress in 2025\n\nResults here.', index: 1 }),
    ];
    const result = extractToolCalls(messages, null, 'chat-1');
    expect(result).toHaveLength(1);
    expect(result[0].tool).toBe('web_search');
    expect(result[0].input).toBeTruthy();
  });

  it('"Ran code:" prose pattern → entity with tool "code_interpreter"', () => {
    const messages = [
      msg({ role: 'assistant', content: '> Ran code: print("hello")\n\nOutput: hello', index: 2 }),
    ];
    const result = extractToolCalls(messages, null, 'chat-1');
    expect(result).toHaveLength(1);
    expect(result[0].tool).toBe('code_interpreter');
  });

  it('doc being null does not throw during prose scan', () => {
    const messages = [msg({ role: 'assistant', content: 'No tool usage here.', index: 0 })];
    expect(() => extractToolCalls(messages, null, 'chat-1')).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Tool name normalisation
// ---------------------------------------------------------------------------

describe('extractToolCalls() — tool name normalisation', () => {
  it('"python" maps to "code_interpreter"', () => {
    const messages = [msg({ type: 'tool_use', name: 'python', input: '', index: 0 })];
    const result = extractToolCalls(messages, null, 'chat-1');
    expect(result[0].tool).toBe('code_interpreter');
  });

  it('"browser" maps to "browser"', () => {
    const messages = [msg({ role: 'tool', name: 'browser', content: '', index: 0 })];
    const result = extractToolCalls(messages, null, 'chat-1');
    expect(result[0].tool).toBe('browser');
  });
});
