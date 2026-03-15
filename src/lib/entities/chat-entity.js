/**
 * chat-entity.js — shared base type and factory for all Chat Entity types.
 *
 * Every concrete entity produced by an extractor must go through
 * createEntity() so that the base fields are always present and consistent.
 */

import { generateId } from '../utils/search-utils.js';

// ---------------------------------------------------------------------------
// ENTITY_TYPES — canonical string keys for all ten entity types
// ---------------------------------------------------------------------------
export const ENTITY_TYPES = Object.freeze({
  PROMPT:      'prompt',
  CITATION:    'citation',
  TABLE:       'table',
  CODE:        'code',
  DIAGRAM:     'diagram',
  TOOL_CALL:   'toolCall',
  ATTACHMENT:  'attachment',
  IMAGE:       'image',
  AUDIO:       'audio',
  ARTIFACT:    'artifact',
});

// ---------------------------------------------------------------------------
// createEntity — factory for concrete entities
// ---------------------------------------------------------------------------

/**
 * Create a base entity object with all required fields stamped in.
 * Per-type extractors spread their own fields on top via the `fields` param.
 *
 * @param {string} type          One of ENTITY_TYPES values
 * @param {number} messageIndex  Zero-based index of the message in the chat
 * @param {string} chatId        ID of the parent chat entry
 * @param {string} role          'user' | 'assistant' | 'model'
 * @param {Object} [fields={}]   Type-specific fields (spread onto the entity)
 * @returns {Object}
 */
export function createEntity(type, messageIndex, chatId, role, fields = {}) {
  return {
    id:           generateId('entity'),
    type,
    messageIndex,
    chatId,
    role,
    ...fields,
  };
}
