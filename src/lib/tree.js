/**
 * bAInder Tree Structure & Data Models
 * Stage 3: Data Models & Tree Structure
 * 
 * Defines data models and provides hierarchical tree management
 * with automatic alphabetical sorting and date range tracking.
 */

/**
 * Topic Data Model
 * Represents a hierarchical topic/category for organizing chats
 */
export class Topic {
  constructor(name, parentId = null) {
    this.id = this._generateId();
    this.name = name;
    this.parentId = parentId;
    this.children = [];
    this.chatIds = [];
    this.createdAt = Date.now();
    this.updatedAt = Date.now();
    this.firstChatDate = null;
    this.lastChatDate = null;
  }

  /**
   * Create a Topic from plain object (for deserialization)
   */
  static fromObject(obj) {
    const topic = Object.create(Topic.prototype);
    Object.assign(topic, obj);
    return topic;
  }

  /**
   * Convert to plain object (for serialization)
   */
  toObject() {
    return {
      id: this.id,
      name: this.name,
      parentId: this.parentId,
      children: this.children,
      chatIds: this.chatIds,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      firstChatDate: this.firstChatDate,
      lastChatDate: this.lastChatDate
    };
  }

  /**
   * Update the topic's updated timestamp
   */
  touch() {
    this.updatedAt = Date.now();
  }

  /**
   * Update date range when a chat is added/removed
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
   * Recalculate date range from chat timestamps (used after deletions)
   */
  recalculateDateRange(chatTimestamps) {
    if (chatTimestamps.length === 0) {
      this.firstChatDate = null;
      this.lastChatDate = null;
    } else {
      this.firstChatDate = Math.min(...chatTimestamps);
      this.lastChatDate = Math.max(...chatTimestamps);
    }
    this.touch();
  }

  /**
   * Get formatted date range string
   */
  getDateRangeString() {
    if (!this.firstChatDate || !this.lastChatDate) {
      return null;
    }

    const formatDate = (timestamp) => {
      const date = new Date(timestamp);
      const month = date.toLocaleString('en-US', { month: 'short' });
      const year = date.getFullYear();
      return `${month} ${year}`;
    };

    const first = formatDate(this.firstChatDate);
    const last = formatDate(this.lastChatDate);

    return first === last ? first : `${first} - ${last}`;
  }

