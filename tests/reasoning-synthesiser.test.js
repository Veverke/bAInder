/**
 * tests/reasoning-synthesiser.test.js — Phase 5
 * Tests for scoreConfidence(), extractConclusion(), and synthesise().
 */

import { describe, it, expect } from 'vitest';
import {
  scoreConfidence,
  extractConclusion,
  synthesise,
} from '../src/lib/analysis/reasoning-synthesiser.js';

// ---------------------------------------------------------------------------
// scoreConfidence
// ---------------------------------------------------------------------------

describe('scoreConfidence', () => {
  it('returns a value in [0, 1]', () => {
    const score = scoreConfidence('This might possibly work, but it could also fail.');
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  it('fully hedged text scores < 0.3', () => {
    const hedged = 'It might possibly work. It could perhaps be the case that this perhaps works. Unclear and uncertain results may appear.';
    expect(scoreConfidence(hedged)).toBeLessThan(0.3);
  });

  it('fully assertive text scores > 0.7', () => {
    const assertive = 'You should definitely use this. The answer is clearly X. I recommend this. Therefore, always do Y. The correct solution is here.';
    expect(scoreConfidence(assertive)).toBeGreaterThan(0.7);
  });

  it('balanced text scores ≈ 0.5 (±0.25)', () => {
    const balanced = 'This might work. You should try it. It could be helpful though I recommend testing first.';
    const score = scoreConfidence(balanced);
    expect(score).toBeGreaterThan(0.25);
    expect(score).toBeLessThan(0.75);
  });

  it('empty string returns 0', () => {
    expect(scoreConfidence('')).toBe(0);
  });

  it('null/undefined returns 0', () => {
    expect(scoreConfidence(null)).toBe(0);
    expect(scoreConfidence(undefined)).toBe(0);
  });

  it('text with no signals returns 0.5 (neutral)', () => {
    // Plain text with no hedging or assertive markers
    expect(scoreConfidence('The cat sat on the mat.')).toBe(0.5);
  });
});

// ---------------------------------------------------------------------------
// extractConclusion
// ---------------------------------------------------------------------------

describe('extractConclusion', () => {
  it('with 1 turn: returns that turn (possibly truncated)', () => {
    const result = extractConclusion(['This is the conclusion.']);
    expect(result).toContain('This is the conclusion');
  });

  it('with 5 turns: returns content from last 1–2 turns', () => {
    const turns = ['turn1', 'turn2', 'turn3', 'turn4', 'final conclusion here'];
    const result = extractConclusion(turns);
    expect(result).toContain('final conclusion here');
    expect(result).not.toContain('turn1');
    expect(result).not.toContain('turn2');
    expect(result).not.toContain('turn3');
  });

  it('empty turns array returns empty string', () => {
    expect(extractConclusion([])).toBe('');
  });

  it('strips markdown headings from output', () => {
    const result = extractConclusion(['## Conclusion\nThis is the answer.']);
    expect(result).not.toMatch(/^##/m);
    expect(result).toContain('This is the answer');
  });

  it('strips markdown heading level 1', () => {
    const result = extractConclusion(['# Title\nContent here.']);
    expect(result).not.toMatch(/^#\s/m);
  });

  it('truncates to approximately 300 words', () => {
    const longTurn = Array.from({ length: 400 }, (_, i) => `word${i}`).join(' ');
    const result = extractConclusion([longTurn]);
    const wordCount = result.split(/\s+/).filter(Boolean).length;
    // Allow some tolerance for the ellipsis
    expect(wordCount).toBeLessThanOrEqual(302);
  });

  it('handles null input gracefully', () => {
    expect(extractConclusion(null)).toBe('');
  });

  it('strips inline code markers', () => {
    const result = extractConclusion(['Use `console.log()` to debug.']);
    expect(result).not.toContain('`');
  });
});

// ---------------------------------------------------------------------------
// synthesise
// ---------------------------------------------------------------------------

describe('synthesise', () => {
  function makeChat(label, turns, overallSimilarity = null) {
    return { label, turns, overallSimilarity };
  }

  it('returns confidenceScores with one entry per chat', () => {
    const chats = [
      makeChat('A', ['definitely the answer is X']),
      makeChat('B', ['it might possibly work']),
      makeChat('C', ['you should always do this']),
    ];
    const result = synthesise(chats);
    expect(result.confidenceScores).toHaveLength(3);
  });

  it('mostDefinitive points to the most assertive chat', () => {
    const chats = [
      makeChat('Hedged', ['it might possibly work']),
      makeChat('Assertive', ['you should definitely always do this clearly']),
    ];
    const result = synthesise(chats);
    expect(result.mostDefinitive).toBe(1);
  });

  it('synthesisNote references agreement when all chats broadly agree (high similarity)', () => {
    const chats = [
      makeChat('A', ['definitely the best approach'], 0.95),
      makeChat('B', ['clearly the correct way'],      0.92),
    ];
    const result = synthesise(chats);
    expect(result.synthesisNote.toLowerCase()).toMatch(/agree|definitive/);
  });

  it('synthesisNote references divergence when outlier chat present', () => {
    const chats = [
      makeChat('A', ['you should do X'],  0.9),
      makeChat('B', ['it might not work'], 0.4), // outlier
    ];
    const result = synthesise(chats);
    expect(result.synthesisNote.toLowerCase()).toMatch(/differ|diverge/);
  });

  it('note generated without agreement phrasing when overallSimilarity is null', () => {
    const chats = [
      makeChat('A', ['you should clearly do this always'], null),
      makeChat('B', ['it might possibly work'],            null),
    ];
    const result = synthesise(chats);
    // Should not crash and should produce a note
    expect(typeof result.synthesisNote).toBe('string');
    expect(result.synthesisNote.length).toBeGreaterThan(0);
    // Should not mention "broadly agree" (which requires similarity data)
    expect(result.synthesisNote).not.toContain('broadly agree');
  });

  it('with 3 chats: confidenceScores has 3 entries', () => {
    const chats = [
      makeChat('A', ['text']),
      makeChat('B', ['text']),
      makeChat('C', ['text']),
    ];
    const result = synthesise(chats);
    expect(result.confidenceScores).toHaveLength(3);
  });

  it('conclusions array has one entry per chat', () => {
    const chats = [
      makeChat('A', ['conclusion A']),
      makeChat('B', ['conclusion B']),
    ];
    const result = synthesise(chats);
    expect(result.conclusions).toHaveLength(2);
  });

  it('mostDefinitive index is in range [0, n-1]', () => {
    const chats = [makeChat('A', ['']), makeChat('B', [''])];
    const result = synthesise(chats);
    expect(result.mostDefinitive).toBeGreaterThanOrEqual(0);
    expect(result.mostDefinitive).toBeLessThanOrEqual(1);
  });
});
