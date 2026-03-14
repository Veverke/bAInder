/**
 * code-snippets.js — extractor for Code Snippet entities.
 *
 * Regex-scans assistant messages for fenced code blocks (``` language … ```).
 * Language defaults to 'text' when not specified.
 *
 * Blocks that qualify as diagrams (mermaid fence, Mermaid keyword first line,
 * or prose-diagram structure) are skipped here so the diagram extractor owns
 * them exclusively and there is no double-extraction.
 */

import { ENTITY_TYPES, createEntity } from '../chat-entity.js';
import { isDiagramContent } from './diagrams.js';

/** Matches a fenced code block. Group 1 = language tag; group 2 = code body. */
const FENCE_RE = /^```(\w*)\r?\n([\s\S]*?)^```/gm;

function _isAssistant(role) {
  return role === 'assistant' || role === 'model';
}

/**
 * Extract all fenced code blocks from assistant messages.
 *
 * @param {Object[]}      messages
 * @param {Document|null} _doc      Unused — text-only extraction
 * @param {string}        chatId
 * @returns {Object[]}
 */
export function extractCodeSnippets(messages, _doc, chatId) {
  const entities = [];
  let roleOrdinal = 0;

  messages.forEach((m, msgIdx) => {
    if (!_isAssistant(m.role)) return;
    roleOrdinal++;

    const text         = m.content ?? '';
    const messageIndex = m.index ?? msgIdx;
    FENCE_RE.lastIndex = 0;

    let match;
    while ((match = FENCE_RE.exec(text)) !== null) {
      const language  = match[1].trim() || 'text';
      const code      = match[2];

      // Defer to diagram extractor — skip any block that qualifies as a diagram.
      if (isDiagramContent(language, code)) continue;

      const lineCount = code.split('\n').filter((_, i, arr) =>
        // trim trailing empty line that results from the terminating newline
        !(i === arr.length - 1 && arr[i] === '')
      ).length;

      entities.push(createEntity(ENTITY_TYPES.CODE, messageIndex, chatId, 'assistant', {
        roleOrdinal,
        language,
        code,
        lineCount,
      }));
    }
  });

  return entities;
}
