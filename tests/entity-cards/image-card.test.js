/**
 * tests/entity-cards/image-card.test.js — Task D.4
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { imageCard } from '../../src/lib/renderer/entity-cards/image-card.js';

const BASE_ENTITY = {
  id:              'img-1',
  type:            'image',
  chatId:          'c1',
  messageIndex:    1,
  role:            'assistant',
  src:             'https://example.com/photo.png',
  mimeType:        'image/png',
  altText:         'A cute cat',
  thumbnailDataUri: 'data:image/webp;base64,FAKE_THUMBNAIL',
};

describe('imageCard()', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('returns an HTMLElement', () => {
    expect(imageCard(BASE_ENTITY) instanceof HTMLElement).toBe(true);
  });

  it('has correct CSS class', () => {
    expect(imageCard(BASE_ENTITY).classList.contains('entity-card--image')).toBe(true);
  });

  describe('thumbnail', () => {
    it('thumbnailDataUri set → <img src> is that URI', () => {
      const card = imageCard(BASE_ENTITY);
      const img  = card.querySelector('img.entity-card__thumbnail');
      expect(img).not.toBeNull();
      expect(img.src).toContain('data:image/webp;base64,FAKE_THUMBNAIL');
    });

    it('thumbnailDataUri null → placeholder element rendered', () => {
      const entity = { ...BASE_ENTITY, thumbnailDataUri: null };
      const card   = imageCard(entity);
      expect(card.querySelector('img.entity-card__thumbnail')).toBeNull();
      expect(card.querySelector('.entity-card__image-placeholder')).not.toBeNull();
    });

    it('placeholder has aria-label from altText', () => {
      const entity = { ...BASE_ENTITY, thumbnailDataUri: null };
      const card   = imageCard(entity);
      const ph     = card.querySelector('.entity-card__image-placeholder');
      expect(ph.getAttribute('aria-label')).toBe('A cute cat');
    });

    it('placeholder falls back to "Image" when altText is null', () => {
      const entity = { ...BASE_ENTITY, thumbnailDataUri: null, altText: null };
      const card   = imageCard(entity);
      const ph     = card.querySelector('.entity-card__image-placeholder');
      expect(ph.getAttribute('aria-label')).toBe('Image');
    });
  });

  describe('altText caption', () => {
    it('altText rendered in caption', () => {
      const card    = imageCard(BASE_ENTITY);
      const caption = card.querySelector('.entity-card__caption');
      expect(caption).not.toBeNull();
      expect(caption.textContent).toBe('A cute cat');
    });

    it('no caption when altText is null', () => {
      const entity = { ...BASE_ENTITY, altText: null };
      const card   = imageCard(entity);
      expect(card.querySelector('.entity-card__caption')).toBeNull();
    });
  });

  describe('mimeType badge', () => {
    it('mimeType badge shown', () => {
      const card  = imageCard(BASE_ENTITY);
      const badge = card.querySelector('.entity-card__badge--mime');
      expect(badge).not.toBeNull();
      expect(badge.textContent).toBe('image/png');
    });

    it('no badge when mimeType is null', () => {
      const entity = { ...BASE_ENTITY, mimeType: null };
      const card   = imageCard(entity);
      expect(card.querySelector('.entity-card__badge--mime')).toBeNull();
    });
  });

  describe('onOpen callback', () => {
    it('clicking card fires onOpen with entity', () => {
      const onOpen = vi.fn();
      const card   = imageCard(BASE_ENTITY, { onOpen });
      card.click();
      expect(onOpen).toHaveBeenCalledWith(BASE_ENTITY);
    });

    it('no error when no onOpen provided', () => {
      const card = imageCard(BASE_ENTITY);
      expect(() => card.click()).not.toThrow();
    });
  });

  describe('Open image button', () => {
    let openSpy;
    let createObjectURLSpy;
    let revokeObjectURLSpy;

    beforeEach(() => {
      openSpy             = vi.spyOn(window, 'open').mockImplementation(() => {});
      createObjectURLSpy  = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url');
      revokeObjectURLSpy  = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.restoreAllMocks();
      vi.useRealTimers();
    });

    it('button element exists when src is set', () => {
      const card = imageCard(BASE_ENTITY);
      const btn  = card.querySelector('.entity-card__btn--open');
      expect(btn).not.toBeNull();
      expect(btn.tagName).toBe('BUTTON');
    });

    it('no button when src is null', () => {
      const card = imageCard({ ...BASE_ENTITY, src: null });
      expect(card.querySelector('.entity-card__btn--open')).toBeNull();
    });

    it('https:// src → window.open called with src directly', () => {
      const card = imageCard(BASE_ENTITY); // src = 'https://example.com/photo.png'
      card.querySelector('.entity-card__btn--open').click();
      expect(openSpy).toHaveBeenCalledWith('https://example.com/photo.png', '_blank', 'noopener');
      expect(createObjectURLSpy).not.toHaveBeenCalled();
    });

    it('data: src → createObjectURL called, window.open gets blob URL', () => {
      // A tiny but real 1×1 PNG as base64 so atob() does not throw
      const onePixelPng =
        'data:image/png;base64,' +
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      const card = imageCard({ ...BASE_ENTITY, src: onePixelPng });
      card.querySelector('.entity-card__btn--open').click();
      expect(createObjectURLSpy).toHaveBeenCalled();
      expect(openSpy).toHaveBeenCalledWith('blob:mock-url', '_blank', 'noopener');
    });

    it('data: src → revokeObjectURL is called after 60 s', () => {
      const onePixelPng =
        'data:image/png;base64,' +
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      const card = imageCard({ ...BASE_ENTITY, src: onePixelPng });
      card.querySelector('.entity-card__btn--open').click();
      expect(revokeObjectURLSpy).not.toHaveBeenCalled();
      vi.advanceTimersByTime(60_000);
      expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:mock-url');
    });

    it('clicking button does not bubble to card onOpen', () => {
      const onOpen = vi.fn();
      const card   = imageCard(BASE_ENTITY, { onOpen });
      card.querySelector('.entity-card__btn--open').click();
      expect(onOpen).not.toHaveBeenCalled();
    });
  });
});
