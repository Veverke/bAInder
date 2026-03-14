/**
 * tests/extractors/citations.test.js — Task A.2
 */
import { describe, it, expect } from 'vitest';
import { extractCitations } from '../../src/lib/entities/extractors/citations.js';

// ── Text strategy ────────────────────────────────────────────────────────────

describe('extractCitations() — text strategy', () => {
  it('extracts citation from [N] URL — Title pattern', () => {
    const msgs = [{
      role: 'assistant',
      index: 1,
      content: 'See [1] https://example.com \u2014 Example Site for details.',
    }];
    const result = extractCitations(msgs, null, 'chat-1');
    expect(result).toHaveLength(1);
    expect(result[0].url).toBe('https://example.com');
    expect(result[0].title).toBe('Example Site for details.');
    expect(result[0].number).toBe('1');
  });

  it('extracts citation without title', () => {
    const msgs = [{ role: 'assistant', index: 1, content: '[2] https://foo.bar' }];
    const result = extractCitations(msgs, null, 'chat-1');
    expect(result).toHaveLength(1);
    expect(result[0].url).toBe('https://foo.bar');
    expect(result[0].title).toBe('');
  });

  it('extracts multiple citations from one message', () => {
    const msgs = [{
      role: 'assistant',
      index: 1,
      content: '[1] https://a.com \u2014 Site A\n[2] https://b.com \u2014 Site B',
    }];
    const result = extractCitations(msgs, null, 'chat-1');
    expect(result).toHaveLength(2);
    expect(result[0].url).toBe('https://a.com');
    expect(result[1].url).toBe('https://b.com');
  });

  it('user messages are excluded', () => {
    const msgs = [{ role: 'user', index: 0, content: '[1] https://example.com' }];
    expect(extractCitations(msgs, null, 'chat-1')).toHaveLength(0);
  });

  it('messages with no citation markers return empty result', () => {
    const msgs = [{ role: 'assistant', index: 1, content: 'No citations here.' }];
    expect(extractCitations(msgs, null, 'chat-1')).toHaveLength(0);
  });

  it('null doc does not throw', () => {
    expect(() => extractCitations([], null, 'chat-1')).not.toThrow();
  });

  it('model role is treated as assistant', () => {
    const msgs = [{ role: 'model', index: 1, content: '[1] https://g.co \u2014 Google' }];
    expect(extractCitations(msgs, null, 'chat-1')).toHaveLength(1);
  });

  it('chatId is stamped on every entity', () => {
    const msgs = [{ role: 'assistant', index: 1, content: '[1] https://x.com' }];
    extractCitations(msgs, null, 'chat-abc').forEach(e => {
      expect(e.chatId).toBe('chat-abc');
    });
  });
});

// ── DOM strategy ─────────────────────────────────────────────────────────────

describe('extractCitations() — DOM strategy', () => {
  it('extracts from [data-source] elements', () => {
    const doc = document.implementation.createHTMLDocument();
    const el = doc.createElement('div');
    el.dataset.source  = 'https://perplexity.ai/s/xyz';
    el.dataset.title   = 'Perplexity Result';
    el.dataset.snippet = 'Some snippet.';
    el.dataset.number  = '1';
    doc.body.appendChild(el);

    const msgs = [{ role: 'assistant', index: 1, content: '' }];
    const result = extractCitations(msgs, doc, 'chat-1');
    expect(result).toHaveLength(1);
    expect(result[0].url).toBe('https://perplexity.ai/s/xyz');
    expect(result[0].title).toBe('Perplexity Result');
    expect(result[0].snippet).toBe('Some snippet.');
  });

  it('DOM strategy takes precedence over text strategy', () => {
    // Doc has a [data-source] element AND the message text has a footnote.
    // Only the DOM-derived entity should be returned.
    const doc = document.implementation.createHTMLDocument();
    const el = doc.createElement('div');
    el.dataset.source = 'https://dom-source.com';
    doc.body.appendChild(el);

    const msgs = [{
      role: 'assistant', index: 1,
      content: '[1] https://text-source.com \u2014 Text Source',
    }];
    const result = extractCitations(msgs, doc, 'chat-1');
    expect(result).toHaveLength(1);
    expect(result[0].url).toBe('https://dom-source.com');
  });

  it('falls back to text strategy when DOM has no matching elements', () => {
    const doc = document.implementation.createHTMLDocument();
    // doc.body is empty — no [data-source], citation-block, or .source-item
    const msgs = [{
      role: 'assistant', index: 1,
      content: '[1] https://example.com \u2014 Fallback',
    }];
    const result = extractCitations(msgs, doc, 'chat-1');
    expect(result).toHaveLength(1);
    expect(result[0].url).toBe('https://example.com');
  });
});
