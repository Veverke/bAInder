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

  it('render() shows entity cards directly in the section body (no intermediate topic nodes)', () => {
    const entity = makeEntity('prompt', 'c1', 0, { text: 'Hello world' });
    const chats = [makeChat('c1', 't1', { prompt: [entity] })];
    const store = makeStore(chats);
    const tree = new ChatEntityTree(container, store, cardRenderers, null);
    tree.render();

    // Entity item nodes are direct children of the section body
    expect(container.querySelectorAll('.entity-item-node').length).toBe(1);
    // No intermediate topic-node grouping in byType mode
    expect(container.querySelectorAll('.entity-topic-node').length).toBe(0);
  });

  it('renders a source chip showing the topic name below the entity card', () => {
    const topicTree = makeTopicTree({ 't1': { name: 'Science', chatIds: ['c1'] } });
    const entity = makeEntity('prompt', 'c1', 0, { text: 'Explain quantum' });
    const chats = [makeChat('c1', 't1', { prompt: [entity] })];
    const store = makeStore(chats);
    const tree = new ChatEntityTree(container, store, cardRenderers, topicTree);
    tree.render();

    const chips = [...container.querySelectorAll('.entity-source-chip')];
    expect(chips.length).toBe(1);
    expect(chips[0].textContent).toBe('Science');
  });

  it('de-duplicates entities with identical text and shows one node with multiple source chips', () => {
    const topicTree = makeTopicTree({
      't1': { name: 'Topic A', chatIds: ['c1'] },
      't2': { name: 'Topic B', chatIds: ['c2'] },
    });
    const sameText = 'Write a poem';
    const e1 = makeEntity('prompt', 'c1', 0, { text: sameText });
    const e2 = makeEntity('prompt', 'c2', 0, { text: sameText });
    const chats = [
      makeChat('c1', 't1', { prompt: [e1] }),
      makeChat('c2', 't2', { prompt: [e2] }),
    ];
    const store = makeStore(chats);
    const tree = new ChatEntityTree(container, store, cardRenderers, topicTree);
    tree.render();

    // Only one entity node (de-duplicated)
    expect(container.querySelectorAll('.entity-item-node').length).toBe(1);
    // Count badge shows (2)
    const badge = container.querySelector('.entity-item-node__count');
    expect(badge).not.toBeNull();
    expect(badge.textContent).toBe('(2)');
    // Two source chips, sorted alphabetically by topic name
    const chipTexts = [...container.querySelectorAll('.entity-source-chip')].map(c => c.textContent);
    expect(chipTexts).toEqual(['Topic A', 'Topic B']);
  });

  it('source chips are sorted alphabetically by topic name', () => {
    const topicTree = makeTopicTree({
      't1': { name: 'Zebra', chatIds: ['c1'] },
      't2': { name: 'Apple', chatIds: ['c2'] },
      't3': { name: 'Mango', chatIds: ['c3'] },
    });
    const sameText = 'shared prompt';
    const chats = [
      makeChat('c1', 't1', { prompt: [makeEntity('prompt', 'c1', 0, { text: sameText })] }),
      makeChat('c2', 't2', { prompt: [makeEntity('prompt', 'c2', 0, { text: sameText })] }),
      makeChat('c3', 't3', { prompt: [makeEntity('prompt', 'c3', 0, { text: sameText })] }),
    ];
    const store = makeStore(chats);
    const tree = new ChatEntityTree(container, store, cardRenderers, topicTree);
    tree.render();

    const chipTexts = [...container.querySelectorAll('.entity-source-chip')].map(c => c.textContent);
    expect(chipTexts).toEqual(['Apple', 'Mango', 'Zebra']);
    // Count badge shows (3)
    expect(container.querySelector('.entity-item-node__count').textContent).toBe('(3)');
  });

  it('no count badge when entity appears only once', () => {
    const entity = makeEntity('prompt', 'c1', 0, { text: 'unique prompt' });
    const chats = [makeChat('c1', 't1', { prompt: [entity] })];
    const store = makeStore(chats);
    const tree = new ChatEntityTree(container, store, cardRenderers, null);
    tree.render();

    expect(container.querySelector('.entity-item-node__count')).toBeNull();
  });

  it('section label shows unique entity count after de-duplication', () => {
    const sameText = 'duplicate prompt';
    const e1 = makeEntity('prompt', 'c1', 0, { text: sameText });
    const e2 = makeEntity('prompt', 'c2', 0, { text: sameText });
    const chats = [
      makeChat('c1', 't1', { prompt: [e1] }),
      makeChat('c2', 't1', { prompt: [e2] }),
    ];
    const store = makeStore(chats);
    const tree = new ChatEntityTree(container, store, cardRenderers, null);
    tree.render();

    const label = container.querySelector('.entity-section__label');
    // 2 raw entities but 1 unique — label should show 1
    expect(label.textContent).toContain('1');
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

  it('byTopic mode renders entity-type badge for each entity', () => {
    const topicTree = makeTopicTree({ 't1': { name: 'Science', chatIds: ['c1'] } });
    const entity = makeEntity('code', 'c1', 0, { text: 'console.log()' });
    const chats = [makeChat('c1', 't1', { code: [entity] })];
    const store = makeStore(chats);
    const tree = new ChatEntityTree(container, store, cardRenderers, topicTree);
    tree.setGroupMode('byTopic');

    const badges = container.querySelectorAll('[class*="entity-type-badge"]');
    expect(badges.length).toBeGreaterThan(0);
  });

  it('byTopic mode renders chat node within topic node', () => {
    const topicTree = makeTopicTree({ 't1': { name: 'History', chatIds: ['c1'] } });
    const entity = makeEntity('prompt', 'c1', 0, { text: 'Tell me about WW2' });
    const chats = [makeChat('c1', 't1', { prompt: [entity] })];
    const store = makeStore(chats);
    const tree = new ChatEntityTree(container, store, cardRenderers, topicTree);
    tree.setGroupMode('byTopic');

    expect(container.querySelectorAll('.entity-chat-node').length).toBeGreaterThan(0);
    expect(container.querySelector('.entity-chat-node__title').textContent).toBe('Chat c1');
  });

  it('byTopic mode fires entity-click event when card is clicked', () => {
    const topicTree = makeTopicTree({ 't1': { name: 'Tech', chatIds: ['c1'] } });
    const entity = makeEntity('code', 'c1', 0, { text: 'fn()' });
    const chats = [makeChat('c1', 't1', { code: [entity] })];
    const store = makeStore(chats);
    const tree = new ChatEntityTree(container, store, cardRenderers, topicTree);
    tree.setGroupMode('byTopic');

    let fired = null;
    container.addEventListener('entity-click', e => { fired = e.detail; });
    container.querySelector('.entity-card-wrapper').click();

    expect(fired).not.toBeNull();
    expect(fired.entity.id).toBe(entity.id);
    expect(fired.chatId).toBe('c1');
  });

  it('byTopic mode: entities with no topicId fall under Uncategorised', () => {
    const entity = makeEntity('table', 'c1', 0, { text: 'data' });
    const chats = [makeChat('c1', null, { table: [entity] })];
    const store = makeStore(chats);
    const tree = new ChatEntityTree(container, store, cardRenderers, null);
    tree.setGroupMode('byTopic');

    expect(container.textContent).toContain('Uncategorised');
  });

  it('byTopic mode with no entities renders empty-state message', () => {
    const store = makeStore([]);
    const tree = new ChatEntityTree(container, store, cardRenderers, null);
    tree.setGroupMode('byTopic');

    expect(container.querySelector('.entity-tree__empty')).not.toBeNull();
  });

  it('byTopic mode: topic collapse toggle hides body', () => {
    const topicTree = makeTopicTree({ 't1': { name: 'Art', chatIds: ['c1'] } });
    const entity = makeEntity('code', 'c1', 0, { text: 'draw()' });
    const chats = [makeChat('c1', 't1', { code: [entity] })];
    const store = makeStore(chats);
    const tree = new ChatEntityTree(container, store, cardRenderers, topicTree);
    tree.setGroupMode('byTopic');

    // topic node is expanded by default (topicCollapsed = false)
    const topicNode = container.querySelector('.entity-topic-node');
    const toggleBtn = topicNode.querySelector('.entity-topic-node__toggle');
    const body = topicNode.querySelector('.entity-topic-node__body');

    expect(body.style.display).not.toBe('none');
    toggleBtn.click();
    expect(body.style.display).toBe('none');
  });

  it('byTopic mode: uses _defaultCard for types without a custom renderer', () => {
    const topicTree = makeTopicTree({ 't1': { name: 'Misc', chatIds: ['c1'] } });
    // 'audio' type has no custom renderer in cardRenderers
    const entity = makeEntity('audio', 'c1', 0, { text: 'speech.mp3' });
    const chats = [makeChat('c1', 't1', { audio: [entity] })];
    const store = makeStore(chats);
    const tree = new ChatEntityTree(container, store, cardRenderers, topicTree);
    tree.setGroupMode('byTopic');

    // _defaultCard produces .entity-card--audio
    expect(container.querySelectorAll('.entity-card--audio').length).toBeGreaterThan(0);
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

    // Source chip should show 'DevOps', NOT 'Uncategorised'
    const chips = [...container.querySelectorAll('.entity-source-chip')].map(c => c.textContent);
    expect(chips).toContain('DevOps');
    expect(chips).not.toContain('Uncategorised');
  });

  it('chat.topicId fallback used when topic tree has no chatIds entry', () => {
    // Legacy topic mock without chatIds — should still work via chat.topicId
    const topicTree = makeTopicTree({ 't1': { name: 'Legacy', chatIds: [] } });
    const chats = [makeChat('c1', 't1', { code: [makeEntity('code', 'c1')] })];
    const store = makeStore(chats);
    const tree  = new ChatEntityTree(container, store, cardRenderers, topicTree);
    tree.render();

    const chips = [...container.querySelectorAll('.entity-source-chip')].map(c => c.textContent);
    expect(chips).toContain('Legacy');
  });

  it('entity goes to Uncategorised when not in topic tree and chat.topicId is null', () => {
    const topicTree = makeTopicTree({ 't1': { name: 'Other', chatIds: [] } });
    const chats = [makeChat('c1', null, { code: [makeEntity('code', 'c1')] })];
    const store = makeStore(chats);
    const tree  = new ChatEntityTree(container, store, cardRenderers, topicTree);
    tree.render();

    // Uncategorised entities show the chat title as chip text (fallback to chatId)
    const chips = [...container.querySelectorAll('.entity-source-chip')].map(c => c.textContent);
    // The chat title is 'Chat c1' (from makeChat helper), which is the fallback display
    expect(chips.length).toBe(1);
    // Chip shows chat title (not 'Uncategorised' text) because topicName === 'Uncategorised'
    // so the chip falls back to chatTitle
    expect(chips[0]).toBe('Chat c1');
  });
});
