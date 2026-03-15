/**
 * tests/entity-cards/audio-card.test.js — Task D.5
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { audioCard } from '../../src/lib/renderer/entity-cards/audio-card.js';

const BASE_ENTITY = {
  id:             'audio-1',
  type:           'audio',
  chatId:         'c1',
  messageIndex:   1,
  role:           'assistant',
  src:            'https://example.com/speech.mp3',
  mimeType:       'audio/mpeg',
  durationSeconds: 92,
  transcript:     null,
  captureError:   null,
};

describe('audioCard()', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('returns an HTMLElement', () => {
    expect(audioCard(BASE_ENTITY) instanceof HTMLElement).toBe(true);
  });

  it('has correct CSS class', () => {
    expect(audioCard(BASE_ENTITY).classList.contains('entity-card--audio')).toBe(true);
  });

  describe('src set — audio player', () => {
    it('<audio controls> rendered with that src', () => {
      const card  = audioCard(BASE_ENTITY);
      const audio = card.querySelector('audio.entity-card__audio-player');
      expect(audio).not.toBeNull();
      expect(audio.src).toContain('https://example.com/speech.mp3');
      expect(audio.controls).toBe(true);
    });

    it('no error notice when src is valid and no captureError', () => {
      const card = audioCard(BASE_ENTITY);
      expect(card.querySelector('.entity-card__audio-notice--error')).toBeNull();
    });
  });

  describe('captureError set', () => {
    it('captureError "too_large" → notice replaces audio player', () => {
      const entity = { ...BASE_ENTITY, src: null, captureError: 'too_large' };
      const card   = audioCard(entity);
      expect(card.querySelector('audio')).toBeNull();
      const notice = card.querySelector('.entity-card__audio-notice--error');
      expect(notice).not.toBeNull();
      expect(notice.textContent).toContain('too large');
    });

    it('captureError "expired" → notice mentions "expired"', () => {
      const entity = { ...BASE_ENTITY, src: null, captureError: 'expired' };
      const card   = audioCard(entity);
      const notice = card.querySelector('.entity-card__audio-notice--error');
      expect(notice.textContent).toContain('expired');
    });
  });

  describe('duration badge', () => {
    it('duration badge renders as m:ss', () => {
      const card  = audioCard(BASE_ENTITY); // 92s → 1:32
      const badge = card.querySelector('.entity-card__badge--duration');
      expect(badge).not.toBeNull();
      expect(badge.textContent).toBe('1:32');
    });

    it('no duration badge when durationSeconds is null', () => {
      const entity = { ...BASE_ENTITY, durationSeconds: null };
      const card   = audioCard(entity);
      expect(card.querySelector('.entity-card__badge--duration')).toBeNull();
    });

    it('duration 0 → badge shows 0:00', () => {
      const entity = { ...BASE_ENTITY, durationSeconds: 0 };
      const card   = audioCard(entity);
      const badge  = card.querySelector('.entity-card__badge--duration');
      expect(badge.textContent).toBe('0:00');
    });
  });

  describe('transcript', () => {
    it('transcript non-null → collapsible <details> rendered', () => {
      const entity = { ...BASE_ENTITY, transcript: 'Hello, how are you?' };
      const card   = audioCard(entity);
      const details = card.querySelector('details.entity-card__transcript');
      expect(details).not.toBeNull();
      expect(details.querySelector('.entity-card__transcript-text').textContent)
        .toBe('Hello, how are you?');
    });

    it('transcript null → no collapsible section', () => {
      const entity = { ...BASE_ENTITY, transcript: null };
      const card   = audioCard(entity);
      expect(card.querySelector('details.entity-card__transcript')).toBeNull();
    });
  });

  describe('onOpen callback', () => {
    it('clicking card fires onOpen with entity', () => {
      const onOpen = vi.fn();
      const card   = audioCard(BASE_ENTITY, { onOpen });
      card.click();
      expect(onOpen).toHaveBeenCalledWith(BASE_ENTITY);
    });

    it('no error when no onOpen provided', () => {
      const card = audioCard(BASE_ENTITY);
      expect(() => card.click()).not.toThrow();
    });
  });
});
