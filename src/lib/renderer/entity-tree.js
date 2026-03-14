/**
 * entity-tree.js — generic two-mode entity tree renderer.
 *
 * Renders entities from an EntityStore in two grouping modes:
 *   byType  (default): [Type Section] → [Topic node] → [Chat node] → [Entity card]
 *   byTopic:           [Topic node]   → [Chat node]  → [Type badge + Entity card]
 *
 * Uses VirtualScroll when total entity count exceeds 150 (virtualThreshold).
 * Emits a custom 'entity-click' event on the container when a card is clicked.
 */

import { ENTITY_TYPES } from '../entities/chat-entity.js';

const ALL_TYPES      = Object.values(ENTITY_TYPES);
const VIRTUAL_THRESHOLD = 150;
const COLLAPSE_STORAGE_KEY = 'bAInder.entityCollapseState';

function _loadCollapseState() {
  try {
    return JSON.parse(localStorage.getItem(COLLAPSE_STORAGE_KEY) ?? '{}');
  } catch {
    return {};
  }
}

function _saveCollapseState(state) {
  try {
    localStorage.setItem(COLLAPSE_STORAGE_KEY, JSON.stringify(state));
  } catch { /* quota exceeded — ignore */ }
}

// ---------------------------------------------------------------------------
// Highlight helpers
// ---------------------------------------------------------------------------

function _escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function _escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Walk all non-empty text nodes under `el` and wrap occurrences of `query`
 * with <mark class="search-highlight"> elements.
 */
function _applyHighlight(el, query) {
  if (!query) return;
  const lcQuery = query.toLowerCase();
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null, false);
  const nodes = [];
  let node;
  while ((node = walker.nextNode())) {
    if (node.textContent.toLowerCase().includes(lcQuery)) nodes.push(node);
  }
  const regex = new RegExp(`(${_escapeRegex(_escapeHtml(query))})`, 'gi');
  for (const textNode of nodes) {
    const span = document.createElement('span');
    span.innerHTML = _escapeHtml(textNode.textContent).replace(
      regex,
      '<mark class="search-highlight">$1</mark>'
    );
    textNode.parentNode.replaceChild(span, textNode);
  }
}

// ---------------------------------------------------------------------------
// ChatEntityTree
// ---------------------------------------------------------------------------

export class ChatEntityTree {
  /**
   * @param {HTMLElement} container      Mount point for the tree
   * @param {EntityStore} entityStore    Provides getAllByType / getForChat / getChatById
   * @param {Object}      cardRenderers  { [type]: (entity) => HTMLElement }
   * @param {Object|null} topicTree      TopicTree instance (for topic name lookup)
   */
  constructor(container, entityStore, cardRenderers, topicTree) {
    this._container    = container;
    this._store        = entityStore;
    this._renderers    = cardRenderers;
    this._topicTree    = topicTree;
    this._mode         = 'byType';
    this._filter       = null;  // null = all types
    this._query        = '';
    this._collapseState = _loadCollapseState();
  }

  /** Update the topic tree reference (e.g. after a new tree is loaded). */
  setTopicTree(topicTree) {
    this._topicTree = topicTree;
  }

  /** Switch grouping mode. 'byType' (default) | 'byTopic' */
  setGroupMode(mode) {
    this._mode = mode;
    this.render();
  }

  /** Filter to entity types. Accepts null (all), a string, or a Set<string>. */
  setFilter(filter) {
    if (typeof filter === 'string') {
      this._filter = new Set([filter]);
    } else {
      this._filter = filter; // null or Set
    }
    this.render();
  }

  /** Highlight all occurrences of `query` in rendered cards. */
  highlightSearch(query) {
    this._query = query;
    this.render();
  }

  clearHighlight() {
    this._query = '';
    this.render();
  }

