/**
 * Integration tests — Stage 7 Happy Path: Save → Store → Open in Reader
 *
 * Simulates the end-to-end user flow described in the stage 7 happy path:
 *
 *   1. Clean state (no saved topics / chats).
 *   2. Save a full Copilot chat via handleSaveChat  (mimics "Save to bAInder" button).
 *   3. Save an excerpt via buildExcerptPayload + handleSaveChat (mimics context-menu save).
 *   4. Assign each saved chat to a topic in the in-memory tree.
 *   5. Open the reader for each chat (via reader.init()) and assert it renders.
 *
 * All Chrome storage I/O is replaced by a simple in-memory object so these
 * tests run without any browser environment.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { handleSaveChat, buildExcerptPayload } from '../src/background/chat-save-handler.js';
import { assignChatToTopic } from '../src/lib/chat-manager.js';
import { TopicTree } from '../src/lib/tree.js';
import { init } from '../src/reader/reader.js';

// ─── Shared DOM fixture (mirrors reader.html) ─────────────────────────────────

function setupReaderDom() {
  document.body.innerHTML = `
    <header id="reader-header" hidden>
      <div class="reader-header__inner">
        <div class="reader-header__meta">
          <span id="meta-source" class="badge"></span>
          <span id="meta-date"   class="meta-date"></span>
          <span id="meta-count"  class="meta-count"></span>
        </div>
        <h1 id="reader-title" class="reader-title"></h1>
      </div>
    </header>
    <main id="reader-content" class="reader-content" hidden></main>
    <div id="state-error"   class="state-card" hidden>
      <p id="error-message"></p>
    </div>
  `;
}

// ─── In-memory storage helper ─────────────────────────────────────────────────

/**
 * Returns a minimal chrome.storage.local–compatible mock that shares state
 * across get/set calls during a single test.
 */
function makeStorage(initialData = {}) {
  const store = { ...initialData };
  return {
    get:  vi.fn(async (keys) => {
      if (Array.isArray(keys)) {
        return Object.fromEntries(keys.map(k => [k, store[k]]));
      }
      return { [keys]: store[keys] };
    }),
    set:  vi.fn(async (obj) => { Object.assign(store, obj); }),
    _store: store,   // expose for assertions
  };
}

// ─── Copilot chat payload (as sent by content.js / chat-extractor.js) ─────────

const COPILOT_URL  = 'https://copilot.microsoft.com/chats/test-thread-abc123';
const COPILOT_URL2 = 'https://copilot.microsoft.com/chats/test-thread-def456';

const copilotChatPayload = {
  title:        'How do I centre a div in CSS?',
  content: [
    '---',
    'title: "How do I centre a div in CSS?"',
    'source: copilot',
    'url: ' + COPILOT_URL,
    'date: 2026-02-22T10:00:00.000Z',
    'messageCount: 2',
    'contentFormat: markdown-v1',
    '---',
    '',
    '## User',
    '',
    'How do I centre a div in CSS?',
    '',
    '## Copilot',
    '',
    'Use `display: flex; justify-content: center; align-items: center;` on the parent.',
  ].join('\n'),
  url:          COPILOT_URL,
  source:       'copilot',
  messageCount: 2,
  messages: [
    { role: 'user',      content: 'How do I centre a div in CSS?' },
    { role: 'assistant', content: 'Use `display: flex; …`' },
  ],
  metadata: { contentFormat: 'markdown-v1' },
};

