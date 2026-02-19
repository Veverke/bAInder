/**
 * Tests for src/lib/markdown-serialiser.js
 */
import { describe, it, expect } from 'vitest';
import {
  escapeYaml,
  formatRoleLabel,
  formatTimestamp,
  messagesToMarkdown,
  parseFrontmatter,
} from '../src/lib/markdown-serialiser.js';

// ─── escapeYaml ──────────────────────────────────────────────────────────────

describe('escapeYaml', () => {
  it('returns empty string for null/undefined/empty', () => {
    expect(escapeYaml(null)).toBe('');
    expect(escapeYaml(undefined)).toBe('');
    expect(escapeYaml('')).toBe('');
  });

  it('escapes double quotes', () => {
    expect(escapeYaml('say "hello"')).toBe('say \\"hello\\"');
  });

  it('escapes backslashes', () => {
    expect(escapeYaml('C:\\Users\\foo')).toBe('C:\\\\Users\\\\foo');
  });

  it('escapes both in one string', () => {
    expect(escapeYaml('"C:\\path"')).toBe('\\"C:\\\\path\\"');
  });

  it('leaves normal strings unchanged', () => {
    expect(escapeYaml('Hello world')).toBe('Hello world');
  });
});

// ─── formatRoleLabel ─────────────────────────────────────────────────────────

describe('formatRoleLabel', () => {
  it('returns "User" for role user', () => {
    expect(formatRoleLabel('user')).toBe('User');
  });

  it('returns "Assistant" for role assistant', () => {
    expect(formatRoleLabel('assistant')).toBe('Assistant');
  });

  it('capitalises unknown roles', () => {
    expect(formatRoleLabel('system')).toBe('System');
    expect(formatRoleLabel('bot')).toBe('Bot');
  });

  it('returns "Unknown" for empty / falsy', () => {
    expect(formatRoleLabel('')).toBe('Unknown');
    expect(formatRoleLabel(null)).toBe('Unknown');
    expect(formatRoleLabel(undefined)).toBe('Unknown');
  });
});

// ─── formatTimestamp ─────────────────────────────────────────────────────────

describe('formatTimestamp', () => {
  it('returns empty string for null/undefined/0/empty', () => {
    expect(formatTimestamp(null)).toBe('');
    expect(formatTimestamp(undefined)).toBe('');
    expect(formatTimestamp(0)).toBe('');
    expect(formatTimestamp('')).toBe('');
  });

  it('formats a numeric ms timestamp to ISO string', () => {
    const ms = 1_740_000_000_000; // deterministic
    const result = formatTimestamp(ms);
    expect(result).toBe(new Date(ms).toISOString());
  });

  it('accepts an ISO string and round-trips it', () => {
    const iso = '2026-02-20T10:30:00.000Z';
    expect(formatTimestamp(iso)).toBe(iso);
  });

  it('returns empty string for an invalid date string', () => {
    expect(formatTimestamp('not-a-date')).toBe('');
  });
});

// ─── messagesToMarkdown ──────────────────────────────────────────────────────

