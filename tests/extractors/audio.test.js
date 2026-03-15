/**
 * tests/extractors/audio.test.js — Task D.3
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { extractAudio } from '../../src/lib/entities/extractors/audio.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a minimal JSDOM document containing the given HTML.
 */
function makeDoc(html) {
  document.body.innerHTML = html;
  return document;
}

/**
 * Mock global fetch to simulate blob URL responses.
 */
function mockFetch({ ok = true, status = 200, contentType = 'audio/webm',
                     size = 1000, bodyBuffer = null } = {}) {
  const buffer = bodyBuffer ?? new ArrayBuffer(size);
  global.fetch = vi.fn().mockResolvedValue({
    ok,
    status,
    headers: {
      get: (h) => {
        if (h === 'content-type')   return contentType;
        if (h === 'content-length') return String(size);
        return null;
      },
    },
    arrayBuffer: () => Promise.resolve(buffer),
  });
}

// ---------------------------------------------------------------------------
// DOM strategy tests
// ---------------------------------------------------------------------------

describe('extractAudio() — DOM strategy', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('DOM <audio src="https://…"> → entity created', async () => {
    makeDoc('<audio src="https://example.com/speech.mp3"></audio>');
    const result = await extractAudio([], document, 'chat-1');
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('audio');
    expect(result[0].src).toBe('https://example.com/speech.mp3');
  });

  it('DOM <audio> with transcript sibling → transcript populated', async () => {
    makeDoc(`
      <div>
        <audio src="https://example.com/s.mp3"></audio>
        <div class="transcript">Hello world transcript</div>
      </div>
    `);
    const result = await extractAudio([], document, 'chat-1');
    expect(result[0].transcript).toBe('Hello world transcript');
  });

  it('DOM <audio> without transcript → transcript is null', async () => {
    makeDoc('<audio src="https://example.com/s.mp3"></audio>');
    const result = await extractAudio([], document, 'chat-1');
    expect(result[0].transcript).toBeNull();
  });

  it('no <audio> elements → empty result', async () => {
    makeDoc('<p>No audio here</p>');
    const result = await extractAudio([], document, 'chat-1');
    expect(result).toHaveLength(0);
  });

  it('doc null → DOM strategy skipped, no throw', async () => {
    await expect(extractAudio([], null, 'chat-1')).resolves.toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Blob URL capture tests
// ---------------------------------------------------------------------------

describe('extractAudio() — blob URL capture', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('blob src → fetch() is called on it', async () => {
    mockFetch({ size: 500, contentType: 'audio/webm' });
    makeDoc('<audio src="blob:https://chat.openai.com/abc-123"></audio>');
    const result = await extractAudio([], document, 'chat-1');
    expect(global.fetch).toHaveBeenCalledWith('blob:https://chat.openai.com/abc-123');
    expect(result[0].src).toContain('data:audio/webm;base64,');
  });

  it('blob > 10 MB → captureError: "too_large", src: null', async () => {
    const bigBuffer = new ArrayBuffer(11 * 1024 * 1024);
    mockFetch({ size: 11 * 1024 * 1024, bodyBuffer: bigBuffer, contentType: 'audio/webm' });
    makeDoc('<audio src="blob:https://chat.openai.com/big-blob"></audio>');
    const result = await extractAudio([], document, 'chat-1');
    expect(result[0].captureError).toBe('too_large');
    expect(result[0].src).toBeNull();
  });

  it('expired blob (fetch rejects) → captureError: "expired"', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('network error'));
    makeDoc('<audio src="blob:https://chat.openai.com/expired"></audio>');
    const result = await extractAudio([], document, 'chat-1');
    expect(result[0].captureError).toBe('expired');
    expect(result[0].src).toBeNull();
  });

  it('blob fetch returns !ok → captureError: "expired"', async () => {
    mockFetch({ ok: false, status: 404 });
    makeDoc('<audio src="blob:https://chat.openai.com/gone"></audio>');
    const result = await extractAudio([], document, 'chat-1');
    expect(result[0].captureError).toBe('expired');
  });
});

// ---------------------------------------------------------------------------
// Structured content.parts tests
// ---------------------------------------------------------------------------

