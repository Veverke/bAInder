/**
 * Tests for src/sidepanel/features/recent-rail.js
 *
 * The overflow detection (`rail.scrollWidth > rail.clientWidth`) is extracted
 * into an injectable `isOverflowing` parameter so jsdom's always-zero layout
 * metrics do not block test coverage of that branch.
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
// Guard — no rail element
// ---------------------------------------------------------------------------

describe('updateRecentRail() — no rail element', () => {
  it('returns without throwing when #recentRail does not exist', () => {
    state.chats = [chat({ id: 'c1' }), chat({ id: 'c2' }), chat({ id: 'c3' })];
    expect(() => updateRecentRail()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Fewer than 3 chats → hidden
// ---------------------------------------------------------------------------

describe('updateRecentRail() — fewer than 3 chats', () => {
  it('hides the rail when state.chats is empty', () => {
    const rail = makeRail();
    updateRecentRail();
    expect(rail.style.display).toBe('none');
  });

  it('hides the rail when only 1 chat is present', () => {
    const rail = makeRail();
    state.chats = [chat({ id: 'c1' })];
    updateRecentRail();
    expect(rail.style.display).toBe('none');
  });

  it('hides the rail when only 2 chats are present', () => {
    const rail = makeRail();
    state.chats = [chat({ id: 'c1' }), chat({ id: 'c2' })];
    updateRecentRail();
    expect(rail.style.display).toBe('none');
  });

  it('hides the rail when chats lack both savedAt and timestamp', () => {
    const rail = makeRail();
    state.chats = [
      { id: 'c1', title: 'A', source: 'chatgpt' },
      { id: 'c2', title: 'B', source: 'chatgpt' },
      { id: 'c3', title: 'C', source: 'chatgpt' },
    ];
    updateRecentRail();
    expect(rail.style.display).toBe('none');
  });
});

// ---------------------------------------------------------------------------
// 3+ chats → rail is populated
// ---------------------------------------------------------------------------

describe('updateRecentRail() — 3+ chats, no overflow', () => {
  it('sets display to flex when 3 chats are present', () => {
    const rail = makeRail();
    state.chats = [
      chat({ id: 'c1', timestamp: 3 }),
      chat({ id: 'c2', timestamp: 2 }),
      chat({ id: 'c3', timestamp: 1 }),
    ];
    updateRecentRail(() => {}, () => false);
    expect(rail.style.display).toBe('flex');
  });

  it('renders a "Recent" label as first child', () => {
    const rail = makeRail();
    state.chats = [
      chat({ id: 'c1', timestamp: 3 }),
      chat({ id: 'c2', timestamp: 2 }),
      chat({ id: 'c3', timestamp: 1 }),
    ];
    updateRecentRail(() => {}, () => false);
    expect(rail.firstChild.textContent).toBe('Recent');
    expect(rail.firstChild.className).toBe('recent-rail__label');
  });

  it('renders one chip per chat (up to 8)', () => {
    const rail = makeRail();
    state.chats = Array.from({ length: 5 }, (_, i) =>
      chat({ id: `c${i}`, timestamp: i + 1 })
    );
    updateRecentRail(() => {}, () => false);
    const chips = rail.querySelectorAll('.recent-chip');
    expect(chips).toHaveLength(5);
  });

  it('caps at 8 chips even when more chats exist', () => {
    const rail = makeRail();
    state.chats = Array.from({ length: 20 }, (_, i) =>
      chat({ id: `c${i}`, timestamp: i + 1 })
    );
    updateRecentRail(() => {}, () => false);
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
    updateRecentRail(() => {}, () => false);
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
    updateRecentRail(() => {}, () => false);
    const titles = [...rail.querySelectorAll('.recent-chip__title')].map(el => el.textContent);
    expect(titles).toEqual(['First', 'Third', 'Second']);
  });

  it('chip title attribute and text are set to the chat title', () => {
    const rail = makeRail();
    state.chats = [
      chat({ id: 'c1', title: 'Alpha', timestamp: 3 }),
      chat({ id: 'c2', title: 'Beta',  timestamp: 2 }),
      chat({ id: 'c3', title: 'Gamma', timestamp: 1 }),
    ];
    updateRecentRail(() => {}, () => false);
    const chip = rail.querySelector('.recent-chip');
    expect(chip.title).toBe('Alpha');
    expect(chip.querySelector('.recent-chip__title').textContent).toBe('Alpha');
  });

  it('falls back to "Untitled" when title is missing', () => {
    const rail = makeRail();
    state.chats = [
      { id: 'c1', source: 'chatgpt', timestamp: 3 },
      { id: 'c2', source: 'chatgpt', timestamp: 2 },
      { id: 'c3', source: 'chatgpt', timestamp: 1 },
    ];
    updateRecentRail(() => {}, () => false);
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
    updateRecentRail(() => {}, () => false);
    const dots = [...rail.querySelectorAll('.recent-chip__dot')];
    expect(dots[0].className).toContain('recent-chip__dot--claude');
    expect(dots[1].className).toContain('recent-chip__dot--gemini');
    expect(dots[2].className).toContain('recent-chip__dot--chatgpt');
  });

  it('falls back to "unknown" source class when source is missing', () => {
    const rail = makeRail();
    state.chats = [
      { id: 'c1', title: 'A', timestamp: 3 },
      { id: 'c2', title: 'B', timestamp: 2 },
      { id: 'c3', title: 'C', timestamp: 1 },
    ];
    updateRecentRail(() => {}, () => false);
    const dot = rail.querySelector('.recent-chip__dot');
    expect(dot.className).toContain('recent-chip__dot--unknown');
  });

  it('calls the click handler with the chat object when a chip is clicked', () => {
    const rail = makeRail();
    const c1 = chat({ id: 'c1', title: 'Clicky', timestamp: 3 });
    state.chats = [c1, chat({ id: 'c2', timestamp: 2 }), chat({ id: 'c3', timestamp: 1 })];
    const handler = vi.fn();
    updateRecentRail(handler, () => false);
    const chip = rail.querySelector('.recent-chip');
    chip.click();
    expect(handler).toHaveBeenCalledWith(c1);
  });
});

// ---------------------------------------------------------------------------
// Sorting: re-run with explicit title-as-id pattern
// ---------------------------------------------------------------------------

describe('updateRecentRail() — sort order', () => {
  it('renders chips in descending recency order', () => {
    const rail = makeRail();
    state.chats = [
      chat({ id: 'c1', title: 'Oldest',  timestamp: 100 }),
      chat({ id: 'c2', title: 'Newest',  timestamp: 300 }),
      chat({ id: 'c3', title: 'Middle',  timestamp: 200 }),
    ];
    updateRecentRail(() => {}, () => false);
    const titles = [...rail.querySelectorAll('.recent-chip__title')].map(el => el.textContent);
    expect(titles).toEqual(['Newest', 'Middle', 'Oldest']);
  });
});

// ---------------------------------------------------------------------------
// Overflow truncation — injectable isOverflowing
// ---------------------------------------------------------------------------

describe('updateRecentRail() — overflow truncation', () => {
  it('stops adding chips once isOverflowing returns true', () => {
    const rail = makeRail();
    state.chats = Array.from({ length: 6 }, (_, i) =>
      chat({ id: `c${i}`, title: `Chat ${i}`, timestamp: i + 1 })
    );

    // Simulate overflow after 3rd chip: the 4th append triggers overflow.
    const isOverflowing = vi.fn(() => {
      // label is child[0]; chips are child[1..n]
      const chipCount = rail.querySelectorAll('.recent-chip').length;
      return chipCount >= 3; // overflow after 3 chips
    });

    updateRecentRail(() => {}, isOverflowing);

    const chips = rail.querySelectorAll('.recent-chip');
    // 3rd chip caused overflow → removed, loop breaks → only 2 chips remain
    expect(chips).toHaveLength(2);
    expect(isOverflowing).toHaveBeenCalled();
  });

  it('hides the rail when overflow leaves only the label (no chips)', () => {
    const rail = makeRail();
    state.chats = Array.from({ length: 4 }, (_, i) =>
      chat({ id: `c${i}`, timestamp: i + 1 })
    );

    // Return true on *every* chip — every chip gets removed immediately.
    updateRecentRail(() => {}, () => true);

    // rail.children.length === 1 (only the label) → display = 'none'
    expect(rail.style.display).toBe('none');
  });

  it('does not call isOverflowing when fewer than 3 chats exist', () => {
    const rail = makeRail();
    state.chats = [chat({ id: 'c1' }), chat({ id: 'c2' })];
    const isOverflowing = vi.fn(() => false);
    updateRecentRail(() => {}, isOverflowing);
    expect(isOverflowing).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Default parameter coverage — line 19: isOverflowing default
// ---------------------------------------------------------------------------

describe('updateRecentRail() — default isOverflowing parameter (line 19)', () => {
  it('uses the default isOverflowing when called with only one argument', () => {
    const rail = makeRail();
    state.chats = [
      chat({ id: 'c1', timestamp: 3 }),
      chat({ id: 'c2', timestamp: 2 }),
      chat({ id: 'c3', timestamp: 1 }),
    ];
    // Only supply onChatClick — isOverflowing uses default (scrollWidth > clientWidth)
    // In jsdom both are 0, so 0 > 0 is false → all chips kept, display = 'flex'
    expect(() => updateRecentRail(() => {})).not.toThrow();
    expect(rail.style.display).toBe('flex');
  });

  it('uses both defaults when called with no arguments and 3+ chats trigger display', () => {
    const rail = makeRail();
    state.chats = [
      chat({ id: 'a', timestamp: 10 }),
      chat({ id: 'b', timestamp: 20 }),
      chat({ id: 'c', timestamp: 30 }),
    ];
    // No arguments — both defaults apply
    expect(() => updateRecentRail()).not.toThrow();
    // Rail should be visible (jsdom dimensions are 0 → no overflow)
    expect(rail.style.display).toBe('flex');
  });
});

// ---------------------------------------------------------------------------
// _setContext injection hook
// ---------------------------------------------------------------------------

describe('_setContext() — test injection hook', () => {
  it('replaces the internal state reference so updateRecentRail uses the injected context', () => {
    const mockRail = makeRail();
    const mockCtx = { chats: [chat({ id: 'injected' }), chat({ id: 'b' }), chat({ id: 'c' })] };
    _setContext(mockCtx);
    // updateRecentRail should now see the injected chats
    updateRecentRail(() => {}, () => false);
    expect(mockRail.children.length).toBeGreaterThan(0);
    // Restore real state
    _setContext(state);
  });
});

// ---------------------------------------------------------------------------
// Default onChatClick parameter — invoke the default no-op via chip click
// ---------------------------------------------------------------------------

describe('updateRecentRail() — default onChatClick invocation', () => {
  it('invokes the default no-op onChatClick when a chip is clicked with no handler supplied', () => {
    const rail = makeRail();
    state.chats = [
      chat({ id: 'd1', timestamp: 3 }),
      chat({ id: 'd2', timestamp: 2 }),
      chat({ id: 'd3', timestamp: 1 }),
    ];
    // Call with NO arguments — onChatClick defaults to () => {}
    updateRecentRail(undefined, () => false);
    // Click the first chip to invoke the default onChatClick (should not throw)
    const firstChip = rail.querySelector('.recent-chip');
    expect(firstChip).not.toBeNull();
    expect(() => firstChip.click()).not.toThrow();
  });
});
