/**
 * tree.js — thin coordinator for the bAInder topic tree
 *
 * Resolves Code Quality issue 3.2: TopicTree was a multi-purpose object.
 * Concerns are now separated into four sub-modules under src/lib/tree/:
 *
 *   models.js          — Topic, ChatEntry data models (per-object serialisation)
 *   tree-validator.js  — validateTopicName, hasDuplicateName (pure)
 *   tree-traversal.js  — getAllTopics, getRootTopics, getChildren, getTopicPath,
 *                        isDescendant, findOrphans, getStatistics (pure, DI)
 *   tree-serializer.js — serialize / deserialize (pure, DI)
 *
 * This file re-exports Topic and ChatEntry so all existing callers and tests
 * remain unchanged. TopicTree delegates read-only and validation operations
 * to the modules above (dependency-injection pattern: each pure function receives
 * this.topics / this.rootTopicIds as parameters rather than closing over `this`).
 * Mutation methods stay here because they own the state changes.
 */

import { Topic, ChatEntry }              from './models.js';
import { validateTopicName,
         hasDuplicateName as _hasDup }   from './tree-validator.js';
import { getAllTopics    as _getAll,
         getRootTopics  as _getRoots,
         getChildren    as _getChildren,
         getTopicPath   as _getPath,
         isDescendant   as _isDesc,
         findOrphans    as _findOrphans,
         getStatistics  as _getStats }   from './tree-traversal.js';
import { serialize, deserialize }        from './tree-serializer.js';

// Re-export so existing callers (`import { Topic, ChatEntry } from '…tree.js'`)
// continue to work without any changes.
export { Topic, ChatEntry };

// ---------------------------------------------------------------------------

export class TopicTree {
  constructor() {
    this.topics       = {};
    this.rootTopicIds = [];
    this.version      = 1;
  }

  // ── Serialisation (tree-serializer.js) ────────────────────────────────────

  static fromObject(obj) {
    const tree = new TopicTree();
    const { topics, rootTopicIds, version } = deserialize(obj);
    tree.topics       = topics;
    tree.rootTopicIds = rootTopicIds;
    tree.version      = version;
    return tree;
  }

  toObject() {
    return serialize(this);
  }

  // ── Traversal (tree-traversal.js — DI via params) ─────────────────────────

  getAllTopics()            { return _getAll(this.topics); }
  getRootTopics()           { return _getRoots(this.topics, this.rootTopicIds); }
  getChildren(topicId)      { return _getChildren(this.topics, topicId); }
  getTopicPath(topicId)     { return _getPath(this.topics, topicId); }
  findOrphans()             { return _findOrphans(this.topics); }
  getStatistics()           { return _getStats(this.topics, this.rootTopicIds); }

  // ── Validation (tree-validator.js — DI via params) ────────────────────────

  hasDuplicateName(name, parentId, excludeTopicId = null) {
    return _hasDup(this.topics, this.rootTopicIds, name, parentId, excludeTopicId);
  }

  // ── Mutation — own the state changes ──────────────────────────────────────

  addTopic(name, parentId = null) {
    validateTopicName(name);

    if (parentId && !this.topics[parentId]) {
      throw new Error(`Parent topic ${parentId} does not exist`);
    }
    if (this.hasDuplicateName(name, parentId)) {
      throw new Error(`A topic named "${name.trim()}" already exists at this level`);
    }

    const topic = new Topic(name.trim(), parentId);
    this.topics[topic.id] = topic;

    if (parentId) {
      this.topics[parentId].children.push(topic.id);
      this.topics[parentId].touch();
      this.sortChildren(parentId);
    } else {
      this.rootTopicIds.push(topic.id);
      this.sortChildren(null);
    }

    return topic.id;
  }

  deleteTopic(topicId, deleteChats = false) {
    const topic = this.topics[topicId];
    if (!topic) return false;

    for (const childId of [...topic.children]) {
      this.deleteTopic(childId, deleteChats);
    }

    if (topic.parentId) {
      const parent = this.topics[topic.parentId];
      if (parent) {
        parent.children = parent.children.filter(id => id !== topicId);
        parent.touch();
      }
    } else {
      this.rootTopicIds = this.rootTopicIds.filter(id => id !== topicId);
    }

    const chatIds = topic.chatIds;
    delete this.topics[topicId];
    return { success: true, chatIds };
  }

