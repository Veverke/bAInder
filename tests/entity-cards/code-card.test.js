/**
 * tests/entity-cards/code-card.test.js — Task B.3
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { codeCard } from '../../src/lib/renderer/entity-cards/code-card.js';

const BASE_ENTITY = {
  id:           'e1',
  type:         'code',
  chatId:       'c1',
  messageIndex: 1,
  role:         'assistant',
  language:     'javascript',
  code:         'function hello() {\n  console.log("hi");\n  return true;\n}\n// more code here',
  lineCount:    5,
};

describe('codeCard()', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      writable: true,
      configurable: true,
    });
  });

  it('returns an HTMLElement', () => {
    expect(codeCard(BASE_ENTITY) instanceof HTMLElement).toBe(true);
  });

  it('has class entity-card--code', () => {
    const card = codeCard(BASE_ENTITY);
    expect(card.classList.contains('entity-card--code')).toBe(true);
  });

  it('language badge shows correct language', () => {
    const card = codeCard(BASE_ENTITY);
    const badge = card.querySelector('.entity-card__badge--language');
    expect(badge).not.toBeNull();
    expect(badge.textContent).toBe('javascript');
  });

  it('<pre> contains only first 3 lines when code has more', () => {
    const card = codeCard(BASE_ENTITY);
    const pre  = card.querySelector('.entity-card__code-preview');
    expect(pre).not.toBeNull();
    // First 3 lines of BASE_ENTITY.code:
    const expectedPreview = BASE_ENTITY.code.split('\n').slice(0, 3).join('\n');
    expect(pre.textContent).toBe(expectedPreview);
  });

  it('<pre> contains all lines when code has ≤ 3 lines', () => {
    const entity = { ...BASE_ENTITY, code: 'line1\nline2', lineCount: 2 };
    const card   = codeCard(entity);
    expect(card.querySelector('.entity-card__code-preview').textContent).toBe('line1\nline2');
  });

  it('line count badge shows correct value', () => {
    const card = codeCard(BASE_ENTITY);
    const badge = card.querySelector('.entity-card__badge--lines');
    expect(badge).not.toBeNull();
    expect(badge.textContent).toContain('5');
  });

  it('Copy button writes full entity.code to clipboard', () => {
    const card = codeCard(BASE_ENTITY);
    document.body.appendChild(card);
    card.querySelector('.entity-card__btn--copy').click();
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(BASE_ENTITY.code);
  });

  it('clicking card fires onOpen with the entity', () => {
    const onOpen = vi.fn();
    const card   = codeCard(BASE_ENTITY, { onOpen });
    document.body.appendChild(card);
    card.click();
    expect(onOpen).toHaveBeenCalledWith(BASE_ENTITY);
  });

  it('no onOpen → clicking card does not throw', () => {
    const card = codeCard(BASE_ENTITY);
    document.body.appendChild(card);
    expect(() => card.click()).not.toThrow();
  });

  it('Copy button is present', () => {
    expect(codeCard(BASE_ENTITY).querySelector('.entity-card__btn--copy')).not.toBeNull();
  });

  it('defaults language to "text" when entity.language is absent', () => {
    const entity = { ...BASE_ENTITY, language: undefined };
    const badge  = codeCard(entity).querySelector('.entity-card__badge--language');
    expect(badge.textContent).toBe('text');
  });
});
