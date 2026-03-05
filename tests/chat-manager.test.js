import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getUnassignedChats,
  getChatsForTopic,
  assignChatToTopic,
  removeChatFromTopic,
  moveChatToTopic,
  updateChatInArray,
  removeChatFromArray,
  buildChatDisplayTitle
} from '../src/lib/chat/chat-manager.js';
import { Topic } from '../src/lib/tree/models.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeChat(id, topicId = null, extra = {}) {
  return { id, title: `Chat ${id}`, url: 'https://example.com', timestamp: Date.now(), topicId, ...extra };
}

function makeTopic(id) {
  // Use real Topic instances so the _chatIdSet shadow Set is correctly
  // maintained by addChatId / removeChatId.
  return Topic.fromObject({ id, name: `Topic ${id}`, chatIds: [], children: [], parentId: null });
}

function makeTree(topicIds = []) {
  const topics = {};
  topicIds.forEach(id => { topics[id] = makeTopic(id); });
  return {
    topics,
    updateTopicDateRange: vi.fn()
  };
}

// ─── getUnassignedChats ───────────────────────────────────────────────────────

describe('getUnassignedChats', () => {
  it('returns empty array when passed non-array', () => {
    expect(getUnassignedChats(null)).toEqual([]);
    expect(getUnassignedChats(undefined)).toEqual([]);
    expect(getUnassignedChats('str')).toEqual([]);
  });

  it('returns empty array for empty chats', () => {
    expect(getUnassignedChats([])).toEqual([]);
  });

  it('returns all chats when none have topicId', () => {
    const chats = [makeChat('a'), makeChat('b')];
    expect(getUnassignedChats(chats)).toHaveLength(2);
  });

  it('filters out chats that have topicId', () => {
    const chats = [makeChat('a', 't1'), makeChat('b'), makeChat('c', 't2')];
    const result = getUnassignedChats(chats);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('b');
  });

  it('treats empty-string topicId as falsy (unassigned)', () => {
    const chat = { id: 'x', topicId: '' };
    expect(getUnassignedChats([chat])).toHaveLength(1);
  });
});

// ─── getChatsForTopic ─────────────────────────────────────────────────────────

describe('getChatsForTopic', () => {
  it('returns empty array when topicId is falsy', () => {
    expect(getChatsForTopic(null, [makeChat('a', 't1')])).toEqual([]);
    expect(getChatsForTopic('', [makeChat('a', 't1')])).toEqual([]);
  });

  it('returns empty array when chats is not an array', () => {
    expect(getChatsForTopic('t1', null)).toEqual([]);
    expect(getChatsForTopic('t1', 'str')).toEqual([]);
  });

  it('returns only chats matching topicId', () => {
    const chats = [makeChat('a', 't1'), makeChat('b', 't2'), makeChat('c', 't1')];
    expect(getChatsForTopic('t1', chats)).toHaveLength(2);
    expect(getChatsForTopic('t2', chats)).toHaveLength(1);
    expect(getChatsForTopic('t3', chats)).toHaveLength(0);
  });
});

// ─── assignChatToTopic ────────────────────────────────────────────────────────

