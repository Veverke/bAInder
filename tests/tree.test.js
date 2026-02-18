/**
 * Tree Structure & Data Models Tests
 * Stage 3: Data Models & Tree Structure
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Topic, ChatEntry, TopicTree } from '../src/lib/tree.js';

describe('Topic Model', () => {
  it('should create a topic with required fields', () => {
    const topic = new Topic('Programming');
    
    expect(topic.id).toBeDefined();
    expect(topic.id).toMatch(/^topic_/);
    expect(topic.name).toBe('Programming');
    expect(topic.parentId).toBeNull();
    expect(topic.children).toEqual([]);
    expect(topic.chatIds).toEqual([]);
    expect(topic.createdAt).toBeDefined();
    expect(topic.updatedAt).toBeDefined();
    expect(topic.firstChatDate).toBeNull();
    expect(topic.lastChatDate).toBeNull();
  });

  it('should create a topic with parent', () => {
    const topic = new Topic('JavaScript', 'parent_123');
    
    expect(topic.parentId).toBe('parent_123');
  });

  it('should convert to and from plain object', () => {
    const topic = new Topic('Test Topic');
    const obj = topic.toObject();
    const restored = Topic.fromObject(obj);
    
    expect(restored.id).toBe(topic.id);
    expect(restored.name).toBe(topic.name);
    expect(restored.parentId).toBe(topic.parentId);
  });

  it('should update timestamp on touch', () => {
    const topic = new Topic('Test');
    const originalTime = topic.updatedAt;
    
    // Wait a bit
    setTimeout(() => {
      topic.touch();
      expect(topic.updatedAt).toBeGreaterThan(originalTime);
    }, 10);
  });

  it('should update date range correctly', () => {
    const topic = new Topic('Test');
    const timestamp1 = Date.now() - 1000000;
    const timestamp2 = Date.now();
    
    topic.updateDateRange(timestamp1);
    expect(topic.firstChatDate).toBe(timestamp1);
    expect(topic.lastChatDate).toBe(timestamp1);
    
    topic.updateDateRange(timestamp2);
    expect(topic.firstChatDate).toBe(timestamp1);
    expect(topic.lastChatDate).toBe(timestamp2);
  });

  it('should recalculate date range from timestamps', () => {
    const topic = new Topic('Test');
    const timestamps = [
      Date.now() - 2000000,
      Date.now() - 1000000,
      Date.now()
    ];
    
    topic.recalculateDateRange(timestamps);
    expect(topic.firstChatDate).toBe(Math.min(...timestamps));
    expect(topic.lastChatDate).toBe(Math.max(...timestamps));
  });

  it('should clear date range when recalculating with empty array', () => {
    const topic = new Topic('Test');
    topic.updateDateRange(Date.now());
    
    topic.recalculateDateRange([]);
    expect(topic.firstChatDate).toBeNull();
    expect(topic.lastChatDate).toBeNull();
  });

  it('should format date range string', () => {
    const topic = new Topic('Test');
    
    // No dates
    expect(topic.getDateRangeString()).toBeNull();
    
    // Same month
    const date1 = new Date('2024-02-15').getTime();
    const date2 = new Date('2024-02-20').getTime();
    topic.updateDateRange(date1);
    topic.updateDateRange(date2);
    
    const rangeStr = topic.getDateRangeString();
    expect(rangeStr).toContain('Feb');
    expect(rangeStr).toContain('2024');
  });

  it('should format date range for different months', () => {
    const topic = new Topic('Test');
    const date1 = new Date('2024-02-15').getTime();
    const date2 = new Date('2024-05-20').getTime();
    
    topic.updateDateRange(date1);
    topic.updateDateRange(date2);
    
    const rangeStr = topic.getDateRangeString();
    expect(rangeStr).toContain('Feb 2024');
    expect(rangeStr).toContain('May 2024');
    expect(rangeStr).toContain('-');
  });
});

describe('ChatEntry Model', () => {
  it('should create a chat entry with required fields', () => {
    const chat = new ChatEntry(
      'Test Chat',
      'Chat content here',
      'https://chat.openai.com/c/123',
      'chatgpt'
    );
    
    expect(chat.id).toBeDefined();
    expect(chat.id).toMatch(/^chat_/);
    expect(chat.title).toBe('Test Chat');
    expect(chat.content).toBe('Chat content here');
    expect(chat.url).toBe('https://chat.openai.com/c/123');
    expect(chat.source).toBe('chatgpt');
    expect(chat.timestamp).toBeDefined();
    expect(chat.topicId).toBeNull();
    expect(chat.metadata).toEqual({});
  });

  it('should create with custom timestamp', () => {
    const customTime = Date.now() - 1000000;
    const chat = new ChatEntry('Test', 'Content', 'url', 'claude', customTime);
    
    expect(chat.timestamp).toBe(customTime);
  });

  it('should convert to and from plain object', () => {
    const chat = new ChatEntry('Test', 'Content', 'url', 'gemini');
    const obj = chat.toObject();
    const restored = ChatEntry.fromObject(obj);
    
    expect(restored.id).toBe(chat.id);
    expect(restored.title).toBe(chat.title);
    expect(restored.source).toBe(chat.source);
  });

  it('should validate correctly', () => {
    const validChat = new ChatEntry('Title', 'Content', 'url', 'chatgpt');
    expect(validChat.validate()).toBe(true);
  });

  it('should fail validation without title', () => {
    const chat = new ChatEntry('', 'Content', 'url', 'chatgpt');
    expect(() => chat.validate()).toThrow('Chat must have a valid title');
  });

  it('should fail validation without content', () => {
    const chat = new ChatEntry('Title', '', 'url', 'chatgpt');
    expect(() => chat.validate()).toThrow('Chat must have valid content');
  });

  it('should fail validation with invalid source', () => {
    const chat = new ChatEntry('Title', 'Content', 'url', 'invalid');
    expect(() => chat.validate()).toThrow('Chat must have a valid source');
  });
});

describe('TopicTree', () => {
  let tree;

  beforeEach(() => {
    tree = new TopicTree();
  });

  describe('Basic Operations', () => {
    it('should create empty tree', () => {
      expect(tree.topics).toEqual({});
      expect(tree.rootTopicIds).toEqual([]);
      expect(tree.version).toBe(1);
    });

    it('should add a root topic', () => {
      const topicId = tree.addTopic('Programming');
      
      expect(topicId).toBeDefined();
      expect(tree.topics[topicId]).toBeDefined();
      expect(tree.topics[topicId].name).toBe('Programming');
      expect(tree.rootTopicIds).toContain(topicId);
    });

    it('should add a child topic', () => {
      const parentId = tree.addTopic('Programming');
      const childId = tree.addTopic('JavaScript', parentId);
      
      expect(tree.topics[childId].parentId).toBe(parentId);
      expect(tree.topics[parentId].children).toContain(childId);
    });

    it('should trim whitespace from topic names', () => {
      const topicId = tree.addTopic('  Test Topic  ');
      expect(tree.topics[topicId].name).toBe('Test Topic');
    });

    it('should throw error for empty topic name', () => {
      expect(() => tree.addTopic('')).toThrow('Topic name must be a non-empty string');
      expect(() => tree.addTopic('   ')).toThrow('Topic name must be a non-empty string');
    });

    it('should throw error for non-existent parent', () => {
      expect(() => tree.addTopic('Test', 'nonexistent')).toThrow('Parent topic nonexistent does not exist');
    });
  });

  describe('Alphabetical Sorting', () => {
    it('should sort root topics alphabetically', () => {
      tree.addTopic('Zebra');
      tree.addTopic('Apple');
      tree.addTopic('Mango');
      
      const rootTopics = tree.getRootTopics();
      expect(rootTopics[0].name).toBe('Apple');
      expect(rootTopics[1].name).toBe('Mango');
      expect(rootTopics[2].name).toBe('Zebra');
    });

    it('should sort child topics alphabetically', () => {
      const parentId = tree.addTopic('Parent');
      tree.addTopic('Zebra', parentId);
      tree.addTopic('Apple', parentId);
      tree.addTopic('Mango', parentId);
      
      const children = tree.getChildren(parentId);
      expect(children[0].name).toBe('Apple');
      expect(children[1].name).toBe('Mango');
      expect(children[2].name).toBe('Zebra');
    });

    it('should maintain sort order after rename', () => {
      const id1 = tree.addTopic('Apple');
      const id2 = tree.addTopic('Banana');
      const id3 = tree.addTopic('Cherry');
      
      tree.renameTopic(id2, 'Apricot');
      
      const rootTopics = tree.getRootTopics();
      expect(rootTopics[0].name).toBe('Apple');
      expect(rootTopics[1].name).toBe('Apricot');
      expect(rootTopics[2].name).toBe('Cherry');
    });

    it('should sort case-insensitively', () => {
      tree.addTopic('banana');
      tree.addTopic('Apple');
      tree.addTopic('CHERRY');
      
      const rootTopics = tree.getRootTopics();
      expect(rootTopics[0].name).toBe('Apple');
      expect(rootTopics[1].name).toBe('banana');
      expect(rootTopics[2].name).toBe('CHERRY');
    });
  });

  describe('Delete Operations', () => {
    it('should delete a root topic', () => {
      const topicId = tree.addTopic('Test');
      const result = tree.deleteTopic(topicId);
      
      expect(result.success).toBe(true);
      expect(tree.topics[topicId]).toBeUndefined();
      expect(tree.rootTopicIds).not.toContain(topicId);
    });

    it('should delete a child topic', () => {
      const parentId = tree.addTopic('Parent');
      const childId = tree.addTopic('Child', parentId);
      
      tree.deleteTopic(childId);
      
      expect(tree.topics[childId]).toBeUndefined();
      expect(tree.topics[parentId].children).not.toContain(childId);
    });

    it('should recursively delete child topics', () => {
      const parentId = tree.addTopic('Parent');
      const child1Id = tree.addTopic('Child 1', parentId);
      const child2Id = tree.addTopic('Child 2', parentId);
      const grandchildId = tree.addTopic('Grandchild', child1Id);
      
      tree.deleteTopic(parentId);
      
      expect(tree.topics[parentId]).toBeUndefined();
      expect(tree.topics[child1Id]).toBeUndefined();
      expect(tree.topics[child2Id]).toBeUndefined();
      expect(tree.topics[grandchildId]).toBeUndefined();
    });

    it('should return chat IDs when deleting', () => {
      const topicId = tree.addTopic('Test');
      tree.topics[topicId].chatIds = ['chat1', 'chat2', 'chat3'];
      
      const result = tree.deleteTopic(topicId);
      
      expect(result.chatIds).toEqual(['chat1', 'chat2', 'chat3']);
    });

    it('should return false for non-existent topic', () => {
      const result = tree.deleteTopic('nonexistent');
      expect(result).toBe(false);
    });
  });

  describe('Move Operations', () => {
    it('should move topic to different parent', () => {
      const parent1Id = tree.addTopic('Parent 1');
      const parent2Id = tree.addTopic('Parent 2');
      const childId = tree.addTopic('Child', parent1Id);
      
      tree.moveTopic(childId, parent2Id);
      
      expect(tree.topics[childId].parentId).toBe(parent2Id);
      expect(tree.topics[parent1Id].children).not.toContain(childId);
      expect(tree.topics[parent2Id].children).toContain(childId);
    });

    it('should move topic to root', () => {
      const parentId = tree.addTopic('Parent');
      const childId = tree.addTopic('Child', parentId);
      
      tree.moveTopic(childId, null);
      
      expect(tree.topics[childId].parentId).toBeNull();
      expect(tree.rootTopicIds).toContain(childId);
      expect(tree.topics[parentId].children).not.toContain(childId);
    });

    it('should prevent circular references', () => {
      const parentId = tree.addTopic('Parent');
      const childId = tree.addTopic('Child', parentId);
      const grandchildId = tree.addTopic('Grandchild', childId);
      
      expect(() => {
        tree.moveTopic(parentId, grandchildId);
      }).toThrow('Cannot move topic under itself or its descendants');
    });

    it('should prevent moving topic under itself', () => {
      const topicId = tree.addTopic('Test');
      
      expect(() => {
        tree.moveTopic(topicId, topicId);
      }).toThrow();
    });

    it('should throw error for non-existent topic', () => {
      expect(() => {
        tree.moveTopic('nonexistent', null);
      }).toThrow('Topic nonexistent does not exist');
    });

    it('should throw error for non-existent parent', () => {
      const topicId = tree.addTopic('Test');
      
      expect(() => {
        tree.moveTopic(topicId, 'nonexistent');
      }).toThrow('Parent topic nonexistent does not exist');
    });
  });

  describe('Rename Operations', () => {
    it('should rename a topic', () => {
      const topicId = tree.addTopic('Old Name');
      tree.renameTopic(topicId, 'New Name');
      
      expect(tree.topics[topicId].name).toBe('New Name');
    });

    it('should trim whitespace when renaming', () => {
      const topicId = tree.addTopic('Test');
      tree.renameTopic(topicId, '  New Name  ');
      
      expect(tree.topics[topicId].name).toBe('New Name');
    });

    it('should throw error for empty name', () => {
      const topicId = tree.addTopic('Test');
      
      expect(() => {
        tree.renameTopic(topicId, '');
      }).toThrow('Topic name must be a non-empty string');
    });

    it('should throw error for non-existent topic', () => {
      expect(() => {
        tree.renameTopic('nonexistent', 'New Name');
      }).toThrow('Topic nonexistent does not exist');
    });
  });

  describe('Topic Path', () => {
    it('should get path for root topic', () => {
      const topicId = tree.addTopic('Root');
      const path = tree.getTopicPath(topicId);
      
      expect(path).toHaveLength(1);
      expect(path[0].name).toBe('Root');
    });

    it('should get full path for nested topic', () => {
      const level1Id = tree.addTopic('Level 1');
      const level2Id = tree.addTopic('Level 2', level1Id);
      const level3Id = tree.addTopic('Level 3', level2Id);
      
      const path = tree.getTopicPath(level3Id);
      
      expect(path).toHaveLength(3);
      expect(path[0].name).toBe('Level 1');
      expect(path[1].name).toBe('Level 2');
      expect(path[2].name).toBe('Level 3');
    });

    it('should return empty array for non-existent topic', () => {
      const path = tree.getTopicPath('nonexistent');
      expect(path).toEqual([]);
    });
  });

  describe('Merge Operations', () => {
    it('should merge two topics', () => {
      const sourceId = tree.addTopic('Source');
      const targetId = tree.addTopic('Target');
      
      tree.topics[sourceId].chatIds = ['chat1', 'chat2'];
      tree.topics[targetId].chatIds = ['chat3'];
      
      const result = tree.mergeTopics(sourceId, targetId);
      
      expect(result.success).toBe(true);
      expect(tree.topics[sourceId]).toBeUndefined();
      expect(tree.topics[targetId].chatIds).toEqual(['chat3', 'chat1', 'chat2']);
    });

    it('should merge children from source to target', () => {
      const sourceId = tree.addTopic('Source');
      const targetId = tree.addTopic('Target');
      const child1Id = tree.addTopic('Child 1', sourceId);
      const child2Id = tree.addTopic('Child 2', sourceId);
      
      tree.mergeTopics(sourceId, targetId);
      
      expect(tree.topics[child1Id].parentId).toBe(targetId);
      expect(tree.topics[child2Id].parentId).toBe(targetId);
      expect(tree.topics[targetId].children).toContain(child1Id);
      expect(tree.topics[targetId].children).toContain(child2Id);
    });

    it('should merge date ranges', () => {
      const sourceId = tree.addTopic('Source');
      const targetId = tree.addTopic('Target');
      
      const oldDate = Date.now() - 2000000;
      const newDate = Date.now();
      
      tree.topics[sourceId].firstChatDate = oldDate;
      tree.topics[sourceId].lastChatDate = oldDate + 100000;
      tree.topics[targetId].firstChatDate = newDate - 100000;
      tree.topics[targetId].lastChatDate = newDate;
      
      tree.mergeTopics(sourceId, targetId);
      
      expect(tree.topics[targetId].firstChatDate).toBe(oldDate);
      expect(tree.topics[targetId].lastChatDate).toBe(newDate);
    });

    it('should throw error when merging topic with itself', () => {
      const topicId = tree.addTopic('Test');
      
      expect(() => {
        tree.mergeTopics(topicId, topicId);
      }).toThrow('Cannot merge topic with itself');
    });

    it('should throw error when merging with ancestor/descendant', () => {
      const parentId = tree.addTopic('Parent');
      const childId = tree.addTopic('Child', parentId);
      
      expect(() => {
        tree.mergeTopics(parentId, childId);
      }).toThrow('Cannot merge topic with its ancestor or descendant');
    });
  });

  describe('Date Range Operations', () => {
    it('should update topic date range', () => {
      const topicId = tree.addTopic('Test');
      const timestamp = Date.now();
      
      tree.updateTopicDateRange(topicId, timestamp);
      
      expect(tree.topics[topicId].firstChatDate).toBe(timestamp);
      expect(tree.topics[topicId].lastChatDate).toBe(timestamp);
    });

    it('should get formatted date range', () => {
      const topicId = tree.addTopic('Test');
      const date1 = new Date('2024-02-15').getTime();
      const date2 = new Date('2024-05-20').getTime();
      
      tree.updateTopicDateRange(topicId, date1);
      tree.updateTopicDateRange(topicId, date2);
      
      const range = tree.getTopicDateRange(topicId);
      expect(range).toBeDefined();
      expect(range).toContain('2024');
    });

    it('should return null for topic with no chats', () => {
      const topicId = tree.addTopic('Test');
      const range = tree.getTopicDateRange(topicId);
      
      expect(range).toBeNull();
    });
  });

  describe('Serialization', () => {
    it('should convert tree to and from object', () => {
      const id1 = tree.addTopic('Topic 1');
      const id2 = tree.addTopic('Topic 2', id1);
      
      const obj = tree.toObject();
      const restored = TopicTree.fromObject(obj);
      
      expect(restored.rootTopicIds).toEqual(tree.rootTopicIds);
      expect(restored.topics[id1].name).toBe('Topic 1');
      expect(restored.topics[id2].name).toBe('Topic 2');
      expect(restored.topics[id2].parentId).toBe(id1);
    });
  });

  describe('Tree Utilities', () => {
    it('should get all topics', () => {
      tree.addTopic('Topic 1');
      tree.addTopic('Topic 2');
      tree.addTopic('Topic 3');
      
      const allTopics = tree.getAllTopics();
      expect(allTopics).toHaveLength(3);
    });

    it('should get root topics', () => {
      const root1Id = tree.addTopic('Root 1');
      const root2Id = tree.addTopic('Root 2');
      tree.addTopic('Child', root1Id);
      
      const rootTopics = tree.getRootTopics();
      expect(rootTopics).toHaveLength(2);
      expect(rootTopics.map(t => t.name)).toContain('Root 1');
      expect(rootTopics.map(t => t.name)).toContain('Root 2');
    });

    it('should get children of a topic', () => {
      const parentId = tree.addTopic('Parent');
      tree.addTopic('Child 1', parentId);
      tree.addTopic('Child 2', parentId);
      
      const children = tree.getChildren(parentId);
      expect(children).toHaveLength(2);
    });

    it('should find orphaned topics', () => {
      const topicId = tree.addTopic('Test');
      tree.topics[topicId].parentId = 'nonexistent';
      
      const orphans = tree.findOrphans();
      expect(orphans).toHaveLength(1);
      expect(orphans[0].id).toBe(topicId);
    });

    it('should repair tree by moving orphans to root', () => {
      const topicId = tree.addTopic('Test');
      tree.topics[topicId].parentId = 'nonexistent';
      
      const repairCount = tree.repairTree();
      
      expect(repairCount).toBe(1);
      expect(tree.topics[topicId].parentId).toBeNull();
      expect(tree.rootTopicIds).toContain(topicId);
    });

    it('should get tree statistics', () => {
      const root1Id = tree.addTopic('Root 1');
      const root2Id = tree.addTopic('Root 2');
      const child1Id = tree.addTopic('Child 1', root1Id);
      tree.addTopic('Grandchild', child1Id);
      
      tree.topics[root1Id].chatIds = ['chat1', 'chat2'];
      tree.topics[child1Id].chatIds = ['chat3'];
      
      const stats = tree.getStatistics();
      
      expect(stats.totalTopics).toBe(4);
      expect(stats.totalChats).toBe(3);
      expect(stats.rootTopics).toBe(2);
      expect(stats.maxDepth).toBe(2);
    });
  });
});
