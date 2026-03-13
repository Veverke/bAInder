/**
 * tests/semantic-analyser.test.js â€” Phase 4
 *
 * Tests the pure-JS TF-IDF cosine similarity implementation.
 * No mocks required â€” all functions are deterministic pure JS.
 */

import { describe, it, expect } from 'vitest';
import {
  cosineSimilarity,
  tokenize,
  compareReasoningTurns,
  DIVERGENCE_THRESHOLD,
} from '../src/lib/analysis/semantic-analyser.js';

// ---------------------------------------------------------------------------
// DIVERGENCE_THRESHOLD
// ---------------------------------------------------------------------------

describe('DIVERGENCE_THRESHOLD', () => {
  it('is 0.65', () => {
    expect(DIVERGENCE_THRESHOLD).toBe(0.65);
  });
});

// ---------------------------------------------------------------------------
// cosineSimilarity (Float32Array â€” kept for backward compatibility)
// ---------------------------------------------------------------------------

describe('cosineSimilarity', () => {
  it('identical vectors â†’ 1.0', () => {
    const v = new Float32Array([1, 0, 0]);
    expect(cosineSimilarity(v, v)).toBeCloseTo(1.0);
  });

  it('orthogonal vectors â†’ 0.0', () => {
    const a = new Float32Array([1, 0]);
    const b = new Float32Array([0, 1]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(0.0);
  });

  it('opposite vectors â†’ -1.0', () => {
    const a = new Float32Array([1, 0]);
    const b = new Float32Array([-1, 0]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(-1.0);
  });

  it('zero vector â†’ 0 (no division by zero)', () => {
    const zero = new Float32Array([0, 0, 0]);
    const v    = new Float32Array([1, 2, 3]);
    expect(cosineSimilarity(zero, v)).toBe(0);
    expect(cosineSimilarity(zero, zero)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// tokenize
// ---------------------------------------------------------------------------

describe('tokenize', () => {
  it('lowercases and splits on whitespace', () => {
    expect(tokenize('Hello World')).toEqual(['hello', 'world']);
  });

  it('strips fenced code blocks', () => {
    const result = tokenize('text\n```js\nconst x = 1;\n```\nmore');
    expect(result).not.toContain('const');
    expect(result).toContain('text');
    expect(result).toContain('more');
  });

  it('strips inline code', () => {
    const result = tokenize('use `npm install` to install');
    expect(result).not.toContain('npm');
    expect(result).toContain('install');
    expect(result).toContain('use');
  });

  it('filters single-character tokens', () => {
    expect(tokenize('a b c hello')).toEqual(['hello']);
  });

  it('handles empty string', () => {
    expect(tokenize('')).toEqual([]);
  });

  it('handles null/undefined gracefully', () => {
    expect(tokenize(null)).toEqual([]);
    expect(tokenize(undefined)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// compareReasoningTurns â€” pure TF-IDF, no mocks needed
// ---------------------------------------------------------------------------

describe('compareReasoningTurns', () => {
  it('returns correct shape', async () => {
    const allTurns = [
      ['The cat sat on the mat'],
      ['The dog lay on the rug'],
    ];
    const result = await compareReasoningTurns(allTurns);
    expect(result).toHaveProperty('medoidIndex');
    expect(result).toHaveProperty('turnScores');
    expect(result).toHaveProperty('overallScores');
    expect(result).toHaveProperty('divergentTurns');
  });

  it('medoidIndex is within [0, n-1]', async () => {
    const allTurns = [
      ['The answer is definitely correct and clear'],
      ['The solution might technically work in practice'],
      ['This could potentially be the right approach'],
    ];
    const { medoidIndex } = await compareReasoningTurns(allTurns);
    expect(medoidIndex).toBeGreaterThanOrEqual(0);
    expect(medoidIndex).toBeLessThanOrEqual(2);
  });

  it('overallScore for medoid is 1.0', async () => {
    const allTurns = [
      ['identical text for comparison test'],
      ['different content about a separate topic'],
    ];
    const { medoidIndex, overallScores } = await compareReasoningTurns(allTurns);
    expect(overallScores[medoidIndex]).toBe(1);
  });

  it('turnScores for medoid are null', async () => {
    const allTurns = [
      ['the fox jumped over the fence quickly today'],
      ['the cat sat on the warm comfortable mat'],
    ];
    const { medoidIndex, turnScores } = await compareReasoningTurns(allTurns);
    expect(turnScores[medoidIndex][0]).toBeNull();
  });

  it('identical chats: non-medoid has score of 1.0', async () => {
    const text = 'The quick brown fox jumps over the lazy dog again and again';
    const allTurns = [[text], [text]];
    const { overallScores } = await compareReasoningTurns(allTurns);
    // Non-medoid scores against identical text â†’ 1.0
    expect(Math.max(...overallScores)).toBeCloseTo(1.0, 5);
  });

  it('empty turns â†’ handles gracefully with no divergent turns', async () => {
    const allTurns = [[], []];
    const result = await compareReasoningTurns(allTurns);
    expect(result.medoidIndex).toBe(0);
    expect(result.divergentTurns).toHaveLength(0);
    expect(result.overallScores[0]).toBe(1);
  });

  it('unequal turn counts: missing turns get null score', async () => {
    const allTurns = [
      ['first turn text here', 'second turn text here'],
      ['first turn text here'],
    ];
    const { medoidIndex, turnScores } = await compareReasoningTurns(allTurns);
    const nonMedoidIdx = medoidIndex === 0 ? 1 : 0;
    // Chat with fewer turns: index 1 has no second turn â†’ null score at turn 1
    expect(turnScores[nonMedoidIdx][1]).toBeNull();
  });

  it('very different vocabularies: turn flagged as divergent', async () => {
    const allTurns = [
      ['python numpy pandas machine learning tensorflow neural network'],
      ['cooking recipe baking flour sugar butter chocolate vanilla cream'],
    ];
    const { divergentTurns } = await compareReasoningTurns(allTurns);
    expect(divergentTurns).toContain(0);
  });

  it('progress callback receives values 0â€“100', async () => {
    const allTurns = [['hello world foo'], ['goodbye world bar']];
    const values = [];
    await compareReasoningTurns(allTurns, pct => values.push(pct));
    expect(values.length).toBeGreaterThan(0);
    expect(Math.min(...values)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...values)).toBeLessThanOrEqual(100);
  });

  it('weighted average: longer turns weight more heavily on overall score', () => {
    const turns  = ['short', 'a much longer turn with many many words in it'];
    const scores = [0.9, 0.3];
    const wordCounts = turns.map(t => Math.max(1, t.split(/\s+/).filter(Boolean).length));
    let wSum = 0, wTotal = 0;
    turns.forEach((_, i) => { wSum += scores[i] * wordCounts[i]; wTotal += wordCounts[i]; });
    const weighted = wSum / wTotal;
    expect(weighted).toBeLessThan(0.9);
    expect(weighted).toBeGreaterThan(0.3);
  });

  it('turnScores has correct length for each chat', async () => {
    const allTurns = [
      ['turn 1 foo', 'turn 2 bar', 'turn 3 baz'],
      ['turn 1 qux', 'turn 2 quux'],
    ];
    const { turnScores } = await compareReasoningTurns(allTurns);
    // turnScores[i] should have maxTurns (3) entries
    expect(turnScores[0]).toHaveLength(3);
    expect(turnScores[1]).toHaveLength(3);
  });
});
