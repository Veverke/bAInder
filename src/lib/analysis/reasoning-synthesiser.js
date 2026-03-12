/**
 * reasoning-synthesiser.js — C.18
 *
 * Pure JS analysis of reasoning confidence and actionability.
 * No external dependencies.
 */

import { DIVERGENCE_THRESHOLD } from './semantic-analyser.js';

// ---------------------------------------------------------------------------
// Pattern lists
// ---------------------------------------------------------------------------

const HEDGING_PATTERNS = [
  /\b(may|might|could|possibly|perhaps|potentially|seems?\s+to|appears?\s+to)\b/gi,
  /\bit\s+is\s+(possible|likely)\b/gi,
  /\bone\s+(possibility|option)\b/gi,
  /\b(unclear|uncertain|depends?\s+(on|upon)|varies)\b/gi,
  /\bnot\s+(definitive|conclusive)\b/gi,
];

const ASSERTIVE_PATTERNS = [
  /\b(clearly|definitely|certainly)\b/gi,
  /\bthe\s+(answer|solution|recommendation)\s+is\b/gi,
  /\b(you\s+should|always|never|must|will)\b/gi,
  /\bis\s+the\s+best\b/gi,
  /\brecommend(ed)?\b/gi,
  /\bthe\s+correct\b/gi,
  /\b(specifically|in\s+conclusion|therefore|thus)\b/gi,
];

// ---------------------------------------------------------------------------
// Public utilities
// ---------------------------------------------------------------------------

/**
 * Score the confidence/assertiveness of a text passage.
 * Returns a value in [0, 1]: 0 = pure hedging, 1 = fully assertive.
 * @param {string} text
 * @returns {number}
 */
export function scoreConfidence(text) {
  if (!text || typeof text !== 'string') return 0;

  let hedging    = 0;
  let assertive  = 0;

  for (const pat of HEDGING_PATTERNS) {
    const m = text.match(pat);
    if (m) hedging += m.length;
  }
  for (const pat of ASSERTIVE_PATTERNS) {
    const m = text.match(pat);
    if (m) assertive += m.length;
  }

  const total = hedging + assertive;
  if (total === 0) return 0.5; // neutral — no signals either way
  return assertive / total;
}

/**
 * Extract the conclusion from a chat — the last 1–2 assistant turns,
 * stripped of markdown formatting, truncated to ~300 words.
 * @param {string[]} assistantTurns
 * @returns {string}
 */
export function extractConclusion(assistantTurns) {
  if (!Array.isArray(assistantTurns) || assistantTurns.length === 0) return '';

  const lastTwo = assistantTurns.slice(-2).join('\n\n');

  // Strip markdown headings, code fences, list markers, link syntax
  const stripped = lastTwo
    .replace(/^#{1,6}\s+/gm, '')        // headings
    .replace(/```[\s\S]*?```/g, '')      // fenced code blocks
    .replace(/`[^`]+`/g, '')            // inline code
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '') // images
    .replace(/\[[^\]]*\]\([^)]*\)/g, '')  // links
    .replace(/^[-*+]\s+/gm, '')         // unordered list items
    .replace(/^\d+\.\s+/gm, '')         // ordered list items
    .replace(/[*_~>|]/g, '')            // remaining markdown symbols
    .replace(/\n{3,}/g, '\n\n')         // collapse excess blank lines
    .trim();

  // Truncate to ~300 words
  const words = stripped.split(/\s+/).filter(Boolean);
  if (words.length <= 300) return stripped;
  return words.slice(0, 300).join(' ') + '…';
}

/**
 * Synthesise a comparison report for N chats.
 * @param {Array<{label: string, turns: string[], overallSimilarity: number|null}>} chats
 * @returns {{
 *   confidenceScores: number[],
 *   mostDefinitive:   number,
 *   conclusions:      string[],
 *   agreements:       string[],
 *   divergences:      string[],
 *   synthesisNote:    string,
 * }}
 */
export function synthesise(chats) {
  const confidenceScores = chats.map(c => scoreConfidence(c.turns.join('\n')));
  const conclusions      = chats.map(c => extractConclusion(c.turns));

  // Index of most confident chat
  const mostDefinitive = confidenceScores.reduce(
    (best, score, i) => score > confidenceScores[best] ? i : best,
    0
  );

  // Determine agreement / divergence using overallSimilarity if available
  const similarities = chats.map(c => c.overallSimilarity);
  const hasSimilarities = similarities.some(s => s !== null && s !== undefined);

  // Count how many chats have low similarity (outliers)
  const outlierCount = hasSimilarities
    ? similarities.filter((s, i) => s !== null && s < DIVERGENCE_THRESHOLD).length
    : 0;

  const avgSimilarity = hasSimilarities
    ? similarities.filter(s => s !== null).reduce((a, b) => a + b, 0) /
      similarities.filter(s => s !== null).length
    : null;

  // Build synthesis note
  let synthesisNote = '';

  const mostDefLabel = chats[mostDefinitive]?.label ?? 'the most definitive chat';

  if (!hasSimilarities) {
    // No semantic data available
    const otherHedged = confidenceScores.some((s, i) => i !== mostDefinitive && s < 0.4);
    if (otherHedged) {
      synthesisNote = `Prefer ${mostDefLabel}'s guidance — it is the most definitive. Others are more exploratory.`;
    } else {
      synthesisNote = `${mostDefLabel} expresses the highest confidence.`;
    }
  } else if (avgSimilarity !== null && avgSimilarity >= 0.8 && outlierCount === 0) {
    synthesisNote = `All chats broadly agree. ${mostDefLabel} expresses the highest confidence.`;
  } else if (outlierCount > 0) {
    const divergent = similarities.reduce((acc, s, i) => {
      if (s !== null && s < DIVERGENCE_THRESHOLD) acc.push(i + 1);
      return acc;
    }, []);
    synthesisNote = `Chats differ on ${divergent.length} reasoning point${divergent.length === 1 ? '' : 's'}. ` +
      `Review the highlighted divergent turns before acting.`;
  } else {
    // One dominant assertive, others hedged
    const otherHedged = confidenceScores.some((s, i) => i !== mostDefinitive && s < 0.4);
    if (otherHedged) {
      synthesisNote = `Prefer ${mostDefLabel}'s guidance — it is the most definitive. Others are more exploratory.`;
    } else {
      synthesisNote = `${mostDefLabel} expresses the highest confidence.`;
    }
  }

  return {
    confidenceScores,
    mostDefinitive,
    conclusions,
    agreements:  [],
    divergences: [],
    synthesisNote,
  };
}
