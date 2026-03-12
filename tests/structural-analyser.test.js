/**
 * tests/structural-analyser.test.js — Phase 2
 * Tests for analyseStructure() covering all structural metric detectors.
 */

import { describe, it, expect } from 'vitest';
import { analyseStructure } from '../src/lib/analysis/structural-analyser.js';

describe('analyseStructure', () => {
  it('returns all zeros for empty turns array', () => {
    const r = analyseStructure([]);
    expect(r).toEqual({ headings: 0, codeBlocks: 0, listItems: 0, tables: 0, paragraphs: 0, totalWords: 0, avgTurnWords: 0 });
  });

  it('counts headings: single turn with 2 ATX headings', () => {
    const r = analyseStructure(['# Title\n\nSome text\n\n## Section']);
    expect(r.headings).toBe(2);
  });

  it('counts all heading levels (h1–h6)', () => {
    const r = analyseStructure(['# h1\n## h2\n### h3\n#### h4\n##### h5\n###### h6']);
    expect(r.headings).toBe(6);
  });

  it('counts code blocks: single fenced code block', () => {
    const r = analyseStructure(['Before\n```js\nconsole.log("hi");\n```\nAfter']);
    expect(r.codeBlocks).toBe(1);
  });

  it('counts multiple code blocks', () => {
    const r = analyseStructure(['```\nblock1\n```\n\n```\nblock2\n```']);
    expect(r.codeBlocks).toBe(2);
  });

  it('counts unordered list items (3 items)', () => {
    const r = analyseStructure(['- Item 1\n- Item 2\n- Item 3']);
    expect(r.listItems).toBe(3);
  });

  it('counts ordered list items (2 items)', () => {
    const r = analyseStructure(['1. First\n2. Second']);
    expect(r.listItems).toBe(2);
  });

  it('counts table lines: turn with single markdown table', () => {
    const r = analyseStructure(['| Col A | Col B |\n|-------|-------|\n| 1 | 2 |']);
    expect(r.tables).toBeGreaterThanOrEqual(1);
  });

  it('correctly counts totalWords across two turns', () => {
    // 3 words + 2 words = 5
    const r = analyseStructure(['one two three', 'four five']);
    expect(r.totalWords).toBe(5);
    expect(r.avgTurnWords).toBeCloseTo(2.5);
  });

  it('counts paragraphs: 3 prose blocks separated by blank lines', () => {
    const r = analyseStructure(['Para one.\n\nPara two.\n\nPara three.']);
    expect(r.paragraphs).toBe(3);
  });

  it('excludes code block content from word count', () => {
    // "hello world" outside code block = 2 words; words inside ``` are excluded
    const r = analyseStructure(['hello world\n```\nignored text inside block\n```']);
    expect(r.totalWords).toBe(2);
  });

  it('handles mixed content: headings + code + list + prose', () => {
    const mixed = [
      '# Heading\n\n```js\nconsole.log(1);\n```\n\n- item\n\nParagraph text here.',
    ];
    const r = analyseStructure(mixed);
    expect(r.headings).toBeGreaterThanOrEqual(1);
    expect(r.codeBlocks).toBeGreaterThanOrEqual(1);
    expect(r.listItems).toBeGreaterThanOrEqual(1);
    expect(r.paragraphs).toBeGreaterThanOrEqual(1);
    expect(r.totalWords).toBeGreaterThan(0);
  });

  it('averages turn words correctly across multiple turns', () => {
    // Turn 1: 4 words, Turn 2: 2 words → avg = 3
    const r = analyseStructure(['one two three four', 'five six']);
    expect(r.avgTurnWords).toBeCloseTo(3);
    expect(r.totalWords).toBe(6);
  });

  it('returns avgTurnWords = 0 for empty turns', () => {
    const r = analyseStructure([]);
    expect(r.avgTurnWords).toBe(0);
  });
});
