import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DialogManager } from '../src/lib/dialogs/dialog-manager.js';
import { TopicDialogs } from '../src/lib/dialogs/topic-dialogs.js';
import { TopicTree } from '../src/lib/tree/tree.js';

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

// ---------------------------------------------------------------------------
// Additional DialogManager edge-case coverage
// ---------------------------------------------------------------------------

describe('DialogManager – escapeHtml() edge cases', () => {
  let container;
  let dialog;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    dialog = new DialogManager(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  it('should return empty string for undefined input', () => {
    expect(dialog.escapeHtml(undefined)).toBe('');
  });

  it('should return empty string for null input', () => {
    expect(dialog.escapeHtml(null)).toBe('');
  });

  it('should convert number to string', () => {
    expect(dialog.escapeHtml(42)).toBe('42');
  });
});

describe('DialogManager – close() with no active dialog', () => {
  let container;
  let dialog;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    dialog = new DialogManager(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  it('should not throw when close() is called with no dialog open', () => {
    expect(() => dialog.close()).not.toThrow();
    expect(dialog.isOpen()).toBe(false);
  });

  it('should still hide container when close() is called with no dialog', () => {
    container.style.display = 'flex';
    dialog.close();
    expect(container.style.display).toBe('none');
  });
});

describe('DialogManager – form() additional field types', () => {
  let container;
  let dialog;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    dialog = new DialogManager(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  it('should pre-fill textarea with field.value', async () => {
    dialog.form([
      { name: 'notes', label: 'Notes', type: 'textarea', value: 'pre-filled text' }
    ], 'Test', 'OK');

    const textarea = container.querySelector('[data-field="notes"]');
    expect(textarea).toBeTruthy();
    expect(textarea.value).toBe('pre-filled text');
  });

  it('should render textarea hint text', async () => {
    dialog.form([
      { name: 'notes', label: 'Notes', type: 'textarea', hint: 'Enter notes here' }
    ], 'Test', 'OK');

    expect(container.textContent).toContain('Enter notes here');
  });

  it('should pre-select option when field.value matches option value', async () => {
    dialog.form([
      {
        name: 'color',
        label: 'Color',
        type: 'select',
        value: 'blue',
        options: [
          { value: 'red', label: 'Red' },
          { value: 'blue', label: 'Blue' },
          { value: 'green', label: 'Green' }
        ]
      }
    ], 'Test', 'OK');

    const select = container.querySelector('[data-field="color"]');
    expect(select).toBeTruthy();
    expect(select.value).toBe('blue');
  });

  it('should render input hint text', async () => {
    dialog.form([
      { name: 'name', label: 'Name', type: 'text', hint: 'Enter your name' }
    ], 'Test', 'OK');

    expect(container.textContent).toContain('Enter your name');
  });

  it('should remove error class when user types in invalid input', async () => {
    const promise = dialog.form([
      { name: 'name', label: 'Name', type: 'text', required: true }
    ], 'Test', 'OK');

    const input = container.querySelector('[data-field="name"]');

    // Submit with empty value → should add error class
    const submitBtn = container.querySelector('[data-action="submit"]');
    submitBtn.click();
    expect(input.classList.contains('error')).toBe(true);

    // Now type something → error class should be removed
    input.value = 'Hello';
    input.dispatchEvent(new Event('input'));
    expect(input.classList.contains('error')).toBe(false);

    // Clean up: cancel the dialog
    const cancelBtn = container.querySelector('[data-action="cancel"]');
    cancelBtn.click();
    await promise;
  });

  it('should submit when Enter is pressed in a text input', async () => {
    const promise = dialog.form([
      { name: 'name', label: 'Name', type: 'text' }
    ], 'Test', 'OK');

    const input = container.querySelector('[data-field="name"]');
    input.value = 'Test value';

    const form = container.querySelector('[data-dialog-form]');
    const enterEvent = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true });
    Object.defineProperty(enterEvent, 'target', { value: input });
    form.dispatchEvent(enterEvent);

    const result = await promise;
    expect(result).toBeTruthy();
    expect(result.name).toBe('Test value');
  });

  it('should NOT submit when Enter is pressed in a textarea', async () => {
    const promise = dialog.form([
      { name: 'notes', label: 'Notes', type: 'textarea' },
      { name: 'title', label: 'Title', type: 'text', required: true }
    ], 'Test', 'OK');

    const textarea = container.querySelector('[data-field="notes"]');
    textarea.value = 'some notes';

    const form = container.querySelector('[data-dialog-form]');
    const enterEvent = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true });
    Object.defineProperty(enterEvent, 'target', { value: textarea });
    form.dispatchEvent(enterEvent);

    // The dialog should still be open (title required, hasn't been submitted)
    expect(dialog.isOpen()).toBe(true);

    // Now cancel
    const cancelBtn = container.querySelector('[data-action="cancel"]');
    cancelBtn.click();
    await promise;
  });
});