describe('messagesToMarkdown', () => {
  const minimalMeta = {
    title: 'Test Chat',
    source: 'chatgpt',
    url: 'https://chat.openai.com/c/abc',
    timestamp: 1_740_000_000_000,
  };

  const twoMessages = [
    { role: 'user',      content: 'Hello, world?' },
    { role: 'assistant', content: 'Hi there!'     },
  ];

  it('opens with YAML frontmatter block', () => {
    const md = messagesToMarkdown(twoMessages, minimalMeta);
    expect(md.startsWith('---\n')).toBe(true);
  });

  it('includes title in frontmatter', () => {
    const md = messagesToMarkdown(twoMessages, minimalMeta);
    expect(md).toContain('title: "Test Chat"');
  });

  it('includes source in frontmatter', () => {
    const md = messagesToMarkdown(twoMessages, minimalMeta);
    expect(md).toContain('source: chatgpt');
  });

  it('includes url in frontmatter', () => {
    const md = messagesToMarkdown(twoMessages, minimalMeta);
    expect(md).toContain('url: https://chat.openai.com/c/abc');
  });

  it('includes date in frontmatter', () => {
    const md = messagesToMarkdown(twoMessages, minimalMeta);
    expect(md).toContain(`date: ${new Date(1_740_000_000_000).toISOString()}`);
  });

  it('includes messageCount in frontmatter', () => {
    const md = messagesToMarkdown(twoMessages, minimalMeta);
    expect(md).toContain('messageCount: 2');
  });

  it('includes contentFormat tag in frontmatter', () => {
    const md = messagesToMarkdown(twoMessages, minimalMeta);
    expect(md).toContain('contentFormat: markdown-v1');
  });

  it('omits url line when url is empty', () => {
    const md = messagesToMarkdown(twoMessages, { ...minimalMeta, url: '' });
    expect(md).not.toContain('url:');
  });

  it('omits date line when timestamp is missing', () => {
    const md = messagesToMarkdown(twoMessages, { ...minimalMeta, timestamp: null });
    expect(md).not.toContain('date:');
  });

  it('does NOT include excerpt flag for normal chats', () => {
    const md = messagesToMarkdown(twoMessages, minimalMeta);
    expect(md).not.toContain('excerpt:');
  });

  it('includes excerpt flag when isExcerpt is true', () => {
    const md = messagesToMarkdown([], { ...minimalMeta, isExcerpt: true });
    expect(md).toContain('excerpt: true');
  });

  it('includes a level-1 title heading', () => {
    const md = messagesToMarkdown(twoMessages, minimalMeta);
    expect(md).toContain('\n# Test Chat\n');
  });

  it('renders bold role labels', () => {
    const md = messagesToMarkdown(twoMessages, minimalMeta);
    expect(md).toContain('**User**');
    expect(md).toContain('**Assistant**');
  });

  it('renders message content', () => {
    const md = messagesToMarkdown(twoMessages, minimalMeta);
    expect(md).toContain('Hello, world?');
    expect(md).toContain('Hi there!');
  });

  it('places a horizontal rule between turns', () => {
    const md = messagesToMarkdown(twoMessages, minimalMeta);
    // Should have at least one --- divider in the body (after frontmatter)
    const body = md.slice(md.indexOf('\n---\n', 3) + 5); // skip frontmatter close
    expect(body).toContain('\n---\n');
  });

  it('does NOT place a divider after the last turn', () => {
    const md = messagesToMarkdown(twoMessages, minimalMeta);
    // The document should not end with a --- line
    const trimmed = md.trimEnd();
    expect(trimmed.endsWith('---')).toBe(false);
  });

  it('handles a single message with no trailing divider', () => {
    const md = messagesToMarkdown([{ role: 'user', content: 'Just me' }], minimalMeta);
    expect(md).toContain('Just me');
    const body = md.slice(md.indexOf('\n---\n', 3) + 5);
    expect(body.trim().endsWith('---')).toBe(false);
  });

  it('handles empty messages array gracefully', () => {
    const md = messagesToMarkdown([], minimalMeta);
    expect(md).toContain('# Test Chat');
    // No role labels
    expect(md).not.toContain('**User**');
  });

  it('handles null messages gracefully', () => {
    const md = messagesToMarkdown(null, minimalMeta);
    expect(md).toContain('# Test Chat');
  });

  it('uses "Untitled Chat" when title is missing', () => {
    const md = messagesToMarkdown([], {});
    expect(md).toContain('title: "Untitled Chat"');
    expect(md).toContain('# Untitled Chat');
  });

  it('uses "unknown" source when source is missing', () => {
    const md = messagesToMarkdown([], {});
    expect(md).toContain('source: unknown');
  });

  it('escapes double-quotes in title inside frontmatter', () => {
    const md = messagesToMarkdown([], { title: 'A "special" title', source: 'claude' });
    expect(md).toContain('title: "A \\"special\\" title"');
  });

  it('uses meta.messageCount override when provided', () => {
    const md = messagesToMarkdown(twoMessages, { ...minimalMeta, messageCount: 99 });
    expect(md).toContain('messageCount: 99');
  });

  it('infers messageCount from messages array when not provided', () => {
    const md = messagesToMarkdown(twoMessages, { ...minimalMeta, messageCount: undefined });
    expect(md).toContain('messageCount: 2');
  });

  it('renders unknown role with capitalised label', () => {
    const md = messagesToMarkdown([{ role: 'system', content: 'Setup' }], minimalMeta);
    expect(md).toContain('**System**');
  });

  it('handles messages with empty content', () => {
    const md = messagesToMarkdown([{ role: 'user', content: '' }], minimalMeta);
    expect(md).toContain('**User**');
    // Should not throw or omit the turn
  });

  it('renders body text below the title when messages is empty', () => {
    const md = messagesToMarkdown([], { ...minimalMeta, body: 'Selected excerpt text' });
    expect(md).toContain('Selected excerpt text');
    expect(md).not.toContain('**User**');
  });

  it('does not render body when messages array is non-empty', () => {
    const md = messagesToMarkdown(twoMessages, { ...minimalMeta, body: 'ignored body' });
    // body should be ignored when there are real messages
    expect(md).toContain('**User**');
  });
});

