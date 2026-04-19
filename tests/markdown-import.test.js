import { describe, it, expect } from 'vitest';
import { parseMarkdownImport, parseFrontmatter } from '../src/lib/io/markdown-import.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

/** A bAInder v1 export (round-trip format). */
const BAINDER_V1 = [
  '---',
  'title: "Refactoring strategies"',
  'source: chatgpt',
  'url: https://chat.openai.com/c/abc123',
  'date: 2026-01-15T10:00:00.000Z',
  'messageCount: 4',
  'contentFormat: markdown-v1',
  '---',
  '',
  '### User',
  'How should I refactor this module?',
  '',
  '### Assistant',
  'Start by identifying seams in the code.',
  '',
  '### User',
  'What about tests?',
  '',
  '### Assistant',
  'Write characterisation tests before refactoring.',
].join('\n');

/** VS Code Copilot Chat export — bold role labels. */
const BOLD_ROLES = [
  '# VS Code Copilot Chat Session',
  '',
  '**You**',
  '',
  'How do I set up a Vite project?',
  '',
  '**Copilot**',
  '',
  'Run `npm create vite@latest` and follow the prompts.',
  '',
  '**You**',
  '',
  'What template should I choose?',
  '',
  '**Copilot**',
  '',
  'Choose the "vanilla" template for a plain JS project.',
].join('\n');

/** Heading role labels. */
const HEADING_ROLES = [
  '## User',
  '',
  'Explain async/await in JavaScript.',
  '',
  '## Assistant',
  '',
  'Async/await is syntactic sugar over Promises.',
  '',
  '## User',
  '',
  'Give me an example.',
  '',
  '## Assistant',
  '',
  '`async function fetchData() { const r = await fetch(url); }`',
].join('\n');

/** Blockquote role labels. */
const BLOCKQUOTE_ROLES = [
  '> Human:',
  '',
  'What is the capital of France?',
  '',
  '> Assistant:',
  '',
  'The capital of France is Paris.',
].join('\n');

/** HR-separated alternating sections. */
const HR_SECTIONS = [
  'What is a closure in JavaScript?',
  '',
  '---',
  '',
  'A closure is a function that retains access to its lexical scope.',
  '',
  '---',
  '',
  'Can you give an example?',
  '',
  '---',
  '',
  'Sure: `function outer() { let x = 1; return () => x; }`',
].join('\n');

/** Plain prose — no structure. */
const SINGLE_BLOCK = [
  '# Notes on databases',
  '',
  'Indexes speed up read queries but slow down writes.',
  'Choose them based on your workload.',
].join('\n');

/** Empty input. */
const EMPTY = '';

// ─── parseFrontmatter ─────────────────────────────────────────────────────────

describe('parseFrontmatter', () => {
  it('parses all standard fields', () => {
    const fm = parseFrontmatter(BAINDER_V1);
    expect(fm.title).toBe('Refactoring strategies');
    expect(fm.source).toBe('chatgpt');
    expect(fm.url).toBe('https://chat.openai.com/c/abc123');
    expect(fm.date).toBe('2026-01-15T10:00:00.000Z');
    expect(fm.messageCount).toBe(4);
    expect(fm.contentFormat).toBe('markdown-v1');
  });

  it('returns empty object when no frontmatter', () => {
    const fm = parseFrontmatter(SINGLE_BLOCK);
    expect(fm).toEqual({});
  });

  it('returns empty object for empty input', () => {
    expect(parseFrontmatter('')).toEqual({});
    expect(parseFrontmatter(null)).toEqual({});
  });

  it('handles escaped quotes in title', () => {
    const md = '---\ntitle: "He said \\"hello\\""\n---\n';
    const fm = parseFrontmatter(md);
    expect(fm.title).toBe('He said "hello"');
  });
});

// ─── parseMarkdownImport — format detection ───────────────────────────────────

describe('parseMarkdownImport — bAInder v1 round-trip', () => {
  it('detects bainder-v1 format', () => {
    const result = parseMarkdownImport(BAINDER_V1, 'chat.md');
    expect(result.detectedFormat).toBe('bainder-v1');
  });

  it('extracts 4 messages with correct roles', () => {
    const result = parseMarkdownImport(BAINDER_V1);
    expect(result.messages).toHaveLength(4);
    expect(result.messages[0].role).toBe('user');
    expect(result.messages[1].role).toBe('assistant');
    expect(result.messages[2].role).toBe('user');
    expect(result.messages[3].role).toBe('assistant');
  });

  it('preserves message content', () => {
    const result = parseMarkdownImport(BAINDER_V1);
    expect(result.messages[0].content).toBe('How should I refactor this module?');
    expect(result.messages[1].content).toBe('Start by identifying seams in the code.');
  });

  it('restores frontmatter metadata (title, source, url)', () => {
    const result = parseMarkdownImport(BAINDER_V1, 'chat.md');
    expect(result.title).toBe('Refactoring strategies');
    expect(result.source).toBe('chatgpt');
    expect(result.url).toBe('https://chat.openai.com/c/abc123');
  });

  it('restores timestamp from date field', () => {
    const result = parseMarkdownImport(BAINDER_V1);
    expect(result.timestamp).toBe(new Date('2026-01-15T10:00:00.000Z').getTime());
  });
});

