/**
 * tests/entity-cards/artifact-card.test.js — Task E.4
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { artifactCard } from '../../src/lib/renderer/entity-cards/artifact-card.js';

const SCREENSHOT_URI = 'data:image/webp;base64,FAKE_SCREENSHOT';

const BASE_ENTITY = {
  id:               'e-art-1',
  type:             'artifact',
  chatId:           'c1',
  messageIndex:     0,
  role:             'assistant',
  artifactType:     'html',
  title:            'My Artifact',
  source:           '<p>Hello world</p>',
  mimeType:         'text/html',
  screenshotDataUri: SCREENSHOT_URI,
};

describe('artifactCard()', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      writable: true,
      configurable: true,
    });
    global.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
    global.URL.revokeObjectURL = vi.fn();
  });

  it('returns an HTMLElement', () => {
    expect(artifactCard(BASE_ENTITY) instanceof HTMLElement).toBe(true);
  });

  it('has class entity-card--artifact', () => {
    expect(artifactCard(BASE_ENTITY).classList.contains('entity-card--artifact')).toBe(true);
  });

  // ── Type badge ──────────────────────────────────────────────────────────────

  it('badge shows "HTML" for artifactType html', () => {
    const card  = artifactCard(BASE_ENTITY);
    const badge = card.querySelector('.entity-card__badge--artifact-type');
    expect(badge).not.toBeNull();
    expect(badge.textContent).toBe('HTML');
  });

  it('badge shows "React" for artifactType react', () => {
    const card = artifactCard({ ...BASE_ENTITY, artifactType: 'react', mimeType: 'text/jsx' });
    expect(card.querySelector('.entity-card__badge--artifact-type').textContent).toBe('React');
  });

  it('badge shows "SVG" for artifactType svg', () => {
    const card = artifactCard({ ...BASE_ENTITY, artifactType: 'svg', mimeType: 'image/svg+xml' });
    expect(card.querySelector('.entity-card__badge--artifact-type').textContent).toBe('SVG');
  });

  it('badge shows "Text" for artifactType text', () => {
    const card = artifactCard({ ...BASE_ENTITY, artifactType: 'text', mimeType: 'text/plain' });
    expect(card.querySelector('.entity-card__badge--artifact-type').textContent).toBe('Text');
  });

  // ── Screenshot / placeholder ────────────────────────────────────────────────

  it('screenshot <img> is rendered when screenshotDataUri is set', () => {
    const card = artifactCard(BASE_ENTITY);
    const img  = card.querySelector('.entity-card__screenshot');
    expect(img).not.toBeNull();
    expect(img.src).toContain('FAKE_SCREENSHOT');
  });

  it('placeholder is rendered when screenshotDataUri is null', () => {
    const card = artifactCard({ ...BASE_ENTITY, screenshotDataUri: null });
    expect(card.querySelector('.entity-card__screenshot-placeholder')).not.toBeNull();
    expect(card.querySelector('.entity-card__screenshot')).toBeNull();
  });

  // ── Title ───────────────────────────────────────────────────────────────────

  it('title element is rendered when entity.title is non-empty', () => {
    const card = artifactCard(BASE_ENTITY);
    const titleEl = card.querySelector('.entity-card__title');
    expect(titleEl).not.toBeNull();
    expect(titleEl.textContent).toBe('My Artifact');
  });

  it('title element is absent when entity.title is empty', () => {
    const card = artifactCard({ ...BASE_ENTITY, title: '' });
    expect(card.querySelector('.entity-card__title')).toBeNull();
  });

  // ── Preview button ──────────────────────────────────────────────────────────

  it('"Preview" button calls onPreview with the entity', () => {
    const onPreview = vi.fn();
    const card = artifactCard(BASE_ENTITY, { onPreview });
    card.querySelector('.entity-card__btn--preview').click();
    expect(onPreview).toHaveBeenCalledWith(BASE_ENTITY);
  });

  it('"Preview" button click does not bubble to onOpen', () => {
    const onOpen    = vi.fn();
    const onPreview = vi.fn();
    const card = artifactCard(BASE_ENTITY, { onOpen, onPreview });
    card.querySelector('.entity-card__btn--preview').click();
    expect(onOpen).not.toHaveBeenCalled();
    expect(onPreview).toHaveBeenCalledTimes(1);
  });

  // ── Copy source button ──────────────────────────────────────────────────────

  it('"Copy source" button writes source to clipboard', () => {
    const card = artifactCard(BASE_ENTITY);
    card.querySelector('.entity-card__btn--copy-source').click();
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(BASE_ENTITY.source);
  });

  it('"Copy source" click does not bubble to onOpen', () => {
    const onOpen = vi.fn();
    const card   = artifactCard(BASE_ENTITY, { onOpen });
    card.querySelector('.entity-card__btn--copy-source').click();
    expect(onOpen).not.toHaveBeenCalled();
  });

  // ── Download button ─────────────────────────────────────────────────────────

  it('"Download" button generates correct .html extension for text/html', () => {
    const card = artifactCard(BASE_ENTITY);
    card.querySelector('.entity-card__btn--download').click();
    expect(URL.createObjectURL).toHaveBeenCalled();
    // The anchor created inside the click handler is ephemeral; check via
    // URL.createObjectURL being called (proves the Blob was constructed)
    expect(URL.revokeObjectURL).toHaveBeenCalled();
  });

  it('"Download" button uses .svg extension for image/svg+xml', () => {
    // Spy on createElement to capture anchor download attribute
    const anchors = [];
    const orig = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      const el = orig(tag);
      if (tag === 'a') anchors.push(el);
      return el;
    });

    const card = artifactCard({ ...BASE_ENTITY, mimeType: 'image/svg+xml', artifactType: 'svg' });
    card.querySelector('.entity-card__btn--download').click();

    const anchor = anchors.find(a => a.download);
    expect(anchor?.download).toBe('artifact.svg');

    vi.restoreAllMocks();
  });

  it('"Download" button uses .html extension for HTML artifact', () => {
    const anchors = [];
    const orig = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      const el = orig(tag);
      if (tag === 'a') anchors.push(el);
      return el;
    });

    const card = artifactCard(BASE_ENTITY);
    card.querySelector('.entity-card__btn--download').click();

    const anchor = anchors.find(a => a.download);
    expect(anchor?.download).toBe('artifact.html');

    vi.restoreAllMocks();
  });

  it('"Download" click does not bubble to onOpen', () => {
    const onOpen = vi.fn();
    const card   = artifactCard(BASE_ENTITY, { onOpen });
    card.querySelector('.entity-card__btn--download').click();
    expect(onOpen).not.toHaveBeenCalled();
  });

  // ── onOpen ──────────────────────────────────────────────────────────────────

  it('clicking the card body fires onOpen', () => {
    const onOpen = vi.fn();
    const card   = artifactCard(BASE_ENTITY, { onOpen });
    card.click();
    expect(onOpen).toHaveBeenCalledWith(BASE_ENTITY);
  });
});
