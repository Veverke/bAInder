import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ChatDialogs } from '../src/lib/chat-dialogs.js';
import { DialogManager } from '../src/lib/dialog-manager.js';
import { TopicTree } from '../src/lib/tree.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function setup() {
  const container = document.createElement('div');
  container.id = 'modalContainer';
  document.body.appendChild(container);
  const dialog = new DialogManager(container);
  const tree = new TopicTree();
  const chatDialogs = new ChatDialogs(dialog, tree);
  return { container, dialog, tree, chatDialogs };
}

function makeChatEntry(overrides = {}) {
  return {
    id: 'chat-1',
    title: 'Test Chat Title',
    url: 'https://chatgpt.com/c/123',
    timestamp: Date.now(),
    topicId: null,
    metadata: {},
    ...overrides
  };
}

// ─── Constructor ─────────────────────────────────────────────────────────────

describe('ChatDialogs – constructor', () => {
  afterEach(() => { document.body.innerHTML = ''; });

  it('throws when dialogManager is missing', () => {
    const tree = new TopicTree();
    expect(() => new ChatDialogs(null, tree)).toThrow('DialogManager is required');
  });

  it('throws when topicTree is missing', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const dialog = new DialogManager(container);
    expect(() => new ChatDialogs(dialog, null)).toThrow('TopicTree is required');
    expect(() => new ChatDialogs(dialog, undefined)).toThrow('TopicTree is required');
  });

  it('stores dialog and tree on instance', () => {
    const { dialog, tree, chatDialogs } = setup();
    expect(chatDialogs.dialog).toBe(dialog);
    expect(chatDialogs.tree).toBe(tree);
  });
});

// ─── showAssignChat ───────────────────────────────────────────────────────────

describe('ChatDialogs – showAssignChat', () => {
  afterEach(() => { document.body.innerHTML = ''; });

  it('throws when chatEntry is missing', async () => {
    const { chatDialogs } = setup();
    await expect(chatDialogs.showAssignChat(null)).rejects.toThrow('Chat entry is required');
    await expect(chatDialogs.showAssignChat(undefined)).rejects.toThrow('Chat entry is required');
  });

  it('alerts and returns null when no topics exist', async () => {
    const { chatDialogs } = setup();
    const chatEntry = makeChatEntry();
    const promise = chatDialogs.showAssignChat(chatEntry);

    // The alert dialog should be open
    const okBtn = document.querySelector('[data-action="ok"]');
    expect(okBtn).not.toBeNull();
    okBtn.click();

    const result = await promise;
    expect(result).toBeNull();
  });

  it('returns null when form is cancelled', async () => {
    const { chatDialogs, tree } = setup();
    tree.addTopic('Work');
    const chatEntry = makeChatEntry();
    const promise = chatDialogs.showAssignChat(chatEntry);

    const cancelBtn = document.querySelector('[data-action="cancel"]');
    cancelBtn.click();

    const result = await promise;
    expect(result).toBeNull();
  });

  it('returns {topicId, title} when form is submitted', async () => {
    const { chatDialogs, tree } = setup();
    const topicId = tree.addTopic('Work');
    const chatEntry = makeChatEntry();
    const promise = chatDialogs.showAssignChat(chatEntry);

    // Fill in fields
    const topicSelect = document.querySelector('[data-field="topicId"]');
    topicSelect.value = topicId;
    const titleInput = document.querySelector('[data-field="title"]');
    expect(titleInput.value).toBe(chatEntry.title); // pre-filled

    const submitBtn = document.querySelector('[data-action="submit"]');
    submitBtn.click();

    const result = await promise;
    expect(result).not.toBeNull();
    expect(result.topicId).toBe(topicId);
    expect(result.title).toBe(chatEntry.title);
  });

  it('allows editing the title before assigning', async () => {
    const { chatDialogs, tree } = setup();
    const topicId = tree.addTopic('Research');
    const chatEntry = makeChatEntry();
    const promise = chatDialogs.showAssignChat(chatEntry);

    const titleInput = document.querySelector('[data-field="title"]');
    titleInput.value = 'My Custom Title';
    const topicSelect = document.querySelector('[data-field="topicId"]');
    topicSelect.value = topicId;

    document.querySelector('[data-action="submit"]').click();

    const result = await promise;
    expect(result.title).toBe('My Custom Title');
  });

  it('truncates long title in dialog heading to 50 chars', async () => {
    const { chatDialogs, tree } = setup();
    tree.addTopic('Work');
    const longTitle = 'A'.repeat(60);
    const chatEntry = makeChatEntry({ title: longTitle });
    const promise = chatDialogs.showAssignChat(chatEntry);

    // The truncated title (47 + '...') should appear in the heading
    expect(document.body.textContent).toContain('A'.repeat(47) + '...');

    document.querySelector('[data-action="cancel"]').click();
    await promise;
  });
});