  /**
   * Private: Generate unique ID
   */
  _generateId() {
    return `topic_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

/**
 * ChatEntry Data Model
 * Represents a single chat conversation
 */
export class ChatEntry {
  constructor(title, content, url, source, timestamp) {
    this.id = this._generateId();
    this.topicId = null;
    this.title = title;
    this.content = content;
    this.url = url;
    this.source = source;
    this.timestamp = timestamp || Date.now();
    this.metadata = {};
  }

  /**
   * Create a ChatEntry from plain object (for deserialization)
   */
  static fromObject(obj) {
    const chat = Object.create(ChatEntry.prototype);
    Object.assign(chat, obj);
    return chat;
  }

  /**
   * Convert to plain object (for serialization)
   */
  toObject() {
    return {
      id: this.id,
      topicId: this.topicId,
      title: this.title,
      content: this.content,
      url: this.url,
      source: this.source,
      timestamp: this.timestamp,
      metadata: this.metadata
    };
  }

  /**
   * Validate chat entry data
   */
  validate() {
    if (!this.title || typeof this.title !== 'string') {
      throw new Error('Chat must have a valid title');
    }
    if (!this.content || typeof this.content !== 'string') {
      throw new Error('Chat must have valid content');
    }
    if (!['chatgpt', 'claude', 'gemini'].includes(this.source)) {
      throw new Error('Chat must have a valid source (chatgpt, claude, or gemini)');
    }
    return true;
  }

  /**
   * Private: Generate unique ID
   */
  _generateId() {
    return `chat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

/**
 * TopicTree Class
 * Manages hierarchical topic structure with automatic sorting and validation
 */
export class TopicTree {
  constructor() {
    this.topics = {};
    this.rootTopicIds = [];
    this.version = 1;
  }

  /**
   * Create TopicTree from storage data
   */
  static fromObject(obj) {
    const tree = new TopicTree();
    tree.version = obj.version || 1;
    tree.rootTopicIds = obj.rootTopicIds || [];
    
    // Convert plain objects to Topic instances
    for (const id in obj.topics) {
      tree.topics[id] = Topic.fromObject(obj.topics[id]);
    }
    
    return tree;
  }

  /**
   * Convert to plain object for storage
   */
  toObject() {
    const topics = {};
    for (const id in this.topics) {
      topics[id] = this.topics[id].toObject();
    }
    
    return {
      topics,
      rootTopicIds: this.rootTopicIds,
      version: this.version
    };
  }

  /**
   * Check if a topic name already exists at the same level
   */
  hasDuplicateName(name, parentId, excludeTopicId = null) {
    const trimmedName = name.trim().toLowerCase();
    const siblings = parentId ? this.topics[parentId].children : this.rootTopicIds;
    
    return siblings.some(topicId => {
      if (topicId === excludeTopicId) return false;
      const topic = this.topics[topicId];
      return topic && topic.name.toLowerCase() === trimmedName;
    });
  }

  /**
   * Add a new topic to the tree
   */
  addTopic(name, parentId = null) {
    // Validate name
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      throw new Error('Topic name must be a non-empty string');
    }

    // Validate parent exists if specified
    if (parentId && !this.topics[parentId]) {
      throw new Error(`Parent topic ${parentId} does not exist`);
    }

    // Check for duplicate name at same level
    if (this.hasDuplicateName(name, parentId)) {
      throw new Error(`A topic named "${name.trim()}" already exists at this level`);
    }

    // Create new topic
    const topic = new Topic(name.trim(), parentId);
    this.topics[topic.id] = topic;

    // Add to parent's children or root
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

  /**
   * Delete a topic (and optionally its chats)
   */
  deleteTopic(topicId, deleteChats = false) {
    const topic = this.topics[topicId];
    if (!topic) {
      return false;
    }

    // Recursively delete all child topics
    for (const childId of [...topic.children]) {
      this.deleteTopic(childId, deleteChats);
    }

    // Remove from parent's children or root
    if (topic.parentId) {
      const parent = this.topics[topic.parentId];
      if (parent) {
        parent.children = parent.children.filter(id => id !== topicId);
        parent.touch();
      }
    } else {
      this.rootTopicIds = this.rootTopicIds.filter(id => id !== topicId);
    }

    // Get chat IDs before deleting (for caller to handle chat deletion)
    const chatIds = topic.chatIds;

    // Delete the topic
    delete this.topics[topicId];

    return { success: true, chatIds };
  }

  /**
   * Move a topic to a new parent
   */
  moveTopic(topicId, newParentId) {
    const topic = this.topics[topicId];
    if (!topic) {
      throw new Error(`Topic ${topicId} does not exist`);
    }

    // Validate new parent exists (unless moving to root)
    if (newParentId && !this.topics[newParentId]) {
      throw new Error(`Parent topic ${newParentId} does not exist`);
    }

    // Prevent moving topic under itself or its descendants
    if (newParentId && this._isDescendant(newParentId, topicId)) {
      throw new Error('Cannot move topic under itself or its descendants');
    }

    // Remove from old parent
    if (topic.parentId) {
      const oldParent = this.topics[topic.parentId];
      if (oldParent) {
        oldParent.children = oldParent.children.filter(id => id !== topicId);
        oldParent.touch();
      }
    } else {
      this.rootTopicIds = this.rootTopicIds.filter(id => id !== topicId);
    }

    // Add to new parent
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

  /**
   * Rename a topic
   */
  renameTopic(topicId, newName) {
    const topic = this.topics[topicId];
    if (!topic) {
      throw new Error(`Topic ${topicId} does not exist`);
    }

    if (!newName || typeof newName !== 'string' || newName.trim().length === 0) {
      throw new Error('Topic name must be a non-empty string');
    }

    // Check for duplicate name at same level (excluding this topic)
    if (this.hasDuplicateName(newName, topic.parentId, topicId)) {
      throw new Error(`A topic named "${newName.trim()}" already exists at this level`);
    }

    topic.name = newName.trim();
    topic.touch();

    // Re-sort parent's children to maintain alphabetical order
    if (topic.parentId) {
      this.sortChildren(topic.parentId);
    } else {
      this.sortChildren(null);
    }

    return true;
  }

  /**
   * Sort children alphabetically (case-insensitive)
   */
  sortChildren(parentId) {
    const children = parentId 
      ? this.topics[parentId]?.children 
      : this.rootTopicIds;

    if (!children) return;

    children.sort((a, b) => {
      const nameA = this.topics[a].name.toLowerCase();
      const nameB = this.topics[b].name.toLowerCase();
      return nameA.localeCompare(nameB);
    });
  }

  /**
   * Get topic path as breadcrumb array
   */
  getTopicPath(topicId) {
    const path = [];
    let currentId = topicId;

    while (currentId) {
      const topic = this.topics[currentId];
      if (!topic) break;
      
      path.unshift({
        id: topic.id,
        name: topic.name
      });
      
      currentId = topic.parentId;
    }

    return path;
  }

  /**
   * Merge source topic into target topic
   */
  mergeTopics(sourceId, targetId) {
    const source = this.topics[sourceId];
    const target = this.topics[targetId];

    if (!source || !target) {
      throw new Error('Both source and target topics must exist');
    }

    if (sourceId === targetId) {
      throw new Error('Cannot merge topic with itself');
    }

    // Prevent merging if one is descendant of the other
    if (this._isDescendant(sourceId, targetId) || this._isDescendant(targetId, sourceId)) {
      throw new Error('Cannot merge topic with its ancestor or descendant');
    }

    // Move all chats from source to target
    target.chatIds.push(...source.chatIds);

    // Update date range
    if (source.firstChatDate && (!target.firstChatDate || source.firstChatDate < target.firstChatDate)) {
      target.firstChatDate = source.firstChatDate;
    }
    if (source.lastChatDate && (!target.lastChatDate || source.lastChatDate > target.lastChatDate)) {
      target.lastChatDate = source.lastChatDate;
    }

    // Move all children from source to target
    for (const childId of source.children) {
      const child = this.topics[childId];
      if (child) {
        child.parentId = targetId;
        target.children.push(childId);
      }
    }

    target.touch();
    this.sortChildren(targetId);

    // Clear source children since we moved them (prevent deletion)
    source.children = [];

    // Delete source topic (without deleteChats flag since we moved them)
    this.deleteTopic(sourceId, false);

    return { success: true, chatIds: source.chatIds };
  }

  /**
   * Update topic date range when chat is added
   */
  updateTopicDateRange(topicId, chatTimestamp) {
    const topic = this.topics[topicId];
    if (!topic) {
      throw new Error(`Topic ${topicId} does not exist`);
    }

    topic.updateDateRange(chatTimestamp);
    return true;
  }

  /**
   * Get formatted date range for a topic
   */
  getTopicDateRange(topicId) {
    const topic = this.topics[topicId];
    if (!topic) {
      return null;
    }

    return topic.getDateRangeString();
  }

  /**
   * Get all topics as flat array
   */
  getAllTopics() {
    return Object.values(this.topics);
  }

  /**
   * Get root topics
   */
  getRootTopics() {
    return this.rootTopicIds.map(id => this.topics[id]).filter(t => t);
  }

  /**
   * Get children of a topic
   */
  getChildren(topicId) {
    const topic = this.topics[topicId];
    if (!topic) return [];
    return topic.children.map(id => this.topics[id]).filter(t => t);
  }

  /**
   * Private: Check if possibleDescendant is a descendant of topicId
   */
  _isDescendant(possibleDescendantId, topicId) {
    let currentId = possibleDescendantId;
    
    while (currentId) {
      if (currentId === topicId) {
        return true;
      }
      const topic = this.topics[currentId];
      if (!topic) break;
      currentId = topic.parentId;
    }
    
    return false;
  }

  /**
   * Find orphaned topics (topics whose parent doesn't exist)
   */
  findOrphans() {
    const orphans = [];
    
    for (const id in this.topics) {
      const topic = this.topics[id];
      if (topic.parentId && !this.topics[topic.parentId]) {
        orphans.push(topic);
      }
    }
    
    return orphans;
  }

  /**
   * Repair tree by moving orphans to root
   */
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

  /**
   * Get tree statistics
   */
  getStatistics() {
    let totalTopics = 0;
    let totalChats = 0;
    let maxDepth = 0;

    const calculateDepth = (topicId, depth = 0) => {
      const topic = this.topics[topicId];
      if (!topic) return depth;

      maxDepth = Math.max(maxDepth, depth);
      totalTopics++;
      totalChats += topic.chatIds.length;

      for (const childId of topic.children) {
        calculateDepth(childId, depth + 1);
      }
    };

    for (const rootId of this.rootTopicIds) {
      calculateDepth(rootId, 0);
    }

    return {
      totalTopics,
      totalChats,
      maxDepth,
      rootTopics: this.rootTopicIds.length
    };
  }
}
