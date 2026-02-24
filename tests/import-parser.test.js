import { describe, it, expect, beforeEach } from 'vitest';
import {
  validateZipFile,
  parseZipEntries,
  parseChatFromMarkdown,
  buildImportPlan,
  executeImport,
} from '../src/lib/import-parser.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

/** A well-formed bAInder export ZIP (simulated extracted entries). */
const WELL_FORMED_ENTRIES = [
  {
    path: 'bAInder-export-2024-03-15/_metadata.json',
    content: JSON.stringify({
      export_version: '1.0',
      export_date: '2024-03-15T14:30:00Z',
      bainder_version: '1.0.0',
      tree_structure: { total_chats: 2, total_topics: 2 },
    }),
  },
  { path: 'bAInder-export-2024-03-15/README.md', content: '# bAInder Export\n...' },
  {
    path: 'bAInder-export-2024-03-15/Work/_topic.json',
    content: JSON.stringify({ name: 'Work', chatCount: 1 }),
  },
  {
    path: 'bAInder-export-2024-03-15/Work/Projects/_topic.json',
    content: JSON.stringify({ name: 'Projects', chatCount: 1 }),
  },
  {
    path: 'bAInder-export-2024-03-15/Work/Projects/project-alpha-discussion.md',
    content: [
      '---',
      'title: "Project Alpha Discussion"',
      'source: chatgpt',
      'url: https://chat.openai.com/c/abc',
      'date: 2024-03-15T10:30:00Z',
      'topic: "Work > Projects"',
      'chat_id: chat-001',
      '---',
      '',
      '# Project Alpha Discussion',
      '',
      '### User',
      'First message',
      '',
      '### Assistant',
      'First response',
    ].join('\n'),
  },
  {
    path: 'bAInder-export-2024-03-15/Personal/budget-analysis.md',
    content: [
      '---',
      'title: "Budget Analysis"',
      'source: claude',
      'date: 2024-03-10T08:00:00Z',
      '---',
      '',
      'Content here',
    ].join('\n'),
  },
];

/** Single-entry flat structure where the folder IS the only path segment. */
const FLAT_ENTRIES = [
  {
    path: 'Work/project-chat.md',
    content: '---\ntitle: "Work Chat"\nsource: gemini\n---\nContent',
  },
];

/** Entries with no _metadata.json present. */
const NO_METADATA_ENTRIES = [
  {
    path: 'Topic1/chat-one.md',
    content: '---\ntitle: "Chat One"\nsource: chatgpt\n---\nContent',
  },
];

/** Entries with a corrupt _metadata.json and a plain-text .md with no frontmatter. */
const CORRUPT_ENTRIES = [
  { path: 'bAInder/corrupt.md', content: 'no frontmatter at all just plain text' },
  { path: 'bAInder/_metadata.json', content: 'INVALID JSON {{{' },
];

/** An existing topic tree to test merging behaviour. */
const EXISTING_TREE = {
  topics: {
    'topic-work': {
      id: 'topic-work',
      name: 'Work',
      parentId: null,
      children: ['topic-proj'],
      chatIds: [],
      firstChatDate: null,
      lastChatDate: null,
    },
    'topic-proj': {
      id: 'topic-proj',
      name: 'Projects',
      parentId: 'topic-work',
      children: [],
      chatIds: ['existing-chat'],
      firstChatDate: 1700000000000,
      lastChatDate: 1700000000000,
    },
  },
  rootTopicIds: ['topic-work'],
};

const EXISTING_CHATS = [
  {
    id: 'existing-chat',
    title: 'Existing Chat',
    source: 'chatgpt',
    topicId: 'topic-proj',
    timestamp: 1700000000000,
  },
];

// Helper: deep-copy fixture objects so mutations in one test don't bleed into others.
function cloneTree(tree) {
  return JSON.parse(JSON.stringify(tree));
}

// ─── validateZipFile ───────────────────────────────────────────────────────────

