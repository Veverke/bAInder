import { describe, it, expect, beforeEach } from 'vitest';
import { ChatEntityTree } from '../src/lib/renderer/entity-tree.js';
import { EntityStore } from '../src/lib/entities/entity-store.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeChat(id, topicId, entityMap = {}) {
  return { id, title: `Chat ${id}`, topicId, ...entityMap };
}

function makeEntity(type, chatId, messageIndex = 0, extra = {}) {
  return { id: `${type}-${chatId}-${messageIndex}`, type, chatId, messageIndex, ...extra };
}

function makeStore(chats) {
  return new EntityStore(() => chats);
}

function makeContainer() {
  const div = document.createElement('div');
  document.body.appendChild(div);
  return div;
}

// Simple card renderer that produces a div with text content
function textRenderer(entity) {
  const el = document.createElement('div');
  el.className = `entity-card entity-card--${entity.type}`;
  const span = document.createElement('span');
  span.className = 'entity-card__text';
  span.textContent = entity.text ?? entity.id;
  el.appendChild(span);
  return el;
}

const cardRenderers = {
  code:   textRenderer,
  table:  textRenderer,
  prompt: textRenderer,
};

// Minimal mock topic tree
function makeTopicTree(topics = {}) {
  return { topics };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ChatEntityTree — byType mode (default)', () => {
  let container;

  beforeEach(() => {
    container = makeContainer();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('render() produces a section header for each type that has entities', () => {
    const chats = [
      makeChat('c1', 't1', {
        code:  [makeEntity('code', 'c1')],
        table: [makeEntity('table', 'c1')],
      }),
    ];
    const store = makeStore(chats);
    const tree = new ChatEntityTree(container, store, cardRenderers, null);
    tree.render();

    const headers = [...container.querySelectorAll('.entity-section__header')];
    const texts = headers.map(h => h.querySelector('.entity-section__label')?.textContent ?? h.textContent);
    expect(texts.some(t => t.startsWith('Code Snippets'))).toBe(true);
    expect(texts.some(t => t.startsWith('Tables'))).toBe(true);
  });

  it('render() does not produce sections for types with no entities', () => {
    const chats = [makeChat('c1', 't1', { code: [makeEntity('code', 'c1')] })];
    const store = makeStore(chats);
    const tree = new ChatEntityTree(container, store, cardRenderers, null);
    tree.render();

    const sections = [...container.querySelectorAll('.entity-section')];
    const types = sections.map(s => s.dataset.type);
    expect(types).toContain('code');
    expect(types).not.toContain('table');
  });
});

describe('ChatEntityTree — byTopic mode', () => {
  let container;

  beforeEach(() => {
    container = makeContainer();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('render() in byTopic mode produces topic nodes', () => {
    const topicTree = makeTopicTree({ 't1': { name: 'Science' } });
    const chats = [makeChat('c1', 't1', { code: [makeEntity('code', 'c1')] })];
    const store = makeStore(chats);
    const tree = new ChatEntityTree(container, store, cardRenderers, topicTree);
    tree.setGroupMode('byTopic');

    const topicNodes = container.querySelectorAll('.entity-topic-node');
    expect(topicNodes.length).toBeGreaterThan(0);
  });

  it('render() in byTopic mode uses topic name from topicTree', () => {
    const topicTree = makeTopicTree({ 't1': { name: 'My Topic' } });
    const chats = [makeChat('c1', 't1', { code: [makeEntity('code', 'c1')] })];
    const store = makeStore(chats);
    const tree = new ChatEntityTree(container, store, cardRenderers, topicTree);
    tree.setGroupMode('byTopic');

    expect(container.textContent).toContain('My Topic');
  });
});

describe('ChatEntityTree — setFilter()', () => {
  let container;

  beforeEach(() => {
    container = makeContainer();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('setFilter("code") hides non-code sections', () => {
    const chats = [
      makeChat('c1', 't1', {
        code:  [makeEntity('code', 'c1')],
        table: [makeEntity('table', 'c1')],
      }),
    ];
    const store = makeStore(chats);
    const tree = new ChatEntityTree(container, store, cardRenderers, null);
    tree.setFilter('code');

    const sections = [...container.querySelectorAll('.entity-section')];
    expect(sections.every(s => s.dataset.type === 'code')).toBe(true);
    expect(sections.some(s => s.dataset.type === 'table')).toBe(false);
  });
});

describe('ChatEntityTree — highlightSearch()', () => {
  let container;

  beforeEach(() => {
    container = makeContainer();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('highlightSearch adds highlight markup to matching cards', () => {
    const entity = makeEntity('code', 'c1', 0, { text: 'async function example() {}' });
    const chats  = [makeChat('c1', 't1', { code: [entity] })];
    const store  = makeStore(chats);
    const tree   = new ChatEntityTree(container, store, cardRenderers, null);
    tree.highlightSearch('async');

    const marks = container.querySelectorAll('mark.search-highlight');
    expect(marks.length).toBeGreaterThan(0);
    expect(marks[0].textContent.toLowerCase()).toBe('async');
  });

  it('clearHighlight re-renders without highlight markup', () => {
    const entity = makeEntity('code', 'c1', 0, { text: 'async function example() {}' });
    const chats  = [makeChat('c1', 't1', { code: [entity] })];
    const store  = makeStore(chats);
    const tree   = new ChatEntityTree(container, store, cardRenderers, null);
    tree.highlightSearch('async');
    tree.clearHighlight();

    const marks = container.querySelectorAll('mark.search-highlight');
    expect(marks.length).toBe(0);
  });
});

describe('ChatEntityTree — entity-click event', () => {
  let container;

  beforeEach(() => {
    container = makeContainer();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('clicking a card fires the entity-click event with correct payload', () => {
    const entity = makeEntity('code', 'c1', 0, { text: 'hello' });
    const chats  = [makeChat('c1', 't1', { code: [entity] })];
    const store  = makeStore(chats);
    const tree   = new ChatEntityTree(container, store, cardRenderers, null);
    tree.render();

    let fired = null;
    container.addEventListener('entity-click', (e) => { fired = e.detail; });
    container.querySelector('.entity-card-wrapper').click();

    expect(fired).not.toBeNull();
    expect(fired.entity.id).toBe(entity.id);
    expect(fired.chatId).toBe('c1');
  });
});

describe('ChatEntityTree — empty store', () => {
  let container;

  beforeEach(() => {
    container = makeContainer();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('renders an empty-state message when the store has no entities', () => {
    const store = makeStore([]);
    const tree  = new ChatEntityTree(container, store, cardRenderers, null);
    tree.render();

    const empty = container.querySelector('.entity-tree__empty');
    expect(empty).not.toBeNull();
    expect(empty.textContent).toBeTruthy();
  });

  it('does not render any sections when store is empty', () => {
    const store = makeStore([]);
    const tree  = new ChatEntityTree(container, store, cardRenderers, null);
    tree.render();

    expect(container.querySelectorAll('.entity-section').length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Topic-tree reverse-lookup (duplication fix)
// ---------------------------------------------------------------------------

describe('ChatEntityTree — topic-tree reverse-lookup', () => {
  let container;

  beforeEach(() => {
    container = makeContainer();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('entity with stale chat.topicId=null appears under correct topic when tree has chatId', () => {
    // chat.topicId is still null (async persist not yet complete) but the
    // topic tree was already updated by assignChatToTopic().
    const topicTree = makeTopicTree({ 't1': { name: 'DevOps', chatIds: ['c1'] } });
    const chats = [makeChat('c1', null, { code: [makeEntity('code', 'c1')] })]; // topicId: null
    const store = makeStore(chats);
    const tree  = new ChatEntityTree(container, store, cardRenderers, topicTree);
    tree.render();

    // Should appear under 'DevOps', NOT under 'Uncategorised'
    const topicNames = [...container.querySelectorAll('.entity-topic-node__name')].map(n => n.textContent);
    expect(topicNames).toContain('DevOps');
    expect(topicNames).not.toContain('Uncategorised');
  });

  it('chat.topicId fallback used when topic tree has no chatIds entry', () => {
    // Legacy topic mock without chatIds — should still work via chat.topicId
    const topicTree = makeTopicTree({ 't1': { name: 'Legacy', chatIds: [] } });
    const chats = [makeChat('c1', 't1', { code: [makeEntity('code', 'c1')] })];
    const store = makeStore(chats);
    const tree  = new ChatEntityTree(container, store, cardRenderers, topicTree);
    tree.render();

    const topicNames = [...container.querySelectorAll('.entity-topic-node__name')].map(n => n.textContent);
    expect(topicNames).toContain('Legacy');
  });

  it('entity goes to Uncategorised when not in topic tree and chat.topicId is null', () => {
    const topicTree = makeTopicTree({ 't1': { name: 'Other', chatIds: [] } });
    const chats = [makeChat('c1', null, { code: [makeEntity('code', 'c1')] })];
    const store = makeStore(chats);
    const tree  = new ChatEntityTree(container, store, cardRenderers, topicTree);
    tree.render();

    const topicNames = [...container.querySelectorAll('.entity-topic-node__name')].map(n => n.textContent);
    expect(topicNames).toContain('Uncategorised');
  });
});