describe('parseMarkdownImport — bold role labels (VS Code Copilot style)', () => {
  it('detects bold-roles format', () => {
    const result = parseMarkdownImport(BOLD_ROLES, 'copilot-session.md');
    expect(result.detectedFormat).toBe('bold-roles');
  });

  it('extracts 4 messages with correct roles', () => {
    const result = parseMarkdownImport(BOLD_ROLES);
    expect(result.messages).toHaveLength(4);
    expect(result.messages[0].role).toBe('user');
    expect(result.messages[1].role).toBe('assistant');
    expect(result.messages[2].role).toBe('user');
    expect(result.messages[3].role).toBe('assistant');
  });

  it('preserves message content', () => {
    const result = parseMarkdownImport(BOLD_ROLES);
    expect(result.messages[0].content).toBe('How do I set up a Vite project?');
    expect(result.messages[1].content).toBe('Run `npm create vite@latest` and follow the prompts.');
  });

  it('falls back to filename for title when no frontmatter H1', () => {
    // Use a fixture with no H1 so the filename is the only title source
    const noH1 = '**You**\n\nhello\n\n**Copilot**\n\nworld';
    const result = parseMarkdownImport(noH1, 'copilot-session.md');
    expect(result.title).toBe('copilot session');
  });

  it('defaults source to "external" when no frontmatter', () => {
    const result = parseMarkdownImport(BOLD_ROLES);
    expect(result.source).toBe('external');
  });
});

describe('parseMarkdownImport — heading role labels', () => {
  it('detects heading-roles format', () => {
    const result = parseMarkdownImport(HEADING_ROLES);
    expect(result.detectedFormat).toBe('heading-roles');
  });

  it('extracts 4 messages with correct roles', () => {
    const result = parseMarkdownImport(HEADING_ROLES);
    expect(result.messages).toHaveLength(4);
    expect(result.messages[0].role).toBe('user');
    expect(result.messages[1].role).toBe('assistant');
    expect(result.messages[2].role).toBe('user');
    expect(result.messages[3].role).toBe('assistant');
  });

  it('preserves message content', () => {
    const result = parseMarkdownImport(HEADING_ROLES);
    expect(result.messages[0].content).toBe('Explain async/await in JavaScript.');
    expect(result.messages[1].content).toBe('Async/await is syntactic sugar over Promises.');
  });
});

describe('parseMarkdownImport — blockquote role labels', () => {
  it('detects blockquote-roles format', () => {
    const result = parseMarkdownImport(BLOCKQUOTE_ROLES);
    expect(result.detectedFormat).toBe('blockquote-roles');
  });

  it('extracts 2 messages with correct roles', () => {
    const result = parseMarkdownImport(BLOCKQUOTE_ROLES);
    expect(result.messages).toHaveLength(2);
    expect(result.messages[0].role).toBe('user');
    expect(result.messages[1].role).toBe('assistant');
  });

  it('preserves message content', () => {
    const result = parseMarkdownImport(BLOCKQUOTE_ROLES);
    expect(result.messages[0].content).toBe('What is the capital of France?');
    expect(result.messages[1].content).toBe('The capital of France is Paris.');
  });
});

describe('parseMarkdownImport — HR-separated alternating sections', () => {
  it('detects alternating-sections format', () => {
    const result = parseMarkdownImport(HR_SECTIONS);
    expect(result.detectedFormat).toBe('alternating-sections');
  });

  it('extracts 4 messages alternating user/assistant', () => {
    const result = parseMarkdownImport(HR_SECTIONS);
    expect(result.messages).toHaveLength(4);
    expect(result.messages[0].role).toBe('user');
    expect(result.messages[1].role).toBe('assistant');
    expect(result.messages[2].role).toBe('user');
    expect(result.messages[3].role).toBe('assistant');
  });
});

describe('parseMarkdownImport — single block fallback', () => {
  it('detects single-block format', () => {
    const result = parseMarkdownImport(SINGLE_BLOCK);
    expect(result.detectedFormat).toBe('single-block');
  });

  it('produces a single assistant message with the full body', () => {
    const result = parseMarkdownImport(SINGLE_BLOCK);
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].role).toBe('assistant');
    expect(result.messages[0].content).toContain('Indexes speed up read queries');
  });

  it('extracts title from first H1 heading', () => {
    const result = parseMarkdownImport(SINGLE_BLOCK);
    expect(result.title).toBe('Notes on databases');
  });
});

