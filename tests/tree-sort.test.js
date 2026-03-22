/**
 * Tests for src/lib/renderer/tree-sort.js
 */

import { sortTopics, sortChats } from '../src/lib/renderer/tree-sort.js';

const makeTopics = (overrides = []) => overrides;

describe('sortTopics', () => {
  // ── Basic alpha-asc (default) ────────────────────────────────────────────

  describe('alpha-asc (default)', () => {
    it('sorts topics A→Z by name', () => {
      const topics = [
        { id: '1', name: 'Zebra',  pinned: false },
        { id: '2', name: 'Apple',  pinned: false },
        { id: '3', name: 'Mango',  pinned: false },
      ];
      const result = sortTopics(topics, 'alpha-asc');
      expect(result.map(t => t.name)).toEqual(['Apple', 'Mango', 'Zebra']);
    });

    it('is case-insensitive', () => {
      const topics = [
        { id: '1', name: 'banana', pinned: false },
        { id: '2', name: 'Apple',  pinned: false },
      ];
      const result = sortTopics(topics, 'alpha-asc');
      expect(result[0].name).toBe('Apple');
    });

    it('uses alpha-asc as the default when mode is unrecognized', () => {
      const topics = [
        { id: '1', name: 'z', pinned: false },
        { id: '2', name: 'a', pinned: false },
      ];
      const result = sortTopics(topics, 'unknown-mode');
      expect(result[0].name).toBe('a');
    });
  });

  // ── alpha-desc ────────────────────────────────────────────────────────────

  describe('alpha-desc', () => {
    it('sorts topics Z→A by name', () => {
      const topics = [
        { id: '1', name: 'Apple',  pinned: false },
        { id: '2', name: 'Zebra',  pinned: false },
        { id: '3', name: 'Mango',  pinned: false },
      ];
      const result = sortTopics(topics, 'alpha-desc');
      expect(result.map(t => t.name)).toEqual(['Zebra', 'Mango', 'Apple']);
    });

    it('is case-insensitive', () => {
      const topics = [
        { id: '1', name: 'apple', pinned: false },
        { id: '2', name: 'Zebra', pinned: false },
      ];
      const result = sortTopics(topics, 'alpha-desc');
      expect(result[0].name).toBe('Zebra');
    });
  });

  // ── updated ───────────────────────────────────────────────────────────────

  describe('updated', () => {
    it('sorts by updatedAt descending (most recent first)', () => {
      const topics = [
        { id: '1', name: 'Old',    pinned: false, updatedAt: 1000 },
        { id: '2', name: 'Newest', pinned: false, updatedAt: 3000 },
        { id: '3', name: 'Mid',    pinned: false, updatedAt: 2000 },
      ];
      const result = sortTopics(topics, 'updated');
      expect(result.map(t => t.name)).toEqual(['Newest', 'Mid', 'Old']);
    });

    it('handles missing updatedAt (treats as 0)', () => {
      const topics = [
        { id: '1', name: 'HasDate', pinned: false, updatedAt: 1000 },
        { id: '2', name: 'NoDate',  pinned: false },
      ];
      const result = sortTopics(topics, 'updated');
      expect(result[0].name).toBe('HasDate');
    });
  });

  // ── count ─────────────────────────────────────────────────────────────────

  describe('count', () => {
    it('sorts by chatIds.length descending', () => {
      const topics = [
        { id: '1', name: 'Few',  pinned: false, chatIds: ['a'] },
        { id: '2', name: 'Many', pinned: false, chatIds: ['a', 'b', 'c'] },
        { id: '3', name: 'Some', pinned: false, chatIds: ['a', 'b'] },
      ];
      const result = sortTopics(topics, 'count');
      expect(result.map(t => t.name)).toEqual(['Many', 'Some', 'Few']);
    });

    it('handles missing chatIds (treats as 0)', () => {
      const topics = [
        { id: '1', name: 'NoIds',  pinned: false },
        { id: '2', name: 'HasIds', pinned: false, chatIds: ['a', 'b'] },
      ];
      const result = sortTopics(topics, 'count');
      expect(result[0].name).toBe('HasIds');
    });
  });

  // ── pinned items always first ─────────────────────────────────────────────

  describe('pin-first behaviour', () => {
    it('pinned topics appear before unpinned regardless of mode (alpha-asc)', () => {
      const topics = [
        { id: '1', name: 'Aardvark', pinned: false },
        { id: '2', name: 'Zebra',    pinned: true  },
        { id: '3', name: 'Mango',    pinned: false },
      ];
      const result = sortTopics(topics, 'alpha-asc');
      expect(result[0].pinned).toBe(true);
      expect(result[0].name).toBe('Zebra');
    });

    it('multiple pinned topics are sorted among themselves', () => {
      const topics = [
        { id: '1', name: 'Banana', pinned: true  },
        { id: '2', name: 'Apple',  pinned: true  },
        { id: '3', name: 'Cherry', pinned: false },
      ];
      const result = sortTopics(topics, 'alpha-asc');
      expect(result[0].name).toBe('Apple');
      expect(result[1].name).toBe('Banana');
      expect(result[2].name).toBe('Cherry');
    });

    it('pinned topics first in alpha-desc', () => {
      const topics = [
        { id: '1', name: 'Aaa', pinned: true  },
        { id: '2', name: 'Zzz', pinned: false },
      ];
      const result = sortTopics(topics, 'alpha-desc');
      expect(result[0].pinned).toBe(true);
    });

    it('pinned topics first in updated', () => {
      const topics = [
        { id: '1', name: 'New',    pinned: false, updatedAt: 9999 },
        { id: '2', name: 'Pinned', pinned: true,  updatedAt: 1    },
      ];
      const result = sortTopics(topics, 'updated');
      expect(result[0].name).toBe('Pinned');
    });

    it('pinned topics first in count', () => {
      const topics = [
        { id: '1', name: 'Many',   pinned: false, chatIds: ['a','b','c','d','e'] },
        { id: '2', name: 'Pinned', pinned: true,  chatIds: [] },
      ];
      const result = sortTopics(topics, 'count');
      expect(result[0].name).toBe('Pinned');
    });
  });

  // ── does not mutate original ──────────────────────────────────────────────

  describe('immutability', () => {
    it('does not mutate the original array', () => {
      const topics = [
        { id: '2', name: 'B', pinned: false },
        { id: '1', name: 'A', pinned: false },
      ];
      const originalOrder = topics.map(t => t.name);
      sortTopics(topics, 'alpha-asc');
      expect(topics.map(t => t.name)).toEqual(originalOrder);
    });
  });

  // ── Empty / single-item edge cases ────────────────────────────────────────

  describe('edge cases', () => {
    it('returns empty array for empty input', () => {
      expect(sortTopics([], 'alpha-asc')).toEqual([]);
    });

    it('returns single-element array unchanged', () => {
      const topics = [{ id: '1', name: 'Solo', pinned: false }];
      expect(sortTopics(topics, 'alpha-asc')).toHaveLength(1);
    });
  });
});

