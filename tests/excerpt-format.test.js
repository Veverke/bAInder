/**
 * Excerpt Format Integration Tests
 *
 * Verifies that the full excerpt-save pipeline (DOM selection → htmlToMarkdown
 * → buildExcerptPayload → saved content) preserves rich formatting.
 *
 * These tests mirror what actually runs in the browser:
 *   content.js contextmenu handler → htmlToMarkdown(cloneContents wrapper)
 *   → chrome.runtime.sendMessage(STORE_EXCERPT_CACHE)
 *   → background.js buildExcerptPayload(selectionText, url, richMarkdown)
 *
 * We use the exported htmlToMarkdown from chat-extractor.js (the module form
 * of the same function inlined in content.js) and buildExcerptPayload from
 * chat-save-handler.js.
 */

import { describe, it, expect } from 'vitest';
import { htmlToMarkdown } from '../src/content/chat-extractor.js';
import { buildExcerptPayload } from '../src/background/chat-save-handler.js';

// ─── helpers ──────────────────────────────────────────────────────────────────

/**
 * Wrap inner HTML in a div (mirrors `wrapper` from the contextmenu handler).
 */
function wrap(html) {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div;
}

/**
 * Run the full pipeline: HTML string → saved content string.
 * selectionText is the plain-text fallback (equivalent to info.selectionText).
 */
function saveExcerpt(html, selectionText, url = 'https://copilot.microsoft.com/') {
  const richMarkdown = htmlToMarkdown(wrap(html));
  return buildExcerptPayload(selectionText || richMarkdown, url, richMarkdown || null);
}

// ─── htmlToMarkdown: div-as-block-element ─────────────────────────────────────
// These test the fix: <div> elements must produce newlines, not concatenate.

describe('htmlToMarkdown() — div block formatting', () => {
  it('separates consecutive <div> lines with newlines', () => {
    const md = htmlToMarkdown(wrap(
      '<div>Line one</div><div>Line two</div><div>Line three</div>'
    ));
    expect(md).toContain('Line one');
    expect(md).toContain('Line two');
    expect(md).toContain('Line three');
    // Must NOT be a single concatenated line
    expect(md).not.toBe('Line oneLine twoLine three');
    const lines = md.split('\n').filter(l => l.trim());
    expect(lines.length).toBeGreaterThanOrEqual(3);
  });

  it('each <div> content appears on its own line', () => {
    const md = htmlToMarkdown(wrap(
      '<div>PA — father</div><div>SO — therefore</div><div>AS — like</div>'
    ));
    const lines = md.split('\n').filter(l => l.trim());
    expect(lines[0]).toBe('PA — father');
    expect(lines[1]).toBe('SO — therefore');
    expect(lines[2]).toBe('AS — like');
  });

  it('handles mixed <div> and inline spans inside divs', () => {
    const md = htmlToMarkdown(wrap(
      '<div><span>✅</span> Heading line</div>' +
      '<div><span>✔</span> Item one</div>' +
      '<div><span>✔</span> Item two</div>'
    ));
    const lines = md.split('\n').filter(l => l.trim());
    expect(lines[0]).toContain('Heading line');
    expect(lines[1]).toContain('Item one');
    expect(lines[2]).toContain('Item two');
  });

  it('nested divs collapse to single block, not doubled blank lines', () => {
    const md = htmlToMarkdown(wrap(
      '<div><div>Inner line A</div><div>Inner line B</div></div>'
    ));
    // Should not have more than one blank line between content
    expect(md).not.toMatch(/\n{3,}/);
    expect(md).toContain('Inner line A');
    expect(md).toContain('Inner line B');
  });
});

// ─── htmlToMarkdown: real Copilot selection patterns ─────────────────────────

