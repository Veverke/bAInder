/**
 * structural-analyser.js — C.18
 *
 * Pure JS analysis of markdown structure.
 * No external dependencies.
 *
 * Accepts an array of assistant-turn markdown strings and returns
 * aggregate structural metrics across all turns.
 */

/**
 * @param {string[]} assistantTurns  Raw markdown of each assistant response
 * @returns {{
 *   headings:     number,
 *   codeBlocks:   number,
 *   listItems:    number,
 *   tables:       number,
 *   paragraphs:   number,
 *   avgTurnWords: number,
 *   totalWords:   number,
 * }}
 */
export function analyseStructure(assistantTurns) {
  if (!Array.isArray(assistantTurns) || assistantTurns.length === 0) {
    return { headings: 0, codeBlocks: 0, listItems: 0, tables: 0, paragraphs: 0, avgTurnWords: 0, totalWords: 0 };
  }

  let headings   = 0;
  let codeBlocks = 0;
  let listItems  = 0;
  let tables     = 0;
  let paragraphs = 0;
  let totalWords = 0;

  for (const turn of assistantTurns) {
    if (typeof turn !== 'string') continue;

    // ── Count headings ──────────────────────────────────────────────────────
    const headingMatches = turn.match(/^#{1,6}\s/gm);
    headings += headingMatches ? headingMatches.length : 0;

    // ── Count fenced code blocks (opening fences) ──────────────────────────
    const codeMatches = turn.match(/^```/gm);
    // Each block has an opening and closing fence; count openings only (every other match)
    codeBlocks += codeMatches ? Math.floor(codeMatches.length / 2) : 0;

    // ── Strip code blocks for word counting and paragraph detection ─────────
    const withoutCode = turn.replace(/```[\s\S]*?```/g, '');

    // ── Count list items ────────────────────────────────────────────────────
    const listMatches = withoutCode.match(/^[ \t]*[-*+] |\d+\. /gm);
    listItems += listMatches ? listMatches.length : 0;

    // ── Count tables ────────────────────────────────────────────────────────
    const tableLines = withoutCode.match(/^\|/gm);
    // A table has at least 2 pipe-starting lines; count distinct table blocks
    if (tableLines && tableLines.length >= 2) {
      // Group contiguous pipe lines into table blocks
      const lines = withoutCode.split('\n');
      let inTable = false;
      for (const line of lines) {
        if (/^\|/.test(line)) {
          if (!inTable) { tables++; inTable = true; }
        } else {
          inTable = false;
        }
      }
    }

    // ── Count paragraphs ────────────────────────────────────────────────────
    // Split on blank lines; keep blocks that are not headings, code fences, or lists
    const blocks = withoutCode.split(/\n\s*\n/);
    for (const block of blocks) {
      const trimmed = block.trim();
      if (!trimmed) continue;
      if (/^#{1,6}\s/.test(trimmed)) continue;           // heading block
      if (/^[-*+] |^\d+\. /.test(trimmed)) continue;     // list block
      if (/^\|/.test(trimmed)) continue;                  // table block
      paragraphs++;
    }

    // ── Word count (strip code blocks and markdown symbols first) ───────────
    const stripped = withoutCode
      .replace(/`[^`]+`/g, '')            // inline code
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '') // images
      .replace(/\[[^\]]*\]\([^)]*\)/g, '')  // links
      .replace(/[#*_~>|\-]/g, '')          // markdown symbols
      .trim();
    if (stripped) {
      const words = stripped.split(/\s+/).filter(w => w.length > 0);
      totalWords += words.length;
    }
  }

  const avgTurnWords = assistantTurns.length > 0 ? totalWords / assistantTurns.length : 0;

  return { headings, codeBlocks, listItems, tables, paragraphs, totalWords, avgTurnWords };
}