// ─── showRenameChat ───────────────────────────────────────────────────────────

describe('ChatDialogs – showRenameChat', () => {
  afterEach(() => { document.body.innerHTML = ''; });

  it('throws when chat is missing', async () => {
    const { chatDialogs } = setup();
    await expect(chatDialogs.showRenameChat(null)).rejects.toThrow('Chat is required');
    await expect(chatDialogs.showRenameChat(undefined)).rejects.toThrow('Chat is required');
  });

  it('returns null when cancelled', async () => {
    const { chatDialogs } = setup();
    const chat = makeChatEntry({ title: 'Old Title' });
    const promise = chatDialogs.showRenameChat(chat);

    document.querySelector('[data-action="cancel"]').click();
    const result = await promise;
    expect(result).toBeNull();
  });

  it('returns null when title is unchanged', async () => {
    const { chatDialogs } = setup();
    const chat = makeChatEntry({ title: 'Same Title' });
    const promise = chatDialogs.showRenameChat(chat);

    // Title input is pre-filled with current title; submit without changing
    document.querySelector('[data-action="submit"]').click();
    const result = await promise;
    expect(result).toBeNull();
  });

  it('returns {title} when a new title is submitted', async () => {
    const { chatDialogs } = setup();
    const chat = makeChatEntry({ title: 'Old Title' });
    const promise = chatDialogs.showRenameChat(chat);

    const titleInput = document.querySelector('[data-field="title"]');
    titleInput.value = 'New Title';
    document.querySelector('[data-action="submit"]').click();

    const result = await promise;
    expect(result).not.toBeNull();
    expect(result.title).toBe('New Title');
  });

  it('pre-fills the title input with current chat title', async () => {
    const { chatDialogs } = setup();
    const chat = makeChatEntry({ title: 'Prefilled Title' });
    const promise = chatDialogs.showRenameChat(chat);

    const titleInput = document.querySelector('[data-field="title"]');
    expect(titleInput.value).toBe('Prefilled Title');

    document.querySelector('[data-action="cancel"]').click();
    await promise;
  });

  it('trims whitespace before comparing titles', async () => {
    const { chatDialogs } = setup();
    const chat = makeChatEntry({ title: 'Same Title' });
    const promise = chatDialogs.showRenameChat(chat);

    const titleInput = document.querySelector('[data-field="title"]');
    // Same title with leading/trailing spaces → no change
    titleInput.value = '  Same Title  ';
    document.querySelector('[data-action="submit"]').click();

    const result = await promise;
    expect(result).toBeNull();
  });
});

// ─── showMoveChat ─────────────────────────────────────────────────────────────

describe('ChatDialogs – showMoveChat', () => {
  afterEach(() => { document.body.innerHTML = ''; });

  it('throws when chat is missing', async () => {
    const { chatDialogs } = setup();
    await expect(chatDialogs.showMoveChat(null)).rejects.toThrow('Chat is required');
    await expect(chatDialogs.showMoveChat(undefined)).rejects.toThrow('Chat is required');
  });

  it('alerts and returns null when no other topics are available', async () => {
    const { chatDialogs, tree } = setup();
    const topicId = tree.addTopic('Only Topic');
    const chat = makeChatEntry({ topicId });
    const promise = chatDialogs.showMoveChat(chat);

    // Alert dialog should appear
    const okBtn = document.querySelector('[data-action="ok"]');
    expect(okBtn).not.toBeNull();
    okBtn.click();

    const result = await promise;
    expect(result).toBeNull();
  });

  it('returns null when cancelled', async () => {
    const { chatDialogs, tree } = setup();
    const t1 = tree.addTopic('Topic 1');
    tree.addTopic('Topic 2');
    const chat = makeChatEntry({ topicId: t1 });
    const promise = chatDialogs.showMoveChat(chat);

    document.querySelector('[data-action="cancel"]').click();
    const result = await promise;
    expect(result).toBeNull();
  });

  it('returns {topicId} when submitted', async () => {
    const { chatDialogs, tree } = setup();
    const t1 = tree.addTopic('Current Topic');
    const t2 = tree.addTopic('Destination');
    const chat = makeChatEntry({ topicId: t1 });
    const promise = chatDialogs.showMoveChat(chat);

    const select = document.querySelector('[data-field="topicId"]');
    select.value = t2;
    document.querySelector('[data-action="submit"]').click();

    const result = await promise;
    expect(result).not.toBeNull();
    expect(result.topicId).toBe(t2);
  });

  it('excludes the current topic from options', async () => {
    const { chatDialogs, tree } = setup();
    const t1 = tree.addTopic('Current Topic');
    tree.addTopic('Other Topic');
    const chat = makeChatEntry({ topicId: t1 });
    const promise = chatDialogs.showMoveChat(chat);

    const select = document.querySelector('[data-field="topicId"]');
    const optionValues = Array.from(select.options).map(o => o.value);
    expect(optionValues).not.toContain(t1);

    document.querySelector('[data-action="cancel"]').click();
    await promise;
  });

  it('truncates long chat title in dialog heading', async () => {
    const { chatDialogs, tree } = setup();
    const t1 = tree.addTopic('T1');
    tree.addTopic('T2');
    const longTitle = 'B'.repeat(50);
    const chat = makeChatEntry({ title: longTitle, topicId: t1 });
    const promise = chatDialogs.showMoveChat(chat);

    expect(document.body.textContent).toContain('B'.repeat(37) + '...');

    document.querySelector('[data-action="cancel"]').click();
    await promise;
  });
});