describe('assignChatToTopic', () => {
  it('throws when chat is missing', () => {
    expect(() => assignChatToTopic(null, 't1', makeTree(['t1']))).toThrow('Chat is required');
  });

  it('throws when topicId is missing', () => {
    expect(() => assignChatToTopic(makeChat('c1'), '', makeTree(['t1']))).toThrow('Topic ID is required');
    expect(() => assignChatToTopic(makeChat('c1'), null, makeTree(['t1']))).toThrow('Topic ID is required');
  });

  it('throws when tree is missing', () => {
    expect(() => assignChatToTopic(makeChat('c1'), 't1', null)).toThrow('Tree is required');
  });

  it('throws when topic is not found in tree', () => {
    expect(() => assignChatToTopic(makeChat('c1'), 'nope', makeTree(['t1']))).toThrow('Topic not found: nope');
  });

  it('adds chat id to topic.chatIds', () => {
    const tree = makeTree(['t1']);
    const chat = makeChat('c1');
    assignChatToTopic(chat, 't1', tree);
    expect(tree.topics['t1'].chatIds).toContain('c1');
  });

  it('does not duplicate chatId if already present', () => {
    const tree = makeTree(['t1']);
    // Use addChatId so the shadow Set stays in sync before the second call.
    tree.topics['t1'].addChatId('c1');
    const chat = makeChat('c1');
    assignChatToTopic(chat, 't1', tree);
    expect(tree.topics['t1'].chatIds.filter(id => id === 'c1')).toHaveLength(1);
  });

  it('returns updated chat with topicId set', () => {
    const tree = makeTree(['t1']);
    const chat = makeChat('c1');
    const result = assignChatToTopic(chat, 't1', tree);
    expect(result.topicId).toBe('t1');
    expect(result.id).toBe('c1');
  });

  it('calls updateTopicDateRange when chat has timestamp', () => {
    const tree = makeTree(['t1']);
    const chat = makeChat('c1', null, { timestamp: 1234567890 });
    assignChatToTopic(chat, 't1', tree);
    expect(tree.updateTopicDateRange).toHaveBeenCalledWith('t1', 1234567890);
  });

  it('skips updateTopicDateRange when chat has no timestamp', () => {
    const tree = makeTree(['t1']);
    const chat = { id: 'c1', title: 'Chat', topicId: null };
    expect(() => assignChatToTopic(chat, 't1', tree)).not.toThrow();
    expect(tree.updateTopicDateRange).not.toHaveBeenCalled();
  });

  it('skips updateTopicDateRange when tree has no such method', () => {
    const tree = makeTree(['t1']);
    delete tree.updateTopicDateRange;
    const chat = makeChat('c1', null, { timestamp: 123 });
    expect(() => assignChatToTopic(chat, 't1', tree)).not.toThrow();
  });
});

// ─── removeChatFromTopic ──────────────────────────────────────────────────────

describe('removeChatFromTopic', () => {
  it('throws when chatId is falsy', () => {
    expect(() => removeChatFromTopic(null, 't1', makeTree(['t1']))).toThrow('Chat ID is required');
    expect(() => removeChatFromTopic('', 't1', makeTree(['t1']))).toThrow('Chat ID is required');
  });

  it('is a no-op when topicId is falsy', () => {
    const tree = makeTree(['t1']);
    expect(() => removeChatFromTopic('c1', null, tree)).not.toThrow();
    expect(() => removeChatFromTopic('c1', '', tree)).not.toThrow();
  });

  it('is a no-op when tree is null', () => {
    expect(() => removeChatFromTopic('c1', 't1', null)).not.toThrow();
  });

  it('is a no-op when topic not found in tree', () => {
    const tree = makeTree(['t1']);
    expect(() => removeChatFromTopic('c1', 'missing', tree)).not.toThrow();
  });

  it('removes chatId from topic.chatIds', () => {
    const tree = makeTree(['t1']);
    tree.topics['t1'].chatIds = ['c1', 'c2', 'c3'];
    removeChatFromTopic('c2', 't1', tree);
    expect(tree.topics['t1'].chatIds).toEqual(['c1', 'c3']);
  });

  it('is a no-op when chatId not in topic.chatIds', () => {
    const tree = makeTree(['t1']);
    tree.topics['t1'].chatIds = ['c1'];
    removeChatFromTopic('c99', 't1', tree);
    expect(tree.topics['t1'].chatIds).toEqual(['c1']);
  });
});

// ─── moveChatToTopic ──────────────────────────────────────────────────────────

describe('moveChatToTopic', () => {
  it('throws when chat is missing', () => {
    expect(() => moveChatToTopic(null, 't2', makeTree(['t2']))).toThrow('Chat is required');
  });

  it('throws when newTopicId is missing', () => {
    expect(() => moveChatToTopic(makeChat('c1'), '', makeTree(['t2']))).toThrow('New topic ID is required');
    expect(() => moveChatToTopic(makeChat('c1'), null, makeTree(['t2']))).toThrow('New topic ID is required');
  });

  it('throws when tree is missing', () => {
    expect(() => moveChatToTopic(makeChat('c1'), 't2', null)).toThrow('Tree is required');
  });

  it('moves chat from old topic to new topic', () => {
    const tree = makeTree(['t1', 't2']);
    // Use addChatId to keep the shadow Set in sync.
    tree.topics['t1'].addChatId('c1');
    const chat = makeChat('c1', 't1');
    const result = moveChatToTopic(chat, 't2', tree);
    expect(tree.topics['t1'].chatIds).not.toContain('c1');
    expect(tree.topics['t2'].chatIds).toContain('c1');
    expect(result.topicId).toBe('t2');
  });

  it('assigns chat without removing old if chat has no topicId', () => {
    const tree = makeTree(['t2']);
    const chat = makeChat('c1', null);
    const result = moveChatToTopic(chat, 't2', tree);
    expect(result.topicId).toBe('t2');
    expect(tree.topics['t2'].chatIds).toContain('c1');
  });
});

