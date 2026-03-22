/**
 * entity-navigation.js — helper for opening the reader at a specific message.
 *
 * Pure navigation logic; no imports from sidepanel singletons to avoid
 * circular dependencies. The caller (entity controller) passes in the
 * handleChatClick function.
 */

/**
 * Open the reader for `chatId` and scroll to the message the entity belongs to.
 *
 * Anchor convention mirrors C.28 ordinal scheme:
 *   - user turns:      #p<roleOrdinal>
 *   - assistant turns: #r<roleOrdinal>
 *
 * `entity.roleOrdinal` is a 1-based count of same-role messages up to and
 * including this entity's message, stored at extraction time.  This avoids
 * any dependence on the full messages array at navigation time.
 *
 * Additionally, a `snippetHint` derived from the entity's content is passed
 * so the reader can locate and highlight the specific block within the turn.
 *
 * @param {string}   chatId
 * @param {Object}   entity        Entity object (must have role and roleOrdinal)
 * @param {Object}   opts
 * @param {Function} opts.onChatClick  The existing handleChatClick from chat-actions.js
 */
export function openChatAtMessage(chatId, entity, { onChatClick }) {
  const isAsst = entity.role === 'assistant' || entity.role === 'model';
  const ordinal = entity.roleOrdinal ?? 1; // graceful fallback for pre-ordinal entities
  const anchor = `#${isAsst ? 'r' : 'p'}${ordinal}`;
  const snippetHint = _snippetHint(entity);

  onChatClick(chatId, { scrollToAnchor: anchor, snippetHint });
}

/**
 * Derive a short identifying string from the entity so the reader can locate
 * the exact block within a turn.  Returns null when no hint is applicable.
 */
function _snippetHint(entity) {
  switch (entity.type) {
    case 'code': {
      // First non-empty line of the code body — unique enough within a turn
      const firstLine = (entity.code ?? '').split('\n').find(l => l.trim() !== '') ?? '';
      return firstLine.slice(0, 120) || null;
    }
    case 'citation':
      return entity.url ?? entity.title ?? null;
    case 'table':
      // Reconstruct the pipe-delimited header row so _findEntityBlock can match
      // the .table-wrapper by its <thead> cells.  entity.text is never set for
      // table entities; the extractor stores headers as an array instead.
      if (Array.isArray(entity.headers) && entity.headers.length > 0) {
        return ('| ' + entity.headers.join(' | ') + ' |').slice(0, 120);
      }
      return null;
    case 'diagram':
      // First non-empty line of the diagram source uniquely identifies the block
      return (entity.source ?? '').split('\n').find(l => l.trim() !== '')?.slice(0, 120) ?? null;
    case 'attachment':
      return entity.filename ?? null;
    case 'audio':
      return `audio:${entity.snippetIndex ?? 0}`;
    case 'prompt':
      // Flash the whole user turn — the anchor element itself is the target
      return 'turn:self';
    case 'image':
      // Match by alt text when available; otherwise flash the whole turn
      return entity.altText ? entity.altText.slice(0, 120) : 'turn:self';
    case 'toolCall':
    case 'artifact':
      // No distinct DOM class in rendered markdown — flash the whole turn
      return 'turn:self';
    default:
      return null;
  }
}
