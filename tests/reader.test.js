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
  processSources,
  setupSourcesPanel,
  showError,
  renderChat,
  init,
  setupRating,
  getScrollPositions,
  saveScrollPosition,
  restoreScrollPosition,
  setupReaderCopyButton,
} from '../src/reader/reader.js';
import { messagesToMarkdown } from '../src/lib/io/markdown-serialiser.js';

// ─── Mock clipboard-serialiser so reader.test.js has no real module dependency ─
vi.mock('../src/lib/export/clipboard-serialiser.js', () => ({
  getClipboardSettings: vi.fn(async () => ({ format: 'plain', includeEmojis: true, includeImages: false, includeAttachments: false, separator: '---' })),
  serialiseChats: vi.fn((chats) => chats.map(c => c.title || '').join('\n')),
  writeToClipboard: vi.fn(async () => ({ success: true, usedFallback: false })),
  writeToClipboardHtml: vi.fn(async () => ({ success: true, usedFallback: false })),
  MAX_CLIPBOARD_CHARS: 1_000_000,
}));

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
    </header>
    <main id="reader-content" class="reader-content" hidden></main>
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

  it('converts ![alt](https://url) to <img>', () => {
    const result = applyInline('![A cat](https://example.com/cat.png)');
    expect(result).toContain('<img');
    expect(result).toContain('src="https://example.com/cat.png"');
    expect(result).toContain('alt="A cat"');
    expect(result).toContain('class="chat-image"');
  });

  it('converts data: image URL to <img>', () => {
    const result = applyInline('![](data:image/png;base64,abc123)');
    expect(result).toContain('<img');
    expect(result).toContain('src="data:image/png;base64,abc123"');
  });

  it('keeps &amp; encoded in image src URL (valid HTML attribute)', () => {
    const result = applyInline('![x](https://example.com/img?a=1&amp;b=2)');
    expect(result).toContain('src="https://example.com/img?a=1&amp;b=2"');
  });

  it('converts [text](url) to an anchor tag', () => {
    const result = applyInline('[Open link](https://example.com)');
    expect(result).toContain('<a ');
    expect(result).toContain('href="https://example.com"');
    expect(result).toContain('target="_blank"');
    expect(result).toContain('>Open link</a>');
  });

  it('keeps &amp; encoded in link href (valid HTML attribute)', () => {
    const result = applyInline('[x](https://example.com?a=1&amp;b=2)');
    expect(result).toContain('href="https://example.com?a=1&amp;b=2"');
  });

  it('handles links alongside bold text', () => {
    const result = applyInline('See **[docs](https://example.com)** here');
    expect(result).toContain('<strong>');
    expect(result).toContain('<a ');
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

  it('renders fenced code block as a code-block widget with header and copy button', () => {
    const md = '```js\nconst x = 1;\n```';
    const html = renderMarkdown(md);
    expect(html).toContain('class="code-block"');
    expect(html).toContain('code-block__header');
    expect(html).toContain('code-block__copy');
    expect(html).toContain('code-block__pre');
    expect(html).toContain('<code');
    expect(html).toContain('const x = 1;');
    // Language label shown in header
    expect(html).toContain('code-block__lang');
    expect(html).toContain('js');
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

  it('renders standalone ![alt](url) as an <img>', () => {
    const html = renderMarkdown('![A cat](https://example.com/cat.png)');
    expect(html).toContain('<img');
    expect(html).toContain('src="https://example.com/cat.png"');
    expect(html).toContain('alt="A cat"');
  });

  it('renders [text](url) link inside paragraph', () => {
    const html = renderMarkdown('Click [here](https://example.com) for more');
    expect(html).toContain('<a ');
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('>here</a>');
  });

  // ── Bare URL auto-linking ──────────────────────────────────────────────

  it('auto-links a bare https URL', () => {
    const html = renderMarkdown('see https://example.com for details');
    expect(html).toContain('<a href="https://example.com"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('>https://example.com</a>');
  });

  it('auto-links a bare http URL', () => {
    const html = renderMarkdown('go to http://example.com now');
    expect(html).toContain('<a href="http://example.com"');
  });

  it('does not double-link an explicit markdown link whose href is a URL', () => {
    const html = renderMarkdown('[label](https://example.com)');
    const count = (html.match(/<a /g) || []).length;
    expect(count).toBe(1);
    expect(html).toContain('>label</a>');
  });

  it('trims trailing period from auto-linked URL and keeps the period as text', () => {
    const html = renderMarkdown('visit https://example.com.');
    expect(html).toContain('href="https://example.com"');
    expect(html).not.toContain('href="https://example.com."');
    expect(html).toContain('</a>.');
  });

  it('trims trailing ) from auto-linked URL', () => {
    const html = renderMarkdown('(see https://example.com)');
    expect(html).toContain('href="https://example.com"');
    expect(html).not.toContain('href="https://example.com)"');
  });

  it('auto-links URL with path and query string', () => {
    const html = renderMarkdown('open https://example.com/page?x=1&y=2 now');
    expect(html).toContain('href="https://example.com/page?x=1&amp;y=2"');
    // display text decodes &amp; back to &
    expect(html).toContain('>https://example.com/page?x=1&y=2</a>');
  });

  it('does not link text that starts with http inside a word (e.g. no-op for plain text)', () => {
    // Not a URL — should remain plain text
    const html = renderMarkdown('The word "https" appears here');
    // only "https" without :// would not be linked
    const linked = html.includes('<a href="https"');
    expect(linked).toBe(false);
  });

  it('renders Microsoft Designer as a card (not iframe)', () => {
    const src = 'https://designer.svc.cloud.microsoft/chat-image-creator?clientName=CWC&iframeid=abc123';
    const html = renderMarkdown(`[Microsoft Designer generated image](${src})`);
    expect(html).toContain('class="designer-card"');
    expect(html).not.toContain('<iframe');
    expect(html).toContain('AI Generated Image');
    expect(html).toContain('designer-card__note');
    // & in URL must be HTML-escaped to &amp; in the attribute
    expect(html).toContain('href="https://designer.svc.cloud.microsoft/chat-image-creator?clientName=CWC&amp;iframeid=abc123"');
    expect(html).toContain('Open in Designer');
  });

  it('Designer card does not clobber surrounding text', () => {
    const src = 'https://designer.svc.cloud.microsoft/chat-image-creator?clientName=CWC';
    const md = `Here you go!\n\n[Microsoft Designer generated image](${src})\n\nLet me know!`;
    const html = renderMarkdown(md);
    expect(html).toContain('<p>Here you go!</p>');
    expect(html).toContain('designer-card');
    expect(html).not.toContain('<iframe');
    expect(html).toContain('<p>Let me know!</p>');
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
    // Emoji prefixes (🙋 / 🤖) are now used instead of **User** / **Assistant** bold headers
    expect(html).toContain('🙋');
    expect(html).toContain('🤖');
    expect(html).toContain('What is 2+2?');
    expect(html).toContain('It is 4.');
  });
});

// ─── processSources ───────────────────────────────────────────────────────────

describe('processSources', () => {
  function makeContent(html) {
    const div = document.createElement('div');
    div.innerHTML = html;
    document.body.innerHTML = '';
    document.body.appendChild(div);
    return div;
  }

  it('returns early for null input', () => {
    expect(() => processSources(null)).not.toThrow();
  });

  it('replaces a Sources <p>+<ul> pair with a .sources-trigger button', () => {
    const el = makeContent(
      `<p><strong>Sources:</strong></p>` +
      `<ul><li><a href="https://example.com">Example</a></li></ul>`
    );
    processSources(el);
    expect(el.querySelector('.sources-trigger')).not.toBeNull();
    expect(el.querySelector('ul')).toBeNull();
    expect(el.querySelector('p')).toBeNull();
  });

  it('stores link data in data-sources attribute as JSON', () => {
    const el = makeContent(
      `<p><strong>Sources:</strong></p>` +
      `<ul>` +
        `<li><a href="https://a.com">Alpha</a></li>` +
        `<li><a href="https://b.com">Beta</a></li>` +
      `</ul>`
    );
    processSources(el);
    const btn = el.querySelector('.sources-trigger');
    const links = JSON.parse(btn.dataset.sources);
    expect(links).toHaveLength(2);
    expect(links[0]).toEqual({ href: 'https://a.com', text: 'Alpha' });
    expect(links[1]).toEqual({ href: 'https://b.com', text: 'Beta' });
  });

  it('chip label uses singular "source" for one link', () => {
    const el = makeContent(
      `<p><strong>Sources:</strong></p>` +
      `<ul><li><a href="https://x.com">X</a></li></ul>`
    );
    processSources(el);
    expect(el.querySelector('.sources-trigger').textContent).toContain('1 source');
    expect(el.querySelector('.sources-trigger').textContent).not.toContain('sources');
  });

  it('chip label uses plural "sources" for multiple links', () => {
    const el = makeContent(
      `<p><strong>Sources:</strong></p>` +
      `<ul>` +
        `<li><a href="https://a.com">A</a></li>` +
        `<li><a href="https://b.com">B</a></li>` +
      `</ul>`
    );
    processSources(el);
    expect(el.querySelector('.sources-trigger').textContent).toContain('2 sources');
  });

  it('does nothing when the <p> is not empty. and has no following <ul>', () => {
    const el = makeContent(`<p><strong>Sources:</strong></p><p>No list here</p>`);
    processSources(el);
    // No chip should be created
    expect(el.querySelector('.sources-trigger')).toBeNull();
  });

  it('does nothing to <p> elements that are not "Sources:"', () => {
    const el = makeContent(
      `<p>Regular paragraph</p>` +
      `<ul><li><a href="https://a.com">A</a></li></ul>`
    );
    processSources(el);
    expect(el.querySelector('.sources-trigger')).toBeNull();
    expect(el.querySelector('ul')).not.toBeNull();
  });

  it('does nothing when the <ul> has no links', () => {
    const el = makeContent(
      `<p><strong>Sources:</strong></p>` +
      `<ul><li>No links here</li></ul>`
    );
    processSources(el);
    expect(el.querySelector('.sources-trigger')).toBeNull();
  });
});

// ─── setupSourcesPanel ────────────────────────────────────────────────────────

describe('setupSourcesPanel', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('injects #sources-panel and #sources-overlay into the DOM', () => {
    setupSourcesPanel();
    expect(document.getElementById('sources-panel')).not.toBeNull();
    expect(document.getElementById('sources-overlay')).not.toBeNull();
  });

  it('is idempotent — calling twice does not create a second panel', () => {
    setupSourcesPanel();
    setupSourcesPanel();
    expect(document.querySelectorAll('#sources-panel').length).toBe(1);
  });

  it('panel starts with aria-hidden="true"', () => {
    setupSourcesPanel();
    expect(document.getElementById('sources-panel').getAttribute('aria-hidden')).toBe('true');
  });

  it('clicking a .sources-trigger opens the panel and populates the list', () => {
    setupSourcesPanel();
    const btn = document.createElement('button');
    btn.className = 'sources-trigger';
    btn.dataset.sources = JSON.stringify([{ href: 'https://test.com', text: 'Test Link' }]);
    document.body.appendChild(btn);

    btn.click();

    const panel = document.getElementById('sources-panel');
    expect(panel.classList.contains('sources-panel--open')).toBe(true);
    expect(panel.getAttribute('aria-hidden')).toBe('false');
    const listItem = document.querySelector('#sources-panel-list a');
    expect(listItem).not.toBeNull();
    expect(listItem.href).toContain('test.com');
    // The panel renders a domain span + URL span inside the link (not the 'text' field verbatim)
    expect(listItem.querySelector('.sources-panel__link-domain').textContent).toBe('test.com');
    expect(listItem.target).toBe('_blank');
    expect(listItem.rel).toContain('noopener');
  });

  it('close button hides the panel', () => {
    setupSourcesPanel();
    const panel = document.getElementById('sources-panel');
    panel.classList.add('sources-panel--open');
    panel.setAttribute('aria-hidden', 'false');

    document.getElementById('sources-panel-close').click();

    expect(panel.classList.contains('sources-panel--open')).toBe(false);
    expect(panel.getAttribute('aria-hidden')).toBe('true');
  });

  it('Escape key closes an open panel', () => {
    setupSourcesPanel();
    const panel = document.getElementById('sources-panel');
    panel.classList.add('sources-panel--open');
    panel.setAttribute('aria-hidden', 'false');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(panel.classList.contains('sources-panel--open')).toBe(false);
  });

  it('links in the panel open in a new tab', () => {
    setupSourcesPanel();
    const btn = document.createElement('button');
    btn.className = 'sources-trigger';
    btn.dataset.sources = JSON.stringify([{ href: 'https://newsite.com', text: 'New Site' }]);
    document.body.appendChild(btn);
    btn.click();

    const a = document.querySelector('#sources-panel-list a');
    expect(a.target).toBe('_blank');
  });
});

// ─── showError ────────────────────────────────────────────────────────────────

describe('showError', () => {
  beforeEach(setupDom);

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
    content:   '---\ntitle: "Test Chat"\nsource: claude\nurl: https://claude.ai/chat/abc\ndate: 2026-02-20T00:00:00.000Z\nmessageCount: 2\ncontentFormat: markdown-v1\n---\n\n# Test Chat\n\n🙋 Hello\n\n---\n\n🤖 Hi there!\n',
    metadata:  { contentFormat: 'markdown-v1' },
    ...overrides,
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

  it('renders markdown content as HTML for markdown-v1 format', () => {
    renderChat(makeChat());
    const inner = document.getElementById('reader-content').innerHTML;
    // Emoji prefixes are used instead of **User** / **Assistant** bold headers
    expect(inner).toContain('🙋');
    expect(inner).toContain('🤖');
    expect(inner).toContain('Hello');
    expect(inner).not.toContain('<strong>User</strong>');
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
    await init({ get: vi.fn().mockResolvedValue({ chats: [] }) });
    expect(document.getElementById('state-error').hidden).toBe(false);
    expect(document.getElementById('error-message').textContent).toContain('not found');
  });

  it('renders the chat when chatId is found', async () => {
    vi.stubGlobal('location', { search: '?chatId=chat-001' });
    const chat = {
      id:        'chat-001',
      title:     'Found Chat Array',
      source:    'copilot',
      url:       'https://copilot.microsoft.com/chats/abc',
      timestamp: 1_740_000_000_000,
      messageCount: 2,
      content:   '---\ntitle: "Found Chat Array"\nsource: copilot\ncontentFormat: markdown-v1\n---\n\n# Found Chat Array\n\nSome content\n',
      metadata:  { contentFormat: 'markdown-v1' },
    };
    await init({ get: vi.fn().mockResolvedValue({ chats: [chat] }) });
    expect(document.getElementById('reader-header').hidden).toBe(false);
    expect(document.getElementById('reader-title').textContent).toBe('Found Chat Array');
  });

  // ── Post-render state guard ───────────────────────────────────────────────
  it('header and content are shown, error is hidden, after successful render', async () => {
    vi.stubGlobal('location', { search: '?chatId=chat-001' });
    const chat = {
      id: 'chat-001', title: 'Render Test', source: 'copilot',
      url: 'https://copilot.microsoft.com/chats/x', timestamp: 1_740_000_000_000,
      messageCount: 1,
      content: '---\ntitle: "Render Test"\nsource: copilot\ncontentFormat: markdown-v1\n---\n\n# Render Test\n',
      metadata: { contentFormat: 'markdown-v1' },
    };
    await init({ get: vi.fn().mockResolvedValue({ chats: [chat] }) });
    expect(document.getElementById('state-error').hidden).toBe(true);
    expect(document.getElementById('reader-header').hidden).toBe(false);
  });

  it('error state is shown and header remains hidden when chat not found', async () => {
    vi.stubGlobal('location', { search: '?chatId=missing' });
    await init({ get: vi.fn().mockResolvedValue({ chats: [] }) });
    expect(document.getElementById('state-error').hidden).toBe(false);
    expect(document.getElementById('reader-header').hidden).toBe(true);
  });

  it('shows error when chatId not in array', async () => {
    vi.stubGlobal('location', { search: '?chatId=missing-id' });
    await init({ get: vi.fn().mockResolvedValue({ chats: [{ id: 'other-id', title: 'X' }] }) });
    expect(document.getElementById('state-error').hidden).toBe(false);
    expect(document.getElementById('error-message').textContent).toContain('not found');
  });

  it('shows error when storage throws', async () => {
    vi.stubGlobal('location', { search: '?chatId=chat-001' });
    await init({ get: vi.fn().mockRejectedValue(new Error('storage unavailable')) });
    expect(document.getElementById('state-error').hidden).toBe(false);
    expect(document.getElementById('error-message').textContent).toContain('storage unavailable');
  });
});

// ─── C.15 setupRating ─────────────────────────────────────────────────────────

describe('setupRating', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="reader-rating" hidden></div>';
  });

  function storageWith(chats) {
    return {
      get: async () => ({ chats }),
      set: vi.fn(async () => {}),
    };
  }

  it('renders 5 star buttons', () => {
    setupRating('chat1', null, storageWith([]));
    const btns = document.querySelectorAll('.reader-star-btn');
    expect(btns).toHaveLength(5);
  });

  it('marks stars up to currentRating as is-set', () => {
    setupRating('chat1', 3, storageWith([]));
    const btns = [...document.querySelectorAll('.reader-star-btn')];
    expect(btns.filter(b => b.classList.contains('is-set'))).toHaveLength(3);
    expect(btns.filter(b => !b.classList.contains('is-set'))).toHaveLength(2);
  });

  it('shows no stars filled when rating is 0/null', () => {
    setupRating('chat1', 0, storageWith([]));
    const active = document.querySelectorAll('.reader-star-btn.is-set');
    expect(active).toHaveLength(0);
  });

  it('makes the container visible', () => {
    const el = document.getElementById('reader-rating');
    expect(el.hidden).toBe(true);
    setupRating('chat1', 2, storageWith([]));
    expect(el.hidden).toBe(false);
  });

  it('clicking a star saves the new rating to storage', async () => {
    const chat = { id: 'chat1', title: 'Test', rating: null };
    const storage = storageWith([chat]);
    setupRating('chat1', null, storage);
    const btns = document.querySelectorAll('.reader-star-btn');
    btns[2].click(); // click 3rd star
    await new Promise(r => setTimeout(r, 0));
    expect(storage.set).toHaveBeenCalledWith({
      chats: [{ id: 'chat1', title: 'Test', rating: 3 }]
    });
  });

  it('clicking the same star twice clears the rating', async () => {
    const chat = { id: 'chat1', title: 'Test', rating: 4 };
    const storage = storageWith([chat]);
    setupRating('chat1', 4, storage);
    const btns = document.querySelectorAll('.reader-star-btn');
    btns[3].click(); // click 4th star (toggle off)
    await new Promise(r => setTimeout(r, 0));
    expect(storage.set).toHaveBeenCalledWith({
      chats: [{ id: 'chat1', title: 'Test', rating: null }]
    });
  });

  it('is a no-op when #reader-rating element is absent', () => {
    document.body.innerHTML = '';
    expect(() => setupRating('chat1', 3, storageWith([]))).not.toThrow();
  });
});

