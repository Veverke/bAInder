#!/usr/bin/env node
/**
 * scripts/prepare-glove.js
 *
 * Converts a GloVe text file into a compact binary (public/glove.bin) that
 * can be bundled with the bAInder Chrome extension and loaded at runtime by
 * src/lib/analysis/glove-loader.js.
 *
 * Usage:
 *   node scripts/prepare-glove.js <path/to/glove.Xd.txt> [max_words=10000]
 *
 * Download GloVe from: https://nlp.stanford.edu/projects/glove/
 *   Recommended: glove.6B.zip → extract → use glove.6B.25d.txt
 *   (The zip is 822 MB; glove.6B.25d.txt extracted is ~170 MB.)
 *
 * Words appear in frequency order in the GloVe file (most common first), so
 * taking the first N words gives the most broadly applicable vocabulary.
 *
 * Binary output format (see glove-loader.js for reader):
 *   [4 bytes uint32LE: N]  [4 bytes uint32LE: D]
 *   Repeated N times:
 *     [1 byte: word length L]  [L bytes: ASCII chars of word]
 *     [4 bytes float32LE: per-word scale = max(|component|)]
 *     [D bytes int8: quantised components ≈ round(x / scale * 127)]
 *
 * Per-word quantisation preserves relative direction well; typical
 * reconstruction error is <1% of the original vector magnitude.
 *
 * Example output sizes (glove.6B.25d, 10 000 words):
 *   Raw float32:  10 000 × 25 × 4 ≈ 1.0 MB
 *   Quantised:    10 000 × (7 avg + 1 + 4 + 25) ≈ 370 KB
 */

import { createReadStream, mkdirSync, writeFileSync } from 'node:fs';
import { createInterface }                            from 'node:readline';
import path                                           from 'node:path';
import { fileURLToPath }                              from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT      = path.resolve(__dirname, '..');

// ── CLI args ────────────────────────────────────────────────────────────────
const inputPath = process.argv[2];
const maxWords  = parseInt(process.argv[3] ?? '10000', 10);

if (!inputPath) {
  console.error('Usage: node scripts/prepare-glove.js <glove.txt> [max_words=10000]');
  console.error('Download: https://nlp.stanford.edu/projects/glove/');
  process.exit(1);
}

// ── Read GloVe text file ────────────────────────────────────────────────────
console.log(`Reading ${inputPath} (first ${maxWords} words)…`);

const rl = createInterface({
  input: createReadStream(inputPath, { encoding: 'utf8' }),
  crlfDelay: Infinity,
});

let dim = 0;
/** @type {Array<{word: string, scale: number, ints: Int8Array}>} */
const entries = [];

rl.on('line', line => {
  if (entries.length >= maxWords) return;
  const spaceIdx = line.indexOf(' ');
  if (spaceIdx === -1) return;

  const word   = line.slice(0, spaceIdx);
  if (!word || word.length > 50) return; // skip absurdly long tokens
  if (!/^[\x20-\x7E]+$/.test(word)) return; // skip non-ASCII / control-char tokens

  const floats = line.slice(spaceIdx + 1).split(' ').map(Number);
  if (floats.some(isNaN)) return;

  if (dim === 0) {
    dim = floats.length;
  } else if (floats.length !== dim) {
    return; // dimension mismatch (header or malformed line)
  }

  // Per-word quantisation to int8
  let maxAbs = 0;
  for (const v of floats) if (Math.abs(v) > maxAbs) maxAbs = Math.abs(v);
  const scale = maxAbs === 0 ? 1e-6 : maxAbs;

  const ints = new Int8Array(dim);
  for (let i = 0; i < dim; i++) {
    ints[i] = Math.round(Math.min(127, Math.max(-127, (floats[i] / scale) * 127)));
  }

  entries.push({ word, scale, ints });
});

rl.on('close', () => {
  if (!entries.length) {
    console.error('No words read — check the input file format.');
    process.exit(1);
  }

  console.log(`  ${entries.length} words, ${dim} dimensions`);

  // ── Pack binary buffer ──────────────────────────────────────────────────
  // Header: 8 bytes
  // Per word: 1 (len) + len (chars) + 4 (scale f32) + dim (int8)
  let byteSize = 8;
  for (const e of entries) byteSize += 1 + e.word.length + 4 + dim;

  const buf    = Buffer.alloc(byteSize);
  let   offset = 0;

  buf.writeUInt32LE(entries.length, offset); offset += 4;
  buf.writeUInt32LE(dim, offset);            offset += 4;

  for (const { word, scale, ints } of entries) {
    buf.writeUInt8(word.length, offset++);
    for (let i = 0; i < word.length; i++) buf.writeUInt8(word.charCodeAt(i), offset++);
    buf.writeFloatLE(scale, offset); offset += 4;
    for (let i = 0; i < dim; i++) buf.writeInt8(ints[i], offset++);
  }

  // ── Write output ────────────────────────────────────────────────────────
  const outDir  = path.join(ROOT, 'public');
  const outPath = path.join(outDir, 'glove.bin');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(outPath, buf);

  const kb = (byteSize / 1024).toFixed(0);
  console.log(`✓ Written ${outPath}`);
  console.log(`  ${kb} KB  (${entries.length} words × ${dim}d, int8 quantised)`);
  console.log('  Rebuild extension to include the new binary: npm run build');
});
