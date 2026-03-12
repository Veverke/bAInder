/**
 * Tests for C.28 — Enumerate Prompts & Responses in Chat Header
 * Covers: countTurns(), addOrdinalLabels()
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

import {
  countTurns,
  addOrdinalLabels,
} from '../src/reader/reader.js';

// ─── Mock all deps reader.js imports ────────────────────────────────────────
vi.mock('../src/lib/io/markdown-serialiser.js', () => ({
  parseFrontmatter: vi.fn(() => ({})),
}));
vi.mock('../src/lib/chat/annotations.js', () => ({
  loadAnnotations: vi.fn(async () => []),
  saveAnnotation:  vi.fn(async () => []),
  deleteAnnotation: vi.fn(async () => []),
  serializeRange:  vi.fn(() => null),
  applyAnnotations: vi.fn(),
  parseBacklinks:  vi.fn(() => []),
}));
vi.mock('../src/lib/sticky-notes/sticky-notes-ui.js', () => ({
  setupStickyNotes: vi.fn(),
}));
vi.mock('../src/lib/vendor/browser.js', () => ({
  default: {
    storage: { local: { get: vi.fn(async () => ({})), set: vi.fn(async () => {}) } },
    runtime: { sendMessage: vi.fn(async () => {}) },
  },
}));
vi.mock('../src/lib/utils/search-utils.js', () => ({
  escapeHtml: vi.fn(s => String(s ?? '')),
  generateId: vi.fn(() => 'test-id'),
}));
vi.mock('../src/lib/export/clipboard-serialiser.js', () => ({
  getClipboardSettings: vi.fn(async () => ({ format: 'plain', includeEmojis: true, includeImages: false, includeAttachments: false, separator: '---' })),
  serialiseChats: vi.fn((chats) => chats.map(c => c.title || '').join('\n')),
  writeToClipboard: vi.fn(async () => ({ success: true, usedFallback: false })),
  writeToClipboardHtml: vi.fn(async () => ({ success: true, usedFallback: false })),
  MAX_CLIPBOARD_CHARS: 1_000_000,
}));

// ─── Helper: build a minimal content element with chat-turn divs ─────────────
function buildContentEl(turns) {
  // turns: array of 'user' | 'assistant'
  const el = document.createElement('div');
  el.id = 'reader-content';
  for (const role of turns) {
    const turn = document.createElement('div');
    turn.className = `chat-turn chat-turn--${role}`;
    const roleDiv = document.createElement('div');
    roleDiv.className = 'chat-turn__role';
    roleDiv.textContent = role === 'user' ? 'User' : 'Assistant';
    const bodyDiv = document.createElement('div');
    bodyDiv.className = 'chat-turn__body';
    bodyDiv.textContent = `Content for ${role} turn`;
    turn.appendChild(roleDiv);
    turn.appendChild(bodyDiv);
    el.appendChild(turn);
  }
  return el;
}

// ─── countTurns ──────────────────────────────────────────────────────────────

describe('countTurns', () => {
  it('returns 0/0 for null input', () => {
    expect(countTurns(null)).toEqual({ prompts: 0, responses: 0 });
  });

  it('returns 0/0 for empty container', () => {
    const el = document.createElement('div');
    expect(countTurns(el)).toEqual({ prompts: 0, responses: 0 });
  });

  it('counts user turns as prompts', () => {
    const el = buildContentEl(['user', 'user', 'user']);
    expect(countTurns(el)).toEqual({ prompts: 3, responses: 0 });
  });

  it('counts assistant turns as responses', () => {
    const el = buildContentEl(['assistant', 'assistant']);
    expect(countTurns(el)).toEqual({ prompts: 0, responses: 2 });
  });

  it('counts mixed turns correctly', () => {
    const el = buildContentEl(['user', 'assistant', 'user', 'assistant', 'user', 'assistant']);
    expect(countTurns(el)).toEqual({ prompts: 3, responses: 3 });
  });

  it('handles single user turn', () => {
    const el = buildContentEl(['user']);
    expect(countTurns(el)).toEqual({ prompts: 1, responses: 0 });
  });

  it('handles single assistant turn', () => {
    const el = buildContentEl(['assistant']);
    expect(countTurns(el)).toEqual({ prompts: 0, responses: 1 });
  });
});

// ─── addOrdinalLabels ─────────────────────────────────────────────────────────

describe('addOrdinalLabels', () => {
  it('no-ops on null input', () => {
    expect(() => addOrdinalLabels(null)).not.toThrow();
  });

  it('no-ops on empty container', () => {
    const el = document.createElement('div');
    addOrdinalLabels(el);
    expect(el.querySelectorAll('.msg-ordinal').length).toBe(0);
  });

  it('adds P1 label and id="p1" to first user turn', () => {
    const el = buildContentEl(['user']);
    addOrdinalLabels(el);
    const turn = el.querySelector('.chat-turn--user');
    expect(turn.id).toBe('p1');
    const label = turn.querySelector('.msg-ordinal');
    expect(label).not.toBeNull();
    expect(label.textContent).toBe('P1');
    expect(label.getAttribute('aria-hidden')).toBe('true');
  });

  it('adds R1 label and id="r1" to first assistant turn', () => {
    const el = buildContentEl(['assistant']);
    addOrdinalLabels(el);
    const turn = el.querySelector('.chat-turn--assistant');
    expect(turn.id).toBe('r1');
    const label = turn.querySelector('.msg-ordinal');
    expect(label).not.toBeNull();
    expect(label.textContent).toBe('R1');
  });

  it('numbers prompts and responses independently', () => {
    const el = buildContentEl(['user', 'assistant', 'user', 'assistant']);
    addOrdinalLabels(el);
    const turns = Array.from(el.querySelectorAll('.chat-turn'));
    expect(turns[0].id).toBe('p1');
    expect(turns[0].querySelector('.msg-ordinal').textContent).toBe('P1');
    expect(turns[1].id).toBe('r1');
    expect(turns[1].querySelector('.msg-ordinal').textContent).toBe('R1');
    expect(turns[2].id).toBe('p2');
    expect(turns[2].querySelector('.msg-ordinal').textContent).toBe('P2');
    expect(turns[3].id).toBe('r2');
    expect(turns[3].querySelector('.msg-ordinal').textContent).toBe('R2');
  });

  it('is idempotent — calling twice does not double labels', () => {
    const el = buildContentEl(['user', 'assistant']);
    addOrdinalLabels(el);
    addOrdinalLabels(el);
    expect(el.querySelectorAll('.msg-ordinal').length).toBe(2);
    // IDs should still be correct
    expect(el.querySelector('.chat-turn--user').id).toBe('p1');
    expect(el.querySelector('.chat-turn--assistant').id).toBe('r1');
  });

  it('handles multiple prompts with increasing ordinal', () => {
    const el = buildContentEl(['user', 'user', 'user']);
    addOrdinalLabels(el);
    const labels = el.querySelectorAll('.msg-ordinal');
    expect(labels[0].textContent).toBe('P1');
    expect(labels[1].textContent).toBe('P2');
    expect(labels[2].textContent).toBe('P3');
  });

  it('handles multiple responses with increasing ordinal', () => {
    const el = buildContentEl(['assistant', 'assistant']);
    addOrdinalLabels(el);
    const labels = el.querySelectorAll('.msg-ordinal');
    expect(labels[0].textContent).toBe('R1');
    expect(labels[1].textContent).toBe('R2');
  });

  it('skips turns without chat-turn--user/assistant class', () => {
    const el = document.createElement('div');
    // Add an unclassified turn
    const plain = document.createElement('div');
    plain.className = 'chat-turn';  // no user or assistant modifier
    el.appendChild(plain);
    addOrdinalLabels(el);
    expect(el.querySelectorAll('.msg-ordinal').length).toBe(0);
    expect(plain.id).toBe('');
  });

  it('injects label as first child of chat-turn__role', () => {
    const el = buildContentEl(['user']);
    addOrdinalLabels(el);
    const roleDiv = el.querySelector('.chat-turn__role');
    expect(roleDiv.firstChild.className).toBe('msg-ordinal');
  });
});

// ---------------------------------------------------------------------------
// Helpers for emoji-format content (current serialiser output)
// ---------------------------------------------------------------------------
const USER_EMOJI = '\uD83D\uDE4B'; // 🙋
const ASST_EMOJI = '\uD83E\uDD16'; // 🤖

/**
 * Build a content element using the current emoji-paragraph format.
 * @param {Array<'user'|'assistant'|'other'>} turns
 */