// ─── C.22 — Reading Progress Persistence ─────────────────────────────────────

describe('getScrollPositions', () => {
  beforeEach(() => localStorage.clear());

  it('returns empty object when nothing stored', () => {
    expect(getScrollPositions()).toEqual({});
  });

  it('returns stored positions', () => {
    localStorage.setItem('bAInder_scrollPositions', JSON.stringify({ abc: 350 }));
    expect(getScrollPositions()).toEqual({ abc: 350 });
  });

  it('returns empty object when localStorage contains invalid JSON', () => {
    localStorage.setItem('bAInder_scrollPositions', '{not json}');
    expect(getScrollPositions()).toEqual({});
  });
});

describe('saveScrollPosition', () => {
  beforeEach(() => localStorage.clear());

  it('persists a new position', () => {
    saveScrollPosition('chat1', 200);
    expect(getScrollPositions()).toEqual({ chat1: 200 });
  });

  it('updates an existing position', () => {
    saveScrollPosition('chat1', 100);
    saveScrollPosition('chat1', 500);
    expect(getScrollPositions()['chat1']).toBe(500);
  });

  it('is a no-op when chatId is falsy', () => {
    saveScrollPosition('', 100);
    saveScrollPosition(null, 100);
    expect(getScrollPositions()).toEqual({});
  });

  it('evicts the oldest entry when cap is exceeded', () => {
    // Fill the store with 100 entries
    const existing = {};
    for (let i = 0; i < 100; i++) existing[`chat${i}`] = i * 10;
    localStorage.setItem('bAInder_scrollPositions', JSON.stringify(existing));

    saveScrollPosition('chat_new', 999);

    const stored = getScrollPositions();
    expect(Object.keys(stored)).toHaveLength(100);
    expect(stored['chat_new']).toBe(999);
    // The very first inserted key should have been evicted
    expect(stored['chat0']).toBeUndefined();
  });

  it('re-inserting an existing id moves it to the end (no eviction size change)', () => {
    const existing = {};
    for (let i = 0; i < 100; i++) existing[`chat${i}`] = i * 10;
    localStorage.setItem('bAInder_scrollPositions', JSON.stringify(existing));

    // Update chat0 (already present) — should not grow past 100 or evict chat1
    saveScrollPosition('chat0', 999);

    const stored = getScrollPositions();
    expect(Object.keys(stored)).toHaveLength(100);
    expect(stored['chat0']).toBe(999);
    expect(stored['chat1']).toBeDefined();
  });
});

