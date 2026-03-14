/**
 * entity-extractor.js — extractor registry and extraction pipeline.
 *
 * Per-type extractors register themselves here. The top-level
 * extractChatEntities() is called once per save from chat-save-handler.js.
 */

const _registry = new Map(); // type → extractorFn(messages, doc, chatId) → Entity[]

/**
 * Register an extractor for the given entity type.
 * @param {string}   type  One of ENTITY_TYPES values
 * @param {Function} fn    extractorFn(messages, doc, chatId) → Entity[]
 */
export function registerExtractor(type, fn) {
  _registry.set(type, fn);
}

/**
 * Run all registered extractors over the messages and return a sparse map of
 * type → Entity[].  Extractors that throw are caught and skipped; the pipeline
 * always completes.  Empty extractor results are omitted from the output.
 *
 * @param {Array}       messages  Array of message objects from the chat
 * @param {Document|null} doc     Rendered DOM document; null in background context
 * @param {string}      chatId    ID of the parent chat entry — stamped on every entity
 * @returns {Object}  e.g. { code: [...], table: [...] } — sparse, no empty arrays
 */
export function extractChatEntities(messages, doc, chatId) {
  const result = {};
  console.debug('[bAInder] extractChatEntities: registry size =', _registry.size, '| messages =', messages.length);
  for (const [type, fn] of _registry) {
    try {
      const entities = fn(messages, doc, chatId);
      if (Array.isArray(entities) && entities.length > 0) {
        result[type] = entities;
      }
    } catch (e) {
      // log, never throw — a broken extractor must not abort the save
      console.error('[bAInder] Entity extractor threw for type', type + ':', e);
    }
  }
  const typeSummary = Object.keys(result).map(k => `${k}(${result[k].length})`).join(', ');
  console.debug('[bAInder] extractChatEntities: result =', typeSummary || '(none)');
  return result;
}

/**
 * Reset the extractor registry.
 * @internal For unit tests only — never call from production code.
 */
export function _resetRegistry() {
  _registry.clear();
}