const selectionText = 'Use display: flex; justify-content: center; align-items: center; on the parent.';

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Stage 7 Happy Path — Save → Open in Reader', () => {
  let storage;
  let tree;

  beforeEach(() => {
    // Step 0: clean state
    storage = makeStorage({ chats: [] });
    tree    = new TopicTree();
    setupReaderDom();
  });

  // ── Step 1: topics ──────────────────────────────────────────────────────────

  it('creates topics "1" and "excerpt" in the topic tree', () => {
    const id1       = tree.addTopic('1');
    const idExcerpt = tree.addTopic('excerpt');

    expect(tree.topics[id1].name).toBe('1');
    expect(tree.topics[idExcerpt].name).toBe('excerpt');
    expect(tree.rootTopicIds).toContain(id1);
    expect(tree.rootTopicIds).toContain(idExcerpt);
  });

  // ── Full flow: full chat save ──────────────────────────────────────────────

  describe('Full chat — Save to bAInder → open in reader', () => {
    it('saves the chat and reader can find and render it', async () => {
      // Step 4+5: save chat (background handler writes to chats array)
      const savedChat = await handleSaveChat(copilotChatPayload, { tab: { url: COPILOT_URL } }, storage);

      // Sanity: entry exists in storage as an array element
      expect(storage._store.chats).toBeInstanceOf(Array);
      expect(storage._store.chats).toHaveLength(1);
      expect(storage._store.chats[0].id).toBe(savedChat.id);
      expect(storage._store.chats[0].source).toBe('copilot');

      // Step 7: reader opens the URL  chrome-extension://…/reader.html?chatId=<id>
      vi.stubGlobal('location', { search: `?chatId=${savedChat.id}` });
      await init(storage);

      // Assert: no error shown, header and content visible
      expect(document.getElementById('state-error').hidden).toBe(true);
      expect(document.getElementById('reader-header').hidden).toBe(false);
      expect(document.getElementById('reader-content').hidden).toBe(false);
      expect(document.getElementById('reader-title').textContent)
        .toBe('How do I centre a div in CSS?');
      expect(document.getElementById('meta-source').className).toContain('badge--copilot');
    });

    it('assigns saved chat to topic "1" and tree reflects the relationship', async () => {
      const topicId = tree.addTopic('1');
      const savedChat = await handleSaveChat(copilotChatPayload, { tab: { url: COPILOT_URL } }, storage);

      const updatedChat = assignChatToTopic(savedChat, topicId, tree);
      storage._store.chats = [updatedChat];

      // Topic should list this chat
      expect(tree.topics[topicId].chatIds).toContain(savedChat.id);
      expect(updatedChat.topicId).toBe(topicId);

      // Reader still resolves the chat by id
      vi.stubGlobal('location', { search: `?chatId=${savedChat.id}` });
      await init(storage);
      expect(document.getElementById('reader-header').hidden).toBe(false);
      expect(document.getElementById('reader-title').textContent)
        .toBe('How do I centre a div in CSS?');
    });
  });

  // ── Full flow: excerpt save ────────────────────────────────────────────────

  describe('Excerpt — context-menu Save → open in reader', () => {
    it('builds excerpt payload, saves it, and reader renders it', async () => {
      // Step 6: context-menu save (background builds excerpt payload then saves)
      const excerptPayload = buildExcerptPayload(selectionText, COPILOT_URL2);

      expect(excerptPayload.metadata.isExcerpt).toBe(true);
      expect(excerptPayload.source).toBe('copilot');

      const savedExcerpt = await handleSaveChat(excerptPayload, { tab: { url: COPILOT_URL2 } }, storage);

      expect(storage._store.chats).toBeInstanceOf(Array);
      expect(storage._store.chats).toHaveLength(1);
      expect(storage._store.chats[0].id).toBe(savedExcerpt.id);

      // Step 8: reader opens the excerpt
      vi.stubGlobal('location', { search: `?chatId=${savedExcerpt.id}` });
      await init(storage);

      expect(document.getElementById('state-error').hidden).toBe(true);
      expect(document.getElementById('reader-header').hidden).toBe(false);
      expect(document.getElementById('reader-content').hidden).toBe(false);
      // Excerpt badge
      expect(document.getElementById('meta-source').className).toContain('badge--excerpt');
    });

    it('assigns excerpt to topic "excerpt" and tree reflects the relationship', async () => {
      const topicId       = tree.addTopic('excerpt');
      const excerptPayload = buildExcerptPayload(selectionText, COPILOT_URL2);
      const savedExcerpt  = await handleSaveChat(excerptPayload, { tab: { url: COPILOT_URL2 } }, storage);

      const updatedExcerpt = assignChatToTopic(savedExcerpt, topicId, tree);
      storage._store.chats = [updatedExcerpt];

      expect(tree.topics[topicId].chatIds).toContain(savedExcerpt.id);
      expect(updatedExcerpt.topicId).toBe(topicId);

      vi.stubGlobal('location', { search: `?chatId=${savedExcerpt.id}` });
      await init(storage);
      expect(document.getElementById('reader-header').hidden).toBe(false);
      expect(document.getElementById('meta-source').className).toContain('badge--excerpt');
    });
  });

  // ── Full flow: both chats saved together ───────────────────────────────────

  describe('Both chats saved — each opens its own content in the reader', () => {
    it('saves full chat and excerpt to separate topics; each loads independently', async () => {
      const topic1Id      = tree.addTopic('1');
      const topicExId     = tree.addTopic('excerpt');

      // Save full chat to topic "1"
      const fullChat = await handleSaveChat(copilotChatPayload, { tab: { url: COPILOT_URL } }, storage);
      const updatedFull = assignChatToTopic(fullChat, topic1Id, tree);

      // Save excerpt to topic "excerpt" (different storage ts, so no dedup)
      const excerptPayload = buildExcerptPayload(selectionText, COPILOT_URL2);
      const excerpt = await handleSaveChat(excerptPayload, { tab: { url: COPILOT_URL2 } }, storage);
      const updatedExcerpt = assignChatToTopic(excerpt, topicExId, tree);

      // Commit both to storage
      storage._store.chats = [updatedFull, updatedExcerpt];

      // ── Open the full chat ──
      setupReaderDom();
      vi.stubGlobal('location', { search: `?chatId=${fullChat.id}` });
      await init(storage);

      expect(document.getElementById('state-error').hidden).toBe(true);
      expect(document.getElementById('reader-title').textContent)
        .toBe('How do I centre a div in CSS?');
      expect(document.getElementById('meta-source').className).toContain('badge--copilot');

      // ── Open the excerpt ──
      setupReaderDom();
      vi.stubGlobal('location', { search: `?chatId=${excerpt.id}` });
      await init(storage);

      expect(document.getElementById('state-error').hidden).toBe(true);
      expect(document.getElementById('meta-source').className).toContain('badge--excerpt');

      // ── Topics have correct chat assignments ──
      expect(tree.topics[topic1Id].chatIds).toContain(fullChat.id);
      expect(tree.topics[topicExId].chatIds).toContain(excerpt.id);
      expect(tree.topics[topic1Id].chatIds).not.toContain(excerpt.id);
      expect(tree.topics[topicExId].chatIds).not.toContain(fullChat.id);
    });

    it('returns "not found" error when an unknown chatId is requested', async () => {
      // One chat in storage
      await handleSaveChat(copilotChatPayload, { tab: { url: COPILOT_URL } }, storage);

      vi.stubGlobal('location', { search: '?chatId=non-existent-id' });
      await init(storage);

      expect(document.getElementById('state-error').hidden).toBe(false);
      expect(document.getElementById('error-message').textContent)
        .toContain('non-existent-id');
    });
  });
});
