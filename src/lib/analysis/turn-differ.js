/**
 * turn-differ.js — C.18
 *
 * Word-level diff between assistant turns using diff-match-patch.
 * XSS-safe: all plain text segments are HTML-escaped before insertion.
 */

import { diff_match_patch, DIFF_INSERT, DIFF_DELETE, DIFF_EQUAL } from 'diff-match-patch';

const dmp = new diff_match_patch();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Escape HTML special characters in a plain-text string.
 * @param {string} text
 * @returns {string}
 */
function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Diff two assistant turn strings word-by-word.
 * Returns an array of { type: 'insert'|'delete'|'equal', text: string }.
 * @param {string} textA
 * @param {string} textB
 * @returns {Array<{type: string, text: string}>}
 */
export function diffTurns(textA, textB) {
  // Use word-mode diff by tokenising on whitespace boundaries
  const { chars1, chars2, lineArray } = dmp.diff_linesToChars_(
    // We reuse diff_linesToChars_ with word tokens for a coarser diff than char-level
    textA.replace(/(\S+)/g, '$1\n'),
    textB.replace(/(\S+)/g, '$1\n'),
  );
  const diffs = dmp.diff_main(chars1, chars2, false);
  dmp.diff_charsToLines_(diffs, lineArray);
  dmp.diff_cleanupSemantic(diffs);

  return diffs.map(([op, text]) => {
    const type = op === DIFF_INSERT ? 'insert' : op === DIFF_DELETE ? 'delete' : 'equal';
    // Normalise whitespace tokens back: strip trailing \n we added during tokenisation
    return { type, text: text.replace(/\n/g, ' ') };
  });
}

/**
 * Convert a diffTurns result to safe HTML with <ins> / <del> / text nodes.
 * All plain-text content is HTML-escaped — no XSS possible.
 * @param {Array<{type: string, text: string}>} diffs
 * @returns {string}  safe HTML string
 */
export function diffToHtml(diffs) {
  return diffs.map(({ type, text }) => {
    const safe = escapeHtml(text);
    if (type === 'insert') return `<ins class="diff-ins">${safe}</ins>`;
    if (type === 'delete') return `<del class="diff-del">${safe}</del>`;
    return safe;
  }).join('');
}

/**
 * Diff N corresponding turns between chat A (reference) and chat B.
 * The shorter chat is padded with empty turns.
 * @param {string[]} turnsA  reference turns
 * @param {string[]} turnsB  comparison turns
 * @returns {string[]}  array of HTML strings, one per turn (from turnsB perspective)
 */
export function diffAllTurns(turnsA, turnsB) {
  const len    = Math.max(turnsA.length, turnsB.length);
  const result = [];
  for (let i = 0; i < len; i++) {
    const a   = turnsA[i] ?? '';
    const b   = turnsB[i] ?? '';
    const d   = diffTurns(a, b);
    result.push(diffToHtml(d));
  }
  return result;
}
