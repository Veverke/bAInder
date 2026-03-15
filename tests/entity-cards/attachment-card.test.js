/**
 * tests/entity-cards/attachment-card.test.js — Task C.4
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { attachmentCard } from '../../src/lib/renderer/entity-cards/attachment-card.js';

const PDF_ENTITY = {
  id:           'e1',
  type:         'attachment',
  chatId:       'c1',
  messageIndex: 0,
  role:         'user',
  filename:     'report.pdf',
  mimeType:     'application/pdf',
  sizeBytes:    204800, // 200 KB
};

const IMAGE_ENTITY = {
  ...PDF_ENTITY,
  id:       'e2',
  filename: 'photo.png',
  mimeType: 'image/png',
  sizeBytes: 2 * 1024 * 1024, // 2 MB
};

describe('attachmentCard()', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('returns an HTMLElement', () => {
    expect(attachmentCard(PDF_ENTITY) instanceof HTMLElement).toBe(true);
  });

  it('has class entity-card--attachment', () => {
    const card = attachmentCard(PDF_ENTITY);
    expect(card.classList.contains('entity-card--attachment')).toBe(true);
  });

  it('PDF mime type → shows PDF icon', () => {
    const card = attachmentCard(PDF_ENTITY);
    const icon = card.querySelector('.entity-card__attachment-icon');
    expect(icon).not.toBeNull();
    expect(icon.textContent).toBe('📄');
  });

  it('image mime type → shows image icon', () => {
    const card = attachmentCard(IMAGE_ENTITY);
    const icon = card.querySelector('.entity-card__attachment-icon');
    expect(icon.textContent).toBe('🖼️');
  });

  it('CSV mime type → shows spreadsheet icon', () => {
    const entity = { ...PDF_ENTITY, mimeType: 'text/csv', filename: 'data.csv' };
    const icon   = attachmentCard(entity).querySelector('.entity-card__attachment-icon');
    expect(icon.textContent).toBe('📊');
  });

  it('zip mime type → shows archive icon', () => {
    const entity = { ...PDF_ENTITY, mimeType: 'application/zip', filename: 'archive.zip' };
    const icon   = attachmentCard(entity).querySelector('.entity-card__attachment-icon');
    expect(icon.textContent).toBe('🗜️');
  });

  it('filename is displayed', () => {
    const card   = attachmentCard(PDF_ENTITY);
    const nameEl = card.querySelector('.entity-card__attachment-name');
    expect(nameEl).not.toBeNull();
    expect(nameEl.textContent).toBe('report.pdf');
  });

  it('size badge shows KB for byte sizes under 1 MB', () => {
    const card      = attachmentCard(PDF_ENTITY); // 200 KB
    const sizeBadge = card.querySelector('.entity-card__badge--size');
    expect(sizeBadge).not.toBeNull();
    expect(sizeBadge.textContent).toContain('KB');
  });

  it('size badge shows MB for byte sizes ≥ 1 MB', () => {
    const card     = attachmentCard(IMAGE_ENTITY); // 2 MB
    const sizeBadge = card.querySelector('.entity-card__badge--size');
    expect(sizeBadge.textContent).toContain('MB');
  });

  it('no size badge when sizeBytes is null', () => {
    const entity = { ...PDF_ENTITY, sizeBytes: null };
    const card   = attachmentCard(entity);
    expect(card.querySelector('.entity-card__badge--size')).toBeNull();
  });

  it('"Original file" notice is present for all attachment cards', () => {
    const card   = attachmentCard(PDF_ENTITY);
    const notice = card.querySelector('.entity-card__attachment-notice');
    expect(notice).not.toBeNull();
    expect(notice.textContent.toLowerCase()).toContain('original file');
  });

  it('"Original file" notice present even without filename', () => {
    const entity = { ...PDF_ENTITY, filename: null, mimeType: null };
    const card   = attachmentCard(entity);
    expect(card.querySelector('.entity-card__attachment-notice')).not.toBeNull();
  });

  it('"Go to message" button fires onOpen with entity', () => {
    const onOpen = vi.fn();
    const card   = attachmentCard(PDF_ENTITY, { onOpen });
    document.body.appendChild(card);
    card.querySelector('.entity-card__btn--goto').click();
    expect(onOpen).toHaveBeenCalledWith(PDF_ENTITY);
  });

  it('no "Go to message" button when onOpen not provided', () => {
    const card = attachmentCard(PDF_ENTITY);
    expect(card.querySelector('.entity-card__btn--goto')).toBeNull();
  });

  it('"Untitled file" shown when filename is null', () => {
    const entity = { ...PDF_ENTITY, filename: null };
    const nameEl = attachmentCard(entity).querySelector('.entity-card__attachment-name');
    expect(nameEl.textContent).toBe('Untitled file');
  });

  it('size formats correctly: exactly 1024 bytes → 1 KB', () => {
    const entity = { ...PDF_ENTITY, sizeBytes: 1024 };
    const badge  = attachmentCard(entity).querySelector('.entity-card__badge--size');
    expect(badge.textContent).toBe('1 KB');
  });

  it('small byte size (under 1 KB) shown as bytes', () => {
    const entity = { ...PDF_ENTITY, sizeBytes: 512 };
    const badge  = attachmentCard(entity).querySelector('.entity-card__badge--size');
    expect(badge.textContent).toBe('512 B');
  });
});
