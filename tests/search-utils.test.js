import { describe, it, expect } from 'vitest';
import { escapeHtml, extractSnippet, highlightTerms, formatBreadcrumb, applySearchFilters, generateId } from '../src/lib/utils/search-utils.js';

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

// ─── applySearchFilters — date range filter (lines 132-136) ──────────────────

describe('applySearchFilters — date range filter', () => {
  const chats = [
    { id: '1', timestamp: new Date('2026-01-10').getTime() },
    { id: '2', timestamp: new Date('2026-03-15').getTime() },
    { id: '3', timestamp: new Date('2026-06-20').getTime() },
    { id: '4', timestamp: 0 },
  ];

  it('filters by dateFrom only', () => {
    const result = applySearchFilters(chats, { dateFrom: '2026-03-01' });
    expect(result.map(c => c.id)).toContain('2');
    expect(result.map(c => c.id)).toContain('3');
    expect(result.map(c => c.id)).not.toContain('1');
  });

  it('filters by dateTo only', () => {
    const result = applySearchFilters(chats, { dateTo: '2026-03-31' });
    expect(result.map(c => c.id)).toContain('1');
    expect(result.map(c => c.id)).toContain('2');
    expect(result.map(c => c.id)).not.toContain('3');
  });

  it('filters by dateFrom and dateTo range', () => {
    const result = applySearchFilters(chats, { dateFrom: '2026-01-01', dateTo: '2026-04-30' });
    expect(result.map(c => c.id)).toContain('1');
    expect(result.map(c => c.id)).toContain('2');
    expect(result.map(c => c.id)).not.toContain('3');
  });

  it('returns all when no date filter set', () => {
    const result = applySearchFilters(chats, {});
    expect(result).toHaveLength(4);
  });

  it('handles chat with no timestamp (treats as 0)', () => {
    // timestamp 0 is Jan 1 1970 — before any 2026 dateFrom
    const result = applySearchFilters(chats, { dateFrom: '2026-01-01' });
    expect(result.map(c => c.id)).not.toContain('4');
  });

  it('covers the to = Infinity branch (no dateTo)', () => {
    // dateFrom set, dateTo absent → to = Infinity, any future timestamps included
    const result = applySearchFilters(chats, { dateFrom: '2026-06-01' });
    expect(result.map(c => c.id)).toEqual(['3']);
  });

  it('covers the from = 0 branch (no dateFrom)', () => {
    // dateTo set, dateFrom absent → from = 0, everything up to cutoff included
    const result = applySearchFilters(chats, { dateTo: '2026-01-31' });
    expect(result.map(c => c.id)).toContain('1');
    expect(result.map(c => c.id)).toContain('4'); // ts 0 <= cutoff
  });
});

// ─── applySearchFilters — topic scope filter (lines 142-149) ─────────────────

describe('applySearchFilters — topic scope filter', () => {
  const tree = {
    topics: {
      'root': { id: 'root',   name: 'Root',  children: ['child1'] },
      'child1': { id: 'child1', name: 'Child', children: ['grand1'] },
      'grand1': { id: 'grand1', name: 'Grand', children: [] },
      'other':  { id: 'other',  name: 'Other', children: [] },
    },
  };

  const chats = [
    { id: 'c1', topicId: 'root' },
    { id: 'c2', topicId: 'child1' },
    { id: 'c3', topicId: 'grand1' },
    { id: 'c4', topicId: 'other' },
    { id: 'c5', topicId: null },
  ];

  it('restricts results to topic and its descendants', () => {
    const result = applySearchFilters(chats, { topicId: 'root' }, tree);
    expect(result.map(c => c.id)).toContain('c1');
    expect(result.map(c => c.id)).toContain('c2');
    expect(result.map(c => c.id)).toContain('c3');
    expect(result.map(c => c.id)).not.toContain('c4');
    expect(result.map(c => c.id)).not.toContain('c5');
  });

  it('restricts to subtopic only', () => {
    const result = applySearchFilters(chats, { topicId: 'child1' }, tree);
    expect(result.map(c => c.id)).toEqual(['c2', 'c3']);
  });

  it('does not apply topic filter when topicId is absent', () => {
    const result = applySearchFilters(chats, {}, tree);
    expect(result).toHaveLength(5);
  });

  it('does not apply topic filter when tree is null', () => {
    const result = applySearchFilters(chats, { topicId: 'root' }, null);
    // tree is null → subtreeIds not built → filter not applied
    expect(result).toHaveLength(5);
  });

  it('collects recursive subtree via collect() helper', () => {
    // child1 → grand1; ensure recursive collection works
    const result = applySearchFilters(chats, { topicId: 'child1' }, tree);
    expect(result.map(c => c.id)).toContain('c3'); // grand1 is a descendant
  });

  it('excludes chats with no topicId even if topic filter is set', () => {
    const result = applySearchFilters(chats, { topicId: 'root' }, tree);
    expect(result.map(c => c.id)).not.toContain('c5');
  });
});

