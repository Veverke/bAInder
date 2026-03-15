/**
 * tests/entity-cards/prompt-card.test.js — Task A.5
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { promptCard } from '../../src/lib/renderer/entity-cards/prompt-card.js';

const BASE_ENTITY = {
  id:           'e1',
  type:         'prompt',
  chatId:       'c1',
  messageIndex: 0,
  role:         'user',
  text:         'Tell me about solar systems and all their planets including dwarf planets',
  wordCount:    12,
};

describe('promptCard()', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      writable: true,
      configurable: true,
    });
  });

  it('returns an HTMLElement', () => {
    expect(promptCard(BASE_ENTITY) instanceof HTMLElement).toBe(true);
  });

  it('has class entity-card--prompt', () => {
    const card = promptCard(BASE_ENTITY);
    expect(card.classList.contains('entity-card--prompt')).toBe(true);
  });

  it('renders text truncated to 120 characters with ellipsis', () => {
    const longText = 'x'.repeat(150);
    const card = promptCard({ ...BASE_ENTITY, text: longText });
    const textEl = card.querySelector('.entity-card__text');
    // 120 chars + single '…' character = 121
    expect(textEl.textContent.length).toBe(121);
    expect(textEl.textContent.endsWith('\u2026')).toBe(true);
  });

  it('does not truncate text shorter than or equal to 120 characters', () => {
    const short = 'A short prompt.';
    const card = promptCard({ ...BASE_ENTITY, text: short });
    expect(card.querySelector('.entity-card__text').textContent).toBe(short);
  });

  it('word count badge shows correct value', () => {
    const card = promptCard(BASE_ENTITY);
    const badge = card.querySelector('.entity-card__badge--words');
    expect(badge.textContent).toContain('12');
  });

  it('clicking Copy calls navigator.clipboard.writeText with full (un-truncated) text', () => {
    const card = promptCard(BASE_ENTITY);
    document.body.appendChild(card);
    card.querySelector('.entity-card__btn--copy').click();
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(BASE_ENTITY.text);
  });

  it('clicking Re-fire calls onRefire with the entity', () => {
    const onRefire = vi.fn();
    const card = promptCard(BASE_ENTITY, { onRefire });
    document.body.appendChild(card);
    card.querySelector('.entity-card__btn--refire').click();
    expect(onRefire).toHaveBeenCalledWith(BASE_ENTITY);
  });

  it('no Re-fire button when onRefire is not provided', () => {
    const card = promptCard(BASE_ENTITY);
    expect(card.querySelector('.entity-card__btn--refire')).toBeNull();
  });

  it('Copy button is present even without onRefire', () => {
    const card = promptCard(BASE_ENTITY);
    expect(card.querySelector('.entity-card__btn--copy')).not.toBeNull();
  });
});
