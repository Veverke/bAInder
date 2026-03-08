/**
 * import-parser.js
 *
 * Pure ES module for parsing bAInder ZIP export data.
 * No side effects, no DOM access, no external dependencies.
 * Receives pre-extracted ZIP content and returns structured data
 * ready for storage.
 */

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Generate a short random alphanumeric string of the given length.
 * @param {number} len
 * @returns {string}
 */
function randomHex(len) {
  let s = '';
  while (s.length < len) {
    s += Math.random().toString(36).slice(2);
  }
  return s.slice(0, len);
}

/**
 * Minimal YAML frontmatter parser.  Mirrors the approach used by
 * `parseFrontmatter` in markdown-serialiser.js — handles only the
 * key:value pairs present in bAInder export files.
 *
 * @param {string} markdown
 * @returns {Record<string, string|number|boolean>}
 */
function parseFrontmatter(markdown) {
  if (!markdown || typeof markdown !== 'string') return {};
  if (!markdown.startsWith('---')) return {};

  const endIdx = markdown.indexOf('\n---', 3);
  if (endIdx === -1) return {};

  const block = markdown.slice(3, endIdx).trim();
  const result = {};

  for (const line of block.split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    const raw = line.slice(colonIdx + 1).trim();

    switch (key) {
      case 'title': {
        const m = raw.match(/^"(.*)"$/s);
        result.title = m ? m[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\') : raw;
        break;
      }
      case 'source':
        result.source = raw;
        break;
      case 'url':
        result.url = raw;
        break;
      case 'date':
        result.date = raw;
        break;
      case 'topic':
        result.topic = raw;
        break;
      case 'chat_id':
        result.chat_id = raw;
        break;
      case 'exported':
        result.exported = raw;
        break;
      case 'contentFormat':
        result.contentFormat = raw;
        break;
      case 'messageCount':
        result.messageCount = parseInt(raw, 10);
        break;
      case 'excerpt':
        result.excerpt = raw === 'true';
        break;
    }
  }

  return result;
}

/**
 * Normalise a ZIP entry path to use forward slashes and strip any
 * leading slash.
 * @param {string} p
 * @returns {string}
 */
function normalisePath(p) {
  return (p || '').replace(/\\/g, '/').replace(/^\//, '');
}

/**
 * Return all path segments (folder parts) that appear before the
 * filename component.
 * @param {string} filePath  e.g. "Work/Projects/chat.md"
 * @returns {string}         e.g. "Work/Projects"
 */
function dirOf(filePath) {
  const parts = normalisePath(filePath).split('/');
  parts.pop(); // remove filename
  return parts.join('/');
}

/**
 * Return just the filename from a path.
 * @param {string} filePath
 * @returns {string}
 */
function basename(filePath) {
  const parts = normalisePath(filePath).split('/');
  return parts[parts.length - 1] || '';
}

/**
 * Strip the root export folder prefix from a path.
 * E.g. "bAInder-export-2026-03-15/Work/Projects/chat.md" →
 *      "Work/Projects/chat.md"
 * The root folder is assumed to be the first path segment when
 * every entry shares the same leading segment.
 *
 * @param {string} path
 * @param {string} rootFolder  first segment to strip (may be empty)
 * @returns {string}
 */
function stripRoot(path, rootFolder) {
  if (!rootFolder) return path;
  const prefix = rootFolder + '/';
  return path.startsWith(prefix) ? path.slice(prefix.length) : path;
}

/**
 * Detect the common root folder shared by all entries (if any).
 * Returns an empty string when entries have no common root or the
 * ZIP uses flat paths.
 *
 * @param {Array<{path: string}>} entries
 * @returns {string}
 */
function detectRootFolder(entries) {
  if (!entries || entries.length === 0) return '';

  const firstSegments = entries.map(e => {
    const parts = normalisePath(e.path).split('/');
    return parts.length > 1 ? parts[0] : '';
  });

  const candidate = firstSegments[0];
  if (!candidate) return '';

  const allMatch = firstSegments.every(s => s === candidate);
  return allMatch ? candidate : '';
}

/**
 * Parse a date string or ISO timestamp into a Unix millisecond value.
 * Returns `Date.now()` when the input cannot be parsed.
 *
 * @param {string|undefined} dateStr
 * @returns {number}
 */
function parseDateToMs(dateStr) {
  if (!dateStr) return Date.now();
  const ms = Date.parse(dateStr);
  return isNaN(ms) ? Date.now() : ms;
}

// ─── Exported functions ───────────────────────────────────────────────────────

/**
 * Parse the flat list of ZIP entries produced by JSZip (or equivalent)
 * into structured data ready for `buildImportPlan`.
 *
 * @param {Array<{path: string, content: string}>} entries
 *   Flat list of all files extracted from the ZIP.  Directory entries
 *   (paths ending in `/`) are accepted but ignored.
 *
 * @returns {{
 *   topicFolders: Map<string, {name: string, path: string, children: string[]}>,
 *   chatFiles:    Array<{path: string, content: string, topicPath: string}>,
 *   metadata:     object|null,
 *   warnings:     string[]
 * }}
 */
export function parseZipEntries(entries) {
  const topicFolders = new Map();
  const chatFiles = [];
  let metadata = null;
  const warnings = [];

  if (!Array.isArray(entries) || entries.length === 0) {
    warnings.push('No entries provided to parseZipEntries.');
    return { topicFolders, chatFiles, metadata, warnings };
  }

  // Filter out pure directory entries
  const fileEntries = entries.filter(e => !normalisePath(e.path).endsWith('/'));

  const rootFolder = detectRootFolder(fileEntries);

  for (const entry of fileEntries) {
    const normPath = normalisePath(entry.path);
    const stripped = stripRoot(normPath, rootFolder);
    if (!stripped) continue;

    const name = basename(stripped);
    const folderPath = dirOf(stripped); // may be empty string for root

    // ── Special files ──────────────────────────────────────────────
    if (name === '_metadata.json') {
      try {
        metadata = JSON.parse(entry.content);
      } catch (err) {
        warnings.push(`Failed to parse _metadata.json: ${err.message}`);
      }
      continue;
    }

    if (name === 'README.md') {
      // Recognised but not imported as a chat
      continue;
    }

    if (name === '_topic.json') {
      // Mark the folder as a known topic folder (handled below)
      continue;
    }

    // ── Chat markdown files ────────────────────────────────────────
    if (name.endsWith('.md')) {
      chatFiles.push({
        path: stripped,
        content: entry.content || '',
        topicPath: folderPath,
      });
      continue;
    }

    warnings.push(`Unrecognised file skipped: ${stripped}`);
  }

  // Build topicFolders map from the folder paths of all chat files
  // plus any folders implied by _topic.json entries.
  const allFolders = new Set();

  // Collect folders from _topic.json entries
  for (const entry of fileEntries) {
    const normPath = normalisePath(entry.path);
    const stripped = stripRoot(normPath, rootFolder);
    if (basename(stripped) === '_topic.json') {
      const folder = dirOf(stripped);
      if (folder) allFolders.add(folder);
    }
  }

  // Collect folders from chat paths (and all their ancestors)
  for (const chat of chatFiles) {
    let folder = chat.topicPath;
    while (folder) {
      allFolders.add(folder);
      const parent = dirOf(folder);
      folder = parent !== folder ? parent : '';
    }
  }

  for (const folderPath of allFolders) {
    const segments = folderPath.split('/');
    const folderName = segments[segments.length - 1];
    const parentPath = segments.slice(0, -1).join('/');

    if (!topicFolders.has(folderPath)) {
      topicFolders.set(folderPath, {
        name: folderName,
        path: folderPath,
        parentPath: parentPath || null,
        children: [],
      });
    }
  }

  // Wire up children arrays
  for (const [path, folder] of topicFolders) {
    if (folder.parentPath && topicFolders.has(folder.parentPath)) {
      const parent = topicFolders.get(folder.parentPath);
      if (!parent.children.includes(path)) {
        parent.children.push(path);
      }
    }
  }

  return { topicFolders, chatFiles, metadata, warnings };
}

/**
 * Parse a single Markdown file (with optional YAML frontmatter) into a
 * chat entry object suitable for storage.
 *
 * A new `id` is always generated — it never reuses the original `chat_id`
 * from the export, ensuring no collisions with the live data.
 *
 * @param {string}      markdownContent  Raw file content.
 * @param {string}      filename         Original filename (used as title fallback).
 * @param {string}      [topicPathStr]   Folder path string used as fallback topic,
 *                                       e.g. `"Work/Projects"`.  May be an empty
 *                                       string for root-level chats.
 *
 * @returns {{
 *   id:           string,
 *   title:        string,
 *   content:      string,
 *   source:       string,
 *   url:          string,
 *   timestamp:    number,
 *   topicId:      null,
 *   messages:     [],
 *   messageCount: number,
 *   metadata:     { isExcerpt: boolean, importedAt: number, originalChatId: string|null },
 *   tags:         []
 * }}
 */
export function parseChatFromMarkdown(markdownContent, filename, topicPathStr = '') {
  const now = Date.now();
  const id = `imported_${now}_${randomHex(6)}`;

  if (!markdownContent || typeof markdownContent !== 'string') {
    const titleFromFile = (filename || 'Untitled').replace(/\.md$/i, '');
    return {
      id,
      title: titleFromFile,
      content: markdownContent || '',
      source: 'imported',
      url: '',
      timestamp: now,
      topicId: null,
      messages: [],
      messageCount: 0,
      metadata: { isExcerpt: false, importedAt: now, originalChatId: null },
      tags: [],
    };
  }

  const fm = parseFrontmatter(markdownContent);
  const titleFromFile = (filename || 'Untitled').replace(/\.md$/i, '');

  const title = fm.title || titleFromFile;
  const source = fm.source || 'imported';
  const url = fm.url || '';
  const timestamp = parseDateToMs(fm.date);
  const messageCount = typeof fm.messageCount === 'number' && !isNaN(fm.messageCount)
    ? fm.messageCount
    : 0;
  const originalChatId = fm.chat_id || null;

  return {
    id,
    title,
    content: markdownContent,
    source,
    url,
    timestamp,
    topicId: null,
    messages: [],
    messageCount,
    metadata: {
      isExcerpt: false,
      importedAt: now,
      originalChatId,
    },
    tags: [],
  };
}

/**
 * Build an import plan by reconciling the parsed ZIP data against the
 * current topic tree and chat list.
 *
 * The plan is declarative — no state is mutated here.  Pass the result
 * to `executeImport` to apply it.
 *
 * @param {{
 *   topicFolders: Map<string, object>,
 *   chatFiles:    Array<{path: string, content: string, topicPath: string}>,
 *   metadata:     object|null,
 *   warnings:     string[]
 * }} zipEntries   Result of `parseZipEntries`.
 *
 * @param {{
 *   topics:     Record<string, object>,
 *   rootTopics: string[]
 * }|null} existingTree   Live TopicTree plain object, or `null`.
 *
 * @param {'merge'|'replace'|'create_root'} strategy
 *
 * @returns {{
 *   topicsToCreate: Array<{ name: string, parentName: string|null, folderPath: string }>,
 *   topicsToMerge:  Array<{ existingTopicId: string, folderPath: string }>,
 *   chatsToImport:  Array<{ chatEntry: object, targetTopicPath: string }>,
 *   conflicts:      Array<{ type: string, description: string }>,
 *   summary:        { topics: number, chats: number, conflicts: number }
 * }}
 */
export function buildImportPlan(zipEntries, existingTree, strategy) {
  const topicsToCreate = [];
  const topicsToMerge = [];
  const chatsToImport = [];
  const conflicts = [];

  if (!zipEntries) {
    return {
      topicsToCreate, topicsToMerge, chatsToImport, conflicts,
      summary: { topics: 0, chats: 0, conflicts: 0 },
    };
  }

  const { topicFolders = new Map(), chatFiles = [] } = zipEntries;
  const safeStrategy = strategy === 'new-root' ? 'create_root' : (strategy || 'merge');

  // Build a lookup: topic name path → existing topic id
  // Only used for 'merge' strategy.
  const existingTopicsByPath = new Map(); // "Name > Child" → topicId

  if (safeStrategy === 'merge' && existingTree && existingTree.topics) {
    // Build name-path → id map for every existing topic
    const topics = existingTree.topics;
    const rootTopicIds = existingTree.rootTopicIds || [];

    /**
     * Recursively walk topic tree and record name paths.
     * @param {string} id
     * @param {string} parentNamePath
     */
    function walkTopic(id, parentNamePath) {
      const topic = topics[id];
      if (!topic) return;
      const namePath = parentNamePath
        ? `${parentNamePath} > ${topic.name}`
        : topic.name;
      existingTopicsByPath.set(namePath, id);
      for (const childId of (topic.children || [])) {
        walkTopic(childId, namePath);
      }
    }

    for (const rootId of rootTopicIds) {
      walkTopic(rootId, '');
    }
  }

  // Build a name-path for each folder (e.g. "Work/Projects" → "Work > Projects")
  function folderToNamePath(folderPath) {
    return (folderPath || '').split('/').filter(Boolean).join(' > ');
  }

  // For 'create_root', choose a wrapper name
  const importDate = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const rootWrapperName = `Imported ${importDate}`;

  // Determine the effective folder path prefix for 'create_root'
  const rootWrapperFolder = safeStrategy === 'create_root' ? rootWrapperName : '';

  // ── Resolve topics ──────────────────────────────────────────────────────────
  const resolvedFolderPaths = safeStrategy === 'create_root'
    ? [...topicFolders.keys()].map(p => `${rootWrapperName}/${p}`)
    : [...topicFolders.keys()];

  // For create_root, add the wrapper itself
  if (safeStrategy === 'create_root') {
    topicsToCreate.push({
      name: rootWrapperName,
      parentName: null,
      folderPath: rootWrapperName,
    });
  }

  // Sort folders so parents come before children (shortest path first)
  const sortedFolders = [...topicFolders.keys()].sort((a, b) => {
    const depthA = a.split('/').length;
    const depthB = b.split('/').length;
    return depthA - depthB;
  });

  for (const folderPath of sortedFolders) {
    const folder = topicFolders.get(folderPath);
    const effectivePath = safeStrategy === 'create_root'
      ? `${rootWrapperName}/${folderPath}`
      : folderPath;
    const namePath = folderToNamePath(effectivePath);

    if (safeStrategy === 'merge') {
      const existingId = existingTopicsByPath.get(namePath);
      if (existingId) {
        topicsToMerge.push({ existingTopicId: existingId, folderPath });
        continue;
      }
    }

    // Determine parent name for this folder
    const segments = effectivePath.split('/');
    const parentSegments = segments.slice(0, -1);
    const parentName = parentSegments.length > 0
      ? parentSegments[parentSegments.length - 1]
      : null;

    topicsToCreate.push({
      name: folder.name,
      parentName,
      folderPath,
    });
  }

  // ── Resolve chats ───────────────────────────────────────────────────────────
  // Build existing chats lookup for duplicate detection (title + source + ~time)
  // existingTree doesn't carry chats, but the caller may pass them; for now we
  // detect duplicates within the import set only (intra-import deduplication).
  const seenChatKeys = new Set();

  for (const chatFile of chatFiles) {
    const chatEntry = parseChatFromMarkdown(
      chatFile.content,
      basename(chatFile.path),
      chatFile.topicPath
        ? folderToNamePath(chatFile.topicPath)
        : '',
    );

    const effectiveTopicPath = safeStrategy === 'create_root' && chatFile.topicPath
      ? `${rootWrapperName}/${chatFile.topicPath}`
      : chatFile.topicPath;

    // Intra-import duplicate detection: title + source + timestamp bucket (1 h)
    const timeBucket = Math.floor(chatEntry.timestamp / 3_600_000);
    const dedupeKey = `${chatEntry.title}|${chatEntry.source}|${timeBucket}`;

    if (seenChatKeys.has(dedupeKey)) {
      conflicts.push({
        type: 'duplicate_chat',
        description: `Duplicate chat skipped: "${chatEntry.title}" (${chatEntry.source}, ~${new Date(chatEntry.timestamp).toISOString()})`,
      });
      continue;
    }
    seenChatKeys.add(dedupeKey);

    chatsToImport.push({
      chatEntry,
      targetTopicPath: effectiveTopicPath || '',
    });
  }

  return {
    topicsToCreate,
    topicsToMerge,
    chatsToImport,
    conflicts,
    summary: {
      topics: topicsToCreate.length + topicsToMerge.length,
      chats: chatsToImport.length,
      conflicts: conflicts.length,
    },
  };
}

/**
 * Apply an import plan to the current topic tree and chats array.
 *
 * This function manipulates plain data objects directly — it does NOT call
 * any TopicTree class methods.  The caller is responsible for persisting
 * the returned data.
 *
 * @param {{
 *   topicsToCreate: Array<{ name: string, parentName: string|null, folderPath: string }>,
 *   topicsToMerge:  Array<{ existingTopicId: string, folderPath: string }>,
 *   chatsToImport:  Array<{ chatEntry: object, targetTopicPath: string }>,
 *   conflicts:      Array<object>
 * }} plan   Result of `buildImportPlan`.
 *
 * @param {{
 *   topics:     Record<string, object>,
 *   rootTopics: string[]
 * }|null} tree   Current topic tree (plain object).  Pass `null` or `{}`
 *                for an empty tree.
 *
 * @param {object[]} chats  Current chats array.
 *
 * @returns {{
 *   updatedTopics:     Record<string, object>,
 *   updatedRootTopics: string[],
 *   updatedChats:      object[],
 *   summary: {
 *     topicsCreated: number,
 *     topicsMerged:  number,
 *     chatsImported: number,
 *     errors:        string[]
 *   }
 * }}
 */
export function executeImport(plan, tree, chats) {
  const errors = [];
  let topicsCreated = 0;
  let topicsMerged = 0;
  let chatsImported = 0;

  // Deep-clone topic structure so we never mutate caller's objects
  const updatedTopics = {};
  const sourcedTopics = (tree && tree.topics) ? tree.topics : {};
  for (const [id, topic] of Object.entries(sourcedTopics)) {
    updatedTopics[id] = {
      ...topic,
      children: [...(topic.children || [])],
      chatIds:  [...(topic.chatIds  || [])],
    };
  }

  const updatedRootTopics = tree && Array.isArray(tree.rootTopicIds)
    ? [...tree.rootTopicIds]
    : [];

  const updatedChats = Array.isArray(chats) ? [...chats] : [];

  if (!plan) {
    return {
      updatedTopics,
      updatedRootTopics,
      updatedChats,
      summary: { topicsCreated, topicsMerged, chatsImported, errors },
    };
  }

  // ── Map: folderPath → topicId ──────────────────────────────────────────────
  const folderToId = new Map();

  // Seed with merged (already-existing) topics
  for (const merge of (plan.topicsToMerge || [])) {
    folderToId.set(merge.folderPath, merge.existingTopicId);
    topicsMerged++;
  }

  // Helper: create a new topic object
  function makeTopicId() {
    return `topic_imported_${Date.now()}_${randomHex(6)}`;
  }

  function makeTopicObject(id, name, parentId) {
    return {
      id,
      name,
      parentId: parentId || null,
      children: [],
      chatIds: [],
      firstChatDate: null,
      lastChatDate: null,
      createdAt: Date.now(),
    };
  }

  // Sort topicsToCreate so parents (shorter paths / null parentName) come first
  const toCreate = [...(plan.topicsToCreate || [])].sort((a, b) => {
    const depthA = a.folderPath ? a.folderPath.split('/').length : 0;
    const depthB = b.folderPath ? b.folderPath.split('/').length : 0;
    return depthA - depthB;
  });

  for (const item of toCreate) {
    const newId = makeTopicId();

    // Resolve parentId: look up the parent folder path in our map
    let parentId = null;
    if (item.folderPath) {
      const segments = item.folderPath.split('/');
      if (segments.length > 1) {
        const parentFolderPath = segments.slice(0, -1).join('/');
        parentId = folderToId.get(parentFolderPath) || null;
        if (!parentId) {
          errors.push(`Parent folder not resolved for "${item.folderPath}"; attaching to root.`);
        }
      }
    }

    const topicObj = makeTopicObject(newId, item.name, parentId);
    updatedTopics[newId] = topicObj;

    if (parentId) {
      const parentTopic = updatedTopics[parentId];
      if (parentTopic && !parentTopic.children.includes(newId)) {
        parentTopic.children.push(newId);
      }
    } else {
      if (!updatedRootTopics.includes(newId)) {
        updatedRootTopics.push(newId);
      }
    }

    folderToId.set(item.folderPath, newId);
    topicsCreated++;
  }

  // ── Import chats ────────────────────────────────────────────────────────────
  for (const { chatEntry, targetTopicPath } of (plan.chatsToImport || [])) {
    try {
      const topicId = folderToId.get(targetTopicPath) || null;
      const chatWithTopic = { ...chatEntry, topicId };

      updatedChats.push(chatWithTopic);

      if (topicId && updatedTopics[topicId]) {
        const topic = updatedTopics[topicId];
        if (!topic.chatIds.includes(chatWithTopic.id)) {
          topic.chatIds.push(chatWithTopic.id);
        }

        // Update firstChatDate / lastChatDate
        const ts = chatWithTopic.timestamp;
        if (typeof ts === 'number') {
          if (topic.firstChatDate === null || ts < topic.firstChatDate) {
            topic.firstChatDate = ts;
          }
          if (topic.lastChatDate === null || ts > topic.lastChatDate) {
            topic.lastChatDate = ts;
          }
        }
      }

      chatsImported++;
    } catch (err) {
      errors.push(`Failed to import chat "${chatEntry && chatEntry.title}": ${err.message}`);
    }
  }

  return {
    updatedTopics,
    updatedRootTopics,
    updatedChats,
    summary: { topicsCreated, topicsMerged, chatsImported, errors },
  };
}

/**
 * Validate that a File object looks like a usable ZIP file before
 * attempting to open it with JSZip.
 *
 * This is a lightweight, synchronous check — it does NOT inspect the
 * ZIP's internal structure.
 *
 * @param {File|null|undefined} file  A browser `File` object.
 *
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateZipFile(file) {
  if (!file) {
    return { valid: false, error: 'No file provided.' };
  }

  if (typeof file.name !== 'string' || file.name.trim() === '') {
    return { valid: false, error: 'File has no name.' };
  }

  if (typeof file.size !== 'number') {
    return { valid: false, error: 'File size is not available.' };
  }

  if (file.size === 0) {
    return { valid: false, error: 'File is empty.' };
  }

  const MAX_SIZE = 500 * 1024 * 1024; // 500 MB
  if (file.size > MAX_SIZE) {
    return { valid: false, error: `File exceeds maximum allowed size of 500 MB (got ${(file.size / 1024 / 1024).toFixed(1)} MB).` };
  }

  const validMimeTypes = [
    'application/zip',
    'application/x-zip-compressed',
    'application/x-zip',
    'application/octet-stream', // some OSes report this for .zip
  ];

  const mimeOk = validMimeTypes.includes((file.type || '').toLowerCase());
  const extOk = file.name.toLowerCase().endsWith('.zip');

  if (!mimeOk && !extOk) {
    return {
      valid: false,
      error: `File does not appear to be a ZIP archive (type: "${file.type}", name: "${file.name}").`,
    };
  }

  return { valid: true };
}
