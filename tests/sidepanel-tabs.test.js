/**
 * sidepanel-tabs.test.js
 *
 * Tests for the two-tab panel switching logic introduced in Task 0.7.
 * Self-contained: defines switchTab locally (same logic as sidepanel.js) to
 * avoid module-load side effects from the sidepanel.js bootstrap script.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Local mirror of the switchTab function (same logic as sidepanel.js)
// accepts an optional setSearchContext spy so tests can verify the auto-switch.
// ---------------------------------------------------------------------------

function switchTab(tab, elements, state, setSearchContext = () => {}) {
  state.activeTab = tab;
  const isEntities = tab === 'entities';

  if (elements.sessionPanel) elements.sessionPanel.hidden = isEntities;
  if (elements.entityPanel)  elements.entityPanel.hidden  = !isEntities;

  if (elements.tabChatSessions) {
    elements.tabChatSessions.setAttribute('aria-selected', String(!isEntities));
    elements.tabChatSessions.classList.toggle('panel-tab--active', !isEntities);
  }
  if (elements.tabChatEntities) {
    elements.tabChatEntities.setAttribute('aria-selected', String(isEntities));
    elements.tabChatEntities.classList.toggle('panel-tab--active', isEntities);
  }

  // Sync search-context toggle with the active tab
  setSearchContext(isEntities ? 'entities' : 'chats');
}

// ---------------------------------------------------------------------------
// DOM setup helpers
// ---------------------------------------------------------------------------

function buildElements() {
  const tabChatSessions = document.createElement('button');
  tabChatSessions.id = 'tabChatSessions';
  tabChatSessions.setAttribute('aria-selected', 'true');
  tabChatSessions.classList.add('panel-tab', 'panel-tab--active');

  const tabChatEntities = document.createElement('button');
  tabChatEntities.id = 'tabChatEntities';
  tabChatEntities.setAttribute('aria-selected', 'false');
  tabChatEntities.classList.add('panel-tab');

  const sessionPanel = document.createElement('div');
  sessionPanel.id = 'sessionPanel';

  const entityPanel = document.createElement('div');
  entityPanel.id = 'entityPanel';
  entityPanel.hidden = true;

  document.body.append(tabChatSessions, tabChatEntities, sessionPanel, entityPanel);

  return { tabChatSessions, tabChatEntities, sessionPanel, entityPanel };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('switchTab() — panel visibility', () => {
  let elements;
  let state;

  beforeEach(() => {
    elements = buildElements();
    state = { activeTab: 'sessions' };
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('clicking entity tab hides session panel', () => {
    switchTab('entities', elements, state);
    expect(elements.sessionPanel.hidden).toBe(true);
  });

  it('clicking entity tab shows entity panel', () => {
    switchTab('entities', elements, state);
    expect(elements.entityPanel.hidden).toBe(false);
  });

  it('clicking sessions tab shows session panel', () => {
    switchTab('entities', elements, state);
    switchTab('sessions', elements, state);
    expect(elements.sessionPanel.hidden).toBe(false);
  });

  it('clicking sessions tab hides entity panel', () => {
    switchTab('entities', elements, state);
    switchTab('sessions', elements, state);
    expect(elements.entityPanel.hidden).toBe(true);
  });

  it('updates state.activeTab', () => {
    switchTab('entities', elements, state);
    expect(state.activeTab).toBe('entities');
    switchTab('sessions', elements, state);
    expect(state.activeTab).toBe('sessions');
  });
});

describe('switchTab() — aria-selected attributes', () => {
  let elements;
  let state;

  beforeEach(() => {
    elements = buildElements();
    state = { activeTab: 'sessions' };
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('switching to entities sets aria-selected="true" on entity tab', () => {
    switchTab('entities', elements, state);
    expect(elements.tabChatEntities.getAttribute('aria-selected')).toBe('true');
  });

  it('switching to entities sets aria-selected="false" on sessions tab', () => {
    switchTab('entities', elements, state);
    expect(elements.tabChatSessions.getAttribute('aria-selected')).toBe('false');
  });

  it('switching back to sessions restores aria-selected correctly', () => {
    switchTab('entities', elements, state);
    switchTab('sessions', elements, state);
    expect(elements.tabChatSessions.getAttribute('aria-selected')).toBe('true');
    expect(elements.tabChatEntities.getAttribute('aria-selected')).toBe('false');
  });

  it('panel-tab--active class follows active tab', () => {
    switchTab('entities', elements, state);
    expect(elements.tabChatEntities.classList.contains('panel-tab--active')).toBe(true);
    expect(elements.tabChatSessions.classList.contains('panel-tab--active')).toBe(false);

    switchTab('sessions', elements, state);
    expect(elements.tabChatSessions.classList.contains('panel-tab--active')).toBe(true);
    expect(elements.tabChatEntities.classList.contains('panel-tab--active')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Auto search-context sync
// ---------------------------------------------------------------------------

describe('switchTab() — automatic search-context sync', () => {
  let elements;
  let state;

  beforeEach(() => {
    elements = buildElements();
    state = { activeTab: 'sessions' };
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('switching to entities tab calls setSearchContext("entities")', () => {
    const setSearchContext = vi.fn();
    switchTab('entities', elements, state, setSearchContext);
    expect(setSearchContext).toHaveBeenCalledWith('entities');
  });

  it('switching to sessions tab calls setSearchContext("chats")', () => {
    const setSearchContext = vi.fn();
    switchTab('sessions', elements, state, setSearchContext);
    expect(setSearchContext).toHaveBeenCalledWith('chats');
  });

  it('setSearchContext is called on every tab switch', () => {
    const setSearchContext = vi.fn();
    switchTab('entities', elements, state, setSearchContext);
    switchTab('sessions', elements, state, setSearchContext);
    switchTab('entities', elements, state, setSearchContext);
    expect(setSearchContext).toHaveBeenCalledTimes(3);
    expect(setSearchContext).toHaveBeenNthCalledWith(1, 'entities');
    expect(setSearchContext).toHaveBeenNthCalledWith(2, 'chats');
    expect(setSearchContext).toHaveBeenNthCalledWith(3, 'entities');
  });
});