  moveTopic(topicId, newParentId) {
    const topic = this.topics[topicId];
    if (!topic) throw new Error(`Topic ${topicId} does not exist`);

    if (newParentId && !this.topics[newParentId]) {
      throw new Error(`Parent topic ${newParentId} does not exist`);
    }
    if (newParentId && _isDesc(this.topics, newParentId, topicId)) {
      throw new Error('Cannot move topic under itself or its descendants');
    }

    if (topic.parentId) {
      const oldParent = this.topics[topic.parentId];
      if (oldParent) {
        oldParent.children = oldParent.children.filter(id => id !== topicId);
        oldParent.touch();
      }
    } else {
      this.rootTopicIds = this.rootTopicIds.filter(id => id !== topicId);
    }

    topic.parentId = newParentId;
    topic.touch();

    if (newParentId) {
      this.topics[newParentId].children.push(topicId);
      this.topics[newParentId].touch();
      this.sortChildren(newParentId);
    } else {
      this.rootTopicIds.push(topicId);
      this.sortChildren(null);
    }

    return true;
  }

  renameTopic(topicId, newName) {
    const topic = this.topics[topicId];
    if (!topic) throw new Error(`Topic ${topicId} does not exist`);

    validateTopicName(newName);

    if (this.hasDuplicateName(newName, topic.parentId, topicId)) {
      throw new Error(`A topic named "${newName.trim()}" already exists at this level`);
    }

    topic.name = newName.trim();
    topic.touch();

    if (topic.parentId) {
      this.sortChildren(topic.parentId);
    } else {
      this.sortChildren(null);
    }

    return true;
  }

  sortChildren(parentId) {
    const children = parentId
      ? this.topics[parentId]?.children
      : this.rootTopicIds;

    if (!children) return;

    children.sort((a, b) => {
      const nameA = this.topics[a]?.name.toLowerCase() ?? '';
      const nameB = this.topics[b]?.name.toLowerCase() ?? '';
      return nameA.localeCompare(nameB);
    });
  }

  mergeTopics(sourceId, targetId) {
    const source = this.topics[sourceId];
    const target = this.topics[targetId];

    if (!source || !target) throw new Error('Both source and target topics must exist');
    if (sourceId === targetId) throw new Error('Cannot merge topic with itself');

    if (_isDesc(this.topics, sourceId, targetId) || _isDesc(this.topics, targetId, sourceId)) {
      throw new Error('Cannot merge topic with its ancestor or descendant');
    }

    target.chatIds.push(...source.chatIds);

    if (source.firstChatDate && (!target.firstChatDate || source.firstChatDate < target.firstChatDate)) {
      target.firstChatDate = source.firstChatDate;
    }
    if (source.lastChatDate && (!target.lastChatDate || source.lastChatDate > target.lastChatDate)) {
      target.lastChatDate = source.lastChatDate;
    }

    for (const childId of source.children) {
      const child = this.topics[childId];
      if (child) {
        child.parentId = targetId;
        target.children.push(childId);
      }
    }

    target.touch();
    this.sortChildren(targetId);

    source.children = [];
    this.deleteTopic(sourceId, false);

    return { success: true, chatIds: source.chatIds };
  }

  updateTopicDateRange(topicId, chatTimestamp) {
    const topic = this.topics[topicId];
    if (!topic) throw new Error(`Topic ${topicId} does not exist`);
    topic.updateDateRange(chatTimestamp);
    return true;
  }

  getTopicDateRange(topicId) {
    return this.topics[topicId]?.getDateRangeString() ?? null;
  }

  // ── Tree maintenance ───────────────────────────────────────────────────────

  repairTree() {
    const orphans = this.findOrphans();
    for (const orphan of orphans) {
      orphan.parentId = null;
      orphan.touch();
      if (!this.rootTopicIds.includes(orphan.id)) {
        this.rootTopicIds.push(orphan.id);
      }
    }
    this.sortChildren(null);
    return orphans.length;
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  /** @private — delegates to the pure isDescendant helper (backward compat). */
  _isDescendant(possibleDescendantId, ancestorId) {
    return _isDesc(this.topics, possibleDescendantId, ancestorId);
  }
}