describe('extractAudio() — structured content.parts strategy', () => {
  it('message with audio part → entity with src and mimeType', async () => {
    const msgs = [{
      role:    'assistant',
      index:   1,
      content: [{ type: 'audio_url', url: 'https://cdn.example.com/audio.webm', mime_type: 'audio/webm' }],
    }];
    const result = await extractAudio(msgs, null, 'chat-1');
    expect(result).toHaveLength(1);
    expect(result[0].src).toBe('https://cdn.example.com/audio.webm');
    expect(result[0].mimeType).toBe('audio/webm');
  });

  it('transcript in part → transcript field populated', async () => {
    const msgs = [{
      role:    'assistant',
      index:   1,
      content: [{ type: 'audio', url: 'https://example.com/a.mp3', transcript: 'spoken words' }],
    }];
    const result = await extractAudio(msgs, null, 'chat-1');
    expect(result[0].transcript).toBe('spoken words');
  });

  it('no audio parts → empty result', async () => {
    const msgs = [{ role: 'assistant', index: 1, content: [{ type: 'text', text: 'hi' }] }];
    const result = await extractAudio(msgs, null, 'chat-1');
    expect(result).toHaveLength(0);
  });

  it('empty messages array → empty result', async () => {
    const result = await extractAudio([], null, 'chat-1');
    expect(result).toHaveLength(0);
  });

  it('chatId is stamped onto each entity', async () => {
    const msgs = [{
      role:    'assistant',
      index:   1,
      content: [{ type: 'audio', url: 'https://ex.com/a.mp3' }],
    }];
    const result = await extractAudio(msgs, null, 'my-chat');
    expect(result[0].chatId).toBe('my-chat');
  });
});

// ---------------------------------------------------------------------------
// Markdown marker strategy (Strategy 3) — stored message content
// ---------------------------------------------------------------------------

describe('extractAudio() — Markdown marker strategy', () => {
  function assistantMsg(content, index = 1) {
    return { role: 'assistant', index, content };
  }

  it('[🔊 Generated audio](data:…) → audio entity with src', async () => {
    const src  = 'data:audio/mpeg;base64,AAAA';
    const msgs = [assistantMsg(`\n[🔊 Generated audio](${src})\n`)];
    const result = await extractAudio(msgs, null, 'chat-1');
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('audio');
    expect(result[0].src).toBe(src);
    expect(result[0].captureError).toBeNull();
  });

  it('[🔊 Generated audio](https://…) → entity, no captureError', async () => {
    const src  = 'https://cdn.example.com/speech.mp3';
    const msgs = [assistantMsg(`[🔊 Generated audio](${src})`)];
    const result = await extractAudio(msgs, null, 'chat-1');
    expect(result[0].src).toBe(src);
    expect(result[0].captureError).toBeNull();
  });

  it('[🔊 Generated audio (session-only)](blob:…) → captureError "expired"', async () => {
    const src  = 'blob:https://chatgpt.com/abc-123';
    const msgs = [assistantMsg(`[🔊 Generated audio (session-only)](${src})`)];
    const result = await extractAudio(msgs, null, 'chat-1');
    expect(result[0].src).toBe(src);
    expect(result[0].captureError).toBe('expired');
  });

  it('duplicate markers in same message → deduplicated to 1', async () => {
    const src  = 'data:audio/mpeg;base64,AAAA';
    const msgs = [assistantMsg(`[🔊 Generated audio](${src})\n[🔊 Generated audio](${src})`)];
    const result = await extractAudio(msgs, null, 'chat-1');
    expect(result).toHaveLength(1);
  });

  it('mimeType guessed from data: prefix', async () => {
    const src  = 'data:audio/webm;base64,BBBB';
    const msgs = [assistantMsg(`[🔊 Generated audio](${src})`)];
    const result = await extractAudio(msgs, null, 'chat-1');
    expect(result[0].mimeType).toBe('audio/webm');
  });

  it('no markers in content → empty result (doc null)', async () => {
    const msgs = [assistantMsg('Just some text with no audio')];
    const result = await extractAudio(msgs, null, 'chat-1');
    expect(result).toHaveLength(0);
  });

  it('role is preserved from message', async () => {
    const src  = 'data:audio/mpeg;base64,CCCC';
    const msgs = [{ role: 'user', index: 0, content: `[🔊 Generated audio](${src})` }];
    const result = await extractAudio(msgs, null, 'chat-1');
    expect(result[0].role).toBe('user');
  });
});
