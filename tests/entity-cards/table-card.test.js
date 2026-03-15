/**
 * tests/entity-cards/table-card.test.js — Task A.7
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { tableCard } from '../../src/lib/renderer/entity-cards/table-card.js';

const BASE_ENTITY = {
  id:           'e3',
  type:         'table',
  chatId:       'c1',
  messageIndex: 2,
  role:         'assistant',
  headers:      ['Name', 'Age', 'City'],
  rows: [
    ['Alice', '30', 'London'],
    ['Bob',   '25', 'Paris'],
    ['Carol', '35', 'Berlin'],
    ['Dave',  '28', 'Tokyo'],
  ],
  rowCount: 4,
};

describe('tableCard()', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      writable: true,
      configurable: true,
    });
    global.URL.createObjectURL = vi.fn(() => 'blob:test-url');
    global.URL.revokeObjectURL = vi.fn();
  });

  it('returns an HTMLElement', () => {
    expect(tableCard(BASE_ENTITY) instanceof HTMLElement).toBe(true);
  });

  it('has class entity-card--table', () => {
    expect(tableCard(BASE_ENTITY).classList.contains('entity-card--table')).toBe(true);
  });

  it('renders the header row with correct column names', () => {
    const card = tableCard(BASE_ENTITY);
    const ths = [...card.querySelectorAll('thead th')].map(th => th.textContent);
    expect(ths).toEqual(['Name', 'Age', 'City']);
  });

  it('shows first 2 data rows visible initially', () => {
    const card = tableCard(BASE_ENTITY);
    const visible = [...card.querySelectorAll('tbody tr')].filter(tr => !tr.hidden);
    expect(visible).toHaveLength(2);
    expect(visible[0].querySelector('td').textContent).toBe('Alice');
  });

  it('remaining rows are hidden initially', () => {
    const card = tableCard(BASE_ENTITY);
    const hidden = [...card.querySelectorAll('tbody tr')].filter(tr => tr.hidden);
    expect(hidden).toHaveLength(2);
  });

  it('"Show all" toggle reveals all rows', () => {
    const card = tableCard(BASE_ENTITY);
    document.body.appendChild(card);
    card.querySelector('.entity-card__btn--toggle').click();
    const hidden = [...card.querySelectorAll('tbody tr')].filter(tr => tr.hidden);
    expect(hidden).toHaveLength(0);
  });

  it('"Show all" button text changes to "Show less" after click', () => {
    const card = tableCard(BASE_ENTITY);
    document.body.appendChild(card);
    const btn = card.querySelector('.entity-card__btn--toggle');
    btn.click();
    expect(btn.textContent).toBe('Show less');
  });

  it('clicking "Show less" hides extra rows again', () => {
    const card = tableCard(BASE_ENTITY);
    document.body.appendChild(card);
    const btn = card.querySelector('.entity-card__btn--toggle');
    btn.click(); // show all
    btn.click(); // show less
    const hidden = [...card.querySelectorAll('tbody tr')].filter(tr => tr.hidden);
    expect(hidden).toHaveLength(2);
  });

  it('"Copy as Markdown" writes correct Markdown to clipboard', () => {
    const card = tableCard(BASE_ENTITY);
    document.body.appendChild(card);
    card.querySelector('.entity-card__btn--copy-md').click();
    const written = navigator.clipboard.writeText.mock.calls[0][0];
    expect(written).toContain('| Name | Age | City |');
    expect(written).toContain('| --- | --- | --- |');
    expect(written).toContain('| Alice | 30 | London |');
    expect(written).toContain('| Dave | 28 | Tokyo |');
  });

  it('"Export as CSV" creates a Blob and triggers download', () => {
    const card = tableCard(BASE_ENTITY);
    document.body.appendChild(card);
    card.querySelector('.entity-card__btn--export-csv').click();
    expect(URL.createObjectURL).toHaveBeenCalledOnce();
    const blob = URL.createObjectURL.mock.calls[0][0];
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('text/csv');
  });

  it('no expand toggle rendered when rows ≤ 2', () => {
    const small = { ...BASE_ENTITY, rows: [['A', '1', 'X']], rowCount: 1 };
    const card = tableCard(small);
    expect(card.querySelector('.entity-card__btn--toggle')).toBeNull();
  });

  it('handles entity with no rows gracefully', () => {
    const empty = { ...BASE_ENTITY, headers: ['A', 'B'], rows: [], rowCount: 0 };
    expect(() => tableCard(empty)).not.toThrow();
  });
});
