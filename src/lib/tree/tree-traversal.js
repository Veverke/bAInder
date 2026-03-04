/**
 * tree-traversal.js — pure read-only traversal helpers for TopicTree
 *
 * Responsibility: answering structural questions about the tree without
 * mutating it. Every function receives all the data it needs as parameters
 * (dependency injection) so:
 *   - no import of TopicTree / no `this` binding
 *   - trivially unit-testable with plain objects
 *   - reusable from any context (TopicTree, tests, export helpers, etc.)
 */

/**
 * Return all Topic instances as a flat array.
 * @param {Object} topics — topics dictionary { [id]: Topic }
 * @returns {Topic[]}
 */
export function getAllTopics(topics) {
  return Object.values(topics);
}

/**
 * Return Topic instances for each root ID (filters out stale IDs).
 * @param {Object}   topics
 * @param {string[]} rootTopicIds
 * @returns {Topic[]}
 */
export function getRootTopics(topics, rootTopicIds) {
  return rootTopicIds.map(id => topics[id]).filter(Boolean);
}

/**
 * Return the direct children of `topicId` as Topic instances.
 * Returns an empty array when the topic does not exist.
 * @param {Object} topics
 * @param {string} topicId
 * @returns {Topic[]}
 */
export function getChildren(topics, topicId) {
  const topic = topics[topicId];
  if (!topic) return [];
  return topic.children.map(id => topics[id]).filter(Boolean);
}

/**
 * Build an ordered breadcrumb path from the root down to `topicId`.
 * Returns an empty array for a non-existent topic.
 * @param {Object} topics
 * @param {string} topicId
 * @returns {{ id: string, name: string }[]}
 */
export function getTopicPath(topics, topicId) {
  const path = [];
  let currentId = topicId;
  while (currentId) {
    const topic = topics[currentId];
    if (!topic) break;
    path.unshift({ id: topic.id, name: topic.name });
    currentId = topic.parentId;
  }
  return path;
}

/**
 * Return true when `possibleDescendantId` sits anywhere in the subtree
 * rooted at `ancestorId`.
 * @param {Object} topics
 * @param {string} possibleDescendantId
 * @param {string} ancestorId
 * @returns {boolean}
 */
export function isDescendant(topics, possibleDescendantId, ancestorId) {
  let currentId = possibleDescendantId;
  while (currentId) {
    if (currentId === ancestorId) return true;
    const topic = topics[currentId];
    if (!topic) break;
    currentId = topic.parentId;
  }
  return false;
}

/**
 * Return all Topic instances whose parent topic no longer exists in the map.
 * @param {Object} topics
 * @returns {Topic[]}
 */
export function findOrphans(topics) {
  return Object.values(topics).filter(t => t.parentId && !topics[t.parentId]);
}

/**
 * Compute tree-wide statistics by walking every reachable topic once.
 * @param {Object}   topics
 * @param {string[]} rootTopicIds
 * @returns {{ totalTopics: number, totalChats: number, maxDepth: number, rootTopics: number }}
 */
export function getStatistics(topics, rootTopicIds) {
  let totalTopics = 0;
  let totalChats  = 0;
  let maxDepth    = 0;

  const walk = (topicId, depth) => {
    const topic = topics[topicId];
    if (!topic) return;
    maxDepth = Math.max(maxDepth, depth);
    totalTopics++;
    totalChats += topic.chatIds.length;
    for (const childId of topic.children) walk(childId, depth + 1);
  };

  for (const rootId of rootTopicIds) walk(rootId, 0);

  return { totalTopics, totalChats, maxDepth, rootTopics: rootTopicIds.length };
}
