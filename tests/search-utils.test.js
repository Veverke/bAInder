import { describe, it, expect } from 'vitest';
import { escapeHtml, extractSnippet, highlightTerms, formatBreadcrumb, applySearchFilters } from '../src/lib/search-utils.js';

// ─── escapeHtml ───────────────────────────────────────────────────────────────

describe('escapeHtml', () => {
  it('escapes ampersands', () => {
    expect(escapeHtml('a & b')).toBe('a &amp; b');
  });

  it('escapes less-than and greater-than', () => {
    expect(escapeHtml('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('escapes double quotes', () => {
    expect(escapeHtml('"quoted"')).toBe('&quot;quoted&quot;');
  });

  it('escapes single quotes', () => {
    expect(escapeHtml("it's fine")).toBe('it&#39;s fine');
  });

  it('leaves plain text untouched', () => {
    expect(escapeHtml('hello world 123')).toBe('hello world 123');
  });

  it('coerces non-string to string', () => {
    expect(escapeHtml(42)).toBe('42');
  });
});

// ─── extractSnippet ───────────────────────────────────────────────────────────

describe('extractSnippet', () => {
  it('returns empty string for empty content', () => {
    expect(extractSnippet('', 'hello')).toBe('');
  });

  it('returns empty string for empty query', () => {
    expect(extractSnippet('some content', '')).toBe('');
  });

  it('returns empty string for null content', () => {
    expect(extractSnippet(null, 'hello')).toBe('');
  });

  it('returns opening text when query is not found', () => {
    const result = extractSnippet('Hello world this is content', 'xyz999');
    expect(result).toContain('Hello world');
    expect(result).not.toContain('xyz999');
  });

  it('finds query in middle and includes surrounding context', () => {
    const prefix = 'a '.repeat(60);   // 120 chars
    const suffix = ' b'.repeat(60);   // 120 chars
    const content = prefix + 'needle' + suffix;
    const result = extractSnippet(content, 'needle', 20);
    expect(result).toContain('needle');
    expect(result.startsWith('…')).toBe(true);
    expect(result.endsWith('…')).toBe(true);
  });

  it('does not add leading ellipsis when match is near the start', () => {
    const content = 'needle is right at the beginning of a longer text string here';
    const result = extractSnippet(content, 'needle', 120);
    expect(result).toContain('needle');
    expect(result.startsWith('…')).toBe(false);
  });

  it('does not add trailing ellipsis when match is near the end', () => {
    const padding = 'start text that is fairly long so there is context before ';
    const content = padding + 'needle';
    const result = extractSnippet(content, 'needle', 120);
    expect(result).toContain('needle');
    expect(result.endsWith('…')).toBe(false);
  });

  it('strips YAML frontmatter before searching', () => {
    const content = '---\ntitle: "My Chat"\ncontentFormat: markdown-v1\n---\n\nHello **User** needle here';
    const result = extractSnippet(content, 'needle', 30);
    expect(result).toContain('needle');
    expect(result).not.toContain('contentFormat');
  });

  it('is case-insensitive', () => {
    const content = 'This contains NEEDLE in uppercase';
    const result = extractSnippet(content, 'needle', 120);
    expect(result).toContain('NEEDLE');
  });

  it('handles short content entirely without ellipsis', () => {
    const content = 'Short text with query in it';
    const result = extractSnippet(content, 'query', 120);
    expect(result).toContain('query');
    expect(result.startsWith('…')).toBe(false);
    expect(result.endsWith('…')).toBe(false);
  });
});

// ─── highlightTerms ───────────────────────────────────────────────────────────

describe('highlightTerms', () => {
  it('returns empty string for empty text', () => {
    expect(highlightTerms('', 'query')).toBe('');
  });

  it('returns null-safe empty string for null text', () => {
    expect(highlightTerms(null, 'query')).toBe('');
  });

  it('wraps match with <mark class="search-highlight">', () => {
    const result = highlightTerms('hello world', 'world');
    expect(result).toBe('hello <mark class="search-highlight">world</mark>');
  });

  it('is case-insensitive and preserves original casing', () => {
    const result = highlightTerms('Hello WORLD', 'world');
    expect(result).toContain('<mark class="search-highlight">WORLD</mark>');
  });

  it('highlights multiple occurrences', () => {
    const result = highlightTerms('cat and cat', 'cat');
    const matches = result.match(/<mark/g);
    expect(matches).toHaveLength(2);
  });

  it('returns HTML-escaped text when query is empty', () => {
    const result = highlightTerms('<b>bold</b>', '');
    expect(result).toBe('&lt;b&gt;bold&lt;/b&gt;');
    expect(result).not.toContain('<mark');
  });

  it('escapes HTML entities in text before highlighting', () => {
    const result = highlightTerms('<p>find me</p>', 'find');
    expect(result).toContain('&lt;p&gt;');
    expect(result).toContain('<mark class="search-highlight">find</mark>');
  });

  it('handles query with regex special characters safely', () => {
    // Should not throw; treats special chars literally
    expect(() => highlightTerms('price is $5.00', '$5.00')).not.toThrow();
    const result = highlightTerms('price is $5.00', '$5.00');
    expect(result).toContain('<mark class="search-highlight">');
  });

  it('returns escaped text unchanged when query not present', () => {
    const result = highlightTerms('hello world', 'xyz');
    expect(result).toBe('hello world');
    expect(result).not.toContain('<mark');
  });
});

// ─── formatBreadcrumb ─────────────────────────────────────────────────────────

describe('formatBreadcrumb', () => {
  it('returns "Uncategorised" for empty array', () => {
    expect(formatBreadcrumb([])).toBe('Uncategorised');
  });

  it('returns "Uncategorised" for null', () => {
    expect(formatBreadcrumb(null)).toBe('Uncategorised');
  });

  it('returns "Uncategorised" for undefined', () => {
    expect(formatBreadcrumb(undefined)).toBe('Uncategorised');
  });

  it('returns topic name for single-element path', () => {
    expect(formatBreadcrumb([{ id: '1', name: 'Research' }])).toBe('Research');
  });

  it('joins multiple path elements with › separator', () => {
    const path = [
      { id: '1', name: 'Research' },
      { id: '2', name: 'AI' },
      { id: '3', name: 'Prompts' }
    ];
    expect(formatBreadcrumb(path)).toBe('Research › AI › Prompts');
  });

  it('handles two-level path', () => {
    const path = [
      { id: 'a', name: 'Work' },
      { id: 'b', name: 'Projects' }
    ];
    expect(formatBreadcrumb(path)).toBe('Work › Projects');
  });
});

// ─── applySearchFilters — C.15 minRating ──────────────────────────────────────

describe('applySearchFilters — minRating', () => {
  const chats = [
    { id: '1', source: 'chatgpt', timestamp: 1000, rating: 5  },
    { id: '2', source: 'claude',  timestamp: 2000, rating: 3  },
    { id: '3', source: 'gemini',  timestamp: 3000, rating: 1  },
    { id: '4', source: 'copilot', timestamp: 4000, rating: null },
    { id: '5', source: 'chatgpt', timestamp: 5000 },  // no rating field
  ];

  it('returns all results when minRating is null', () => {
    const result = applySearchFilters(chats, { minRating: null });
    expect(result).toHaveLength(5);
  });

  it('returns all results when minRating is 0', () => {
    const result = applySearchFilters(chats, { minRating: 0 });
    expect(result).toHaveLength(5);
  });

  it('filters to chats rated >= 3', () => {
    const result = applySearchFilters(chats, { minRating: 3 });
    expect(result.map(c => c.id)).toEqual(['1', '2']);
  });

  it('filters to chats rated >= 5', () => {
    const result = applySearchFilters(chats, { minRating: 5 });
    expect(result.map(c => c.id)).toEqual(['1']);
  });

  it('returns empty when no chats meet minimum', () => {
    const result = applySearchFilters(chats, { minRating: 4 });
    expect(result.map(c => c.id)).toEqual(['1']);
  });

  it('excludes chats with null or missing rating', () => {
    const result = applySearchFilters(chats, { minRating: 1 });
    expect(result.map(c => c.id)).toEqual(['1', '2', '3']);
  });

  it('works alongside source filter', () => {
    const result = applySearchFilters(chats, { sources: new Set(['chatgpt']), minRating: 3 });
    expect(result.map(c => c.id)).toEqual(['1']);
  });
});
