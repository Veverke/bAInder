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
