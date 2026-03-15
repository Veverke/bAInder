/**
 * tests/entity-controller.test.js — Task A.9
 *
 * Tests for the EntityController module. Uses _setContext / _reset to inject
 * mock state without importing sidepanel singletons.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  init,
  refresh,
  setFilter,
  _setContext,
  _reset,
  _setShowPreview,
} from '../src/sidepanel/controllers/entity-controller.js';

// Mock the browser vendor shim (used by _defaultOnChatClick)
vi.mock('../src/lib/vendor/browser.js', () => ({
  default: {
    runtime: { getURL: vi.fn(p => `chrome-extension://test/${p}`) },
    tabs:    { create: vi.fn() },
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePromptEntity(chatId = 'c1', messageIndex = 0) {
  return {
    id: `prompt-${chatId}-${messageIndex}`,
    type: 'prompt',
    chatId,
    messageIndex,
    role: 'user',
    text: 'Hello world',
    wordCount: 2,
  };
}

function makeTableEntity(chatId = 'c1', messageIndex = 1) {
  return {
    id: `table-${chatId}-${messageIndex}`,
    type: 'table',
    chatId,
    messageIndex,
    role: 'assistant',
    headers: ['A', 'B'],
    rows: [['1', '2']],
    rowCount: 1,
  };
}

function makeChats(entityMap = {}) {
  return [{
    id:      'c1',
    title:   'Test Chat',
    topicId: null,
    ...entityMap,
  }];
}

function makeContainer() {
  const div = document.createElement('div');
  div.id = 'entityTree';
  document.body.appendChild(div);
  return div;
}

// ---------------------------------------------------------------------------
// init() tests
// ---------------------------------------------------------------------------

describe('EntityController.init()', () => {
  let container;

  beforeEach(() => {
    _reset();
    document.body.innerHTML = '';
    container = makeContainer();
  });

  afterEach(() => {
    _reset();
    document.body.innerHTML = '';
  });

  it('renders prompt cards for chats with prompt entities', () => {
    const chats = makeChats({ prompt: [makePromptEntity()] });
    _setContext({
      state:      { chats, tree: null },
      elements:   { entityTree: container },
      getChatsFn: () => chats,
    });
    init();
    expect(container.querySelector('.entity-card--prompt')).not.toBeNull();
  });

  it('renders a section header for each entity type present', () => {
    const chats = makeChats({
      prompt: [makePromptEntity()],
      table:  [makeTableEntity()],
    });
    _setContext({
      state:      { chats, tree: null },
      elements:   { entityTree: container },
      getChatsFn: () => chats,
    });
    init();
    const headers = [...container.querySelectorAll('.entity-section__label')].map(h => h.textContent);
    expect(headers.some(t => t.startsWith('Prompts'))).toBe(true);
    expect(headers.some(t => t.startsWith('Tables'))).toBe(true);
  });

  it('is idempotent — calling init() twice does not double-render', () => {
    const chats = makeChats({ prompt: [makePromptEntity()] });
    _setContext({
      state:      { chats, tree: null },
      elements:   { entityTree: container },
      getChatsFn: () => chats,
    });
    init();
    const countAfterFirst = container.innerHTML.length;
    init(); // no-op
    expect(container.innerHTML.length).toBe(countAfterFirst);
  });

  it('renders empty-state message when no entities in chats', () => {
    const chats = makeChats(); // no entity arrays
    _setContext({
      state:      { chats, tree: null },
      elements:   { entityTree: container },
      getChatsFn: () => chats,
    });
    init();
    expect(container.querySelector('.entity-tree__empty')).not.toBeNull();
  });

  it('does nothing when entityTree element is absent', () => {
    const chats = makeChats({ prompt: [makePromptEntity()] });
    _setContext({
      state:      { chats, tree: null },
      elements:   { entityTree: null }, // no mount point
      getChatsFn: () => chats,
    });
    expect(() => init()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// refresh() tests
// ---------------------------------------------------------------------------

describe('EntityController.refresh()', () => {
  let container;
  let chats;

  beforeEach(() => {
    _reset();
    document.body.innerHTML = '';
    container = makeContainer();
    chats = makeChats({ prompt: [makePromptEntity()] });
    _setContext({
      state:      { chats, tree: null },
      elements:   { entityTree: container },
      getChatsFn: () => chats,
    });
    init();
  });

  afterEach(() => {
    _reset();
    document.body.innerHTML = '';
  });

  it('refresh() re-renders after a new chat with table entities is added', () => {
    chats.push({
      id:      'c2',
      title:   'New Chat',
      topicId: null,
      table:   [makeTableEntity('c2', 1)],
    });
    refresh();
    const sections = container.querySelectorAll('.entity-section[data-type="table"]');
    expect(sections.length).toBeGreaterThan(0);
  });

  it('refresh() before init() does not throw', () => {
    _reset();
    expect(() => refresh()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// setFilter() tests
// ---------------------------------------------------------------------------

describe('EntityController.setFilter()', () => {
  let container;
  let chats;

  beforeEach(() => {
    _reset();
    document.body.innerHTML = '';
    container = makeContainer();
    chats = makeChats({
      prompt: [makePromptEntity()],
      table:  [makeTableEntity()],
    });
    _setContext({
      state:      { chats, tree: null },
      elements:   { entityTree: container },
      getChatsFn: () => chats,
    });
    init();
  });

  afterEach(() => {
    _reset();
    document.body.innerHTML = '';
  });

  it('setFilter("prompt") hides table sections', () => {
    setFilter('prompt');
    const tableSections = container.querySelectorAll('.entity-section[data-type="table"]');
    expect(tableSections).toHaveLength(0);
  });

  it('setFilter(null) restores all sections', () => {
    setFilter('prompt');
    setFilter(null);
    const headers = [...container.querySelectorAll('.entity-section__label')].map(h => h.textContent);
    expect(headers.some(t => t.startsWith('Prompts'))).toBe(true);
    expect(headers.some(t => t.startsWith('Tables'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// entity-click event wiring
// ---------------------------------------------------------------------------

describe('EntityController — entity-click navigation', () => {
  let container;
  let chats;
  let onChatClick;

  beforeEach(() => {
    _reset();
    document.body.innerHTML = '';
    container = makeContainer();
    chats = makeChats({ prompt: [makePromptEntity()] });
    onChatClick = vi.fn();
    _setContext({
      state:      { chats, tree: null },
      elements:   { entityTree: container },
      getChatsFn: () => chats,
      onChatClick,
    });
    init();
  });

  afterEach(() => {
    _reset();
    document.body.innerHTML = '';
  });

  it('entity-click event triggers onChatClick with correct chatId', () => {
    const entity = { id: 'p1', chatId: 'c1', messageIndex: 0, role: 'user', roleOrdinal: 1 };
    container.dispatchEvent(new CustomEvent('entity-click', {
      bubbles: true,
      detail:  { entity, chatId: 'c1' },
    }));
    expect(onChatClick).toHaveBeenCalledWith('c1', expect.any(Object));
  });

  it('user-role entity produces #p<roleOrdinal> anchor', () => {
    const entity = { id: 'p1', chatId: 'c1', messageIndex: 2, role: 'user', roleOrdinal: 3 };
    container.dispatchEvent(new CustomEvent('entity-click', {
      bubbles: true,
      detail:  { entity, chatId: 'c1' },
    }));
    expect(onChatClick).toHaveBeenCalledWith('c1', expect.objectContaining({ scrollToAnchor: '#p3' }));
  });

  it('assistant-role entity produces #r<roleOrdinal> anchor', () => {
    const entity = { id: 't1', chatId: 'c1', messageIndex: 1, role: 'assistant', roleOrdinal: 1 };
    container.dispatchEvent(new CustomEvent('entity-click', {
      bubbles: true,
      detail:  { entity, chatId: 'c1' },
    }));
    expect(onChatClick).toHaveBeenCalledWith('c1', expect.objectContaining({ scrollToAnchor: '#r1' }));
  });
});

// ---------------------------------------------------------------------------
// Phase B — Code & Diagram rendering (B.5)
// ---------------------------------------------------------------------------

function makeCodeEntity(chatId = 'c1', messageIndex = 1) {
  return {
    id: `code-${chatId}-${messageIndex}`,
    type: 'code',
    chatId,
    messageIndex,
    role: 'assistant',
    language: 'python',
    code: 'print("hello")',
    lineCount: 1,
  };
}

function makeDiagramEntity(chatId = 'c1', messageIndex = 2) {
  return {
    id: `diagram-${chatId}-${messageIndex}`,
    type: 'diagram',
    chatId,
    messageIndex,
    role: 'assistant',
    diagramType: 'flowchart',
    source: 'flowchart LR\n  A --> B',
    thumbnailSvg: null,
  };
}

describe('EntityController Phase B — code/diagram rendering', () => {
  let container;

  beforeEach(() => {
    _reset();
    document.body.innerHTML = '';
    container = makeContainer();
  });

  afterEach(() => {
    _reset();
    document.body.innerHTML = '';
  });

  it('chats with code snippets render code cards in the entity tree', () => {
    const chats = makeChats({ code: [makeCodeEntity()] });
    _setContext({
      state:      { chats, tree: null },
      elements:   { entityTree: container },
      getChatsFn: () => chats,
    });
    init();
    expect(container.querySelector('.entity-card--code')).not.toBeNull();
  });

  it('chats with Mermaid blocks render diagram cards', () => {
    const chats = makeChats({ diagram: [makeDiagramEntity()] });
    _setContext({
      state:      { chats, tree: null },
      elements:   { entityTree: container },
      getChatsFn: () => chats,
    });
    init();
    expect(container.querySelector('.entity-card--diagram')).not.toBeNull();
  });

  it('section header for code type is present', () => {
    const chats = makeChats({ code: [makeCodeEntity()] });
    _setContext({
      state:      { chats, tree: null },
      elements:   { entityTree: container },
      getChatsFn: () => chats,
    });
    init();
    const headers = [...container.querySelectorAll('.entity-section__label')].map(h => h.textContent);
    expect(headers.some(t => /code/i.test(t))).toBe(true);
  });

  it('section header for diagram type is present', () => {
    const chats = makeChats({ diagram: [makeDiagramEntity()] });
    _setContext({
      state:      { chats, tree: null },
      elements:   { entityTree: container },
      getChatsFn: () => chats,
    });
    init();
    const headers = [...container.querySelectorAll('.entity-section__label')].map(h => h.textContent);
    expect(headers.some(t => /diagram/i.test(t))).toBe(true);
  });

  it('refresh() after adding a code entity chat re-renders code section', () => {
    const chats = makeChats({ prompt: [makePromptEntity()] });
    _setContext({
      state:      { chats, tree: null },
      elements:   { entityTree: container },
      getChatsFn: () => chats,
    });
    init();
    chats.push({
      id:      'c2',
      title:   'Code Chat',
      topicId: null,
      code:    [makeCodeEntity('c2', 1)],
    });
    refresh();
    expect(container.querySelector('.entity-card--code')).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Phase C — Tool Calls & Attachments rendering (C.5)
// ---------------------------------------------------------------------------

function makeToolCallEntity(chatId = 'c1', messageIndex = 1) {
  return {
    id:           `toolcall-${chatId}-${messageIndex}`,
    type:         'toolCall',
    chatId,
    messageIndex,
    role:         'tool',
    tool:         'web_search',
    input:        'What is AI?',
    output:       'AI is ...',
    durationMs:   null,
  };
}

function makeAttachmentEntity(chatId = 'c1', messageIndex = 0) {
  return {
    id:           `attachment-${chatId}-${messageIndex}`,
    type:         'attachment',
    chatId,
    messageIndex,
    role:         'user',
    filename:     'report.pdf',
    mimeType:     'application/pdf',
    sizeBytes:    102400,
  };
}

describe('EntityController Phase C — tool-call/attachment rendering', () => {
  let container;

  beforeEach(() => {
    _reset();
    document.body.innerHTML = '';
    container = makeContainer();
  });

  afterEach(() => {
    _reset();
    document.body.innerHTML = '';
  });

  it('chats with tool call entities render tool-call cards', () => {
    const chats = makeChats({ toolCall: [makeToolCallEntity()] });
    _setContext({
      state:      { chats, tree: null },
      elements:   { entityTree: container },
      getChatsFn: () => chats,
    });
    init();
    expect(container.querySelector('.entity-card--tool-call')).not.toBeNull();
  });

  it('chats with attachment entities render attachment cards', () => {
    const chats = makeChats({ attachment: [makeAttachmentEntity()] });
    _setContext({
      state:      { chats, tree: null },
      elements:   { entityTree: container },
      getChatsFn: () => chats,
    });
    init();
    expect(container.querySelector('.entity-card--attachment')).not.toBeNull();
  });

  it('section header for toolCall type is present', () => {
    const chats = makeChats({ toolCall: [makeToolCallEntity()] });
    _setContext({
      state:      { chats, tree: null },
      elements:   { entityTree: container },
      getChatsFn: () => chats,
    });
    init();
    const headers = [...container.querySelectorAll('.entity-section__label')].map(h => h.textContent);
    expect(headers.some(t => /tool/i.test(t))).toBe(true);
  });

  it('section header for attachment type is present', () => {
    const chats = makeChats({ attachment: [makeAttachmentEntity()] });
    _setContext({
      state:      { chats, tree: null },
      elements:   { entityTree: container },
      getChatsFn: () => chats,
    });
    init();
    const headers = [...container.querySelectorAll('.entity-section__label')].map(h => h.textContent);
    expect(headers.some(t => /attachment/i.test(t))).toBe(true);
  });

  it('refresh() after adding a tool-call entity chat re-renders', () => {
    const chats = makeChats({ prompt: [makePromptEntity()] });
    _setContext({
      state:      { chats, tree: null },
      elements:   { entityTree: container },
      getChatsFn: () => chats,
    });
    init();
    chats.push({
      id:       'c2',
      title:    'API Chat',
      topicId:  null,
      toolCall: [makeToolCallEntity('c2', 1)],
    });
    refresh();
    expect(container.querySelector('.entity-card--tool-call')).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Phase D — Images & Audio rendering (D.6)
// ---------------------------------------------------------------------------

function makeImageEntity(chatId = 'c1', messageIndex = 1) {
  return {
    id:              `image-${chatId}-${messageIndex}`,
    type:            'image',
    chatId,
    messageIndex,
    role:            'assistant',
    src:             'https://example.com/photo.png',
    mimeType:        'image/png',
    altText:         'A photo',
    thumbnailDataUri: null,
    oversize:        false,
  };
}

function makeAudioEntity(chatId = 'c1', messageIndex = 1) {
  return {
    id:              `audio-${chatId}-${messageIndex}`,
    type:            'audio',
    chatId,
    messageIndex,
    role:            'assistant',
    src:             'https://example.com/speech.mp3',
    mimeType:        'audio/mpeg',
    durationSeconds: 30,
    transcript:      null,
    captureError:    null,
  };
}

describe('EntityController Phase D — image/audio rendering', () => {
  let container;

  beforeEach(() => {
    _reset();
    document.body.innerHTML = '';
    container = makeContainer();
  });

  afterEach(() => {
    _reset();
    document.body.innerHTML = '';
  });

  it('chats with image entities render image cards', () => {
    const chats = makeChats({ image: [makeImageEntity()] });
    _setContext({
      state:      { chats, tree: null },
      elements:   { entityTree: container },
      getChatsFn: () => chats,
    });
    init();
    expect(container.querySelector('.entity-card--image')).not.toBeNull();
  });

  it('chats with audio entities render audio cards', () => {
    const chats = makeChats({ audio: [makeAudioEntity()] });
    _setContext({
      state:      { chats, tree: null },
      elements:   { entityTree: container },
      getChatsFn: () => chats,
    });
    init();
    expect(container.querySelector('.entity-card--audio')).not.toBeNull();
  });

  it('section header for image type is present', () => {
    const chats = makeChats({ image: [makeImageEntity()] });
    _setContext({
      state:      { chats, tree: null },
      elements:   { entityTree: container },
      getChatsFn: () => chats,
    });
    init();
    const headers = [...container.querySelectorAll('.entity-section__label')].map(h => h.textContent);
    expect(headers.some(t => /image/i.test(t))).toBe(true);
  });

  it('section header for audio type is present', () => {
    const chats = makeChats({ audio: [makeAudioEntity()] });
    _setContext({
      state:      { chats, tree: null },
      elements:   { entityTree: container },
      getChatsFn: () => chats,
    });
    init();
    const headers = [...container.querySelectorAll('.entity-section__label')].map(h => h.textContent);
    expect(headers.some(t => /audio/i.test(t))).toBe(true);
  });

  it('refresh() after adding an image entity chat re-renders', () => {
    const chats = makeChats({ prompt: [makePromptEntity()] });
    _setContext({
      state:      { chats, tree: null },
      elements:   { entityTree: container },
      getChatsFn: () => chats,
    });
    init();
    chats.push({
      id:      'c2',
      title:   'Image Chat',
      topicId: null,
      image:   [makeImageEntity('c2', 1)],
    });
    refresh();
    expect(container.querySelector('.entity-card--image')).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Phase E — Artifact rendering (E.5)
// ---------------------------------------------------------------------------

function makeArtifactEntity(chatId = 'c1', messageIndex = 0) {
  return {
    id:               `artifact-${chatId}-${messageIndex}`,
    type:             'artifact',
    chatId,
    messageIndex,
    role:             'assistant',
    artifactType:     'html',
    title:            'My App',
    source:           '<p>Hello</p>',
    mimeType:         'text/html',
    screenshotDataUri: null,
  };
}

describe('EntityController Phase E — artifact rendering', () => {
  let container;

  beforeEach(() => {
    _reset();
    document.body.innerHTML = '';
    container = makeContainer();
  });

  afterEach(() => {
    _reset();
    document.body.innerHTML = '';
  });

  it('chats with artifact entities render artifact cards', () => {
    const chats = makeChats({ artifact: [makeArtifactEntity()] });
    _setContext({
      state:      { chats, tree: null },
      elements:   { entityTree: container },
      getChatsFn: () => chats,
    });
    init();
    expect(container.querySelector('.entity-card--artifact')).not.toBeNull();
  });

  it('section header for artifact type is present', () => {
    const chats = makeChats({ artifact: [makeArtifactEntity()] });
    _setContext({
      state:      { chats, tree: null },
      elements:   { entityTree: container },
      getChatsFn: () => chats,
    });
    init();
    const headers = [...container.querySelectorAll('.entity-section__label')].map(h => h.textContent);
    expect(headers.some(t => /artifact/i.test(t))).toBe(true);
  });

  it('refresh() after adding an artifact entity chat re-renders artifact section', () => {
    const chats = makeChats({ prompt: [makePromptEntity()] });
    _setContext({
      state:      { chats, tree: null },
      elements:   { entityTree: container },
      getChatsFn: () => chats,
    });
    init();
    chats.push({
      id:       'c2',
      title:    'Artifact Chat',
      topicId:  null,
      artifact: [makeArtifactEntity('c2', 0)],
    });
    refresh();
    expect(container.querySelector('.entity-card--artifact')).not.toBeNull();
  });

  it('"Preview" button on artifact card calls showArtifactPreview', () => {
    const showPreviewSpy = vi.fn();
    _setShowPreview(showPreviewSpy);

    const entity = makeArtifactEntity();
    const chats = makeChats({ artifact: [entity] });
    _setContext({
      state:      { chats, tree: null },
      elements:   { entityTree: container },
      getChatsFn: () => chats,
    });
    init();

    const previewBtn = container.querySelector('.entity-card__btn--preview');
    expect(previewBtn).not.toBeNull();
    previewBtn.click();
    expect(showPreviewSpy).toHaveBeenCalledWith(expect.objectContaining({ type: 'artifact' }));
  });
});

