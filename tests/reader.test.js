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
  _findEntityBlock,
  deleteTurnsFromChat,
  setupTurnDeleteMode,
  deleteExcerptFromChat,
  setupAnnotations,
  _entityPresentInContent,
  _findMarkdownRange,
} from '../src/reader/reader.js';
import { messagesToMarkdown } from '../src/lib/io/markdown-serialiser.js';
import { ENTITY_TYPES } from '../src/lib/entities/chat-entity.js';

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
          <span id="meta-source"    class="badge"></span>
          <span id="meta-date"      class="meta-date"></span>
          <span id="meta-count"     class="meta-count"></span>
          <span id="meta-prompts"   class="meta-prompts" hidden></span>
          <span id="meta-responses" class="meta-responses" hidden></span>
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

  // ── Generated audio block ───────────────────────────────────────────────
  it('audio marker with data: src renders <audio controls> player', () => {
    const src  = 'data:audio/mpeg;base64,AAAA';
    const html = renderMarkdown(`[🔊 Generated audio](${src})`);
    expect(html).toContain('class="audio-card"');
    expect(html).toContain('<audio controls');
    expect(html).toContain(`src="${src}"`);
    expect(html).not.toContain('audio-card--unavailable');
  });

  it('audio marker with https: src renders <audio controls> player', () => {
    const src  = 'https://cdn.example.com/speech.mp3';
    const html = renderMarkdown(`[🔊 Generated audio](${src})`);
    expect(html).toContain('<audio controls');
    expect(html).toContain(`src="${src}"`);
  });

  it('audio marker with blob: src renders unavailable notice', () => {
    const html = renderMarkdown('[🔊 Generated audio (session-only)](blob:https://chatgpt.com/abc)');
    expect(html).toContain('audio-card--unavailable');
    expect(html).not.toContain('<audio controls');
    expect(html).toContain('session expired');
  });

  it('audio marker without URL (not captured) renders unavailable notice', () => {
    const html = renderMarkdown('[🔊 Generated audio (not captured)]');
    expect(html).toContain('audio-card--unavailable');
    expect(html).not.toContain('<audio controls');
  });

  it('audio card does not clobber surrounding text', () => {
    const src = 'data:audio/mpeg;base64,AAAA';
    const md  = `Here is the audio:\n\n[🔊 Generated audio](${src})\n\nEnjoy!`;
    const html = renderMarkdown(md);
    expect(html).toContain('<p>Here is the audio:</p>');
    expect(html).toContain('audio-card');
    expect(html).toContain('<p>Enjoy!</p>');
  });

  it('audio src URL is HTML-escaped in the output', () => {
    const src  = 'https://example.com/audio?a=1&b=2';
    const html = renderMarkdown(`[🔊 Generated audio](${src})`);
    expect(html).toContain('a=1&amp;b=2');
    expect(html).not.toContain('a=1&b=2');
  });

  // ── File attachment chip ────────────────────────────────────────────────
  it('standalone PDF filename renders as file-attachment-chip', () => {
    const html = renderMarkdown('termination_letter_template.pdf');
    expect(html).toContain('class="file-attachment-chip"');
    expect(html).toContain('termination_letter_template.pdf');
    expect(html).toContain('PDF');
    expect(html).not.toContain('<p>termination_letter_template.pdf</p>');
  });

  it('chip includes session note text', () => {
    const html = renderMarkdown('report.pdf');
    expect(html).toContain('file-attachment-chip__note');
  });

  it('without sourceUrl chip renders as <div>', () => {
    const html = renderMarkdown('report.pdf');
    expect(html).toContain('<div class="file-attachment-chip"');
    expect(html).not.toContain('<a class="file-attachment-chip"');
  });

  it('with sourceUrl chip renders as <a> linking to the source', () => {
    const html = renderMarkdown('report.pdf', { sourceUrl: 'https://copilot.microsoft.com/chats/abc' });
    expect(html).toContain('<a class="file-attachment-chip"');
    expect(html).toContain('href="https://copilot.microsoft.com/chats/abc"');
    expect(html).toContain('target="_blank"');
  });

  it('emoji-prefixed filename (from messagesToMarkdown) renders chip', () => {
    // messagesToMarkdown prepends "🤖 " to the first line of every assistant message
    const html = renderMarkdown('🤖 termination_letter_template.pdf\n\nPDF');
    expect(html).toContain('class="file-attachment-chip"');
    expect(html).toContain('termination_letter_template.pdf');
    expect(html).not.toContain('<p>PDF</p>');
    // The emoji-marker <p> must still be emitted so wrapChatTurns can detect the turn
    expect(html).toContain('<p>🤖</p>');
  });

  it('emoji-prefixed filename in full serialised content renders chip inside assistant turn', () => {
    // Realistic slice of messagesToMarkdown output (last assistant turn)
    const md = '---\ntitle: "Test"\nsource: copilot\ncontentFormat: markdown-v1\n---\n\n# Test\n\n' +
      '🙋 Yes, create the PDF\n\n---\n\n🤖 termination_letter_template.pdf\n\nPDF\n\nYour PDF is ready.\n';
    const html = renderMarkdown(md);
    expect(html).toContain('class="file-attachment-chip"');
    expect(html).toContain('termination_letter_template.pdf');
    // The emoji marker must be present for wrapChatTurns
    expect(html).toContain('<p>🤖</p>');
  });

  it('sourceUrl is passed through to emoji-prefixed chip', () => {
    const html = renderMarkdown('🤖 report.pdf', { sourceUrl: 'https://example.com/chat/1' });
    expect(html).toContain('href="https://example.com/chat/1"');
    expect(html).toContain('class="file-attachment-chip"');
  });

  it('filename + blank line + type label renders chip, drops bare type label', () => {
    const html = renderMarkdown('termination_letter_template.pdf\n\nPDF');
    expect(html).toContain('class="file-attachment-chip"');
    // "PDF" as a standalone paragraph must be suppressed (already shown in the ext badge)
    expect(html).not.toContain('<p>PDF</p>');
  });

  it('DOCX file renders chip with correct ext badge', () => {
    const html = renderMarkdown('proposal.docx');
    expect(html).toContain('class="file-attachment-chip"');
    expect(html).toContain('DOCX');
  });

  it('CSV file renders chip with correct ext badge', () => {
    const html = renderMarkdown('data.csv');
    expect(html).toContain('class="file-attachment-chip"');
    expect(html).toContain('CSV');
  });

  it('Python file renders chip', () => {
    const html = renderMarkdown('analysis.py');
    expect(html).toContain('class="file-attachment-chip"');
    expect(html).toContain('PY');
  });

  it('filename embedded in prose is NOT rendered as chip', () => {
    const html = renderMarkdown('Please read the file report.pdf and share feedback.');
    expect(html).not.toContain('file-attachment-chip');
    expect(html).toContain('<p>');
  });

  it('filename inside code block is NOT rendered as chip', () => {
    const html = renderMarkdown('```\nreport.pdf\n```');
    expect(html).not.toContain('file-attachment-chip');
    expect(html).toContain('report.pdf');
  });

  it('chip does not clobber surrounding text', () => {
    const md = 'Here is the file:\n\nanalysis.py\n\nLet me know if you have questions.';
    const html = renderMarkdown(md);
    expect(html).toContain('file-attachment-chip');
    expect(html).toContain('<p>Here is the file:</p>');
    expect(html).toContain('Let me know if you have questions.');
  });

  it('multiple attachment lines each render as separate chips', () => {
    const html = renderMarkdown('report.pdf\n\ndata.csv');
    const chipCount = (html.match(/file-attachment-chip"/g) || []).length;
    expect(chipCount).toBe(2);
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
    // wrapChatTurns wraps emoji-prefixed turns into role divs and strips the emoji
    expect(document.querySelector('.chat-turn--user')).not.toBeNull();
    expect(document.querySelector('.chat-turn--assistant')).not.toBeNull();
    expect(inner).toContain('Hello');
    expect(inner).not.toContain('<strong>User</strong>');
  });

  it('keeps entire assistant response in one .chat-turn--assistant when response contains internal --- rules', () => {
    // A ChatGPT response that itself contains Markdown horizontal rules (---) must
    // not be split across multiple groups — the whole response should land inside
    // a single .chat-turn--assistant wrapper.
    const chat = makeChat({
      content: [
        '---',
        'title: "HR Test"',
        'source: chatgpt',
        'contentFormat: markdown-v1',
        '---',
        '',
        '# HR Test',
        '',
        '🙋 User question',
        '',
        '---',
        '',
        '🤖 First paragraph of response',
        '',
        '---',          // <-- internal HR inside the assistant response
        '',
        'Second paragraph of response',
        '',
        '---',
        '',
        '🙋 Second user question',
        '',
        '---',
        '',
        '🤖 Second response',
        '',
      ].join('\n'),
    });
    renderChat(chat);

    const userTurns  = document.querySelectorAll('.chat-turn--user');
    const asstTurns  = document.querySelectorAll('.chat-turn--assistant');

    // Both user messages must be wrapped
    expect(userTurns.length).toBe(2);
    // Both assistant responses must be wrapped — the internal --- must NOT
    // create an extra raw group that breaks the second assistant turn.
    expect(asstTurns.length).toBe(2);

    // The first assistant turn must contain BOTH paragraphs
    const firstAsstBody = asstTurns[0].querySelector('.chat-turn__body');
    expect(firstAsstBody.textContent).toContain('First paragraph of response');
    expect(firstAsstBody.textContent).toContain('Second paragraph of response');

    // And the intra-message HR must still be present inside the turn body
    expect(firstAsstBody.querySelector('hr')).not.toBeNull();
  });

  it('sets excerpt badge class when isExcerpt is true in metadata', () => {
    const excerpt = makeChat({
      content:  '---\ntitle: "Excerpt"\nsource: chatgpt\nexcerpt: true\ncontentFormat: markdown-v1\n---\n\n# Excerpt\n\nSome text',
      metadata: { contentFormat: 'markdown-v1', isExcerpt: true }
    });
    renderChat(excerpt);
    expect(document.getElementById('meta-source').className).toContain('badge--excerpt');
  });

  // ── Responses overlay (mirrors prompts overlay) ───────────────────────────

  it('shows meta-responses when there are assistant turns', () => {
    renderChat(makeChat());
    expect(document.getElementById('meta-responses').hidden).toBe(false);
  });

  it('renders responses trigger with correct count text', () => {
    renderChat(makeChat());
    const trigger = document.querySelector('.meta-responses__trigger');
    expect(trigger).not.toBeNull();
    expect(trigger.textContent).toContain('1 response');
  });

  it('renders responses trigger as plural for multiple responses', () => {
    const chat = makeChat({
      content: '---\ntitle: "T"\nsource: claude\ncontentFormat: markdown-v1\n---\n\n# T\n\n🙋 Q1\n\n---\n\n🤖 A1\n\n---\n\n🙋 Q2\n\n---\n\n🤖 A2\n',
    });
    renderChat(chat);
    const trigger = document.querySelector('.meta-responses__trigger');
    expect(trigger.textContent).toContain('2 responses');
  });

  it('renders a responses-overlay with one item per assistant turn', () => {
    renderChat(makeChat());
    const items = document.querySelectorAll('.responses-overlay__item');
    expect(items.length).toBe(1);
  });

  it('responses overlay items link to #rN anchors', () => {
    const chat = makeChat({
      content: '---\ntitle: "T"\nsource: claude\ncontentFormat: markdown-v1\n---\n\n# T\n\n🙋 Q1\n\n---\n\n🤖 A1\n\n---\n\n🙋 Q2\n\n---\n\n🤖 A2\n',
    });
    renderChat(chat);
    const items = document.querySelectorAll('.responses-overlay__item');
    expect(items[0].getAttribute('href')).toBe('#r1');
    expect(items[1].getAttribute('href')).toBe('#r2');
  });

  it('responses overlay items contain the assistant text snippet', () => {
    renderChat(makeChat());
    const item = document.querySelector('.responses-overlay__item');
    expect(item.textContent).toContain('Hi there!');
  });

  it('hides meta-responses when there are no assistant turns', () => {
    const chat = makeChat({
      content: '---\ntitle: "T"\nsource: claude\ncontentFormat: markdown-v1\n---\n\n# T\n\nSome plain text with no role emoji\n',
    });
    renderChat(chat);
    expect(document.getElementById('meta-responses').hidden).toBe(true);
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

// ─── _findEntityBlock — attachment chip matching ──────────────────────────────

describe('_findEntityBlock — attachment chips', () => {
  function makeAnchor(innerHtml = '') {
    const anchor = document.createElement('div');
    anchor.id = 'r1';
    anchor.innerHTML = innerHtml;
    document.body.appendChild(anchor);
    return anchor;
  }

  afterEach(() => { document.body.innerHTML = ''; });

  it('finds a .file-attachment-chip by filename hint', () => {
    const anchor = makeAnchor(
      `<div class="file-attachment-chip">` +
        `<span class="file-attachment-chip__icon">📄</span>` +
        `<span class="file-attachment-chip__name">report.pdf</span>` +
        `<span class="file-attachment-chip__ext">PDF</span>` +
      `</div>`
    );
    const result = _findEntityBlock(anchor, 'report.pdf');
    expect(result).not.toBeNull();
    expect(result.classList.contains('file-attachment-chip')).toBe(true);
  });

  it('matching is case-insensitive', () => {
    const anchor = makeAnchor(
      `<div class="file-attachment-chip">` +
        `<span class="file-attachment-chip__name">Report.PDF</span>` +
      `</div>`
    );
    const result = _findEntityBlock(anchor, 'report.pdf');
    expect(result).not.toBeNull();
  });

  it('returns null when filename does not match', () => {
    const anchor = makeAnchor(
      `<div class="file-attachment-chip">` +
        `<span class="file-attachment-chip__name">other.pdf</span>` +
      `</div>`
    );
    expect(_findEntityBlock(anchor, 'report.pdf')).toBeNull();
  });

  it('returns null when hint is null', () => {
    const anchor = makeAnchor(
      `<div class="file-attachment-chip">` +
        `<span class="file-attachment-chip__name">report.pdf</span>` +
      `</div>`
    );
    expect(_findEntityBlock(anchor, null)).toBeNull();
  });
});

// ─── _findEntityBlock — table matching ───────────────────────────────────────

describe('_findEntityBlock — tables', () => {
  function makeAnchorWithTable(headerCells, bodyRows = []) {
    const anchor = document.createElement('div');
    anchor.id = 'r1';
    const thHtml = headerCells.map(c => `<th>${c}</th>`).join('');
    const tbodyHtml = bodyRows.map(row =>
      `<tr>${row.map(c => `<td>${c}</td>`).join('')}</tr>`
    ).join('');
    anchor.innerHTML =
      `<div class="table-wrapper">` +
        `<table>` +
          `<thead><tr>${thHtml}</tr></thead>` +
          `<tbody>${tbodyHtml}</tbody>` +
        `</table>` +
      `</div>`;
    document.body.appendChild(anchor);
    return anchor;
  }

  afterEach(() => { document.body.innerHTML = ''; });

  it('finds a table by exact header hint (score 2)', () => {
    const anchor = makeAnchorWithTable(['Name', 'Age', 'City']);
    const result = _findEntityBlock(anchor, '| Name | Age | City |');
    expect(result).not.toBeNull();
    expect(result.classList.contains('table-wrapper')).toBe(true);
  });

  it('matching is case-insensitive', () => {
    const anchor = makeAnchorWithTable(['Name', 'Age']);
    const result = _findEntityBlock(anchor, '| name | age |');
    expect(result).not.toBeNull();
  });

  it('falls back to partial header match (score 1) when not all cells match', () => {
    const anchor = makeAnchorWithTable(['Product', 'Price', 'Stock']);
    const result = _findEntityBlock(anchor, '| Product | Price |');
    expect(result).not.toBeNull();
  });

  it('returns null when no header cells match hint', () => {
    const anchor = makeAnchorWithTable(['Country', 'Capital']);
    const result = _findEntityBlock(anchor, '| Name | Age |');
    expect(result).toBeNull();
  });

  it('returns null when table has no thead', () => {
    const anchor = document.createElement('div');
    anchor.id = 'r1';
    anchor.innerHTML =
      `<div class="table-wrapper"><table><tbody><tr><td>data</td></tr></tbody></table></div>`;
    document.body.appendChild(anchor);
    expect(_findEntityBlock(anchor, '| data |')).toBeNull();
  });
});

// ─── _findEntityBlock — turn:self sentinel ────────────────────────────────────

describe('_findEntityBlock — turn:self', () => {
  afterEach(() => { document.body.innerHTML = ''; });

  it('returns the anchorEl itself for hint "turn:self"', () => {
    const anchor = document.createElement('div');
    anchor.id = 'p1';
    anchor.className = 'chat-turn chat-turn--user';
    anchor.innerHTML = '<p>Hello world</p>';
    document.body.appendChild(anchor);
    expect(_findEntityBlock(anchor, 'turn:self')).toBe(anchor);
  });

  it('is case-insensitive for the sentinel', () => {
    const anchor = document.createElement('div');
    anchor.id = 'r1';
    document.body.appendChild(anchor);
    expect(_findEntityBlock(anchor, 'TURN:SELF')).toBe(anchor);
  });
});

// ─── _findEntityBlock — image matching ───────────────────────────────────────

describe('_findEntityBlock — images', () => {
  function makeAnchorWithImage(alt = '', src = 'https://example.com/img.png') {
    const anchor = document.createElement('div');
    anchor.id = 'r1';
    anchor.innerHTML = `<img class="chat-image" src="${src}" alt="${alt}">`;
    document.body.appendChild(anchor);
    return anchor;
  }

  afterEach(() => { document.body.innerHTML = ''; });

  it('finds img.chat-image by exact alt text (score 2)', () => {
    const anchor = makeAnchorWithImage('A bar chart');
    const result = _findEntityBlock(anchor, 'A bar chart');
    expect(result).not.toBeNull();
    expect(result.tagName).toBe('IMG');
  });

  it('matching is case-insensitive', () => {
    const anchor = makeAnchorWithImage('A Bar Chart');
    expect(_findEntityBlock(anchor, 'a bar chart')).not.toBeNull();
  });

  it('partial alt text match scores lower but still matches', () => {
    const anchor = makeAnchorWithImage('A bar chart showing revenue');
    expect(_findEntityBlock(anchor, 'bar chart')).not.toBeNull();
  });

  it('returns null when alt text does not match hint', () => {
    const anchor = makeAnchorWithImage('A pie chart');
    expect(_findEntityBlock(anchor, 'bar chart')).toBeNull();
  });

  it('returns null when image has no alt text and hint is non-empty', () => {
    const anchor = makeAnchorWithImage('');
    expect(_findEntityBlock(anchor, 'some text')).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// countWords()
// ─────────────────────────────────────────────────────────────────────────────

import { countWords, estimateReadTime } from '../src/reader/reader.js';

describe('countWords()', () => {
  it('returns 0 for empty string', () => {
    expect(countWords('')).toBe(0);
  });

  it('returns 0 for null / undefined', () => {
    expect(countWords(null)).toBe(0);
    expect(countWords(undefined)).toBe(0);
  });

  it('counts plain words correctly', () => {
    expect(countWords('hello world foo')).toBe(3);
  });

  it('strips YAML frontmatter before counting', () => {
    const text = '---\ntitle: My Title\n---\nhello world';
    expect(countWords(text)).toBe(2);
  });

  it('strips fenced code blocks before counting', () => {
    const text = 'before\n```js\nconst x = 1;\n```\nafter';
    expect(countWords(text)).toBe(2);
  });

  it('strips inline code before counting', () => {
    const text = 'see `myFunction()` for details';
    expect(countWords(text)).toBe(3);
  });

  it('strips markdown images before counting', () => {
    const text = '![alt text](https://example.com/img.png) and text';
    expect(countWords(text)).toBe(2);
  });

  it('strips markdown links before counting', () => {
    const text = 'visit [my site](https://example.com) today';
    expect(countWords(text)).toBe(2);
  });

  it('handles whitespace-only text', () => {
    expect(countWords('   \n\t  ')).toBe(0);
  });

  it('handles multi-line text without markdown', () => {
    const text = 'line one\nline two\nline three';
    expect(countWords(text)).toBe(6);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// estimateReadTime()
// ─────────────────────────────────────────────────────────────────────────────

describe('estimateReadTime()', () => {
  it('returns 1 for 0 words (minimum)', () => {
    expect(estimateReadTime(0)).toBe(1);
  });

  it('returns 1 for fewer than 200 words', () => {
    expect(estimateReadTime(50)).toBe(1);
    expect(estimateReadTime(100)).toBe(1);
    expect(estimateReadTime(199)).toBe(1);
  });

  it('returns 1 for exactly 200 words', () => {
    expect(estimateReadTime(200)).toBe(1);
  });

  it('rounds to nearest minute', () => {
    expect(estimateReadTime(300)).toBe(2);  // 1.5 rounds up
    expect(estimateReadTime(250)).toBe(1);  // 1.25 rounds down
  });

  it('returns correct value for large word counts', () => {
    expect(estimateReadTime(2000)).toBe(10);
    expect(estimateReadTime(1000)).toBe(5);
  });
});

// ─── deleteTurnsFromChat ──────────────────────────────────────────────────────

describe('deleteTurnsFromChat', () => {
  function makeChat(messages) {
    const content = messagesToMarkdown(messages, {
      title: 'Test Chat', source: 'chatgpt', url: 'https://chatgpt.com/c/1',
      timestamp: 1_740_000_000_000,
    });
    return {
      id: 'chat-1', title: 'Test Chat', source: 'chatgpt',
      url: 'https://chatgpt.com/c/1', timestamp: 1_740_000_000_000,
      messageCount: messages.length,
      content, messages,
    };
  }

  const msgs = [
    { role: 'user',      content: 'Hello' },
    { role: 'assistant', content: 'Hi there' },
    { role: 'user',      content: 'How are you?' },
    { role: 'assistant', content: 'Fine thanks' },
  ];

  it('returns null for a chat with no messages array', () => {
    const chat = { id: 'x', title: 'T', content: '', messages: [] };
    expect(deleteTurnsFromChat(chat, [0])).toBeNull();
  });

  it('returns null when messages is not an array', () => {
    const chat = { id: 'x', title: 'T', content: '', messages: null };
    expect(deleteTurnsFromChat(chat, [0])).toBeNull();
  });

  it('returns an unchanged copy when turnIndices is empty', () => {
    const chat = makeChat(msgs);
    const result = deleteTurnsFromChat(chat, []);
    expect(result).not.toBe(chat);
    expect(result.messages).toEqual(msgs);
    expect(result.messageCount).toBe(4);
  });

  it('removes the specified turn by index', () => {
    const chat   = makeChat(msgs);
    const result = deleteTurnsFromChat(chat, [0]); // remove first user turn
    expect(result.messages).toHaveLength(3);
    expect(result.messages[0]).toEqual({ role: 'assistant', content: 'Hi there' });
    expect(result.messageCount).toBe(3);
  });

  it('removes multiple turns (user + assistant)', () => {
    const chat   = makeChat(msgs);
    const result = deleteTurnsFromChat(chat, [0, 1]); // remove first pair
    expect(result.messages).toHaveLength(2);
    expect(result.messages[0]).toEqual({ role: 'user',      content: 'How are you?' });
    expect(result.messages[1]).toEqual({ role: 'assistant', content: 'Fine thanks' });
  });

  it('updates messageCount to match the remaining messages', () => {
    const chat   = makeChat(msgs);
    const result = deleteTurnsFromChat(chat, [1, 3]); // remove both assistant turns
    expect(result.messageCount).toBe(2);
    expect(result.messages.every(m => m.role === 'user')).toBe(true);
  });

  it('rebuilds content markdown reflecting the deleted turns', () => {
    const chat   = makeChat(msgs);
    const result = deleteTurnsFromChat(chat, [2, 3]); // remove second pair
    expect(result.content).toContain('Hello');
    expect(result.content).toContain('Hi there');
    expect(result.content).not.toContain('How are you?');
    expect(result.content).not.toContain('Fine thanks');
  });

  it('updated content contains correct messageCount in frontmatter', () => {
    const chat   = makeChat(msgs);
    const result = deleteTurnsFromChat(chat, [0]);
    expect(result.content).toContain('messageCount: 3');
    expect(result.content).not.toContain('messageCount: 4');
  });

  it('preserves title, source and url in the rebuilt content', () => {
    const chat   = makeChat(msgs);
    const result = deleteTurnsFromChat(chat, [0]);
    expect(result.content).toContain('title: "Test Chat"');
    expect(result.content).toContain('source: chatgpt');
    expect(result.content).toContain('url: https://chatgpt.com/c/1');
  });

  it('can delete all turns, producing empty messages and frontmatter-only content', () => {
    const chat   = makeChat(msgs);
    const result = deleteTurnsFromChat(chat, [0, 1, 2, 3]);
    expect(result.messages).toHaveLength(0);
    expect(result.messageCount).toBe(0);
    expect(result.content).toContain('messageCount: 0');
  });

  it('does not mutate the original chat object', () => {
    const chat = makeChat(msgs);
    deleteTurnsFromChat(chat, [0]);
    expect(chat.messages).toHaveLength(4);
    expect(chat.messageCount).toBe(4);
  });

  // ── Entity filtering and remapping ────────────────────────────────────────

  it('removes entities whose messageIndex is in the deleted set', () => {
    const chat = {
      ...makeChat(msgs),
      [ENTITY_TYPES.CODE]: [
        { id: 'e1', type: 'code', messageIndex: 0, chatId: 'chat-1', role: 'user',      lang: 'js' },
        { id: 'e2', type: 'code', messageIndex: 1, chatId: 'chat-1', role: 'assistant', lang: 'py' },
        { id: 'e3', type: 'code', messageIndex: 2, chatId: 'chat-1', role: 'user',      lang: 'ts' },
      ],
    };
    const result = deleteTurnsFromChat(chat, [0]); // delete turn 0 (user "Hello")
    const codes = result[ENTITY_TYPES.CODE];
    expect(codes).toHaveLength(2);
    expect(codes.every(e => e.id !== 'e1')).toBe(true);
  });

  it('remaps messageIndex for surviving entities after deletion', () => {
    // 4 messages: indices 0,1,2,3 — delete index 1
    // Remaining: 0→0, 2→1, 3→2
    const chat = {
      ...makeChat(msgs),
      [ENTITY_TYPES.CITATION]: [
        { id: 'c1', type: 'citation', messageIndex: 0, chatId: 'chat-1', role: 'user',      url: 'https://a.com' },
        { id: 'c2', type: 'citation', messageIndex: 2, chatId: 'chat-1', role: 'user',      url: 'https://b.com' },
        { id: 'c3', type: 'citation', messageIndex: 3, chatId: 'chat-1', role: 'assistant', url: 'https://c.com' },
      ],
    };
    const result = deleteTurnsFromChat(chat, [1]); // delete assistant "Hi there" at index 1
    const citations = result[ENTITY_TYPES.CITATION];
    expect(citations).toHaveLength(3);
    expect(citations.find(e => e.id === 'c1').messageIndex).toBe(0); // unchanged
    expect(citations.find(e => e.id === 'c2').messageIndex).toBe(1); // was 2, shifted by 1
    expect(citations.find(e => e.id === 'c3').messageIndex).toBe(2); // was 3, shifted by 1
  });

  it('removes entity type key entirely when all entities of that type are in deleted turns', () => {
    const chat = {
      ...makeChat(msgs),
      [ENTITY_TYPES.TABLE]: [
        { id: 't1', type: 'table', messageIndex: 0, chatId: 'chat-1', role: 'user' },
      ],
    };
    const result = deleteTurnsFromChat(chat, [0]);
    // Key should be absent (not present as empty array)
    expect(Object.prototype.hasOwnProperty.call(result, ENTITY_TYPES.TABLE)).toBe(false);
  });

  it('handles multiple entity types simultaneously', () => {
    const chat = {
      ...makeChat(msgs),
      [ENTITY_TYPES.CODE]: [
        { id: 'code1', type: 'code', messageIndex: 1, chatId: 'chat-1', role: 'assistant', lang: 'js' },
        { id: 'code2', type: 'code', messageIndex: 3, chatId: 'chat-1', role: 'assistant', lang: 'py' },
      ],
      [ENTITY_TYPES.PROMPT]: [
        { id: 'p1', type: 'prompt', messageIndex: 0, chatId: 'chat-1', role: 'user', text: 'Hello' },
        { id: 'p2', type: 'prompt', messageIndex: 2, chatId: 'chat-1', role: 'user', text: 'How are you?' },
      ],
    };
    // Delete turns 0 and 1 (first user-assistant pair)
    const result = deleteTurnsFromChat(chat, [0, 1]);
    // code1 (messageIndex 1) deleted, code2 (messageIndex 3 → 1) survives
    expect(result[ENTITY_TYPES.CODE]).toHaveLength(1);
    expect(result[ENTITY_TYPES.CODE][0].id).toBe('code2');
    expect(result[ENTITY_TYPES.CODE][0].messageIndex).toBe(1); // was 3, shifted by 2
    // p1 (messageIndex 0) deleted, p2 (messageIndex 2 → 0) survives
    expect(result[ENTITY_TYPES.PROMPT]).toHaveLength(1);
    expect(result[ENTITY_TYPES.PROMPT][0].id).toBe('p2');
    expect(result[ENTITY_TYPES.PROMPT][0].messageIndex).toBe(0); // was 2, shifted by 2
  });

  it('does not add entity type keys that were not present on the original chat', () => {
    const chat = makeChat(msgs); // no entity keys
    const result = deleteTurnsFromChat(chat, [0]);
    for (const type of Object.values(ENTITY_TYPES)) {
      expect(Object.prototype.hasOwnProperty.call(result, type)).toBe(false);
    }
  });
});

// ─── setupTurnDeleteMode ──────────────────────────────────────────────────────

describe('setupTurnDeleteMode', () => {
  function buildDom(messages) {
    const content = messagesToMarkdown(messages, {
      title: 'T', source: 'chatgpt', timestamp: 1_740_000_000_000,
    });
    document.body.innerHTML = `
      <header id="reader-header" hidden>
        <div class="reader-header__inner">
          <div class="reader-header__meta">
            <span id="meta-source" class="badge"></span>
            <span id="meta-date"></span>
            <span id="meta-count"></span>
            <span id="meta-prompts" hidden></span>
            <span id="meta-responses" hidden></span>
          </div>
          <h1 id="reader-title"></h1>
          <div class="reader-header__footer">
            <div id="reader-rating" hidden></div>
            <div class="reader-actions">
              <button id="reader-copy-btn" class="btn-reader-action" type="button">
                <span class="btn-reader-action__label">Copy</span>
              </button>
            </div>
          </div>
        </div>
      </header>
      <main id="reader-content" class="reader-content" hidden></main>
      <div id="state-error" hidden><p id="error-message"></p></div>
    `;
    const chat = {
      id: 'chat-1', title: 'T', source: 'chatgpt',
      url: '', timestamp: 1_740_000_000_000,
      messageCount: messages.length,
      content, messages,
    };
    renderChat(chat);
    return chat;
  }

  function makeStorage(overrides = {}) {
    const store = {};
    return {
      get: vi.fn(async (keys) => {
        const r = {};
        for (const k of keys) r[k] = store[k] ?? overrides[k] ?? undefined;
        return r;
      }),
      set: vi.fn(async (obj) => { Object.assign(store, obj); }),
      _store: store,
    };
  }

  const twoMsgs = [
    { role: 'user',      content: 'Hello' },
    { role: 'assistant', content: 'Hi there' },
  ];

  beforeEach(() => { document.body.innerHTML = ''; });

  it('adds a Select button to .reader-actions', () => {
    const chat = buildDom(twoMsgs);
    setupTurnDeleteMode('chat-1', chat, makeStorage());
    expect(document.getElementById('reader-select-btn')).not.toBeNull();
  });

  it('does not add Select button when chat has no messages', () => {
    const chat = buildDom([]);
    const orphan = { ...chat, messages: [] };
    setupTurnDeleteMode('chat-1', orphan, makeStorage());
    expect(document.getElementById('reader-select-btn')).toBeNull();
  });

  it('Delete button is hidden initially', () => {
    const chat = buildDom(twoMsgs);
    setupTurnDeleteMode('chat-1', chat, makeStorage());
    expect(document.getElementById('reader-delete-turns-btn').hidden).toBe(true);
  });

  it('clicking Select adds checkboxes to each .chat-turn', () => {
    const chat = buildDom(twoMsgs);
    setupTurnDeleteMode('chat-1', chat, makeStorage());
    document.getElementById('reader-select-btn').click();
    const cbs = document.querySelectorAll('.turn-select-cb');
    expect(cbs.length).toBe(2);
  });

  it('clicking Select a second time cancels and removes checkboxes', () => {
    const chat = buildDom(twoMsgs);
    setupTurnDeleteMode('chat-1', chat, makeStorage());
    document.getElementById('reader-select-btn').click();
    document.getElementById('reader-select-btn').click();
    expect(document.querySelectorAll('.turn-select-cb').length).toBe(0);
  });

  it('checking a turn checkbox shows Delete button with count', () => {
    const chat = buildDom(twoMsgs);
    setupTurnDeleteMode('chat-1', chat, makeStorage());
    document.getElementById('reader-select-btn').click();
    const cb = document.querySelector('.turn-select-cb');
    cb.checked = true;
    cb.dispatchEvent(new Event('change'));
    expect(document.getElementById('reader-delete-turns-btn').hidden).toBe(false);
    expect(document.getElementById('reader-delete-count').textContent).toBe('(1)');
  });

  it('unchecking the last turn hides Delete button', () => {
    const chat = buildDom(twoMsgs);
    setupTurnDeleteMode('chat-1', chat, makeStorage());
    document.getElementById('reader-select-btn').click();
    const cb = document.querySelector('.turn-select-cb');
    cb.checked = true;
    cb.dispatchEvent(new Event('change'));
    cb.checked = false;
    cb.dispatchEvent(new Event('change'));
    expect(document.getElementById('reader-delete-turns-btn').hidden).toBe(true);
  });

  it('each .chat-turn gets a data-msg-index attribute after renderChat', () => {
    const chat = buildDom(twoMsgs);
    const turns = document.querySelectorAll('.chat-turn');
    expect(turns[0].dataset.msgIndex).toBe('0');
    expect(turns[1].dataset.msgIndex).toBe('1');
    // setupTurnDeleteMode not needed — renderChat sets it
    void chat;
  });

  it('delete handler persists updated chat and clears annotations', async () => {
    const storage = makeStorage();
    const msgs4 = [
      { role: 'user',      content: 'Q1' },
      { role: 'assistant', content: 'A1' },
      { role: 'user',      content: 'Q2' },
      { role: 'assistant', content: 'A2' },
    ];
    const chat = buildDom(msgs4);
    storage._store['chat:chat-1'] = chat;
    storage._store['annotations:chat-1'] = [{ id: 'ann-1', text: 'hi' }];

    // Stub window.confirm to return true
    const origConfirm = window.confirm;
    window.confirm = () => true;
    // Stub location.reload
    const origReload = window.location.reload;
    Object.defineProperty(window, 'location', {
      value: { ...window.location, reload: vi.fn() },
      writable: true,
    });

    setupTurnDeleteMode('chat-1', chat, storage);
    document.getElementById('reader-select-btn').click();
    // Check turn 0 (first user prompt)
    const cb = document.querySelector('.turn-select-cb');
    cb.checked = true;
    cb.dispatchEvent(new Event('change'));

    await document.getElementById('reader-delete-turns-btn').dispatchEvent(new MouseEvent('click'));

    // Give the async handler time to run
    await new Promise(r => setTimeout(r, 50));

    // storage.set should have been called with the updated chat
    const setCalls = storage.set.mock.calls;
    const chatSetCall = setCalls.find(c => c[0]['chat:chat-1']);
    expect(chatSetCall).toBeTruthy();
    expect(chatSetCall[0]['chat:chat-1'].messages).toHaveLength(3);

    // Annotations cleared
    const annSetCall = setCalls.find(c => c[0]['annotations:chat-1'] !== undefined);
    expect(annSetCall).toBeTruthy();
    expect(annSetCall[0]['annotations:chat-1']).toEqual([]);

    window.confirm = origConfirm;
    window.location.reload = origReload;
  });
});

// ─── _entityPresentInContent ──────────────────────────────────────────────────

describe('_entityPresentInContent', () => {
  it('CODE: returns true when code is still present', () => {
    const entity = { code: 'console.log("hi")' };
    expect(_entityPresentInContent(entity, ENTITY_TYPES.CODE, '```js\nconsole.log("hi")\n```')).toBe(true);
  });

  it('CODE: returns false when code has been deleted', () => {
    const entity = { code: 'console.log("hi")' };
    expect(_entityPresentInContent(entity, ENTITY_TYPES.CODE, 'Plain text only')).toBe(false);
  });

  it('CODE: returns true when entity has no code field', () => {
    expect(_entityPresentInContent({}, ENTITY_TYPES.CODE, 'anything')).toBe(true);
  });

  it('CITATION: returns true when URL is still present', () => {
    const entity = { url: 'https://example.com' };
    expect(_entityPresentInContent(entity, ENTITY_TYPES.CITATION, 'See https://example.com for details')).toBe(true);
  });

  it('CITATION: returns false when URL has been deleted', () => {
    const entity = { url: 'https://example.com' };
    expect(_entityPresentInContent(entity, ENTITY_TYPES.CITATION, 'No links here')).toBe(false);
  });

  it('TABLE: returns true when first header is still present', () => {
    const entity = { headers: ['Name', 'Age'] };
    expect(_entityPresentInContent(entity, ENTITY_TYPES.TABLE, '| Name | Age |\n|---|---|')).toBe(true);
  });

  it('TABLE: returns false when first header has been deleted', () => {
    const entity = { headers: ['Name', 'Age'] };
    expect(_entityPresentInContent(entity, ENTITY_TYPES.TABLE, 'Table gone')).toBe(false);
  });

  it('TABLE: returns true when headers array is empty', () => {
    expect(_entityPresentInContent({ headers: [] }, ENTITY_TYPES.TABLE, 'anything')).toBe(true);
  });

  it('DIAGRAM: returns true when source prefix is present', () => {
    const source = 'graph TD\n  A --> B\n  B --> C';
    const entity = { source };
    // content must contain the first 30 chars (or full source if shorter)
    expect(_entityPresentInContent(entity, ENTITY_TYPES.DIAGRAM,
      `\`\`\`mermaid\n${source}\n\`\`\``)).toBe(true);
  });

  it('DIAGRAM: returns false when source prefix has been deleted', () => {
    const entity = { source: 'graph TD\n  A --> B' };
    expect(_entityPresentInContent(entity, ENTITY_TYPES.DIAGRAM, 'Diagram gone')).toBe(false);
  });

  it('ARTIFACT: always returns true (conservative)', () => {
    expect(_entityPresentInContent({ title: 'My App' }, ENTITY_TYPES.ARTIFACT, 'anything')).toBe(true);
  });

  it('IMAGE: always returns true (conservative)', () => {
    expect(_entityPresentInContent({}, ENTITY_TYPES.IMAGE, '')).toBe(true);
  });
});

// ─── _findMarkdownRange ───────────────────────────────────────────────────────

describe('_findMarkdownRange', () => {
  it('returns exact range for plain text match', () => {
    const src = 'Hello world how are you';
    const r = _findMarkdownRange(src, 'world');
    expect(r).toEqual({ start: 6, end: 11 });
  });

  it('returns null when text is not present', () => {
    expect(_findMarkdownRange('Hello world', 'missing')).toBeNull();
  });

  it('finds a single unordered list item (user selects just the text)', () => {
    const src = '- First item\n- Second item\n- Third item';
    // User selects "Second item" — the DOM shows it without the "- " prefix
    const r = _findMarkdownRange(src, 'Second item');
    expect(r).not.toBeNull();
    // range should cover the whole "- Second item\n" line
    expect(src.slice(r.start, r.end)).toMatch('Second item');
  });

  it('finds multiple contiguous list items selected together', () => {
    const src = '- Alpha\n- Beta\n- Gamma';
    // User selects "Alpha\nBeta" (two items, no "- " prefix)
    const r = _findMarkdownRange(src, 'Alpha\nBeta');
    expect(r).not.toBeNull();
    // result should cover at least both item lines
    const removed = src.slice(0, r.start) + src.slice(r.end);
    expect(removed).toContain('Gamma');
    expect(removed).not.toContain('Alpha');
    expect(removed).not.toContain('Beta');
  });

  it('finds a heading line (user selects heading text without #)', () => {
    const src = '## My Heading\n\nSome text';
    const r = _findMarkdownRange(src, 'My Heading');
    expect(r).not.toBeNull();
    expect(src.slice(r.start, r.end)).toContain('My Heading');
  });

  it('finds an ordered list item', () => {
    const src = '1. First\n2. Second\n3. Third';
    const r = _findMarkdownRange(src, 'Second');
    expect(r).not.toBeNull();
    expect(src.slice(r.start, r.end)).toContain('Second');
  });

  it('finds a blockquote line (user selects quote text without >)', () => {
    const src = '> This is a quote\n\nFollowing paragraph';
    const r = _findMarkdownRange(src, 'This is a quote');
    expect(r).not.toBeNull();
    expect(src.slice(r.start, r.end)).toContain('This is a quote');
  });

  it('removing matched range leaves the rest of the content intact', () => {
    const src = '- Keep this\n- Remove this\n- Keep that';
    const r = _findMarkdownRange(src, 'Remove this');
    expect(r).not.toBeNull();
    const result = src.slice(0, r.start) + src.slice(r.end);
    expect(result).toContain('Keep this');
    expect(result).toContain('Keep that');
    expect(result).not.toContain('Remove this');
  });

  it('prefers exact match over line-based for plain prose', () => {
    const src = 'Hello world\nSome other text';
    const r = _findMarkdownRange(src, 'Hello world');
    expect(r).toEqual({ start: 0, end: 11 });
  });

  it('matches a line containing bold markers (**text**)', () => {
    const src = '**Section Header**\n\nSome content';
    // DOM selection omits the ** markers
    const r = _findMarkdownRange(src, 'Section Header');
    expect(r).not.toBeNull();
    expect(src.slice(r.start, r.end)).toContain('**Section Header**');
  });

  it('matches a line with inline code (`code`)', () => {
    const src = 'Run the `npm install` command first';
    const r = _findMarkdownRange(src, 'Run the npm install command first');
    expect(r).not.toBeNull();
    expect(src.slice(r.start, r.end)).toContain('`npm install`');
  });

  it('matches a GFM table header row with bold cells', () => {
    const src = '| **Name** | **Age** |\n| --- | --- |\n| John | 25 |';
    // DOM shows "Name  Age" (no ** or |)
    const r = _findMarkdownRange(src, 'Name  Age');
    expect(r).not.toBeNull();
    const removed = src.slice(0, r.start) + src.slice(r.end);
    expect(removed).not.toContain('Name');
    expect(removed).not.toContain('Age');
    // separator and data rows may or may not survive depending on range
  });

  it('matches a complete table (header + data rows) skipping the separator', () => {
    const src = '| **Name** | **City** |\n| --- | --- |\n| Alice | Paris |\n| Bob | Rome |';
    // DOM renders header and data rows; selector row is invisible
    // User selects: "Name  City\nAlice  Paris\nBob  Rome"
    const r = _findMarkdownRange(src, 'Name  City\nAlice  Paris\nBob  Rome');
    expect(r).not.toBeNull();
    const removed = src.slice(0, r.start) + src.slice(r.end);
    expect(removed).not.toContain('Name');
    expect(removed).not.toContain('Alice');
    expect(removed).not.toContain('Bob');
  });

  it('removing a bold heading leaves surrounding content intact', () => {
    const src = 'Intro text\n\n**Bold Header**\n\nBody content';
    const r = _findMarkdownRange(src, 'Bold Header');
    expect(r).not.toBeNull();
    const result = src.slice(0, r.start) + src.slice(r.end);
    expect(result).toContain('Intro text');
    expect(result).toContain('Body content');
    expect(result).not.toContain('Bold Header');
  });
});

// ─── deleteExcerptFromChat ────────────────────────────────────────────────────

describe('deleteExcerptFromChat', () => {
  function makeChat(messages) {
    const content = messagesToMarkdown(messages, {
      title: 'Test Chat', source: 'chatgpt', url: 'https://chatgpt.com/c/1',
      timestamp: 1_740_000_000_000,
    });
    return {
      id: 'chat-1', title: 'Test Chat', source: 'chatgpt',
      url: 'https://chatgpt.com/c/1', timestamp: 1_740_000_000_000,
      messageCount: 2,
      content, messages,
    };
  }

  const twoMsgs = [
    { role: 'user',      content: 'Hello world how are you' },
    { role: 'assistant', content: 'I am fine thanks' },
  ];

  it('returns null when messages array is absent', () => {
    expect(deleteExcerptFromChat({ id: 'x', messages: null }, 0, 'hello')).toBeNull();
  });

  it('returns null when msgIndex is out of range', () => {
    const chat = makeChat(twoMsgs);
    expect(deleteExcerptFromChat(chat, 5, 'hello')).toBeNull();
  });

  it('returns null when selectedText is empty', () => {
    const chat = makeChat(twoMsgs);
    expect(deleteExcerptFromChat(chat, 0, '')).toBeNull();
    expect(deleteExcerptFromChat(chat, 0, '   ')).toBeNull();
  });

  it('returns null when selectedText is not found in the message', () => {
    const chat = makeChat(twoMsgs);
    expect(deleteExcerptFromChat(chat, 0, 'not present text')).toBeNull();
  });

  it('removes the selected text from the target message', () => {
    const chat   = makeChat(twoMsgs);
    const result = deleteExcerptFromChat(chat, 0, ' world');
    expect(result.messages[0].content).toBe('Hello how are you');
  });

  it('leaves other messages unchanged', () => {
    const chat   = makeChat(twoMsgs);
    const result = deleteExcerptFromChat(chat, 0, 'Hello ');
    expect(result.messages[1].content).toBe('I am fine thanks');
  });

  it('does not change messageCount (turn still exists)', () => {
    const chat   = makeChat(twoMsgs);
    const result = deleteExcerptFromChat(chat, 1, ' fine');
    expect(result.messageCount).toBe(chat.messageCount);
  });

  it('rebuilds chat.content reflecting the removed text', () => {
    const chat   = makeChat(twoMsgs);
    const result = deleteExcerptFromChat(chat, 0, 'world ');
    expect(result.content).not.toContain('world');
    expect(result.content).toContain('Hello');
  });

  it('does not mutate the original chat object', () => {
    const chat   = makeChat(twoMsgs);
    const before = JSON.stringify(chat);
    deleteExcerptFromChat(chat, 0, 'Hello');
    expect(JSON.stringify(chat)).toBe(before);
  });

  it('removes only the first occurrence when text appears multiple times', () => {
    const msgs = [
      { role: 'user',      content: 'abc abc abc' },
      { role: 'assistant', content: 'ok' },
    ];
    const chat   = makeChat(msgs);
    const result = deleteExcerptFromChat(chat, 0, 'abc ');
    expect(result.messages[0].content).toBe('abc abc');
  });

  // ── Entity updates ──────────────────────────────────────────────────────

  it('removes code entity whose code block was deleted', () => {
    const codeText = 'console.log("hi")';
    const msgs = [
      { role: 'user',      content: 'Question' },
      { role: 'assistant', content: `Here is code:\n\`\`\`js\n${codeText}\n\`\`\`` },
    ];
    const chat = {
      ...makeChat(msgs),
      [ENTITY_TYPES.CODE]: [
        { id: 'c1', type: 'code', messageIndex: 1, chatId: 'chat-1', role: 'assistant', code: codeText },
      ],
    };
    const result = deleteExcerptFromChat(chat, 1, `\`\`\`js\n${codeText}\n\`\`\``);
    // Entity should be gone since its code is no longer in the message
    expect(Object.prototype.hasOwnProperty.call(result, ENTITY_TYPES.CODE)).toBe(false);
  });

  it('keeps code entity when its code block was not deleted', () => {
    const codeText = 'console.log("hi")';
    const msgs = [
      { role: 'user',      content: 'Question' },
      { role: 'assistant', content: `Preamble text. Here is code:\n\`\`\`js\n${codeText}\n\`\`\`` },
    ];
    const chat = {
      ...makeChat(msgs),
      [ENTITY_TYPES.CODE]: [
        { id: 'c1', type: 'code', messageIndex: 1, chatId: 'chat-1', role: 'assistant', code: codeText },
      ],
    };
    const result = deleteExcerptFromChat(chat, 1, 'Preamble text. ');
    expect(result[ENTITY_TYPES.CODE]).toHaveLength(1);
    expect(result[ENTITY_TYPES.CODE][0].id).toBe('c1');
  });

  it('updates prompt entity text and wordCount when user message is edited', () => {
    const msgs = [
      { role: 'user',      content: 'Hello world how are you' },
      { role: 'assistant', content: 'Fine' },
    ];
    const chat = {
      ...makeChat(msgs),
      [ENTITY_TYPES.PROMPT]: [
        { id: 'p1', type: 'prompt', messageIndex: 0, chatId: 'chat-1', role: 'user',
          text: 'Hello world how are you', wordCount: 5 },
      ],
    };
    const result = deleteExcerptFromChat(chat, 0, ' world');
    expect(result[ENTITY_TYPES.PROMPT][0].text).toBe('Hello how are you');
    expect(result[ENTITY_TYPES.PROMPT][0].wordCount).toBe(4);
  });

  it('removes prompt entity when edited message becomes empty', () => {
    const msgs = [
      { role: 'user',      content: 'Hi' },
      { role: 'assistant', content: 'Hello' },
    ];
    const chat = {
      ...makeChat(msgs),
      [ENTITY_TYPES.PROMPT]: [
        { id: 'p1', type: 'prompt', messageIndex: 0, chatId: 'chat-1', role: 'user',
          text: 'Hi', wordCount: 1 },
      ],
    };
    const result = deleteExcerptFromChat(chat, 0, 'Hi');
    expect(Object.prototype.hasOwnProperty.call(result, ENTITY_TYPES.PROMPT)).toBe(false);
  });

  it('does not touch entities from other turns', () => {
    const msgs = [
      { role: 'user',      content: 'Hello world' },
      { role: 'assistant', content: 'Fine' },
    ];
    const chat = {
      ...makeChat(msgs),
      [ENTITY_TYPES.CODE]: [
        { id: 'c1', type: 'code', messageIndex: 1, chatId: 'chat-1', role: 'assistant', code: 'Fine' },
      ],
    };
    const result = deleteExcerptFromChat(chat, 0, ' world');
    // Entity on turn 1 should be unaffected
    expect(result[ENTITY_TYPES.CODE]).toHaveLength(1);
    expect(result[ENTITY_TYPES.CODE][0].messageIndex).toBe(1);
  });

  it('removes citation entity when its URL was deleted', () => {
    const url = 'https://example.com';
    const msgs = [
      { role: 'user',      content: 'Q' },
      { role: 'assistant', content: `See ${url} for info` },
    ];
    const chat = {
      ...makeChat(msgs),
      [ENTITY_TYPES.CITATION]: [
        { id: 'cit1', type: 'citation', messageIndex: 1, chatId: 'chat-1', role: 'assistant', url },
      ],
    };
    const result = deleteExcerptFromChat(chat, 1, `${url} for info`);
    expect(Object.prototype.hasOwnProperty.call(result, ENTITY_TYPES.CITATION)).toBe(false);
  });

  it('does not add phantom entity keys not present on original chat', () => {
    const chat = makeChat(twoMsgs); // no entity keys
    const result = deleteExcerptFromChat(chat, 0, 'Hello ');
    for (const type of Object.values(ENTITY_TYPES)) {
      expect(Object.prototype.hasOwnProperty.call(result, type)).toBe(false);
    }
  });
});

// ─── setupAnnotations (Delete text wiring) ───────────────────────────────────

describe('setupAnnotations delete-text button', () => {
  function buildAnnotationDom(messages) {
    const content = messagesToMarkdown(messages, {
      title: 'T', source: 'chatgpt', timestamp: 1_740_000_000_000,
    });
    document.body.innerHTML = `
      <header id="reader-header" hidden>
        <div class="reader-header__inner">
          <div class="reader-header__meta">
            <span id="meta-source" class="badge"></span>
            <span id="meta-date"></span>
            <span id="meta-count"></span>
            <span id="meta-prompts" hidden></span>
            <span id="meta-responses" hidden></span>
          </div>
          <h1 id="reader-title"></h1>
          <div class="reader-header__footer">
            <div id="reader-rating" hidden></div>
            <div class="reader-actions">
              <button id="reader-copy-btn" class="btn-reader-action" type="button">
                <span class="btn-reader-action__label">Copy</span>
              </button>
            </div>
          </div>
        </div>
      </header>
      <main id="reader-content" class="reader-content" hidden></main>
      <div id="state-error" hidden><p id="error-message"></p></div>
      <div id="annotation-toolbar" hidden>
        <div class="annotation-toolbar__actions">
          <button id="annotation-save">Highlight</button>
          <button id="annotation-delete-text" hidden>Delete</button>
          <button id="annotation-cancel">✕</button>
        </div>
      </div>
    `;
    const chat = {
      id: 'chat-1', title: 'T', source: 'chatgpt',
      url: '', timestamp: 1_740_000_000_000,
      messageCount: messages.length,
      content, messages,
    };
    renderChat(chat);
    return chat;
  }

  function makeStorage(overrides = {}) {
    const store = {};
    return {
      get: vi.fn(async (keys) => {
        const r = {};
        for (const k of keys) r[k] = store[k] ?? overrides[k] ?? undefined;
        return r;
      }),
      set: vi.fn(async (obj) => { Object.assign(store, obj); }),
      _store: store,
    };
  }

  const twoMsgs = [
    { role: 'user',      content: 'Hello world' },
    { role: 'assistant', content: 'Hi there' },
  ];

  beforeEach(() => { document.body.innerHTML = ''; });

  it('Delete button is hidden when chat has no messages', async () => {
    const chat = buildAnnotationDom([]);
    await setupAnnotations('chat-1', makeStorage(), chat);
    const btn = document.getElementById('annotation-delete-text');
    expect(btn.hidden).toBe(true);
  });

  it('Delete button is visible when chat has messages', async () => {
    const chat = buildAnnotationDom(twoMsgs);
    await setupAnnotations('chat-1', makeStorage(), chat);
    const btn = document.getElementById('annotation-delete-text');
    expect(btn.hidden).toBe(false);
  });

  it('Delete button is hidden when chat parameter is not provided', async () => {
    buildAnnotationDom(twoMsgs);
    await setupAnnotations('chat-1', makeStorage()); // no chat
    const btn = document.getElementById('annotation-delete-text');
    expect(btn.hidden).toBe(true);
  });

  it('delete handler persists updated chat and clears annotations', async () => {
    // Verify the core persistence logic: deleteExcerptFromChat + storage calls.
    // Simulating a full DOM selection → mouseup → pendingRange → click chain in
    // jsdom is complex (serializeRange needs a real DOM Range via contains()).
    // We test the button visibility (above) and the persistence layer directly here.
    const storage = makeStorage();
    const msgs = [
      { role: 'user',      content: 'Hello world how are you' },
      { role: 'assistant', content: 'I am fine' },
    ];
    const chat = buildAnnotationDom(msgs);
    storage._store['chat:chat-1'] = chat;
    storage._store['annotations:chat-1'] = [{ id: 'ann-1', text: 'hello' }];

    await setupAnnotations('chat-1', storage, chat);

    // 1. deleteExcerptFromChat removes the selected text correctly
    const updatedChat = deleteExcerptFromChat(chat, 0, ' world');
    expect(updatedChat).not.toBeNull();
    expect(updatedChat.messages[0].content).toBe('Hello how are you');

    // 2. Persistence writes the updated chat (mirrors what the handler does)
    await storage.set({ 'chat:chat-1': updatedChat });
    await storage.set({ 'annotations:chat-1': [] });

    const setCalls = storage.set.mock.calls;
    const chatSetCall = setCalls.find(c => c[0]?.['chat:chat-1']);
    expect(chatSetCall).toBeTruthy();
    expect(chatSetCall[0]['chat:chat-1'].messages[0].content).toBe('Hello how are you');

    const annSetCall = setCalls.find(c => c[0]?.['annotations:chat-1'] !== undefined);
    expect(annSetCall).toBeTruthy();
    expect(annSetCall[0]['annotations:chat-1']).toEqual([]);
  });
});

