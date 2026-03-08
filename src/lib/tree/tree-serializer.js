/**
 * tree-serializer.js — serialise / deserialise a TopicTree to/from plain objects
 *
 * Responsibility: the mapping between the in-memory model and the storage
 * representation. Lives here so TopicTree does not have to know the storage
 * schema, and so the schema can be changed or versioned without touching
 * TopicTree's mutation logic.
 *
 * Imports Topic from ./models.js (not from ../tree.js) to avoid a circular
 * dependency.
 */

import { Topic } from './models.js';

/**
 * Convert `tree` to a plain, JSON-serialisable object.
 * @param {{ topics: Object, rootTopicIds: string[], version: number }} tree
 * @returns {{ topics: Object, rootTopicIds: string[], version: number }}
 */
export function serialize(tree) {
  const topics = {};
  for (const id in tree.topics) {
    topics[id] = tree.topics[id].toObject();
  }
  return {
    topics,
    rootTopicIds: tree.rootTopicIds,
    version:      tree.version,
  };
}

/**
 * Convert a raw storage object back into a structured tree shape.
 * Returns `{ topics, rootTopicIds, version }` — the caller is responsible
 * for assigning these onto a `new TopicTree()` instance.
 * @param {Object} data — value from storage (may be missing fields)
 * @returns {{ topics: Object, rootTopicIds: string[], version: number }}
 */
export function deserialize(data) {
  const version      = data.version      || 1;
  const rootTopicIds = data.rootTopicIds || [];
  const topics       = {};

  for (const id in (data.topics || {})) {
    topics[id] = Topic.fromObject(data.topics[id]);
  }

  return { topics, rootTopicIds, version };
}
