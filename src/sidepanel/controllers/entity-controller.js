/**
 * entity-controller.js — entity tab controller (Phases A–E).
 *
 * Lazily initialised when the user switches to the "Chat Entities" tab.
 * Creates an EntityStore and ChatEntityTree, wires the entity-click event
 * to navigate to the correct reader position, and exposes refresh/setFilter.
 *
 * Depends on: entity-store, entity-tree, Phase A–E card renderers,
 *             entity-navigation, app-context, browser vendor shim.
 */

import { EntityStore }        from '../../lib/entities/entity-store.js';
import { ChatEntityTree }     from '../../lib/renderer/entity-tree.js';
import { promptCard }         from '../../lib/renderer/entity-cards/prompt-card.js';
import { citationCard }       from '../../lib/renderer/entity-cards/citation-card.js';
import { tableCard }          from '../../lib/renderer/entity-cards/table-card.js';
import { codeCard }           from '../../lib/renderer/entity-cards/code-card.js';
import { diagramCard }        from '../../lib/renderer/entity-cards/diagram-card.js';
import { attachmentCard }     from '../../lib/renderer/entity-cards/attachment-card.js';
import { toolCallCard }       from '../../lib/renderer/entity-cards/tool-call-card.js';
import { imageCard }          from '../../lib/renderer/entity-cards/image-card.js';
import { audioCard }          from '../../lib/renderer/entity-cards/audio-card.js';
import { artifactCard }       from '../../lib/renderer/entity-cards/artifact-card.js';
import { showArtifactPreview } from '../features/artifact-preview.js';
import { openChatAtMessage }  from '../../lib/entities/entity-navigation.js';
import { state, elements }    from '../app-context.js';
import browser                from '../../lib/vendor/browser.js';

// ---------------------------------------------------------------------------
// Card renderers registered for Phases A, B, C, D and E
// ---------------------------------------------------------------------------

const CARD_RENDERERS = {
  prompt:     promptCard,
  citation:   citationCard,
  table:      tableCard,
  code:       codeCard,
  diagram:    diagramCard,
  attachment: attachmentCard,
  toolCall:   toolCallCard,
  image:      imageCard,
  audio:      audioCard,
  artifact:   (entity, opts) => artifactCard(entity, {
    ...opts,
    onPreview: _showPreview,
  }),
};

// Allow tests to replace showArtifactPreview
let _showPreview = showArtifactPreview;
/** @internal */ export function _setShowPreview(fn) { _showPreview = fn; }

// ---------------------------------------------------------------------------
// Test-injection context (never mutate from production code)
// ---------------------------------------------------------------------------

let _state      = state;
let _elements   = elements;
let _getChatsFn = () => state.chats;
let _onChatClick = null; // null → use default browser.tabs navigator below

/**
 * Inject a mock app context for unit tests.
 * @internal
 */
export function _setContext(ctx) {
  if (ctx.state)       _state       = ctx.state;
  if (ctx.elements)    _elements    = ctx.elements;
  if (ctx.getChatsFn)  _getChatsFn  = ctx.getChatsFn;
  if (ctx.onChatClick !== undefined) _onChatClick = ctx.onChatClick;
}

// ---------------------------------------------------------------------------
// Module-level singletons (reset between tests via _reset())
// ---------------------------------------------------------------------------

let _store = null;
let _tree  = null;

/**
 * Reset all module-level singletons.
 * @internal For unit tests only — never call from production code.
 */
export function _reset() {
  _store        = null;
  _tree         = null;
  _state        = state;
  _elements     = elements;
  _getChatsFn   = () => state.chats;
  _onChatClick  = null;
  _showPreview  = showArtifactPreview;
}

// ---------------------------------------------------------------------------
// Navigation helper (production default)
// ---------------------------------------------------------------------------

function _defaultOnChatClick(chatId, opts) {
  const anchor      = opts?.scrollToAnchor ?? '';
  const snippetHint = opts?.snippetHint;
  const snippetParam = snippetHint
    ? `&snippet=${encodeURIComponent(snippetHint)}`
    : '';
  // snippetParam must come BEFORE the hash anchor — anything after # is the
  // fragment and is not part of window.location.search in the reader.
  const url = browser.runtime.getURL(
    `src/reader/reader.html?chatId=${encodeURIComponent(chatId)}${snippetParam}${anchor}`
  );
  browser.tabs.create({ url });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Initialise the entity controller. Idempotent — safe to call multiple times.
 * Called lazily from sidepanel.js when the user switches to the Entities tab.
 */
export function init() {
  if (_store) return; // already initialised

  const chats = _getChatsFn();
  const KNOWN_TYPES = Object.keys(CARD_RENDERERS); // ['prompt','citation','table','code','diagram']
  const chatsWithEntities = chats.filter(c => KNOWN_TYPES.some(t => Array.isArray(c[t]) && c[t].length > 0));
  console.debug('[bAInder] EntityController.init: chats in state:', chats.length,
    '| chats with Phase-A entities:', chatsWithEntities.length);

  _store = new EntityStore(_getChatsFn);

  const container = _elements.entityTree;
  if (!container) return;

  _tree = new ChatEntityTree(
    container,
    _store,
    CARD_RENDERERS,
    _state.tree ?? null,
  );
  _tree.render();
  console.debug('[bAInder] EntityController.init: present entity types:', _store.getPresentTypes());

  const onChatClick = _onChatClick ?? _defaultOnChatClick;

  container.addEventListener('entity-click', (e) => {
    const { entity, chatId } = e.detail;
    openChatAtMessage(chatId, entity, { onChatClick });
  });
}

/**
 * Re-render the entity tree (call after a new chat is saved).
 */
export function refresh() {
  if (_tree) {
    _tree.setTopicTree(_state.tree ?? null);
    _tree.render();
  }
}

/**
 * Filter the entity tree to a single entity type (null = show all).
 * @param {string|null} type
 */
export function setFilter(type) {
  _tree?.setFilter(type);
}

/**
 * Returns the entity type keys that have at least one entity across all saved
 * chats. Safe to call before init() — reads from state.chats directly in that
 * case, falling through to the EntityStore once it has been created.
 * @returns {string[]}
 */
export function getPresentEntityTypes() {
  if (_store) return _store.getPresentTypes();
  const chats = _getChatsFn();
  const ENTITY_KEYS = [
    'prompt', 'citation', 'table', 'code', 'diagram',
    'toolCall', 'attachment', 'image', 'audio', 'artifact',
  ];
  const types = new Set();
  for (const chat of chats) {
    for (const key of ENTITY_KEYS) {
      if (Array.isArray(chat[key]) && chat[key].length > 0) types.add(key);
    }
  }
  return [...types];
}