  /** Full re-render based on current mode, filter, and query. */
  render() {
    this._container.innerHTML = '';

    const rawTypes = (this._filter && this._filter.size > 0) ? [...this._filter] : ALL_TYPES;
    const types = [...rawTypes].sort((a, b) => _typeLabel(a).localeCompare(_typeLabel(b)));

    // Count total visible entities
    let totalCount = 0;
    for (const type of types) {
      totalCount += this._store.getAllByType(type).length;
    }

    if (totalCount === 0) {
      this._renderEmpty();
      return;
    }

    if (totalCount > VIRTUAL_THRESHOLD) {
      // Virtual scroll placeholder — full implementation in Phase A+
      this._renderVirtualPlaceholder(types, totalCount);
      return;
    }

    if (this._mode === 'byType') {
      this._renderByType(types);
    } else {
      this._renderByTopic(types);
    }

    if (this._query) {
      _applyHighlight(this._container, this._query);
    }
  }

  // ── Private rendering helpers ──────────────────────────────────────────────

  _renderEmpty() {
    const msg = document.createElement('div');
    msg.className = 'entity-tree__empty';
    msg.textContent = 'No entities found.';
    this._container.appendChild(msg);
  }

  _renderVirtualPlaceholder(types, totalCount) {
    // Virtual scroll not yet implemented — render a simple list until Phase A+
    this._renderByType(types);
    if (this._query) _applyHighlight(this._container, this._query);
  }

  /** byType mode: one section per entity type */
  _renderByType(types) {
    for (const type of types) {
      const entities = this._store.getAllByType(type);
      if (entities.length === 0) continue;

      const section = document.createElement('section');
      section.className = 'entity-section';
      section.dataset.type = type;

      // ── Header with count + collapse toggle ───────────────────────────
      const header = document.createElement('div');
      header.className = 'entity-section__header';

      const label = document.createElement('span');
      label.className = 'entity-section__label';
      label.textContent = `${_typeLabel(type)} (${entities.length})`;
      header.appendChild(label);

      // Restore or default to collapsed
      const sectionCollapsed = this._collapseState.sections?.[type] ?? true;

      const toggleBtn = document.createElement('button');
      toggleBtn.className = 'entity-section__toggle';
      toggleBtn.setAttribute('aria-expanded', String(!sectionCollapsed));
      toggleBtn.textContent = sectionCollapsed ? '\u25b6' : '\u25bc'; // ▶ if collapsed
      header.appendChild(toggleBtn);

      section.appendChild(header);

      // Body wrapper — toggled by header click or collapse button
      const body = document.createElement('div');
      body.className = 'entity-section__body';
      if (sectionCollapsed) body.style.display = 'none';
      const doSectionToggle = () => {
        const isCollapsed = body.style.display === 'none';
        body.style.display = isCollapsed ? '' : 'none';
        toggleBtn.setAttribute('aria-expanded', String(isCollapsed));
        toggleBtn.textContent = isCollapsed ? '\u25bc' : '\u25b6'; // ▼ : ▶
        if (!this._collapseState.sections) this._collapseState.sections = {};
        this._collapseState.sections[type] = !isCollapsed;
        _saveCollapseState(this._collapseState);
      };
      toggleBtn.addEventListener('click', (e) => { e.stopPropagation(); doSectionToggle(); });
      header.addEventListener('click', doSectionToggle);

      // Group entities by topicId via chatId → chat.topicId
      const byTopic = _groupByTopic(entities, this._store, this._topicTree);

      for (const { topicId, topicName, chatGroups } of byTopic) {
        const topicCollapsed = this._collapseState.topics?.[topicId] ?? false;
        const topicNode = _makeTopicNode(topicName, topicId, topicCollapsed, (collapsed) => {
          if (!this._collapseState.topics) this._collapseState.topics = {};
          this._collapseState.topics[topicId] = collapsed;
          _saveCollapseState(this._collapseState);
        });
        for (const { chatId, chatTitle, entitiesInChat } of chatGroups) {
          const chatNode = _makeChatNode(chatTitle, chatId);
          for (const entity of entitiesInChat) {
            const card = this._makeCard(entity, type);
            chatNode.appendChild(card);
          }
          topicNode._body.appendChild(chatNode);
        }
        body.appendChild(topicNode);
      }

      section.appendChild(body);
      this._container.appendChild(section);
    }
  }

