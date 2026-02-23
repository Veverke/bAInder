/**
 * export-engine.test.js
 *
 * Comprehensive unit tests for src/lib/export-engine.js.
 *
 * Covers:
 *  - sanitizeFilename()
 *  - buildTopicPath()
 *  - buildExportMarkdown()
 *  - buildExportHtml()
 *  - buildZipPayload()
 *  - buildMetadataJson()
 *  - buildReadme()
 *  - _mdToHtml()
 *  - triggerDownload()
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ─── Mock markdown-serialiser ─────────────────────────────────────────────────
vi.mock('../src/lib/markdown-serialiser.js', () => ({
  messagesToMarkdown: vi.fn((msgs, meta) => `---\ntitle: "${meta?.title || ''}"\n---\ncontent`),
  parseFrontmatter: vi.fn((md) => {
    const m = md.match(/title:\s*"([^"]+)"/);
    return m ? { title: m[1] } : {};
  }),
  escapeYaml: vi.fn((s) => String(s || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"')),
}));

import {
  sanitizeFilename,
  buildTopicPath,
  buildExportMarkdown,
  buildExportHtml,
  buildZipPayload,
  buildMetadataJson,
  buildReadme,
  triggerDownload,
  _mdToHtml,
} from '../src/lib/export-engine.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const mockTopicsMap = {
  'topic-root': {
    id: 'topic-root',
    name: 'Work',
    parentId: null,
    children: ['topic-child'],
    chatIds: ['chat-1'],
    firstChatDate: 1700000000000,
    lastChatDate: 1700001000000,
  },
  'topic-child': {
    id: 'topic-child',
    name: 'Projects',
    parentId: 'topic-root',
    children: [],
    chatIds: ['chat-2'],
    firstChatDate: null,
    lastChatDate: null,
  },
};

const mockTree = { topics: mockTopicsMap, rootTopics: ['topic-root'] };

const mockChat = {
  id: 'chat-1',
  title: 'My Test Chat',
  content: '---\ntitle: "My Test Chat"\nsource: chatgpt\n---\n\n# My Test Chat\n\n🙋 Hello\n\n---\n\n🤖 World',
  source: 'chatgpt',
  url: 'https://chat.openai.com/c/abc123',
  timestamp: 1700000000000,
  topicId: 'topic-root',
  messages: [
    { role: 'user', content: 'Hello' },
    { role: 'assistant', content: 'World' },
  ],
  messageCount: 2,
  metadata: { isExcerpt: false },
  tags: ['testing', 'vitest'],
};

const mockExcerpt = {
  id: 'chat-x',
  title: 'Quick Excerpt',
  content: '---\ntitle: "Quick Excerpt"\nsource: claude\nexcerpt: true\n---\nSome excerpt text',
  source: 'claude',
  url: '',
  timestamp: 1700500000000,
  topicId: 'topic-child',
  messages: [],
  messageCount: 0,
  metadata: { isExcerpt: true },
  tags: [],
};

// ═════════════════════════════════════════════════════════════════════════════
// sanitizeFilename()
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Tests for sanitizeFilename — ensures filename sanitisation rules are applied
 * correctly across a range of inputs.
 */
