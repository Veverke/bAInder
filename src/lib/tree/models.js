/**
 * models.js — core data models for the bAInder topic tree
 *
 * Extracted from tree.js so that tree-serializer.js can import Topic
 * without creating a circular dependency.
 *
 * Responsibilities: value-object construction, field validation, date-range
 * tracking (within a single Topic), and serialisation to/from plain objects.
 * Does NOT know about the tree structure — no parent/child traversal here.
 */

import { generateId } from '../search-utils.js';

/**
 * Topic Data Model
 * Represents one hierarchical topic/category for organising chats.
 */
export class Topic {
  constructor(name, parentId = null) {
    this.id           = generateId('topic');
    this.name         = name;
    this.parentId     = parentId;
    this.children     = [];
    this.chatIds      = [];
    this.createdAt    = Date.now();
    this.updatedAt    = Date.now();
    this.firstChatDate = null;
    this.lastChatDate  = null;
  }

  /** Create a Topic from a plain storage object (deserialisation). */
  static fromObject(obj) {
    const topic = Object.create(Topic.prototype);
    Object.assign(topic, obj);
    return topic;
  }

  /** Convert to a plain storage object (serialisation). */
  toObject() {
    return {
      id:            this.id,
      name:          this.name,
      parentId:      this.parentId,
      children:      this.children,
      chatIds:       this.chatIds,
      createdAt:     this.createdAt,
      updatedAt:     this.updatedAt,
      firstChatDate: this.firstChatDate,
      lastChatDate:  this.lastChatDate,
    };
  }

  /** Stamp `updatedAt` with the current time. */
  touch() {
    this.updatedAt = Date.now();
  }

  /**
   * Expand the stored date range to include `chatTimestamp`.
   * Used when a chat is added to this topic.
   */
  updateDateRange(chatTimestamp) {
    if (!this.firstChatDate || chatTimestamp < this.firstChatDate) {
      this.firstChatDate = chatTimestamp;
    }
    if (!this.lastChatDate || chatTimestamp > this.lastChatDate) {
      this.lastChatDate = chatTimestamp;
    }
    this.touch();
  }

  /**
   * Recalculate date range from a full list of chat timestamps.
   * Used after a chat is removed (min/max must be recomputed from scratch).
   * @param {number[]} chatTimestamps
   */
  recalculateDateRange(chatTimestamps) {
    if (chatTimestamps.length === 0) {
      this.firstChatDate = null;
      this.lastChatDate  = null;
    } else {
      this.firstChatDate = Math.min(...chatTimestamps);
      this.lastChatDate  = Math.max(...chatTimestamps);
    }
    this.touch();
  }

  /**
   * Return a human-readable date-range string such as "Jan 2024 - Mar 2024"
   * or null when the topic has no chats.
   * @returns {string|null}
   */
  getDateRangeString() {
    if (!this.firstChatDate || !this.lastChatDate) return null;

    const fmt = (ts) => {
      const d = new Date(ts);
      return `${d.toLocaleString('en-US', { month: 'short' })} ${d.getFullYear()}`;
    };

    const first = fmt(this.firstChatDate);
    const last  = fmt(this.lastChatDate);
    return first === last ? first : `${first} - ${last}`;
  }

  /** @private — kept for serialised legacy objects that may call it; new code uses generateId() */
  _generateId() {
    return generateId('topic');
  }
}

// ---------------------------------------------------------------------------

/**
 * ChatEntry Data Model
 * Represents a single saved chat conversation.
 */
export class ChatEntry {
  constructor(title, content, url, source, timestamp) {
    this.id        = generateId('chat');
    this.topicId   = null;
    this.title     = title;
    this.content   = content;
    this.url       = url;
    this.source    = source;
    this.timestamp = timestamp || Date.now();
    this.tags      = [];
    this.metadata  = {};
  }

  /** Create a ChatEntry from a plain storage object (deserialisation). */
  static fromObject(obj) {
    const chat = Object.create(ChatEntry.prototype);
    Object.assign(chat, obj);
    return chat;
  }

  /** Convert to a plain storage object (serialisation). */
  toObject() {
    return {
      id:        this.id,
      topicId:   this.topicId,
      title:     this.title,
      content:   this.content,
      url:       this.url,
      source:    this.source,
      timestamp: this.timestamp,
      tags:      this.tags || [],
      metadata:  this.metadata,
    };
  }

  /**
   * Validate that required fields are present and valid.
   * Throws descriptively rather than returning a boolean so callers can
   * surface the message directly.
   * @returns {true}
   */
  validate() {
    if (!this.title   || typeof this.title   !== 'string') throw new Error('Chat must have a valid title');
    if (!this.content || typeof this.content !== 'string') throw new Error('Chat must have valid content');
    if (!['chatgpt', 'claude', 'gemini'].includes(this.source)) {
      throw new Error('Chat must have a valid source (chatgpt, claude, or gemini)');
    }
    return true;
  }

  /** @private — kept for serialised legacy objects that may call it; new code uses generateId() */
  _generateId() {
    return generateId('chat');
  }
}
