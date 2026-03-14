/**
 * citations.js — extractor for Citation entities.
 *
 * Two strategies (tried per-message; DOM strategy takes precedence when doc is present):
 *  1. DOM: query platform-specific citation elements ([data-source], citation-block, .source-item)
 *  2. Text: regex-scan assistant messages for [N] URL — Title footnote patterns
 */

import { ENTITY_TYPES, createEntity } from '../chat-entity.js';

/** Matches [N] URL — optional title */
const FOOTNOTE_RE = /\[(\d+)\]\s*(https?:\/\/[^\s]+)(?:\s*[-\u2013\u2014]\s*(.+))?/g;

function _isAssistant(role) {
  return role === 'assistant' || role === 'model';
}

/**
 * Extract citations from a message array.
 *
 * @param {Object[]}        messages
 * @param {Document|null}   doc      Rendered DOM; null in background context
 * @param {string}          chatId
 * @returns {Object[]}
 */
export function extractCitations(messages, doc, chatId) {
  const entities = [];
  let roleOrdinal = 0;

  messages.forEach((m, msgIdx) => {
    if (!_isAssistant(m.role)) return;
    roleOrdinal++;
    const messageIndex = m.index ?? msgIdx;

    // ── DOM strategy ──────────────────────────────────────────────────────────
    if (doc) {
      const domEls = [
        ...doc.querySelectorAll('[data-source]'),
        ...doc.querySelectorAll('citation-block'),
        ...doc.querySelectorAll('.source-item'),
      ];
      if (domEls.length > 0) {
        domEls.forEach(el => {
          const url     = el.dataset?.source ?? el.querySelector('a')?.href ?? '';
          const title   = el.dataset?.title  ?? el.textContent?.trim() ?? '';
          const snippet = el.dataset?.snippet ?? '';
          const number  = el.dataset?.number  ?? '';
          entities.push(createEntity(ENTITY_TYPES.CITATION, messageIndex, chatId, 'assistant', {
            roleOrdinal, url, title, snippet, number,
          }));
        });
        return; // DOM strategy wins; skip text scan for this message
      }
    }

    // ── Text strategy (fallback) ───────────────────────────────────────────────
    const text = m.content ?? '';
    FOOTNOTE_RE.lastIndex = 0;
    let match;
    while ((match = FOOTNOTE_RE.exec(text)) !== null) {
      const [, number, url, rawTitle = ''] = match;
      entities.push(createEntity(ENTITY_TYPES.CITATION, messageIndex, chatId, 'assistant', {
        roleOrdinal,
        number,
        url,
        title:   rawTitle.trim(),
        snippet: '',
      }));
    }
  });

  return entities;
}