// ─── parseFrontmatter ────────────────────────────────────────────────────────

describe('parseFrontmatter', () => {
  it('returns {} for null/undefined/empty', () => {
    expect(parseFrontmatter(null)).toEqual({});
    expect(parseFrontmatter(undefined)).toEqual({});
    expect(parseFrontmatter('')).toEqual({});
  });

  it('returns {} when no frontmatter block present', () => {
    expect(parseFrontmatter('# Just a heading\n\nSome text')).toEqual({});
  });

  it('returns {} when closing --- is missing', () => {
    expect(parseFrontmatter('---\ntitle: "Foo"\n')).toEqual({});
  });

  it('round-trips a full messagesToMarkdown output', () => {
    const meta = {
      title: 'Round Trip Test',
      source: 'claude',
      url: 'https://claude.ai/chat/123',
      timestamp: 1_740_000_000_000,
      messageCount: 4,
    };
    const md = messagesToMarkdown([], meta);
    const parsed = parseFrontmatter(md);

    expect(parsed.title).toBe('Round Trip Test');
    expect(parsed.source).toBe('claude');
    expect(parsed.url).toBe('https://claude.ai/chat/123');
    expect(parsed.date).toBe(new Date(1_740_000_000_000).toISOString());
    expect(parsed.messageCount).toBe(4);
    expect(parsed.contentFormat).toBe('markdown-v1');
  });

  it('round-trips a title containing escaped double-quotes', () => {
    const md = messagesToMarkdown([], { title: 'Say "hello"', source: 'gemini' });
    const parsed = parseFrontmatter(md);
    expect(parsed.title).toBe('Say "hello"');
  });

  it('parses excerpt flag as boolean true', () => {
    const md = messagesToMarkdown([], { title: 'X', source: 'copilot', isExcerpt: true });
    const parsed = parseFrontmatter(md);
    expect(parsed.excerpt).toBe(true);
  });

  it('omits excerpt key when not an excerpt', () => {
    const md = messagesToMarkdown([], { title: 'X', source: 'copilot' });
    const parsed = parseFrontmatter(md);
    expect(parsed.excerpt).toBeUndefined();
  });

  it('parses messageCount as a number', () => {
    const md = messagesToMarkdown([], { title: 'X', source: 'chatgpt', messageCount: 7 });
    const parsed = parseFrontmatter(md);
    expect(parsed.messageCount).toBe(7);
    expect(typeof parsed.messageCount).toBe('number');
  });
});
