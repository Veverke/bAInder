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
  applySettingsFromValues,
  watchReaderSettings,
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

// ─── applySettingsFromValues ───────────────────────────────────────────────────────

describe('applySettingsFromValues', () => {
  const html = () => document.documentElement;

  beforeEach(() => {
    html().removeAttribute('data-theme');
    html().removeAttribute('data-skin');
    html().removeAttribute('data-accent');
    html().removeAttribute('data-oled');
  });

  it('sets data-theme for a named theme', () => {
    applySettingsFromValues({ theme: 'dark' });
    expect(html().getAttribute('data-theme')).toBe('dark');
  });

  it('defaults to light when theme is absent', () => {
    applySettingsFromValues({});
    expect(html().getAttribute('data-theme')).toBe('light');
  });

  it('sets data-theme=dark and data-oled for oled theme', () => {
    applySettingsFromValues({ theme: 'oled' });
    expect(html().getAttribute('data-theme')).toBe('dark');
    expect(html().hasAttribute('data-oled')).toBe(true);
  });

  it('removes data-oled when switching away from oled', () => {
    html().setAttribute('data-oled', '');
    applySettingsFromValues({ theme: 'light' });
    expect(html().hasAttribute('data-oled')).toBe(false);
    expect(html().getAttribute('data-theme')).toBe('light');
  });

  it('applies auto theme based on prefers-color-scheme (mocked light)', () => {
    vi.stubGlobal('matchMedia', q => ({ matches: false, media: q }));
    applySettingsFromValues({ theme: 'auto' });
    expect(html().getAttribute('data-theme')).toBe('light');
  });

  it('applies auto theme based on prefers-color-scheme (mocked dark)', () => {
    vi.stubGlobal('matchMedia', q => ({ matches: true, media: q }));
    applySettingsFromValues({ theme: 'auto' });
    expect(html().getAttribute('data-theme')).toBe('dark');
  });

  it('sets data-skin when skin is provided', () => {
    applySettingsFromValues({ theme: 'light', skin: 'rounded' });
    expect(html().getAttribute('data-skin')).toBe('rounded');
  });

  it('removes data-skin when skin is empty string', () => {
    html().setAttribute('data-skin', 'sharp');
    applySettingsFromValues({ theme: 'light', skin: '' });
    expect(html().hasAttribute('data-skin')).toBe(false);
  });

  it('removes data-skin when skin is absent', () => {
    html().setAttribute('data-skin', 'sharp');
    applySettingsFromValues({ theme: 'light' });
    expect(html().hasAttribute('data-skin')).toBe(false);
  });

  it('sets data-accent when provided', () => {
    applySettingsFromValues({ theme: 'light', accent: 'teal' });
    expect(html().getAttribute('data-accent')).toBe('teal');
  });

  it('removes data-accent when absent', () => {
    html().setAttribute('data-accent', 'teal');
    applySettingsFromValues({ theme: 'light' });
    expect(html().hasAttribute('data-accent')).toBe(false);
  });

  it('sets all three attributes at once', () => {
    applySettingsFromValues({ theme: 'terminal', skin: 'sharp', accent: 'green' });
    expect(html().getAttribute('data-theme')).toBe('terminal');
    expect(html().getAttribute('data-skin')).toBe('sharp');
    expect(html().getAttribute('data-accent')).toBe('green');
  });
});

// ─── watchReaderSettings ──────────────────────────────────────────────────────────
describe('watchReaderSettings', () => {
  let listener;
  const html = () => document.documentElement;

  beforeEach(() => {
    listener = null;
    html().removeAttribute('data-theme');
    html().removeAttribute('data-skin');
    html().removeAttribute('data-accent');
    html().removeAttribute('data-oled');

    // Provide a stub chrome.storage.onChanged that captures the listener
    vi.stubGlobal('chrome', {
      storage: {
        onChanged: {
          addListener: vi.fn(fn => { listener = fn; }),
        },
      },
    });
  });

  function fire(changes, area = 'local') {
    listener?.(changes, area);
  }

  it('registers exactly one listener', () => {
    watchReaderSettings();
    expect(chrome.storage.onChanged.addListener).toHaveBeenCalledTimes(1);
  });

  it('updates data-theme when theme changes', () => {
    html().setAttribute('data-theme', 'light');
    watchReaderSettings();
    fire({ theme: { oldValue: 'light', newValue: 'dark' } });
    expect(html().getAttribute('data-theme')).toBe('dark');
  });

  it('updates data-skin when skin changes', () => {
    html().setAttribute('data-theme', 'light');
    watchReaderSettings();
    fire({ skin: { oldValue: '', newValue: 'rounded' } });
    expect(html().getAttribute('data-skin')).toBe('rounded');
  });

  it('removes data-skin when skin is cleared', () => {
    html().setAttribute('data-theme', 'light');
    html().setAttribute('data-skin', 'sharp');
    watchReaderSettings();
    fire({ skin: { oldValue: 'sharp', newValue: undefined } });
    expect(html().hasAttribute('data-skin')).toBe(false);
  });

  it('updates data-accent when accent changes', () => {
    html().setAttribute('data-theme', 'light');
    watchReaderSettings();
    fire({ accent: { oldValue: '', newValue: 'teal' } });
    expect(html().getAttribute('data-accent')).toBe('teal');
  });

  it('does nothing for sync area changes', () => {
    html().setAttribute('data-theme', 'light');
    watchReaderSettings();
    fire({ theme: { oldValue: 'light', newValue: 'dark' } }, 'sync');
    expect(html().getAttribute('data-theme')).toBe('light'); // unchanged
  });

  it('does nothing when only unrelated keys change', () => {
    html().setAttribute('data-theme', 'light');
    watchReaderSettings();
    fire({ unrelated: { oldValue: 'a', newValue: 'b' } });
    expect(html().getAttribute('data-theme')).toBe('light'); // unchanged
  });

  it('preserves existing skin when only theme changes', () => {
    html().setAttribute('data-theme', 'light');
    html().setAttribute('data-skin', 'elevated');
    watchReaderSettings();
    fire({ theme: { oldValue: 'light', newValue: 'neon' } });
    expect(html().getAttribute('data-theme')).toBe('neon');
    expect(html().getAttribute('data-skin')).toBe('elevated');
  });

  it('sets oled attribute when theme changes to oled', () => {
    html().setAttribute('data-theme', 'light');
    watchReaderSettings();
    fire({ theme: { oldValue: 'light', newValue: 'oled' } });
    expect(html().getAttribute('data-theme')).toBe('dark');
    expect(html().hasAttribute('data-oled')).toBe(true);
  });

  it('is a no-op when chrome.storage.onChanged is unavailable', () => {
    vi.stubGlobal('chrome', undefined);
    expect(() => watchReaderSettings()).not.toThrow();
  });
});
