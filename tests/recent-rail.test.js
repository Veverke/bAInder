/**
 * Tests for src/sidepanel/features/recent-rail.js
 *
 * The rail now uses CSS overflow-x scrolling instead of JS overflow detection.
 * Threshold lowered to 1 chat (was 3). The `isOverflowing` parameter was removed.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { updateRecentRail, _setContext } from '../src/sidepanel/features/recent-rail.js';
import { state } from '../src/sidepanel/app-context.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal chat metadata object. */
function chat(overrides = {}) {
  return {
    id:        overrides.id        ?? 'chat_1',
    title:     overrides.title     ?? 'Test Chat',
    source:    overrides.source    ?? 'chatgpt',
    timestamp: overrides.timestamp ?? 1000,
    savedAt:   overrides.savedAt   ?? undefined,
    ...overrides,
  };
}

/** Create a minimal rail element and attach it to document.body. */
function makeRail() {
  const rail = document.createElement('div');
  rail.id = 'recentRail';
  document.body.appendChild(rail);
  return rail;
}

function removeRail() {
  const el = document.getElementById('recentRail');
  if (el) el.remove();
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  removeRail();
  state.chats = [];
});

// ---------------------------------------------------------------------------
// Guard â€” no rail element
// ---------------------------------------------------------------------------