  /** byTopic mode: one node per topic */
  _renderByTopic(types) {
    const allEntities = [];
    for (const type of types) {
      allEntities.push(...this._store.getAllByType(type));
    }
    if (allEntities.length === 0) return;

    const byTopic = _groupByTopic(allEntities, this._store, this._topicTree);

    for (const { topicId, topicName, chatGroups } of byTopic) {
      const topicCollapsed = this._collapseState.topics?.[topicId] ?? false;
      const topicNode = _makeTopicNode(topicName, topicId, topicCollapsed, (collapsed) => {
        if (!this._collapseState.topics) this._collapseState.topics = {};
        this._collapseState.topics[topicId] = collapsed;
        _saveCollapseState(this._collapseState);
      });
      topicNode.classList.add('entity-topic-node--root');

      for (const { chatId, chatTitle, entitiesInChat } of chatGroups) {
        const chatNode = _makeChatNode(chatTitle, chatId);
        for (const entity of entitiesInChat) {
          const badge = document.createElement('span');
          badge.className = `entity-type-badge entity-type-badge--${entity.type}`;
          badge.textContent = _typeLabel(entity.type);
          const card = this._makeCard(entity, entity.type);
          const wrapper = document.createElement('div');
          wrapper.className = 'entity-bytype-row';
          wrapper.appendChild(badge);
          wrapper.appendChild(card);
          chatNode.appendChild(wrapper);
        }
        topicNode._body.appendChild(chatNode);
      }

      this._container.appendChild(topicNode);
    }
  }

  /** Build an entity card element and wire the entity-click event. */
  _makeCard(entity, type) {
    const renderer = this._renderers[type];
    const cardEl = renderer
      ? renderer(entity)
      : _defaultCard(entity, type);

    const wrapper = document.createElement('div');
    wrapper.className = 'entity-card-wrapper';
    wrapper.appendChild(cardEl);

    wrapper.addEventListener('click', () => {
      this._container.dispatchEvent(new CustomEvent('entity-click', {
        bubbles: true,
        detail: { entity, chatId: entity.chatId },
      }));
    });

    return wrapper;
  }
}

// ---------------------------------------------------------------------------
// Grouping helpers
// ---------------------------------------------------------------------------

/**
 * Group entities by topic (via chatId → topic tree → topic name).
 * Returns an array of { topicId, topicName, chatGroups[] } in stable order.
 *
 * The topic TREE is the authoritative source for topic membership because
 * it is updated immediately by assignChatToTopic(), whereas state.chats
 * (chat.topicId) is only updated after the subsequent async updateChat()
 * call.  Using the tree prevents entities from briefly appearing under
 * "Uncategorised" while the async persist is in flight.
 */
function _groupByTopic(entities, store, topicTree) {
  // Build a reverse map: chatId → topicId, from the topic tree.
  const chatTopicMap = new Map();
  if (topicTree?.topics) {
    for (const [topicId, topic] of Object.entries(topicTree.topics)) {
      const ids = Array.isArray(topic.chatIds) ? topic.chatIds : [];
      for (const chatId of ids) {
        chatTopicMap.set(chatId, topicId);
      }
    }
  }

  // Build ordered map: topicId → { topicId, topicName, chatMap: Map<chatId, Entity[]> }
  const topicMap = new Map();

  for (const entity of entities) {
    const chat = store.getChatById(entity.chatId);
    // Prefer the topic-tree reverse-lookup (always up-to-date) over
    // chat.topicId (may lag while the async persist is in flight).
    const topicId   = chatTopicMap.get(entity.chatId) ?? chat?.topicId ?? '__uncategorised__';
    const topicName = _resolveTopicName(topicId, topicTree);

    if (!topicMap.has(topicId)) {
      topicMap.set(topicId, { topicId, topicName, chatMap: new Map() });
    }
    const topicEntry = topicMap.get(topicId);

    if (!topicEntry.chatMap.has(entity.chatId)) {
      topicEntry.chatMap.set(entity.chatId, {
        chatId:         entity.chatId,
        chatTitle:      chat?.title ?? entity.chatId,
        entitiesInChat: [],
      });
    }
    topicEntry.chatMap.get(entity.chatId).entitiesInChat.push(entity);
  }

  return [...topicMap.values()]
    .sort((a, b) => a.topicName.localeCompare(b.topicName))
    .map(({ topicId, topicName, chatMap }) => ({
      topicId,
      topicName,
      chatGroups: [...chatMap.values()],
    }));
}