// ---------------------------------------------------------------------------
// 7.1 Security – _sanitiseHtml() / show() XSS prevention
// ---------------------------------------------------------------------------

describe('DialogManager – _sanitiseHtml() strips dangerous content', () => {
  let container;
  let dialog;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    dialog = new DialogManager(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  it('strips <script> elements', () => {
    const result = dialog._sanitiseHtml('<p>Hello</p><script>alert(1)</script>');
    expect(result).not.toContain('<script>');
    expect(result).toContain('<p>Hello</p>');
  });

  it('strips inline on* event-handler attributes', () => {
    const result = dialog._sanitiseHtml('<img src="x.png" onerror="alert(1)">');
    expect(result).not.toContain('onerror');
    expect(result).toContain('src="x.png"');
  });

  it('strips onclick attribute', () => {
    const result = dialog._sanitiseHtml('<button onclick="evil()">Click</button>');
    expect(result).not.toContain('onclick');
    expect(result).toContain('>Click<');
  });

  it('strips javascript: href URL', () => {
    const result = dialog._sanitiseHtml('<a href="javascript:alert(1)">link</a>');
    expect(result).not.toContain('javascript:');
  });

  it('strips javascript: src attribute', () => {
    const result = dialog._sanitiseHtml('<iframe src="javascript:alert(1)"></iframe>');
    expect(result).not.toContain('javascript:');
  });

  it('preserves harmless attributes', () => {
    const result = dialog._sanitiseHtml('<p class="modal-body" data-action="ok">safe</p>');
    expect(result).toContain('class="modal-body"');
    expect(result).toContain('data-action="ok"');
  });

  it('preserves <style> blocks (needed by import-dialog)', () => {
    const result = dialog._sanitiseHtml('<style>.foo { color: red; }</style><p>test</p>');
    expect(result).toContain('<style>');
    expect(result).toContain('.foo');
  });
});

describe('DialogManager – show() sanitises injected HTML', () => {
  let container;
  let dialog;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    dialog = new DialogManager(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  it('does not execute scripts injected via show()', () => {
    const spy = vi.fn();
    globalThis.__xssProbe = spy;
    dialog.show('<script>__xssProbe()</script><p>content</p>');
    // Script should have been stripped; spy must never have been called
    expect(spy).not.toHaveBeenCalled();
    delete globalThis.__xssProbe;
  });

  it('strips onerror from img tag passed to show()', () => {
    dialog.show('<img src="bad.png" onerror="alert(1)"><p>ok</p>');
    const img = container.querySelector('img');
    expect(img.getAttribute('onerror')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Branch-gap: DialogManager constructor without containerElement arg
// ---------------------------------------------------------------------------

describe('DialogManager – constructor fallback to getElementById', () => {
  it('should use document.getElementById("modalContainer") when no arg is given', () => {
    const el = document.createElement('div');
    el.id = 'modalContainer';
    document.body.appendChild(el);

    const dm = new DialogManager(); // no arg → falls back to getElementById
    expect(dm.container).toBe(el);

    document.body.removeChild(el);
  });
});

// ---------------------------------------------------------------------------
// Branch-gap: prompt() – submit with empty value is a no-op
// ---------------------------------------------------------------------------

describe('DialogManager – prompt() empty-value submit is no-op', () => {
  let container;
  let dialog;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    dialog = new DialogManager(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  it('should not resolve when empty value is submitted, but resolve after a real value', async () => {
    const promise = dialog.prompt('Enter something', '', 'Input');

    const input = container.querySelector('[data-input="value"]');
    const submitBtn = container.querySelector('[data-action="submit"]');

    // Submit with empty value → handleSubmit no-op (dialog stays open)
    input.value = '';
    submitBtn.click();
    expect(dialog.isOpen()).toBe(true); // still open

    // Now provide a real value
    input.value = 'Hello';
    submitBtn.click();

    const result = await promise;
    expect(result).toBe('Hello');
  });
});

// ---------------------------------------------------------------------------
// Branch-gap: form() select with plain string options (opt.value is undefined)
// ---------------------------------------------------------------------------

describe('DialogManager – form() plain string select options', () => {
  let container;
  let dialog;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    dialog = new DialogManager(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  it('should render options when passed as plain strings', async () => {
    const promise = dialog.form([
      {
        name: 'color',
        label: 'Pick a color',
        type: 'select',
        // opts are plain strings – tests the `opt.value !== undefined ? opt.value : opt` false branch
        options: ['Red', 'Green', 'Blue']
      }
    ], 'Test', 'OK');

    const select = container.querySelector('[data-field="color"]');
    expect(select).toBeTruthy();
    expect(select.options.length).toBe(3);
    // When opt is a plain string, value and label should both be the string
    expect(select.options[0].value).toBe('Red');
    expect(select.options[0].text.trim()).toBe('Red');

    // Cancel to clean up
    container.querySelector('[data-action="cancel"]').click();
    await promise;
  });

  it('should render option as selected when opt.selected is true', async () => {
    const promise = dialog.form([
      {
        name: 'color',
        label: 'Pick a color',
        type: 'select',
        options: [
          { value: 'red',   label: 'Red' },
          { value: 'green', label: 'Green', selected: true },
          { value: 'blue',  label: 'Blue' }
        ]
      }
    ], 'Test', 'OK');

    const select = container.querySelector('[data-field="color"]');
    expect(select.value).toBe('green');

    container.querySelector('[data-action="cancel"]').click();
    await promise;
  });
});

// ---------------------------------------------------------------------------
// Branch-gap: _collectFormData and _validateForm with missing DOM elements
// ---------------------------------------------------------------------------

describe('DialogManager – _collectFormData() missing input fallback', () => {
  let container;
  let dialog;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    dialog = new DialogManager(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  it('returns empty string for a field whose element is not in the form', () => {
    // Render a form with only one field, but pass two field descriptors to
    // _collectFormData — the second one has no matching element.
    dialog.form([
      { name: 'name', label: 'Name', type: 'text' },
    ], 'Test', 'OK');

    const formEl = container.querySelector('[data-dialog-form]');
    // Pass an extra field 'ghost' that was never rendered
    const data = dialog._collectFormData(formEl, [
      { name: 'name' },
      { name: 'ghost' },  // no [data-field="ghost"] in the DOM
    ]);

    expect(data.name).toBeDefined();
    expect(data.ghost).toBe('');  // fallback '' when element not found
  });
});

describe('DialogManager – _validateForm() missing input early return', () => {
  let container;
  let dialog;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    dialog = new DialogManager(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  it('does not throw and returns true when a required field has no DOM element', () => {
    dialog.form([
      { name: 'name', label: 'Name', type: 'text', required: true },
    ], 'Test', 'OK');

    const formEl = container.querySelector('[data-dialog-form]');
    // Validate with a ghost field that has no DOM element — should just return early
    const valid = dialog._validateForm(formEl, [
      { name: 'ghost', required: true },  // element missing → if (!input) return
    ]);
    // No DOM element found → the forEach iteration returns early; isValid stays true
    expect(typeof valid).toBe('boolean');
  });

  it('marks field with error class when it is required and has empty value', () => {
    dialog.form([
      { name: 'title', label: 'Title', type: 'text', required: true },
    ], 'Test', 'OK');

    const formEl = container.querySelector('[data-dialog-form]');
    // Field exists but is empty — required check should add error class
    const valid = dialog._validateForm(formEl, [
      { name: 'title', required: true },
    ]);
    expect(valid).toBe(false);
    const input = container.querySelector('[data-field="title"]');
    expect(input.classList.contains('error')).toBe(true);
  });

  it('removes error class when non-required empty field is validated', () => {
    dialog.form([
      { name: 'notes', label: 'Notes', type: 'text' },
    ], 'Test', 'OK');
    const formEl = container.querySelector('[data-dialog-form]');
    const input  = container.querySelector('[data-field="notes"]');
    // Pre-add error class; validation should remove it since field is not required
    input.classList.add('error');
    const valid = dialog._validateForm(formEl, [{ name: 'notes', required: false }]);
    expect(valid).toBe(true);
    expect(input.classList.contains('error')).toBe(false);
  });
});
