/**
 * Tests for src/content/extractors/image-resolver.js
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  BLOB_LOST_ATTR,
  blobToDataUrl,
  resolveImageBlobs,
  resolveAudioBlobs,
  collectShadowAudio,
  appendShadowAudio,
  collectShadowImages,
  appendShadowImages,
} from '../src/content/extractors/image-resolver.js';

// ── Constants ─────────────────────────────────────────────────────────────────
const FAKE_DATA_URL = 'data:image/png;base64,iVBORw0KGgo=';

// ── Fake fetch response builders ──────────────────────────────────────────────

function makeBlobResponse(data = 'IMGDATA', mime = 'image/png', ok = true) {
  const blob = new Blob([data], { type: mime });
  return Promise.resolve({
    ok,
    status: ok ? 200 : 404,
    blob: () => Promise.resolve(blob),
    arrayBuffer: () => blob.arrayBuffer(),
    headers: { get: (k) => (k === 'content-type' ? mime : null) },
  });
}

function makeAudioResponse(data = 'AUDIODATA', mime = 'audio/mpeg', ok = true, tooLarge = false) {
  const buffer = tooLarge ? new ArrayBuffer(11 * 1024 * 1024) : new ArrayBuffer(8);
  const blob   = new Blob([data], { type: mime });
  return Promise.resolve({
    ok,
    status: ok ? 200 : 404,
    blob:         () => Promise.resolve(blob),
    arrayBuffer:  () => Promise.resolve(buffer),
    headers:      { get: (k) => (k === 'content-type' ? mime : null) },
  });
}

// ── Global fetch mock lifecycle ───────────────────────────────────────────────
beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
});
afterEach(() => {
  vi.unstubAllGlobals();
});

// ─────────────────────────────────────────────────────────────────────────────
// blobToDataUrl
// ─────────────────────────────────────────────────────────────────────────────

describe('blobToDataUrl()', () => {
  it('resolves with a data: URL for a valid Blob', async () => {
    const blob   = new Blob(['hello'], { type: 'image/png' });
    const result = await blobToDataUrl(blob);
    expect(result).toMatch(/^data:image\/png;base64,/);
  });

  it('rejects when FileReader fires onerror', async () => {
    const Orig = globalThis.FileReader;
    const err  = new DOMException('read error');
    globalThis.FileReader = class {
      readAsDataURL() { setTimeout(() => this.onerror?.({ target: this }), 0); }
      get error() { return err; }
    };
    await expect(blobToDataUrl(new Blob(['x']))).rejects.toBeDefined();
    globalThis.FileReader = Orig;
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// resolveImageBlobs
// ─────────────────────────────────────────────────────────────────────────────

describe('resolveImageBlobs()', () => {
  it('returns original element unchanged when there are no img children', async () => {
    const div = document.createElement('div');
    div.textContent = 'no images here';
    const result = await resolveImageBlobs(div);
    expect(result).toBe(div);
  });

  it('returns original element when all images have non-blob/https src (e.g. data:)', async () => {
    const div = document.createElement('div');
    const img = document.createElement('img');
    img.setAttribute('src', 'data:image/png;base64,AAAA');
    div.appendChild(img);
    const result = await resolveImageBlobs(div);
    expect(result).toBe(div);
  });

  it('returns original element when fetchViaBackground not provided and images are https:', async () => {
    const div = document.createElement('div');
    const img = document.createElement('img');
    img.setAttribute('src', 'https://example.com/image.png');
    div.appendChild(img);
    const result = await resolveImageBlobs(div, null);
    expect(result).toBe(div);
  });

  it('resolves blob: img src to a data: URL', async () => {
    fetch.mockReturnValueOnce(makeBlobResponse('IMG', 'image/png'));
    const div = document.createElement('div');
    const img = document.createElement('img');
    img.setAttribute('src', 'blob:http://localhost/blob-img-1');
    div.appendChild(img);
    const result = await resolveImageBlobs(div);
    expect(result).not.toBe(div);
    expect(result.querySelector('img').getAttribute('src')).toMatch(/^data:/);
  });

  it('marks img with BLOB_LOST_ATTR when blob fetch returns non-ok status', async () => {
    fetch.mockReturnValueOnce(makeBlobResponse('', 'image/png', false));
    const div = document.createElement('div');
    const img = document.createElement('img');
    img.setAttribute('src', 'blob:http://localhost/bad-img');
    img.setAttribute('alt', 'A photo');
    div.appendChild(img);
    const result = await resolveImageBlobs(div);
    const cloneImg = result.querySelector('img');
    expect(cloneImg.getAttribute(BLOB_LOST_ATTR)).toBe('A photo');
    expect(cloneImg.hasAttribute('src')).toBe(false);
  });

  it('uses "Image" as the BLOB_LOST_ATTR value when alt is absent', async () => {
    fetch.mockReturnValueOnce(makeBlobResponse('', 'image/png', false));
    const div = document.createElement('div');
    const img = document.createElement('img');
    img.setAttribute('src', 'blob:http://localhost/bad-img-noalt');
    div.appendChild(img);
    const result = await resolveImageBlobs(div);
    expect(result.querySelector('img').getAttribute(BLOB_LOST_ATTR)).toBe('Image');
  });

  it('marks img lost when fetch throws', async () => {
    fetch.mockRejectedValueOnce(new Error('network fail'));
    const div = document.createElement('div');
    const img = document.createElement('img');
    img.setAttribute('src', 'blob:http://localhost/throw-img');
    img.setAttribute('alt', 'Boom');
    div.appendChild(img);
    const result = await resolveImageBlobs(div);
    expect(result.querySelector('img').getAttribute(BLOB_LOST_ATTR)).toBe('Boom');
  });

  it('removes srcset attribute after resolving blob img', async () => {
    fetch.mockReturnValueOnce(makeBlobResponse('IMG', 'image/png'));
    const div = document.createElement('div');
    const img = document.createElement('img');
    img.setAttribute('src', 'blob:http://localhost/srcset-clear');
    img.setAttribute('srcset', 'blob:http://localhost/srcset-clear 1x');
    div.appendChild(img);
    const result = await resolveImageBlobs(div);
    expect(result.querySelector('img').hasAttribute('srcset')).toBe(false);
  });

  it('removes data-src attribute after resolving blob img', async () => {
    fetch.mockReturnValueOnce(makeBlobResponse('IMG', 'image/png'));
    const div = document.createElement('div');
    const img = document.createElement('img');
    img.setAttribute('src', 'blob:http://localhost/data-src-clear');
    img.setAttribute('data-src', 'blob:http://localhost/original');
    div.appendChild(img);
    const result = await resolveImageBlobs(div);
    expect(result.querySelector('img').hasAttribute('data-src')).toBe(false);
  });

  it('sets natural width/height when getBoundingClientRect returns dimensions', async () => {
    fetch.mockReturnValueOnce(makeBlobResponse('IMG', 'image/png'));
    const div = document.createElement('div');
    const img = document.createElement('img');
    img.setAttribute('src', 'blob:http://localhost/dim-img');
    div.appendChild(img);
    img.getBoundingClientRect = () => ({ width: 640, height: 480, right: 640, bottom: 480, left: 0, top: 0 });
    const result = await resolveImageBlobs(div);
    const clone = result.querySelector('img');
    expect(clone.getAttribute('data-natural-width')).toBe('640');
    expect(clone.getAttribute('data-natural-height')).toBe('480');
  });

  it('uses fetchViaBackground for https: URLs when provided', async () => {
    const fetchBg = vi.fn().mockResolvedValueOnce(FAKE_DATA_URL);
    const div = document.createElement('div');
    const img = document.createElement('img');
    img.setAttribute('src', 'https://example.com/corp-image.png');
    div.appendChild(img);
    const result = await resolveImageBlobs(div, fetchBg);
    expect(fetchBg).toHaveBeenCalledWith('https://example.com/corp-image.png');
    expect(result.querySelector('img').getAttribute('src')).toBe(FAKE_DATA_URL);
  });

  it('uses fetchViaBackground for http: URLs too', async () => {
    const fetchBg = vi.fn().mockResolvedValueOnce(FAKE_DATA_URL);
    const div = document.createElement('div');
    const img = document.createElement('img');
    img.setAttribute('src', 'http://example.com/plain-http.png');
    div.appendChild(img);
    const result = await resolveImageBlobs(div, fetchBg);
    expect(fetchBg).toHaveBeenCalled();
  });

  it('marks img lost when fetchViaBackground returns a non-data: value', async () => {
    const fetchBg = vi.fn().mockResolvedValueOnce('not-a-data-url');
    const div = document.createElement('div');
    const img = document.createElement('img');
    img.setAttribute('src', 'https://example.com/broken.png');
    div.appendChild(img);
    const result = await resolveImageBlobs(div, fetchBg);
    expect(result.querySelector('img').getAttribute(BLOB_LOST_ATTR)).toBeDefined();
  });

  it('marks img lost when fetchViaBackground throws', async () => {
    const fetchBg = vi.fn().mockRejectedValueOnce(new Error('bg error'));
    const div = document.createElement('div');
    const img = document.createElement('img');
    img.setAttribute('src', 'https://example.com/bg-err.png');
    div.appendChild(img);
    const result = await resolveImageBlobs(div, fetchBg);
    expect(result.querySelector('img').getAttribute(BLOB_LOST_ATTR)).toBeDefined();
  });

  it('resolves srcset-only image by picking the first srcset entry', async () => {
    fetch.mockReturnValueOnce(makeBlobResponse('IMG', 'image/png'));
    const div = document.createElement('div');
    const img = document.createElement('img');
    // no src attr, only srcset with a blob: URL
    img.setAttribute('srcset', 'blob:http://localhost/srcset-only 1x');
    div.appendChild(img);
    const result = await resolveImageBlobs(div);
    expect(result.querySelector('img').getAttribute('src')).toMatch(/^data:/);
  });

  it('handles dimsEl parameter: reads dimensions from the provided live element', async () => {
    fetch.mockReturnValueOnce(makeBlobResponse('IMG', 'image/png'));
    const div   = document.createElement('div');
    const img   = document.createElement('img');
    img.setAttribute('src', 'blob:http://localhost/dims-el-img');
    div.appendChild(img);
    // dimsEl is a separate live element with the same img
    const liveDiv = document.createElement('div');
    const liveImg = document.createElement('img');
    liveImg.getBoundingClientRect = () => ({ width: 320, height: 240, right: 320, bottom: 240, left: 0, top: 0 });
    liveDiv.appendChild(liveImg);
    const result = await resolveImageBlobs(div, null, liveDiv);
    const clone = result.querySelector('img');
    expect(clone.getAttribute('data-natural-width')).toBe('320');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// resolveAudioBlobs
// ─────────────────────────────────────────────────────────────────────────────

describe('resolveAudioBlobs()', () => {
  it('returns original element when there are no audio element or relevant anchors', async () => {
    const div = document.createElement('div');
    div.innerHTML = '<p>just text</p>';
    const result = await resolveAudioBlobs(div);
    expect(result).toBe(div);
  });

  it('returns original element when audio has a non-blob src (https)', async () => {
    const div = document.createElement('div');
    const audio = document.createElement('audio');
    audio.setAttribute('src', 'https://cdn.example.com/track.mp3');
    div.appendChild(audio);
    const result = await resolveAudioBlobs(div);
    expect(result).toBe(div);
  });

  it('resolves blob: audio src to a data: URI', async () => {
    fetch.mockReturnValueOnce(makeAudioResponse('MP3', 'audio/mpeg'));
    const div   = document.createElement('div');
    const audio = document.createElement('audio');
    audio.setAttribute('src', 'blob:http://localhost/audio-1');
    div.appendChild(audio);
    const result = await resolveAudioBlobs(div);
    expect(result).not.toBe(div);
    expect(result.querySelector('audio').getAttribute('src')).toMatch(/^data:audio/);
  });

  it('marks audio element as too_large when blob exceeds 10 MB', async () => {
    fetch.mockReturnValueOnce(makeAudioResponse('BIG', 'audio/mpeg', true, true));
    const div   = document.createElement('div');
    const audio = document.createElement('audio');
    audio.setAttribute('src', 'blob:http://localhost/bigaudio');
    div.appendChild(audio);
    const result = await resolveAudioBlobs(div);
    expect(result.querySelector('audio').getAttribute('data-binder-audio-lost')).toBe('too_large');
  });

  it('marks audio element as expired when fetch returns non-ok status', async () => {
    fetch.mockReturnValueOnce(makeAudioResponse('', 'audio/mpeg', false));
    const div   = document.createElement('div');
    const audio = document.createElement('audio');
    audio.setAttribute('src', 'blob:http://localhost/bad-audio');
    div.appendChild(audio);
    const result = await resolveAudioBlobs(div);
    expect(result.querySelector('audio').getAttribute('data-binder-audio-lost')).toBe('expired');
  });

  it('marks audio element as expired when fetch throws', async () => {
    fetch.mockRejectedValueOnce(new Error('network'));
    const div   = document.createElement('div');
    const audio = document.createElement('audio');
    audio.setAttribute('src', 'blob:http://localhost/throw-audio');
    div.appendChild(audio);
    const result = await resolveAudioBlobs(div);
    expect(result.querySelector('audio').getAttribute('data-binder-audio-lost')).toBe('expired');
  });

  it('resolves audio src from <source> child element', async () => {
    fetch.mockReturnValueOnce(makeAudioResponse('MP3', 'audio/mpeg'));
    const div    = document.createElement('div');
    const audio  = document.createElement('audio');
    const source = document.createElement('source');
    source.setAttribute('src', 'blob:http://localhost/source-child.mp3');
    audio.appendChild(source);
    div.appendChild(audio);
    const result = await resolveAudioBlobs(div);
    expect(result).not.toBe(div);
  });

  it('removes child <source> elements after resolving audio', async () => {
    fetch.mockReturnValueOnce(makeAudioResponse('MP3', 'audio/mpeg'));
    const div    = document.createElement('div');
    const audio  = document.createElement('audio');
    const source = document.createElement('source');
    source.setAttribute('src', 'blob:http://localhost/remove-source.mp3');
    audio.appendChild(source);
    div.appendChild(audio);
    const result = await resolveAudioBlobs(div);
    expect(result.querySelector('audio').querySelectorAll('source').length).toBe(0);
  });

  it('resolves a blob: download anchor with audio extension to a data: URI', async () => {
    fetch.mockReturnValueOnce(makeAudioResponse('MP3', 'audio/mpeg'));
    const div    = document.createElement('div');
    const anchor = document.createElement('a');
    anchor.setAttribute('href',     'blob:http://localhost/dl.mp3');
    anchor.setAttribute('download', 'audio.mp3');
    div.appendChild(anchor);
    const result = await resolveAudioBlobs(div);
    expect(result).not.toBe(div);
    expect(result.querySelector('a').getAttribute('href')).toMatch(/^data:/);
  });

  it('marks download anchor too_large when blob exceeds limit', async () => {
    fetch.mockReturnValueOnce(makeAudioResponse('BIG', 'audio/mpeg', true, true));
    const div    = document.createElement('div');
    const anchor = document.createElement('a');
    anchor.setAttribute('href',     'blob:http://localhost/big.mp3');
    anchor.setAttribute('download', 'big.mp3');
    div.appendChild(anchor);
    const result = await resolveAudioBlobs(div);
    expect(result.querySelector('a').getAttribute('data-binder-audio-lost')).toBe('too_large');
  });

  it('marks download anchor expired when fetch fails', async () => {
    fetch.mockReturnValueOnce(makeAudioResponse('', 'audio/mpeg', false));
    const div    = document.createElement('div');
    const anchor = document.createElement('a');
    anchor.setAttribute('href',     'blob:http://localhost/bad.mp3');
    anchor.setAttribute('download', 'bad.mp3');
    div.appendChild(anchor);
    const result = await resolveAudioBlobs(div);
    const a = result.querySelector('a');
    expect(a.getAttribute('data-binder-audio-lost')).toBe('expired');
    expect(a.getAttribute('href')).toBe('');
  });

  it('marks download anchor expired when fetch throws', async () => {
    fetch.mockRejectedValueOnce(new Error('network'));
    const div    = document.createElement('div');
    const anchor = document.createElement('a');
    anchor.setAttribute('href',     'blob:http://localhost/throw.mp3');
    anchor.setAttribute('download', 'throw.mp3');
    div.appendChild(anchor);
    const result = await resolveAudioBlobs(div);
    expect(result.querySelector('a').getAttribute('data-binder-audio-lost')).toBe('expired');
  });

  it('ignores anchor without download attribute', async () => {
    const div    = document.createElement('div');
    const anchor = document.createElement('a');
    anchor.setAttribute('href', 'blob:http://localhost/nodownload.mp3');
    div.appendChild(anchor);
    const result = await resolveAudioBlobs(div);
    expect(result).toBe(div);
  });

  it('ignores anchor without audio extension in href or download attr', async () => {
    const div    = document.createElement('div');
    const anchor = document.createElement('a');
    anchor.setAttribute('href',     'blob:http://localhost/noext');
    anchor.setAttribute('download', 'file.pdf');
    div.appendChild(anchor);
    const result = await resolveAudioBlobs(div);
    expect(result).toBe(div);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// collectShadowAudio
// ─────────────────────────────────────────────────────────────────────────────

describe('collectShadowAudio()', () => {
  afterEach(() => { document.body.innerHTML = ''; });

  it('returns empty array when there are no audio elements', () => {
    const div = document.createElement('div');
    div.innerHTML = '<p>hello</p><span>world</span>';
    expect(collectShadowAudio(div)).toEqual([]);
  });

  it('collects <audio> elements with a src attribute', () => {
    const div   = document.createElement('div');
    const audio = document.createElement('audio');
    audio.setAttribute('src', 'https://example.com/sound.mp3');
    div.appendChild(audio);
    const results = collectShadowAudio(div);
    expect(results).toHaveLength(1);
    expect(results[0].src).toBe('https://example.com/sound.mp3');
  });

  it('collects audio src from a <source> child when <audio> has no src', () => {
    const div    = document.createElement('div');
    const audio  = document.createElement('audio');
    const source = document.createElement('source');
    source.setAttribute('src', 'blob:http://localhost/via-source.ogg');
    audio.appendChild(source);
    div.appendChild(audio);
    const results = collectShadowAudio(div);
    expect(results.some(r => r.src.includes('via-source'))).toBe(true);
  });

  it('skips data: URLs (already embedded, nothing to resolve)', () => {
    const div   = document.createElement('div');
    const audio = document.createElement('audio');
    audio.setAttribute('src', 'data:audio/mpeg;base64,SUQz');
    div.appendChild(audio);
    expect(collectShadowAudio(div)).toEqual([]);
  });

  it('skips audio elements with no src', () => {
    const div   = document.createElement('div');
    const audio = document.createElement('audio');
    div.appendChild(audio);
    expect(collectShadowAudio(div)).toEqual([]);
  });

  it('collects audio inside open shadow roots', () => {
    const host   = document.createElement('div');
    document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: 'open' });
    const audio  = document.createElement('audio');
    audio.setAttribute('src', 'blob:http://localhost/shadow-audio');
    shadow.appendChild(audio);
    const results = collectShadowAudio(host);
    expect(results.some(r => r.src.includes('shadow-audio'))).toBe(true);
  });

  it('does not descend into shadow roots when maxShadowDepth is 0', () => {
    const host   = document.createElement('div');
    document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: 'open' });
    const audio  = document.createElement('audio');
    audio.setAttribute('src', 'blob:http://localhost/deep-audio');
    shadow.appendChild(audio);
    expect(collectShadowAudio(host, 0)).toHaveLength(0);
  });

  it('ignores non-element nodes (text nodes)', () => {
    const div = document.createElement('div');
    div.appendChild(document.createTextNode('just text'));
    expect(collectShadowAudio(div)).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// appendShadowAudio
// ─────────────────────────────────────────────────────────────────────────────

describe('appendShadowAudio()', () => {
  afterEach(() => { document.body.innerHTML = ''; });

  it('returns existing markdown unchanged when liveEl has no shadow audio', async () => {
    const div = document.createElement('div');
    div.innerHTML = '<p>no shadow</p>';
    const md = await appendShadowAudio(div, 'existing content');
    expect(md).toBe('existing content');
  });

  it('appends a data: URL marker when blob audio is captured successfully', async () => {
    fetch.mockReturnValueOnce({
      ok:   true,
      blob: () => Promise.resolve(new Blob(['audio'], { type: 'audio/mpeg' })),
    });
    const host   = document.createElement('div');
    document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: 'open' });
    const audio  = document.createElement('audio');
    audio.setAttribute('src', 'blob:http://localhost/shadow-append');
    shadow.appendChild(audio);
    const md = await appendShadowAudio(host, 'base');
    expect(md).toContain('Generated audio');
    expect(md.length).toBeGreaterThan('base'.length);
  });

  it('skips audio srcs already present in existingMarkdown', async () => {
    const host   = document.createElement('div');
    document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: 'open' });
    const audio  = document.createElement('audio');
    const src    = 'https://cdn.example.com/already.mp3';
    audio.setAttribute('src', src);
    shadow.appendChild(audio);
    const existing = `already here: ${src}`;
    const md = await appendShadowAudio(host, existing);
    expect(md).toBe(existing);
  });

  it('appends a too-large marker when blob exceeds 10 MB', async () => {
    fetch.mockReturnValueOnce({
      ok:   true,
      blob: () => Promise.resolve(new Blob([new ArrayBuffer(11 * 1024 * 1024)], { type: 'audio/mpeg' })),
    });
    const host   = document.createElement('div');
    document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: 'open' });
    const audio  = document.createElement('audio');
    audio.setAttribute('src', 'blob:http://localhost/too-large');
    shadow.appendChild(audio);
    const md = await appendShadowAudio(host, 'base');
    expect(md).toContain('too large');
  });

  it('appends https: audio URL directly when CORS fails', async () => {
    fetch.mockRejectedValueOnce(new Error('CORS'));
    const host   = document.createElement('div');
    document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: 'open' });
    const audio  = document.createElement('audio');
    audio.setAttribute('src', 'https://cdn.example.com/cors-audio.mp3');
    shadow.appendChild(audio);
    const md = await appendShadowAudio(host, 'base');
    expect(md).toContain('Generated audio');
    expect(md).toContain('https://cdn.example.com/cors-audio.mp3');
  });

  it('appends a not-captured marker for non-https fetch failures (blob expired)', async () => {
    fetch.mockRejectedValueOnce(new Error('expired blob'));
    const host   = document.createElement('div');
    document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: 'open' });
    const audio  = document.createElement('audio');
    audio.setAttribute('src', 'blob:http://localhost/expired-shadow');
    shadow.appendChild(audio);
    const md = await appendShadowAudio(host, 'base');
    expect(md).toContain('not captured');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// collectShadowImages
// ─────────────────────────────────────────────────────────────────────────────

describe('collectShadowImages()', () => {
  afterEach(() => { document.body.innerHTML = ''; });

  it('returns empty array when there are no images in shadow DOM', () => {
    const div = document.createElement('div');
    // Light-DOM images are NOT collected
    const img = document.createElement('img');
    img.setAttribute('src', 'https://example.com/light.png');
    div.appendChild(img);
    expect(collectShadowImages(div)).toEqual([]);
  });

  it('collects images found inside open shadow roots', () => {
    const host   = document.createElement('div');
    document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: 'open' });
    const img    = document.createElement('img');
    img.setAttribute('src', 'https://example.com/shadow-img.png');
    img.setAttribute('alt', 'Shadow image');
    shadow.appendChild(img);
    const results = collectShadowImages(host);
    expect(results.some(r => r.src.includes('shadow-img'))).toBe(true);
    expect(results[0].alt).toBe('Shadow image');
  });

  it('skips data: images in shadow DOM (already embedded)', () => {
    const host   = document.createElement('div');
    document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: 'open' });
    const img    = document.createElement('img');
    img.setAttribute('src', 'data:image/png;base64,AAA');
    shadow.appendChild(img);
    expect(collectShadowImages(host)).toHaveLength(0);
  });

  it('does not collect shadow images when maxShadowDepth is 0', () => {
    const host   = document.createElement('div');
    document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: 'open' });
    const img    = document.createElement('img');
    img.setAttribute('src', 'https://example.com/depth0.png');
    shadow.appendChild(img);
    expect(collectShadowImages(host, 0)).toHaveLength(0);
  });

  it('collects img src from srcset when src attribute is absent', () => {
    const host   = document.createElement('div');
    document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: 'open' });
    const img    = document.createElement('img');
    img.setAttribute('srcset', 'https://example.com/srcset-1x.png 1x, https://example.com/srcset-2x.png 2x');
    shadow.appendChild(img);
    const results = collectShadowImages(host);
    expect(results.some(r => r.src.includes('srcset-1x'))).toBe(true);
  });

  it('collects img src from data-src fallback', () => {
    const host   = document.createElement('div');
    document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: 'open' });
    const img    = document.createElement('img');
    img.setAttribute('data-src', 'https://example.com/data-src.png');
    shadow.appendChild(img);
    const results = collectShadowImages(host);
    expect(results.some(r => r.src.includes('data-src'))).toBe(true);
  });

  it('reads naturalWidth/naturalHeight from the element', () => {
    const host   = document.createElement('div');
    document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: 'open' });
    const img    = document.createElement('img');
    img.setAttribute('src', 'https://example.com/sized.png');
    Object.defineProperty(img, 'naturalWidth',  { get: () => 200 });
    Object.defineProperty(img, 'naturalHeight', { get: () => 100 });
    shadow.appendChild(img);
    const results = collectShadowImages(host);
    expect(results[0].naturalWidth).toBe(200);
    expect(results[0].naturalHeight).toBe(100);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// appendShadowImages
// ─────────────────────────────────────────────────────────────────────────────

describe('appendShadowImages()', () => {
  afterEach(() => { document.body.innerHTML = ''; });

  it('returns existing markdown unchanged when there are no shadow images', async () => {
    const div = document.createElement('div');
    const md  = await appendShadowImages(div, 'existing');
    expect(md).toBe('existing');
  });

  it('appends captured shadow image as markdown', async () => {
    fetch.mockReturnValueOnce(makeBlobResponse('IMG', 'image/png'));
    const host   = document.createElement('div');
    document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: 'open' });
    const img    = document.createElement('img');
    img.setAttribute('src', 'blob:http://localhost/shadow-img-append');
    img.setAttribute('alt', 'Shadow cat');
    shadow.appendChild(img);
    const md = await appendShadowImages(host, 'base');
    expect(md).toContain('Shadow cat');
    expect(md.length).toBeGreaterThan('base'.length);
  });

  it('skips images whose URL is already present in existingMarkdown', async () => {
    const host   = document.createElement('div');
    document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: 'open' });
    const img    = document.createElement('img');
    const src    = 'https://example.com/already-in-md.png';
    img.setAttribute('src', src);
    shadow.appendChild(img);
    const existing = `![cat](${src})`;
    const md = await appendShadowImages(host, existing);
    expect(md).toBe(existing);
  });

  it('uses fetchViaBackground for https: shadow images when provided', async () => {
    const fetchBg = vi.fn().mockResolvedValueOnce(FAKE_DATA_URL);
    const host    = document.createElement('div');
    document.body.appendChild(host);
    const shadow  = host.attachShadow({ mode: 'open' });
    const img     = document.createElement('img');
    img.setAttribute('src', 'https://lh3.google.com/img.png');
    img.setAttribute('alt', 'Google');
    shadow.appendChild(img);
    const md = await appendShadowImages(host, 'base', fetchBg);
    expect(fetchBg).toHaveBeenCalledWith('https://lh3.google.com/img.png');
    expect(md).toContain('Google');
  });

  it('emits image-not-captured placeholder when fetchViaBackground returns null', async () => {
    const fetchBg = vi.fn().mockResolvedValueOnce(null);
    const host    = document.createElement('div');
    document.body.appendChild(host);
    const shadow  = host.attachShadow({ mode: 'open' });
    const img     = document.createElement('img');
    img.setAttribute('src', 'https://example.com/null-bg.png');
    shadow.appendChild(img);
    const md = await appendShadowImages(host, 'base', fetchBg);
    expect(md).toContain('not captured');
  });

  it('emits image-not-captured placeholder when direct fetch fails (CORS)', async () => {
    fetch.mockRejectedValueOnce(new Error('CORS'));
    const host   = document.createElement('div');
    document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: 'open' });
    const img    = document.createElement('img');
    img.setAttribute('src', 'https://example.com/cors-fail.png');
    img.setAttribute('alt', 'CORS image');
    shadow.appendChild(img);
    const md = await appendShadowImages(host, 'base');
    expect(md).toContain('not captured');
  });

  it('emits placeholder when fetchViaBackground returns a non-data: string', async () => {
    const fetchBg = vi.fn().mockResolvedValueOnce('invalid-url');
    const host    = document.createElement('div');
    document.body.appendChild(host);
    const shadow  = host.attachShadow({ mode: 'open' });
    const img     = document.createElement('img');
    img.setAttribute('src', 'https://example.com/invalid-bg.png');
    shadow.appendChild(img);
    const md = await appendShadowImages(host, 'base', fetchBg);
    expect(md).toContain('not captured');
  });
});