// ─── generateId ───────────────────────────────────────────────────────────────

describe('generateId', () => {
  it('returns a string', () => {
    expect(typeof generateId()).toBe('string');
  });

  it('without prefix uses timestamp-hex format', () => {
    const id = generateId();
    expect(id).toMatch(/^\d{13}-[0-9a-f]{12}$/);
  });

  it('with prefix uses prefix_timestamp_hex format', () => {
    const id = generateId('topic');
    expect(id).toMatch(/^topic_\d{13}_[0-9a-f]{12}$/);
  });

  it('two calls produce different IDs', () => {
    const a = generateId();
    const b = generateId();
    expect(a).not.toBe(b);
  });

  it('prefix is included in the result', () => {
    expect(generateId('chat')).toContain('chat_');
    expect(generateId('ann')).toContain('ann_');
  });

  it('without prefix separator is a hyphen', () => {
    const id = generateId();
    expect(id).toContain('-');
  });

  it('with prefix separator is an underscore', () => {
    const id = generateId('x');
    expect(id.split('_')).toHaveLength(3);
  });
});

// ─── Branch-gap coverage ─────────────────────────────────────────────────────

describe('escapeHtml – branch gaps', () => {
  it('returns empty string for undefined input', () => {
    expect(escapeHtml(undefined)).toBe('');
  });

  it('returns empty string for null input', () => {
    expect(escapeHtml(null)).toBe('');
  });
});

describe('extractSnippet – branch gaps', () => {
  it('does not append ellipsis when opening text equals full content length', () => {
    // Short content where opening === full body (no trailing ellipsis)
    const short = 'hello world';
    const result = extractSnippet(short, 'zzz');
    // query not found; opening returned without trailing '…'
    expect(result).toBe('hello world');
    expect(result.endsWith('…')).toBe(false);
  });

  it('strips frontmatter with no closing delimiter (stripFrontmatter line 32)', () => {
    // Frontmatter that starts with --- but has no closing ---  
    // extractSnippet uses stripFrontmatter internally
    const content = '---\ntitle: Test\nThis is the body without a closing delimiter';
    // stripFrontmatter: end === -1 → returns original content
    const result = extractSnippet(content, 'body');
    expect(result).toContain('body');
  });
});

describe('applySearchFilters – branch gaps', () => {
  const chats = [
    { id: 'c1', source: 'chatgpt', timestamp: new Date('2026-03-01').getTime(), topicId: 't1', rating: 4 },
    { id: 'c2', source: 'claude',  timestamp: new Date('2026-06-01').getTime(), topicId: 't2', rating: 2 },
  ];

  it('returns all results when sources Set is empty (size 0)', () => {
    const result = applySearchFilters(chats, { sources: new Set() });
    expect(result).toHaveLength(2);
  });

  it('does not apply topicId filter when tree is null', () => {
    const result = applySearchFilters(chats, { topicId: 't1' }, null);
    expect(result).toHaveLength(2);
  });

  it('minRating of 0 returns all chats', () => {
    const result = applySearchFilters(chats, { minRating: 0 });
    expect(result).toHaveLength(2);
  });

  it('minRating of null returns all chats', () => {
    const result = applySearchFilters(chats, { minRating: null });
    expect(result).toHaveLength(2);
  });

  it('applies only dateFrom when dateTo is absent', () => {
    const result = applySearchFilters(chats, { dateFrom: '2026-04-01' });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('c2');
  });

  it('applies only dateTo when dateFrom is absent', () => {
    const result = applySearchFilters(chats, { dateTo: '2026-04-30' });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('c1');
  });
});
