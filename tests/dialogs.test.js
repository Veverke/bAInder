import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DialogManager } from '../src/lib/dialog-manager.js';
import { TopicDialogs } from '../src/lib/topic-dialogs.js';
import { TopicTree } from '../src/lib/tree.js';

describe('DialogManager', () => {
  let container;
  let dialog;

  beforeEach(() => {
    // Create container
    container = document.createElement('div');
    container.id = 'modalContainer';
    document.body.appendChild(container);

    dialog = new DialogManager(container);
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  describe('Initialization', () => {
    it('should create dialog manager with container', () => {
      expect(dialog.container).toBe(container);
    });

    it('should initialize with no current dialog', () => {
      expect(dialog.currentDialog).toBeNull();
    });

    it('should not be open initially', () => {
      expect(dialog.isOpen()).toBe(false);
    });
  });

  describe('Alert Dialog', () => {
    it('should show alert dialog', async () => {
      const promise = dialog.alert('Test message', 'Test Title');
      
      expect(container.style.display).toBe('flex');
      expect(container.textContent).toContain('Test Title');
      expect(container.textContent).toContain('Test message');
      
      // Click OK button
      const okBtn = container.querySelector('[data-action="ok"]');
      okBtn.click();
      
      await promise;
      expect(container.style.display).toBe('none');
    });
  });

  describe('Confirm Dialog', () => {
    it('should resolve true when confirmed', async () => {
      const promise = dialog.confirm('Confirm this?', 'Confirm');
      
      const confirmBtn = container.querySelector('[data-action="confirm"]');
      confirmBtn.click();
      
      const result = await promise;
      expect(result).toBe(true);
    });

    it('should resolve false when cancelled', async () => {
      const promise = dialog.confirm('Confirm this?', 'Confirm');
      
      const cancelBtn = container.querySelector('[data-action="cancel"]');
      cancelBtn.click();
      
      const result = await promise;
      expect(result).toBe(false);
    });
  });

  describe('Prompt Dialog', () => {
    it('should show prompt with default value', async () => {
      dialog.prompt('Enter name', 'Default', 'Input');
      
      const input = container.querySelector('[data-input="value"]');
      expect(input.value).toBe('Default');
    });

    it('should return input value when submitted', async () => {
      const promise = dialog.prompt('Enter name', '', 'Input');
      
      const input = container.querySelector('[data-input="value"]');
      input.value = 'Test Value';
      
      const submitBtn = container.querySelector('[data-action="submit"]');
      submitBtn.click();
      
      const result = await promise;
      expect(result).toBe('Test Value');
    });

    it('should return null when cancelled', async () => {
      const promise = dialog.prompt('Enter name', '', 'Input');
      
      const cancelBtn = container.querySelector('[data-action="cancel"]');
      cancelBtn.click();
      
      const result = await promise;
      expect(result).toBeNull();
    });

    it('should submit on Enter key', async () => {
      const promise = dialog.prompt('Enter name', '', 'Input');
      
      const input = container.querySelector('[data-input="value"]');
      input.value = 'Test';
      
      const event = new KeyboardEvent('keydown', { key: 'Enter' });
      input.dispatchEvent(event);
      
      const result = await promise;
      expect(result).toBe('Test');
    });
  });

  describe('Form Dialog', () => {
    it('should show form with multiple fields', async () => {
      dialog.form([
        { name: 'name', label: 'Name', type: 'text', required: true },
        { name: 'email', label: 'Email', type: 'email' }
      ], 'User Form', 'Submit');
      
      const inputs = container.querySelectorAll('input');
      expect(inputs.length).toBe(2);
    });

    it('should return form data when submitted', async () => {
      const promise = dialog.form([
        { name: 'name', label: 'Name', type: 'text', required: true },
        { name: 'age', label: 'Age', type: 'number' }
      ], 'Form', 'Submit');
      
      const nameInput = container.querySelector('[data-field="name"]');
      const ageInput = container.querySelector('[data-field="age"]');
      
      nameInput.value = 'John';
      ageInput.value = '25';
      
      const submitBtn = container.querySelector('[data-action="submit"]');
      submitBtn.click();
      
      const result = await promise;
      expect(result).toEqual({ name: 'John', age: '25' });
    });

    it('should validate required fields', async () => {
      dialog.form([
        { name: 'name', label: 'Name', type: 'text', required: true }
      ], 'Form', 'Submit');
      
      const submitBtn = container.querySelector('[data-action="submit"]');
      submitBtn.click();
      
      const input = container.querySelector('[data-field="name"]');
      expect(input.classList.contains('error')).toBe(true);
    });

    it('should support select fields', async () => {
      dialog.form([
        {
          name: 'category',
          label: 'Category',
          type: 'select',
          options: ['Option 1', 'Option 2', 'Option 3']
        }
      ], 'Form', 'Submit');
      
      const select = container.querySelector('select');
      expect(select).not.toBeNull();
      expect(select.options.length).toBe(3);
    });

    it('should support textarea fields', async () => {
      dialog.form([
        { name: 'description', label: 'Description', type: 'textarea' }
      ], 'Form', 'Submit');
      
      const textarea = container.querySelector('textarea');
      expect(textarea).not.toBeNull();
    });
  });

  describe('Close', () => {
    it('should close dialog', async () => {
      dialog.show('<div>Test</div>');
      expect(dialog.isOpen()).toBe(true);
      
      dialog.close();
      expect(dialog.isOpen()).toBe(false);
      expect(container.style.display).toBe('none');
    });

    it('should close on ESC key', async () => {
      dialog.show('<div>Test</div>');
      
      const event = new KeyboardEvent('keydown', { key: 'Escape' });
      document.dispatchEvent(event);
      
      expect(dialog.isOpen()).toBe(false);
    });

    it('should close on backdrop click', async () => {
      dialog.show('<div>Test</div>');
      
      container.click();
      
      expect(dialog.isOpen()).toBe(false);
    });
  });

  describe('HTML Escaping', () => {
    it('should escape HTML in messages', () => {
      const escaped = dialog.escapeHtml('<script>alert("xss")</script>');
      expect(escaped).not.toContain('<script>');
      expect(escaped).toContain('&lt;script&gt;');
    });

    it('should handle null values', () => {
      const escaped = dialog.escapeHtml(null);
      expect(escaped).toBe('');
    });
  });
});

describe('TopicDialogs', () => {
  let dialog;
  let tree;
  let topicDialogs;

  beforeEach(() => {
    // Create container
    const container = document.createElement('div');
    container.id = 'modalContainer';
    document.body.appendChild(container);

    dialog = new DialogManager(container);
    tree = new TopicTree();
    topicDialogs = new TopicDialogs(dialog, tree);
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  describe('Add Topic Dialog', () => {
    it('should show add topic dialog', async () => {
      const promise = topicDialogs.showAddTopic();
      
      expect(document.body.textContent).toContain('Add New Topic');
      expect(document.body.textContent).toContain('Topic Name');
      expect(document.body.textContent).toContain('Parent Topic');
      
      // Cancel
      const cancelBtn = document.querySelector('[data-action="cancel"]');
      cancelBtn.click();
      
      const result = await promise;
      expect(result).toBeNull();
    });

    it('should create root topic', async () => {
      const promise = topicDialogs.showAddTopic();
      
      const nameInput = document.querySelector('[data-field="name"]');
      nameInput.value = 'New Topic';
      
      const submitBtn = document.querySelector('[data-action="submit"]');
      submitBtn.click();
      
      const result = await promise;
      expect(result).not.toBeNull();
      expect(result.success).toBe(true);
      expect(result.name).toBe('New Topic');
      expect(result.parentId).toBeNull();
      
      const topic = tree.topics[result.topicId];
      expect(topic.name).toBe('New Topic');
    });

    it('should create child topic', async () => {
      const parentId = tree.addTopic('Parent');
      
      const promise = topicDialogs.showAddTopic(parentId);
      
      const nameInput = document.querySelector('[data-field="name"]');
      nameInput.value = 'Child Topic';
      
      // Parent should be pre-selected
      const parentSelect = document.querySelector('[data-field="parentId"]');
      expect(parentSelect.value).toBe(parentId);
      
      const submitBtn = document.querySelector('[data-action="submit"]');
      submitBtn.click();
      
      const result = await promise;
      expect(result.parentId).toBe(parentId);
      
      const topic = tree.topics[result.topicId];
      expect(topic.parentId).toBe(parentId);
    });

    it('should validate empty name', async () => {
      const promise = topicDialogs.showAddTopic();
      
      const submitBtn = document.querySelector('[data-action="submit"]');
      submitBtn.click();
      
      // Should show validation error
      const nameInput = document.querySelector('[data-field="name"]');
      expect(nameInput.classList.contains('error')).toBe(true);
    });
  });

  describe('Rename Topic Dialog', () => {
    it('should show rename dialog with current name', async () => {
      const topicId = tree.addTopic('Original Name');
      
      const promise = topicDialogs.showRenameTopic(topicId);
      
      expect(document.body.textContent).toContain('Rename');
      expect(document.body.textContent).toContain('Original Name');
      
      const nameInput = document.querySelector('[data-field="name"]');
      expect(nameInput.value).toBe('Original Name');
      
      // Cancel
      const cancelBtn = document.querySelector('[data-action="cancel"]');
      cancelBtn.click();
      
      await promise;
    });

    it('should rename topic', async () => {
      const topicId = tree.addTopic('Old Name');
      
      const promise = topicDialogs.showRenameTopic(topicId);
      
      const nameInput = document.querySelector('[data-field="name"]');
      nameInput.value = 'New Name';
      
      const submitBtn = document.querySelector('[data-action="submit"]');
      submitBtn.click();
      
      const result = await promise;
      expect(result.success).toBe(true);
      expect(result.oldName).toBe('Old Name');
      expect(result.newName).toBe('New Name');
      
      const topic = tree.topics[topicId];
      expect(topic.name).toBe('New Name');
    });

    it('should return null if name unchanged', async () => {
      const topicId = tree.addTopic('Same Name');
      
      const promise = topicDialogs.showRenameTopic(topicId);
      
      const submitBtn = document.querySelector('[data-action="submit"]');
      submitBtn.click();
      
      const result = await promise;
      expect(result).toBeNull();
    });
  });

  describe('Move Topic Dialog', () => {
    it('should show move dialog', async () => {
      const topicId = tree.addTopic('Topic to Move');
      tree.addTopic('Destination');
      
      const promise = topicDialogs.showMoveTopic(topicId);
      
      expect(document.body.textContent).toContain('Move');
      
      // Cancel
      const cancelBtn = document.querySelector('[data-action="cancel"]');
      cancelBtn.click();
      
      await promise;
    });

    it('should move topic to new parent', async () => {
      const topic1 = tree.addTopic('Topic 1');
      const topic2 = tree.addTopic('Topic 2');
      const childId = tree.addTopic('Child', topic1);
      
      const promise = topicDialogs.showMoveTopic(childId);
      
      const parentSelect = document.querySelector('[data-field="newParentId"]');
      parentSelect.value = topic2;
      
      const submitBtn = document.querySelector('[data-action="submit"]');
      submitBtn.click();
      
      const result = await promise;
      expect(result.success).toBe(true);
      expect(result.newParentId).toBe(topic2);
      
      const child = tree.topics[childId];
      expect(child.parentId).toBe(topic2);
    });

    it('should exclude self and descendants from options', async () => {
      const parentId = tree.addTopic('Parent');
      const childId = tree.addTopic('Child', parentId);
      const grandchildId = tree.addTopic('Grandchild', childId);
      const topic2 = tree.addTopic('Other Topic');  // Add another root topic so there are options
      
      const promise = topicDialogs.showMoveTopic(parentId);
      
      const select = document.querySelector('[data-field="newParentId"]');
      const options = Array.from(select.options).map(o => o.value);
      
      // Should include Other Topic but not include parent, child, or grandchild
      expect(options).toContain('');  // Root level option
      expect(options).toContain(topic2);
      expect(options).not.toContain(parentId);
      expect(options).not.toContain(childId);
      expect(options).not.toContain(grandchildId);
      
      // Cancel to close the dialog
      const cancelBtn = document.querySelector('[data-action="cancel"]');
      cancelBtn.click();
      await promise;
    });
  });

  describe('Delete Topic Dialog', () => {
    it('should show delete confirmation', async () => {
      const topicId = tree.addTopic('Topic to Delete');
      
      const promise = topicDialogs.showDeleteTopic(topicId);
      
      expect(document.body.textContent).toContain('Delete Topic');
      expect(document.body.textContent).toContain('Topic to Delete');
      
      // Cancel
      const cancelBtn = document.querySelector('[data-action="cancel"]');
      cancelBtn.click();
      
      const result = await promise;
      expect(result).toBeNull();
    });

    it('should delete topic', async () => {
      const topicId = tree.addTopic('To Delete');
      
      const promise = topicDialogs.showDeleteTopic(topicId);
      
      const confirmBtn = document.querySelector('[data-action="confirm"]');
      confirmBtn.click();
      
      const result = await promise;
      expect(result.success).toBe(true);
      expect(result.name).toBe('To Delete');
      
      expect(tree.topics[topicId]).toBeUndefined();
    });

    it('should warn about child topics', async () => {
      const parentId = tree.addTopic('Parent');
      tree.addTopic('Child 1', parentId);
      tree.addTopic('Child 2', parentId);
      
      topicDialogs.showDeleteTopic(parentId);
      
      expect(document.body.textContent).toContain('2 child topics');
    });

    it('should warn about chats', async () => {
      const topicId = tree.addTopic('Topic');
      tree.topics[topicId].chatIds = ['chat1', 'chat2', 'chat3'];
      
      topicDialogs.showDeleteTopic(topicId);
      
      expect(document.body.textContent).toContain('3 chats');
    });
  });

  describe('Merge Topics Dialog', () => {
    it('should show merge dialog', async () => {
      const topic1 = tree.addTopic('Topic 1');
      tree.addTopic('Topic 2');
      
      const promise = topicDialogs.showMergeTopic(topic1);
      
      expect(document.body.textContent).toContain('Merge');
      
      // Cancel form
      const cancelBtn = document.querySelectorAll('[data-action="cancel"]')[0];
      cancelBtn.click();
      
      await promise;
    });

    it('should merge topics', async () => {
      const source = tree.addTopic('Source');
      const target = tree.addTopic('Target');
      
      tree.topics[source].chatIds = ['chat1', 'chat2'];
      
      const promise = topicDialogs.showMergeTopic(source);
      
      const targetSelect = document.querySelector('[data-field="targetTopicId"]');
      targetSelect.value = target;
      
      const submitBtn = document.querySelectorAll('[data-action="submit"]')[0];
      submitBtn.click();
      
      // Need to confirm
      await new Promise(resolve => setTimeout(resolve, 10));
      const confirmBtn = document.querySelector('[data-action="confirm"]');
      confirmBtn.click();
      
      const result = await promise;
      expect(result.success).toBe(true);
      expect(result.targetTopicId).toBe(target);
      
      // Source should be deleted
      expect(tree.topics[source]).toBeUndefined();
      // Target should have chats
      expect(tree.topics[target].chatIds).toContain('chat1');
    });

    it('should exclude ancestors and descendants', async () => {
      const grandparent = tree.addTopic('Grandparent');
      const parent = tree.addTopic('Parent', grandparent);
      const child = tree.addTopic('Child', parent);
      const sibling = tree.addTopic('Sibling');
      
      topicDialogs.showMergeTopic(parent);
      
      const select = document.querySelector('[data-field="targetTopicId"]');
      const options = Array.from(select.options).map(o => o.value);
      
      // Should only include sibling (not grandparent, parent, or child)
      expect(options).toContain(sibling);
      expect(options).not.toContain(grandparent);
      expect(options).not.toContain(parent);
      expect(options).not.toContain(child);
    });
  });

  describe('Build Topic Options', () => {
    it('should build hierarchical options', () => {
      const work = tree.addTopic('Work');
      const projects = tree.addTopic('Projects', work);
      const personal = tree.addTopic('Personal');
      
      const options = topicDialogs.buildTopicOptions();
      
      expect(options.length).toBe(3);
      expect(options[0].label).toContain('Personal');
      expect(options[1].label).toContain('Work');
      expect(options[2].label).toContain('  📄 Projects'); // Indented
    });

    it('should mark selected option', () => {
      const topic1 = tree.addTopic('Topic 1');
      const topic2 = tree.addTopic('Topic 2');
      
      const options = topicDialogs.buildTopicOptions(topic2);
      
      expect(options[0].selected).toBe(false);
      expect(options[1].selected).toBe(true);
    });

    it('should exclude specified topics', () => {
      const topic1 = tree.addTopic('Topic 1');
      const topic2 = tree.addTopic('Topic 2');
      const topic3 = tree.addTopic('Topic 3');
      
      const options = topicDialogs.buildTopicOptions(null, [topic2]);
      
      expect(options.length).toBe(2);
      expect(options.some(o => o.value === topic2)).toBe(false);
    });
  });
});
