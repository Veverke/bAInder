/**
 * Tests for src/reader/reader.js
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  formatDate,
  escapeHtml,
  sourceLabel,
  badgeClass,
  applyInline,
  renderMarkdown,
  showError,
  renderChat,
  init,
} from '../src/reader/reader.js';
import { messagesToMarkdown } from '../src/lib/markdown-serialiser.js';

// ─── DOM fixture ─────────────────────────────────────────────────────────────
// Mirrors the essential elements from reader.html

function setupDom() {
  document.body.innerHTML = `
    <header id="reader-header" hidden>
      <div class="reader-header__inner">
        <div class="reader-header__meta">
          <span id="meta-source"  class="badge"></span>
          <span id="meta-date"    class="meta-date"></span>
          <span id="meta-count"   class="meta-count"></span>
        </div>
        <h1 id="reader-title" class="reader-title"></h1>
      </div>
      <div class="reader-header__actions">
        <a id="btn-original" hidden></a>
      </div>
    </header>
    <main id="reader-content" class="reader-content" hidden></main>
    <div id="state-loading" class="state-card"></div>
    <div id="state-error"   class="state-card" hidden>
      <p id="error-message"></p>
    </div>
  `;
}

// ─── formatDate ───────────────────────────────────────────────────────────────

describe('formatDate', () => {
  it('returns empty string for null / undefined / empty', () => {
    expect(formatDate(null)).toBe('');
    expect(formatDate(undefined)).toBe('');
    expect(formatDate('')).toBe('');
  });

  it('returns a non-empty string for a valid ISO date', () => {
    const result = formatDate('2026-02-20T10:30:00.000Z');
    expect(result).toBeTruthy();
    expect(typeof result).toBe('string');
  });

  it('returns the original string for an invalid date', () => {
    expect(formatDate('not-a-date')).toBe('not-a-date');
  });
});

// ─── escapeHtml ───────────────────────────────────────────────────────────────

describe('escapeHtml', () => {
  it('returns empty string for null / undefined', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
    expect(escapeHtml('')).toBe('');
  });

  it('escapes & < > "', () => {
    expect(escapeHtml('<script>alert("xss")</script>')).toBe(
      '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'
    );
  });

  it('escapes ampersand', () => {
    expect(escapeHtml('a & b')).toBe('a &amp; b');
  });

  it('leaves safe text unchanged', () => {
    expect(escapeHtml('Hello world')).toBe('Hello world');
  });
});

// ─── sourceLabel ─────────────────────────────────────────────────────────────

describe('sourceLabel', () => {
  it('maps chatgpt', () => { expect(sourceLabel('chatgpt')).toBe('ChatGPT'); });
  it('maps claude',  () => { expect(sourceLabel('claude')).toBe('Claude');   });
  it('maps gemini',  () => { expect(sourceLabel('gemini')).toBe('Gemini');   });
  it('maps copilot', () => { expect(sourceLabel('copilot')).toBe('Copilot'); });
  it('returns source string for unknown', () => {
    expect(sourceLabel('mybot')).toBe('mybot');
  });
  it('returns Unknown for empty / null', () => {
    expect(sourceLabel('')).toBe('Unknown');
    expect(sourceLabel(null)).toBe('Unknown');
  });
  it('returns Excerpt when isExcerpt is true', () => {
    expect(sourceLabel('chatgpt', true)).toBe('Excerpt');
    expect(sourceLabel('copilot', true)).toBe('Excerpt');
  });
});

// ─── badgeClass ──────────────────────────────────────────────────────────────

describe('badgeClass', () => {
  it('returns badge--chatgpt for chatgpt', () => {
    expect(badgeClass('chatgpt')).toBe('badge badge--chatgpt');
  });
  it('returns badge--unknown for unknown source', () => {
    expect(badgeClass('unknown')).toBe('badge badge--unknown');
    expect(badgeClass('mybot')).toBe('badge badge--unknown');
  });
  it('returns badge--excerpt when isExcerpt is true regardless of source', () => {
    expect(badgeClass('chatgpt', true)).toBe('badge badge--excerpt');
    expect(badgeClass('copilot', true)).toBe('badge badge--excerpt');
  });
});

// ─── applyInline ─────────────────────────────────────────────────────────────

describe('applyInline', () => {
  it('converts **bold** to <strong>', () => {
    expect(applyInline('This is **bold** text')).toBe('This is <strong>bold</strong> text');
  });

  it('converts *italic* to <em>', () => {
    expect(applyInline('This is *italic* text')).toBe('This is <em>italic</em> text');
  });

  it('converts `code` to <code>', () => {
    expect(applyInline('Use `const x = 1` here')).toBe('Use <code>const x = 1</code> here');
  });

  it('does not double-process bold inside code', () => {
    // Inline code should be processed first; ** inside code should not be bolded
    const result = applyInline('`**not bold**`');
    expect(result).toContain('<code>');
    // Should not also have <strong> since it's inside a code span
    expect(result).not.toContain('<strong>');
  });

  it('returns unchanged text when no formatting present', () => {
    expect(applyInline('plain text here')).toBe('plain text here');
  });

  it('handles empty string', () => {
    expect(applyInline('')).toBe('');
  });
});

// ─── renderMarkdown ───────────────────────────────────────────────────────────

describe('renderMarkdown', () => {
  it('returns empty string for null / undefined / empty', () => {
    expect(renderMarkdown(null)).toBe('');
    expect(renderMarkdown(undefined)).toBe('');
    expect(renderMarkdown('')).toBe('');
  });

  it('strips YAML frontmatter', () => {
    const md = '---\ntitle: "Test"\n---\n\n# Heading';
    const html = renderMarkdown(md);
    expect(html).not.toContain('title:');
    expect(html).toContain('<h1>Heading</h1>');
  });

  it('renders # heading as <h1>', () => {
    expect(renderMarkdown('# Hello')).toContain('<h1>Hello</h1>');
  });

  it('renders ## heading as <h2>', () => {
    expect(renderMarkdown('## Section')).toContain('<h2>Section</h2>');
  });

  it('renders ### heading as <h3>', () => {
    expect(renderMarkdown('### Sub')).toContain('<h3>Sub</h3>');
  });

  it('renders --- as <hr>', () => {
    expect(renderMarkdown('---')).toContain('<hr>');
  });

  it('renders fenced code block as <pre><code>', () => {
    const md = '```js\nconst x = 1;\n```';
    const html = renderMarkdown(md);
    expect(html).toContain('<pre>');
    expect(html).toContain('<code');
    expect(html).toContain('const x = 1;');
  });

  it('does not double-escape HTML inside code blocks', () => {
    const md = '```\n<div>hello</div>\n```';
    const html = renderMarkdown(md);
    expect(html).toContain('&lt;div&gt;');
  });

  it('renders blockquote > as <blockquote>', () => {
    expect(renderMarkdown('> A quote')).toContain('<blockquote>');
    expect(renderMarkdown('> A quote')).toContain('A quote');
  });

  it('renders - list items as <ul>', () => {
    const html = renderMarkdown('- item one\n- item two');
    expect(html).toContain('<ul>');
    expect(html).toContain('<li>item one</li>');
    expect(html).toContain('<li>item two</li>');
  });

  it('renders numbered list items as <ol>', () => {
    const html = renderMarkdown('1. first\n2. second');
    expect(html).toContain('<ol>');
    expect(html).toContain('<li>first</li>');
  });

  it('wraps plain text lines in <p>', () => {
    const html = renderMarkdown('Hello world');
    expect(html).toContain('<p>Hello world</p>');
  });

  it('escapes HTML entities in plain text', () => {
    const html = renderMarkdown('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('applies inline formatting inside paragraphs', () => {
    const html = renderMarkdown('This is **bold**');
    expect(html).toContain('<strong>bold</strong>');
  });

  it('renders full messagesToMarkdown output correctly', () => {
    // Use the actual serialiser output so integration is confirmed
    const md = messagesToMarkdown(
      [
        { role: 'user',      content: 'What is 2+2?' },
        { role: 'assistant', content: 'It is 4.'     },
      ],
      { title: 'Maths', source: 'chatgpt', url: 'https://chat.openai.com/c/1', timestamp: 1_740_000_000_000 }
    );
    const html = renderMarkdown(md);
    expect(html).toContain('<strong>User</strong>');
    expect(html).toContain('<strong>Assistant</strong>');
    expect(html).toContain('What is 2+2?');
    expect(html).toContain('It is 4.');
  });
});

// ─── showError ────────────────────────────────────────────────────────────────

describe('showError', () => {
  beforeEach(setupDom);

  it('hides the loading state', () => {
    showError('oops');
    expect(document.getElementById('state-loading').hidden).toBe(true);
  });

  it('shows the error state', () => {
    showError('Something went wrong');
    expect(document.getElementById('state-error').hidden).toBe(false);
  });

  it('sets the error message text', () => {
    showError('Chat not found');
    expect(document.getElementById('error-message').textContent).toBe('Chat not found');
  });
});

// ─── renderChat ───────────────────────────────────────────────────────────────

describe('renderChat', () => {
  beforeEach(setupDom);

  const makeChat = (overrides = {}) => ({
    id:        'chat-001',
    title:     'Test Chat',
    source:    'claude',
    url:       'https://claude.ai/chat/abc',
    timestamp: 1_740_000_000_000,
    messageCount: 2,
    content:   '---\ntitle: "Test Chat"\nsource: claude\nurl: https://claude.ai/chat/abc\ndate: 2026-02-20T00:00:00.000Z\nmessageCount: 2\ncontentFormat: markdown-v1\n---\n\n# Test Chat\n\n**User**\n\nHello\n\n---\n\n**Assistant**\n\nHi there!\n',
    metadata:  { contentFormat: 'markdown-v1' },
    ...overrides,
  });

  it('hides the loading state after render', () => {
    renderChat(makeChat());
    expect(document.getElementById('state-loading').hidden).toBe(true);
  });

  it('shows the reader header', () => {
    renderChat(makeChat());
    expect(document.getElementById('reader-header').hidden).toBe(false);
  });

  it('shows the reader content', () => {
    renderChat(makeChat());
    expect(document.getElementById('reader-content').hidden).toBe(false);
  });

  it('sets the page title', () => {
    renderChat(makeChat());
    expect(document.title).toContain('Test Chat');
  });

  it('renders title in header', () => {
    renderChat(makeChat());
    expect(document.getElementById('reader-title').textContent).toBe('Test Chat');
  });

  it('sets source badge class to badge--claude', () => {
    renderChat(makeChat());
    expect(document.getElementById('meta-source').className).toContain('badge--claude');
  });

  it('shows the original link when URL is present', () => {
    renderChat(makeChat());
    const btn = document.getElementById('btn-original');
    expect(btn.hidden).toBe(false);
    expect(btn.href).toContain('claude.ai');
  });

  it('hides the original link when URL is empty', () => {
    renderChat(makeChat({ url: '', content: makeChat().content.replace('url: https://claude.ai/chat/abc\n', '') }));
    expect(document.getElementById('btn-original').hidden).toBe(true);
  });

  it('renders markdown content as HTML for markdown-v1 format', () => {
    renderChat(makeChat());
    const inner = document.getElementById('reader-content').innerHTML;
    expect(inner).toContain('<strong>User</strong>');
    expect(inner).toContain('Hello');
  });

  it('renders plain text for old saves without contentFormat', () => {
    const legacy = makeChat({
      content:  '[USER]\nHello\n\n---\n\n[ASSISTANT]\nHi',
      metadata: {}
    });
    renderChat(legacy);
    const el = document.getElementById('reader-content');
    expect(el.classList.contains('reader-content--plain')).toBe(true);
    expect(el.textContent).toContain('[USER]');
  });

  it('sets excerpt badge class when isExcerpt is true in metadata', () => {
    const excerpt = makeChat({
      content:  '---\ntitle: "Excerpt"\nsource: chatgpt\nexcerpt: true\ncontentFormat: markdown-v1\n---\n\n# Excerpt\n\nSome text',
      metadata: { contentFormat: 'markdown-v1', isExcerpt: true }
    });
    renderChat(excerpt);
    expect(document.getElementById('meta-source').className).toContain('badge--excerpt');
  });
});

// ─── init ─────────────────────────────────────────────────────────────────────

describe('init', () => {
  beforeEach(() => {
    setupDom();
    // Reset window.location.search for each test
    vi.stubGlobal('location', { search: '' });
  });

  it('shows error when no chatId in URL', async () => {
    vi.stubGlobal('location', { search: '' });
    await init({ get: vi.fn().mockResolvedValue({ chats: {} }) });
    expect(document.getElementById('state-error').hidden).toBe(false);
    expect(document.getElementById('error-message').textContent).toContain('No chatId');
  });

  it('shows error when chatId not found in storage', async () => {
    vi.stubGlobal('location', { search: '?chatId=missing-id' });
    await init({ get: vi.fn().mockResolvedValue({ chats: {} }) });
    expect(document.getElementById('state-error').hidden).toBe(false);
    expect(document.getElementById('error-message').textContent).toContain('not found');
  });

  it('renders the chat when chatId is found', async () => {
    vi.stubGlobal('location', { search: '?chatId=chat-001' });
    const chat = {
      id:        'chat-001',
      title:     'Found Chat',
      source:    'gemini',
      url:       'https://gemini.google.com/app/abc',
      timestamp: 1_740_000_000_000,
      messageCount: 1,
      content:   '---\ntitle: "Found Chat"\nsource: gemini\ncontentFormat: markdown-v1\n---\n\n# Found Chat\n\n**User**\n\nHello\n',
      metadata:  { contentFormat: 'markdown-v1' },
    };
    await init({ get: vi.fn().mockResolvedValue({ chats: { 'chat-001': chat } }) });
    expect(document.getElementById('reader-header').hidden).toBe(false);
    expect(document.getElementById('reader-title').textContent).toBe('Found Chat');
  });

  it('shows error when storage throws', async () => {
    vi.stubGlobal('location', { search: '?chatId=chat-001' });
    await init({ get: vi.fn().mockRejectedValue(new Error('storage unavailable')) });
    expect(document.getElementById('state-error').hidden).toBe(false);
    expect(document.getElementById('error-message').textContent).toContain('storage unavailable');
  });
});
