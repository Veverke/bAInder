import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DialogManager } from '../src/lib/dialog-manager.js';
import { TopicDialogs } from '../src/lib/topic-dialogs.js';
import { TopicTree } from '../src/lib/tree.js';
import { StorageService, ChromeStorageAdapter } from '../src/lib/storage.js';

/**
 * Integration tests for full dialog workflows
 * Tests the complete flow from user interaction through to storage
 */
describe('Sidepanel Integration - Dialog Workflows with Storage', () => {
  let container;
  let dialog;
  let tree;
  let storage;
  let topicDialogs;

  beforeEach(() => {
    // Create container
    container = document.createElement('div');
    container.id = 'modalContainer';
    document.body.appendChild(container);

    // Initialize components
    dialog = new DialogManager(container);
    tree = new TopicTree();
    storage = StorageService.getInstance('chrome');
    topicDialogs = new TopicDialogs(dialog, tree);

    // Spy on storage methods
    vi.spyOn(storage, 'saveTopicTree').mockResolvedValue(true);
    vi.spyOn(storage, 'loadTopicTree').mockResolvedValue({
      topics: {},
      rootTopicIds: [],
      version: 1
    });
  });

  afterEach(() => {
    document.body.innerHTML = '';
    StorageService.resetInstance();
  });

  describe('Add Topic Workflow', () => {
    it('should create topic and save to storage', async () => {
      // Start the add topic flow
      const promise = topicDialogs.showAddTopic();
      
      // User fills in form
      const nameInput = document.querySelector('[data-field="name"]');
      nameInput.value = 'My New Topic';
      
      const parentSelect = document.querySelector('[data-field="parentId"]');
      parentSelect.value = ''; // Root level
      
      // User clicks Create Topic button
      const submitBtn = document.querySelector('[data-action="submit"]');
      submitBtn.click();
      
      // Wait for dialog to complete
      const result = await promise;
      
      // Verify topic was created
      expect(result).not.toBeNull();
      expect(result.success).toBe(true);
      expect(result.name).toBe('My New Topic');
      expect(result.topicId).toBeTruthy();
      
      // Verify topic exists in tree
      const topic = tree.topics[result.topicId];
      expect(topic).toBeTruthy();
      expect(topic.name).toBe('My New Topic');
      expect(topic.parentId).toBeNull();
      
      // Now simulate saving the tree (what handleAddTopic would do)
      await storage.saveTopicTree(tree.toObject());
      
      // Verify storage was called
      expect(storage.saveTopicTree).toHaveBeenCalledWith(tree.toObject());
    });

    it('should create child topic under parent', async () => {
      // First create a parent topic
      const parentId = tree.addTopic('Parent Topic');
      
      // Start the add topic flow with default parent
      const promise = topicDialogs.showAddTopic(parentId);
      
      // User fills in form
      const nameInput = document.querySelector('[data-field="name"]');
      nameInput.value = 'Child Topic';
      
      // User clicks Create Topic
      const submitBtn = document.querySelector('[data-action="submit"]');
      submitBtn.click();
      
      const result = await promise;
      
      // Verify child topic was created
      expect(result.success).toBe(true);
      expect(result.parentId).toBe(parentId);
      
      const childTopic = tree.topics[result.topicId];
      expect(childTopic.parentId).toBe(parentId);
      
      // Verify parent has child
      const parentTopic = tree.topics[parentId];
      expect(parentTopic.children).toContain(result.topicId);
      
      // Simulate save
      await storage.saveTopicTree(tree.toObject());
      expect(storage.saveTopicTree).toHaveBeenCalled();
    });

    it('should not save if user cancels dialog', async () => {
      const promise = topicDialogs.showAddTopic();
      
      // User fills in form
      const nameInput = document.querySelector('[data-field="name"]');
      nameInput.value = 'Cancelled Topic';
      
      // User clicks Cancel
      const cancelBtn = document.querySelector('[data-action="cancel"]');
      cancelBtn.click();
      
      const result = await promise;
      
      // Verify nothing was created
      expect(result).toBeNull();
      
      // Simulate what handleAddTopic does - check result before saving
      if (result) {
        await storage.saveTopicTree(tree.toObject());
      }
      
      // Verify storage was NOT called
      expect(storage.saveTopicTree).not.toHaveBeenCalled();
    });

    it('should not save if validation fails', async () => {
      const promise = topicDialogs.showAddTopic();
      
      // User leaves name empty (validation error)
      const nameInput = document.querySelector('[data-field="name"]');
      nameInput.value = '';
      
      // User tries to submit
      const submitBtn = document.querySelector('[data-action="submit"]');
      submitBtn.click();
      
      // Dialog should still be open (validation failed)
      expect(container.style.display).toBe('flex');
      
      // Cancel dialog
      const cancelBtn = document.querySelector('[data-action="cancel"]');
      cancelBtn.click();
      
      await promise;
      
      // Verify storage was NOT called
      expect(storage.saveTopicTree).not.toHaveBeenCalled();
    });

    it('should show error alert for duplicate name at root level', async () => {
      // Create first topic
      tree.addTopic('Programming');
      
      // Try to create duplicate
      const promise = topicDialogs.showAddTopic();
      
      // User enters duplicate name
      const nameInput = document.querySelector('[data-field="name"]');
      nameInput.value = 'Programming';
      
      // User clicks Create Topic
      const submitBtn = document.querySelector('[data-action="submit"]');
      submitBtn.click();
      
      // Wait for alert dialog to appear
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Verify error alert is shown
      const alertDialog = container.querySelector('.modal');
      expect(alertDialog).toBeTruthy();
      expect(alertDialog.textContent).toContain('already exists at this level');
      
      // Close alert - this will allow the main promise to resolve
      const okBtn = document.querySelector('[data-action="ok"]');
      expect(okBtn).toBeTruthy();
      okBtn.click();
      
      // Now wait for the main dialog promise to resolve
      const result = await promise;
      
      // Verify result is null (creation failed)
      expect(result).toBeNull();
      
      // Verify only one Programming topic exists
      const topics = tree.getAllTopics().filter(t => t.name === 'Programming');
      expect(topics.length).toBe(1);
    });

    it('should show error alert for duplicate name at child level', async () => {
      // Create parent and child
      const parentId = tree.addTopic('Parent');
      tree.addTopic('Existing Child', parentId);
      
      // Try to create duplicate child
      const promise = topicDialogs.showAddTopic(parentId);
      
      // User enters duplicate name
      const nameInput = document.querySelector('[data-field="name"]');
      nameInput.value = 'Existing Child';
      
      const submitBtn = document.querySelector('[data-action="submit"]');
      submitBtn.click();
      
      // Wait for and verify error alert
      await new Promise(resolve => setTimeout(resolve, 50));
      const alertDialog = container.querySelector('.modal');
      expect(alertDialog.textContent).toContain('already exists at this level');
      
      // Close alert
      const okBtn = document.querySelector('[data-action="ok"]');
      expect(okBtn).toBeTruthy();
      okBtn.click();
      
      // Wait for main promise
      const result = await promise;
      
      expect(result).toBeNull();
      
      // Verify only one child with that name
      const parent = tree.topics[parentId];
      const children = parent.children.map(id => tree.topics[id]);
      const duplicates = children.filter(c => c.name === 'Existing Child');
      expect(duplicates.length).toBe(1);
    });
  });

  describe('Rename Topic Workflow', () => {
    it('should rename topic and save to storage', async () => {
      // Create a topic first
      const topicId = tree.addTopic('Original Name');
      
      // Start rename flow
      const promise = topicDialogs.showRenameTopic(topicId);
      
      // User changes name
      const nameInput = document.querySelector('[data-field="name"]');
      expect(nameInput.value).toBe('Original Name');
      nameInput.value = 'New Name';
      
      // User clicks submit
      const submitBtn = document.querySelector('[data-action="submit"]');
      submitBtn.click();
      
      const result = await promise;
      
      // Verify rename succeeded
      expect(result.success).toBe(true);
      expect(result.oldName).toBe('Original Name');
      expect(result.newName).toBe('New Name');
      
      // Verify topic was renamed
      const topic = tree.topics[topicId];
      expect(topic.name).toBe('New Name');
      
      // Simulate save
      await storage.saveTopicTree(tree.toObject());
      expect(storage.saveTopicTree).toHaveBeenCalled();
    });

    it('should not save if name unchanged', async () => {
      const topicId = tree.addTopic('Same Name');
      
      const promise = topicDialogs.showRenameTopic(topicId);
      
      // User keeps same name
      const nameInput = document.querySelector('[data-field="name"]');
      nameInput.value = 'Same Name';
      
      const submitBtn = document.querySelector('[data-action="submit"]');
      submitBtn.click();
      
      const result = await promise;
      
      // Verify no change
      expect(result).toBeNull();
      
      // Verify storage was NOT called
      expect(storage.saveTopicTree).not.toHaveBeenCalled();
    });

    it('should show error alert when renaming to duplicate name', async () => {
      // Create two topics
      tree.addTopic('Topic A');
      const topicBId = tree.addTopic('Topic B');
      
      // Try to rename Topic B to Topic A
      const promise = topicDialogs.showRenameTopic(topicBId);
      
      const nameInput = document.querySelector('[data-field="name"]');
      nameInput.value = 'Topic A';
      
      const submitBtn = document.querySelector('[data-action="submit"]');
      submitBtn.click();
      
      // Wait for alert dialog
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Verify error alert is shown
      const alertDialog = container.querySelector('.modal');
      expect(alertDialog).toBeTruthy();
      expect(alertDialog.textContent).toContain('already exists at this level');
      
      // Close alert
      const okBtn = document.querySelector('[data-action="ok"]');
      expect(okBtn).toBeTruthy();
      okBtn.click();
      
      // Wait for main promise
      const result = await promise;
      
      // Verify rename failed
      expect(result).toBeNull();
      
      // Verify Topic B name unchanged
      const topicB = tree.topics[topicBId];
      expect(topicB.name).toBe('Topic B');
    });
  });

  describe('Move Topic Workflow', () => {
    it('should move topic and save to storage', async () => {
      // Create topics
      const topic1 = tree.addTopic('Topic 1');
      const topic2 = tree.addTopic('Topic 2');
      
      // Start move flow
      const promise = topicDialogs.showMoveTopic(topic1);
      
      // User selects new parent
      const parentSelect = document.querySelector('[data-field="newParentId"]');
      parentSelect.value = topic2;
      
      const submitBtn = document.querySelector('[data-action="submit"]');
      submitBtn.click();
      
      const result = await promise;
      
      // Verify move succeeded
      expect(result.success).toBe(true);
      expect(result.newParentId).toBe(topic2);
      
      // Verify topic was moved
      const topic = tree.topics[topic1];
      expect(topic.parentId).toBe(topic2);
      
      // Simulate save
      await storage.saveTopicTree(tree.toObject());
      expect(storage.saveTopicTree).toHaveBeenCalled();
    });
  });

  describe('Delete Topic Workflow', () => {
    it('should delete topic and save to storage', async () => {
      // Create a topic
      const topicId = tree.addTopic('To Delete');
      
      // Start delete flow
      const promise = topicDialogs.showDeleteTopic(topicId);
      
      // User confirms deletion
      const confirmBtn = document.querySelector('[data-action="confirm"]');
      confirmBtn.click();
      
      const result = await promise;
      
      // Verify deletion succeeded
      expect(result.success).toBe(true);
      
      // Verify topic was deleted
      expect(tree.topics[topicId]).toBeUndefined();
      
      // Simulate save
      await storage.saveTopicTree(tree.toObject());
      expect(storage.saveTopicTree).toHaveBeenCalled();
    });

    it('should not save if user cancels deletion', async () => {
      const topicId = tree.addTopic('Keep This');
      
      const promise = topicDialogs.showDeleteTopic(topicId);
      
      // User cancels
      const cancelBtn = document.querySelector('[data-action="cancel"]');
      cancelBtn.click();
      
      const result = await promise;
      
      // Verify nothing was deleted
      expect(result).toBeNull();
      expect(tree.topics[topicId]).toBeTruthy();
      
      // Verify storage was NOT called
      expect(storage.saveTopicTree).not.toHaveBeenCalled();
    });
  });

  describe('Merge Topics Workflow', () => {
    it('should merge topics and save to storage', async () => {
      // Create topics
      const source = tree.addTopic('Source');
      const target = tree.addTopic('Target');
      
      // Start merge flow
      const promise = topicDialogs.showMergeTopic(source);
      
      // User selects target
      const targetSelect = document.querySelector('[data-field="targetTopicId"]');
      targetSelect.value = target;
      
      const submitBtn = document.querySelector('[data-action="submit"]');
      submitBtn.click();
      
      // Wait for confirmation dialog
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // User confirms merge
      const confirmBtn = document.querySelector('[data-action="confirm"]');
      confirmBtn.click();
      
      const result = await promise;
      
      // Verify merge succeeded
      expect(result.success).toBe(true);
      expect(result.targetTopicId).toBe(target);
      
      // Verify source was deleted
      expect(tree.topics[source]).toBeUndefined();
      
      // Simulate save
      await storage.saveTopicTree(tree.toObject());
      expect(storage.saveTopicTree).toHaveBeenCalled();
    });
  });

  describe('Storage Error Handling', () => {
    it('should handle storage save errors gracefully', async () => {
      // Make storage fail
      storage.saveTopicTree.mockRejectedValue(new Error('Storage quota exceeded'));
      
      // Create topic
      const topicId = tree.addTopic('Test Topic');
      
      // Try to save
      try {
        await storage.saveTopicTree(tree.toObject());
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error.message).toContain('Storage quota exceeded');
      }
      
      // Verify topic still exists in memory even though save failed
      expect(tree.topics[topicId]).toBeTruthy();
    });

    it('should handle storage load errors gracefully', async () => {
      // Make storage fail
      storage.loadTopicTree.mockRejectedValue(new Error('Storage corrupted'));
      
      // Try to load
      try {
        await storage.loadTopicTree();
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error.message).toContain('Storage corrupted');
      }
    });
  });

  describe('Chrome Storage API Integration', () => {
    it('should use correct method names', () => {
      // Verify storage has correct methods
      expect(typeof storage.saveTopicTree).toBe('function');
      expect(typeof storage.loadTopicTree).toBe('function');
      expect(typeof storage.searchChats).toBe('function');
      expect(typeof storage.getStorageUsage).toBe('function');
      expect(typeof storage.clearAll).toBe('function');
    });

    it('should properly serialize tree for storage', () => {
      // Create complex tree structure
      const parent = tree.addTopic('Parent');
      const child1 = tree.addTopic('Child 1', parent);
      const child2 = tree.addTopic('Child 2', parent);
      const grandchild = tree.addTopic('Grandchild', child1);
      
      // Serialize tree
      const treeObj = tree.toObject();
      
      // Verify structure is correct
      expect(treeObj.topics).toBeTruthy();
      expect(treeObj.rootTopicIds).toContain(parent);
      expect(Object.keys(treeObj.topics).length).toBe(4);
      
      // Verify relationships
      expect(treeObj.topics[parent].children).toContain(child1);
      expect(treeObj.topics[parent].children).toContain(child2);
      expect(treeObj.topics[child1].children).toContain(grandchild);
    });

    it('should properly deserialize tree from storage', () => {
      // Create tree data
      const treeData = {
        topics: {
          'topic-1': {
            id: 'topic-1',
            name: 'Test Topic',
            parentId: null,
            children: [],
            chatIds: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }
        },
        rootTopicIds: ['topic-1'],
        version: 1
      };
      
      // Deserialize
      const loadedTree = TopicTree.fromObject(treeData);
      
      // Verify tree was loaded correctly
      expect(loadedTree.topics['topic-1']).toBeTruthy();
      expect(loadedTree.topics['topic-1'].name).toBe('Test Topic');
      expect(loadedTree.getRootTopics().length).toBe(1);
    });
  });
});