function _resolveTopicName(topicId, topicTree) {
  if (topicId === '__uncategorised__') return 'Uncategorised';
  return topicTree?.topics?.[topicId]?.name ?? 'Uncategorised';
}

function _makeTopicNode(name, topicId, initiallyCollapsed = false, onToggle = null) {
  const el = document.createElement('div');
  el.className = 'entity-topic-node';
  if (topicId) el.dataset.topicId = topicId;

  // Header row: name + collapse toggle
  const headerRow = document.createElement('div');
  headerRow.className = 'entity-topic-node__header';

  const heading = document.createElement('h4');
  heading.className = 'entity-topic-node__name';
  heading.textContent = name;
  headerRow.appendChild(heading);

  const toggleBtn = document.createElement('button');
  toggleBtn.className = 'entity-topic-node__toggle';
  toggleBtn.setAttribute('aria-expanded', String(!initiallyCollapsed));
  toggleBtn.textContent = initiallyCollapsed ? '\u25b6' : '\u25bc'; // ▶ if collapsed
  headerRow.appendChild(toggleBtn);

  el.appendChild(headerRow);

  // Body wrapper that chat nodes are appended into
  const body = document.createElement('div');
  body.className = 'entity-topic-node__body';
  if (initiallyCollapsed) body.style.display = 'none';
  const doToggle = () => {
    const isCollapsed = body.style.display === 'none';
    body.style.display = isCollapsed ? '' : 'none';
    toggleBtn.setAttribute('aria-expanded', String(isCollapsed));
    toggleBtn.textContent = isCollapsed ? '\u25bc' : '\u25b6'; // ▼ : ▶
    onToggle?.(!isCollapsed); // pass new collapsed state to caller
  };
  toggleBtn.addEventListener('click', (e) => { e.stopPropagation(); doToggle(); });
  headerRow.addEventListener('click', doToggle);
  el.appendChild(body);

  // Expose body reference so the caller can append chat nodes into it
  el._body = body;

  return el;
}

function _makeChatNode(title, chatId) {
  const el = document.createElement('div');
  el.className = 'entity-chat-node';
  if (chatId) el.dataset.chatId = chatId;
  const label = document.createElement('div');
  label.className = 'entity-chat-node__title';
  label.textContent = title ?? chatId;
  el.appendChild(label);
  return el;
}

function _defaultCard(entity, type) {
  const el = document.createElement('div');
  el.className = `entity-card entity-card--${type}`;
  const text = document.createElement('span');
  text.className = 'entity-card__text';
  text.textContent = entity.text ?? entity.id ?? '';
  el.appendChild(text);
  return el;
}

const TYPE_LABELS = {
  prompt:     'Prompts',
  citation:   'Citations',
  table:      'Tables',
  code:       'Code Snippets',
  diagram:    'Diagrams',
  toolCall:   'Tool Calls',
  attachment: 'Attachments',
  image:      'Images',
  audio:      'Audio',
  artifact:   'Artifacts',
};

function _typeLabel(type) {
  return TYPE_LABELS[type] ?? type;
}