describe('sanitizeFilename()', () => {
  it('returns "untitled" for empty string', () => {
    expect(sanitizeFilename('')).toBe('untitled');
  });

  it('returns "untitled" for null', () => {
    expect(sanitizeFilename(null)).toBe('untitled');
  });

  it('returns "untitled" for undefined', () => {
    expect(sanitizeFilename(undefined)).toBe('untitled');
  });

  it('lowercases and replaces spaces with hyphens', () => {
    expect(sanitizeFilename('Hello World')).toBe('hello-world');
  });

  it('strips characters invalid in file names', () => {
    const result = sanitizeFilename('Chat: One/Two');
    expect(result).not.toMatch(/[:\/]/);
    expect(result).toBe(result.toLowerCase());
  });

  it('collapses multiple consecutive spaces into a single hyphen', () => {
    const result = sanitizeFilename('Hello   World');
    expect(result).toBe('hello-world');
  });

  it('collapses multiple consecutive hyphens into one', () => {
    const result = sanitizeFilename('foo--bar---baz');
    expect(result).toBe('foo-bar-baz');
  });

  it('strips leading hyphens', () => {
    const result = sanitizeFilename('---leading');
    expect(result).not.toMatch(/^-/);
  });

  it('strips trailing hyphens', () => {
    const result = sanitizeFilename('trailing---');
    expect(result).not.toMatch(/-$/);
  });

  it('truncates names longer than 80 characters', () => {
    const long = 'a'.repeat(120);
    expect(sanitizeFilename(long).length).toBeLessThanOrEqual(80);
  });

  it('returns an already-clean name unchanged (lowercased)', () => {
    expect(sanitizeFilename('my-clean-name')).toBe('my-clean-name');
  });

  it('returns "untitled" when input contains only special chars', () => {
    expect(sanitizeFilename('<>?*')).toBe('untitled');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// buildTopicPath()
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Tests for buildTopicPath — ensures breadcrumb paths are built correctly
 * from a flat topics map, with safe fallbacks for missing/invalid inputs.
 */
describe('buildTopicPath()', () => {
  it('returns "Uncategorised" for null topicId', () => {
    expect(buildTopicPath(null, mockTopicsMap)).toBe('Uncategorised');
  });

  it('returns "Uncategorised" for undefined topicId', () => {
    expect(buildTopicPath(undefined, mockTopicsMap)).toBe('Uncategorised');
  });

  it('returns "Uncategorised" for a topicId not in the map', () => {
    expect(buildTopicPath('nonexistent-id', mockTopicsMap)).toBe('Uncategorised');
  });

  it('returns just the topic name for a root topic', () => {
    expect(buildTopicPath('topic-root', mockTopicsMap)).toBe('Work');
  });

  it('builds a breadcrumb path for a child topic', () => {
    expect(buildTopicPath('topic-child', mockTopicsMap)).toBe('Work > Projects');
  });

  it('returns "Uncategorised" when topicsMap is null', () => {
    expect(buildTopicPath('topic-root', null)).toBe('Uncategorised');
  });

  it('does not infinite-loop on circular references', () => {
    const circular = {
      'a': { id: 'a', name: 'A', parentId: 'b' },
      'b': { id: 'b', name: 'B', parentId: 'a' },
    };
    expect(() => buildTopicPath('a', circular)).not.toThrow();
    const result = buildTopicPath('a', circular);
    expect(typeof result).toBe('string');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// buildExportMarkdown()
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Tests for buildExportMarkdown — verifies the rich-frontmatter Markdown
 * document structure for both regular chats and excerpt chats.
 */
describe('buildExportMarkdown()', () => {
  it('returns empty string for null chat', () => {
    expect(buildExportMarkdown(null, 'Work')).toBe('');
  });

  it('result starts with a YAML frontmatter delimiter', () => {
    const md = buildExportMarkdown(mockChat, 'Work');
    expect(md.startsWith('---')).toBe(true);
  });

  it('contains title in frontmatter', () => {
    const md = buildExportMarkdown(mockChat, 'Work');
    expect(md).toContain('title: "My Test Chat"');
  });

  it('contains source in frontmatter', () => {
    const md = buildExportMarkdown(mockChat, 'Work');
    expect(md).toContain('source: chatgpt');
  });

  it('contains topic path in frontmatter', () => {
    const md = buildExportMarkdown(mockChat, 'Work > Projects');
    expect(md).toContain('topic: "Work > Projects"');
  });

  it('contains chat_id in frontmatter', () => {
    const md = buildExportMarkdown(mockChat, 'Work');
    expect(md).toContain('chat_id: chat-1');
  });

  it('contains exported date field in frontmatter', () => {
    const md = buildExportMarkdown(mockChat, 'Work');
    expect(md).toContain('exported:');
  });

  it('includes tags in frontmatter when tags are present', () => {
    const md = buildExportMarkdown(mockChat, 'Work');
    expect(md).toContain('tags: [testing, vitest]');
  });

  it('omits tags line when chat.tags is empty', () => {
    const chatNoTags = { ...mockChat, tags: [] };
    const md = buildExportMarkdown(chatNoTags, 'Work');
    expect(md).not.toContain('tags:');
  });

  it('for a regular chat: includes ## Conversation heading', () => {
    const md = buildExportMarkdown(mockChat, 'Work');
    expect(md).toContain('## Conversation');
  });

  it('renders ### User heading for user messages', () => {
    const md = buildExportMarkdown(mockChat, 'Work');
    expect(md).toContain('### User');
  });

  it('renders ### Assistant heading for assistant messages', () => {
    const md = buildExportMarkdown(mockChat, 'Work');
    expect(md).toContain('### Assistant');
  });

  it('for an excerpt chat: does NOT include # Title heading', () => {
    const md = buildExportMarkdown(mockExcerpt, 'Work > Projects');
    expect(md).not.toMatch(/^# /m);
  });

  it('for excerpt: does NOT include ## Conversation heading', () => {
    const md = buildExportMarkdown(mockExcerpt, 'Work > Projects');
    // excerpt has no messages, so the conversation block is not rendered
    expect(md).not.toContain('## Conversation');
  });

  it('falls back to stripping existing frontmatter from chat.content when messages array is empty', () => {
    const chatNoMessages = { ...mockChat, messages: [] };
    const md = buildExportMarkdown(chatNoMessages, 'Work');
    // The stripped body from mockChat.content should contain "My Test Chat" heading
    expect(md).toContain('# My Test Chat');
  });

  it('ends with the bAInder export footer line', () => {
    const md = buildExportMarkdown(mockChat, 'Work');
    expect(md).toContain('*Exported from bAInder');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// buildExportHtml()
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Tests for buildExportHtml — verifies that a complete, correctly-structured
 * HTML document is produced for both regular and excerpt chats.
 */
describe('buildExportHtml()', () => {
  it('returns a non-empty HTML string for null chat', () => {
    const html = buildExportHtml(null, 'Work');
    expect(html.length).toBeGreaterThan(0);
    expect(html).toContain('<html');
  });

  it('result is a complete HTML document starting with <!DOCTYPE html>', () => {
    const html = buildExportHtml(mockChat, 'Work');
    expect(html).toContain('<!DOCTYPE html>');
  });

  it('contains <html element', () => {
    const html = buildExportHtml(mockChat, 'Work');
    expect(html).toContain('<html');
  });

  it('contains <head element', () => {
    const html = buildExportHtml(mockChat, 'Work');
    expect(html).toContain('<head');
  });

  it('contains <body element', () => {
    const html = buildExportHtml(mockChat, 'Work');
    expect(html).toContain('<body');
  });

  it('contains the chat title in a <title> tag', () => {
    const html = buildExportHtml(mockChat, 'Work');
    expect(html).toContain('<title>My Test Chat');
  });

  it('contains a <style> block', () => {
    const html = buildExportHtml(mockChat, 'Work');
    expect(html).toContain('<style>');
  });

  it('contains turn-user class for user messages', () => {
    const html = buildExportHtml(mockChat, 'Work');
    expect(html).toContain('turn-user');
  });

  it('contains turn-assistant class for assistant messages', () => {
    const html = buildExportHtml(mockChat, 'Work');
    expect(html).toContain('turn-assistant');
  });

  it('for an excerpt chat: does NOT include an <h1> title', () => {
    const html = buildExportHtml(mockExcerpt, 'Work > Projects');
    expect(html).not.toContain('<h1>');
  });

  it('for a messages-less chat: falls back to content-stripped body', () => {
    const chatNoMessages = { ...mockChat, messages: [] };
    const html = buildExportHtml(chatNoMessages, 'Work');
    expect(html).toContain('My Test Chat');
  });

  it('options.style "academic" uses Georgia serif font in CSS', () => {
    const html = buildExportHtml(mockChat, 'Work', { style: 'academic' });
    expect(html).toContain('Georgia');
  });

  it('options.style "raw" uses system-ui font in CSS', () => {
    const html = buildExportHtml(mockChat, 'Work', { style: 'raw' });
    expect(html).toContain('system-ui');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// buildZipPayload()
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Tests for buildZipPayload — verifies that the correct set of files is
 * produced for all scope modes, formats, and edge cases.
 */
describe('buildZipPayload()', () => {
  const chat1 = { ...mockChat, id: 'chat-1', topicId: 'topic-root' };
  const chat2 = { ...mockChat, id: 'chat-2', title: 'My Test Chat', topicId: 'topic-child' };

  it('null/empty tree and chats still returns README.md and _metadata.json', () => {
    const files = buildZipPayload(null, []);
    const paths = files.map(f => f.path);
    expect(paths.some(p => p.endsWith('README.md'))).toBe(true);
    expect(paths.some(p => p.endsWith('_metadata.json'))).toBe(true);
  });

  it('scope "all" includes all topics _topic.json files', () => {
    const files = buildZipPayload(mockTree, [chat1, chat2], { scope: 'all' });
    const topicJsonCount = files.filter(f => f.path.endsWith('_topic.json')).length;
    expect(topicJsonCount).toBe(Object.keys(mockTopicsMap).length);
  });

  it('scope "topic" only includes the specified topic folder', () => {
    const files = buildZipPayload(mockTree, [chat1, chat2], {
      scope: 'topic',
      topicId: 'topic-root',
    });
    const topicJsonFiles = files.filter(f => f.path.endsWith('_topic.json'));
    expect(topicJsonFiles).toHaveLength(1);
    expect(topicJsonFiles[0].path).toContain('work');
  });

  it('scope "topic-recursive" includes topic and its children', () => {
    const files = buildZipPayload(mockTree, [chat1, chat2], {
      scope: 'topic-recursive',
      topicId: 'topic-root',
    });
    const topicJsonCount = files.filter(f => f.path.endsWith('_topic.json')).length;
    expect(topicJsonCount).toBe(2); // topic-root + topic-child
  });

  it('all file paths start with bAInder-export- root folder', () => {
    const files = buildZipPayload(mockTree, [chat1], { scope: 'all' });
    for (const f of files) {
      expect(f.path).toMatch(/^bAInder-export-\d{4}-\d{2}-\d{2}\//);
    }
  });

  it('each topic folder includes a _topic.json file', () => {
    const files = buildZipPayload(mockTree, [], { scope: 'all' });
    const paths = files.map(f => f.path);
    expect(paths.some(p => p.includes('/work/_topic.json'))).toBe(true);
    expect(paths.some(p => p.includes('/projects/_topic.json'))).toBe(true);
  });

  it('each chat produces a .md file when format is markdown', () => {
    const files = buildZipPayload(mockTree, [chat1], { scope: 'all', format: 'markdown' });
    const mdFiles = files.filter(f => f.path.endsWith('.md') && !f.path.endsWith('README.md'));
    expect(mdFiles.length).toBeGreaterThan(0);
  });

  it('each chat produces a .html file when format is html', () => {
    const files = buildZipPayload(mockTree, [chat1], { scope: 'all', format: 'html' });
    const htmlFiles = files.filter(f => f.path.endsWith('.html'));
    expect(htmlFiles.length).toBeGreaterThan(0);
  });

  it('two chats with same title in same topic get unique filenames', () => {
    const dupChat1 = { ...mockChat, id: 'dup-1', title: 'Duplicate Title', topicId: 'topic-root' };
    const dupChat2 = { ...mockChat, id: 'dup-2', title: 'Duplicate Title', topicId: 'topic-root' };
    const files = buildZipPayload(mockTree, [dupChat1, dupChat2], { scope: 'all', format: 'markdown' });
    const chatFiles = files.filter(f => f.path.includes('duplicate-title'));
    expect(chatFiles.length).toBe(2);
    const paths = chatFiles.map(f => f.path);
    expect(new Set(paths).size).toBe(2); // all paths unique
    expect(paths.some(p => p.endsWith('-2.md'))).toBe(true); // collision resolved with -2 suffix
  });

  it('README.md is always included at root', () => {
    const files = buildZipPayload(mockTree, [], { scope: 'all' });
    expect(files.some(f => f.path.endsWith('README.md'))).toBe(true);
  });

  it('_metadata.json is always included at root', () => {
    const files = buildZipPayload(mockTree, [], { scope: 'all' });
    expect(files.some(f => f.path.endsWith('_metadata.json'))).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// buildMetadataJson()
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Tests for buildMetadataJson — verifies export statistics object structure
 * and content accuracy.
 */
describe('buildMetadataJson()', () => {
  it('null tree returns object with total_topics: 0', () => {
    const meta = buildMetadataJson(null, []);
    expect(meta).toMatchObject({ tree_structure: { total_topics: 0 } });
  });

  it('empty chats array → statistics.sources is empty object', () => {
    const meta = buildMetadataJson(mockTree, []);
    expect(meta.statistics.sources).toEqual({});
  });

  it('correctly counts sources from chats', () => {
    const chats = [
      { ...mockChat, source: 'chatgpt' },
      { ...mockChat, id: 'c2', source: 'chatgpt' },
      { ...mockExcerpt, source: 'claude' },
    ];
    const meta = buildMetadataJson(mockTree, chats);
    expect(meta.statistics.sources).toMatchObject({ chatgpt: 2, claude: 1 });
  });

  it('contains export_version "1.0"', () => {
    const meta = buildMetadataJson(mockTree, []);
    expect(meta.export_version).toBe('1.0');
  });

  it('contains bainder_version "1.0.0"', () => {
    const meta = buildMetadataJson(mockTree, []);
    expect(meta.bainder_version).toBe('1.0.0');
  });

  it('export_date is a valid ISO 8601 string', () => {
    const meta = buildMetadataJson(mockTree, []);
    expect(() => new Date(meta.export_date)).not.toThrow();
    expect(new Date(meta.export_date).toISOString()).toBe(meta.export_date);
  });

  it('date_range uses timestamps from chats for first and last chat', () => {
    const chats = [
      { ...mockChat, timestamp: 1700000000000 },
      { ...mockExcerpt, timestamp: 1700500000000 },
    ];
    const meta = buildMetadataJson(mockTree, chats);
    expect(meta.statistics.date_range.first_chat).toBe(new Date(1700000000000).toISOString());
    expect(meta.statistics.date_range.last_chat).toBe(new Date(1700500000000).toISOString());
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// buildReadme()
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Tests for buildReadme — verifies the README.md string includes expected
 * branding, stats, and tooling hints.
 */
describe('buildReadme()', () => {
  const validStats = {
    exportDate: new Date(1700000000000).toISOString(),
    totalChats: 42,
    totalTopics: 7,
    format: 'markdown',
  };

  it('null stats still returns a non-empty string', () => {
    const readme = buildReadme(null);
    expect(readme.length).toBeGreaterThan(0);
  });

  it('contains bAInder branding', () => {
    const readme = buildReadme(validStats);
    expect(readme).toContain('bAInder');
  });

  it('contains the exported date', () => {
    const readme = buildReadme(validStats);
    // _formatDateHuman converts the timestamp to locale string — just check year
    expect(readme).toContain('2023');
  });

  it('contains total topics count', () => {
    const readme = buildReadme(validStats);
    expect(readme).toContain('7');
  });

  it('contains total chats count', () => {
    const readme = buildReadme(validStats);
    expect(readme).toContain('42');
  });

  it('contains a grep example command', () => {
    const readme = buildReadme(validStats);
    expect(readme).toContain('grep');
  });

  it('for html format: mentions .html extension in grep examples', () => {
    const readme = buildReadme({ ...validStats, format: 'html' });
    expect(readme).toContain('.html');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// _mdToHtml()
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Tests for _mdToHtml — verifies the minimal Markdown-to-HTML converter
 * handles all supported constructs and provides XSS safety for plain text.
 */
describe('_mdToHtml()', () => {
  it('returns empty string for empty input', () => {
    expect(_mdToHtml('')).toBe('');
  });

  it('returns empty string for null input', () => {
    expect(_mdToHtml(null)).toBe('');
  });

  it('wraps plain text in <p> tags', () => {
    const html = _mdToHtml('Hello world');
    expect(html).toContain('<p>Hello world</p>');
  });

  it('converts **bold** to <strong>', () => {
    const html = _mdToHtml('**bold text**');
    expect(html).toContain('<strong>bold text</strong>');
  });

  it('converts *italic* to <em>', () => {
    const html = _mdToHtml('*italic text*');
    expect(html).toContain('<em>italic text</em>');
  });

  it('converts `inline code` to <code>', () => {
    const html = _mdToHtml('Use `console.log` here');
    expect(html).toContain('<code>console.log</code>');
  });

  it('converts # Heading to <h1>', () => {
    const html = _mdToHtml('# My Heading');
    expect(html).toContain('<h1>My Heading</h1>');
  });

  it('converts ## Heading 2 to <h2>', () => {
    const html = _mdToHtml('## Second Level');
    expect(html).toContain('<h2>Second Level</h2>');
  });

  it('converts fenced code blocks to <pre><code>', () => {
    const md = '```\nconst x = 1;\n```';
    const html = _mdToHtml(md);
    expect(html).toContain('<pre><code>');
    expect(html).toContain('const x = 1;');
    expect(html).toContain('</code></pre>');
  });

  it('adds language class to fenced code blocks with a language specifier', () => {
    const md = '```js\nconst x = 1;\n```';
    const html = _mdToHtml(md);
    expect(html).toContain('class="language-js"');
  });

  it('converts - list item to <ul><li>', () => {
    const html = _mdToHtml('- first item');
    expect(html).toContain('<ul>');
    expect(html).toContain('<li>first item</li>');
    expect(html).toContain('</ul>');
  });

  it('converts > blockquote to <blockquote>', () => {
    const html = _mdToHtml('> quoted text');
    expect(html).toContain('<blockquote>quoted text</blockquote>');
  });

  it('converts --- to <hr>', () => {
    const html = _mdToHtml('---');
    expect(html).toContain('<hr>');
  });

  it('escapes <script> tags in plain text (XSS safety)', () => {
    const html = _mdToHtml('<script>alert("xss")</script>');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// triggerDownload()
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Tests for triggerDownload — verifies DOM interaction for the browser
 * download mechanism, including Blob creation and cleanup via fake timers.
 */
describe('triggerDownload()', () => {
  beforeEach(() => {
    global.URL.createObjectURL = vi.fn(() => 'blob:fake-url');
    global.URL.revokeObjectURL = vi.fn();
  });

  it('calls URL.createObjectURL to create a Blob URL', () => {
    triggerDownload('test.md', 'hello', 'text/markdown');
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
  });

  it('passes a Blob to URL.createObjectURL', () => {
    triggerDownload('test.md', 'hello', 'text/plain');
    const arg = URL.createObjectURL.mock.calls[0][0];
    expect(arg).toBeInstanceOf(Blob);
  });

  it('Blob content type matches the mimeType argument', () => {
    triggerDownload('export.html', '<html/>', 'text/html;charset=utf-8');
    const blob = URL.createObjectURL.mock.calls[0][0];
    expect(blob.type).toBe('text/html;charset=utf-8');
  });

  it('calls URL.revokeObjectURL after the cleanup timeout fires', () => {
    vi.useFakeTimers();
    triggerDownload('test.md', 'content', 'text/markdown');
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(15_000);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:fake-url');
    vi.useRealTimers();
  });
});
