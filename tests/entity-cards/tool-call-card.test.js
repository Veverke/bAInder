/**
 * tests/entity-cards/tool-call-card.test.js — Task C.3
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { toolCallCard } from '../../src/lib/renderer/entity-cards/tool-call-card.js';

const BASE_ENTITY = {
  id:           'e1',
  type:         'toolCall',
  chatId:       'c1',
  messageIndex: 1,
  role:         'tool',
  tool:         'web_search',
  input:        'What is quantum computing?',
  output:       'Quantum computing is a type of computation that harnesses quantum mechanical phenomena.',
  durationMs:   null,
};

describe('toolCallCard()', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('returns an HTMLElement', () => {
    expect(toolCallCard(BASE_ENTITY) instanceof HTMLElement).toBe(true);
  });

  it('has class entity-card--tool-call', () => {
    const card = toolCallCard(BASE_ENTITY);
    expect(card.classList.contains('entity-card--tool-call')).toBe(true);
  });

  it('badge shows the correct tool type label', () => {
    const card  = toolCallCard(BASE_ENTITY);
    const badge = card.querySelector('.entity-card__badge--tool');
    expect(badge).not.toBeNull();
    expect(badge.textContent).toContain('Web Search');
  });

  it('badge shows label for code_interpreter', () => {
    const entity = { ...BASE_ENTITY, tool: 'code_interpreter' };
    const badge  = toolCallCard(entity).querySelector('.entity-card__badge--tool');
    expect(badge.textContent).toContain('Code Interpreter');
  });

  it('badge shows label for unknown tool', () => {
    const entity = { ...BASE_ENTITY, tool: 'unknown' };
    const badge  = toolCallCard(entity).querySelector('.entity-card__badge--tool');
    expect(badge.textContent).toContain('Tool');
  });

  it('input is truncated to 100 chars in summary', () => {
    const longInput = 'A'.repeat(200);
    const entity = { ...BASE_ENTITY, input: longInput };
    const card   = toolCallCard(entity);
    const summary = card.querySelector('.entity-card__tool-input');
    expect(summary).not.toBeNull();
    expect(summary.textContent.length).toBeLessThanOrEqual(101); // 100 + ellipsis char
    expect(summary.textContent).toMatch(/…$/);
  });

  it('output is truncated to 150 chars in preview', () => {
    const longOutput = 'B'.repeat(300);
    const entity = { ...BASE_ENTITY, output: longOutput };
    const card   = toolCallCard(entity);
    const preview = card.querySelector('.entity-card__tool-output');
    expect(preview).not.toBeNull();
    expect(preview.textContent.length).toBeLessThanOrEqual(151);
    expect(preview.textContent).toMatch(/…$/);
  });

  it('"Show full" details element is present when input or output exists', () => {
    const card = toolCallCard(BASE_ENTITY);
    expect(card.querySelector('details.entity-card__tool-details')).not.toBeNull();
    expect(card.querySelector('details summary').textContent).toBe('Show full');
  });

  it('"Show full" section contains full input text', () => {
    const card     = toolCallCard(BASE_ENTITY);
    const inputFull = card.querySelector('.entity-card__tool-input-full');
    expect(inputFull).not.toBeNull();
    expect(inputFull.textContent).toBe(BASE_ENTITY.input);
  });

  it('"Show full" section contains full output text', () => {
    const card      = toolCallCard(BASE_ENTITY);
    const outputFull = card.querySelector('.entity-card__tool-output-full');
    expect(outputFull).not.toBeNull();
    expect(outputFull.textContent).toBe(BASE_ENTITY.output);
  });

  it('clicking card fires onOpen with the entity', () => {
    const onOpen = vi.fn();
    const card   = toolCallCard(BASE_ENTITY, { onOpen });
    document.body.appendChild(card);
    card.click();
    expect(onOpen).toHaveBeenCalledWith(BASE_ENTITY);
  });

  it('card without onOpen does not throw on click', () => {
    const card = toolCallCard(BASE_ENTITY);
    document.body.appendChild(card);
    expect(() => card.click()).not.toThrow();
  });

  it('empty input renders no input summary element', () => {
    const entity = { ...BASE_ENTITY, input: '' };
    const card   = toolCallCard(entity);
    expect(card.querySelector('.entity-card__tool-input')).toBeNull();
  });

  it('empty output renders no output preview element', () => {
    const entity = { ...BASE_ENTITY, output: '' };
    const card   = toolCallCard(entity);
    expect(card.querySelector('.entity-card__tool-output')).toBeNull();
  });

  it('short input is not truncated', () => {
    const shortInput = 'Short query';
    const entity = { ...BASE_ENTITY, input: shortInput };
    const summary = toolCallCard(entity).querySelector('.entity-card__tool-input');
    expect(summary.textContent).toBe(shortInput);
  });
});
