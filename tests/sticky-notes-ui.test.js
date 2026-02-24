/**
 * Tests for src/lib/sticky-notes-ui.js (pure functions only)
 */
import { describe, it, expect } from 'vitest';
import { clusterNotes } from '../src/lib/sticky-notes-ui.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeNote(id, anchorPageY) {
  return { id, chatId: 'chat-1', anchorPageY, content: '', createdAt: 1, updatedAt: 1 };
}

// ─── clusterNotes ─────────────────────────────────────────────────────────────

describe('clusterNotes', () => {
  it('returns empty array for empty input', () => {
    expect(clusterNotes([])).toEqual([]);
  });

  it('single note → single cluster with one note', () => {
    const notes    = [makeNote('a', 100)];
    const clusters = clusterNotes(notes);
    expect(clusters).toHaveLength(1);
    expect(clusters[0]).toHaveLength(1);
    expect(clusters[0][0].id).toBe('a');
  });

  it('two notes within threshold → same cluster', () => {
    const notes    = [makeNote('a', 100), makeNote('b', 180)]; // diff = 80 ≤ 100
    const clusters = clusterNotes(notes);
    expect(clusters).toHaveLength(1);
    expect(clusters[0]).toHaveLength(2);
  });

  it('two notes exactly at threshold boundary → same cluster', () => {
    const notes    = [makeNote('a', 0), makeNote('b', 100)]; // diff = 100 ≤ 100
    const clusters = clusterNotes(notes);
    expect(clusters).toHaveLength(1);
  });

  it('two notes beyond threshold → separate clusters', () => {
    const notes    = [makeNote('a', 0), makeNote('b', 101)]; // diff = 101 > 100
    const clusters = clusterNotes(notes);
    expect(clusters).toHaveLength(2);
    expect(clusters[0][0].id).toBe('a');
    expect(clusters[1][0].id).toBe('b');
  });

  it('sorts notes by anchorPageY before clustering', () => {
    // Unsorted input: b(500), a(100), c(150)  →  a+c cluster, b cluster
    const notes    = [makeNote('b', 500), makeNote('a', 100), makeNote('c', 150)];
    const clusters = clusterNotes(notes);
    expect(clusters).toHaveLength(2);
    // First cluster: a(100) and c(150) — diff = 50
    expect(clusters[0].map(n => n.id).sort()).toEqual(['a', 'c']);
    // Second cluster: b(500)
    expect(clusters[1][0].id).toBe('b');
  });

  it('three notes all within threshold → one cluster', () => {
    const notes = [makeNote('a', 0), makeNote('b', 50), makeNote('c', 100)];
    expect(clusterNotes(notes)).toHaveLength(1);
    expect(clusterNotes(notes)[0]).toHaveLength(3);
  });

  it('does not mutate the original array', () => {
    const notes  = [makeNote('b', 200), makeNote('a', 100)];
    const before = notes.map(n => n.id);
    clusterNotes(notes);
    expect(notes.map(n => n.id)).toEqual(before);
  });

  it('consecutive notes with equal anchor → same cluster', () => {
    const notes = [makeNote('a', 200), makeNote('b', 200), makeNote('c', 200)];
    const clusters = clusterNotes(notes);
    expect(clusters).toHaveLength(1);
    expect(clusters[0]).toHaveLength(3);
  });
});