// ─── updateChatInArray ────────────────────────────────────────────────────────

describe('updateChatInArray', () => {
  it('throws when chatId is falsy', () => {
    expect(() => updateChatInArray(null, {}, [])).toThrow('Chat ID is required');
    expect(() => updateChatInArray('', {}, [])).toThrow('Chat ID is required');
  });

  it('returns empty array when chats is not an array', () => {
    expect(updateChatInArray('c1', { title: 'x' }, null)).toEqual([]);
    expect(updateChatInArray('c1', { title: 'x' }, 'str')).toEqual([]);
  });

  it('merges updates into matching chat', () => {
    const chats = [makeChat('c1'), makeChat('c2')];
    const result = updateChatInArray('c1', { title: 'New Title', topicId: 't1' }, chats);
    expect(result[0].title).toBe('New Title');
    expect(result[0].topicId).toBe('t1');
    expect(result[0].id).toBe('c1');
  });

  it('does not mutate unmatched chats', () => {
    const chats = [makeChat('c1'), makeChat('c2')];
    const result = updateChatInArray('c1', { title: 'Changed' }, chats);
    expect(result[1].title).toBe('Chat c2');
  });

  it('returns new array (immutable)', () => {
    const chats = [makeChat('c1')];
    const result = updateChatInArray('c1', { title: 'x' }, chats);
    expect(result).not.toBe(chats);
  });

  it('is a no-op (passes through) when chatId not in array', () => {
    const chats = [makeChat('c1')];
    const result = updateChatInArray('c99', { title: 'x' }, chats);
    expect(result[0].title).toBe('Chat c1');
  });
});

// ─── removeChatFromArray ──────────────────────────────────────────────────────

describe('removeChatFromArray', () => {
  it('throws when chatId is falsy', () => {
    expect(() => removeChatFromArray(null, [])).toThrow('Chat ID is required');
    expect(() => removeChatFromArray('', [])).toThrow('Chat ID is required');
  });

  it('returns empty array when chats is not an array', () => {
    expect(removeChatFromArray('c1', null)).toEqual([]);
    expect(removeChatFromArray('c1', 42)).toEqual([]);
  });

  it('removes matching chat', () => {
    const chats = [makeChat('c1'), makeChat('c2'), makeChat('c3')];
    const result = removeChatFromArray('c2', chats);
    expect(result).toHaveLength(2);
    expect(result.find(c => c.id === 'c2')).toBeUndefined();
  });

  it('returns new array (immutable)', () => {
    const chats = [makeChat('c1')];
    const result = removeChatFromArray('c1', chats);
    expect(result).not.toBe(chats);
  });

  it('returns unchanged array when chatId not found', () => {
    const chats = [makeChat('c1')];
    const result = removeChatFromArray('c99', chats);
    expect(result).toHaveLength(1);
  });
});

// ─── Topic.chatId helpers (shadow-Set O(1) deduplication) ────────────────────

describe('Topic chatId helpers', () => {
  it('hasChatId returns false for empty topic', () => {
    const t = makeTopic('t1');
    expect(t.hasChatId('c1')).toBe(false);
  });

  it('addChatId adds to both array and Set', () => {
    const t = makeTopic('t1');
    t.addChatId('c1');
    expect(t.chatIds).toContain('c1');
    expect(t.hasChatId('c1')).toBe(true);
  });

  it('addChatId is idempotent — duplicate is rejected in O(1)', () => {
    const t = makeTopic('t1');
    t.addChatId('c1');
    t.addChatId('c1');
    expect(t.chatIds).toHaveLength(1);
    expect(t.hasChatId('c1')).toBe(true);
  });

  it('removeChatId removes from both array and Set', () => {
    const t = makeTopic('t1');
    t.addChatId('c1');
    t.addChatId('c2');
    t.removeChatId('c1');
    expect(t.chatIds).toEqual(['c2']);
    expect(t.hasChatId('c1')).toBe(false);
    expect(t.hasChatId('c2')).toBe(true);
  });

  it('removeChatId is a no-op for unknown id', () => {
    const t = makeTopic('t1');
    t.addChatId('c1');
    t.removeChatId('c99');
    expect(t.chatIds).toEqual(['c1']);
  });

  it('fromObject initialises _chatIdSet from persisted chatIds', () => {
    const t = Topic.fromObject({ id: 't1', name: 'T', chatIds: ['c1', 'c2'], children: [], parentId: null });
    expect(t.hasChatId('c1')).toBe(true);
    expect(t.hasChatId('c2')).toBe(true);
    expect(t.hasChatId('c3')).toBe(false);
  });

  it('toObject does not include _chatIdSet', () => {
    const t = makeTopic('t1');
    t.addChatId('c1');
    expect(t.toObject()).not.toHaveProperty('_chatIdSet');
    expect(t.toObject().chatIds).toEqual(['c1']);
  });
});

