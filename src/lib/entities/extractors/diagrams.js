/**
 * diagrams.js — extractor for Diagram entities.
 *
 * Four strategies:
 *  1. Fenced ` ```mermaid ``` ` blocks in assistant messages.
 *  2. DOM `<svg>` capture inside `.mermaid` or `[data-diagram]` containers
 *     (when `doc` is not null).
 *  3. Fenced code blocks (any language tag) whose content's first meaningful
 *     line starts with a Mermaid keyword — e.g. the AI labels the fence with a
 *     plain language name but writes valid Mermaid inside (`sequenceDiagram`,
 *     `flowchart`, `graph`, …).
 *  4. Prose-structured diagrams inside code fences — heading line containing
 *     "diagram" + at least two arrow lines (→ / -> / -->) inside the same
 *     fenced block.  The code-fence requirement prevents false positives from
 *     plain narrative text.
 *
 * `thumbnailSvg` is left null at extraction time; a separate background pass
 * can render it later to avoid bundling the Mermaid library in the save-time
 * content script.
 */

import { ENTITY_TYPES, createEntity } from '../chat-entity.js';

/** Matches a fenced mermaid block. Group 1 = diagram source body. */
const MERMAID_FENCE_RE = /^```mermaid\r?\n([\s\S]*?)^```/gm;

/** Matches any fenced code block. Group 1 = language tag; Group 2 = body. */
const FENCE_RE_ALL = /^```(\w*)\r?\n([\s\S]*?)^```/gm;

/**
 * Known Mermaid diagram-type keywords → canonical label.
 * First token in the source (lowercase) is matched against this map.
 */
const DIAGRAM_TYPE_MAP = {
  flowchart:      'flowchart',
  graph:          'flowchart',
  sequencediagram:'sequence',
  classdiagram:   'class',
  erdiagram:      'er',
  gantt:          'gantt',
  pie:            'pie',
  gitgraph:       'git',
  mindmap:        'mindmap',
  timeline:       'timeline',
  sankey:         'sankey',
  xychart:        'xychart',
  block:          'block',
};

/**
 * Regex that matches the first token of a Mermaid diagram source.
 * Used by Strategy 3 to detect Mermaid content inside non-mermaid fences.
 */
const MERMAID_KEYWORD_RE = /^(sequenceDiagram|flowchart|graph\b|classDiagram|erDiagram|gantt|pie\b|gitGraph|mindmap|timeline|sankey|xychart|block)\b/im;

/**
 * Strategy 4 — prose diagram heuristics (only applied inside code fences).
 * Heading must contain the word "diagram" (case-insensitive).
 * Content must have ≥ 2 arrow lines to confirm it is a flow/sequence structure.
 */
const PROSE_DIAGRAM_HEADING_RE = /^.{0,80}diagram\b/im;
const PROSE_ARROW_RE           = /(?:→|->|-->>?)/;

/**
 * Infer the diagramType label from the first identifier in the Mermaid source.
 */
