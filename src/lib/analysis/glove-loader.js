/**
 * glove-loader.js — Compact GloVe word vector loader for Chrome MV3.
 *
 * Loads public/glove.bin (produced by scripts/prepare-glove.js).
 * All public API gracefully returns null/false when the binary is absent —
 * callers fall back to TF-IDF word overlap automatically.
 *
 * Binary format (written by prepare-glove.js):
 *   [4 bytes uint32LE: N]  [4 bytes uint32LE: D]
 *   Repeated N times:
 *     [1 byte: word length L]  [L bytes: ASCII word]
 *     [4 bytes float32LE: per-word scale]  [D bytes int8: quantised components]
 *
 * Per-word quantisation: each int8 ≈ round(component / scale * 127).
 * Dequantised: component = int8 / 127 * scale.
 */

/** @type {Map<string, {scale: number, ints: Int8Array}> | null} */
let _vectors = null;
let _dim = 0;
let _initPromise = null;

/** Returns true when the vector table has been loaded successfully. */
export function isAvailable() { return _vectors !== null; }

/** Number of vector dimensions (0 until a successful load). */
export function dimensions() { return _dim; }

/**
 * Load the binary vector file.  Safe to call multiple times — returns the
 * same promise.  Resolves to true on success, false if the binary is absent
 * or malformed.
 * @returns {Promise<boolean>}
 */
export async function initialise() {
  if (_vectors !== null) return true;
  if (_initPromise)      return _initPromise;
  _initPromise = _load();
  return _initPromise;
}

async function _load() {
  try {
    const getUrl = typeof chrome !== 'undefined' && chrome.runtime?.getURL;
    const url    = getUrl ? chrome.runtime.getURL('glove.bin') : '/glove.bin';

    const resp = await fetch(url);
    if (!resp.ok) return false;

    const rawBuf = await resp.arrayBuffer();
    const view   = new DataView(rawBuf);
    const N = view.getUint32(0, true);
    const D = view.getUint32(4, true);
    if (!N || !D) return false;
    _dim = D;

    const decoder = new TextDecoder('ascii');
    const map     = new Map();
    let offset    = 8;

    for (let i = 0; i < N; i++) {
      const wordLen = view.getUint8(offset++);
      const word    = decoder.decode(new Uint8Array(rawBuf, offset, wordLen));
      offset += wordLen;

      const scale = view.getFloat32(offset, true);
      offset += 4;

      // Slice a view into the buffer for the int8 components
      const ints = new Int8Array(rawBuf.slice(offset, offset + D));
      offset += D;

      map.set(word, { scale, ints });
    }

    _vectors = map;
    return true;
  } catch {
    return false;
  }
}

/**
 * Returns the dequantised vector for a word, or null if unknown.
 * @param {string} word
 * @returns {Float32Array|null}
 */
export function wordVector(word) {
  const entry = _vectors?.get(word.toLowerCase());
  if (!entry) return null;
  const out = new Float32Array(_dim);
  const { scale, ints } = entry;
  for (let i = 0; i < _dim; i++) out[i] = (ints[i] / 127) * scale;
  return out;
}

/**
 * Mean-pool word vectors for a list of tokens.
 * Returns null if GloVe is not loaded or none of the tokens are in the vocab.
 * @param {string[]} tokens
 * @returns {Float32Array|null}
 */
export function sentenceVector(tokens) {
  if (!_vectors) return null;
  const sum = new Float32Array(_dim);
  let count = 0;
  for (const t of tokens) {
    const entry = _vectors.get(t);
    if (!entry) continue;
    const { scale, ints } = entry;
    for (let i = 0; i < _dim; i++) sum[i] += (ints[i] / 127) * scale;
    count++;
  }
  if (!count) return null;
  for (let i = 0; i < _dim; i++) sum[i] /= count;
  return sum;
}

/**
 * Cosine similarity between two Float32Array vectors.
 * @param {Float32Array} a
 * @param {Float32Array} b
 * @returns {number}  value in [-1, 1]
 */
export function cosineSim(a, b) {
  let dot = 0, ma = 0, mb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    ma  += a[i] * a[i];
    mb  += b[i] * b[i];
  }
  const denom = Math.sqrt(ma) * Math.sqrt(mb);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * Semantic similarity (mean GloVe vector cosine) between two token lists.
 * Returns null when GloVe is unavailable or either list has no known vocab.
 * @param {string[]} tokensA
 * @param {string[]} tokensB
 * @returns {number|null}
 */
export function semanticSimilarity(tokensA, tokensB) {
  const vA = sentenceVector(tokensA);
  const vB = sentenceVector(tokensB);
  if (!vA || !vB) return null;
  return cosineSim(vA, vB);
}