function buildEmojiContentEl(turns) {
  const container = document.createElement('div');
  for (const role of turns) {
    const p = document.createElement('p');
    if (role === 'user') {
      p.textContent = `${USER_EMOJI} Hello from user`;
    } else if (role === 'assistant') {
      p.textContent = `${ASST_EMOJI} Hello from assistant`;
    } else {
      p.textContent = 'Some other paragraph without an emoji role prefix';
    }
    container.appendChild(p);
  }
  return container;
}

// ---------------------------------------------------------------------------
// countTurns — emoji format
// ---------------------------------------------------------------------------
describe('countTurns — emoji format', () => {
  it('counts user paragraphs only', () => {
    const el = buildEmojiContentEl(['user', 'user']);
    expect(countTurns(el)).toEqual({ prompts: 2, responses: 0 });
  });

  it('counts assistant paragraphs only', () => {
    const el = buildEmojiContentEl(['assistant', 'assistant', 'assistant']);
    expect(countTurns(el)).toEqual({ prompts: 0, responses: 3 });
  });

  it('counts mixed turns and ignores non-role paragraphs', () => {
    const el = buildEmojiContentEl(['user', 'assistant', 'other', 'user', 'assistant']);
    expect(countTurns(el)).toEqual({ prompts: 2, responses: 2 });
  });
});

