/**
 * tests/entity-cards/citation-card.test.js — Task A.6
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { citationCard } from '../../src/lib/renderer/entity-cards/citation-card.js';

const BASE_ENTITY = {
  id:           'e2',
  type:         'citation',
  chatId:       'c1',
  messageIndex: 1,
  role:         'assistant',
  url:          'https://en.wikipedia.org/wiki/Solar_system',
  title:        'Solar System - Wikipedia',
  snippet:      'The Solar System is the gravitationally bound system of the Sun.',
  number:       '1',
};

describe('citationCard()', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.spyOn(window, 'open').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns an HTMLElement', () => {
    expect(citationCard(BASE_ENTITY) instanceof HTMLElement).toBe(true);
  });

  it('has class entity-card--citation', () => {
    const card = citationCard(BASE_ENTITY);
    expect(card.classList.contains('entity-card--citation')).toBe(true);
  });

  it('title is rendered as a link with correct href', () => {
    const card = citationCard(BASE_ENTITY);
    const link = card.querySelector('.entity-card__title-link');
    expect(link).not.toBeNull();
    expect(link.href).toBe(BASE_ENTITY.url);
    expect(link.textContent).toBe(BASE_ENTITY.title);
  });

  it('link has target="_blank"', () => {
    const link = citationCard(BASE_ENTITY).querySelector('.entity-card__title-link');
    expect(link.target).toBe('_blank');
  });

  it('link has rel containing "noopener"', () => {
    const link = citationCard(BASE_ENTITY).querySelector('.entity-card__title-link');
    expect(link.rel).toContain('noopener');
  });

  it('domain pill shows the hostname', () => {
    const card = citationCard(BASE_ENTITY);
    const pill = card.querySelector('.entity-card__domain');
    expect(pill).not.toBeNull();
    expect(pill.textContent).toBe('en.wikipedia.org');
  });

  it('snippet is present in the DOM', () => {
    const card = citationCard(BASE_ENTITY);
    const snippetEl = card.querySelector('.entity-card__snippet');
    expect(snippetEl).not.toBeNull();
    expect(snippetEl.textContent).toContain('Solar System');
  });

  it('"Open" button click calls window.open with entity.url', () => {
    const card = citationCard(BASE_ENTITY);
    document.body.appendChild(card);
    card.querySelector('.entity-card__btn--open').click();
    expect(window.open).toHaveBeenCalledWith(BASE_ENTITY.url, '_blank', 'noopener');
  });

  it('snippet element is absent when snippet is empty string', () => {
    const card = citationCard({ ...BASE_ENTITY, snippet: '' });
    expect(card.querySelector('.entity-card__snippet')).toBeNull();
  });

  it('uses url as link text when title is absent', () => {
    const card = citationCard({ ...BASE_ENTITY, title: '' });
    const link = card.querySelector('.entity-card__title-link');
    expect(link.textContent).toBe(BASE_ENTITY.url);
  });
});
