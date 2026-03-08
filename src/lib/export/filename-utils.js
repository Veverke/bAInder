/**
 * Filename and topic-path utilities for the export system.
 * Pure functions — no side effects.
 */

/**
 * Sanitise a string so it is safe to use as a file or folder name.
 *
 * Rules:
 *  - Strip characters invalid on Windows/macOS/Linux: `< > : " / \ | ? *`
 *    and ASCII control characters (codes 0-31).
 *  - Collapse runs of whitespace/hyphens into a single `-`.
 *  - Strip leading/trailing hyphens and dots.
 *  - Lowercase.
 *  - Truncate to 80 characters.
 *  - Return `"untitled"` when nothing remains.
 *
 * @param {string} name
 * @returns {string}
 */
export function sanitizeFilename(name) {
  if (!name || typeof name !== 'string') return 'untitled';

  let s = name
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1f<>:"/\\|?*]/g, ' ') // remove invalid chars
    .replace(/\s+/g, '-')                     // spaces → hyphens
    .replace(/-{2,}/g, '-')                   // collapse consecutive hyphens
    .replace(/^[.-]+|[.-]+$/g, '')            // strip leading/trailing . -
    .toLowerCase()
    .slice(0, 80)
    .replace(/[.-]+$/g, '');                  // strip again after truncation

  return s || 'untitled';
}

/**
 * Build a human-readable breadcrumb path for a topic using the flat topics
 * map (`tree.topics`).
 *
 * @param {string|null} topicId
 * @param {Object.<string, {name: string, parentId: string|null}>} topicsMap
 * @returns {string}  e.g. "Work > Projects" or "Uncategorised"
 */
export function buildTopicPath(topicId, topicsMap) {
  if (!topicId || !topicsMap || !topicsMap[topicId]) return 'Uncategorised';

  const parts = [];
  let current = topicId;
  const visited = new Set();

  while (current && topicsMap[current]) {
    if (visited.has(current)) break; // circular ref guard
    visited.add(current);
    parts.unshift(topicsMap[current].name);
    current = topicsMap[current].parentId;
  }

  return parts.join(' > ') || 'Uncategorised';
}

/**
 * Collect all descendant topic IDs (including the root itself).
 * @param {string} rootId
 * @param {Object} topicsMap
 * @returns {Set<string>}
 */
export function collectDescendants(rootId, topicsMap) {
  const result  = new Set();
  const queue   = [rootId];
  const visited = new Set();
  while (queue.length) {
    const id = queue.shift();
    if (visited.has(id)) continue;
    visited.add(id);
    result.add(id);
    const topic = topicsMap[id];
    if (topic && Array.isArray(topic.children)) {
      for (const childId of topic.children) queue.push(childId);
    }
  }
  return result;
}

/**
 * Build a map of `topicId → relative folder path` for every topic.
 * Uses sanitized topic names to build `Parent/Child` folder paths.
 * @param {Object} topicsMap
 * @returns {Map<string, string>}
 */
export function buildTopicFolderPaths(topicsMap) {
  const result = new Map();

  const _getPath = (topicId, visited = new Set()) => {
    if (result.has(topicId)) return result.get(topicId);
    if (visited.has(topicId)) return sanitizeFilename('circular');
    visited.add(topicId);

    const topic = topicsMap[topicId];
    if (!topic) return 'unknown';

    const safeName = sanitizeFilename(topic.name);
    if (!topic.parentId || !topicsMap[topic.parentId]) {
      result.set(topicId, safeName);
      return safeName;
    }

    const parentPath = _getPath(topic.parentId, new Set(visited));
    const path = `${parentPath}/${safeName}`;
    result.set(topicId, path);
    return path;
  };

  for (const id of Object.keys(topicsMap)) _getPath(id);
  return result;
}
