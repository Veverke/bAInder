/**
 * tests/turn-differ.test.js — Phase 3
 * Tests for diffTurns(), diffToHtml(), diffAllTurns().
 */

import { describe, it, expect } from 'vitest';
import { diffTurns, diffToHtml, diffAllTurns } from '../src/lib/analysis/turn-differ.js';

describe('diffTurns', () => {
  it('identical strings produce only "equal" segments', () => {
    const diffs = diffTurns('hello world', 'hello world');
    expect(diffs.every(d => d.type === 'equal')).toBe(true);
  });

  it('completely different strings produce "insert" and "delete" segments', () => {
    const diffs = diffTurns('apple orange', 'cat dog');
    const types = diffs.map(d => d.type);
    expect(types).toContain('delete');
    expect(types).toContain('insert');
    expect(types).not.toContain('equal');
  });

  it('one word inserted in B shows type "insert" for that word', () => {
    const diffs = diffTurns('hello world', 'hello beautiful world');
    const insertedText = diffs.filter(d => d.type === 'insert').map(d => d.text).join(' ');
    expect(insertedText).toContain('beautiful');
  });

  it('one word deleted from A shows type "delete" for that word', () => {
    const diffs = diffTurns('hello beautiful world', 'hello world');
    const deletedText = diffs.filter(d => d.type === 'delete').map(d => d.text).join(' ');
    expect(deletedText).toContain('beautiful');
  });

  it('returns array of objects with type and text properties', () => {
    const diffs = diffTurns('a', 'b');
    expect(Array.isArray(diffs)).toBe(true);
    diffs.forEach(d => {
      expect(d).toHaveProperty('type');
      expect(d).toHaveProperty('text');
      expect(['insert', 'delete', 'equal']).toContain(d.type);
    });
  });
});

describe('diffToHtml', () => {
  it('equal segment produces plain text, no tags', () => {
    const html = diffToHtml([{ type: 'equal', text: 'hello' }]);
    expect(html).toBe('hello');
    expect(html).not.toContain('<ins');
    expect(html).not.toContain('<del');
  });

  it('insert segment is wrapped in <ins class="diff-ins">', () => {
    const html = diffToHtml([{ type: 'insert', text: 'new' }]);
    expect(html).toContain('<ins class="diff-ins">new</ins>');
  });

  it('delete segment is wrapped in <del class="diff-del">', () => {
    const html = diffToHtml([{ type: 'delete', text: 'old' }]);
    expect(html).toContain('<del class="diff-del">old</del>');
  });

  it('HTML special chars in equal segment are escaped (no XSS)', () => {
    const html = diffToHtml([{ type: 'equal', text: '<script>alert(1)</script>' }]);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('HTML special chars in insert segment are escaped (no XSS)', () => {
    const html = diffToHtml([{ type: 'insert', text: '<img src=x onerror=alert(1)>' }]);
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
  });

  it('HTML special chars in delete segment are escaped (no XSS)', () => {
    const html = diffToHtml([{ type: 'delete', text: '& > "' }]);
    expect(html).toContain('&amp;');
    expect(html).toContain('&gt;');
    expect(html).toContain('&quot;');
  });

  it('ampersand in equal text is escaped', () => {
    const html = diffToHtml([{ type: 'equal', text: 'a & b' }]);
    expect(html).toContain('&amp;');
  });
});

describe('diffAllTurns', () => {
  it('returns 3 HTML strings for 3-turn inputs', () => {
    const turnsA = ['turn A1', 'turn A2', 'turn A3'];
    const turnsB = ['turn B1', 'turn B2', 'turn B3'];
    const result  = diffAllTurns(turnsA, turnsB);
    expect(result).toHaveLength(3);
    result.forEach(html => expect(typeof html).toBe('string'));
  });

  it('pads shorter side with empty turns (B shorter than A)', () => {
    const result = diffAllTurns(['a', 'b', 'c'], ['x']);
    expect(result).toHaveLength(3);
  });

  it('pads shorter side with empty turns (A shorter than B)', () => {
    const result = diffAllTurns(['x'], ['a', 'b', 'c']);
    expect(result).toHaveLength(3);
  });

  it('identical turns produce output with no ins/del tags', () => {
    const result = diffAllTurns(['same text'], ['same text']);
    expect(result[0]).not.toContain('<ins');
    expect(result[0]).not.toContain('<del');
  });

  it('different turns produce ins or del tags', () => {
    const result = diffAllTurns(['apple'], ['orange']);
    expect(result[0]).toMatch(/<ins|<del/);
  });
});