function _detectDiagramType(source) {
  const firstToken = (source.trim().split(/[\s\-{(:]/)[0] ?? '').toLowerCase();
  return DIAGRAM_TYPE_MAP[firstToken] ?? 'other';
}

/**
 * Infer the diagramType from a prose-structured diagram's content.
 */
function _detectProseDiagramType(source) {
  const lc = source.toLowerCase();
  if (lc.includes('sequence'))    return 'sequence';
  if (lc.includes('flowchart') || lc.includes('flow diagram')) return 'flowchart';
  if (lc.includes('class diagram'))  return 'class';
  if (lc.includes('er diagram') || lc.includes('entity-relationship')) return 'er';
  if (lc.includes('state diagram'))  return 'state';
  if (lc.includes('architecture'))   return 'architecture';
  return 'other';
}

/**
 * Return true if `source` (a code-fence body) qualifies as a diagram under
 * Strategy 3 (Mermaid keyword first line) or Strategy 4 (prose diagram), so
 * the code-snippet extractor can skip it.
 *
 * Exported so code-snippets.js can import this predicate without duplicating logic.
 */
export function isDiagramContent(lang, source) {
  if (lang === 'mermaid') return true;
  if (MERMAID_KEYWORD_RE.test(source.trimStart())) return true;
  if (PROSE_DIAGRAM_HEADING_RE.test(source)) {
    const arrowLines = source.split('\n').filter(l => PROSE_ARROW_RE.test(l));
    if (arrowLines.length >= 2) return true;
  }
  return false;
}

function _isAssistant(role) {
  return role === 'assistant' || role === 'model';
}

/**
 * Extract Diagram entities from messages and optionally from rendered DOM.
 *
 * @param {Object[]}      messages
 * @param {Document|null} doc      Rendered DOM; null in background context
 * @param {string}        chatId
 * @returns {Object[]}
 */
export function extractDiagrams(messages, doc, chatId) {
  const entities = [];

  // ── Strategy 1: Fenced Mermaid blocks in assistant message text ────────────
  // ── Strategy 3: Any fenced block whose body starts with a Mermaid keyword ──
  // ── Strategy 4: Prose-structured diagram inside a code fence ───────────────
  let roleOrdinal = 0;
  messages.forEach((m, msgIdx) => {
    if (!_isAssistant(m.role)) return;
    roleOrdinal++;

    const text         = m.content ?? '';
    const messageIndex = m.index ?? msgIdx;

    // Strategy 1 — explicit mermaid fence
    MERMAID_FENCE_RE.lastIndex = 0;
    let match;
    while ((match = MERMAID_FENCE_RE.exec(text)) !== null) {
      const source      = match[1];
      const diagramType = _detectDiagramType(source);
      entities.push(createEntity(ENTITY_TYPES.DIAGRAM, messageIndex, chatId, 'assistant', {
        roleOrdinal,
        source,
        diagramType,
        thumbnailSvg: null,
      }));
    }

    // Strategy 3 + 4 — any other fenced block that looks like a diagram
    FENCE_RE_ALL.lastIndex = 0;
    while ((match = FENCE_RE_ALL.exec(text)) !== null) {
      const lang   = match[1].toLowerCase();
      const source = match[2];

      if (lang === 'mermaid') continue; // already handled by Strategy 1

      // Strategy 3: Mermaid keyword on first non-empty line
      if (MERMAID_KEYWORD_RE.test(source.trimStart())) {
        entities.push(createEntity(ENTITY_TYPES.DIAGRAM, messageIndex, chatId, 'assistant', {
          roleOrdinal,
          source,
          diagramType: _detectDiagramType(source),
          thumbnailSvg: null,
        }));
        continue;
      }

      // Strategy 4: Prose diagram (heading + ≥2 arrow lines)
      if (PROSE_DIAGRAM_HEADING_RE.test(source)) {
        const arrowLines = source.split('\n').filter(l => PROSE_ARROW_RE.test(l));
        if (arrowLines.length >= 2) {
          entities.push(createEntity(ENTITY_TYPES.DIAGRAM, messageIndex, chatId, 'assistant', {
            roleOrdinal,
            source,
            diagramType: _detectProseDiagramType(source),
            thumbnailSvg: null,
          }));
        }
      }
    }
  });

  // ── Strategy 2: DOM <svg> elements inside .mermaid / [data-diagram] ────────
  if (doc) {
    const svgContainers = [
      ...doc.querySelectorAll('.mermaid svg'),
      ...doc.querySelectorAll('[data-diagram] svg'),
    ];

    // Use first assistant message index as a best-effort anchor (0 if none)
    const fallbackIndex = messages.findIndex(m => _isAssistant(m.role));
    const messageIndex  = fallbackIndex >= 0 ? (messages[fallbackIndex].index ?? fallbackIndex) : 0;

    svgContainers.forEach(svg => {
      entities.push(createEntity(ENTITY_TYPES.DIAGRAM, messageIndex, chatId, 'assistant', {
        source:       '',
        diagramType:  'other',
        thumbnailSvg: svg.outerHTML,
      }));
    });
  }

  return entities;
}