// ---------------------------------------------------------------------------
// addOrdinalLabels — emoji format
// ---------------------------------------------------------------------------
describe('addOrdinalLabels — emoji format', () => {
  it('injects P1 label on a single user paragraph', () => {
    const el = buildEmojiContentEl(['user']);
    addOrdinalLabels(el);
    const labels = el.querySelectorAll('.msg-ordinal');
    expect(labels.length).toBe(1);
    expect(labels[0].textContent).toBe('P1');
  });

  it('injects R1 label on a single assistant paragraph', () => {
    const el = buildEmojiContentEl(['assistant']);
    addOrdinalLabels(el);
    const labels = el.querySelectorAll('.msg-ordinal');
    expect(labels.length).toBe(1);
    expect(labels[0].textContent).toBe('R1');
  });

  it('numbers a mixed sequence correctly', () => {
    const el = buildEmojiContentEl(['user', 'assistant', 'user', 'assistant']);
    addOrdinalLabels(el);
    const labels = [...el.querySelectorAll('.msg-ordinal')].map(l => l.textContent);
    expect(labels).toEqual(['P1', 'R1', 'P2', 'R2']);
  });

  it('injects label as first child of the paragraph (before the emoji)', () => {
    const el = buildEmojiContentEl(['user']);
    addOrdinalLabels(el);
    const p = el.querySelector('p');
    expect(p.firstChild.className).toBe('msg-ordinal');
  });

  it('is idempotent — calling twice yields the same labels', () => {
    const el = buildEmojiContentEl(['user', 'assistant']);
    addOrdinalLabels(el);
    addOrdinalLabels(el);
    const labels = el.querySelectorAll('.msg-ordinal');
    expect(labels.length).toBe(2);
    expect(labels[0].textContent).toBe('P1');
    expect(labels[1].textContent).toBe('R1');
  });

  it('assigns p-prefixed IDs to user paragraphs', () => {
    const el = buildEmojiContentEl(['user', 'user']);
    addOrdinalLabels(el);
    const paras = el.querySelectorAll('p');
    expect(paras[0].id).toBe('p1');
    expect(paras[1].id).toBe('p2');
  });

  it('assigns r-prefixed IDs to assistant paragraphs', () => {
    const el = buildEmojiContentEl(['assistant', 'assistant']);
    addOrdinalLabels(el);
    const paras = el.querySelectorAll('p');
    expect(paras[0].id).toBe('r1');
    expect(paras[1].id).toBe('r2');
  });

  it('ignores non-role paragraphs and does not label them', () => {
    const el = buildEmojiContentEl(['other', 'user', 'other']);
    addOrdinalLabels(el);
    const labels = el.querySelectorAll('.msg-ordinal');
    expect(labels.length).toBe(1);
    expect(el.querySelectorAll('p')[0].id).toBe('');
    expect(el.querySelectorAll('p')[2].id).toBe('');
  });
});
