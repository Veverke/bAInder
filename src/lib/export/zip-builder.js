/**
 * ZIP payload builder.
 * Assembles the complete set of files that go into an export ZIP archive.
 * Returns a flat array of { path, content } objects; the caller feeds these into JSZip.
 */

import { sanitizeFilename, buildTopicPath, collectDescendants, buildTopicFolderPaths } from './filename-utils.js';
import { buildExportMarkdown, buildDigestMarkdown }                                    from './markdown-builder.js';
import { buildExportHtml }                                                             from './html-builder.js';
import { buildMetadataJson, buildReadme }                                              from './metadata-builder.js';
import { buildFineTuningJsonlMulti }                                                   from './jsonl-builder.js';

/**
 * Build the complete set of files for a ZIP export.
 *
 * @param {import('../tree.js').TopicTree} tree
 * @param {Object[]} chats
 * @param {{
 *   scope?:   'all' | 'topic' | 'topic-recursive',
 *   topicId?: string,
 *   format?:  'markdown' | 'html',
 *   style?:   string
 * }} [options]
 * @returns {{ path: string, content: string }[]}
 */
export function buildZipPayload(tree, chats, options = {}) {
  const scope     = options.scope  || 'all';
  const fmt       = options.format || 'markdown';
  const style     = options.style  || 'raw';
  const topicsMap = (tree && tree.topics) ? tree.topics : {};
  const allChats  = Array.isArray(chats) ? chats : [];

  const dateTag = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const rootDir = `bAInder-export-${dateTag}`;

  // ── Determine which topics and chats are in scope ─────────────────────────
  let includedTopicIds;
  if (scope === 'all') {
    includedTopicIds = new Set(Object.keys(topicsMap));
  } else if (scope === 'topic' && options.topicId) {
    includedTopicIds = new Set([options.topicId]);
  } else if (scope === 'topic-recursive' && options.topicId) {
    includedTopicIds = collectDescendants(options.topicId, topicsMap);
  } else {
    includedTopicIds = new Set(Object.keys(topicsMap));
  }

  const includedChats = allChats.filter(c =>
    c.topicId ? includedTopicIds.has(c.topicId) : scope === 'all'
  );

  // ── Build folder path for each topic ─────────────────────────────────────
  const topicFolderPath = buildTopicFolderPaths(topicsMap);

  // ── Accumulate files ──────────────────────────────────────────────────────
  const files = [];

  // Track used filenames per folder to avoid collisions
  const usedNames = /** @type {Map<string, Set<string>>} */ (new Map());
  const _uniqueName = (folder, base) => {
    if (!usedNames.has(folder)) usedNames.set(folder, new Set());
    const set = usedNames.get(folder);
    let name = base;
    let i = 2;
    while (set.has(name)) name = `${base}-${i++}`;
    set.add(name);
    return name;
  };

  // _topic.json for each topic in scope
  for (const topicId of includedTopicIds) {
    const topic = topicsMap[topicId];
    if (!topic) continue;
    const folder    = topicFolderPath.get(topicId) || sanitizeFilename(topic.name);
    const topicMeta = {
      name:      topic.name,
      topicId:   topic.id,
      chatCount: Array.isArray(topic.chatIds) ? topic.chatIds.length : 0,
      dateRange: {
        first: topic.firstChatDate ? new Date(topic.firstChatDate).toISOString() : null,
        last:  topic.lastChatDate  ? new Date(topic.lastChatDate).toISOString()  : null,
      }
    };
    files.push({
      path:    `${rootDir}/${folder}/_topic.json`,
      content: JSON.stringify(topicMeta, null, 2)
    });
  }

  // Chat files
  for (const chat of includedChats) {
    const topicId   = chat.topicId || null;
    const topicPath = buildTopicPath(topicId, topicsMap);
    const folderRel = topicId && topicFolderPath.has(topicId)
      ? topicFolderPath.get(topicId)
      : 'uncategorised';

    const ext      = fmt === 'html' ? '.html' : '.md';
    const baseName = sanitizeFilename(chat.title || 'untitled');
    const fileName = _uniqueName(`${rootDir}/${folderRel}`, baseName) + ext;

    const content = fmt === 'html'
      ? buildExportHtml(chat, topicPath, { style })
      : buildExportMarkdown(chat, topicPath);

    files.push({ path: `${rootDir}/${folderRel}/${fileName}`, content });
  }

  // ── JSONL format: one file per topic containing all chats for that topic ──
  if (fmt === 'jsonl') {
    for (const topicId of includedTopicIds) {
      const topic = topicsMap[topicId];
      if (!topic) continue;
      const topicChats = includedChats.filter(c => c.topicId === topicId);
      if (topicChats.length === 0) continue;
      const folder  = topicFolderPath.get(topicId) || sanitizeFilename(topic.name);
      const jsonl   = buildFineTuningJsonlMulti(topicChats, {});
      if (!jsonl) continue;
      files.push({ path: `${rootDir}/${folder}/_finetune.jsonl`, content: jsonl });
    }
  }

  // Metadata
  files.push({
    path:    `${rootDir}/_metadata.json`,
    content: JSON.stringify(buildMetadataJson(tree, chats), null, 2)
  });

  // README
  const stats = {
    exportDate:  new Date().toISOString(),
    totalChats:  includedChats.length,
    totalTopics: includedTopicIds.size,
    format:      fmt
  };
  files.push({ path: `${rootDir}/README.md`, content: buildReadme(stats) });

  return files;
}
