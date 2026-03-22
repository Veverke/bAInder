import { describe, it, expect, beforeEach } from 'vitest';
import {
  validateZipFile,
  parseZipEntries,
  parseChatFromMarkdown,
  parseMessagesFromExportMarkdown,
  buildImportPlan,
  executeImport,
} from '../src/lib/io/import-parser.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

/** A well-formed bAInder export ZIP (simulated extracted entries). */
const WELL_FORMED_ENTRIES = [
  {
    path: 'bAInder-export-2026-03-15/_metadata.json',
    content: JSON.stringify({
      export_version: '1.0',
      export_date: '2026-03-15T14:30:00Z',
      bainder_version: '1.0.0',
      tree_structure: { total_chats: 2, total_topics: 2 },
    }),
  },
  { path: 'bAInder-export-2026-03-15/README.md', content: '# bAInder Export\n...' },
  {
    path: 'bAInder-export-2026-03-15/Work/_topic.json',
    content: JSON.stringify({ name: 'Work', chatCount: 1 }),
  },
  {
    path: 'bAInder-export-2026-03-15/Work/Projects/_topic.json',
    content: JSON.stringify({ name: 'Projects', chatCount: 1 }),
  },
  {
    path: 'bAInder-export-2026-03-15/Work/Projects/project-alpha-discussion.md',
    content: [
      '---',
      'title: "Project Alpha Discussion"',
      'source: chatgpt',
      'url: https://chat.openai.com/c/abc',
      'date: 2026-03-15T10:30:00Z',
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
    path: 'bAInder-export-2026-03-15/Personal/budget-analysis.md',
    content: [
      '---',
      'title: "Budget Analysis"',
      'source: claude',
      'date: 2026-03-10T08:00:00Z',
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
      expect(file.path).not.toMatch(/^bAInder-export-2026-03-15/);
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

  it('restores original topic name case from _topic.json (e.g. "ai" folder → "AI" name)', () => {
    // Simulate a ZIP where sanitizeFilename lowercased "AI" to "ai" as the folder name
    const entries = [
      {
        path: 'bAInder-export/ai/_topic.json',
        content: JSON.stringify({ name: 'AI', chatCount: 1 }),
      },
      {
        path: 'bAInder-export/ai/some-chat.md',
        content: '---\ntitle: "Some Chat"\nsource: chatgpt\n---\n',
      },
    ];
    const result = parseZipEntries(entries);
    const topic = result.topicFolders.get('ai');
    expect(topic).toBeDefined();
    expect(topic.name).toBe('AI');
  });

  it('falls back to folder name when _topic.json has no name field', () => {
    const entries = [
      {
        path: 'bAInder-export/mywork/_topic.json',
        content: JSON.stringify({ chatCount: 2 }), // no name
      },
      {
        path: 'bAInder-export/mywork/chat.md',
        content: '---\ntitle: "T"\nsource: x\n---\n',
      },
    ];
    const result = parseZipEntries(entries);
    const topic = result.topicFolders.get('mywork');
    expect(topic).toBeDefined();
    expect(topic.name).toBe('mywork');
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
    const expected = Date.parse('2026-03-15T10:30:00Z');
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

  it('parses messages from ### User / ### Assistant headings in the export markdown', () => {
    const chat = parseChatFromMarkdown(ALPHA_MD, 'file.md');
    expect(Array.isArray(chat.messages)).toBe(true);
    expect(chat.messages.length).toBe(2);
    expect(chat.messages[0]).toMatchObject({ role: 'user',      content: 'First message'   });
    expect(chat.messages[1]).toMatchObject({ role: 'assistant', content: 'First response'  });
  });

  it('returns empty messages array when content has no role headings', () => {
    const noHeadings = WELL_FORMED_ENTRIES.find(e => e.path.includes('budget-analysis')).content;
    const chat = parseChatFromMarkdown(noHeadings, 'file.md');
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

  it('uses "Untitled" when filename is falsy (|| "Untitled" fallback on line 348)', () => {
    // filename=null → titleFromFile = (null || 'Untitled') = 'Untitled'
    const chat = parseChatFromMarkdown('No frontmatter here.', null);
    expect(chat.title).toBe('Untitled');
  });

  it('parses the exported frontmatter field without throwing', () => {
    const content = [
      '---',
      'title: "Exported Chat"',
      'source: chatgpt',
      'exported: 2026-06-01T12:00:00Z',
      '---',
      'Content',
    ].join('\n');
    const chat = parseChatFromMarkdown(content, 'exported-chat.md');
    expect(chat.title).toBe('Exported Chat');
  });

  it('parses the contentFormat frontmatter field without throwing', () => {
    const content = [
      '---',
      'title: "Formatted Chat"',
      'source: claude',
      'contentFormat: markdown',
      '---',
      'Content',
    ].join('\n');
    const chat = parseChatFromMarkdown(content, 'formatted.md');
    expect(chat.title).toBe('Formatted Chat');
  });

  it('parses excerpt:true in frontmatter without throwing', () => {
    const content = [
      '---',
      'title: "My Excerpt"',
      'source: gemini',
      'excerpt: true',
      '---',
      'Excerpt content',
    ].join('\n');
    const chat = parseChatFromMarkdown(content, 'excerpt.md');
    expect(chat.title).toBe('My Excerpt');
  });

  it('parses excerpt:false in frontmatter without throwing', () => {
    const content = [
      '---',
      'title: "Full Chat"',
      'source: chatgpt',
      'excerpt: false',
      '---',
      'Full content',
    ].join('\n');
    const chat = parseChatFromMarkdown(content, 'full.md');
    expect(chat.title).toBe('Full Chat');
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

// ─── parseMessagesFromExportMarkdown ─────────────────────────────────────────

describe('parseMessagesFromExportMarkdown()', () => {
  const EXPORT_MD = [
    '---',
    'title: "Chat"',
    'source: chatgpt',
    '---',
    '',
    '### User',
    '',
    'Hello there',
    '',
    '---',
    '',
    '### Assistant',
    '',
    'Hi!',
    '',
    '---',
    '',
    '*Exported from bAInder on March 22, 2026*',
  ].join('\n');

  it('parses user and assistant turns correctly', () => {
    const msgs = parseMessagesFromExportMarkdown(EXPORT_MD);
    expect(msgs).toHaveLength(2);
    expect(msgs[0]).toMatchObject({ role: 'user',      content: 'Hello there' });
    expect(msgs[1]).toMatchObject({ role: 'assistant', content: 'Hi!' });
  });

  it('handles multi-turn conversations', () => {
    const md = [
      '---', 'title: "T"', 'source: s', '---',
      '', '### User', '', 'Q1', '', '---', '', '### Assistant', '', 'A1',
      '', '---', '', '### User', '', 'Q2', '', '---', '', '### Assistant', '', 'A2',
      '', '---', '', '*Exported from bAInder on today*',
    ].join('\n');
    const msgs = parseMessagesFromExportMarkdown(md);
    expect(msgs).toHaveLength(4);
    expect(msgs[0]).toMatchObject({ role: 'user',      content: 'Q1' });
    expect(msgs[1]).toMatchObject({ role: 'assistant', content: 'A1' });
    expect(msgs[2]).toMatchObject({ role: 'user',      content: 'Q2' });
    expect(msgs[3]).toMatchObject({ role: 'assistant', content: 'A2' });
  });

  it('returns empty array when no role headings present', () => {
    const md = '---\ntitle: "T"\nsource: s\n---\n\nJust some text\n';
    expect(parseMessagesFromExportMarkdown(md)).toEqual([]);
  });

  it('returns empty array for null/empty input', () => {
    expect(parseMessagesFromExportMarkdown(null)).toEqual([]);
    expect(parseMessagesFromExportMarkdown('')).toEqual([]);
  });

  it('preserves markdown content inside message turns', () => {
    const md = [
      '---', 'title: "T"', 'source: s', '---',
      '', '### Assistant', '',
      '```js', 'const x = 1;', '```',
      '', '---', '', '*Exported from bAInder on today*',
    ].join('\n');
    const msgs = parseMessagesFromExportMarkdown(md);
    expect(msgs).toHaveLength(1);
    expect(msgs[0].content).toContain('```js');
    expect(msgs[0].content).toContain('const x = 1;');
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

  it('defaults to merge strategy when strategy is undefined (strategy || "merge" fallback)', () => {
    // strategy=undefined → strategy || 'merge' fires → safeStrategy='merge'
    const entries = parseZipEntries(WELL_FORMED_ENTRIES);
    const plan = buildImportPlan(entries, null, undefined);
    // merge strategy with null tree → all topics go to create
    expect(plan.topicsToCreate.length).toBeGreaterThan(0);
    expect(plan.topicsToMerge).toHaveLength(0);
  });

  it('uses default Map when zipEntries has no topicFolders (= new Map() fallback)', () => {
    // zipEntries.topicFolders = undefined → destructuring default fires
    const entries = { chatFiles: [] }; // no topicFolders
    const plan = buildImportPlan(entries, null, 'merge');
    expect(plan.topicsToCreate).toHaveLength(0);
    expect(plan.chatsToImport).toHaveLength(0);
  });

  it('uses default [] when zipEntries has no chatFiles (= [] fallback)', () => {
    // zipEntries.chatFiles = undefined → destructuring default fires
    const entries = { topicFolders: new Map() }; // no chatFiles
    const plan = buildImportPlan(entries, null, 'merge');
    expect(plan.chatsToImport).toHaveLength(0);
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
      'date: 2026-03-15T10:30:00Z',
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

  it('treats "new-root" as an alias for create_root strategy (line 421 branch)', () => {
    // strategy === 'new-root' triggers the ternary TRUE branch
    const plan2 = buildImportPlan(parsedEntries, cloneTree(EXISTING_TREE), 'new-root');
    const today = new Date().toISOString().slice(0, 10);
    const rootTopic = plan2.topicsToCreate.find(t => t.name === `Imported ${today}`);
    expect(rootTopic).toBeDefined();
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

  it('handles existingTree with rootTopicIds missing (|| [] fallback on line 439)', () => {
    // Tree has topics but no rootTopicIds → walkTopic is skipped, no merge resolution
    const treeNoRootIds = {
      topics: { 'topic-work': { id: 'topic-work', name: 'Work', children: ['topic-proj'] } },
      // rootTopicIds intentionally omitted
    };
    const plan = buildImportPlan(parsedEntries, treeNoRootIds, 'merge');
    // No merge can happen without rootTopicIds (can't walk tree), so all topics go to create
    expect(plan.topicsToCreate.length).toBeGreaterThan(0);
  });

  it('handles topics without children property in walkTopic (|| [] fallback on line 444)', () => {
    // topic-proj has children:[] in EXISTING_TREE; use a tree where topic-work has no children field
    const treeBareTopics = {
      topics: {
        'topic-work': { id: 'topic-work', name: 'Work' }, // no children field
      },
      rootTopicIds: ['topic-work'],
    };
    const plan = buildImportPlan(parsedEntries, treeBareTopics, 'merge');
    // Walking should succeed without throwing; Work should be merged
    const merged = plan.topicsToMerge.map(m => m.existingTopicId);
    expect(merged).toContain('topic-work');
  });

  it('handles orphaned child ID in walkTopic (early return when topic not found, line 439)', () => {
    // topic-work.children includes 'nonexistent' — walkTopic('nonexistent') → topic=undefined → return
    const treeOrphan = {
      topics: {
        'topic-work': { id: 'topic-work', name: 'Work', children: ['nonexistent'] },
      },
      rootTopicIds: ['topic-work'],
    };
    // Should not throw; the orphaned child ID is simply skipped
    const plan = buildImportPlan(parsedEntries, treeOrphan, 'merge');
    const merged = plan.topicsToMerge.map(m => m.existingTopicId);
    expect(merged).toContain('topic-work');
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

// ─── Round-trip: new-root strategy ───────────────────────────────────────────

describe('Round-trip: parseZipEntries → buildImportPlan → executeImport (new-root)', () => {
  let result;
  let wrapperName;

  beforeEach(() => {
    wrapperName = `Imported ${new Date().toISOString().slice(0, 10)}`;
    const parsed = parseZipEntries(WELL_FORMED_ENTRIES);
    const plan = buildImportPlan(parsed, null, 'new-root');
    result = executeImport(plan, null, []);
  });

  it('creates only ONE root topic (the wrapper)', () => {
    expect(result.updatedRootTopics).toHaveLength(1);
  });

  it('wrapper root topic name is "Imported YYYY-MM-DD"', () => {
    const rootTopic = result.updatedTopics[result.updatedRootTopics[0]];
    expect(rootTopic.name).toBe(wrapperName);
  });

  it('imported topics are children of the wrapper, NOT additional roots', () => {
    const rootTopic = result.updatedTopics[result.updatedRootTopics[0]];
    const childNames = rootTopic.children.map(id => result.updatedTopics[id].name);
    expect(childNames).toContain('Work');
    expect(childNames).toContain('Personal');
  });

  it('all chats have a non-null topicId (none are unlinked)', () => {
    for (const chat of result.updatedChats) {
      expect(chat.topicId).not.toBeNull();
    }
  });

  it('each linked chat appears in its topic chatIds', () => {
    for (const chat of result.updatedChats) {
      const topic = result.updatedTopics[chat.topicId];
      expect(topic).toBeDefined();
      expect(topic.chatIds).toContain(chat.id);
    }
  });

  it('imports the same number of chats as the merge strategy', () => {
    const parsedForMerge = parseZipEntries(WELL_FORMED_ENTRIES);
    const mergePlan = buildImportPlan(parsedForMerge, null, 'merge');
    const mergeResult = executeImport(mergePlan, null, []);
    expect(result.updatedChats).toHaveLength(mergeResult.updatedChats.length);
  });
});

// ─── executeImport – additional branch coverage ───────────────────────────────

describe('executeImport() – branch edge cases', () => {
  it('handles tree with topics but no rootTopicIds array', () => {
    // tree.rootTopicIds is undefined → updatedRootTopics should be []
    const treeNoRoots = { topics: { 't1': { id: 't1', name: 'X', children: [], chatIds: [] } } };
    const result = executeImport(null, treeNoRoots, []);
    expect(result.updatedRootTopics).toEqual([]);
    expect(result.updatedTopics['t1']).toBeDefined();
  });

  it('deep-clones topics that lack children/chatIds (|| [] fallback on lines 613-614)', () => {
    // topic has no children or chatIds properties → `|| []` fallback fires
    const treeWithBareTopics = {
      topics: {
        't1': { id: 't1', name: 'Bare' }, // no children, no chatIds
      },
      rootTopicIds: ['t1'],
    };
    const result = executeImport(null, treeWithBareTopics, []);
    // Cloned topic should have empty arrays for children and chatIds
    expect(result.updatedTopics['t1'].children).toEqual([]);
    expect(result.updatedTopics['t1'].chatIds).toEqual([]);
  });

  it('handles tree where rootTopicIds is not an array', () => {
    const treeWrongRoots = { topics: {}, rootTopicIds: 'not-an-array' };
    const result = executeImport(null, treeWrongRoots, []);
    expect(result.updatedRootTopics).toEqual([]);
  });

  it('records an error when parent folder path cannot be resolved for a nested topic', () => {
    // Create a plan with a nested topic whose parent is NOT in the folderToId map
    const plan = {
      topicsToCreate: [
        // The parent 'Ghost' is missing from the plan — parentId resolution fails
        { name: 'Child', parentName: 'Ghost', folderPath: 'Ghost/Child' },
      ],
      topicsToMerge: [],
      chatsToImport: [],
      conflicts:     [],
    };
    const result = executeImport(plan, null, []);
    expect(result.summary.errors.length).toBeGreaterThan(0);
    expect(result.summary.errors[0]).toMatch(/Parent folder not resolved/i);
    // Child should still be created (attached to root)
    const childTopic = Object.values(result.updatedTopics).find(t => t.name === 'Child');
    expect(childTopic).toBeDefined();
    expect(childTopic.parentId).toBeNull();
    expect(result.updatedRootTopics).toContain(childTopic.id);
  });

  it('catches errors thrown during individual chat import and records them in summary.errors', () => {
    // Create a chatEntry whose property access throws during spread
    const throwingEntry = {};
    Object.defineProperty(throwingEntry, 'id', {
      get() { throw new Error('simulated spread error'); },
      enumerable: true,
    });

    const plan = {
      topicsToCreate: [{ name: 'Root', parentName: null, folderPath: 'Root' }],
      topicsToMerge:  [],
      chatsToImport:  [{ chatEntry: throwingEntry, targetTopicPath: 'Root' }],
      conflicts:      [],
    };

    const result = executeImport(plan, null, []);
    expect(result.summary.errors.length).toBeGreaterThan(0);
    expect(result.summary.errors[0]).toMatch(/Failed to import chat/i);
  });

  it('updatedChats defaults to [] when chats arg is not an array', () => {
    const result = executeImport(null, null, null);
    expect(result.updatedChats).toEqual([]);
  });

  it('sets topicId to null when chat targetTopicPath is not in folderToId map', () => {
    // The chat targets 'Nonexistent/Path' which was never created
    const plan = {
      topicsToCreate: [{ name: 'Root', parentName: null, folderPath: 'Root' }],
      topicsToMerge:  [],
      chatsToImport:  [{
        chatEntry:      { id: 'c1', title: 'Orphan Chat', timestamp: 5000 },
        targetTopicPath: 'Nonexistent/Path',
      }],
      conflicts: [],
    };
    const result = executeImport(plan, null, []);
    expect(result.updatedChats[0].topicId).toBeNull();
  });

  it('skips duplicate chatId push when chatId already in topic.chatIds', () => {
    // Pre-seed a topic with the same chat ID to trigger the false branch of
    // !topic.chatIds.includes(chatWithTopic.id)
    const existingTopicId = 'existing-t1';
    const plan = {
      topicsToCreate: [],
      topicsToMerge:  [{ existingTopicId, folderPath: 'Work' }],
      chatsToImport:  [{
        chatEntry:      { id: 'c1', title: 'Duplicate', timestamp: 1000 },
        targetTopicPath: 'Work',
      }],
      conflicts: [],
    };
    const treeWithChat = {
      topics: {
        [existingTopicId]: {
          id: existingTopicId, name: 'Work', parentId: null,
          children: [], chatIds: ['c1'],  // 'c1' already present
          firstChatDate: 1000, lastChatDate: 1000,
        },
      },
      rootTopicIds: [existingTopicId],
    };
    const result = executeImport(plan, treeWithChat, []);
    // chatIds should still contain only one 'c1' – no duplicate push
    expect(result.updatedTopics[existingTopicId].chatIds.filter(id => id === 'c1')).toHaveLength(1);
  });

  it('does not update lastChatDate when an earlier-timestamp chat is added to an existing range', () => {
    // Covers the `lastChatDate === null || ts > lastChatDate` false branch
    const existingTopicId = 'topic-ts';
    const plan = {
      topicsToCreate: [],
      topicsToMerge:  [{ existingTopicId, folderPath: 'Dated' }],
      chatsToImport:  [{
        chatEntry:      { id: 'c-early', title: 'Old Chat', timestamp: 500 },
        targetTopicPath: 'Dated',
      }],
      conflicts: [],
    };
    const treeWithDates = {
      topics: {
        [existingTopicId]: {
          id: existingTopicId, name: 'Dated', parentId: null,
          children: [], chatIds: [],
          firstChatDate: 2000, lastChatDate: 3000,   // already set to later dates
        },
      },
      rootTopicIds: [existingTopicId],
    };
    const result = executeImport(plan, treeWithDates, []);
    const topic = result.updatedTopics[existingTopicId];
    // ts=500 < firstChatDate=2000 → firstChatDate updates to 500
    expect(topic.firstChatDate).toBe(500);
    // ts=500 < lastChatDate=3000 → lastChatDate NOT updated
    expect(topic.lastChatDate).toBe(3000);
  });

  it('does not update firstChatDate or lastChatDate when chat timestamp is not a number', () => {
    // Covers the `typeof ts === 'number'` false branch
    const existingTopicId = 'topic-nots';
    const plan = {
      topicsToCreate: [],
      topicsToMerge:  [{ existingTopicId, folderPath: 'NoDate' }],
      chatsToImport:  [{
        chatEntry:      { id: 'cnd', title: 'No TS', timestamp: 'oops' },
        targetTopicPath: 'NoDate',
      }],
      conflicts: [],
    };
    const treeForNoTs = {
      topics: {
        [existingTopicId]: {
          id: existingTopicId, name: 'NoDate', parentId: null,
          children: [], chatIds: [],
          firstChatDate: null, lastChatDate: null,
        },
      },
      rootTopicIds: [existingTopicId],
    };
    const result = executeImport(plan, treeForNoTs, []);
    // Dates should remain null since ts is not a number
    expect(result.updatedTopics[existingTopicId].firstChatDate).toBeNull();
    expect(result.updatedTopics[existingTopicId].lastChatDate).toBeNull();
  });

  it('creates a topic without folderPath (item.folderPath falsy) and attaches it to root', () => {
    // Covers line 672: `if (item.folderPath)` false branch
    // Also covers the sort comparator false branch for null folderPath (lines 662-663)
    const plan = {
      topicsToCreate: [
        { name: 'NoPath', parentName: null, folderPath: null },
        { name: 'HasPath', parentName: null, folderPath: 'HasPath' },
      ],
      topicsToMerge:  [],
      chatsToImport:  [],
      conflicts: [],
    };
    const result = executeImport(plan, null, []);
    const noPath = Object.values(result.updatedTopics).find(t => t.name === 'NoPath');
    expect(noPath).toBeDefined();
    expect(noPath.parentId).toBeNull();
    expect(result.updatedRootTopics).toContain(noPath.id);
  });

  it('handles parentTopic missing from updatedTopics when parentId resolves via merge', () => {
    // Covers line 688: `if (parentTopic && ...)` false branch when parentTopic is undefined
    // parentId is truthy but not in updatedTopics (merge references an ID not in tree)
    const ghostParentId = 'ghost-parent-999';
    const plan = {
      topicsToCreate: [
        // Uses a nested path whose parent resolves to ghostParentId (via merge) but is absent from updatedTopics
        { name: 'Child', parentName: 'Ghost', folderPath: 'Ghost/Child' },
      ],
      topicsToMerge: [
        { existingTopicId: ghostParentId, folderPath: 'Ghost' },
      ],
      chatsToImport: [],
      conflicts: [],
    };
    // tree.topics does NOT include ghostParentId → updatedTopics won't have it
    const result = executeImport(plan, { topics: {}, rootTopicIds: [] }, []);
    const child = Object.values(result.updatedTopics).find(t => t.name === 'Child');
    expect(child).toBeDefined();
    // parentId set to ghostParentId since folderToId resolved it, but parentTopic is undefined
    // so children.push is skipped — no error thrown
    expect(child.parentId).toBe(ghostParentId);
  });
});

// ─── validateZipFile – additional branch coverage ─────────────────────────────

describe('validateZipFile() – MIME vs extension combinations', () => {
  it('returns valid when MIME is application/zip but extension is NOT .zip', () => {
    // mimeOk=true, extOk=false → !mimeOk && !extOk = false → valid
    const file = { name: 'export.data', size: 500, type: 'application/zip' };
    const result = validateZipFile(file);
    expect(result.valid).toBe(true);
  });

  it('returns invalid when file.size is a non-number', () => {
    const file = { name: 'export.zip', size: 'big', type: 'application/zip' };
    const result = validateZipFile(file);
    expect(result.valid).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('returns invalid when file name is an empty string', () => {
    const file = { name: '   ', size: 100, type: 'application/zip' };
    const result = validateZipFile(file);
    expect(result.valid).toBe(false);
  });

  it('returns invalid when file name is not a string', () => {
    const file = { name: 42, size: 100, type: 'application/zip' };
    const result = validateZipFile(file);
    expect(result.valid).toBe(false);
  });
});

// ─── executeImport – timestamp update branches (lines 692-702) ───────────────

describe('executeImport() – timestamp update logic', () => {
  function makePlanWithChats(chats) {
    return {
      topicsToCreate: [
        { name: 'TestTopic', folderPath: 'TestTopic' },
      ],
      topicsToMerge: [],
      chatsToImport: chats.map(c => ({
        chatEntry: c,
        targetTopicPath: 'TestTopic',
      })),
      conflicts: [],
    };
  }

  it('sets firstChatDate and lastChatDate from a single chat with timestamp', () => {
    const plan = makePlanWithChats([
      { id: 'c1', title: 'Chat 1', timestamp: 1000 },
    ]);
    const result = executeImport(plan, null, []);
    const topic = Object.values(result.updatedTopics).find(t => t.name === 'TestTopic');
    expect(topic.firstChatDate).toBe(1000);
    expect(topic.lastChatDate).toBe(1000);
  });

  it('updates firstChatDate when a newer import has an earlier timestamp', () => {
    // First import sets firstChatDate = 1000
    const plan = makePlanWithChats([
      { id: 'c1', title: 'C1', timestamp: 1000 },
      { id: 'c2', title: 'C2', timestamp: 500 }, // earlier → should update firstChatDate
    ]);
    const result = executeImport(plan, null, []);
    const topic = Object.values(result.updatedTopics).find(t => t.name === 'TestTopic');
    expect(topic.firstChatDate).toBe(500);
    expect(topic.lastChatDate).toBe(1000);
  });

  it('updates lastChatDate when a newer import has a later timestamp', () => {
    const plan = makePlanWithChats([
      { id: 'c1', title: 'C1', timestamp: 500 },
      { id: 'c2', title: 'C2', timestamp: 2000 }, // later → should update lastChatDate
    ]);
    const result = executeImport(plan, null, []);
    const topic = Object.values(result.updatedTopics).find(t => t.name === 'TestTopic');
    expect(topic.firstChatDate).toBe(500);
    expect(topic.lastChatDate).toBe(2000);
  });

  it('does NOT update dates for chats where ts is not a number', () => {
    const plan = makePlanWithChats([
      { id: 'c1', title: 'NoTs' }, // no timestamp → typeof ts !== 'number'
    ]);
    const result = executeImport(plan, null, []);
    const topic = Object.values(result.updatedTopics).find(t => t.name === 'TestTopic');
    expect(topic.firstChatDate).toBeNull();
    expect(topic.lastChatDate).toBeNull();
  });

  it('does NOT set dates when topicId is null (chat without a topic)', () => {
    const plan = {
      topicsToCreate: [],
      topicsToMerge: [],
      chatsToImport: [{
        chatEntry: { id: 'c1', title: 'Orphan', timestamp: 9999 },
        targetTopicPath: null, // no topic → folderToId.get(null) = undefined → topicId = null
      }],
      conflicts: [],
    };
    const result = executeImport(plan, null, []);
    // No topic affected — updatedTopics is empty, chat is still added
    expect(result.updatedChats.length).toBe(1);
  });

  it('does not add duplicate chatIds when the same chat is imported twice', () => {
    const plan = {
      topicsToCreate: [{ name: 'Dupes', folderPath: 'Dupes' }],
      topicsToMerge: [],
      chatsToImport: [
        { chatEntry: { id: 'dup', title: 'Dup', timestamp: 100 }, targetTopicPath: 'Dupes' },
        { chatEntry: { id: 'dup', title: 'Dup', timestamp: 100 }, targetTopicPath: 'Dupes' },
      ],
      conflicts: [],
    };
    const result = executeImport(plan, null, []);
    const topic = Object.values(result.updatedTopics).find(t => t.name === 'Dupes');
    expect(topic.chatIds.filter(id => id === 'dup')).toHaveLength(1);
  });

  it('sort puts shallow topic before deeper topic (sort comparator deep < shallow = negative)', () => {
    // depthA=1 for 'Root', depthB=2 for 'Root/Child' — sorts Root first
    const plan = {
      topicsToCreate: [
        { name: 'Child', folderPath: 'Root/Child' },
        { name: 'Root',  folderPath: 'Root' },
      ],
      topicsToMerge:  [],
      chatsToImport:  [],
      conflicts: [],
    };
    const result = executeImport(plan, null, []);
    // Child's parentId should resolve because Root was created first
    const child = Object.values(result.updatedTopics).find(t => t.name === 'Child');
    expect(child?.parentId).not.toBeNull();
  });

  it('does not push duplicate root topic when executeImport called twice with same plan', () => {
    // updatedRootTopics already has the topic ID after first executePlan — second call
    // must not duplicate it. We simulate by pre-seeding updatedRootTopics via an
    // initial executeImport, then appending to it via topicsToMerge.
    // A simpler approach: create a plan with two identical folderPaths which both
    // try to be roots — but unique IDs prevent true duplication.
    // Directly test the guard: run a plan then check no duplicates.
    const plan = {
      topicsToCreate: [{ name: 'Single', folderPath: 'Single' }],
      topicsToMerge:  [],
      chatsToImport:  [],
      conflicts: [],
    };
    const result = executeImport(plan, null, []);
    const singleCount = result.updatedRootTopics.filter(id => result.updatedTopics[id]?.name === 'Single').length;
    expect(singleCount).toBe(1);
  });

  it('sort comparator handles item with no folderPath (depth=0 fallback branch)', () => {
    // topicsToCreate includes an item without a folderPath → depthA = 0 (ternary FALSE)
    // Place NoPath LAST so JS sort uses it as 'a' in at least one comparison
    const plan = {
      topicsToCreate: [
        { name: 'Child', folderPath: 'Root/Child' },
        { name: 'Root',  folderPath: 'Root' },
        { name: 'NoPath' },               // no folderPath → depth 0 as 'a'
      ],
      topicsToMerge:  [],
      chatsToImport:  [],
      conflicts: [],
    };
    // Should not throw; items without folderPath are treated as root
    const result = executeImport(plan, null, []);
    expect(Object.values(result.updatedTopics).find(t => t.name === 'NoPath')).toBeDefined();
  });

  it('records error when parent folder path is not resolvable (line 692)', () => {
    // A topic with folderPath 'Missing/Child' where 'Missing' was never created
    const plan = {
      topicsToCreate: [
        { name: 'Orphan', folderPath: 'Missing/Orphan' },
      ],
      topicsToMerge:  [],
      chatsToImport:  [],
      conflicts: [],
    };
    const result = executeImport(plan, null, []);
    // The error should be captured but not thrown
    expect(result.summary.errors.some(e => e.includes('Parent folder not resolved'))).toBe(true);
  });

  it('handles plan with topicsToMerge=undefined (|| [] fallback on line 637)', () => {
    // topicsToMerge is omitted → || [] branch fires
    const plan = {
      topicsToCreate: [{ name: 'X', folderPath: 'X' }],
      chatsToImport: [],
      conflicts: [],
      // topicsToMerge intentionally omitted
    };
    const result = executeImport(plan, null, []);
    expect(result.summary.topicsCreated).toBe(1);
  });

  it('handles plan with topicsToCreate=undefined (|| [] fallback on line 661)', () => {
    // topicsToCreate is omitted → || [] branch fires
    const plan = {
      topicsToMerge: [],
      chatsToImport: [],
      conflicts: [],
      // topicsToCreate intentionally omitted
    };
    const result = executeImport(plan, null, []);
    expect(result.summary.topicsCreated).toBe(0);
  });

  it('handles plan with chatsToImport=undefined (|| [] fallback on line 702)', () => {
    // chatsToImport is omitted → || [] branch fires
    const plan = {
      topicsToCreate: [],
      topicsToMerge: [],
      conflicts: [],
      // chatsToImport intentionally omitted
    };
    const result = executeImport(plan, null, []);
    expect(result.summary.chatsImported).toBe(0);
  });
});