describe('validateZipFile()', () => {
  it('returns invalid when called with null', () => {
    const result = validateZipFile(null);
    expect(result.valid).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('returns invalid when called with undefined', () => {
    const result = validateZipFile(undefined);
    expect(result.valid).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('returns invalid for an empty object with no name or size', () => {
    const result = validateZipFile({});
    expect(result.valid).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('returns valid for a .zip file with size > 0 and application/zip MIME type', () => {
    const file = { name: 'export.zip', size: 1000, type: 'application/zip' };
    const result = validateZipFile(file);
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('returns invalid for a .txt extension regardless of size', () => {
    const file = { name: 'export.txt', size: 1000, type: 'text/plain' };
    const result = validateZipFile(file);
    expect(result.valid).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('accepts application/zip MIME type', () => {
    const file = { name: 'export.zip', size: 500, type: 'application/zip' };
    expect(validateZipFile(file).valid).toBe(true);
  });

  it('accepts application/x-zip-compressed MIME type', () => {
    const file = { name: 'archive.zip', size: 500, type: 'application/x-zip-compressed' };
    expect(validateZipFile(file).valid).toBe(true);
  });

  it('returns invalid when size is 0', () => {
    const file = { name: 'empty.zip', size: 0, type: 'application/zip' };
    const result = validateZipFile(file);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/empty/i);
  });

  it('returns invalid when size exceeds 500 MB', () => {
    const file = { name: 'huge.zip', size: 500 * 1024 * 1024 + 1, type: 'application/zip' };
    const result = validateZipFile(file);
    expect(result.valid).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('returns valid for a 499 MB file', () => {
    const file = { name: 'big.zip', size: 499 * 1024 * 1024, type: 'application/zip' };
    expect(validateZipFile(file).valid).toBe(true);
  });

  it('accepts a file with .zip extension even when MIME type is unknown', () => {
    const file = { name: 'data.zip', size: 200, type: '' };
    expect(validateZipFile(file).valid).toBe(true);
  });
});

// ─── parseZipEntries ──────────────────────────────────────────────────────────

describe('parseZipEntries()', () => {
  it('returns empty structure for null input', () => {
    const result = parseZipEntries(null);
    expect(result.topicFolders).toBeInstanceOf(Map);
    expect(result.topicFolders.size).toBe(0);
    expect(result.chatFiles).toHaveLength(0);
    expect(result.metadata).toBeNull();
  });

  it('returns empty structure for an empty array', () => {
    const result = parseZipEntries([]);
    expect(result.topicFolders).toBeInstanceOf(Map);
    expect(result.topicFolders.size).toBe(0);
    expect(result.chatFiles).toHaveLength(0);
    expect(result.metadata).toBeNull();
  });

  it('returns a warnings array for null/empty input', () => {
    const result = parseZipEntries(null);
    expect(Array.isArray(result.warnings)).toBe(true);
  });

  it('detects the _metadata.json from well-formed entries', () => {
    const result = parseZipEntries(WELL_FORMED_ENTRIES);
    expect(result.metadata).not.toBeNull();
    expect(result.metadata.export_version).toBe('1.0');
    expect(result.metadata.bainder_version).toBe('1.0.0');
  });

  it('parses exactly 2 chatFiles from well-formed entries, excluding _topic.json, README.md and _metadata.json', () => {
    const result = parseZipEntries(WELL_FORMED_ENTRIES);
    expect(result.chatFiles).toHaveLength(2);
  });

  it('strips the common root folder prefix from paths', () => {
    const result = parseZipEntries(WELL_FORMED_ENTRIES);
    // No path should start with the export date folder
    for (const file of result.chatFiles) {
      expect(file.path).not.toMatch(/^bAInder-export-2024-03-15/);
    }
  });

  it('sets topicPath to "Work/Projects" for a file inside Work/Projects/', () => {
    const result = parseZipEntries(WELL_FORMED_ENTRIES);
    const alpha = result.chatFiles.find(f => f.path.includes('project-alpha'));
    expect(alpha).toBeDefined();
    expect(alpha.topicPath).toBe('Work/Projects');
  });

  it('builds topicFolders Map with an entry for each unique folder', () => {
    const result = parseZipEntries(WELL_FORMED_ENTRIES);
    // Expect Work, Work/Projects, Personal
    expect(result.topicFolders).toBeInstanceOf(Map);
    expect(result.topicFolders.size).toBe(3);
    expect(result.topicFolders.has('Work')).toBe(true);
    expect(result.topicFolders.has('Work/Projects')).toBe(true);
    expect(result.topicFolders.has('Personal')).toBe(true);
  });

  it('returns metadata: null when no _metadata.json is present', () => {
    const result = parseZipEntries(NO_METADATA_ENTRIES);
    expect(result.metadata).toBeNull();
  });

  it('does not push a warning for the mere absence of metadata', () => {
    const result = parseZipEntries(NO_METADATA_ENTRIES);
    const metaWarnings = result.warnings.filter(w => /metadata/i.test(w));
    expect(metaWarnings).toHaveLength(0);
  });

  it('sets metadata to null and adds a warning when _metadata.json is corrupt JSON', () => {
    const result = parseZipEntries(CORRUPT_ENTRIES);
    expect(result.metadata).toBeNull();
    expect(result.warnings.some(w => /metadata/i.test(w))).toBe(true);
  });

  it('does not stop parsing when _metadata.json is corrupt — still returns chatFiles', () => {
    const result = parseZipEntries(CORRUPT_ENTRIES);
    // corrupt.md has no frontmatter but should still appear as a chatFile
    expect(result.chatFiles).toHaveLength(1);
  });

  it('assigns an empty topicPath to .md files effectively at the root level', () => {
    // After stripping the common root 'bAInder', corrupt.md ends up at the root
    const result = parseZipEntries(CORRUPT_ENTRIES);
    const file = result.chatFiles.find(f => f.path.includes('corrupt'));
    expect(file).toBeDefined();
    expect(file.topicPath).toBe('');
  });

  it('includes chatFiles from subdirectories', () => {
    const result = parseZipEntries(WELL_FORMED_ENTRIES);
    const paths = result.chatFiles.map(f => f.path);
    expect(paths.some(p => p.includes('Work/Projects'))).toBe(true);
  });

  it('parses flat single-entry correctly (strips solo-segment root)', () => {
    // One entry: 'Work/project-chat.md' — 'Work' is detected as root and stripped
    const result = parseZipEntries(FLAT_ENTRIES);
    expect(result.chatFiles).toHaveLength(1);
    expect(result.chatFiles[0].topicPath).toBe('');
  });

  it('records a warning for unrecognised non-standard file extensions', () => {
    const entries = [
      { path: 'folder/my-data.csv', content: 'a,b,c' },
      { path: 'folder/chat.md', content: '---\ntitle: "T"\nsource: x\n---' },
    ];
    const result = parseZipEntries(entries);
    expect(result.warnings.some(w => /csv/i.test(w))).toBe(true);
  });

  it('wires parentPath on child topic folder entries', () => {
    const result = parseZipEntries(WELL_FORMED_ENTRIES);
    const projects = result.topicFolders.get('Work/Projects');
    expect(projects).toBeDefined();
    expect(projects.parentPath).toBe('Work');
  });

  it('lists Work/Projects as a child of Work', () => {
    const result = parseZipEntries(WELL_FORMED_ENTRIES);
    const work = result.topicFolders.get('Work');
    expect(work.children).toContain('Work/Projects');
  });
});

// ─── parseChatFromMarkdown ────────────────────────────────────────────────────

describe('parseChatFromMarkdown()', () => {
  const ALPHA_MD = WELL_FORMED_ENTRIES.find(e => e.path.includes('project-alpha-discussion')).content;
  const BUDGET_MD = WELL_FORMED_ENTRIES.find(e => e.path.includes('budget-analysis')).content;

  it('extracts title from YAML frontmatter', () => {
    const chat = parseChatFromMarkdown(ALPHA_MD, 'project-alpha-discussion.md');
    expect(chat.title).toBe('Project Alpha Discussion');
  });

  it('extracts source from YAML frontmatter', () => {
    const chat = parseChatFromMarkdown(ALPHA_MD, 'project-alpha-discussion.md');
    expect(chat.source).toBe('chatgpt');
  });

  it('extracts url from YAML frontmatter', () => {
    const chat = parseChatFromMarkdown(ALPHA_MD, 'project-alpha-discussion.md');
    expect(chat.url).toBe('https://chat.openai.com/c/abc');
  });

  it('parses the date field to a millisecond timestamp', () => {
    const chat = parseChatFromMarkdown(ALPHA_MD, 'project-alpha-discussion.md');
    const expected = Date.parse('2024-03-15T10:30:00Z');
    expect(chat.timestamp).toBe(expected);
  });

  it('always generates an id that starts with "imported_"', () => {
    const chat = parseChatFromMarkdown(ALPHA_MD, 'project-alpha-discussion.md');
    expect(chat.id).toMatch(/^imported_/);
  });

  it('generates a unique id on every call', () => {
    const a = parseChatFromMarkdown(ALPHA_MD, 'file.md');
    const b = parseChatFromMarkdown(ALPHA_MD, 'file.md');
    expect(a.id).not.toBe(b.id);
  });

  it('falls back to the filename (without .md) as title when frontmatter has no title', () => {
    const chat = parseChatFromMarkdown(
      '---\nsource: chatgpt\n---\nSome content',
      'my-notes.md',
    );
    expect(chat.title).toBe('my-notes');
  });

  it('defaults source to "imported" when frontmatter omits source', () => {
    const chat = parseChatFromMarkdown('---\ntitle: "T"\n---\nContent', 'file.md');
    expect(chat.source).toBe('imported');
  });

  it('defaults url to an empty string when frontmatter omits url', () => {
    const chat = parseChatFromMarkdown(BUDGET_MD, 'budget-analysis.md');
    expect(chat.url).toBe('');
  });

  it('defaults timestamp to approximately Date.now() when date is absent', () => {
    const before = Date.now();
    const chat = parseChatFromMarkdown('---\ntitle: "T"\nsource: x\n---\nContent', 'file.md');
    const after = Date.now();
    expect(chat.timestamp).toBeGreaterThanOrEqual(before);
    expect(chat.timestamp).toBeLessThanOrEqual(after + 5000);
  });

  it('sets metadata.isExcerpt to false', () => {
    const chat = parseChatFromMarkdown(ALPHA_MD, 'file.md');
    expect(chat.metadata.isExcerpt).toBe(false);
  });

  it('sets metadata.importedAt to approximately now', () => {
    const before = Date.now();
    const chat = parseChatFromMarkdown(ALPHA_MD, 'file.md');
    const after = Date.now();
    expect(chat.metadata.importedAt).toBeGreaterThanOrEqual(before);
    expect(chat.metadata.importedAt).toBeLessThanOrEqual(after + 5000);
  });

  it('sets metadata.originalChatId from the chat_id frontmatter field', () => {
    const chat = parseChatFromMarkdown(ALPHA_MD, 'project-alpha-discussion.md');
    expect(chat.metadata.originalChatId).toBe('chat-001');
  });

  it('sets metadata.originalChatId to null when chat_id is absent', () => {
    const chat = parseChatFromMarkdown(BUDGET_MD, 'budget-analysis.md');
    expect(chat.metadata.originalChatId).toBeNull();
  });

  it('sets messageCount from the frontmatter field when present', () => {
    const content = [
      '---',
      'title: "T"',
      'source: chatgpt',
      'messageCount: 7',
      '---',
      'Content',
    ].join('\n');
    const chat = parseChatFromMarkdown(content, 'file.md');
    expect(chat.messageCount).toBe(7);
  });

  it('sets messageCount to 0 when frontmatter omits it', () => {
    const chat = parseChatFromMarkdown(ALPHA_MD, 'file.md');
    expect(chat.messageCount).toBe(0);
  });

  it('always returns messages as an empty array', () => {
    const chat = parseChatFromMarkdown(ALPHA_MD, 'file.md');
    expect(chat.messages).toEqual([]);
  });

  it('always returns topicId as null', () => {
    const chat = parseChatFromMarkdown(ALPHA_MD, 'file.md');
    expect(chat.topicId).toBeNull();
  });

  it('always returns tags as an empty array', () => {
    const chat = parseChatFromMarkdown(ALPHA_MD, 'file.md');
    expect(chat.tags).toEqual([]);
  });

  it('handles content with no frontmatter — uses filename as title', () => {
    const chat = parseChatFromMarkdown('Just plain text, no dashes', 'my-chat.md');
    expect(chat.title).toBe('my-chat');
    expect(chat.source).toBe('imported');
  });

  it('handles null content gracefully — returns a valid chat object', () => {
    const chat = parseChatFromMarkdown(null, 'orphan.md');
    expect(chat.title).toBe('orphan');
    expect(chat.source).toBe('imported');
    expect(chat.id).toMatch(/^imported_/);
    expect(chat.topicId).toBeNull();
    expect(chat.messages).toEqual([]);
    expect(chat.tags).toEqual([]);
  });

  it('accepts an empty topicPathStr without throwing', () => {
    expect(() => parseChatFromMarkdown(ALPHA_MD, 'file.md', '')).not.toThrow();
  });

  it('stores the full markdown content in the content field', () => {
    const chat = parseChatFromMarkdown(ALPHA_MD, 'file.md');
    expect(chat.content).toBe(ALPHA_MD);
  });
});

// ─── buildImportPlan ──────────────────────────────────────────────────────────

describe('buildImportPlan() — null / edge cases', () => {
  it('returns an empty plan without throwing when zipEntries is null', () => {
    const plan = buildImportPlan(null, null, 'merge');
    expect(plan.topicsToCreate).toHaveLength(0);
    expect(plan.topicsToMerge).toHaveLength(0);
    expect(plan.chatsToImport).toHaveLength(0);
    expect(plan.conflicts).toHaveLength(0);
    expect(plan.summary).toMatchObject({ topics: 0, chats: 0, conflicts: 0 });
  });
});

describe('buildImportPlan() — merge strategy', () => {
  let parsedEntries;
  let tree;
  let plan;

  beforeEach(() => {
    parsedEntries = parseZipEntries(WELL_FORMED_ENTRIES);
    tree = cloneTree(EXISTING_TREE);
    plan = buildImportPlan(parsedEntries, tree, 'merge');
  });

  it('returns an object with the required plan keys', () => {
    expect(plan).toHaveProperty('topicsToCreate');
    expect(plan).toHaveProperty('topicsToMerge');
    expect(plan).toHaveProperty('chatsToImport');
    expect(plan).toHaveProperty('conflicts');
    expect(plan).toHaveProperty('summary');
  });

  it('sends all topics to topicsToCreate when existingTree is null', () => {
    const planNoTree = buildImportPlan(parsedEntries, null, 'merge');
    // Work, Work/Projects, Personal — 3 folders
    expect(planNoTree.topicsToCreate).toHaveLength(3);
    expect(planNoTree.topicsToMerge).toHaveLength(0);
  });

  it('puts "Work" and "Work/Projects" into topicsToMerge when they exist in tree', () => {
    expect(plan.topicsToMerge).toHaveLength(2);
    const mergeIds = plan.topicsToMerge.map(m => m.existingTopicId);
    expect(mergeIds).toContain('topic-work');
    expect(mergeIds).toContain('topic-proj');
  });

  it('puts "Personal" into topicsToCreate since it has no match in existingTree', () => {
    const names = plan.topicsToCreate.map(t => t.name);
    expect(names).toContain('Personal');
  });

  it('summary.chats equals the number of chatFiles imported', () => {
    expect(plan.summary.chats).toBe(parsedEntries.chatFiles.length);
  });

  it('summary.topics equals topicsToCreate.length + topicsToMerge.length', () => {
    const expected = plan.topicsToCreate.length + plan.topicsToMerge.length;
    expect(plan.summary.topics).toBe(expected);
  });

  it('summary.conflicts is a non-negative number', () => {
    expect(plan.summary.conflicts).toBeGreaterThanOrEqual(0);
  });

  it('detects duplicate chats within the same import (same title, source, ~same time)', () => {
    // Two entries with identical title/source/date → one conflict
    const duplicateContent = [
      '---',
      'title: "Duplicate Chat"',
      'source: chatgpt',
      'date: 2024-03-15T10:30:00Z',
      '---',
      'Content A',
    ].join('\n');
    const entries = [
      { path: 'TopicA/dup1.md', content: duplicateContent },
      { path: 'TopicA/dup2.md', content: duplicateContent },
    ];
    const parsed = parseZipEntries(entries);
    const dupPlan = buildImportPlan(parsed, null, 'merge');
    expect(dupPlan.conflicts.length).toBeGreaterThanOrEqual(1);
    expect(dupPlan.conflicts[0].type).toBe('duplicate_chat');
  });

  it('chatsToImport arrays use objects with chatEntry and targetTopicPath', () => {
    for (const item of plan.chatsToImport) {
      expect(item).toHaveProperty('chatEntry');
      expect(item).toHaveProperty('targetTopicPath');
      expect(item.chatEntry.id).toMatch(/^imported_/);
    }
  });
});

describe('buildImportPlan() — replace strategy', () => {
  let parsedEntries;
  let plan;

  beforeEach(() => {
    parsedEntries = parseZipEntries(WELL_FORMED_ENTRIES);
    plan = buildImportPlan(parsedEntries, cloneTree(EXISTING_TREE), 'replace');
  });

  it('puts all topics into topicsToCreate even when they exist in existingTree', () => {
    // Work, Work/Projects, Personal — all 3 should be in topicsToCreate
    expect(plan.topicsToCreate).toHaveLength(3);
  });

  it('leaves topicsToMerge empty for replace strategy', () => {
    expect(plan.topicsToMerge).toHaveLength(0);
  });
});

describe('buildImportPlan() — create_root strategy', () => {
  let parsedEntries;
  let plan;

  beforeEach(() => {
    parsedEntries = parseZipEntries(WELL_FORMED_ENTRIES);
    plan = buildImportPlan(parsedEntries, cloneTree(EXISTING_TREE), 'create_root');
  });

  it('includes a root wrapper topic named "Imported {YYYY-MM-DD}"', () => {
    const today = new Date().toISOString().slice(0, 10);
    const rootTopic = plan.topicsToCreate.find(t => t.name === `Imported ${today}`);
    expect(rootTopic).toBeDefined();
    expect(rootTopic.parentName).toBeNull();
  });

  it('creates the wrapper root plus all imported folders', () => {
    // wrapper + Work + Work/Projects + Personal = 4
    expect(plan.topicsToCreate).toHaveLength(4);
  });

  it('does not merge anything — topicsToMerge is empty', () => {
    expect(plan.topicsToMerge).toHaveLength(0);
  });

  it('prefixes chat targetTopicPath with the wrapper root name', () => {
    const today = new Date().toISOString().slice(0, 10);
    const rootName = `Imported ${today}`;
    for (const item of plan.chatsToImport) {
      expect(item.targetTopicPath).toMatch(new RegExp(`^${rootName}`));
    }
  });
});

// ─── executeImport ────────────────────────────────────────────────────────────

describe('executeImport()', () => {
  let parsedEntries;
  let plan;
  let tree;

  beforeEach(() => {
    parsedEntries = parseZipEntries(WELL_FORMED_ENTRIES);
    tree = cloneTree(EXISTING_TREE);
    plan = buildImportPlan(parsedEntries, null, 'merge');
  });

  it('returns a valid empty result when plan is null', () => {
    const result = executeImport(null, null, []);
    expect(result.updatedTopics).toEqual({});
    expect(result.updatedRootTopics).toEqual([]);
    expect(result.updatedChats).toEqual([]);
    expect(result.summary).toMatchObject({
      topicsCreated: 0,
      topicsMerged: 0,
      chatsImported: 0,
    });
    expect(Array.isArray(result.summary.errors)).toBe(true);
  });

  it('generates topic ids that start with "topic_imported_"', () => {
    const result = executeImport(plan, null, []);
    for (const id of Object.keys(result.updatedTopics)) {
      expect(id).toMatch(/^topic_imported_/);
    }
  });

  it('creates the correct number of new topics', () => {
    const result = executeImport(plan, null, []);
    // 3 topics: Work, Work/Projects, Personal
    expect(result.summary.topicsCreated).toBe(3);
    expect(Object.keys(result.updatedTopics)).toHaveLength(3);
  });

  it('imports the correct number of chats', () => {
    const result = executeImport(plan, null, []);
    expect(result.summary.chatsImported).toBe(2);
    expect(result.updatedChats).toHaveLength(2);
  });

  it('links each imported chat to its topic via the chatIds array', () => {
    const result = executeImport(plan, null, []);
    for (const chat of result.updatedChats) {
      if (chat.topicId) {
        const topic = result.updatedTopics[chat.topicId];
        expect(topic.chatIds).toContain(chat.id);
      }
    }
  });

  it('updates firstChatDate on the target topic', () => {
    const result = executeImport(plan, null, []);
    // At least one topic should have a non-null firstChatDate
    const hasDates = Object.values(result.updatedTopics).some(t => t.firstChatDate !== null);
    expect(hasDates).toBe(true);
  });

  it('updates lastChatDate on the target topic', () => {
    const result = executeImport(plan, null, []);
    const hasDates = Object.values(result.updatedTopics).some(t => t.lastChatDate !== null);
    expect(hasDates).toBe(true);
  });

  it('summary.topicsCreated equals the number of new topics created', () => {
    const result = executeImport(plan, null, []);
    expect(result.summary.topicsCreated).toBe(Object.keys(result.updatedTopics).length);
  });

  it('summary.topicsMerged equals the number of merge entries in the plan', () => {
    const mergePlan = buildImportPlan(parsedEntries, tree, 'merge');
    const result = executeImport(mergePlan, tree, EXISTING_CHATS);
    expect(result.summary.topicsMerged).toBe(mergePlan.topicsToMerge.length);
  });

  it('summary.chatsImported equals the number of chats added', () => {
    const result = executeImport(plan, null, []);
    expect(result.summary.chatsImported).toBe(result.updatedChats.length);
  });

  it('summary.errors is an array (empty when no errors occur)', () => {
    const result = executeImport(plan, null, []);
    expect(Array.isArray(result.summary.errors)).toBe(true);
    expect(result.summary.errors).toHaveLength(0);
  });

  it('does NOT mutate the original tree object', () => {
    const originalTree = cloneTree(EXISTING_TREE);
    const snapshot = JSON.stringify(originalTree);
    executeImport(plan, originalTree, []);
    expect(JSON.stringify(originalTree)).toBe(snapshot);
  });

  it('does NOT mutate the original chats array', () => {
    const originalChats = [...EXISTING_CHATS];
    const snapshot = JSON.stringify(originalChats);
    executeImport(plan, null, originalChats);
    expect(JSON.stringify(originalChats)).toBe(snapshot);
  });

  it('updatedChats contains the original chats plus newly imported ones', () => {
    const mergePlan = buildImportPlan(parsedEntries, tree, 'merge');
    const result = executeImport(mergePlan, tree, EXISTING_CHATS);
    // Should have 1 existing + 2 imported = 3
    expect(result.updatedChats).toHaveLength(EXISTING_CHATS.length + mergePlan.chatsToImport.length);
  });

  it('updatedTopics contains original topics plus all new topic entries', () => {
    const mergePlan = buildImportPlan(parsedEntries, tree, 'merge');
    const result = executeImport(mergePlan, tree, EXISTING_CHATS);
    // Original topics: topic-work, topic-proj (2) + 1 new topic (Personal) = 3
    const originalCount = Object.keys(tree.topics).length;
    const newCount = mergePlan.topicsToCreate.length;
    expect(Object.keys(result.updatedTopics)).toHaveLength(originalCount + newCount);
  });

  it('preserves original root topics alongside any new top-level topics', () => {
    const mergePlan = buildImportPlan(parsedEntries, tree, 'merge');
    const result = executeImport(mergePlan, tree, EXISTING_CHATS);
    // Original root: 'topic-work'; Personal should also be a new root
    expect(result.updatedRootTopics).toContain('topic-work');
  });

  it('merges chats into the correct existing topic when using merge strategy', () => {
    const mergePlan = buildImportPlan(parsedEntries, tree, 'merge');
    const result = executeImport(mergePlan, tree, EXISTING_CHATS);
    // The 'Projects' folder chat (project-alpha-discussion) targets topic-proj
    const projectsTopic = result.updatedTopics['topic-proj'];
    expect(projectsTopic.chatIds.length).toBeGreaterThan(0);
  });
});

// ─── Round-trip integration ───────────────────────────────────────────────────

describe('Round-trip: parseZipEntries → buildImportPlan → executeImport', () => {
  let result;

  beforeEach(() => {
    const parsed = parseZipEntries(WELL_FORMED_ENTRIES);
    const plan = buildImportPlan(parsed, null, 'merge');
    result = executeImport(plan, null, []);
  });

  it('produces the correct number of topics in updatedTopics', () => {
    // Work, Work/Projects, Personal = 3
    expect(Object.keys(result.updatedTopics)).toHaveLength(3);
  });

  it('produces the correct number of chats in updatedChats', () => {
    expect(result.updatedChats).toHaveLength(2);
  });

  it('creates a topic named "Work" in updatedTopics', () => {
    const names = Object.values(result.updatedTopics).map(t => t.name);
    expect(names).toContain('Work');
  });

  it('creates a topic named "Projects" in updatedTopics', () => {
    const names = Object.values(result.updatedTopics).map(t => t.name);
    expect(names).toContain('Projects');
  });

  it('creates a topic named "Personal" in updatedTopics', () => {
    const names = Object.values(result.updatedTopics).map(t => t.name);
    expect(names).toContain('Personal');
  });

  it('sets "Projects" as a child of "Work"', () => {
    const workTopic = Object.values(result.updatedTopics).find(t => t.name === 'Work');
    const projTopic = Object.values(result.updatedTopics).find(t => t.name === 'Projects');
    expect(workTopic.children).toContain(projTopic.id);
    expect(projTopic.parentId).toBe(workTopic.id);
  });

  it('has "Work" and "Personal" as root topics', () => {
    const rootNames = result.updatedRootTopics.map(id => result.updatedTopics[id].name);
    expect(rootNames).toContain('Work');
    expect(rootNames).toContain('Personal');
  });

  it('preserves the full markdown content in updatedChats[*].content', () => {
    const alphaChat = result.updatedChats.find(c => c.title === 'Project Alpha Discussion');
    expect(alphaChat).toBeDefined();
    const expectedMd = WELL_FORMED_ENTRIES.find(e =>
      e.path.includes('project-alpha-discussion'),
    ).content;
    expect(alphaChat.content).toBe(expectedMd);
  });

  it('assigns each chat to a non-null topicId after executeImport', () => {
    for (const chat of result.updatedChats) {
      expect(chat.topicId).not.toBeNull();
    }
  });

  it('all topic ids in updatedRootTopics exist as keys in updatedTopics', () => {
    for (const id of result.updatedRootTopics) {
      expect(result.updatedTopics).toHaveProperty(id);
    }
  });

  it('all chatIds stored on topics reference actual chats in updatedChats', () => {
    const chatIdSet = new Set(result.updatedChats.map(c => c.id));
    for (const topic of Object.values(result.updatedTopics)) {
      for (const chatId of topic.chatIds) {
        expect(chatIdSet.has(chatId)).toBe(true);
      }
    }
  });
});