// ── Branch coverage: count comparator with empty chatIds arrays (lines 20-22) ─

describe('sortTopics count — empty chatIds arrays', () => {
  it('treats empty chatIds[] as length 0 (both sides of ||)', () => {
    const topics = [
      { id: '1', name: 'EmptyA', pinned: false, chatIds: [] },
      { id: '2', name: 'EmptyB', pinned: false, chatIds: [] },
      { id: '3', name: 'Full',   pinned: false, chatIds: ['x', 'y'] },
    ];
    const result = sortTopics(topics, 'count');
    expect(result[0].name).toBe('Full');
    // Both empty arrays yield 0; alpha secondary is not guaranteed but no crash
    expect(result[1].chatIds).toHaveLength(0);
  });

  it('correctly orders when one has length 0 and other has > 0 via optional chain', () => {
    const topics = [
      { id: 'a', name: 'Zero',    pinned: false, chatIds: [] },
      { id: 'b', name: 'Missing', pinned: false },           // chatIds undefined
      { id: 'c', name: 'Two',     pinned: false, chatIds: ['p', 'q'] },
    ];
    const result = sortTopics(topics, 'count');
    expect(result[0].name).toBe('Two');
    // Zero and Missing both map to 0 — just verify both appear after Two
    expect(result.map(t => t.name).indexOf('Two')).toBe(0);
  });
});

