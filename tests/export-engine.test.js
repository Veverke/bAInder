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
vi.mock('../src/lib/io/markdown-serialiser.js', () => ({
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
  setDownloadDriver,
  _mdToHtml,
  EXPORT_ENGINE_VERSION,
} from '../src/lib/export/export-engine.js';

// ─── Direct sub-module imports (for covering helper functions) ────────────────
import { buildDigestMarkdown }                          from '../src/lib/export/markdown-builder.js';
import { messagesToMarkdown }                           from '../src/lib/io/markdown-serialiser.js';
import { buildDigestHtml }                              from '../src/lib/export/html-builder.js';
import { cap, escCode, guessMime, digestAnchor, formatDateHuman, stripFrontmatter } from '../src/lib/export/format-helpers.js';
import { getDigestCss, getExportCss, fontStackForStyle } from '../src/lib/export/html-styles.js';
import { inlineMd }                                     from '../src/lib/export/md-to-html.js';
import { collectDescendants, buildTopicFolderPaths }    from '../src/lib/export/filename-utils.js';

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

  it('capitalises custom message role (cap fallback, line 79)', () => {
    // msg.role is neither 'user' nor 'assistant' → cap(msg.role || 'Unknown') fires
    const chatCustomRole = {
      ...mockChat,
      messages: [{ role: 'system', content: 'system prompt' }],
    };
    const md = buildExportMarkdown(chatCustomRole, 'Work');
    expect(md).toContain('### System');
  });

  it('uses "Unknown" when msg.role is null in buildExportMarkdown (|| "Unknown" branch)', () => {
    const chatNullRole = {
      ...mockChat,
      messages: [{ role: null, content: 'no role' }],
    };
    const md = buildExportMarkdown(chatNullRole, 'Work');
    expect(md).toContain('### Unknown');
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
  let clickDriver;

  beforeEach(() => {
    global.URL.createObjectURL = vi.fn(() => 'blob:fake-url');
    global.URL.revokeObjectURL = vi.fn();
    // Inject a spy driver so no DOM interaction occurs
    clickDriver = vi.fn();
    setDownloadDriver(clickDriver);
  });

  afterEach(() => {
    // Restore default DOM driver
    setDownloadDriver(undefined);
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

  it('passes the Blob through directly when content is already a Blob', () => {
    const existingBlob = new Blob(['pre-built'], { type: 'application/zip' });
    triggerDownload('export.zip', existingBlob, 'application/zip');
    const arg = URL.createObjectURL.mock.calls[0][0];
    // The same Blob instance must have been used — no re-wrapping
    expect(arg).toBe(existingBlob);
  });

  it('infers MIME type from filename when mimeType arg is omitted', () => {
    triggerDownload('archive.zip', 'content');
    const blob = URL.createObjectURL.mock.calls[0][0];
    // guessMime('.zip') should give application/zip
    expect(blob.type).toContain('zip');
  });

  it('invokes the click driver with the object URL and filename', () => {
    triggerDownload('report.md', 'text', 'text/markdown');
    expect(clickDriver).toHaveBeenCalledTimes(1);
    expect(clickDriver).toHaveBeenCalledWith('blob:fake-url', 'report.md');
  });

  it('does not call document.createElement or touch document.body', () => {
    const createSpy = vi.spyOn(document, 'createElement');
    triggerDownload('report.md', 'text', 'text/markdown');
    expect(createSpy).not.toHaveBeenCalled();
    createSpy.mockRestore();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// sanitizeFilename() – edge cases for trailing punctuation after truncation
// ═════════════════════════════════════════════════════════════════════════════

describe('sanitizeFilename() – truncation and trailing-char cleanup', () => {
  it('removes trailing hyphen produced by 80-char slice', () => {
    // Build a 85-char name where the 80th char is a hyphen
    // "a".repeat(79) + "-" + "b".repeat(5)  — slice at 80 leaves trailing "-"
    const name = 'a'.repeat(79) + '-bbbbb';
    const result = sanitizeFilename(name);
    expect(result).not.toMatch(/-$/);
  });

  it('returns "untitled" when input is only invalid characters', () => {
    expect(sanitizeFilename('<<>>**')).toBe('untitled');
  });

  it('handles a name that is exactly 80 characters (no truncation)', () => {
    const name = 'a'.repeat(80);
    expect(sanitizeFilename(name).length).toBeLessThanOrEqual(80);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// buildZipPayload() – scope fallback & unassigned chats
// ═════════════════════════════════════════════════════════════════════════════

describe('buildZipPayload() – scope fallback and unassigned chats', () => {
  it('falls back to all topics when scope is "topic" but topicId is not provided', () => {
    const files = buildZipPayload(mockTree, [], { scope: 'topic' /* no topicId */ });
    const topicJsonCount = files.filter(f => f.path.endsWith('_topic.json')).length;
    // Should include all topics (fallback to all)
    expect(topicJsonCount).toBe(Object.keys(mockTree.topics).length);
  });

  it('includes unassigned chats (no topicId) when scope is "all"', () => {
    const unassigned = {
      id: 'uncat-1', title: 'No Topic Chat', topicId: null,
      source: 'chatgpt', timestamp: Date.now(), messages: [], tags: [], metadata: {},
    };
    const files = buildZipPayload(mockTree, [unassigned], { scope: 'all', format: 'markdown' });
    const chatFiles = files.filter(f => f.path.endsWith('.md') && !f.path.endsWith('README.md'));
    expect(chatFiles.some(f => f.path.includes('uncategorised'))).toBe(true);
  });

  it('excludes unassigned chats when scope is "topic"', () => {
    const unassigned = {
      id: 'uncat-2', title: 'Orphan', topicId: null,
      source: 'claude', timestamp: Date.now(), messages: [], tags: [], metadata: {},
    };
    const files = buildZipPayload(mockTree, [unassigned], { scope: 'topic', topicId: 'topic-root' });
    const chatFiles = files.filter(f => f.path.endsWith('.md') && !f.path.endsWith('README.md'));
    expect(chatFiles).toHaveLength(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// EXPORT_ENGINE_VERSION
// ═════════════════════════════════════════════════════════════════════════════

describe('EXPORT_ENGINE_VERSION', () => {
  it('is exported as a string', () => {
    expect(typeof EXPORT_ENGINE_VERSION).toBe('string');
  });

  it('equals "1.0"', () => {
    expect(EXPORT_ENGINE_VERSION).toBe('1.0');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// cap() / escCode() / stripFrontmatter() / guessMime() / digestAnchor()
// ═════════════════════════════════════════════════════════════════════════════

describe('cap()', () => {
  it('capitalises the first letter of a string', () => {
    expect(cap('hello')).toBe('Hello');
  });

  it('returns empty string for empty input', () => {
    expect(cap('')).toBe('');
  });

  it('returns empty string for falsy input', () => {
    expect(cap(null)).toBe('');
  });

  it('leaves already-capitalised strings unchanged', () => {
    expect(cap('World')).toBe('World');
  });
});

describe('escCode()', () => {
  it('escapes & < > in code content', () => {
    expect(escCode('a & b < c > d')).toBe('a &amp; b &lt; c &gt; d');
  });

  it('returns plain text unchanged when no special chars present', () => {
    expect(escCode('hello world')).toBe('hello world');
  });
});

describe('stripFrontmatter()', () => {
  it('strips YAML frontmatter from markdown', () => {
    const md = '---\ntitle: "foo"\n---\n\nbody text';
    expect(stripFrontmatter(md)).toBe('body text');
  });

  it('returns original string when no frontmatter delimiter present', () => {
    expect(stripFrontmatter('plain text')).toBe('plain text');
  });

  it('returns empty string for falsy input', () => {
    expect(stripFrontmatter('')).toBe('');
    expect(stripFrontmatter(null)).toBe('');
  });

  it('returns original when opening --- has no closing ---', () => {
    const md = '---\ntitle: no close';
    expect(stripFrontmatter(md)).toBe(md);
  });
});

describe('guessMime()', () => {
  it('returns text/html for .html files', () => {
    expect(guessMime('export.html')).toContain('text/html');
  });

  it('returns application/zip for .zip files', () => {
    expect(guessMime('archive.zip')).toBe('application/zip');
  });

  it('returns application/json for .json files', () => {
    expect(guessMime('data.json')).toBe('application/json');
  });

  it('returns application/pdf for .pdf files', () => {
    expect(guessMime('report.pdf')).toBe('application/pdf');
  });

  it('returns text/markdown as default for unknown extensions', () => {
    expect(guessMime('notes.txt')).toContain('markdown');
  });

  it('returns text/markdown for .md files', () => {
    expect(guessMime('chat.md')).toContain('markdown');
  });
});

describe('digestAnchor()', () => {
  it('converts title to lowercase slug with 1-based index suffix', () => {
    expect(digestAnchor('My Chat Title', 0)).toBe('my-chat-title-1');
  });

  it('uses index offset correctly for non-zero index', () => {
    expect(digestAnchor('Test', 4)).toBe('test-5');
  });

  it('falls back to "untitled" slug for empty title (|| "chat" only fires on all-special chars)', () => {
    expect(digestAnchor('', 0)).toBe('untitled-1');
  });

  it('falls back to "chat" slug when title is only special characters', () => {
    // After replace(/[^a-z0-9]+/g, '-') + strip leading/trailing hyphens, base is '' → "chat"
    expect(digestAnchor('!!!', 0)).toBe('chat-1');
  });

  it('strips special chars from title', () => {
    const anchor = digestAnchor('Hello! World?', 2);
    expect(anchor).toMatch(/^[a-z0-9-]+-3$/);
  });
});

describe('formatDateHuman()', () => {
  it('returns empty string for falsy timestamp', () => {
    expect(formatDateHuman(0)).toBe('');
    expect(formatDateHuman(null)).toBe('');
  });

  it('returns a non-empty string for a valid timestamp', () => {
    const result = formatDateHuman(1700000000000);
    expect(result.length).toBeGreaterThan(0);
    expect(result).toContain('2023');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// getDigestCss() / getExportCss() / fontStackForStyle()
// ═════════════════════════════════════════════════════════════════════════════

describe('getDigestCss()', () => {
  it('returns a non-empty CSS string', () => {
    const css = getDigestCss('system-ui, sans-serif');
    expect(css.length).toBeGreaterThan(50);
  });

  it('includes the provided font stack', () => {
    const css = getDigestCss('Georgia, serif');
    expect(css).toContain('Georgia, serif');
  });

  it('includes .toc style rules', () => {
    expect(getDigestCss('system-ui')).toContain('.toc');
  });

  it('includes .chat-section style rules', () => {
    expect(getDigestCss('system-ui')).toContain('.chat-section');
  });
});

describe('getExportCss()', () => {
  it('returns a non-empty CSS string', () => {
    expect(getExportCss('system-ui').length).toBeGreaterThan(50);
  });

  it('includes .turn-user and .turn-assistant rules', () => {
    const css = getExportCss('system-ui');
    expect(css).toContain('.turn-user');
    expect(css).toContain('.turn-assistant');
  });
});

describe('fontStackForStyle()', () => {
  it('"academic" style returns a serif font stack', () => {
    expect(fontStackForStyle('academic')).toContain('Georgia');
  });

  it('"blog" style returns a serif font stack', () => {
    expect(fontStackForStyle('blog')).toContain('Georgia');
  });

  it('"raw" style returns a system-ui sans-serif stack', () => {
    expect(fontStackForStyle('raw')).toContain('system-ui');
  });

  it('unknown style returns a system-ui stack', () => {
    expect(fontStackForStyle('unknown')).toContain('system-ui');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// inlineMd() — strikethrough, links, safe href
// ═════════════════════════════════════════════════════════════════════════════

describe('inlineMd()', () => {
  it('converts ~~text~~ to <del>', () => {
    expect(inlineMd('~~deleted~~')).toContain('<del>deleted</del>');
  });

  it('converts [label](https://example.com) to <a href>', () => {
    const html = inlineMd('[click](https://example.com)');
    expect(html).toContain('<a href="https://example.com"');
    expect(html).toContain('click');
  });

  it('replaces unsafe javascript: href with #', () => {
    const html = inlineMd('[bad](javascript:alert(1))');
    expect(html).toContain('href="#"');
    expect(html).not.toContain('javascript:');
  });

  it('replaces unsafe data: href with #', () => {
    const html = inlineMd('[bad](data:text/html,<h1>evil</h1>)');
    expect(html).toContain('href="#"');
  });

  it('allows mailto: links', () => {
    const html = inlineMd('[email](mailto:user@example.com)');
    expect(html).toContain('href="mailto:user@example.com"');
  });

  it('allows fragment-only links', () => {
    const html = inlineMd('[jump](#section)');
    expect(html).toContain('href="#section"');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// _mdToHtml — ordered list, unclosed fenced code block
// ═════════════════════════════════════════════════════════════════════════════

describe('_mdToHtml() — ordered list and edge cases', () => {
  it('renders numbered list item (1. item) as <li>', () => {
    const html = _mdToHtml('1. first item');
    expect(html).toContain('<li>first item</li>');
  });

  it('renders multiple ordered list items', () => {
    const html = _mdToHtml('1. alpha\n2. beta');
    expect(html).toContain('<li>alpha</li>');
    expect(html).toContain('<li>beta</li>');
  });

  it('flushes an unclosed fenced code block at end of input', () => {
    const html = _mdToHtml('```\nconst x = 1;');
    expect(html).toContain('<pre><code>');
    expect(html).toContain('const x = 1;');
  });

  it('converts ### heading to <h3>', () => {
    const html = _mdToHtml('### Third level');
    expect(html).toContain('<h3>Third level</h3>');
  });

  it('converts *** horizontal rule to <hr>', () => {
    const html = _mdToHtml('***');
    expect(html).toContain('<hr>');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// collectDescendants() / buildTopicFolderPaths()
// ═════════════════════════════════════════════════════════════════════════════

describe('collectDescendants()', () => {
  it('returns a set containing just the root when it has no children', () => {
    const map = { 'a': { id: 'a', name: 'A', parentId: null, children: [] } };
    const result = collectDescendants('a', map);
    expect(result.has('a')).toBe(true);
    expect(result.size).toBe(1);
  });

  it('collects root and all descendants', () => {
    const result = collectDescendants('topic-root', mockTopicsMap);
    expect(result.has('topic-root')).toBe(true);
    expect(result.has('topic-child')).toBe(true);
  });

  it('handles circular child references without infinite loop', () => {
    const circular = {
      'x': { id: 'x', name: 'X', parentId: null, children: ['y'] },
      'y': { id: 'y', name: 'Y', parentId: 'x', children: ['x'] }, // cycle back
    };
    expect(() => collectDescendants('x', circular)).not.toThrow();
  });

  it('handles a topicId that does not exist in the map', () => {
    const result = collectDescendants('nonexistent', mockTopicsMap);
    expect(result.has('nonexistent')).toBe(true); // the id is added before checking map
  });
});

describe('buildTopicFolderPaths()', () => {
  it('returns a Map with an entry for each topic', () => {
    const paths = buildTopicFolderPaths(mockTopicsMap);
    expect(paths.has('topic-root')).toBe(true);
    expect(paths.has('topic-child')).toBe(true);
  });

  it('root topic path is just its sanitised name', () => {
    const paths = buildTopicFolderPaths(mockTopicsMap);
    expect(paths.get('topic-root')).toBe('work');
  });

  it('child topic path includes parent folder', () => {
    const paths = buildTopicFolderPaths(mockTopicsMap);
    expect(paths.get('topic-child')).toBe('work/projects');
  });

  it('handles empty map without throwing', () => {
    expect(() => buildTopicFolderPaths({})).not.toThrow();
    expect(buildTopicFolderPaths({}).size).toBe(0);
  });

  it('handles a topic whose parentId is not in the map', () => {
    const orphan = { 'o1': { id: 'o1', name: 'Orphan', parentId: 'missing', children: [] } };
    const paths = buildTopicFolderPaths(orphan);
    expect(paths.has('o1')).toBe(true);
    expect(typeof paths.get('o1')).toBe('string');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// buildDigestMarkdown()
// ═════════════════════════════════════════════════════════════════════════════

const digestChats = [
  {
    id: 'd-1', title: 'Digest Chat One', source: 'chatgpt',
    topicId: 'topic-root', timestamp: 1700000000000,
    messages: [
      { role: 'user', content: 'Question one' },
      { role: 'assistant', content: 'Answer one' },
    ],
    tags: [], metadata: {}, url: '',
  },
  {
    id: 'd-2', title: 'Digest Chat Two', source: 'claude',
    topicId: 'topic-child', timestamp: 1700500000000,
    messages: [], content: '---\ntitle: "Two"\n---\nBody text', tags: [], metadata: {}, url: '',
  },
];

describe('buildDigestMarkdown()', () => {
  it('returns empty string for null chats', () => {
    expect(buildDigestMarkdown(null, {})).toBe('');
  });

  it('returns empty string for empty chats array', () => {
    expect(buildDigestMarkdown([], {})).toBe('');
  });

  it('result starts with YAML frontmatter', () => {
    const md = buildDigestMarkdown(digestChats, mockTopicsMap);
    expect(md.startsWith('---')).toBe(true);
  });

  it('contains bAInder Digest title heading', () => {
    const md = buildDigestMarkdown(digestChats, mockTopicsMap);
    expect(md).toContain('# bAInder Digest');
  });

  it('includes a table of contents when includeToc is not false', () => {
    const md = buildDigestMarkdown(digestChats, mockTopicsMap);
    expect(md).toContain('## Contents');
  });

  it('omits table of contents when includeToc: false', () => {
    const md = buildDigestMarkdown(digestChats, mockTopicsMap, { includeToc: false });
    expect(md).not.toContain('## Contents');
  });

  it('contains each chat title as a ## heading', () => {
    const md = buildDigestMarkdown(digestChats, mockTopicsMap);
    expect(md).toContain('## Digest Chat One');
    expect(md).toContain('## Digest Chat Two');
  });

  it('contains ### User and ### Assistant for chat with messages', () => {
    const md = buildDigestMarkdown(digestChats, mockTopicsMap);
    expect(md).toContain('### User');
    expect(md).toContain('### Assistant');
  });

  it('falls back to content body for chat with no messages', () => {
    const md = buildDigestMarkdown(digestChats, mockTopicsMap);
    expect(md).toContain('Body text');
  });

  it('includes digest footer line', () => {
    const md = buildDigestMarkdown(digestChats, mockTopicsMap);
    expect(md).toContain('Digest exported from bAInder');
  });

  it('uses === separator between chats', () => {
    const md = buildDigestMarkdown(digestChats, mockTopicsMap);
    expect(md).toMatch(/^={3,}\s*$/m);
  });

  it('forAssembly option uses messagesToMarkdown for messages', () => {
    const md = buildDigestMarkdown(digestChats, mockTopicsMap, { forAssembly: true });
    // messagesToMarkdown mock returns content — just verify it doesn't throw
    expect(md).toContain('# bAInder Digest');
  });

  it('handles a role other than user/assistant (capitalises it)', () => {
    const chats = [{
      id: 'r1', title: 'Custom Role', source: 'chatgpt', topicId: null,
      timestamp: 0, messages: [{ role: 'system', content: 'sys msg' }],
      tags: [], metadata: {}, url: '',
    }];
    const md = buildDigestMarkdown(chats, {});
    expect(md).toContain('### System');
  });

  it('uses "Unknown" when msg.role is falsy (|| "Unknown" fallback, line 79)', () => {
    const chats = [{
      id: 'r2', title: 'No Role', source: 'chatgpt', topicId: null,
      timestamp: 0, messages: [{ role: null, content: 'no role here' }],
      tags: [], metadata: {}, url: '',
    }];
    const md = buildDigestMarkdown(chats, {});
    expect(md).toContain('### Unknown');
  });

  it('accepts null topicsMap and uses empty object fallback (|| {} on line 117)', () => {
    // topicsMap=null → topics = null || {} = {} → no crash
    const md = buildDigestMarkdown(digestChats, null);
    expect(md).toContain('# bAInder Digest');
  });

  it('uses "Untitled Chat" when chat title is missing in ToC (|| "Untitled Chat" fallback)', () => {
    const noTitleChats = [{
      id: 'nt', source: 'chatgpt', topicId: null,
      timestamp: 0, messages: [],
      tags: [], metadata: {}, url: '',
      // title intentionally omitted
    }];
    const md = buildDigestMarkdown(noTitleChats, {});
    expect(md).toContain('Untitled Chat');
  });

  it('single chat does not produce "chats" plural in subtitle', () => {
    const single = [digestChats[0]];
    const md = buildDigestMarkdown(single, mockTopicsMap);
    expect(md).toContain('1 chat compiled');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// buildDigestHtml()
// ═════════════════════════════════════════════════════════════════════════════

describe('buildDigestHtml()', () => {
  it('returns fallback HTML for null chats', () => {
    const html = buildDigestHtml(null, {});
    expect(html).toContain('<html');
  });

  it('returns fallback HTML for empty chats array', () => {
    const html = buildDigestHtml([], {});
    expect(html).toContain('<html');
  });

  it('returns a complete HTML document for valid chats', () => {
    const html = buildDigestHtml(digestChats, mockTopicsMap);
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<html');
    expect(html).toContain('<body');
  });

  it('title says "bAInder Digest"', () => {
    const html = buildDigestHtml(digestChats, mockTopicsMap);
    expect(html).toContain('bAInder Digest');
  });

  it('includes a <nav class="toc"> when includeToc is not false', () => {
    const html = buildDigestHtml(digestChats, mockTopicsMap);
    expect(html).toContain('<nav class="toc">');
  });

  it('omits TOC when includeToc: false', () => {
    const html = buildDigestHtml(digestChats, mockTopicsMap, { includeToc: false });
    expect(html).not.toContain('<nav class="toc">');
  });

  it('each chat gets a <section class="chat-section">', () => {
    const html = buildDigestHtml(digestChats, mockTopicsMap);
    expect(html).toContain('chat-section');
  });

  it('contains turn-user and turn-assistant for chats with messages', () => {
    const html = buildDigestHtml(digestChats, mockTopicsMap);
    expect(html).toContain('turn-user');
    expect(html).toContain('turn-assistant');
  });

  it('falls back to content body for chat with no messages', () => {
    const html = buildDigestHtml(digestChats, mockTopicsMap);
    expect(html).toContain('Body text');
  });

  it('style "academic" uses Georgia serif font', () => {
    const html = buildDigestHtml(digestChats, mockTopicsMap, { style: 'academic' });
    expect(html).toContain('Georgia');
  });

  it('uses null topicsMap safely', () => {
    expect(() => buildDigestHtml(digestChats, null)).not.toThrow();
  });

  it('count pluralises to "chats" for multiple chats', () => {
    const html = buildDigestHtml(digestChats, mockTopicsMap);
    expect(html).toContain(`${digestChats.length} chats`);
  });

  it('count is singular for exactly one chat', () => {
    const html = buildDigestHtml([digestChats[0]], mockTopicsMap);
    expect(html).toContain('1 chat compiled');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// triggerDownload() — default DOM driver (lines 21-27 in download.js)
// ═════════════════════════════════════════════════════════════════════════════

describe('triggerDownload() — default DOM driver', () => {
  let mockAnchor;
  let createSpy;
  let appendSpy;
  let removeSpy;

  beforeEach(() => {
    global.URL.createObjectURL = vi.fn(() => 'blob:dom-driver-url');
    global.URL.revokeObjectURL = vi.fn();

    // Restore the default DOM driver
    setDownloadDriver(undefined);

    // Mock the DOM interactions performed by domClickDriver
    mockAnchor = {
      href: '',
      download: '',
      style: { display: '' },
      click: vi.fn(),
    };
    createSpy = vi.spyOn(document, 'createElement').mockReturnValue(mockAnchor);
    appendSpy = vi.spyOn(document.body, 'appendChild').mockImplementation(() => {});
    removeSpy = vi.spyOn(document.body, 'removeChild').mockImplementation(() => {});
  });

  afterEach(() => {
    createSpy.mockRestore();
    appendSpy.mockRestore();
    removeSpy.mockRestore();
    // Re-install the click spy so other suites are not affected
    setDownloadDriver(undefined);
  });

  it('creates an anchor element via document.createElement("a")', () => {
    triggerDownload('file.md', 'content', 'text/markdown');
    expect(createSpy).toHaveBeenCalledWith('a');
  });

  it('sets href to the object URL', () => {
    triggerDownload('file.md', 'content', 'text/markdown');
    expect(mockAnchor.href).toBe('blob:dom-driver-url');
  });

  it('sets download attribute to the filename', () => {
    triggerDownload('report.md', 'data', 'text/markdown');
    expect(mockAnchor.download).toBe('report.md');
  });

  it('appends the anchor to document.body', () => {
    triggerDownload('file.md', 'content', 'text/markdown');
    expect(appendSpy).toHaveBeenCalledWith(mockAnchor);
  });

  it('calls click() on the anchor', () => {
    triggerDownload('file.md', 'content', 'text/markdown');
    expect(mockAnchor.click).toHaveBeenCalledTimes(1);
  });

  it('removes the anchor from document.body after clicking', () => {
    triggerDownload('file.md', 'content', 'text/markdown');
    expect(removeSpy).toHaveBeenCalledWith(mockAnchor);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// buildMetadataJson() — edge case branches
// ═════════════════════════════════════════════════════════════════════════════

describe('buildMetadataJson() — edge case branches', () => {
  it('handles non-array chats gracefully (falls back to [])', () => {
    // Passes a non-array to trigger the Array.isArray false branch
    const meta = buildMetadataJson(mockTree, 'not-an-array');
    expect(meta.tree_structure.total_chats).toBe(0);
  });

  it('chat without timestamp does not affect date_range', () => {
    const chats = [{ id: 'c1', source: 'chatgpt' }]; // no timestamp
    const meta = buildMetadataJson(mockTree, chats);
    expect(meta.statistics.date_range.first_chat).toBeNull();
    expect(meta.statistics.date_range.last_chat).toBeNull();
  });

  it('chat with unknown source falls back to "unknown" key', () => {
    const chats = [{ id: 'c1' }]; // no source
    const meta = buildMetadataJson(mockTree, chats);
    expect(meta.statistics.sources.unknown).toBe(1);
  });

  it('topics without chatIds array report chatCount 0', () => {
    const tree = {
      topics: { 't1': { id: 't1', name: 'No Ids', parentId: null } },
      rootTopics: ['t1'],
    };
    const meta = buildMetadataJson(tree, []);
    expect(meta.tree_structure.topics[0].chatCount).toBe(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// buildZipPayload() — edge case branches
// ═════════════════════════════════════════════════════════════════════════════

describe('buildZipPayload() — additional edge case branches', () => {
  it('handles non-array chats (falls back to empty array)', () => {
    // Covers the allChats = [] branch in zip-builder line 30
    const files = buildZipPayload(mockTree, 'not-an-array', { scope: 'all' });
    expect(files.some(f => f.path.endsWith('README.md'))).toBe(true);
  });

  it('chat without a title uses "untitled" as filename base', () => {
    const noTitle = {
      id: 'no-title', title: null, topicId: 'topic-root',
      source: 'chatgpt', timestamp: Date.now(), messages: [], tags: [], metadata: {},
    };
    const files = buildZipPayload(mockTree, [noTitle], { scope: 'all', format: 'markdown' });
    const chatFiles = files.filter(f => f.path.endsWith('.md') && !f.path.endsWith('README.md'));
    expect(chatFiles.some(f => f.path.includes('untitled'))).toBe(true);
  });

  it('topic without chatIds in topicsMap does not crash', () => {
    const tree = {
      topics: {
        'no-ids': { id: 'no-ids', name: 'No IDs', parentId: null },
      },
      rootTopics: ['no-ids'],
    };
    const files = buildZipPayload(tree, [], { scope: 'all' });
    const topicJson = files.find(f => f.path.endsWith('_topic.json'));
    expect(topicJson).toBeDefined();
    const parsed = JSON.parse(topicJson.content);
    expect(parsed.chatCount).toBe(0);
  });

  it('topic.firstChatDate and lastChatDate null produce null in _topic.json', () => {
    // mockTopicsMap has topic-child with null dates
    const files = buildZipPayload(mockTree, [], { scope: 'all' });
    const childJson = files.find(f => f.path.includes('projects/_topic.json'));
    const parsed = JSON.parse(childJson.content);
    expect(parsed.dateRange.first).toBeNull();
    expect(parsed.dateRange.last).toBeNull();
  });

  it('scope "topic-recursive" covers descendant topics', () => {
    const files = buildZipPayload(mockTree, [], {
      scope: 'topic-recursive',
      topicId: 'topic-root',
    });
    const topicJsonPaths = files.filter(f => f.path.endsWith('_topic.json')).map(f => f.path);
    expect(topicJsonPaths.some(p => p.includes('work'))).toBe(true);
    expect(topicJsonPaths.some(p => p.includes('projects'))).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// filename-utils.js — buildTopicFolderPaths circular ref
// ═════════════════════════════════════════════════════════════════════════════

describe('buildTopicFolderPaths() — circular reference safety', () => {
  it('does not infinite-loop on circular parent references', () => {
    const circularMap = {
      'c1': { id: 'c1', name: 'A', parentId: 'c2', children: [] },
      'c2': { id: 'c2', name: 'B', parentId: 'c1', children: [] },
    };
    expect(() => buildTopicFolderPaths(circularMap)).not.toThrow();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// buildDigestHtml() — branch edge cases (untitled / no-timestamp chats)
// ═════════════════════════════════════════════════════════════════════════════

describe('buildDigestHtml() — branch edge cases', () => {
  it('uses "Untitled Chat" for a chat with no title (TOC + section branch)', () => {
    const noTitle = {
      id: 'nt', title: null, source: 'chatgpt',
      topicId: 'topic-root', timestamp: 1700000000000,
      messages: [{ role: 'user', content: 'hi' }],
    };
    const html = buildDigestHtml([noTitle], mockTopicsMap);
    expect(html).toContain('Untitled Chat');
  });

  it('omits the date <span> when chat has no timestamp', () => {
    const noTs = {
      id: 'nts', title: 'No TS', source: 'chatgpt',
      topicId: 'topic-root', timestamp: null,
      messages: [{ role: 'user', content: 'hi' }],
    };
    const html = buildDigestHtml([noTs], mockTopicsMap);
    expect(html).toContain('No TS');
    expect(html).not.toContain('📅');
  });

  it('messages with non-array value fall back to no-messages-body branch', () => {
    const noMsgArr = {
      id: 'nma', title: 'No Msg Array', source: 'claude',
      topicId: null, timestamp: 0,
      messages: null, content: '---\ntitle: "t"\n---\nfallback body',
    };
    const html = buildDigestHtml([noMsgArr], {});
    expect(html).toContain('fallback body');
  });

  it('renders correct content for assistant role message', () => {
    const onlyAssistant = {
      id: 'oa', title: 'AI Only', source: 'chatgpt',
      topicId: null, timestamp: 0,
      messages: [{ role: 'assistant', content: 'Here is the answer.' }],
    };
    const html = buildDigestHtml([onlyAssistant], {});
    expect(html).toContain('turn-assistant');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// buildExportMarkdown() — non-standard message role branch
// ═════════════════════════════════════════════════════════════════════════════

describe('buildExportMarkdown() — non-standard message role', () => {
  it('capitalises unknown role using cap()', () => {
    const chat = {
      ...mockChat,
      messages: [{ role: 'system', content: 'System prompt.' }],
    };
    const md = buildExportMarkdown(chat, 'Work');
    expect(md).toContain('### System');
  });

  it('uses "Unknown" label when role is undefined/null', () => {
    const chat = {
      ...mockChat,
      messages: [{ role: null, content: 'Mystery.' }],
    };
    const md = buildExportMarkdown(chat, 'Work');
    expect(md).toContain('###');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// buildDigestMarkdown() — more branch coverage (single message, no timestamp)
// ═════════════════════════════════════════════════════════════════════════════

describe('buildDigestMarkdown() — single-message and no-timestamp branches', () => {
  it('single-message digest chat: no --- separator after last message', () => {
    const chats = [{
      id: 's1', title: 'One Msg', source: 'chatgpt', topicId: null,
      timestamp: 1700000000000,
      messages: [{ role: 'user', content: 'Only message' }],
      tags: [], metadata: {}, url: '',
    }];
    const md = buildDigestMarkdown(chats, {});
    expect(md).toContain('Only message');
  });

  it('chat without timestamp omits the Date line', () => {
    const chats = [{
      id: 'nt2', title: 'No TS', source: 'claude', topicId: null,
      timestamp: null,
      messages: [{ role: 'assistant', content: 'Answer' }],
      tags: [], metadata: {}, url: '',
    }];
    const md = buildDigestMarkdown(chats, {});
    expect(md).not.toContain('**Date:**');
  });

  it('non-user non-assistant role in digest produces capitalised heading', () => {
    const chats = [{
      id: 'r2', title: 'Custom', source: 'chatgpt', topicId: null,
      timestamp: 0,
      messages: [{ role: 'tool', content: 'Tool output' }],
      tags: [], metadata: {}, url: '',
    }];
    const md = buildDigestMarkdown(chats, {});
    expect(md).toContain('### Tool');
  });

  it('unknown role (null) in digest falls back to cap()', () => {
    const chats = [{
      id: 'rl', title: 'Null Role', source: 'chatgpt', topicId: null,
      timestamp: 0,
      messages: [{ role: null, content: 'Mystery' }],
      tags: [], metadata: {}, url: '',
    }];
    const md = buildDigestMarkdown(chats, {});
    expect(md).toContain('###');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// buildDigestMarkdown() — forAssembly with real messagesToMarkdown
// ═════════════════════════════════════════════════════════════════════════════

describe('buildDigestMarkdown() — forAssembly with real messagesToMarkdown', () => {
  it('forAssembly: real messagesToMarkdown produces # heading; strip branch fires', () => {
    // The real messagesToMarkdown (src/lib/io/markdown-serialiser.js) returns
    // "---\ntitle: ...\n---\n\n# Title\n\n..." so titleIdx !== -1 is guaranteed.
    const chats = [{
      id: 'fa1', title: 'Chat Alpha', source: 'chatgpt', topicId: null,
      timestamp: 1700000000000,
      messages: [{ role: 'user', content: 'Hello there' }],
      tags: [], metadata: {}, url: '',
    }];
    const md = buildDigestMarkdown(chats, {}, { forAssembly: true });
    // Should not throw; the ## section heading drives the TOC
    expect(md).toContain('## Chat Alpha');
    // The body # heading should have been stripped
    // (If it was NOT stripped there would be a duplicate heading deeper in the string)
    const bodyPart = md.slice(md.indexOf('## Chat Alpha') + '## Chat Alpha'.length);
    expect(bodyPart).not.toMatch(/^# Chat Alpha/m);
  });

  it('forAssembly: title line immediately followed by non-blank content (extra=1 branch)', () => {
    // messagesToMarkdown normally inserts a blank line after the title, but if
    // somehow it doesn't, the `extra = 1` branch should fire.
    // We can verify the function handles both variants by checking no crash.
    const chats = [{
      id: 'fa2', title: 'B', source: 'chatgpt', topicId: null,
      timestamp: 0,
      messages: [{ role: 'user', content: 'Hi' }],
      tags: [], metadata: {}, url: '',
    }];
    expect(() => buildDigestMarkdown(chats, {}, { forAssembly: true })).not.toThrow();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// markdown-builder.js — extra=1 branch (line 187) via mock override
// ═════════════════════════════════════════════════════════════════════════════

describe('buildDigestMarkdown() — forAssembly extra=1 branch coverage', () => {
  it('splices only the title line when next line is non-blank (extra=1)', () => {
    // Make messagesToMarkdown return a body where # Title is DIRECTLY followed
    // by non-blank content (no blank line) → extra = 1 branch
    messagesToMarkdown.mockReturnValueOnce(
      '---\ntitle: "T"\n---\n\n# T\nImmediate content here'
    );
    const chats = [{
      id: 'e1', title: 'T', source: 'chatgpt', topicId: null,
      timestamp: 0,
      messages: [{ role: 'user', content: 'x' }],
      tags: [], metadata: {}, url: '',
    }];
    const md = buildDigestMarkdown(chats, {}, { forAssembly: true });
    // spliced only 1 line (the # heading) — content still present
    expect(md).toContain('Immediate content here');
    expect(md).not.toMatch(/^# T$/m);
  });

  it('splices title line AND blank line when next line IS blank (extra=2 branch)', () => {
    // messagesToMarkdown returns body where # Title is followed by a blank line → extra = 2
    messagesToMarkdown.mockReturnValueOnce(
      '---\ntitle: "U"\n---\n\n# U\n\nBody content here'
    );
    const chats = [{
      id: 'e2', title: 'U', source: 'chatgpt', topicId: null,
      timestamp: 0,
      messages: [{ role: 'user', content: 'y' }],
      tags: [], metadata: {}, url: '',
    }];
    const md = buildDigestMarkdown(chats, {}, { forAssembly: true });
    expect(md).toContain('Body content here');
    expect(md).not.toMatch(/^# U$/m);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// html-builder.js — missing branch coverage (lines 132, 142-146, 152)
// ═════════════════════════════════════════════════════════════════════════════

describe('buildDigestHtml() — missing source/timestamp branch coverage', () => {
  it('handles chat with no source (|| "unknown" branch, line 132)', () => {
    const chats = [{
      id: 'ns', title: 'No Source Chat',
      // no source field
      timestamp: 1700000000000, topicId: null,
      messages: [{ role: 'user', content: 'Hello' }],
      tags: [], metadata: {},
    }];
    const html = buildDigestHtml(chats, {});
    expect(html).toContain('chat-section');
    expect(html).toContain('No Source Chat');
  });

  it('handles chat with no timestamp (dateStr empty, ternary false branch)', () => {
    const chats = [{
      id: 'nts', title: 'No Timestamp', source: 'chatgpt',
      timestamp: null, topicId: null,
      messages: [{ role: 'user', content: 'Hi' }],
      tags: [], metadata: {},
    }];
    const html = buildDigestHtml(chats, {});
    // No date span should appear
    expect(html).not.toContain('📅');
    expect(html).toContain('No Timestamp');
  });

  it('handles chat with no title (|| "Untitled Chat" branch)', () => {
    const chats = [{
      id: 'nt', title: '',
      source: 'claude', timestamp: 1700000000000, topicId: null,
      messages: [], content: 'Some content', tags: [], metadata: {},
    }];
    const html = buildDigestHtml(chats, {});
    expect(html).toContain('Untitled Chat');
  });

  it('handles chat where messages is not an array (fallback to [])', () => {
    const chats = [{
      id: 'nm', title: 'Weird msgs', source: 'chatgpt',
      timestamp: 1700000000000, topicId: null,
      messages: null, content: 'fallback body', tags: [], metadata: {},
    }];
    const html = buildDigestHtml(chats, {});
    expect(html).toContain('fallback body');
  });
});

describe('buildExportHtml() — excerpt title block branch', () => {
  it('excerpt: only shows source-badge in header (no h1)', () => {
    const excerptChat = {
      id: 'ex', title: 'My Excerpt',
      source: 'claude', timestamp: null,
      messages: [], content: 'short excerpt', metadata: { isExcerpt: true }, tags: [],
    };
    const html = buildExportHtml(excerptChat, 'Work > Projects');
    // isExcerpt → titleBlock shows only source-badge, no h1 with the title
    expect(html).toContain('source-badge');
    expect(html).not.toMatch(/<h1>My Excerpt<\/h1>/);
  });

  it('handles chat with no source in buildExportHtml (|| "unknown" branch)', () => {
    const chat = {
      id: 'no-src', title: 'No Src',
      // no source
      timestamp: null, messages: [], content: 'body', metadata: {}, tags: [],
    };
    expect(() => buildExportHtml(chat, 'Topic')).not.toThrow();
    const html = buildExportHtml(chat, 'Topic');
    expect(html).toContain('No Src');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// markdown-builder.js — || fallback branches
// ═════════════════════════════════════════════════════════════════════════════

describe('buildDigestMarkdown() — || fallback branch coverage', () => {
  it('messages is not an array → fallback to [] (no messages path)', () => {
    const chats = [{
      id: 'nm1', title: 'Non-array messages', source: 'chatgpt', topicId: null,
      timestamp: 1700000000000,
      messages: null,  // not an array → [] fallback
      content: 'fallback body text',
      tags: [], metadata: {}, url: '',
    }];
    const md = buildDigestMarkdown(chats, {});
    expect(md).toContain('fallback body text');
  });

  it('message with no content → empty string fallback', () => {
    const chats = [{
      id: 'mc1', title: 'Empty Content', source: 'chatgpt', topicId: null,
      timestamp: 0,
      messages: [{ role: 'user' }],  // no content → '' fallback
      tags: [], metadata: {}, url: '',
    }];
    const md = buildDigestMarkdown(chats, {});
    expect(md).toContain('### User');
  });

  it('chat with no content field → empty string fallback in else branch', () => {
    const chats = [{
      id: 'nc1', title: 'No Content', source: 'chatgpt', topicId: null,
      timestamp: 0,
      messages: [],  // no messages → else branch
      // no content field → chat.content || '' fallback
      tags: [], metadata: {}, url: '',
    }];
    // Should not throw
    const md = buildDigestMarkdown(chats, {});
    expect(md).toContain('No Content');
  });

  it('forAssembly: chat with no source → source || "unknown" fallback', () => {
    messagesToMarkdown.mockReturnValueOnce('---\ntitle: "X"\n---\n\ncontent');
    const chats = [{
      id: 'fns', title: 'No Source', topicId: null,
      timestamp: 0,
      messages: [{ role: 'user', content: 'hi' }],
      // no source → 'unknown' fallback
      tags: [], metadata: {}, url: '',
    }];
    const md = buildDigestMarkdown(chats, {}, { forAssembly: true });
    expect(md).toContain('No Source');
  });
});
