/**
 * tests/thumbnail-service.test.js — Task D.2
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateThumbnail } from '../src/lib/entities/thumbnail-service.js';

// ---------------------------------------------------------------------------
// Helpers — mock Image loading
// ---------------------------------------------------------------------------

/**
 * Install a global Image mock that fires onload with the given dimensions,
 * or onerror when src matches `errorPattern`.
 */
function mockImage({ w, h, errorPattern = null } = {}) {
  const original = global.Image;

  global.Image = class MockImage {
    constructor() {
      this._src = '';
    }
    set src(value) {
      this._src = value;
      setTimeout(() => {
        if (errorPattern && errorPattern.test(value)) {
          this.onerror?.();
        } else {
          this.naturalWidth  = w;
          this.naturalHeight = h;
          this.onload?.();
        }
      }, 0);
    }
    get src() { return this._src; }
  };

  return () => { global.Image = original; };
}

/**
 * Mock OffscreenCanvas so we can exercise the OffscreenCanvas path.
 */
function mockOffscreenCanvas(dataUrl = 'data:image/webp;base64,FAKE') {
  const original = global.OffscreenCanvas;

  global.OffscreenCanvas = class MockOffscreenCanvas {
    constructor(w, h) {
      this.width  = w;
      this.height = h;
    }
    getContext() {
      return { drawImage: vi.fn() };
    }
    convertToBlob() {
      // Return a Blob that FileReader can read back as dataUrl
      const blob = new Blob([dataUrl], { type: 'image/webp' });
      return Promise.resolve(blob);
    }
  };

  // Mock FileReader
  const OrigFileReader = global.FileReader;
  global.FileReader = class MockFileReader {
    readAsDataURL(blob) {
      setTimeout(() => {
        this.result = dataUrl;
        this.onload?.({ target: this });
      }, 0);
    }
  };

  return () => {
    global.OffscreenCanvas = original;
    global.FileReader = OrigFileReader;
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('generateThumbnail()', () => {
  describe('null / empty src', () => {
    it('returns null for null src', async () => {
      expect(await generateThumbnail(null)).toBeNull();
    });

    it('returns null for empty string src', async () => {
      expect(await generateThumbnail('')).toBeNull();
    });
  });

  describe('image already ≤ maxPx', () => {
    it('200×200 image with maxPx 400 → null (no resize needed)', async () => {
      const restore = mockImage({ w: 200, h: 200 });
      try {
        const result = await generateThumbnail('https://example.com/small.png', 400);
        expect(result).toBeNull();
      } finally {
        restore();
      }
    });

    it('400×300 image with maxPx 400 → null (already within ≤ maxPx)', async () => {
      const restore = mockImage({ w: 400, h: 300 });
      try {
        const result = await generateThumbnail('https://example.com/med.png', 400);
        expect(result).toBeNull();
      } finally {
        restore();
      }
    });
  });

  describe('image larger than maxPx (canvas path)', () => {
    it('800×600 image with OffscreenCanvas → returns a data URI string', async () => {
      const restoreImg    = mockImage({ w: 800, h: 600 });
      const restoreCanvas = mockOffscreenCanvas('data:image/webp;base64,THUMBNAIL');
      try {
        const result = await generateThumbnail('https://example.com/large.png', 400);
        expect(typeof result).toBe('string');
        expect(result).toContain('data:');
      } finally {
        restoreImg();
        restoreCanvas();
      }
    });
  });

  describe('inaccessible src', () => {
    it('image load error → returns null without throwing', async () => {
      const restore = mockImage({ w: 0, h: 0, errorPattern: /bad-url/ });
      try {
        const result = await generateThumbnail('https://example.com/bad-url.png', 400);
        expect(result).toBeNull();
      } finally {
        restore();
      }
    });
  });
});
