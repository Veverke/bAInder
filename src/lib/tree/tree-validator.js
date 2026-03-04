/**
 * tree-validator.js — topic name validation for TopicTree
 *
 * Responsibility: all name-related validation rules. Pure functions that
 * receive data as parameters (no `this`) so they can be unit-tested in
 * isolation and injected into any TopicTree operation that needs them.
 */

/**
 * Assert that `name` is a non-empty string.
 * Throws `Error` with a descriptive message on failure.
 * @param {string} name
 */
export function validateTopicName(name) {
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    throw new Error('Topic name must be a non-empty string');
  }
}

/**
 * Return true when a sibling topic at the same tree level already uses `name`
 * (case-insensitive, trimmed), ignoring `excludeTopicId` when supplied.
 *
 * Injected with the data it needs so it stays pure and independent of `this`.
 *
 * @param {Object}      topics          — the full topics dictionary
 * @param {string[]}    rootTopicIds    — root-level topic ID list
 * @param {string}      name            — candidate name (un-trimmed is fine)
 * @param {string|null} parentId        — null means "root level"
 * @param {string|null} excludeTopicId  — omit this topic from the comparison
 * @returns {boolean}
 */
export function hasDuplicateName(topics, rootTopicIds, name, parentId, excludeTopicId = null) {
  const trimmedName = name.trim().toLowerCase();
  const siblings = parentId ? (topics[parentId]?.children ?? []) : rootTopicIds;
  return siblings.some(topicId => {
    if (topicId === excludeTopicId) return false;
    const topic = topics[topicId];
    return topic && topic.name.toLowerCase() === trimmedName;
  });
}