// ---------------------------------------------------------------------------
// TopicDialogs – error path coverage (topic-not-found, no-valid-target, etc.)
// ---------------------------------------------------------------------------

describe('TopicDialogs – error paths', () => {
  let container;
  let dialog;
  let tree;
  let topicDialogs;

  beforeEach(() => {
    container = document.createElement('div');
    container.id = 'modalContainer';
    document.body.appendChild(container);
    dialog = new DialogManager(container);
    tree = new TopicTree();
    topicDialogs = new TopicDialogs(dialog, tree);
    StorageService.resetInstance();
  });

  afterEach(() => {
    document.body.innerHTML = '';
    StorageService.resetInstance();
  });

  // ---- showRenameTopic ----

  it('showRenameTopic: should alert and return null for non-existent topicId', async () => {
    const promise = topicDialogs.showRenameTopic('ghost-id');

    await new Promise(resolve => setTimeout(resolve, 20));

    const modal = container.querySelector('.modal');
    expect(modal).toBeTruthy();
    expect(modal.textContent).toContain('Topic not found');

    container.querySelector('[data-action="ok"]').click();
    const result = await promise;
    expect(result).toBeNull();
  });

  it('showRenameTopic: should return null when same name is submitted', async () => {
    const topicId = tree.addTopic('Same Name');

    const promise = topicDialogs.showRenameTopic(topicId);

    const nameInput = container.querySelector('[data-field="name"]');
    // keep the pre-filled value (Same Name) unchanged
    expect(nameInput.value).toBe('Same Name');

    container.querySelector('[data-action="submit"]').click();
    const result = await promise;
    expect(result).toBeNull();
  });

  // ---- showMoveTopic ----

  it('showMoveTopic: should alert and return null for non-existent topicId', async () => {
    const promise = topicDialogs.showMoveTopic('ghost-id');

    await new Promise(resolve => setTimeout(resolve, 20));

    const modal = container.querySelector('.modal');
    expect(modal).toBeTruthy();
    expect(modal.textContent).toContain('Topic not found');

    container.querySelector('[data-action="ok"]').click();
    const result = await promise;
    expect(result).toBeNull();
  });

  it('showMoveTopic: should show "Cannot Move" alert when no other locations exist', async () => {
    // Single topic with no other topics in the tree
    const onlyTopicId = tree.addTopic('Lonely');

    const promise = topicDialogs.showMoveTopic(onlyTopicId);

    await new Promise(resolve => setTimeout(resolve, 20));

    const modal = container.querySelector('.modal');
    expect(modal).toBeTruthy();
    expect(modal.textContent).toContain('No other locations');

    container.querySelector('[data-action="ok"]').click();
    const result = await promise;
    expect(result).toBeNull();
  });

  it('showMoveTopic: should return null when same parent is selected', async () => {
    const parentId = tree.addTopic('Parent');
    const childId  = tree.addTopic('Child', parentId);
    // Add another topic so the form is shown (not "no locations" alert)
    tree.addTopic('Sibling', parentId);

    const promise = topicDialogs.showMoveTopic(childId);

    // Select the same parent (current parentId = parentId)
    const select = container.querySelector('[data-field="newParentId"]');
    select.value = parentId;
    container.querySelector('[data-action="submit"]').click();

    const result = await promise;
    expect(result).toBeNull();
  });

  // ---- showDeleteTopic ----

  it('showDeleteTopic: should alert and return null for non-existent topicId', async () => {
    const promise = topicDialogs.showDeleteTopic('ghost-id');

    await new Promise(resolve => setTimeout(resolve, 20));

    const modal = container.querySelector('.modal');
    expect(modal).toBeTruthy();
    expect(modal.textContent).toContain('Topic not found');

    container.querySelector('[data-action="ok"]').click();
    const result = await promise;
    expect(result).toBeNull();
  });

  it('showDeleteTopic: should include child/chat counts in confirmation message', async () => {
    const parentId = tree.addTopic('Parent With Data');
    tree.addTopic('Child A', parentId);
    tree.addTopic('Child B', parentId);
    tree.topics[parentId].chatIds = ['c1', 'c2', 'c3'];

    const promise = topicDialogs.showDeleteTopic(parentId);

    await new Promise(resolve => setTimeout(resolve, 20));

    const modal = container.querySelector('.modal');
    expect(modal).toBeTruthy();
    // Should mention both children and chats
    expect(modal.textContent).toContain('2 child topics');
    expect(modal.textContent).toContain('3 chats');

    // Cancel to resolve the promise
    container.querySelector('[data-action="cancel"]').click();
    await promise;
  });

  // ---- showMergeTopic ----

  it('showMergeTopic: should alert and return null for non-existent source topicId', async () => {
    const promise = topicDialogs.showMergeTopic('ghost-id');

    await new Promise(resolve => setTimeout(resolve, 20));

    const modal = container.querySelector('.modal');
    expect(modal).toBeTruthy();
    expect(modal.textContent).toContain('Topic not found');

    container.querySelector('[data-action="ok"]').click();
    const result = await promise;
    expect(result).toBeNull();
  });

  it('showMergeTopic: should alert "Cannot Merge" when no other targets exist', async () => {
    // Only one root topic – nothing to merge into
    const onlyTopicId = tree.addTopic('Lonely');

    const promise = topicDialogs.showMergeTopic(onlyTopicId);

    await new Promise(resolve => setTimeout(resolve, 20));

    const modal = container.querySelector('.modal');
    expect(modal).toBeTruthy();
    expect(modal.textContent).toContain('No other topics');

    container.querySelector('[data-action="ok"]').click();
    const result = await promise;
    expect(result).toBeNull();
  });

  it('showMergeTopic: should return null when user cancels the confirmation dialog', async () => {
    const sourceId = tree.addTopic('Source');
    const targetId = tree.addTopic('Target');

    const promise = topicDialogs.showMergeTopic(sourceId);

    // Select target
    const targetSelect = container.querySelector('[data-field="targetTopicId"]');
    targetSelect.value = targetId;
    container.querySelector('[data-action="submit"]').click();

    // Wait for confirmation dialog to appear
    await new Promise(resolve => setTimeout(resolve, 50));

    // User cancels the confirmation
    const cancelBtn = container.querySelector('[data-action="cancel"]');
    expect(cancelBtn).toBeTruthy();
    cancelBtn.click();

    const result = await promise;
    expect(result).toBeNull();

    // Source topic should still exist
    expect(tree.topics[sourceId]).toBeTruthy();
  });

  // ---- showAddTopic: unexpected tree error ----

  it('showAddTopic: should show error alert when addTopic throws', async () => {
    // Force addTopic to throw
    vi.spyOn(tree, 'addTopic').mockImplementation(() => {
      throw new Error('Tree is full');
    });

    const promise = topicDialogs.showAddTopic();

    const nameInput = container.querySelector('[data-field="name"]');
    nameInput.value = 'Something';
    container.querySelector('[data-action="submit"]').click();

    await new Promise(resolve => setTimeout(resolve, 50));

    const modal = container.querySelector('.modal');
    expect(modal).toBeTruthy();
    expect(modal.textContent).toContain('Tree is full');

    container.querySelector('[data-action="ok"]').click();
    const result = await promise;
    expect(result).toBeNull();

    vi.restoreAllMocks();
  });
});