// ─── showDeleteChat ───────────────────────────────────────────────────────────

describe('ChatDialogs – showDeleteChat', () => {
  afterEach(() => { document.body.innerHTML = ''; });

  it('throws when chat is missing', async () => {
    const { chatDialogs } = setup();
    await expect(chatDialogs.showDeleteChat(null)).rejects.toThrow('Chat is required');
    await expect(chatDialogs.showDeleteChat(undefined)).rejects.toThrow('Chat is required');
  });

  it('returns null when user cancels', async () => {
    const { chatDialogs } = setup();
    const chat = makeChatEntry();
    const promise = chatDialogs.showDeleteChat(chat);

    document.querySelector('[data-action="cancel"]').click();
    const result = await promise;
    expect(result).toBeNull();
  });

  it('returns {chatId} when user confirms', async () => {
    const { chatDialogs } = setup();
    const chat = makeChatEntry({ id: 'my-chat-id' });
    const promise = chatDialogs.showDeleteChat(chat);

    document.querySelector('[data-action="confirm"]').click();
    const result = await promise;
    expect(result).not.toBeNull();
    expect(result.chatId).toBe('my-chat-id');
  });

  it('shows chat title in the confirmation dialog', async () => {
    const { chatDialogs } = setup();
    const chat = makeChatEntry({ title: 'Important Chat' });
    const promise = chatDialogs.showDeleteChat(chat);

    expect(document.body.textContent).toContain('Important Chat');

    document.querySelector('[data-action="cancel"]').click();
    await promise;
  });
});

// ─── _buildTopicOptions ───────────────────────────────────────────────────────

describe('ChatDialogs – _buildTopicOptions', () => {
  afterEach(() => { document.body.innerHTML = ''; });

  it('returns empty array when tree has no topics', () => {
    const { chatDialogs } = setup();
    expect(chatDialogs._buildTopicOptions()).toEqual([]);
  });

  it('returns all topics sorted alphabetically by name', () => {
    const { chatDialogs, tree } = setup();
    tree.addTopic('Zebra');
    tree.addTopic('Apple');
    tree.addTopic('Mango');

    const options = chatDialogs._buildTopicOptions();
    expect(options.map(o => o.label)).toEqual(['Apple', 'Mango', 'Zebra']);
  });

  it('excludes the specified topic when excludeTopicId is given', () => {
    const { chatDialogs, tree } = setup();
    const t1 = tree.addTopic('Topic A');
    tree.addTopic('Topic B');

    const options = chatDialogs._buildTopicOptions(t1);
    expect(options.every(o => o.value !== t1)).toBe(true);
    expect(options).toHaveLength(1);
    expect(options[0].label).toBe('Topic B');
  });

  it('returns options with value and label properties', () => {
    const { chatDialogs, tree } = setup();
    const id = tree.addTopic('My Topic');

    const options = chatDialogs._buildTopicOptions();
    expect(options[0].value).toBe(id);
    expect(options[0].label).toBe('My Topic');
  });

  it('includes all topics when excludeTopicId is null (default)', () => {
    const { chatDialogs, tree } = setup();
    tree.addTopic('T1');
    tree.addTopic('T2');

    expect(chatDialogs._buildTopicOptions(null)).toHaveLength(2);
    expect(chatDialogs._buildTopicOptions()).toHaveLength(2);
  });
});
