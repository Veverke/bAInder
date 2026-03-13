/**
 * semantic-analyser.js — C.18
 *
 * TF-IDF cosine similarity for reasoning alignment across chat turns.
 * Pure JS — no WASM, no web workers, fully compatible with Chrome MV3.
 */

/** Turns with cosine similarity below this are flagged as divergent. */
export const DIVERGENCE_THRESHOLD = 0.65;

// ---------------------------------------------------------------------------
// Text utilities
// ---------------------------------------------------------------------------

/**
 * Tokenise text: lowercase, strip code blocks, split on non-alphanumeric.
 * @param {string} text
 * @returns {string[]}
 */
export function tokenize(text) {
  return (text ?? '')
    .toLowerCase()
    .replace(/```[\s\S]*?```/g, ' ')   // strip fenced code blocks
    .replace(/`[^`]+`/g, ' ')          // strip inline code
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 1);
}

// ---------------------------------------------------------------------------
// TF-IDF internals
// ---------------------------------------------------------------------------

function computeIdf(tokenizedDocs) {
  const N  = tokenizedDocs.length;
  const df = new Map();
  for (const tokens of tokenizedDocs) {
    for (const t of new Set(tokens)) df.set(t, (df.get(t) ?? 0) + 1);
  }
  const idf = new Map();
  for (const [t, count] of df) {
    idf.set(t, Math.log((N + 1) / (count + 1)) + 1); // smoothed IDF
  }
  return idf;
}

function tfidfVector(tokens, idf) {
  const tf  = new Map();
  for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
  const len = tokens.length || 1;
  const vec = new Map();
  for (const [t, count] of tf) {
    const idfVal = idf.get(t);
    if (idfVal !== undefined) vec.set(t, (count / len) * idfVal);
  }
  return vec;
}

function cosineSimilarityMap(a, b) {
  let dot = 0, magA = 0, magB = 0;
  for (const [t, va] of a) { dot += va * (b.get(t) ?? 0); magA += va * va; }
  for (const [, vb] of b) magB += vb * vb;
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

/** Return the index of the document with the highest average similarity to all others. */
function findMedoid(vectors) {
  if (vectors.length <= 1) return 0;
  let bestIdx = 0, bestScore = -Infinity;
  for (let i = 0; i < vectors.length; i++) {
    let sum = 0;
    for (let j = 0; j < vectors.length; j++) {
      if (i !== j) sum += cosineSimilarityMap(vectors[i], vectors[j]);
    }
    const avg = sum / (vectors.length - 1);
    if (avg > bestScore) { bestScore = avg; bestIdx = i; }
  }
  return bestIdx;
}

// ---------------------------------------------------------------------------
// Float32Array cosine similarity — kept for external callers / unit tests
// ---------------------------------------------------------------------------

/**
 * Cosine similarity between two Float32Array vectors.
 * Returns 0 for zero-length vectors (no division by zero).
 * @param {Float32Array} a
 * @param {Float32Array} b
 * @returns {number} value in [-1, 1]
 */
export function cosineSimilarity(a, b) {
  let dot = 0, magA = 0, magB = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    dot  += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  for (let i = len; i < a.length; i++) magA += a[i] * a[i];
  for (let i = len; i < b.length; i++) magB += b[i] * b[i];
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

// ---------------------------------------------------------------------------
// Core comparison
// ---------------------------------------------------------------------------

/**
 * Compare assistant turn texts across N chats using TF-IDF cosine similarity.
 *
 * @param {string[][]} allTurns   allTurns[chatIdx][turnIdx] = assistant turn text
 * @param {(pct: number) => void} [onProgress]  0–100 progress callback
 * @returns {Promise<{ medoidIndex, turnScores, overallScores, divergentTurns }>}
 */
export async function compareReasoningTurns(allTurns, onProgress) {
  onProgress?.(10);
  const maxTurns = Math.max(0, ...allTurns.map(t => t.length));

  // Step 1 — find medoid on overall (all-turns-concatenated) TF-IDF vectors
  const chatTexts   = allTurns.map(turns => turns.join(' '));
  const chatTokens  = chatTexts.map(tokenize);
  const globalIdf   = computeIdf(chatTokens);
  const chatVectors = chatTokens.map(tokens => tfidfVector(tokens, globalIdf));
  const medoidIndex = findMedoid(chatVectors);

  onProgress?.(40);

  // Step 2 — per-turn TF-IDF vectors (IDF computed across all chats at that turn)
  const turnVectors = [];
  for (let turnIdx = 0; turnIdx < maxTurns; turnIdx++) {
    const texts     = allTurns.map(turns => turns[turnIdx] ?? '');
    const tokenized = texts.map(tokenize);
    const idf       = computeIdf(tokenized);
    turnVectors.push(tokenized.map(tokens => tfidfVector(tokens, idf)));
  }

  onProgress?.(70);

  // Step 3 — per-turn similarity scores vs. medoid
  const turnScores = allTurns.map((turns, chatIdx) =>
    Array.from({ length: maxTurns }, (_, turnIdx) => {
      if (chatIdx === medoidIndex) return null;
      const refText  = allTurns[medoidIndex]?.[turnIdx] ?? '';
      const thisText = allTurns[chatIdx]?.[turnIdx]    ?? '';
      if (!refText || !thisText) return null;
      const refVec  = turnVectors[turnIdx]?.[medoidIndex];
      const thisVec = turnVectors[turnIdx]?.[chatIdx];
      if (!refVec || !thisVec) return null;
      return Math.max(0, cosineSimilarityMap(refVec, thisVec));
    })
  );

  // Step 4 — overall score per chat (word-count weighted average of turn scores)
  const overallScores = allTurns.map((turns, chatIdx) => {
    if (chatIdx === medoidIndex) return 1;
    const scores = turnScores[chatIdx];
    let wSum = 0, wTotal = 0;
    turns.forEach((turn, turnIdx) => {
      const score = scores[turnIdx];
      if (score === null) return;
      const weight = Math.max(1, turn.split(/\s+/).filter(Boolean).length);
      wSum   += score * weight;
      wTotal += weight;
    });
    return wTotal > 0 ? wSum / wTotal : 0;
  });

  // Step 5 — flag divergent turns
  const divergentTurns = [];
  for (let t = 0; t < maxTurns; t++) {
    if (allTurns.some((_, chatIdx) => {
      if (chatIdx === medoidIndex) return false;
      const score = turnScores[chatIdx][t];
      return score !== null && score < DIVERGENCE_THRESHOLD;
    })) divergentTurns.push(t);
  }

  onProgress?.(100);

  return { medoidIndex, turnScores, overallScores, divergentTurns };
}



