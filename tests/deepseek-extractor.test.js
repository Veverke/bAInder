/**
 * Tests for src/content/extractors/deepseek.js
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { extractDeepSeek } from '../src/content/extractors/deepseek.js';

function msg({ role = 'user', content = '', style = undefined } = {}) {
  const el = document.createElement('div');
  el.className = 'ds-message';
  const resolvedStyle = style !== undefined
    ? style
    : role === 'assistant' ? '--assistant-last-margin-bottom: 32px;' : null;
  if (resolvedStyle) el.setAttribute('style', resolvedStyle);
  el.innerHTML = content;
  return el;
}

describe('extractDeepSeek()', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.title = '';
  });

  it('throws when document is null', async () => {
    await expect(extractDeepSeek(null)).rejects.toThrow('Document is required');
  });

  it('returns a valid empty contract when no .ds-message nodes exist', async () => {
    const result = await extractDeepSeek(document);
    expect(result).toEqual({ title: 'Untitled Chat', messages: [], messageCount: 0 });
  });

  it('extracts a user and an assistant message in DOM order', async () => {
    document.body.appendChild(msg({ role: 'user',      content: 'Hello' }));
    document.body.appendChild(msg({ role: 'assistant', content: 'Hi there' }));
    const result = await extractDeepSeek(document);
    expect(result.messages).toHaveLength(2);
    expect(result.messages[0]).toEqual({ role: 'user',      content: 'Hello' });
    expect(result.messages[1]).toEqual({ role: 'assistant', content: 'Hi there' });
    expect(result.messageCount).toBe(2);
  });

  it('defaults role to user when style is absent', async () => {
    document.body.appendChild(msg({ style: null, content: 'No style' }));
    const result = await extractDeepSeek(document);
    expect(result.messages[0].role).toBe('user');
  });

  it('treats any style containing --assistant as assistant', async () => {
    document.body.appendChild(msg({
      content: 'Variant style',
      style: 'color: #222; --assistant-last-margin-bottom: 32px; margin-top: 4px;',
    }));
    const result = await extractDeepSeek(document);
    expect(result.messages[0].role).toBe('assistant');
  });

  it('preserves nested markup as markdown', async () => {
    document.body.appendChild(msg({
      role: 'assistant',
      content: '<p>Intro</p><ul><li>One</li><li><strong>Two</strong></li></ul><pre><code>const x = 1;</code></pre>',
    }));
    const content = (await extractDeepSeek(document)).messages[0].content;
    expect(content).toContain('Intro');
    expect(content).toContain('- One');
    expect(content).toContain('- **Two**');
    expect(content).toContain('```');
    expect(content).toContain('const x = 1;');
  });

  it('strips UI-noise lines: Retry, Copy, Share, Edit, Regenerate', async () => {
    document.body.appendChild(msg({
      role: 'assistant',
      content: '<p>Useful answer</p><p>Retry</p><p>Copy</p><p>Share</p><p>Edit</p><p>Regenerate</p>',
    }));
    const content = (await extractDeepSeek(document)).messages[0].content;
    expect(content).toContain('Useful answer');
    expect(content).not.toMatch(/^Retry$/m);
    expect(content).not.toMatch(/^Copy$/m);
    expect(content).not.toMatch(/^Share$/m);
    expect(content).not.toMatch(/^Edit$/m);
    expect(content).not.toMatch(/^Regenerate$/m);
  });

  it('uses page title first, trimming DeepSeek suffix', async () => {
    document.title = 'Vector search architecture - DeepSeek';
    document.body.appendChild(msg({ role: 'user', content: 'first prompt' }));
    const result = await extractDeepSeek(document);
    expect(result.title).toBe('Vector search architecture');
  });

  it('falls back to first user message when page title is empty', async () => {
    document.body.appendChild(msg({ role: 'user', content: 'How do I shard embeddings?' }));
    const result = await extractDeepSeek(document);
    expect(result.title).toBe('How do I shard embeddings?');
  });

  it('deduplicates nested .ds-message descendants', async () => {
    const outer = msg({ role: 'assistant', content: '<p>Outer</p>' });
    const nested = msg({ role: 'assistant', content: '<p>Nested</p>' });
    outer.appendChild(nested);
    document.body.appendChild(outer);
    const result = await extractDeepSeek(document);
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].content).toContain('Outer');
  });

  it('messageCount matches messages length', async () => {
    document.body.appendChild(msg({ role: 'user',      content: 'Q' }));
    document.body.appendChild(msg({ role: 'assistant', content: 'A' }));
    const result = await extractDeepSeek(document);
    expect(result.messageCount).toBe(result.messages.length);
  });
});
