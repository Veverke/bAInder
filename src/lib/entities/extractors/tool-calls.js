/**
 * tool-calls.js — extractor for Tool Call entities.
 *
 * Detects tool invocation records in messages using two strategies:
 * 1. Structured tool_call messages (messages with role 'tool', type
 *    'tool_use' / 'tool_result' — Claude / ChatGPT API shapes).
 * 2. Heuristic text scan: "> Web search:" / "> Ran code:" patterns in
 *    assistant prose (DOM fallback — text-only heuristic when doc is null).
 *
 * Output is truncated to 10 000 chars before storage to avoid bloating the
 * stored chat entry.
 */

import { ENTITY_TYPES, createEntity } from '../chat-entity.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const OUTPUT_TRUNCATE_LIMIT = 10_000;

/**
 * Map raw tool name strings to canonical tool-type keys.
 *
 * @param {string} name
 * @returns {string}
 */
function _normaliseToolName(name = '') {
  const lower = name.toLowerCase();
  if (lower.includes('web_search') || lower.includes('websearch') || lower.includes('search')) {
    return 'web_search';
  }
  if (lower.includes('code') || lower.includes('python') || lower.includes('interpreter')) {
    return 'code_interpreter';
  }
  if (lower.includes('browser')) {
    return 'browser';
  }
  if (lower.includes('function')) {
    return 'function';
  }
  return 'unknown';
}

/**
 * Truncate a string to `limit` characters, appending '…' when trimmed.
 *
 * @param {string|*} value
 * @param {number}   limit
 * @returns {string}
 */
function _truncate(value, limit) {
  const str = typeof value === 'string' ? value : JSON.stringify(value) ?? '';
  return str.length > limit ? str.slice(0, limit) + '\u2026' : str;
}

// ---------------------------------------------------------------------------
// Strategy 1 — structured message extraction
// ---------------------------------------------------------------------------

/**
 * Extract tool call entities from structured API message shapes.
 *
 * Handles:
 * - `role === 'tool'`          → tool result message (ChatGPT, Claude)
 * - `type === 'tool_use'`      → Claude-style tool invocation
 * - `type === 'tool_result'`   → Claude-style tool result
 *
 * @param {Object[]} messages
 * @param {string}   chatId
 * @returns {Object[]}
 */
function _extractStructured(messages, chatId) {
  const entities = [];

  messages.forEach((m, msgIdx) => {
    const messageIndex = m.index ?? msgIdx;
    const role         = m.role;

    // ── role === 'tool' (ChatGPT function-calling result) ─────────────────
    if (role === 'tool') {
      const tool   = _normaliseToolName(m.name ?? '');
      const input  = _truncate(m.input ?? '', OUTPUT_TRUNCATE_LIMIT);
      const output = _truncate(m.content ?? m.output ?? '', OUTPUT_TRUNCATE_LIMIT);
      entities.push(createEntity(
        ENTITY_TYPES.TOOL_CALL, messageIndex, chatId, role, {
          tool,
          input,
          output,
          durationMs: m.durationMs ?? null,
        }
      ));
      return;
    }

    // ── type === 'tool_use' (Claude tool invocation) ──────────────────────
    if (m.type === 'tool_use') {
      const tool  = _normaliseToolName(m.name ?? '');
      const input = _truncate(m.input ?? '', OUTPUT_TRUNCATE_LIMIT);
      entities.push(createEntity(
        ENTITY_TYPES.TOOL_CALL, messageIndex, chatId, role ?? 'assistant', {
          tool,
          input,
          output:     '',
          durationMs: m.durationMs ?? null,
        }
      ));
      return;
    }

    // ── type === 'tool_result' (Claude tool result) ───────────────────────
    if (m.type === 'tool_result') {
      const output = _truncate(m.content ?? '', OUTPUT_TRUNCATE_LIMIT);
      entities.push(createEntity(
        ENTITY_TYPES.TOOL_CALL, messageIndex, chatId, role ?? 'tool', {
          tool:       'unknown',
          input:      '',
          output,
          durationMs: m.durationMs ?? null,
        }
      ));
    }
  });

  return entities;
}

// ---------------------------------------------------------------------------
// Strategy 2 — heuristic text scan
// ---------------------------------------------------------------------------

/**
 * Regex patterns that indicate a tool invocation paragraph in assistant prose.
 * Each pattern must capture:
 *   [1] tool label   (used to derive tool type)
 *   [2] content body (used as a combined input+output summary)
 */
const PROSE_PATTERNS = [
  /^>\s*(Web search)[:\s]+(.+?)(?=\n>|\n\n|$)/gims,
  /^>\s*(Ran code)[:\s]+(.+?)(?=\n>|\n\n|$)/gims,
  /^>\s*(Searched the web)[:\s]+(.+?)(?=\n>|\n\n|$)/gims,
  /^>\s*(Executed code)[:\s]+(.+?)(?=\n>|\n\n|$)/gims,
];

/**
 * Extract tool call entities from assistant-prose heuristics.
 *
 * @param {Object[]} messages
 * @param {string}   chatId
 * @returns {Object[]}
 */
function _extractFromProse(messages, chatId) {
  const entities = [];

  messages.forEach((m, msgIdx) => {
    if (m.role !== 'assistant' && m.role !== 'model') return;
    const messageIndex = m.index ?? msgIdx;
    const text         = m.content ?? '';

    for (const pattern of PROSE_PATTERNS) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const toolLabel = match[1] ?? '';
        const body      = _truncate(match[2]?.trim() ?? '', OUTPUT_TRUNCATE_LIMIT);
        const tool      = _normaliseToolName(toolLabel);

        entities.push(createEntity(
          ENTITY_TYPES.TOOL_CALL, messageIndex, chatId, m.role, {
            tool,
            input:      body,
            output:     '',
            durationMs: null,
          }
        ));
      }
    }
  });

  return entities;
}

// ---------------------------------------------------------------------------
// Public extractor
// ---------------------------------------------------------------------------

/**
 * Extract Tool Call entities from a messages array.
 *
 * Tries the structured strategy first. Falls back to heuristic prose scanning
 * when no structured entities are found.
 *
 * @param {Object[]}      messages
 * @param {Document|null} _doc     Unused — heuristic text scan is text-only
 * @param {string}        chatId
 * @returns {Object[]}
 */
export function extractToolCalls(messages, _doc, chatId) {
  const structured = _extractStructured(messages, chatId);
  if (structured.length > 0) return structured;
  return _extractFromProse(messages, chatId);
}