describe('restoreScrollPosition', () => {
  beforeEach(() => localStorage.clear());

  it('calls window.scrollTo with the stored Y value', () => {
    const scrollTo = vi.fn();
    vi.stubGlobal('scrollTo', scrollTo);
    saveScrollPosition('chat1', 420);
    restoreScrollPosition('chat1');
    expect(scrollTo).toHaveBeenCalledWith(0, 420);
  });

  it('does not call window.scrollTo when no position stored', () => {
    const scrollTo = vi.fn();
    vi.stubGlobal('scrollTo', scrollTo);
    restoreScrollPosition('chat_unknown');
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('is a no-op when chatId is falsy', () => {
    const scrollTo = vi.fn();
    vi.stubGlobal('scrollTo', scrollTo);
    restoreScrollPosition('');
    restoreScrollPosition(null);
    expect(scrollTo).not.toHaveBeenCalled();
  });
});

// ─── C.26 — setupReaderCopyButton ────────────────────────────────────────────

describe('setupReaderCopyButton', () => {
  const sampleChat = { id: 'c1', title: 'Hello', content: '# Hello' };

  function makeDom(withBtn = true) {
    document.body.innerHTML = withBtn
      ? `<button id="reader-copy-btn" type="button"><span class="btn-reader-action__label">Copy</span></button>`
      : `<div></div>`;
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    // Re-apply defaults after clearAllMocks
    const mod = await import('../src/lib/export/clipboard-serialiser.js');
    mod.getClipboardSettings.mockResolvedValue({ format: 'plain', includeEmojis: true, includeImages: false, includeAttachments: false, separator: '---' });
    mod.serialiseChats.mockImplementation((chats) => chats.map(c => c.title || '').join('\n'));
    mod.writeToClipboard.mockResolvedValue({ success: true, usedFallback: false });
    mod.writeToClipboardHtml.mockResolvedValue({ success: true, usedFallback: false });
  });

  it('returns gracefully when button is absent', async () => {
    makeDom(false);
    const storage = { get: vi.fn() };
    await expect(setupReaderCopyButton(sampleChat, storage)).resolves.toBeUndefined();
    expect(storage.get).not.toHaveBeenCalled();
  });

  it('success path: shows \u2713 Copied feedback after click', async () => {
    makeDom();
    await setupReaderCopyButton(sampleChat, { get: vi.fn() });
    document.getElementById('reader-copy-btn').click();
    await new Promise(r => setTimeout(r, 0));
    const label = document.querySelector('.btn-reader-action__label');
    expect(label.textContent).toBe('\u2713 Copied');
  });

  it('tooLarge path: skips clipboard write and shows error feedback', async () => {
    makeDom();
    const mod = await import('../src/lib/export/clipboard-serialiser.js');
    mod.serialiseChats.mockReturnValueOnce('x'.repeat(1_000_001));
    await setupReaderCopyButton(sampleChat, { get: vi.fn() });
    document.getElementById('reader-copy-btn').click();
    await new Promise(r => setTimeout(r, 0));
    expect(mod.writeToClipboard).not.toHaveBeenCalled();
    const label = document.querySelector('.btn-reader-action__label');
    expect(label.textContent).toBe('Too large');
  });

  it('fallback path: shows "Select all + paste" feedback', async () => {
    makeDom();
    const mod = await import('../src/lib/export/clipboard-serialiser.js');
    mod.writeToClipboard.mockResolvedValueOnce({ success: false, usedFallback: true });
    await setupReaderCopyButton(sampleChat, { get: vi.fn() });
    document.getElementById('reader-copy-btn').click();
    await new Promise(r => setTimeout(r, 0));
    const label = document.querySelector('.btn-reader-action__label');
    expect(label.textContent).toBe('Select all + paste');
  });
});