// ─── Edge cases ───────────────────────────────────────────────────────────────

describe('parseMarkdownImport — edge cases', () => {
  it('returns safe defaults for empty input', () => {
    const result = parseMarkdownImport(EMPTY, 'my-file.md', 1234567890000);
    expect(result.messages).toEqual([]);
    expect(result.title).toBe('my file');
    expect(result.source).toBe('external');
    expect(result.url).toBe('');
    expect(result.timestamp).toBe(1234567890000);
  });

  it('uses "Imported chat" when no title sources are available', () => {
    const result = parseMarkdownImport(EMPTY, '', 0);
    expect(result.title).toBe('Imported chat');
  });

  it('uses fileLastModified for timestamp when no frontmatter date', () => {
    const result = parseMarkdownImport(BOLD_ROLES, 'session.md', 9000000000000);
    expect(result.timestamp).toBe(9000000000000);
  });

  it('filename title strips extension and converts hyphens to spaces', () => {
    // Use a fixture with no H1 so the filename is the only title source
    const noH1 = '**You**\n\nhello\n\n**Copilot**\n\nworld';
    const result = parseMarkdownImport(noH1, 'my-cursor-session.md');
    expect(result.title).toBe('my cursor session');
  });

  it('frontmatter title takes precedence over H1 from body', () => {
    const md = '---\ntitle: "Frontmatter title"\n---\n\n# Body H1\n\nsome text';
    const result = parseMarkdownImport(md);
    expect(result.title).toBe('Frontmatter title');
  });

  it('handles **User** with varying whitespace', () => {
    const md = '**User**  \n\nhello\n\n**Assistant**\n\nworld';
    const result = parseMarkdownImport(md);
    expect(result.detectedFormat).toBe('bold-roles');
    expect(result.messages).toHaveLength(2);
  });

  it('single HR separator does not produce alternating-sections (only 1 section)', () => {
    const md = 'only one section\n\n---\n';
    const result = parseMarkdownImport(md);
    // Only 1 non-empty section, so falls through to single-block
    expect(result.messages).toHaveLength(1);
  });

  it('handles null content gracefully', () => {
    const result = parseMarkdownImport(null, 'test.md');
    expect(result.messages).toEqual([]);
    expect(result.title).toBe('test');
  });
});

// ─── parseFrontmatter – excerpt field ────────────────────────────────────────

describe('parseFrontmatter – excerpt field', () => {
  it('parses excerpt: true as boolean true', () => {
    const md = '---\nexcerpt: true\n---\n\nBody.';
    expect(parseFrontmatter(md).excerpt).toBe(true);
  });

  it('parses excerpt: false as boolean false', () => {
    const md = '---\nexcerpt: false\n---\n\nBody.';
    expect(parseFrontmatter(md).excerpt).toBe(false);
  });
});

// ─── parseMarkdownImport – invalid date fallbacks ─────────────────────────────

describe('parseMarkdownImport – invalid frontmatter date fallbacks', () => {
  const MD_INVALID_DATE = [
    '---',
    'title: "Bad Date Chat"',
    'date: not-a-valid-date',
    '---',
    '',
    '### User',
    'Hello',
    '',
    '### Assistant',
    'World',
  ].join('\n');

  it('falls back to fileLastModified when date is invalid', () => {
    const result = parseMarkdownImport(MD_INVALID_DATE, 'chat.md', 9_000_000_000_000);
    expect(result.timestamp).toBe(9_000_000_000_000);
  });

  it('falls back to Date.now() when date is invalid and fileLastModified is 0', () => {
    const before = Date.now();
    const result = parseMarkdownImport(MD_INVALID_DATE, 'chat.md', 0);
    expect(result.timestamp).toBeGreaterThanOrEqual(before);
  });
});

// ─── parseBainderV1Messages – export footer stripping ────────────────────────

describe('parseMarkdownImport – bAInder v1 export footer stripping', () => {
  it('strips the export footer from the last assistant message', () => {
    const md = [
      '### User',
      'Hello',
      '',
      '### Assistant',
      'World',
      '',
      '---',
      '*Exported from bAInder on 2026-01-01*',
    ].join('\n');
    const result = parseMarkdownImport(md, 'chat.md');
    expect(result.messages).toHaveLength(2);
    expect(result.messages[1].content).not.toContain('Exported from bAInder');
  });

  it('strips the trailing turn separator (---) from message content', () => {
    const md = [
      '### User',
      'Hello',
      '',
      '---',
    ].join('\n');
    const result = parseMarkdownImport(md, 'chat.md');
    expect(result.messages[0].content).not.toMatch(/---\s*$/);
  });
});