describe('updateRecentRail() â€” no rail element', () => {
  it('returns without throwing when #recentRail does not exist', () => {
    state.chats = [chat({ id: 'c1' })];
    expect(() => updateRecentRail()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Empty state â†’ hidden
// ---------------------------------------------------------------------------

describe('updateRecentRail() â€” empty state', () => {
  it('hides the rail when state.chats is empty', () => {
    const rail = makeRail();
    updateRecentRail();
    expect(rail.style.display).toBe('none');
  });

  it('hides the rail when chats lack both savedAt and timestamp', () => {
    const rail = makeRail();
    state.chats = [
      { id: 'c1', title: 'A', source: 'chatgpt' },
      { id: 'c2', title: 'B', source: 'chatgpt' },
    ];
    updateRecentRail();
    expect(rail.style.display).toBe('none');
  });
});

// ---------------------------------------------------------------------------
// Threshold â€” 1+ chats â†’ rail visible
// ---------------------------------------------------------------------------

describe('updateRecentRail() â€” threshold: show at â‰¥1 chat', () => {
  it('shows the rail when only 1 chat is present', () => {
    const rail = makeRail();
    state.chats = [chat({ id: 'c1', timestamp: 1 })];
    updateRecentRail();
    expect(rail.style.display).toBe('flex');
  });

  it('shows the rail when only 2 chats are present', () => {
    const rail = makeRail();
    state.chats = [chat({ id: 'c1', timestamp: 2 }), chat({ id: 'c2', timestamp: 1 })];
    updateRecentRail();
    expect(rail.style.display).toBe('flex');
  });

  it('shows the rail when 3 or more chats are present', () => {
    const rail = makeRail();
    state.chats = [
      chat({ id: 'c1', timestamp: 3 }),
      chat({ id: 'c2', timestamp: 2 }),
      chat({ id: 'c3', timestamp: 1 }),
    ];
    updateRecentRail();
    expect(rail.style.display).toBe('flex');
  });
});

// ---------------------------------------------------------------------------
// 1+ chats â†’ rail is populated
// ---------------------------------------------------------------------------

describe('updateRecentRail() â€” chip rendering', () => {
  it('renders a "Recent" label as first child', () => {
    const rail = makeRail();
    state.chats = [chat({ id: 'c1', timestamp: 1 })];
    updateRecentRail();
    expect(rail.firstChild.textContent).toBe('Recent');
    expect(rail.firstChild.className).toBe('recent-rail__label');
  });

  it('renders one chip per chat (up to 8)', () => {
    const rail = makeRail();
    state.chats = Array.from({ length: 5 }, (_, i) =>
      chat({ id: `c${i}`, timestamp: i + 1 })
    );
    updateRecentRail();
    const chips = rail.querySelectorAll('.recent-chip');
    expect(chips).toHaveLength(5);
  });

  it('caps at 8 chips even when more chats exist', () => {
    const rail = makeRail();
    state.chats = Array.from({ length: 20 }, (_, i) =>
      chat({ id: `c${i}`, timestamp: i + 1 })
    );
    updateRecentRail();
    const chips = rail.querySelectorAll('.recent-chip');
    expect(chips).toHaveLength(8);
  });

  it('sorts chips most-recent first (via timestamp)', () => {
    const rail = makeRail();
    state.chats = [
      chat({ id: 'c1', title: 'Oldest',  timestamp: 100 }),
      chat({ id: 'c2', title: 'Newest',  timestamp: 300 }),
      chat({ id: 'c3', title: 'Middle',  timestamp: 200 }),
    ];
    updateRecentRail();
    const titles = [...rail.querySelectorAll('.recent-chip__title')].map(el => el.textContent);
    expect(titles[0]).toBe('Newest');
    expect(titles[1]).toBe('Middle');
    expect(titles[2]).toBe('Oldest');
  });

  it('uses savedAt over timestamp when both present for sorting', () => {
    const rail = makeRail();
    state.chats = [
      chat({ id: 'c1', title: 'First',  timestamp: 1000, savedAt: 5000 }),
      chat({ id: 'c2', title: 'Second', timestamp: 9000, savedAt: 1000 }),
      chat({ id: 'c3', title: 'Third',  timestamp: 500,  savedAt: 3000 }),
    ];
    updateRecentRail();
    const titles = [...rail.querySelectorAll('.recent-chip__title')].map(el => el.textContent);
    expect(titles).toEqual(['First', 'Third', 'Second']);
  });

  it('chip title attribute and text are set to the chat title', () => {
    const rail = makeRail();
    state.chats = [chat({ id: 'c1', title: 'Alpha', timestamp: 1 })];
    updateRecentRail();
    const chip = rail.querySelector('.recent-chip');
    expect(chip.title).toBe('Alpha');
    expect(chip.querySelector('.recent-chip__title').textContent).toBe('Alpha');
  });

  it('falls back to "Untitled" when title is missing', () => {
    const rail = makeRail();
    state.chats = [{ id: 'c1', source: 'chatgpt', timestamp: 1 }];
    updateRecentRail();
    const chip = rail.querySelector('.recent-chip');
    expect(chip.title).toBe('Untitled');
    expect(chip.querySelector('.recent-chip__title').textContent).toBe('Untitled');
  });

  it('adds source class to the dot element', () => {
    const rail = makeRail();
    state.chats = [
      chat({ id: 'c1', source: 'claude',  timestamp: 3 }),
      chat({ id: 'c2', source: 'gemini',  timestamp: 2 }),
      chat({ id: 'c3', source: 'chatgpt', timestamp: 1 }),
    ];
    updateRecentRail();
    const dots = [...rail.querySelectorAll('.recent-chip__dot')];
    expect(dots[0].className).toContain('recent-chip__dot--claude');
    expect(dots[1].className).toContain('recent-chip__dot--gemini');
    expect(dots[2].className).toContain('recent-chip__dot--chatgpt');
  });

  it('falls back to "unknown" source class when source is missing', () => {
    const rail = makeRail();
    state.chats = [{ id: 'c1', title: 'A', timestamp: 1 }];
    updateRecentRail();
    const dot = rail.querySelector('.recent-chip__dot');
    expect(dot.className).toContain('recent-chip__dot--unknown');
  });

  it('calls the click handler with the chat object when a chip is clicked', () => {
    const rail = makeRail();
    const c1 = chat({ id: 'c1', title: 'Clicky', timestamp: 1 });
    state.chats = [c1];
    const handler = vi.fn();
    updateRecentRail(handler);
    const chip = rail.querySelector('.recent-chip');
    chip.click();
    expect(handler).toHaveBeenCalledWith(c1);
  });
});

// ---------------------------------------------------------------------------
// Sorting: re-run with explicit title-as-id pattern
// ---------------------------------------------------------------------------

describe('updateRecentRail() â€” sort order', () => {
  it('renders chips in descending recency order', () => {
    const rail = makeRail();
    state.chats = [
      chat({ id: 'c1', title: 'Oldest',  timestamp: 100 }),
      chat({ id: 'c2', title: 'Newest',  timestamp: 300 }),
      chat({ id: 'c3', title: 'Middle',  timestamp: 200 }),
    ];
    updateRecentRail();
    const titles = [...rail.querySelectorAll('.recent-chip__title')].map(el => el.textContent);
    expect(titles).toEqual(['Newest', 'Middle', 'Oldest']);
  });
});

// ---------------------------------------------------------------------------
// _setContext injection hook
// ---------------------------------------------------------------------------

describe('_setContext() â€” test injection hook', () => {
  it('replaces the internal state reference so updateRecentRail uses the injected context', () => {
    const mockRail = makeRail();
    const mockCtx = { chats: [chat({ id: 'injected', timestamp: 1 })] };
    _setContext(mockCtx);
    updateRecentRail();
    expect(mockRail.children.length).toBeGreaterThan(0);
    // Restore real state
    _setContext(state);
  });
});

// ---------------------------------------------------------------------------
// Default onChatClick parameter â€” invoke the default no-op via chip click
// ---------------------------------------------------------------------------

describe('updateRecentRail() â€” default onChatClick invocation', () => {
  it('invokes the default no-op onChatClick when a chip is clicked with no handler supplied', () => {
    const rail = makeRail();
    state.chats = [chat({ id: 'd1', timestamp: 1 })];
    // Call with NO arguments â€” onChatClick defaults to () => {}
    updateRecentRail();
    const firstChip = rail.querySelector('.recent-chip');
    expect(firstChip).not.toBeNull();
    expect(() => firstChip.click()).not.toThrow();
  });
});
