/**
 * Storage Service Usage Examples
 * Stage 2: Storage Abstraction Layer
 * 
 * This file demonstrates how to use the storage service in the extension.
 * Use these patterns in future stages when implementing UI features.
 */

import { StorageService, StorageUsageTracker } from './lib/storage.js';

// ============================================================================
// 1. Getting the Storage Instance
// ============================================================================

// Get the singleton storage instance (Chrome storage by default)
const storage = StorageService.getInstance();

// ============================================================================
// 2. Working with Topic Trees
// ============================================================================

async function exampleTopicTreeOperations() {
  // Create a new topic tree structure
  const tree = {
    topics: {
      'topic_001': {
        id: 'topic_001',
        name: 'Programming',
        parentId: null,
        children: ['topic_002', 'topic_003'],
        chatIds: ['chat_001'],
        createdAt: Date.now(),
        updatedAt: Date.now()
      },
      'topic_002': {
        id: 'topic_002',
        name: 'JavaScript',
        parentId: 'topic_001',
        children: [],
        chatIds: ['chat_002'],
        createdAt: Date.now(),
        updatedAt: Date.now()
      },
      'topic_003': {
        id: 'topic_003',
        name: 'Python',
        parentId: 'topic_001',
        children: [],
        chatIds: [],
        createdAt: Date.now(),
        updatedAt: Date.now()
      }
    },
    rootTopicIds: ['topic_001'],
    version: 1
  };

  // Save the topic tree
  await storage.saveTopicTree(tree);
  console.log('Topic tree saved successfully');

  // Load the topic tree
  const loadedTree = await storage.loadTopicTree();
  console.log('Loaded topic tree:', loadedTree);

  // Access a specific topic
  const programmingTopic = loadedTree.topics['topic_001'];
  console.log('Programming topic:', programmingTopic);
}

// ============================================================================
// 3. Working with Chat Entries
// ============================================================================

async function exampleChatOperations() {
  // Create a new chat entry
  const chatData = {
    title: 'How to use async/await in JavaScript',
    content: 'Q: Explain async/await\nA: Async/await is a way to write asynchronous code...',
    url: 'https://chat.openai.com/c/abc123',
    source: 'chatgpt',
    timestamp: Date.now(),
    metadata: {
      messageCount: 5,
      tokensUsed: 1250
    }
  };

  // Save the chat to a topic
  const chatId = await storage.saveChat('topic_002', chatData);
  console.log('Chat saved with ID:', chatId);

  // Load the chat
  const loadedChat = await storage.loadChat(chatId);
  console.log('Loaded chat:', loadedChat);

  // Delete the chat
  const deleted = await storage.deleteChat(chatId);
  console.log('Chat deleted:', deleted);
}

// ============================================================================
// 4. Searching Chats
// ============================================================================

async function exampleSearchOperations() {
  // Search for chats containing "javascript"
  const results = await storage.searchChats('javascript');
  console.log(`Found ${results.length} chats matching "javascript"`);

  // Display search results
  results.forEach((chat, index) => {
    console.log(`${index + 1}. ${chat.title} (${chat.source})`);
  });

  // Search is case-insensitive
  const results2 = await storage.searchChats('JAVASCRIPT');
  console.log('Case-insensitive search works:', results.length === results2.length);
}

// ============================================================================
// 5. Monitoring Storage Usage
// ============================================================================

async function exampleStorageUsage() {
  // Create usage tracker
  const tracker = new StorageUsageTracker(storage);

  // Get formatted usage string
  const usageStr = await tracker.getFormattedUsage();
  console.log('Storage usage:', usageStr); // e.g., "2.5 MB / 10 MB"

  // Check if approaching quota (default 80% threshold)
  const isApproaching = await tracker.isApproachingQuota();
  if (isApproaching) {
    console.warn('Storage is approaching quota limit!');
  }

  // Get detailed statistics
  const stats = await tracker.getStatistics();
  console.log('Detailed stats:', {
    bytesUsed: stats.bytesUsed,
    percentUsed: stats.percentUsed.toFixed(2) + '%',
    topicCount: stats.topicCount,
    chatCount: stats.chatCount
  });

  // Custom threshold (90%)
  const critical = await tracker.isApproachingQuota(90);
  if (critical) {
    console.error('Storage is critically full!');
  }
}

// ============================================================================
// 6. Error Handling
// ============================================================================

async function exampleErrorHandling() {
  try {
    // Attempt to save invalid chat data
    await storage.saveChat('topic_001', {
      // Missing required fields
      content: 'Some content'
    });
  } catch (error) {
    console.error('Validation error:', error.message);
    // Expected: "Chat must have a title (string)"
  }

  try {
    // Attempt to load non-existent chat
    const chat = await storage.loadChat('nonexistent_id');
    if (!chat) {
      console.log('Chat not found, returns null gracefully');
    }
  } catch (error) {
    console.error('Error loading chat:', error.message);
  }
}

// ============================================================================
// 7. Data Migration Example (Future)
// ============================================================================

async function exampleMigrationPath() {
  // Current usage (Chrome storage)
  const chromeStorage = StorageService.getInstance('chrome');
  await chromeStorage.saveTopicTree({ topics: {}, rootTopicIds: [], version: 1 });

  // Future: Switch to IndexedDB (when implemented)
  // This will work without changing any code above!
  // const indexedDB = StorageService.getInstance('indexeddb');
  // await indexedDB.saveTopicTree(tree);

  console.log('Storage abstraction enables seamless migration');
}

// ============================================================================
// 8. Complete Workflow Example
// ============================================================================

async function completeWorkflowExample() {
  console.log('=== Complete Storage Workflow ===\n');

  // 1. Initialize with empty tree
  const emptyTree = {
    topics: {},
    rootTopicIds: [],
    version: 1
  };
  await storage.saveTopicTree(emptyTree);
  console.log('1. Initialized empty tree');

  // 2. Add a topic (in Stage 3, this will use TopicTree class)
  const tree = await storage.loadTopicTree();
  tree.topics['topic_001'] = {
    id: 'topic_001',
    name: 'Web Development',
    parentId: null,
    children: [],
    chatIds: [],
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  tree.rootTopicIds.push('topic_001');
  await storage.saveTopicTree(tree);
  console.log('2. Added topic "Web Development"');

  // 3. Save a chat to the topic
  const chatId = await storage.saveChat('topic_001', {
    title: 'React Hooks Explained',
    content: 'Deep dive into useState, useEffect, and custom hooks...',
    url: 'https://chat.openai.com/c/example',
    source: 'chatgpt',
    timestamp: Date.now()
  });
  console.log('3. Saved chat:', chatId);

  // 4. Search for the chat
  const searchResults = await storage.searchChats('react');
  console.log('4. Search found:', searchResults.length, 'result(s)');

  // 5. Check storage usage
  const usage = await storage.getStorageUsage();
  console.log('5. Storage usage:', {
    topics: usage.topicCount,
    chats: usage.chatCount,
    percent: usage.percentUsed.toFixed(2) + '%'
  });

  console.log('\n=== Workflow Complete ===');
}

// ============================================================================
// Run Examples (uncomment to test in console)
// ============================================================================

// Uncomment these lines to run examples:
// exampleTopicTreeOperations();
// exampleChatOperations();
// exampleSearchOperations();
// exampleStorageUsage();
// exampleErrorHandling();
// completeWorkflowExample();

export {
  exampleTopicTreeOperations,
  exampleChatOperations,
  exampleSearchOperations,
  exampleStorageUsage,
  exampleErrorHandling,
  completeWorkflowExample
};
