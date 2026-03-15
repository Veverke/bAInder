/**
 * tables.js — extractor for Table entities.
 *
 * Uses a state-machine parser to detect Markdown tables in assistant messages.
 * A valid table must have:
 *   - A header row starting with `|`
 *   - A separator row matching /^\|[-| :]+\|/
 *   - One or more data rows starting with `|`
 */

import { ENTITY_TYPES, createEntity } from '../chat-entity.js';

/** Matches a Markdown table separator row */
const SEP_RE = /^\|[-| :]+\|/;

/**
 * Split a Markdown table row into cell strings.
 * Strips leading/trailing `|` and trims each cell.
 */
function _parseCells(line) {
  return line.replace(/^\||\|$/g, '').split('|').map(c => c.trim());
}

/**
 * Parse all Markdown tables from a text string.
 * Returns an array of { headers, rows, rowCount } objects.
 */
function _parseTablesFromText(text) {
  const tables = [];
  const lines  = text.split('\n');
  let i = 0;

  while (i < lines.length) {
    const trimmed = lines[i].trim();

    if (!trimmed.startsWith('|')) { i++; continue; }

    // Check that the following line is a separator
    if (i + 1 < lines.length && SEP_RE.test(lines[i + 1].trim())) {
      const headers = _parseCells(trimmed);
      i += 2; // consume header + separator

      const rows = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        rows.push(_parseCells(lines[i].trim()));
        i++;
      }

      tables.push({ headers, rows, rowCount: rows.length });
    } else {
      i++;
    }
  }

  return tables;
}

/**
 * Extract Markdown table entities from assistant messages.
 *
 * @param {Object[]}      messages
 * @param {*}             _doc      Unused — tables are parsed from message text
 * @param {string}        chatId
 * @returns {Object[]}
 */
export function extractTables(messages, _doc, chatId) {
  const entities = [];
  let roleOrdinal = 0;

  messages.forEach((m, msgIdx) => {
    if (m.role !== 'assistant' && m.role !== 'model') return;
    roleOrdinal++;
    const messageIndex = m.index ?? msgIdx;

    for (const { headers, rows, rowCount } of _parseTablesFromText(m.content ?? '')) {
      entities.push(createEntity(ENTITY_TYPES.TABLE, messageIndex, chatId, 'assistant', {
        roleOrdinal,
        headers,
        rows,
        rowCount,
      }));
    }
  });

  return entities;
}