// ── sortChats ─────────────────────────────────────────────────────────────────

describe('sortChats', () => {
  const makeChats = (overrides) => overrides;

  describe('date-desc (default — newest first)', () => {
    it('sorts by timestamp descending', () => {
      const chats = makeChats([
        { id: '1', title: 'Old',    timestamp: 1000 },
        { id: '2', title: 'Newest', timestamp: 3000 },
        { id: '3', title: 'Mid',    timestamp: 2000 },
      ]);
      const result = sortChats(chats, 'date-desc');
      expect(result.map(c => c.title)).toEqual(['Newest', 'Mid', 'Old']);
    });

    it('uses date-desc when mode is unrecognized', () => {
      const chats = makeChats([
        { id: '1', title: 'A', timestamp: 100 },
        { id: '2', title: 'B', timestamp: 200 },
      ]);
      const result = sortChats(chats, 'unknown-mode');
      expect(result[0].title).toBe('B');
    });

    it('handles missing timestamp (treats as 0)', () => {
      const chats = makeChats([
        { id: '1', title: 'HasDate', timestamp: 5000 },
        { id: '2', title: 'NoDate' },
      ]);
      const result = sortChats(chats, 'date-desc');
      expect(result[0].title).toBe('HasDate');
    });
  });

  describe('date-asc (oldest first)', () => {
    it('sorts by timestamp ascending', () => {
      const chats = makeChats([
        { id: '1', title: 'Newest', timestamp: 3000 },
        { id: '2', title: 'Old',    timestamp: 1000 },
        { id: '3', title: 'Mid',    timestamp: 2000 },
      ]);
      const result = sortChats(chats, 'date-asc');
      expect(result.map(c => c.title)).toEqual(['Old', 'Mid', 'Newest']);
    });
  });

  describe('alpha-asc', () => {
    it('sorts chats A→Z by title', () => {
      const chats = makeChats([
        { id: '1', title: 'Zebra',  timestamp: 1000 },
        { id: '2', title: 'Apple',  timestamp: 2000 },
        { id: '3', title: 'Mango',  timestamp: 3000 },
      ]);
      const result = sortChats(chats, 'alpha-asc');
      expect(result.map(c => c.title)).toEqual(['Apple', 'Mango', 'Zebra']);
    });

    it('is case-insensitive', () => {
      const chats = makeChats([
        { id: '1', title: 'banana', timestamp: 1 },
        { id: '2', title: 'Apple',  timestamp: 2 },
      ]);
      expect(sortChats(chats, 'alpha-asc')[0].title).toBe('Apple');
    });

    it('handles missing title (treats as empty string)', () => {
      const chats = makeChats([
        { id: '1', title: 'Z', timestamp: 1 },
        { id: '2',             timestamp: 2 },
      ]);
      const result = sortChats(chats, 'alpha-asc');
      expect(result[0].title).toBeUndefined(); // '' sorts before 'Z'
    });
  });

  describe('alpha-desc', () => {
    it('sorts chats Z→A by title', () => {
      const chats = makeChats([
        { id: '1', title: 'Apple',  timestamp: 1000 },
        { id: '2', title: 'Zebra',  timestamp: 2000 },
        { id: '3', title: 'Mango',  timestamp: 3000 },
      ]);
      const result = sortChats(chats, 'alpha-desc');
      expect(result.map(c => c.title)).toEqual(['Zebra', 'Mango', 'Apple']);
    });
  });

  describe('immutability', () => {
    it('does not mutate the original array', () => {
      const chats = [
        { id: '2', title: 'B', timestamp: 2000 },
        { id: '1', title: 'A', timestamp: 1000 },
      ];
      const originalOrder = chats.map(c => c.title);
      sortChats(chats, 'alpha-asc');
      expect(chats.map(c => c.title)).toEqual(originalOrder);
    });
  });

  describe('edge cases', () => {
    it('returns empty array for empty input', () => {
      expect(sortChats([], 'date-desc')).toEqual([]);
    });

    it('returns single-element array unchanged', () => {
      const chats = [{ id: '1', title: 'Solo', timestamp: 1 }];
      expect(sortChats(chats, 'date-desc')).toHaveLength(1);
    });
  });
});
