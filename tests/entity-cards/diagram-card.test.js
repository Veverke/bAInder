/**
 * tests/entity-cards/diagram-card.test.js — Task B.4
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { diagramCard } from '../../src/lib/renderer/entity-cards/diagram-card.js';

const SVG_CONTENT = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>';

const BASE_ENTITY = {
  id:           'e2',
  type:         'diagram',
  chatId:       'c1',
  messageIndex: 1,
  role:         'assistant',
  diagramType:  'flowchart',
  source:       'flowchart LR\n  A --> B',
  thumbnailSvg: SVG_CONTENT,
};

describe('diagramCard()', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      writable: true,
      configurable: true,
    });
    // Mock URL.createObjectURL / revokeObjectURL
    global.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
    global.URL.revokeObjectURL = vi.fn();
  });

  it('returns an HTMLElement', () => {
    expect(diagramCard(BASE_ENTITY) instanceof HTMLElement).toBe(true);
  });

  it('has class entity-card--diagram', () => {
    expect(diagramCard(BASE_ENTITY).classList.contains('entity-card--diagram')).toBe(true);
  });

  it('diagramType badge shows correct type', () => {
    const card  = diagramCard(BASE_ENTITY);
    const badge = card.querySelector('.entity-card__badge--diagram-type');
    expect(badge).not.toBeNull();
    expect(badge.textContent).toBe('flowchart');
  });

  it('when thumbnailSvg is non-null, SVG is injected into card DOM', () => {
    const card      = diagramCard(BASE_ENTITY);
    const svgWrapper = card.querySelector('.entity-card__svg-preview');
    expect(svgWrapper).not.toBeNull();
    expect(svgWrapper.innerHTML).toContain('<svg');
  });

  it('when thumbnailSvg is null and source is present, code preview is shown', () => {
    const entity = { ...BASE_ENTITY, thumbnailSvg: null };
    const card   = diagramCard(entity);
    const pre    = card.querySelector('.entity-card__code-preview');
    expect(pre).not.toBeNull();
    expect(pre.textContent).toContain('flowchart LR');
    // full source in tooltip
    expect(pre.title).toBe(entity.source);
    expect(card.querySelector('.entity-card__svg-placeholder')).toBeNull();
  });

  it('when thumbnailSvg is null and source is also empty, placeholder is shown', () => {
    const entity = { ...BASE_ENTITY, thumbnailSvg: null, source: '' };
    const card   = diagramCard(entity);
    expect(card.querySelector('.entity-card__svg-placeholder')).not.toBeNull();
    expect(card.querySelector('.entity-card__code-preview')).toBeNull();
  });

  it('code preview shows at most first 4 lines of source', () => {
    const longSource = 'line1\nline2\nline3\nline4\nline5\nline6';
    const entity = { ...BASE_ENTITY, thumbnailSvg: null, source: longSource };
    const pre    = diagramCard(entity).querySelector('.entity-card__code-preview');
    const previewLines = pre.textContent.split('\n');
    expect(previewLines).toHaveLength(4);
    expect(previewLines[0]).toBe('line1');
  });

  it('"Copy source" button writes entity.source to clipboard', () => {
    const card = diagramCard(BASE_ENTITY);
    document.body.appendChild(card);
    card.querySelector('.entity-card__btn--copy-source').click();
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(BASE_ENTITY.source);
  });

  it('"Download SVG" button creates a download link when thumbnailSvg is set', () => {
    const card = diagramCard(BASE_ENTITY);
    document.body.appendChild(card);
    const clickSpy = vi.fn();
    const origCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      const el = origCreate(tag);
      if (tag === 'a') el.click = clickSpy;
      return el;
    });
    card.querySelector('.entity-card__btn--download-svg').click();
    expect(URL.createObjectURL).toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it('"Download SVG" button not present when thumbnailSvg is null', () => {
    const entity = { ...BASE_ENTITY, thumbnailSvg: null };
    const card   = diagramCard(entity);
    expect(card.querySelector('.entity-card__btn--download-svg')).toBeNull();
  });

  it('"Open in Mermaid Live" button present when source is non-empty', () => {
    const card = diagramCard(BASE_ENTITY);
    expect(card.querySelector('.entity-card__btn--mermaid-live')).not.toBeNull();
  });

  it('"Open in Mermaid Live" button opens mermaid.live with base64 payload', () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    const card = diagramCard({ ...BASE_ENTITY, thumbnailSvg: null });
    document.body.appendChild(card);
    card.querySelector('.entity-card__btn--mermaid-live').click();
    expect(openSpy).toHaveBeenCalledWith(
      expect.stringContaining('https://mermaid.live/edit#base64:'),
      '_blank',
      'noopener,noreferrer',
    );
    openSpy.mockRestore();
  });

  it('"Open in Mermaid Live" button not present when source is empty', () => {
    const entity = { ...BASE_ENTITY, source: '', thumbnailSvg: null };
    const card   = diagramCard(entity);
    expect(card.querySelector('.entity-card__btn--mermaid-live')).toBeNull();
  });

  it('clicking card fires onOpen with the entity', () => {
    const onOpen = vi.fn();
    const card   = diagramCard(BASE_ENTITY, { onOpen });
    document.body.appendChild(card);
    card.click();
    expect(onOpen).toHaveBeenCalledWith(BASE_ENTITY);
  });

  it('no onOpen → clicking card does not throw', () => {
    const card = diagramCard(BASE_ENTITY);
    document.body.appendChild(card);
    expect(() => card.click()).not.toThrow();
  });
});
