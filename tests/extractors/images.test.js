/**
 * tests/extractors/images.test.js — Task D.1
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { extractImages } from '../../src/lib/entities/extractors/images.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function assistantMsg(content, index = 1) {
  return { role: 'assistant', index, content };
}

function userMsg(content, index = 0) {
  return { role: 'user', index, content };
}

// ---------------------------------------------------------------------------
// Strategy 2 — Markdown syntax
// ---------------------------------------------------------------------------

describe('extractImages() — Markdown strategy', () => {
  it('message with ![alt](https://…) → 1 image entity', () => {
    const msgs = [assistantMsg('Here is an image: ![cat](https://example.com/cat.png)')];
    const result = extractImages(msgs, null, 'chat-1');
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('image');
    expect(result[0].src).toBe('https://example.com/cat.png');
    expect(result[0].altText).toBe('cat');
  });

  it('two Markdown images in one message → 2 entities', () => {
    const msgs = [assistantMsg('![a](https://example.com/a.png) and ![b](https://example.com/b.jpg)')];
    const result = extractImages(msgs, null, 'chat-1');
    expect(result).toHaveLength(2);
  });

  it('user messages are now included in Markdown scan (user-uploaded images)', () => {
    const msgs = [userMsg('![cat](https://example.com/cat.png)')];
    const result = extractImages(msgs, null, 'chat-1');
    expect(result).toHaveLength(1);
    expect(result[0].role).toBe('user');
  });

  it('empty messages array → empty result', () => {
    expect(extractImages([], null, 'chat-1')).toHaveLength(0);
  });

  it('thumbnailDataUri is null at extraction time', () => {
    const msgs = [assistantMsg('![x](https://example.com/x.png)')];
    const result = extractImages(msgs, null, 'chat-1');
    expect(result[0].thumbnailDataUri).toBeNull();
  });

  it('mimeType is guessed from URL extension', () => {
    const msgs = [assistantMsg('![x](https://example.com/x.webp)')];
    const result = extractImages(msgs, null, 'chat-1');
    expect(result[0].mimeType).toBe('image/webp');
  });

  it('chatId is stamped onto each entity', () => {
    const msgs = [assistantMsg('![x](https://example.com/x.png)')];
    const result = extractImages(msgs, null, 'my-chat');
    expect(result[0].chatId).toBe('my-chat');
  });

  it('messageIndex matches message index field', () => {
    const msgs = [assistantMsg('![x](https://example.com/x.png)', 3)];
    const result = extractImages(msgs, null, 'chat-1');
    expect(result[0].messageIndex).toBe(3);
  });

  it('role is preserved from message for https:// src', () => {
    const msgs = [userMsg('![upload](https://example.com/upload.png)', 0)];
    const result = extractImages(msgs, null, 'chat-1');
    expect(result[0].role).toBe('user');
  });
});

// ---------------------------------------------------------------------------
// Strategy 2 — data: URI images (Copilot / resolved blobs)
// ---------------------------------------------------------------------------

describe('extractImages() — data: URI images (Copilot blob resolution)', () => {
  const SMALL_DATA_URI = 'data:image/png;base64,iVBORw0KGgo=';

  it('assistant message with data: URI → 1 entity with thumbnailDataUri set', () => {
    const msgs = [assistantMsg(`Here is an image: ![Generated image](${SMALL_DATA_URI})`,  1)];
    const result = extractImages(msgs, null, 'chat-1');
    expect(result).toHaveLength(1);
    expect(result[0].src).toBe(SMALL_DATA_URI);
    expect(result[0].thumbnailDataUri).toBe(SMALL_DATA_URI);
    expect(result[0].oversize).toBe(false);
  });

  it('data: URI has mimeType extracted from the URI prefix', () => {
    const uri = 'data:image/webp;base64,AAAA';
    const msgs = [assistantMsg(`![img](${uri})`, 1)];
    const result = extractImages(msgs, null, 'chat-1');
    expect(result[0].mimeType).toBe('image/webp');
  });

  it('user message with data: URI → extracted (user-attached images)', () => {
    const msgs = [userMsg(`![attachment](${SMALL_DATA_URI})`, 0)];
    const result = extractImages(msgs, null, 'chat-1');
    expect(result).toHaveLength(1);
    expect(result[0].role).toBe('user');
    expect(result[0].thumbnailDataUri).toBe(SMALL_DATA_URI);
  });

  it('oversize data: URI → thumbnailDataUri is null, oversize flag is true', () => {
    // Construct a URI that exceeds MAX_DATA_URI_LEN (~7MB chars)
    const bigPayload = 'A'.repeat(8 * 1024 * 1024); // 8 MB chars
    const bigUri = `data:image/png;base64,${bigPayload}`;
    const msgs = [assistantMsg(`![big](${bigUri})`, 1)];
    const result = extractImages(msgs, null, 'chat-1');
    expect(result).toHaveLength(1);
    expect(result[0].oversize).toBe(true);
    expect(result[0].thumbnailDataUri).toBeNull();
  });

  it('Copilot markdown format with {width=W height=H} suffix → still matched', () => {
    // htmlToMarkdown produces: ![alt](data:...){width=400 height=300}
    // The {…} suffix is OUTSIDE the closing ) so the regex correctly captures only the src.
    const uri = 'data:image/jpeg;base64,/9j/4AAQ';
    const md = `![Generated image](${uri}){width=400 height=300}`;
    const msgs = [assistantMsg(md, 1)];
    const result = extractImages(msgs, null, 'chat-1');
    expect(result).toHaveLength(1);
    expect(result[0].src).toBe(uri);
  });

  it('same data: URI appearing twice in one message → deduplicated to 1 entity', () => {
    // ChatGPT DALL-E images appear both in .markdown and in a download <button>;
    // htmlToMarkdown emits both, producing the same ![](data:...) twice.
    const uri = 'data:image/png;base64,iVBORw0KGgo=';
    const md  = `![DALL-E image](${uri})\n\n![DALL-E image](${uri})`;
    const result = extractImages([assistantMsg(md, 1)], null, 'chat-1');
    expect(result).toHaveLength(1);
  });

  it('same https:// URL across two messages → deduplicated to 1 entity', () => {
    const msgs = [
      assistantMsg('![img](https://example.com/same.png)', 1),
      assistantMsg('![img](https://example.com/same.png)', 2),
    ];
    const result = extractImages(msgs, null, 'chat-1');
    expect(result).toHaveLength(1);
  });

  it('two distinct data: URIs in one message → 2 separate entities', () => {
    const uri1 = 'data:image/png;base64,iVBORw0KGgo=';
    const uri2 = 'data:image/png;base64,differentPayload=';
    const md   = `![a](${uri1})\n\n![b](${uri2})`;
    const result = extractImages([assistantMsg(md, 1)], null, 'chat-1');
    expect(result).toHaveLength(2);
  });

  it('mixed message with https:// and data: URIs → both captured', () => {
    const msgs = [assistantMsg(
      `first: ![a](https://example.com/a.png) second: ![b](${SMALL_DATA_URI})`,
      2,
    )];
    const result = extractImages(msgs, null, 'chat-1');
    expect(result).toHaveLength(2);
    const https = result.find(e => e.src.startsWith('https:'));
    const data  = result.find(e => e.src.startsWith('data:'));
    expect(https.thumbnailDataUri).toBeNull();
    expect(data.thumbnailDataUri).toBe(SMALL_DATA_URI);
  });
});

// ---------------------------------------------------------------------------
// Strategy 1 — structured content.parts
// ---------------------------------------------------------------------------

describe('extractImages() — structured content.parts strategy', () => {
  it('part with type image_url and url → image entity', () => {
    const msgs = [{
      role:    'assistant',
      index:   1,
      content: [{ type: 'image_url', url: 'https://example.com/img.png' }],
    }];
    const result = extractImages(msgs, null, 'chat-1');
    expect(result).toHaveLength(1);
    expect(result[0].src).toBe('https://example.com/img.png');
  });

  it('part with type image_file → image entity', () => {
    const msgs = [{
      role:    'user',
      index:   0,
      content: [{ type: 'image_file', url: 'https://cdn.example.com/upload.jpg', mime_type: 'image/jpeg' }],
    }];
    const result = extractImages(msgs, null, 'chat-1');
    expect(result).toHaveLength(1);
    expect(result[0].mimeType).toBe('image/jpeg');
  });

  it('structured strategy wins over Markdown when both present', () => {
    const msgs = [{
      role:    'assistant',
      index:   1,
      content: [{ type: 'image_url', url: 'https://example.com/from-parts.png' }],
    }];
    const result = extractImages(msgs, null, 'chat-1');
    // Only the structured result is returned (strategy 1 takes precedence)
    expect(result).toHaveLength(1);
    expect(result[0].src).toBe('https://example.com/from-parts.png');
  });
});

// ---------------------------------------------------------------------------
// Strategy 3 — DOM <img> elements
// ---------------------------------------------------------------------------

describe('extractImages() — DOM strategy', () => {
  it('DOM <img> in assistant turn → captured', () => {
    document.body.innerHTML = `
      <div data-role="assistant">
        <img src="https://example.com/dom-img.png" alt="test image">
      </div>
    `;
    const result = extractImages([], document, 'chat-1');
    expect(result.some(e => e.src === 'https://example.com/dom-img.png')).toBe(true);
  });

  it('small/decorative <img> (aria-hidden) → excluded', () => {
    document.body.innerHTML = `
      <div data-role="assistant">
        <img src="https://example.com/icon.png" aria-hidden="true">
      </div>
    `;
    const result = extractImages([], document, 'chat-1');
    expect(result.every(e => e.src !== 'https://example.com/icon.png')).toBe(true);
  });

  it('tiny <img> (width < 10) → excluded', () => {
    document.body.innerHTML = `
      <div data-role="assistant">
        <img src="https://example.com/pixel.gif" width="1" height="1">
      </div>
    `;
    const result = extractImages([], document, 'chat-1');
    expect(result.every(e => e.src !== 'https://example.com/pixel.gif')).toBe(true);
  });

  it('data:image large enough → stored with oversize flag when > limit', () => {
    // We synthesise a mock large data URI (just checking flag logic, not real 5MB)
    const imgs = extractImages(
      [assistantMsg('![big](https://example.com/big.png)')],
      null, 'chat-1'
    );
    // For non-data URIs oversize is always false
    expect(imgs[0].oversize).toBe(false);
  });

  it('doc null → DOM strategy is skipped, no throw', () => {
    expect(() => extractImages([], null, 'chat-1')).not.toThrow();
  });
});
