/**
 * Tests for C.19 — Review-by Date / Expiry Flag
 *
 * Covers:
 *   - checkStaleChats (stale-check.js)
 *   - setupStaleBanner (reader.js)
 *   - tree-renderer stale badge (tree-renderer.js)
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { checkStaleChats } from '../src/background/stale-check.js';
import { setupStaleBanner } from '../src/reader/reader.js';
import { TreeRenderer } from '../src/lib/tree-renderer.js';
import { TopicTree } from '../src/lib/tree.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeStorage(chats = []) {
  const store = { chats };
  return {
    get: vi.fn(async (keys) => {
      const result = {};
      const keyList = typeof keys === 'string' ? [keys] : keys;
      for (const k of keyList) result[k] = store[k];
      return result;
    }),
    set: vi.fn(async (data) => { Object.assign(store, data); }),
    _store: store,
  };
}

function makeChat(overrides = {}) {
  return {
    id:              `chat-${Math.random().toString(36).slice(2, 8)}`,
    title:           'Test Chat',
    source:          'chatgpt',
    timestamp:       Date.now(),
    topicId:         'topic-1',
    reviewDate:      null,
    flaggedAsStale:  false,
    ...overrides,
  };
}

// ─── checkStaleChats ─────────────────────────────────────────────────────────

describe('checkStaleChats', () => {
  it('returns 0 when there are no chats', async () => {
    const storage = makeStorage([]);
    const count = await checkStaleChats(storage, '2026-03-04');
    expect(count).toBe(0);
    expect(storage.set).not.toHaveBeenCalled();
  });

  it('returns 0 when no chat has a reviewDate', async () => {
    const storage = makeStorage([makeChat(), makeChat()]);
    const count = await checkStaleChats(storage, '2026-03-04');
    expect(count).toBe(0);
    expect(storage.set).not.toHaveBeenCalled();
  });

  it('returns 0 when reviewDate is in the future', async () => {
    const storage = makeStorage([makeChat({ reviewDate: '2030-01-01' })]);
    const count = await checkStaleChats(storage, '2026-03-04');
    expect(count).toBe(0);
    expect(storage.set).not.toHaveBeenCalled();
  });

  it('flags a chat whose reviewDate is today', async () => {
    const chat = makeChat({ reviewDate: '2026-03-04' });
    const storage = makeStorage([chat]);
    const count = await checkStaleChats(storage, '2026-03-04');
    expect(count).toBe(1);
    expect(storage.set).toHaveBeenCalledOnce();
    const saved = storage.set.mock.calls[0][0].chats;
    expect(saved.find(c => c.id === chat.id).flaggedAsStale).toBe(true);
  });

  it('flags a chat whose reviewDate is in the past', async () => {
    const chat = makeChat({ reviewDate: '2025-01-01' });
    const storage = makeStorage([chat]);
    const count = await checkStaleChats(storage, '2026-03-04');
    expect(count).toBe(1);
    const saved = storage.set.mock.calls[0][0].chats;
    expect(saved.find(c => c.id === chat.id).flaggedAsStale).toBe(true);
  });

  it('does not re-flag a chat already flagged as stale', async () => {
    const chat = makeChat({ reviewDate: '2025-01-01', flaggedAsStale: true });
    const storage = makeStorage([chat]);
    const count = await checkStaleChats(storage, '2026-03-04');
    expect(count).toBe(0);
    expect(storage.set).not.toHaveBeenCalled();
  });

  it('flags only overdue chats in a mixed array', async () => {
    const stale   = makeChat({ reviewDate: '2025-06-01' });
    const future  = makeChat({ reviewDate: '2030-06-01' });
    const noDate  = makeChat();
    const storage = makeStorage([stale, future, noDate]);
    const count = await checkStaleChats(storage, '2026-03-04');
    expect(count).toBe(1);
    const saved = storage.set.mock.calls[0][0].chats;
    expect(saved.find(c => c.id === stale.id).flaggedAsStale).toBe(true);
    expect(saved.find(c => c.id === future.id).flaggedAsStale).toBe(false);
    expect(saved.find(c => c.id === noDate.id).flaggedAsStale).toBe(false);
  });

  it('uses real today when no date is supplied', async () => {
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    const chat    = makeChat({ reviewDate: yesterday });
    const storage = makeStorage([chat]);
    const count = await checkStaleChats(storage);
    expect(count).toBe(1);
  });

  it('preserves all other chat fields when flagging', async () => {
    const chat = makeChat({ reviewDate: '2025-01-01', rating: 4, tags: ['a', 'b'] });
    const storage = makeStorage([chat]);
    await checkStaleChats(storage, '2026-03-04');
    const saved = storage.set.mock.calls[0][0].chats[0];
    expect(saved.rating).toBe(4);
    expect(saved.tags).toEqual(['a', 'b']);
    expect(saved.title).toBe(chat.title);
  });
});

// ─── setupStaleBanner — reader ────────────────────────────────────────────────

describe('setupStaleBanner', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="stale-banner" hidden></div>
      <main id="reader-content"></main>
    `;
  });

  it('does nothing when #stale-banner element is absent', () => {
    document.body.innerHTML = '<main id="reader-content"></main>';
    const chat    = makeChat({ flaggedAsStale: true, reviewDate: '2025-01-01' });
    const storage = makeStorage([chat]);
    // Should not throw
    expect(() => setupStaleBanner(chat.id, chat, storage)).not.toThrow();
  });

  it('does nothing if chat is not flagged as stale', () => {
    const chat = makeChat({ flaggedAsStale: false });
    setupStaleBanner(chat.id, chat, makeStorage([chat]));
    const banner = document.getElementById('stale-banner');
    expect(banner.hidden).toBe(true);
  });

  it('shows the banner when chat is flagged as stale', () => {
    const chat = makeChat({ flaggedAsStale: true, reviewDate: '2025-01-01' });
    setupStaleBanner(chat.id, chat, makeStorage([chat]));
    const banner = document.getElementById('stale-banner');
    expect(banner.hidden).toBe(false);
    expect(banner.textContent).toContain('2025-01-01');
  });

  it('shows a generic message when there is no reviewDate', () => {
    const chat = makeChat({ flaggedAsStale: true, reviewDate: null });
    setupStaleBanner(chat.id, chat, makeStorage([chat]));
    const banner = document.getElementById('stale-banner');
    expect(banner.hidden).toBe(false);
    expect(banner.textContent.length).toBeGreaterThan(0);
  });

  it('renders a dismiss button', () => {
    const chat = makeChat({ flaggedAsStale: true, reviewDate: '2025-06-01' });
    setupStaleBanner(chat.id, chat, makeStorage([chat]));
    const btn = document.querySelector('.stale-banner__dismiss');
    expect(btn).toBeTruthy();
  });

  it('hides the banner and clears flaggedAsStale when dismiss is clicked', async () => {
    const chat    = makeChat({ flaggedAsStale: true, reviewDate: '2025-06-01' });
    const storage = makeStorage([chat]);
    setupStaleBanner(chat.id, chat, storage);

    const btn    = document.querySelector('.stale-banner__dismiss');
    const banner = document.getElementById('stale-banner');

    btn.click();
    // Allow microtask queue to flush
    await new Promise(r => setTimeout(r, 0));

    expect(banner.hidden).toBe(true);
    expect(storage.set).toHaveBeenCalled();
    const saved = storage.set.mock.calls[0][0].chats;
    expect(saved.find(c => c.id === chat.id).flaggedAsStale).toBe(false);
  });
});

// ─── TreeRenderer — stale badge ──────────────────────────────────────────────

describe('TreeRenderer stale badge', () => {
  let container;

  beforeEach(() => {
    container = document.createElement('div');
    container.id = 'treeView';
    document.body.appendChild(container);
    // emptyState / itemCount stubs used by TreeRenderer
    const emptyState = document.createElement('div');
    emptyState.id = 'emptyState';
    document.body.appendChild(emptyState);
    const itemCount = document.createElement('span');
    itemCount.id = 'itemCount';
    document.body.appendChild(itemCount);
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  function renderWithChats(chats) {
    const tree = new TopicTree();
    const topicId = tree.addTopic('Topic');
    tree.topics[topicId].chatIds = chats.map(c => c.id);
    const renderer = new TreeRenderer(container, tree);
    renderer.setChatData(chats.map(c => ({ ...c, topicId })));
    renderer.expandAll();
    renderer.render();
    return renderer;
  }

  it('does not add a stale badge for a normal chat', () => {
    renderWithChats([makeChat({ flaggedAsStale: false })]);
    expect(container.querySelector('.tree-stale-badge')).toBeNull();
  });

  it('adds a ⚠ stale badge for a stale chat', () => {
    renderWithChats([makeChat({ flaggedAsStale: true, reviewDate: '2025-01-01' })]);
    const badge = container.querySelector('.tree-stale-badge');
    expect(badge).toBeTruthy();
    expect(badge.textContent).toBe('⚠');
  });

  it('badge title includes the reviewDate when present', () => {
    renderWithChats([makeChat({ flaggedAsStale: true, reviewDate: '2025-06-15' })]);
    const badge = container.querySelector('.tree-stale-badge');
    expect(badge.title).toContain('2025-06-15');
  });

  it('badge title shows generic text when reviewDate is absent', () => {
    renderWithChats([makeChat({ flaggedAsStale: true, reviewDate: null })]);
    const badge = container.querySelector('.tree-stale-badge');
    expect(badge.title.length).toBeGreaterThan(0);
  });
});
