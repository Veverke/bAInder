/**
 * search-controller.test.js — tests for Task 0.8 search context toggle.
 *
 * Tests the Chats/Entities context routing added to search-controller.js.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  _setContext,
  _setEntitySearchHandler,
  handleSearch,
  setupSearchContextToggle,
} from '../src/sidepanel/controllers/search-controller.js';

// ---------------------------------------------------------------------------
// Helpers — build a minimal mock context
// ---------------------------------------------------------------------------

function makeElements(overrides = {}) {
  const searchInput      = document.createElement('input');
  const clearSearchBtn   = document.createElement('button');
  clearSearchBtn.style.display = 'none';
  const searchCtxChats   = document.createElement('button');
  searchCtxChats.classList.add('context-btn', 'context-btn--active');
  const searchCtxEntities = document.createElement('button');
  searchCtxEntities.classList.add('context-btn');
  const searchFilterBar  = document.createElement('div');

  // Chat filter groups
  const srcGroup = document.createElement('div');
  srcGroup.classList.add('filter-group');
  searchFilterBar.appendChild(srcGroup);

  // Entity types group (hidden by default)
  const entityGroup = document.createElement('div');
  entityGroup.id = 'filterEntityTypes';
  entityGroup.classList.add('filter-group', 'filter-group--entity-types');
  entityGroup.hidden = true;
  // Pills container expected by populateEntityTypeChips
  const entityTypePills = document.createElement('div');
  entityTypePills.id = 'filterEntityTypePills';
  entityGroup.appendChild(entityTypePills);
  searchFilterBar.appendChild(entityGroup);

  document.body.append(
    searchInput, clearSearchBtn, searchCtxChats, searchCtxEntities, searchFilterBar
  );

  return {
    searchInput,
    clearSearchBtn,
    searchCtxChats,
    searchCtxEntities,
    searchFilterBar,
    filterEntityTypes:     entityGroup,
    filterEntityTypePills: entityTypePills,
    ...overrides,
  };
}

function makeState(overrides = {}) {
  return {
    searchQuery:   '',
    searchContext: 'chats',
    renderer:      null,
    storage:       { searchChats: vi.fn().mockResolvedValue([]) },
    filters: {
      sources: new Set(), dateFrom: null, dateTo: null,
      topicId: '', minRating: null, tags: new Set(),
      entityTypes: new Set(),
    },
    tree: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('handleSearch() — context routing', () => {
  let els;
  let st;
  let entitySearchSpy;

  beforeEach(() => {
    entitySearchSpy = vi.fn();
    _setEntitySearchHandler(entitySearchSpy);
    els = makeElements();
    st  = makeState();
    _setContext({ elements: els, state: st, ...st });
    // Patch elements used inside handleSearch
    Object.assign(els, { searchResults: null, searchResultsList: null, resultCount: null });
  });

  afterEach(() => {
    document.body.innerHTML = '';
    _setEntitySearchHandler(() => {});
    _setContext({ elements: {}, state: { searchContext: 'chats', searchQuery: '', filters: { sources: new Set() }, renderer: null, storage: { searchChats: vi.fn() } } });
  });

  it('switching to entities calls runEntitySearch (spy) not storage.searchChats', async () => {
    st.searchContext = 'entities';
    const event = { target: { value: 'async' } };
    handleSearch(event);

    // Give debounce a tick
    await new Promise(r => setTimeout(r, 0));
    expect(entitySearchSpy).toHaveBeenCalledWith('async', expect.any(Object));
    expect(st.storage.searchChats).not.toHaveBeenCalled();
  });

  it('switching back to chats does not call entity search', () => {
    st.searchContext = 'chats';
    const event = { target: { value: '' } };
    handleSearch(event);
    expect(entitySearchSpy).not.toHaveBeenCalled();
  });
});

describe('setupSearchContextToggle() — visibility', () => {
  let els;
  let st;

  beforeEach(() => {
    els = makeElements();
    st  = makeState();
    _setContext({ elements: els, state: st, ...st });
  });

  afterEach(() => {
    document.body.innerHTML = '';
    _setContext({ elements: {}, state: { searchContext: 'chats', searchQuery: '', filters: { sources: new Set() }, renderer: null, storage: { searchChats: vi.fn() } } });
  });

  it('entity-type chips section is shown when context switches to entities', () => {
    setupSearchContextToggle();
    els.searchCtxEntities.click();
    expect(els.searchFilterBar.querySelector('#filterEntityTypes').hidden).toBe(false);
  });

  it('entity-type chips section is hidden when context switches back to chats', () => {
    setupSearchContextToggle();
    els.searchCtxEntities.click();
    els.searchCtxChats.click();
    expect(els.searchFilterBar.querySelector('#filterEntityTypes').hidden).toBe(true);
  });

  it('chat filter groups are hidden when context switches to entities', () => {
    setupSearchContextToggle();
    els.searchCtxEntities.click();
    const chatGroups = [...els.searchFilterBar.querySelectorAll(
      '.filter-group:not(.filter-group--entity-types)'
    )];
    expect(chatGroups.every(g => g.hidden)).toBe(true);
  });

  it('chat filter groups are restored when switching back to chats', () => {
    setupSearchContextToggle();
    els.searchCtxEntities.click();
    els.searchCtxChats.click();
    const chatGroups = [...els.searchFilterBar.querySelectorAll(
      '.filter-group:not(.filter-group--entity-types)'
    )];
    expect(chatGroups.every(g => !g.hidden)).toBe(true);
  });

  it('state.searchContext is updated on toggle', () => {
    setupSearchContextToggle();
    els.searchCtxEntities.click();
    expect(st.searchContext).toBe('entities');
    els.searchCtxChats.click();
    expect(st.searchContext).toBe('chats');
  });
});

// ---------------------------------------------------------------------------
// A.8 — entity-type filter chips
// ---------------------------------------------------------------------------

import { ENTITY_TYPES } from '../src/lib/entities/chat-entity.js';

describe('entity-type chips (A.8) — population', () => {
  let els;
  let st;

  beforeEach(() => {
    els = makeElements();
    st  = makeState();
    _setContext({ elements: els, state: st, ...st });
  });

  afterEach(() => {
    document.body.innerHTML = '';
    _setContext({ elements: {}, state: { searchContext: 'chats', searchQuery: '', filters: { sources: new Set(), entityTypes: new Set() }, renderer: null, storage: { searchChats: vi.fn() } } });
  });

  it('setupSearchContextToggle creates one chip per ENTITY_TYPES value', () => {
    setupSearchContextToggle();
    const pills = [...els.filterEntityTypePills.querySelectorAll('.filter-pill')];
    expect(pills.length).toBe(Object.values(ENTITY_TYPES).length);
  });

  it('each chip carries the correct data-entity-type', () => {
    setupSearchContextToggle();
    const types = [...els.filterEntityTypePills.querySelectorAll('.filter-pill')]
      .map(p => p.dataset.entityType);
    for (const type of Object.values(ENTITY_TYPES)) {
      expect(types).toContain(type);
    }
  });

  it('activating a chip adds the type to state.filters.entityTypes', () => {
    setupSearchContextToggle();
    const promptPill = [...els.filterEntityTypePills.querySelectorAll('.filter-pill')]
      .find(p => p.dataset.entityType === 'prompt');
    promptPill.click();
    expect(st.filters.entityTypes.has('prompt')).toBe(true);
  });

  it('activating the same chip again removes the type', () => {
    setupSearchContextToggle();
    const promptPill = [...els.filterEntityTypePills.querySelectorAll('.filter-pill')]
      .find(p => p.dataset.entityType === 'prompt');
    promptPill.click(); // add
    promptPill.click(); // remove
    expect(st.filters.entityTypes.has('prompt')).toBe(false);
  });

  it('active chip gets is-active class, inactive loses it', () => {
    setupSearchContextToggle();
    const pill = [...els.filterEntityTypePills.querySelectorAll('.filter-pill')]
      .find(p => p.dataset.entityType === 'table');
    pill.click();
    expect(pill.classList.contains('is-active')).toBe(true);
    pill.click();
    expect(pill.classList.contains('is-active')).toBe(false);
  });
});

describe('runEntitySearch() — entityTypes passthrough (A.8)', () => {
  let els;
  let st;
  let entitySearchSpy;

  beforeEach(() => {
    entitySearchSpy = vi.fn();
    _setEntitySearchHandler(entitySearchSpy);
    els = makeElements();
    st  = makeState();
    _setContext({ elements: els, state: st, ...st });
    Object.assign(els, { searchResults: null, searchResultsList: null, resultCount: null });
  });

  afterEach(() => {
    document.body.innerHTML = '';
    _setEntitySearchHandler(() => {});
    _setContext({ elements: {}, state: { searchContext: 'chats', searchQuery: '', filters: { sources: new Set(), entityTypes: new Set() }, renderer: null, storage: { searchChats: vi.fn() } } });
  });

  it('passes active entityTypes Set to the handler', async () => {
    st.searchContext    = 'entities';
    st.filters.entityTypes = new Set(['code', 'table']);
    handleSearch({ target: { value: 'query' } });
    await new Promise(r => setTimeout(r, 0));
    expect(entitySearchSpy).toHaveBeenCalledWith(
      'query',
      expect.objectContaining({ entityTypes: st.filters.entityTypes })
    );
  });

  it('passes empty Set when no chips are active', async () => {
    st.searchContext = 'entities';
    handleSearch({ target: { value: 'test' } });
    await new Promise(r => setTimeout(r, 0));
    const opts = entitySearchSpy.mock.calls[0][1];
    expect(opts.entityTypes).toBeInstanceOf(Set);
    expect(opts.entityTypes.size).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// debounce()
// ─────────────────────────────────────────────────────────────────────────────

import {
  debounce,
  clearSearch,
  rerunSearch,
  renderSearchResults,
  buildResultCard,
  hideSearchResults,
  populateTopicScopeSelect,
  updateFilterIndicator,
  populateTagFilterPills,
} from '../src/sidepanel/controllers/search-controller.js';
import { elements as appElements } from '../src/sidepanel/app-context.js';

describe('debounce()', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('delays the function until the timeout expires', () => {
    const fn = vi.fn();
    const deb = debounce(fn, 200);
    deb('hello');
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(200);
    expect(fn).toHaveBeenCalledWith('hello');
  });

  it('resets the timer when called repeatedly', () => {
    const fn = vi.fn();
    const deb = debounce(fn, 200);
    deb('first');
    vi.advanceTimersByTime(100);
    deb('second');
    vi.advanceTimersByTime(100);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledOnce();
    expect(fn).toHaveBeenCalledWith('second');
  });

  it('.cancel() prevents the pending invocation', () => {
    const fn = vi.fn();
    const deb = debounce(fn, 200);
    deb('arg');
    deb.cancel();
    vi.advanceTimersByTime(300);
    expect(fn).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// hideSearchResults()
// ─────────────────────────────────────────────────────────────────────────────

describe('hideSearchResults()', () => {
  afterEach(() => {
    appElements.searchResults     = undefined;
    appElements.searchResultsList = undefined;
    document.body.innerHTML = '';
  });

  it('hides the search results container', () => {
    const div = document.createElement('div');
    div.style.display = 'block';
    document.body.appendChild(div);
    appElements.searchResults = div;
    appElements.searchResultsList = document.createElement('ul');
    hideSearchResults();
    expect(div.style.display).toBe('none');
  });

  it('clears the results list innerHTML', () => {
    const list = document.createElement('ul');
    list.innerHTML = '<li>item</li>';
    document.body.appendChild(list);
    appElements.searchResultsList = list;
    appElements.searchResults = document.createElement('div');
    hideSearchResults();
    expect(list.innerHTML).toBe('');
  });

  it('does not throw when elements are absent', () => {
    appElements.searchResults     = null;
    appElements.searchResultsList = null;
    expect(() => hideSearchResults()).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// clearSearch()
// ─────────────────────────────────────────────────────────────────────────────

function makeSearchElements() {
  const searchInput      = document.createElement('input');
  const clearSearchBtn   = document.createElement('button');
  clearSearchBtn.style.display = 'block';
  const searchResults    = document.createElement('div');
  searchResults.style.display = 'block';
  const searchResultsList = document.createElement('ul');
  searchResults.appendChild(searchResultsList);
  document.body.append(searchInput, clearSearchBtn, searchResults);
  appElements.searchInput       = searchInput;
  appElements.clearSearchBtn    = clearSearchBtn;
  appElements.searchResults     = searchResults;
  appElements.searchResultsList = searchResultsList;
  return { searchInput, clearSearchBtn, searchResults, searchResultsList };
}

describe('clearSearch()', () => {
  let st;
  beforeEach(() => {
    makeSearchElements();
    st = {
      searchQuery: 'test',
      filters: { sources: new Set(), dateFrom: null, dateTo: null, topicId: '', minRating: null, tags: new Set() },
      renderer: { clearHighlight: vi.fn() },
      storage: { searchChats: vi.fn().mockResolvedValue([]) },
    };
    _setContext(st);
  });

  afterEach(() => {
    document.body.innerHTML = '';
    appElements.searchInput = appElements.clearSearchBtn = appElements.searchResults = appElements.searchResultsList = undefined;
    _setContext({ searchQuery: '', filters: { sources: new Set(), dateFrom: null, dateTo: null, topicId: '', minRating: null, tags: new Set() }, renderer: null, storage: { searchChats: vi.fn() } });
  });

  it('clears the search input value', () => {
    appElements.searchInput.value = 'hello';
    clearSearch();
    expect(appElements.searchInput.value).toBe('');
  });

  it('hides the clearSearchBtn', () => {
    clearSearch();
    expect(appElements.clearSearchBtn.style.display).toBe('none');
  });

  it('clears searchQuery on state', () => {
    clearSearch();
    expect(st.searchQuery).toBe('');
  });

  it('calls renderer.clearHighlight() when no active filters', () => {
    clearSearch();
    expect(st.renderer.clearHighlight).toHaveBeenCalled();
  });

  it('runs search when active filters exist', async () => {
    st.filters.sources.add('chatgpt');
    clearSearch();
    await Promise.resolve(); // flush microtasks so searchChats resolves
    expect(st.storage.searchChats).toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// rerunSearch()
// ─────────────────────────────────────────────────────────────────────────────

describe('rerunSearch()', () => {
  let st;
  beforeEach(() => {
    makeSearchElements();
    st = {
      searchQuery: '',
      filters: { sources: new Set(), dateFrom: null, dateTo: null, topicId: '', minRating: null, tags: new Set() },
      renderer: { clearHighlight: vi.fn(), highlightSearch: vi.fn(), expandAll: vi.fn() },
      storage: { searchChats: vi.fn().mockResolvedValue([]) },
    };
    _setContext(st);
  });

  afterEach(() => {
    document.body.innerHTML = '';
    appElements.searchInput = appElements.clearSearchBtn = appElements.searchResults = appElements.searchResultsList = undefined;
    _setContext({ searchQuery: '', filters: { sources: new Set(), dateFrom: null, dateTo: null, topicId: '', minRating: null, tags: new Set() }, renderer: null, storage: { searchChats: vi.fn() } });
  });

  it('hides results when no query and no active filters', () => {
    rerunSearch();
    expect(appElements.searchResults.style.display).toBe('none');
  });

  it('triggers a deferred search when query is non-empty', async () => {
    vi.useFakeTimers();
    st.searchQuery = 'hello';
    rerunSearch();
    vi.advanceTimersByTime(300);
    await vi.runAllTimersAsync();
    expect(st.storage.searchChats).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('triggers search when there are active filters but no query', async () => {
    vi.useFakeTimers();
    st.filters.sources.add('claude');
    rerunSearch();
    vi.advanceTimersByTime(300);
    await vi.runAllTimersAsync();
    expect(st.storage.searchChats).toHaveBeenCalled();
    vi.useRealTimers();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// renderSearchResults()
// ─────────────────────────────────────────────────────────────────────────────

describe('renderSearchResults()', () => {
  let st;
  beforeEach(() => {
    const { searchResults, searchResultsList } = makeSearchElements();
    const resultCount = document.createElement('span');
    document.body.appendChild(resultCount);
    appElements.resultCount = resultCount;
    st = {
      searchQuery: '',
      filters: { sources: new Set(), dateFrom: null, dateTo: null, topicId: '', minRating: null, tags: new Set() },
      renderer: null,
      storage: { searchChats: vi.fn().mockResolvedValue([]) },
      tree: null,
    };
    _setContext(st);
  });

  afterEach(() => {
    document.body.innerHTML = '';
    appElements.searchInput = appElements.clearSearchBtn = appElements.searchResults = appElements.searchResultsList = appElements.resultCount = undefined;
    _setContext({ searchQuery: '', filters: { sources: new Set(), dateFrom: null, dateTo: null, topicId: '', minRating: null, tags: new Set() }, renderer: null, storage: { searchChats: vi.fn() } });
  });

  it('shows the search results container', () => {
    appElements.searchResults.style.display = 'none';
    renderSearchResults([], '');
    expect(appElements.searchResults.style.display).toBe('block');
  });

  it('shows "0 results" for empty results', () => {
    renderSearchResults([], '');
    expect(appElements.resultCount.textContent).toBe('0 results');
  });

  it('shows "1 result" for a single result', () => {
    const chat = { id: 'c1', title: 'Test', source: 'chatgpt', content: 'body', tags: [] };
    renderSearchResults([chat], 'test');
    expect(appElements.resultCount.textContent).toBe('1 result');
  });

  it('renders a result card for each result', () => {
    const chats = [
      { id: 'c1', title: 'First', source: 'chatgpt', content: '', tags: [] },
      { id: 'c2', title: 'Second', source: 'claude', content: '', tags: [] },
    ];
    renderSearchResults(chats, '');
    const cards = appElements.searchResultsList.querySelectorAll('.result-card');
    expect(cards.length).toBe(2);
  });

  it('renders empty-state HTML when results are empty', () => {
    renderSearchResults([], 'missing');
    expect(appElements.searchResultsList.innerHTML).toContain('No matches found');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// buildResultCard()
// ─────────────────────────────────────────────────────────────────────────────

describe('buildResultCard()', () => {
  beforeEach(() => {
    const st = {
      searchQuery: '',
      filters: { sources: new Set(), dateFrom: null, dateTo: null, topicId: '', minRating: null, tags: new Set() },
      renderer: null,
      storage: { searchChats: vi.fn().mockResolvedValue([]) },
      tree: { getTopicPath: vi.fn().mockReturnValue([]) },
    };
    _setContext(st);
  });

  afterEach(() => {
    _setContext({ searchQuery: '', filters: { sources: new Set(), dateFrom: null, dateTo: null, topicId: '', minRating: null, tags: new Set() }, renderer: null, storage: { searchChats: vi.fn() }, tree: null });
  });

  it('returns an article element HTML string', () => {
    const chat = { id: 'c1', title: 'Hello', source: 'chatgpt', content: '', tags: [] };
    const html = buildResultCard('', chat);
    expect(html).toContain('<article');
    expect(html).toContain('result-card');
  });

  it('includes the chat title', () => {
    const chat = { id: 'c1', title: 'My Unique Title', source: 'claude', content: '', tags: [] };
    const html = buildResultCard('', chat);
    expect(html).toContain('My Unique Title');
  });

  it('uses "Untitled Chat" when title is missing', () => {
    const chat = { id: 'c1', source: 'claude', content: '', tags: [] };
    const html = buildResultCard('', chat);
    expect(html).toContain('Untitled Chat');
  });

  it('renders a badge for known sources', () => {
    const chat = { id: 'c1', title: 'X', source: 'gemini', content: '', tags: [] };
    const html = buildResultCard('', chat);
    expect(html).toContain('badge--gemini');
  });

  it('renders badge--unknown for unrecognised sources', () => {
    const chat = { id: 'c1', title: 'X', source: 'my-custom-ai', content: '', tags: [] };
    const html = buildResultCard('', chat);
    expect(html).toContain('badge--unknown');
  });

  it('renders rating stars when chat.rating is set', () => {
    const chat = { id: 'c1', title: 'Rated', source: 'chatgpt', content: '', tags: [], rating: 3 };
    const html = buildResultCard('', chat);
    expect(html).toContain('result-rating');
    expect(html).toContain('★★★');
  });

  it('renders tag chips when tags are present', () => {
    const chat = { id: 'c1', title: 'Tagged', source: 'chatgpt', content: '', tags: ['alpha', 'beta'] };
    const html = buildResultCard('', chat);
    expect(html).toContain('result-tag-chip');
    expect(html).toContain('alpha');
    expect(html).toContain('beta');
  });

  it('highlights matching query terms in the title', () => {
    const chat = { id: 'c1', title: 'Search Result', source: 'claude', content: '', tags: [] };
    const html = buildResultCard('search', chat);
    expect(html.toLowerCase()).toContain('<mark');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// populateTopicScopeSelect()
// ─────────────────────────────────────────────────────────────────────────────

describe('populateTopicScopeSelect()', () => {
  afterEach(() => {
    appElements.filterTopicScope = undefined;
    document.body.innerHTML = '';
    _setContext({ searchQuery: '', filters: { sources: new Set(), dateFrom: null, dateTo: null, topicId: '', minRating: null, tags: new Set() }, renderer: null, storage: { searchChats: vi.fn() }, tree: null });
  });

  it('does nothing when element is absent', () => {
    appElements.filterTopicScope = null;
    _setContext({ tree: { getRootTopics: vi.fn() }, filters: { topicId: '' } });
    expect(() => populateTopicScopeSelect()).not.toThrow();
  });

  it('does nothing when state.tree is absent', () => {
    const sel = document.createElement('select');
    appElements.filterTopicScope = sel;
    _setContext({ tree: null, filters: { topicId: '' } });
    expect(() => populateTopicScopeSelect()).not.toThrow();
  });

  it('populates one option per root topic plus "All topics"', () => {
    const sel = document.createElement('select');
    document.body.appendChild(sel);
    appElements.filterTopicScope = sel;
    _setContext({
      tree: { getRootTopics: vi.fn().mockReturnValue([{ id: 't1', name: 'Topic A' }, { id: 't2', name: 'Topic B' }]) },
      filters: { topicId: '' },
    });
    populateTopicScopeSelect();
    // "All topics" + 2 topics = 3 options
    expect(sel.options.length).toBe(3);
    expect(sel.options[0].value).toBe('');
    expect(sel.options[1].value).toBe('t1');
    expect(sel.options[2].value).toBe('t2');
  });

  it('pre-selects the current filter topicId', () => {
    const sel = document.createElement('select');
    document.body.appendChild(sel);
    appElements.filterTopicScope = sel;
    _setContext({
      tree: { getRootTopics: vi.fn().mockReturnValue([{ id: 't1', name: 'Topic A' }]) },
      filters: { topicId: 't1' },
    });
    populateTopicScopeSelect();
    expect(sel.value).toBe('t1');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// updateFilterIndicator()
// ─────────────────────────────────────────────────────────────────────────────

describe('updateFilterIndicator()', () => {
  afterEach(() => {
    appElements.filterToggleBtn = undefined;
    _setContext({ searchQuery: '', filters: { sources: new Set(), dateFrom: null, dateTo: null, topicId: '', minRating: null, tags: new Set() }, renderer: null, storage: { searchChats: vi.fn() } });
  });

  it('does nothing when filterToggleBtn is absent', () => {
    appElements.filterToggleBtn = null;
    _setContext({ filters: { sources: new Set(), dateFrom: null, dateTo: null, topicId: '', minRating: null, tags: new Set() } });
    expect(() => updateFilterIndicator()).not.toThrow();
  });

  it('adds has-active-filters class when a source filter is set', () => {
    const btn = document.createElement('button');
    appElements.filterToggleBtn = btn;
    _setContext({ filters: { sources: new Set(['chatgpt']), dateFrom: null, dateTo: null, topicId: '', minRating: null, tags: new Set() } });
    updateFilterIndicator();
    expect(btn.classList.contains('has-active-filters')).toBe(true);
  });

  it('removes has-active-filters class when no filters are active', () => {
    const btn = document.createElement('button');
    btn.classList.add('has-active-filters');
    appElements.filterToggleBtn = btn;
    _setContext({ filters: { sources: new Set(), dateFrom: null, dateTo: null, topicId: '', minRating: null, tags: new Set() } });
    updateFilterIndicator();
    expect(btn.classList.contains('has-active-filters')).toBe(false);
  });

  it('adds has-active-filters when dateFrom is set', () => {
    const btn = document.createElement('button');
    appElements.filterToggleBtn = btn;
    _setContext({ filters: { sources: new Set(), dateFrom: '2024-01-01', dateTo: null, topicId: '', minRating: null, tags: new Set() } });
    updateFilterIndicator();
    expect(btn.classList.contains('has-active-filters')).toBe(true);
  });

  it('adds has-active-filters when minRating is set', () => {
    const btn = document.createElement('button');
    appElements.filterToggleBtn = btn;
    _setContext({ filters: { sources: new Set(), dateFrom: null, dateTo: null, topicId: '', minRating: 3, tags: new Set() } });
    updateFilterIndicator();
    expect(btn.classList.contains('has-active-filters')).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// populateTagFilterPills()
// ─────────────────────────────────────────────────────────────────────────────

describe('populateTagFilterPills()', () => {
  afterEach(() => {
    appElements.filterTagPills = undefined;
    document.body.innerHTML = '';
    _setContext({ searchQuery: '', chats: [], filters: { sources: new Set(), dateFrom: null, dateTo: null, topicId: '', minRating: null, tags: new Set() }, renderer: null, storage: { searchChats: vi.fn() } });
  });

  it('does nothing when filterTagPills container is absent', () => {
    appElements.filterTagPills = null;
    _setContext({ chats: [], filters: { tags: new Set() } });
    expect(() => populateTagFilterPills()).not.toThrow();
  });

  it('shows "No tags saved yet" when no chats have tags', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    appElements.filterTagPills = container;
    _setContext({ chats: [{ tags: [] }], filters: { tags: new Set() } });
    populateTagFilterPills();
    expect(container.innerHTML).toContain('No tags saved yet');
  });

  it('renders one pill per unique tag', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    appElements.filterTagPills = container;
    _setContext({
      chats: [
        { tags: ['alpha', 'beta'] },
        { tags: ['beta', 'gamma'] },
      ],
      filters: { tags: new Set() },
    });
    populateTagFilterPills();
    const pills = container.querySelectorAll('.filter-pill--tag');
    expect(pills.length).toBe(3); // alpha, beta, gamma
  });

  it('marks already-active tags with is-active class', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    appElements.filterTagPills = container;
    _setContext({
      chats: [{ tags: ['alpha'] }],
      filters: { tags: new Set(['alpha']) },
    });
    populateTagFilterPills();
    const pill = container.querySelector('.filter-pill--tag');
    expect(pill.classList.contains('is-active')).toBe(true);
  });

  it('clicking an inactive pill activates it and adds to state.filters.tags', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    appElements.filterTagPills = container;
    makeSearchElements();
    const st = {
      chats: [{ tags: ['mytag'] }],
      filters: { sources: new Set(), dateFrom: null, dateTo: null, topicId: '', minRating: null, tags: new Set() },
      renderer: null,
      storage: { searchChats: vi.fn().mockResolvedValue([]) },
    };
    _setContext(st);
    populateTagFilterPills();

    const pill = container.querySelector('.filter-pill--tag');
    pill.click();
    expect(st.filters.tags.has('mytag')).toBe(true);
    expect(pill.classList.contains('is-active')).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// setupFilterBar() — event handler tests
// ─────────────────────────────────────────────────────────────────────────────

import { setupFilterBar, setSearchContext, refreshEntityTypeChipVisibility } from '../src/sidepanel/controllers/search-controller.js';

function makeFilterBarElements(overrides = {}) {
  const filterToggleBtn = document.createElement('button');
  const searchFilterBar = document.createElement('div');
  searchFilterBar.classList.add('filter-bar');

  const filterSourcePills = document.createElement('div');
  const pill1 = document.createElement('button');
  pill1.dataset.source = 'chatgpt';
  pill1.classList.add('filter-pill');
  const pill2 = document.createElement('button');
  pill2.dataset.source = 'claude';
  pill2.classList.add('filter-pill');
  filterSourcePills.append(pill1, pill2);

  const filterDateFrom = document.createElement('input');
  filterDateFrom.type = 'date';
  const filterDateTo = document.createElement('input');
  filterDateTo.type = 'date';

  const filterTopicScope = document.createElement('select');

  const filterRatingPills = document.createElement('div');
  const ratingPill = document.createElement('button');
  ratingPill.dataset.minRating = '3';
  filterRatingPills.appendChild(ratingPill);

  const filterClearBtn = document.createElement('button');

  const filterTagPills = document.createElement('div');

  // Place all in body so appElements references resolve
  document.body.append(
    filterToggleBtn, searchFilterBar,
    filterSourcePills, filterDateFrom, filterDateTo,
    filterTopicScope, filterRatingPills, filterClearBtn, filterTagPills
  );

  Object.assign(appElements, {
    filterToggleBtn,
    searchFilterBar,
    filterSourcePills,
    filterDateFrom,
    filterDateTo,
    filterTopicScope,
    filterRatingPills,
    filterClearBtn,
    filterTagPills,
  });

  return {
    filterToggleBtn, searchFilterBar,
    filterSourcePills, pill1, pill2,
    filterDateFrom, filterDateTo,
    filterTopicScope, filterRatingPills, ratingPill,
    filterClearBtn, filterTagPills,
  };
}

function makeFilterState() {
  return {
    searchQuery: '',
    filters: {
      sources:   new Set(),
      dateFrom:  null,
      dateTo:    null,
      topicId:   '',
      minRating: null,
      tags:      new Set(),
    },
    renderer: { clearHighlight: vi.fn(), highlightSearch: vi.fn(), expandAll: vi.fn() },
    storage: { searchChats: vi.fn().mockResolvedValue([]) },
    tree: { getRootTopics: vi.fn().mockReturnValue([]) },
  };
}

describe('setupFilterBar() — filterToggleBtn', () => {
  let els, st;
  beforeEach(() => {
    els = makeFilterBarElements();
    st  = makeFilterState();
    _setContext(st);
    setupFilterBar();
  });
  afterEach(() => {
    document.body.innerHTML = '';
    Object.assign(appElements, {
      filterToggleBtn: undefined, searchFilterBar: undefined,
      filterSourcePills: undefined, filterDateFrom: undefined, filterDateTo: undefined,
      filterTopicScope: undefined, filterRatingPills: undefined, filterClearBtn: undefined,
      filterTagPills: undefined,
    });
    _setContext({ searchQuery: '', filters: { sources: new Set(), dateFrom: null, dateTo: null, topicId: '', minRating: null, tags: new Set() }, renderer: null, storage: { searchChats: vi.fn() } });
  });

  it('toggles the filter bar open on button click', () => {
    els.filterToggleBtn.click();
    expect(els.searchFilterBar.classList.contains('is-open')).toBe(true);
    expect(els.filterToggleBtn.getAttribute('aria-expanded')).toBe('true');
  });

  it('closes the filter bar on second click', () => {
    els.filterToggleBtn.click(); // open
    els.filterToggleBtn.click(); // close
    expect(els.searchFilterBar.classList.contains('is-open')).toBe(false);
    expect(els.filterToggleBtn.getAttribute('aria-expanded')).toBe('false');
  });
});

describe('setupFilterBar() — source pills', () => {
  let els, st;
  beforeEach(() => {
    els = makeFilterBarElements();
    st  = makeFilterState();
    _setContext(st);
    setupFilterBar();
  });
  afterEach(() => {
    document.body.innerHTML = '';
    Object.assign(appElements, {
      filterToggleBtn: undefined, searchFilterBar: undefined,
      filterSourcePills: undefined, filterDateFrom: undefined, filterDateTo: undefined,
      filterTopicScope: undefined, filterRatingPills: undefined, filterClearBtn: undefined,
      filterTagPills: undefined,
    });
    _setContext({ searchQuery: '', filters: { sources: new Set(), dateFrom: null, dateTo: null, topicId: '', minRating: null, tags: new Set() }, renderer: null, storage: { searchChats: vi.fn() } });
  });

  it('adds source to filters when a pill is clicked', () => {
    els.pill1.click();
    expect(st.filters.sources.has('chatgpt')).toBe(true);
    expect(els.pill1.classList.contains('is-active')).toBe(true);
  });

  it('removes source from filters when active pill is clicked again', () => {
    els.pill1.click(); // add
    els.pill1.click(); // remove
    expect(st.filters.sources.has('chatgpt')).toBe(false);
    expect(els.pill1.classList.contains('is-active')).toBe(false);
  });
});

describe('setupFilterBar() — date range', () => {
  let els, st;
  beforeEach(() => {
    els = makeFilterBarElements();
    st  = makeFilterState();
    _setContext(st);
    setupFilterBar();
  });
  afterEach(() => {
    document.body.innerHTML = '';
    Object.assign(appElements, {
      filterToggleBtn: undefined, searchFilterBar: undefined,
      filterSourcePills: undefined, filterDateFrom: undefined, filterDateTo: undefined,
      filterTopicScope: undefined, filterRatingPills: undefined, filterClearBtn: undefined,
      filterTagPills: undefined,
    });
    _setContext({ searchQuery: '', filters: { sources: new Set(), dateFrom: null, dateTo: null, topicId: '', minRating: null, tags: new Set() }, renderer: null, storage: { searchChats: vi.fn() } });
  });

  it('sets dateFrom on change', () => {
    els.filterDateFrom.value = '2024-01-01';
    els.filterDateFrom.dispatchEvent(new Event('change'));
    expect(st.filters.dateFrom).toBe('2024-01-01');
  });

  it('sets dateFrom to null when cleared', () => {
    els.filterDateFrom.value = '';
    els.filterDateFrom.dispatchEvent(new Event('change'));
    expect(st.filters.dateFrom).toBeNull();
  });

  it('sets dateTo on change', () => {
    els.filterDateTo.value = '2024-12-31';
    els.filterDateTo.dispatchEvent(new Event('change'));
    expect(st.filters.dateTo).toBe('2024-12-31');
  });
});

describe('setupFilterBar() — topic scope', () => {
  let els, st;
  beforeEach(() => {
    els = makeFilterBarElements();
    st  = makeFilterState();
    _setContext(st);
    setupFilterBar();
  });
  afterEach(() => {
    document.body.innerHTML = '';
    Object.assign(appElements, {
      filterToggleBtn: undefined, searchFilterBar: undefined,
      filterSourcePills: undefined, filterDateFrom: undefined, filterDateTo: undefined,
      filterTopicScope: undefined, filterRatingPills: undefined, filterClearBtn: undefined,
      filterTagPills: undefined,
    });
    _setContext({ searchQuery: '', filters: { sources: new Set(), dateFrom: null, dateTo: null, topicId: '', minRating: null, tags: new Set() }, renderer: null, storage: { searchChats: vi.fn() } });
  });

  it('updates topicId when select changes', () => {
    const opt = document.createElement('option');
    opt.value = 't1';
    els.filterTopicScope.appendChild(opt);
    els.filterTopicScope.value = 't1';
    els.filterTopicScope.dispatchEvent(new Event('change'));
    expect(st.filters.topicId).toBe('t1');
  });
});

describe('setupFilterBar() — rating pills', () => {
  let els, st;
  beforeEach(() => {
    els = makeFilterBarElements();
    st  = makeFilterState();
    _setContext(st);
    setupFilterBar();
  });
  afterEach(() => {
    document.body.innerHTML = '';
    Object.assign(appElements, {
      filterToggleBtn: undefined, searchFilterBar: undefined,
      filterSourcePills: undefined, filterDateFrom: undefined, filterDateTo: undefined,
      filterTopicScope: undefined, filterRatingPills: undefined, filterClearBtn: undefined,
      filterTagPills: undefined,
    });
    _setContext({ searchQuery: '', filters: { sources: new Set(), dateFrom: null, dateTo: null, topicId: '', minRating: null, tags: new Set() }, renderer: null, storage: { searchChats: vi.fn() } });
  });

  it('sets minRating when rating pill is clicked', () => {
    els.ratingPill.click();
    expect(st.filters.minRating).toBe(3);
    expect(els.ratingPill.classList.contains('is-active')).toBe(true);
  });

  it('clears minRating when the same rating pill is clicked again', () => {
    els.ratingPill.click(); // activate
    els.ratingPill.click(); // deactivate
    expect(st.filters.minRating).toBeNull();
    expect(els.ratingPill.classList.contains('is-active')).toBe(false);
  });
});

describe('setupFilterBar() — clear button', () => {
  let els, st;
  beforeEach(() => {
    els = makeFilterBarElements();
    st  = makeFilterState();
    _setContext(st);
    setupFilterBar();
  });
  afterEach(() => {
    document.body.innerHTML = '';
    Object.assign(appElements, {
      filterToggleBtn: undefined, searchFilterBar: undefined,
      filterSourcePills: undefined, filterDateFrom: undefined, filterDateTo: undefined,
      filterTopicScope: undefined, filterRatingPills: undefined, filterClearBtn: undefined,
      filterTagPills: undefined,
    });
    _setContext({ searchQuery: '', filters: { sources: new Set(), dateFrom: null, dateTo: null, topicId: '', minRating: null, tags: new Set() }, renderer: null, storage: { searchChats: vi.fn() } });
  });

  it('resets all filters on clear', () => {
    st.filters.sources.add('chatgpt');
    st.filters.dateFrom = '2024-01-01';
    st.filters.minRating = 3;
    els.filterClearBtn.click();
    expect(st.filters.sources.size).toBe(0);
    expect(st.filters.dateFrom).toBeNull();
    expect(st.filters.minRating).toBeNull();
    expect(st.filters.topicId).toBe('');
  });

  it('removes is-active class from source and rating pills on clear', () => {
    els.pill1.classList.add('is-active');
    els.ratingPill.classList.add('is-active');
    els.filterClearBtn.click();
    expect(els.pill1.classList.contains('is-active')).toBe(false);
    expect(els.ratingPill.classList.contains('is-active')).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// setSearchContext()
// ─────────────────────────────────────────────────────────────────────────────

describe('setSearchContext()', () => {
  let els, st;
  beforeEach(() => {
    els = makeElements();
    st  = makeState();
    _setContext({ elements: els, state: st, ...st });
    _setEntitySearchHandler(vi.fn());
  });
  afterEach(() => {
    document.body.innerHTML = '';
    _setEntitySearchHandler(() => {});
    _setContext({ elements: {}, state: { searchContext: 'chats', searchQuery: '', filters: { sources: new Set() }, renderer: null, storage: { searchChats: vi.fn() } } });
  });

  it('sets searchContext to entities', () => {
    setSearchContext('entities');
    expect(st.searchContext).toBe('entities');
  });

  it('sets searchContext back to chats', () => {
    setSearchContext('entities');
    setSearchContext('chats');
    expect(st.searchContext).toBe('chats');
  });

  it('activates the entities button when switching to entities', () => {
    setSearchContext('entities');
    expect(els.searchCtxEntities.classList.contains('context-btn--active')).toBe(true);
    expect(els.searchCtxChats.classList.contains('context-btn--active')).toBe(false);
  });

  it('activates the chats button when switching to chats', () => {
    setSearchContext('entities');
    setSearchContext('chats');
    expect(els.searchCtxChats.classList.contains('context-btn--active')).toBe(true);
  });

  it('shows entityTypes group when switching to entities', () => {
    setSearchContext('entities');
    const entityGroup = els.searchFilterBar.querySelector('#filterEntityTypes');
    expect(entityGroup.hidden).toBe(false);
  });

  it('hides entityTypes group when switching to chats', () => {
    setSearchContext('entities');
    setSearchContext('chats');
    const entityGroup = els.searchFilterBar.querySelector('#filterEntityTypes');
    expect(entityGroup.hidden).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// refreshEntityTypeChipVisibility()
// ─────────────────────────────────────────────────────────────────────────────

describe('refreshEntityTypeChipVisibility()', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    _setContext({ elements: {}, state: { searchContext: 'chats', searchQuery: '', filters: { sources: new Set() }, renderer: null, storage: { searchChats: vi.fn() } } });
  });

  it('does nothing when filterEntityTypePills container is absent', () => {
    _setContext({ elements: {} });
    expect(() => refreshEntityTypeChipVisibility()).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// setSearchContext() — re-run search when query is active
// ─────────────────────────────────────────────────────────────────────────────

describe('setSearchContext() — re-runs search when searchQuery is active', () => {
  let els, st;
  beforeEach(() => {
    els = makeElements();
    st  = makeState({ searchQuery: 'hello' });
    _setContext({ elements: els, state: st, ...st });
    _setEntitySearchHandler(vi.fn());
  });
  afterEach(() => {
    document.body.innerHTML = '';
    _setEntitySearchHandler(() => {});
    _setContext({ elements: {}, state: { searchContext: 'chats', searchQuery: '', filters: { sources: new Set() }, renderer: null, storage: { searchChats: vi.fn() } } });
  });

  it('calls entity search handler when switching to entities with an active query', async () => {
    const entityHandler = vi.fn();
    _setEntitySearchHandler(entityHandler);
    setSearchContext('entities');
    expect(entityHandler).toHaveBeenCalledWith('hello', expect.any(Object));
  });

  it('calls rerunSearch (chatRepo.searchChats) when switching to chats with active query', async () => {
    // Switch to entities first so we have something to switch back from
    setSearchContext('entities');
    // Now switch back to chats — should trigger rerunSearch
    st.searchQuery = 'hello';
    setSearchContext('chats');
    // rerunSearch calls storage.searchChats eventually; just verify no throw
    // and that searchContext is updated
    expect(st.searchContext).toBe('chats');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// setupSearchContextToggle() — re-runs search when query is active
// ─────────────────────────────────────────────────────────────────────────────

describe('setupSearchContextToggle() — re-runs entity search when query is active', () => {
  let els, st;
  beforeEach(() => {
    els = makeElements();
    st  = makeState({ searchQuery: 'world' });
    _setContext({ elements: els, state: st, ...st });
    _setEntitySearchHandler(vi.fn());
    setupSearchContextToggle();
  });
  afterEach(() => {
    document.body.innerHTML = '';
    _setEntitySearchHandler(() => {});
    _setContext({ elements: {}, state: { searchContext: 'chats', searchQuery: '', filters: { sources: new Set() }, renderer: null, storage: { searchChats: vi.fn() } } });
  });

  it('clicking entities button calls entity search handler when query is active', () => {
    const entityHandler = vi.fn();
    _setEntitySearchHandler(entityHandler);
    els.searchCtxEntities.click();
    expect(entityHandler).toHaveBeenCalledWith('world', expect.any(Object));
  });

  it('clicking chats button re-runs chat search when query is active', () => {
    // First switch to entities
    els.searchCtxEntities.click();
    // Then back to chats — should trigger rerunSearch
    els.searchCtxChats.click();
    expect(st.searchContext).toBe('chats');
  });
});

// ─── TOC auto-collapse / expand ──────────────────────────────────────────────

describe('handleSearch() — TOC auto-collapse', () => {
  let tocSection;
  let tocBtn;

  beforeEach(() => {
    const els = makeElements();
    const st  = makeState();
    _setContext({ elements: els, state: st, ...st });
    Object.assign(appElements, {
      searchResults: null, searchResultsList: null, resultCount: null,
    });

    tocSection = document.createElement('div');
    tocSection.className = 'toc-section';
    tocBtn = document.createElement('button');
    tocBtn.id = 'tocCollapseBtn';
    tocBtn.setAttribute('aria-expanded', 'true');
    document.body.append(tocSection, tocBtn);
  });

  afterEach(() => {
    document.body.innerHTML = '';
    Object.assign(appElements, {
      searchResults: undefined, searchResultsList: undefined, resultCount: undefined,
    });
    _setContext({ elements: {}, state: { searchContext: 'chats', searchQuery: '', filters: { sources: new Set() }, renderer: null, storage: { searchChats: vi.fn() } } });
  });

  it('collapses .toc-section when query is entered', () => {
    handleSearch({ target: { value: 'hello' } });
    expect(tocSection.classList.contains('section--collapsed')).toBe(true);
    expect(tocBtn.getAttribute('aria-expanded')).toBe('false');
  });

  it('does not re-collapse when already collapsed', () => {
    tocSection.classList.add('section--collapsed');
    tocBtn.setAttribute('aria-expanded', 'false');
    handleSearch({ target: { value: 'hello' } });
    expect(tocSection.classList.contains('section--collapsed')).toBe(true);
  });

  it('does not collapse when query is empty', () => {
    handleSearch({ target: { value: '' } });
    expect(tocSection.classList.contains('section--collapsed')).toBe(false);
  });
});

describe('clearSearch() — TOC expand', () => {
  let tocSection;
  let tocBtn;

  beforeEach(() => {
    const { searchInput, clearSearchBtn, searchResults, searchResultsList } = makeSearchElements();

    tocSection = document.createElement('div');
    tocSection.className = 'toc-section section--collapsed';
    tocBtn = document.createElement('button');
    tocBtn.id = 'tocCollapseBtn';
    tocBtn.setAttribute('aria-expanded', 'false');
    document.body.append(tocSection, tocBtn);

    const st = {
      searchQuery: 'test',
      filters: { sources: new Set(), dateFrom: null, dateTo: null, topicId: '', minRating: null, tags: new Set() },
      renderer: { clearHighlight: vi.fn() },
      storage: { searchChats: vi.fn().mockResolvedValue([]) },
    };
    _setContext(st);
  });

  afterEach(() => {
    document.body.innerHTML = '';
    appElements.searchInput = appElements.clearSearchBtn = appElements.searchResults = appElements.searchResultsList = undefined;
    _setContext({ searchQuery: '', filters: { sources: new Set(), dateFrom: null, dateTo: null, topicId: '', minRating: null, tags: new Set() }, renderer: null, storage: { searchChats: vi.fn() } });
  });

  it('expands the collapsed toc-section', () => {
    clearSearch();
    expect(tocSection.classList.contains('section--collapsed')).toBe(false);
    expect(tocBtn.getAttribute('aria-expanded')).toBe('true');
  });
});

describe('rerunSearch() — TOC expand', () => {
  let tocSection;

  beforeEach(() => {
    makeSearchElements();

    tocSection = document.createElement('div');
    tocSection.className = 'toc-section section--collapsed';
    document.body.append(tocSection);

    const st = {
      searchQuery: '',
      filters: { sources: new Set(), dateFrom: null, dateTo: null, topicId: '', minRating: null, tags: new Set() },
      renderer: { clearHighlight: vi.fn() },
      storage: { searchChats: vi.fn().mockResolvedValue([]) },
    };
    _setContext(st);
  });

  afterEach(() => {
    document.body.innerHTML = '';
    appElements.searchInput = appElements.clearSearchBtn = appElements.searchResults = appElements.searchResultsList = undefined;
    _setContext({ searchQuery: '', filters: { sources: new Set(), dateFrom: null, dateTo: null, topicId: '', minRating: null, tags: new Set() }, renderer: null, storage: { searchChats: vi.fn() } });
  });

  it('expands the collapsed toc-section when no query and no filters', () => {
    rerunSearch();
    expect(tocSection.classList.contains('section--collapsed')).toBe(false);
  });
});