// ─── buildChatDisplayTitle ────────────────────────────────────────────────────

describe('buildChatDisplayTitle', () => {
  it('returns empty string for null/undefined', () => {
    expect(buildChatDisplayTitle(null)).toBe('');
    expect(buildChatDisplayTitle(undefined)).toBe('');
  });

  it('prefixes 💬 for regular chat', () => {
    const chat = { title: 'My Chat', metadata: { isExcerpt: false } };
    expect(buildChatDisplayTitle(chat)).toBe('💬 My Chat');
  });

  it('prefixes ✂️ for excerpt', () => {
    const chat = { title: 'My Excerpt', metadata: { isExcerpt: true } };
    expect(buildChatDisplayTitle(chat)).toBe('✂️ My Excerpt');
  });

  it('uses "Untitled Chat" fallback when title is missing', () => {
    const chat = { metadata: {} };
    expect(buildChatDisplayTitle(chat)).toBe('💬 Untitled Chat');
  });

  it('prefixes 💬 when metadata is absent', () => {
    const chat = { title: 'Plain' };
    expect(buildChatDisplayTitle(chat)).toBe('💬 Plain');
  });
});

// ─── Plain-object topic fallback branches ─────────────────────────────────────
// Cover the `else if (!topic.chatIds.includes(chat.id))` branch in
// assignChatToTopic and the `else` branch in removeChatFromTopic when the
// topic is a plain object without addChatId/removeChatId methods.

describe('assignChatToTopic – plain-object topic fallback', () => {
  function makePlainTree(topicIds = []) {
    const topics = {};
    topicIds.forEach(id => {
      topics[id] = { id, name: `T${id}`, chatIds: [], children: [], parentId: null };
    });
    return { topics, updateTopicDateRange: vi.fn() };
  }

  it('pushes chat id onto chatIds when topic is a plain object (no addChatId)', () => {
    const tree = makePlainTree(['t1']);
    const chat = makeChat('c1');
    assignChatToTopic(chat, 't1', tree);
    expect(tree.topics['t1'].chatIds).toContain('c1');
  });

  it('does not duplicate chat id in plain-object topic (else-if false branch)', () => {
    const tree = makePlainTree(['t1']);
    tree.topics['t1'].chatIds = ['c1']; // already present
    const chat = makeChat('c1');
    assignChatToTopic(chat, 't1', tree);
    // Should not push again
    expect(tree.topics['t1'].chatIds.filter(id => id === 'c1')).toHaveLength(1);
  });
});

describe('removeChatFromTopic – plain-object topic fallback', () => {
  function makePlainTree(topicIds = []) {
    const topics = {};
    topicIds.forEach(id => {
      topics[id] = { id, name: `T${id}`, chatIds: [], children: [], parentId: null };
    });
    return { topics };
  }

  it('filters chatIds via array method when topic is a plain object', () => {
    const tree = makePlainTree(['t1']);
    tree.topics['t1'].chatIds = ['c1', 'c2', 'c3'];
    removeChatFromTopic('c2', 't1', tree);
    expect(tree.topics['t1'].chatIds).toEqual(['c1', 'c3']);
  });
});

// ─── buildChatDisplayTitle – assembled chat prefix ────────────────────────────

describe('buildChatDisplayTitle – assembled prefix', () => {
  it('prefixes 🔗 for assembled chats (metadata.isAssembled = true)', () => {
    const chat = { title: 'Assembled', metadata: { isAssembled: true } };
    expect(buildChatDisplayTitle(chat)).toBe('🔗 Assembled');
  });
});