describe('htmlToMarkdown() — realistic Copilot response fragments', () => {
  it('preserves a definition list rendered as div-per-entry', () => {
    // PA — father / SO — therefore / AS — like
    const html =
      '<div>✅ 2\u2011Letter Words (valid in word games)</div>' +
      '<div>PA \u2014 father</div>' +
      '<div>SO \u2014 therefore; musical note</div>' +
      '<div>AS \u2014 like</div>' +
      '<div>AR \u2014 the letter R</div>';
    const md = htmlToMarkdown(wrap(html));
    const lines = md.split('\n').filter(l => l.trim());

    expect(lines[0]).toContain('2\u2011Letter Words');
    expect(lines[1]).toBe('PA \u2014 father');
    expect(lines[2]).toBe('SO \u2014 therefore; musical note');
    expect(lines[3]).toBe('AS \u2014 like');
    expect(lines[4]).toBe('AR \u2014 the letter R');
  });

  it('preserves checkmark items rendered as <ul><li>', () => {
    const html =
      '<ul>' +
        '<li>Filter only Scrabble\u2011legal words</li>' +
        '<li>Generate only common everyday words</li>' +
        '<li>List only words of a certain length</li>' +
      '</ul>';
    const md = htmlToMarkdown(wrap(html));
    expect(md).toContain('- Filter only Scrabble\u2011legal words');
    expect(md).toContain('- Generate only common everyday words');
    expect(md).toContain('- List only words of a certain length');
  });

  it('preserves checkmark items rendered as div-per-line', () => {
    const html =
      '<div>✔ Filter only Scrabble\u2011legal words</div>' +
      '<div>✔ Generate only common everyday words</div>' +
      '<div>✔ List only words of a certain length</div>';
    const md = htmlToMarkdown(wrap(html));
    const lines = md.split('\n').filter(l => l.trim());
    expect(lines[0]).toContain('Filter only Scrabble');
    expect(lines[1]).toContain('Generate only common');
    expect(lines[2]).toContain('List only words');
  });

  it('preserves a fenced code block inside a div wrapper', () => {
    const html =
      '<div>Example:</div>' +
      '<div>' +
        '<pre><code class="language-javascript">/* c8 ignore next */\nconst x = 1;</code></pre>' +
      '</div>';
    const md = htmlToMarkdown(wrap(html));
    expect(md).toContain('Example:');
    expect(md).toContain('```javascript');
    expect(md).toContain('/* c8 ignore next */');
    expect(md).toContain('const x = 1;');
    expect(md).toContain('```');
  });

  it('preserves bold text inside divs', () => {
    const html =
      '<div><strong>Key point:</strong> use c8 ignore sparingly</div>' +
      '<div>Only skip lines that are environment-specific</div>';
    const md = htmlToMarkdown(wrap(html));
    expect(md).toContain('**Key point:**');
    expect(md).toContain('use c8 ignore sparingly');
    expect(md).toContain('Only skip lines');
  });

  it('re-creates the exact user-reported selection faithfully', () => {
    // This mirrors the example from the bug report.
    const html =
      '<div>\u2705 2\u2011Letter Words (valid in word games)</div>' +
      '<div>PA \u2014 father</div>' +
      '<div>SO \u2014 therefore; musical note</div>' +
      '<div>AS \u2014 like</div>' +
      '<div>AR \u2014 the letter R</div>' +
      '<div>OR \u2014 either</div>' +
      '<div>OP \u2014 a style of art/music (\u201cop art\u201d)</div>' +
      '<div></div>' +
      '<div>If you\u2019d like, I can also:</div>' +
      '<div>\u2714 Filter only Scrabble\u2011legal words</div>' +
      '<div>\u2714 Generate only common everyday words</div>' +
      '<div>\u2714 List only words of a certain length</div>' +
      '<div>\u2714 Show Scrabble or Words With Friends point values</div>';

    const md = htmlToMarkdown(wrap(html));
    const lines = md.split('\n').filter(l => l.trim());

    // Every entry must be its own line — not concatenated
    expect(lines.length).toBeGreaterThanOrEqual(11);
    expect(lines[0]).toContain('2\u2011Letter Words');
    expect(lines[1]).toBe('PA \u2014 father');
    expect(lines[2]).toBe('SO \u2014 therefore; musical note');
    expect(lines[6]).toContain('\u201cop art\u201d');
    expect(lines[7]).toContain('If you');
  });
});

// ─── Full pipeline: DOM → htmlToMarkdown → buildExcerptPayload → saved content

describe('Excerpt save pipeline — formatting preserved end-to-end', () => {
  it('saved content contains each definition on its own line', () => {
    const html =
      '<div>PA \u2014 father</div>' +
      '<div>SO \u2014 therefore; musical note</div>' +
      '<div>AS \u2014 like</div>';

    const payload = saveExcerpt(html, 'PA — father\nSO — therefore; musical note\nAS — like');
    expect(payload.content).toContain('PA \u2014 father');
    expect(payload.content).toContain('SO \u2014 therefore; musical note');
    expect(payload.content).toContain('AS \u2014 like');

    // Ensure they are NOT all on a single line in the saved content
    const contentLines = payload.content.split('\n').filter(l => l.trim());
    const paLine = contentLines.find(l => l.includes('PA'));
    const soLine = contentLines.find(l => l.includes('SO'));
    expect(paLine).not.toEqual(soLine); // must be different lines
  });

  it('saved content preserves code blocks', () => {
    const html =
      '<div>Use c8 ignore comment:</div>' +
      '<div><pre><code class="language-javascript">/* c8 ignore next */\nconst x = fallback();</code></pre></div>' +
      '<div>This skips the next line.</div>';

    const payload = saveExcerpt(html, 'Use c8 ignore comment:');
    expect(payload.content).toContain('```javascript');
    expect(payload.content).toContain('/* c8 ignore next */');
    expect(payload.content).toContain('const x = fallback();');
    expect(payload.content).toContain('This skips the next line.');
  });

  it('saved content preserves unordered list items', () => {
    const html =
      '<div>If you\u2019d like, I can also:</div>' +
      '<ul>' +
        '<li>Filter only Scrabble\u2011legal words</li>' +
        '<li>Generate only common everyday words</li>' +
      '</ul>';

    const payload = saveExcerpt(html, "If you'd like, I can also:\n- Filter only Scrabble-legal words");
    expect(payload.content).toContain("If you\u2019d like");
    expect(payload.content).toContain('- Filter only Scrabble\u2011legal words');
    expect(payload.content).toContain('- Generate only common everyday words');
  });

  it('title is derived from first meaningful line, not truncated mid-word', () => {
    const html =
      '<div>\u2705 2\u2011Letter Words (valid in word games)</div>' +
      '<div>PA \u2014 father</div>';

    const plain = '✅ 2‑Letter Words (valid in word games)\nPA — father';
    const payload = saveExcerpt(html, plain);

    // Title must not be empty
    expect(payload.title.length).toBeGreaterThan(0);
    // Title should not end in the middle of a word (no trailing partial word without ellipsis)
    const t = payload.title;
    if (t.length >= 80) {
      expect(t).toMatch(/\u2026$/); // ends with ellipsis if truncated
    }
    // Must not end with a bare space
    expect(t).not.toMatch(/ $/);
  });

  it('title is not repeated as a duplicate first line in the body', () => {
    const html = '<div>Some answer text here</div><div>More content on next line</div>';
    const payload = saveExcerpt(html, 'Some answer text here');

    const bodyLines = payload.content
      .replace(/^---[\s\S]*?---\n/, '')  // strip frontmatter
      .split('\n')
      .filter(l => l.trim());

    // Count how many times the title text appears
    const titleAppearances = bodyLines.filter(l =>
      l.includes(payload.title.replace(/…$/, ''))
    ).length;
    // Should appear once (in body), not twice (not also as # heading for excerpts)
    expect(titleAppearances).toBeLessThanOrEqual(1);
  });

  it('full user-reported excerpt: each entry on its own line in saved content', () => {
    const html =
      '<div>\u2705 2\u2011Letter Words (valid in word games)</div>' +
      '<div>PA \u2014 father</div>' +
      '<div>SO \u2014 therefore; musical note</div>' +
      '<div>AS \u2014 like</div>' +
      '<div>AR \u2014 the letter R</div>' +
      '<div>OR \u2014 either</div>' +
      '<div>OP \u2014 a style of art/music (\u201cop art\u201d)</div>' +
      '<div>If you\u2019d like, I can also:</div>' +
      '<div>\u2714 Filter only Scrabble\u2011legal words</div>' +
      '<div>\u2714 Generate only common everyday words</div>' +
      '<div>\u2714 List only words of a certain length</div>' +
      '<div>\u2714 Show Scrabble or Words With Friends point values</div>';

    const plainFallback =
      '✅ 2‑Letter Words (valid in word games)\n' +
      'PA — father\nSO — therefore; musical note\nAS — like\n' +
      'AR — the letter R\nOR — either\nOP — a style of art/music ("op art")\n' +
      'If you\'d like, I can also:\n' +
      '✔ Filter only Scrabble‑legal words\n✔ Generate only common everyday words\n' +
      '✔ List only words of a certain length\n✔ Show Scrabble or Words With Friends point values';

    const payload = saveExcerpt(html, plainFallback);

    // Strip frontmatter for line-by-line checking
    const body = payload.content.replace(/^---[\s\S]*?---\n/, '');

    // Every word-definition pair must be on a separate line
    ['PA \u2014 father', 'SO \u2014 therefore; musical note', 'AS \u2014 like',
     'AR \u2014 the letter R', 'OR \u2014 either'].forEach(entry => {
      const lineContaining = body.split('\n').find(l => l.includes(entry.split(' ')[0]));
      expect(lineContaining).toBeDefined();
      expect(lineContaining).toContain(entry);
    });

    // The checkmark items must appear
    expect(body).toContain('Filter only Scrabble');
    expect(body).toContain('Generate only common everyday words');

    // Critically: the entries must NOT be on a single concatenated line
    const allOnOneLine = body.split('\n').some(line =>
      line.includes('PA') && line.includes('SO') && line.includes('AS')
    );
    expect(allOnOneLine).toBe(false);
  });
});
