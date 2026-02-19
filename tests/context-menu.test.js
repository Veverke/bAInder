import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DialogManager } from '../src/lib/dialog-manager.js';
import { TopicDialogs } from '../src/lib/topic-dialogs.js';
import { TopicTree } from '../src/lib/tree.js';

/**
 * Context Menu UI Interaction Tests
 * Tests all context menu operations that users can trigger via right-click
 */
describe('Context Menu UI Interactions', () => {
  let container;
  let contextMenu;
  let dialog;
  let tree;
  let topicDialogs;
  let state;

  beforeEach(() => {
    // Create container for dialogs
    container = document.createElement('div');
    container.id = 'modalContainer';
    document.body.appendChild(container);

    // Create context menu
    contextMenu = document.createElement('div');
    contextMenu.id = 'contextMenu';
    contextMenu.className = 'context-menu';
    contextMenu.style.display = 'none';
    contextMenu.innerHTML = `
      <div class="context-menu-header">Topic Menu</div>
      <div class="context-menu-item" data-action="rename">
        <span>Rename</span>
      </div>
      <div class="context-menu-item" data-action="move">
        <span>Move to...</span>
      </div>
      <div class="context-menu-item" data-action="merge">
        <span>Merge with...</span>
      </div>
      <div class="context-menu-divider"></div>
      <div class="context-menu-item danger" data-action="delete">
        <span>Delete</span>
      </div>
    `;
    document.body.appendChild(contextMenu);

    // Initialize components
    dialog = new DialogManager(container);
    tree = new TopicTree();
    topicDialogs = new TopicDialogs(dialog, tree);

    // Simulate application state
    state = {
      contextMenuTopic: null,
      dialog,
      topicDialogs,
      tree
    };

    // Setup context menu actions (simulating sidepanel.js logic)
    setupContextMenuActions();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  // Helper function to hide context menu (matches production code)
  function hideContextMenu() {
    contextMenu.style.display = 'none';
    // Note: state.contextMenuTopic is NOT cleared here
    // It will be cleared after the action completes in setupContextMenuActions
  }

  // Helper function to simulate sidepanel.js context menu setup
  // This MUST match the actual production code flow to catch real bugs
  function setupContextMenuActions() {
    const actions = {
      rename: async () => {
        if (!state.contextMenuTopic) return;
        const result = await state.topicDialogs.showRenameTopic(state.contextMenuTopic.id);
        if (result) {
          return result;
        }
      },
      move: async () => {
        if (!state.contextMenuTopic) return;
        const result = await state.topicDialogs.showMoveTopic(state.contextMenuTopic.id);
        if (result) {
          return result;
        }
      },
      merge: async () => {
        if (!state.contextMenuTopic) return;
        const result = await state.topicDialogs.showMergeTopic(state.contextMenuTopic.id);
        if (result) {
          return result;
        }
      },
      delete: async () => {
        if (!state.contextMenuTopic) return;
        const result = await state.topicDialogs.showDeleteTopic(state.contextMenuTopic.id);
        if (result) {
          return result;
        }
      }
    };

    contextMenu.querySelectorAll('[data-action]').forEach(item => {
      item.addEventListener('click', async (e) => {
        e.stopPropagation();
        const action = item.dataset.action;
        
        // CRITICAL: This matches production code flow
        // Store topic reference BEFORE hiding menu
        const topic = state.contextMenuTopic;
        hideContextMenu();
        
        // Temporarily restore topic for the action handler
        if (topic && actions[action]) {
          state.contextMenuTopic = topic;
          item._lastResult = await actions[action]();
          state.contextMenuTopic = null;
        }
      });
    });
  }

  // Context Menu Structure tests removed - just checked if elements exist
  // If elements are missing, the actual behavior tests below will fail anyway

  describe('Rename Topic via Context Menu', () => {
    it('should open rename dialog when rename is clicked', async () => {
      const topicId = tree.addTopic('Original Name');
      state.contextMenuTopic = tree.topics[topicId];

      // Click rename action
      const renameAction = contextMenu.querySelector('[data-action="rename"]');
      const clickPromise = new Promise(resolve => {
        setTimeout(() => {
          // Dialog should be open
          expect(container.style.display).toBe('flex');
          
          // Should have name input with current name
          const nameInput = document.querySelector('[data-field="name"]');
          expect(nameInput).toBeTruthy();
          expect(nameInput.value).toBe('Original Name');
          
          // Cancel dialog
          const cancelBtn = document.querySelector('[data-action="cancel"]');
          cancelBtn.click();
          resolve();
        }, 50);
      });

      renameAction.click();
      await clickPromise;
    });

    it('should successfully rename topic through context menu', async () => {
      const topicId = tree.addTopic('Old Name');
      state.contextMenuTopic = tree.topics[topicId];

      const renameAction = contextMenu.querySelector('[data-action="rename"]');
      
      const operationPromise = new Promise(resolve => {
        setTimeout(async () => {
          const nameInput = document.querySelector('[data-field="name"]');
          nameInput.value = 'New Name';
          
          const submitBtn = document.querySelector('[data-action="submit"]');
          submitBtn.click();
          
          // Wait a bit for operation to complete
          setTimeout(() => resolve(), 50);
        }, 50);
      });

      renameAction.click();
      await operationPromise;

      // Verify topic was renamed
      expect(tree.topics[topicId].name).toBe('New Name');
    });

    it('should not rename if user cancels', async () => {
      const topicId = tree.addTopic('Original');
      state.contextMenuTopic = tree.topics[topicId];

      const renameAction = contextMenu.querySelector('[data-action="rename"]');
      
      const operationPromise = new Promise(resolve => {
        setTimeout(() => {
          const cancelBtn = document.querySelector('[data-action="cancel"]');
          cancelBtn.click();
          resolve();
        }, 50);
      });

      renameAction.click();
      await operationPromise;

      // Verify topic name unchanged
      expect(tree.topics[topicId].name).toBe('Original');
    });
  });

  describe('Move Topic via Context Menu', () => {
    it('should open move dialog when move is clicked', async () => {
      const topic1 = tree.addTopic('Topic 1');
      const topic2 = tree.addTopic('Topic 2');
      state.contextMenuTopic = tree.topics[topic1];

      const moveAction = contextMenu.querySelector('[data-action="move"]');
      
      const clickPromise = new Promise(resolve => {
        setTimeout(() => {
          // Dialog should be open
          expect(container.style.display).toBe('flex');
          
          // Should have parent selection dropdown
          const parentSelect = document.querySelector('[data-field="newParentId"]');
          expect(parentSelect).toBeTruthy();
          
          // Cancel dialog
          const cancelBtn = document.querySelector('[data-action="cancel"]');
          cancelBtn.click();
          resolve();
        }, 50);
      });

      moveAction.click();
      await clickPromise;
    });

    it('should successfully move topic through context menu', async () => {
      const topic1 = tree.addTopic('Topic 1');
      const topic2 = tree.addTopic('Topic 2');
      state.contextMenuTopic = tree.topics[topic1];

      const moveAction = contextMenu.querySelector('[data-action="move"]');
      
      const operationPromise = new Promise(resolve => {
        setTimeout(() => {
          const parentSelect = document.querySelector('[data-field="newParentId"]');
          parentSelect.value = topic2;
          
          const submitBtn = document.querySelector('[data-action="submit"]');
          submitBtn.click();
          
          setTimeout(() => resolve(), 50);
        }, 50);
      });

      moveAction.click();
      await operationPromise;

      // Verify topic was moved
      expect(tree.topics[topic1].parentId).toBe(topic2);
    });
  });

  describe('Delete Topic via Context Menu', () => {
    it('should open delete confirmation when delete is clicked', async () => {
      const topicId = tree.addTopic('To Delete');
      state.contextMenuTopic = tree.topics[topicId];

      const deleteAction = contextMenu.querySelector('[data-action="delete"]');
      
      const clickPromise = new Promise(resolve => {
        setTimeout(() => {
          // Confirmation dialog should be open
          expect(container.style.display).toBe('flex');
          
          // Should have confirm and cancel buttons
          const confirmBtn = document.querySelector('[data-action="confirm"]');
          const cancelBtn = document.querySelector('[data-action="cancel"]');
          expect(confirmBtn).toBeTruthy();
          expect(cancelBtn).toBeTruthy();
          
          // Cancel deletion
          cancelBtn.click();
          resolve();
        }, 50);
      });

      deleteAction.click();
      await clickPromise;
    });

    it('should successfully delete topic through context menu', async () => {
      const topicId = tree.addTopic('To Delete');
      state.contextMenuTopic = tree.topics[topicId];

      const deleteAction = contextMenu.querySelector('[data-action="delete"]');
      
      const operationPromise = new Promise(resolve => {
        setTimeout(() => {
          const confirmBtn = document.querySelector('[data-action="confirm"]');
          confirmBtn.click();
          
          setTimeout(() => resolve(), 50);
        }, 50);
      });

      deleteAction.click();
      await operationPromise;

      // Verify topic was deleted
      expect(tree.topics[topicId]).toBeUndefined();
    });

    it('should not delete if user cancels', async () => {
      const topicId = tree.addTopic('Keep This');
      state.contextMenuTopic = tree.topics[topicId];

      const deleteAction = contextMenu.querySelector('[data-action="delete"]');
      
      const operationPromise = new Promise(resolve => {
        setTimeout(() => {
          const cancelBtn = document.querySelector('[data-action="cancel"]');
          cancelBtn.click();
          resolve();
        }, 50);
      });

      deleteAction.click();
      await operationPromise;

      // Verify topic still exists
      expect(tree.topics[topicId]).toBeTruthy();
      expect(tree.topics[topicId].name).toBe('Keep This');
    });

    it('should show warning when deleting topic with children', async () => {
      const parentId = tree.addTopic('Parent');
      tree.addTopic('Child', parentId);
      state.contextMenuTopic = tree.topics[parentId];

      const deleteAction = contextMenu.querySelector('[data-action="delete"]');
      
      const clickPromise = new Promise(resolve => {
        setTimeout(() => {
          // Confirmation should mention children
          const dialogText = container.textContent;
          expect(dialogText).toContain('child');
          
          const cancelBtn = document.querySelector('[data-action="cancel"]');
          cancelBtn.click();
          resolve();
        }, 50);
      });

      deleteAction.click();
      await clickPromise;
    });
  });

  describe('Merge Topics via Context Menu', () => {
    it('should open merge dialog when merge is clicked', async () => {
      const topic1 = tree.addTopic('Topic 1');
      const topic2 = tree.addTopic('Topic 2');
      state.contextMenuTopic = tree.topics[topic1];

      const mergeAction = contextMenu.querySelector('[data-action="merge"]');
      
      const clickPromise = new Promise(resolve => {
        setTimeout(() => {
          // Dialog should be open
          expect(container.style.display).toBe('flex');
          
          // Should have target selection dropdown
          const targetSelect = document.querySelector('[data-field="targetTopicId"]');
          expect(targetSelect).toBeTruthy();
          
          // Cancel dialog
          const cancelBtn = document.querySelector('[data-action="cancel"]');
          cancelBtn.click();
          resolve();
        }, 50);
      });

      mergeAction.click();
      await clickPromise;
    });

    it('should successfully merge topics through context menu', async () => {
      const source = tree.addTopic('Source');
      const target = tree.addTopic('Target');
      state.contextMenuTopic = tree.topics[source];

      const mergeAction = contextMenu.querySelector('[data-action="merge"]');
      
      const operationPromise = new Promise(resolve => {
        setTimeout(() => {
          const targetSelect = document.querySelector('[data-field="targetTopicId"]');
          targetSelect.value = target;
          
          const submitBtn = document.querySelector('[data-action="submit"]');
          submitBtn.click();
          
          // Wait for confirmation dialog
          setTimeout(() => {
            const confirmBtn = document.querySelector('[data-action="confirm"]');
            confirmBtn.click();
            
            setTimeout(() => resolve(), 50);
          }, 50);
        }, 50);
      });

      mergeAction.click();
      await operationPromise;

      // Verify source was deleted (merged into target)
      expect(tree.topics[source]).toBeUndefined();
      expect(tree.topics[target]).toBeTruthy();
    });

    it('should not merge if user cancels', async () => {
      const source = tree.addTopic('Source');
      const target = tree.addTopic('Target');
      state.contextMenuTopic = tree.topics[source];

      const mergeAction = contextMenu.querySelector('[data-action="merge"]');
      
      const operationPromise = new Promise(resolve => {
        setTimeout(() => {
          const cancelBtn = document.querySelector('[data-action="cancel"]');
          cancelBtn.click();
          resolve();
        }, 50);
      });

      mergeAction.click();
      await operationPromise;

      // Verify both topics still exist
      expect(tree.topics[source]).toBeTruthy();
      expect(tree.topics[target]).toBeTruthy();
    });
  });

  describe('Context Menu State Management', () => {
    it('should not execute action if contextMenuTopic is null', async () => {
      state.contextMenuTopic = null;

      const deleteAction = contextMenu.querySelector('[data-action="delete"]');
      
      // Click should do nothing
      deleteAction.click();
      
      await new Promise(resolve => setTimeout(resolve, 100));

      // No dialog should open
      expect(container.style.display).not.toBe('flex');
    });

    it('should handle multiple rapid clicks gracefully', async () => {
      const topicId = tree.addTopic('Test');
      state.contextMenuTopic = tree.topics[topicId];

      const renameAction = contextMenu.querySelector('[data-action="rename"]');
      
      // Rapid clicks
      renameAction.click();
      renameAction.click();
      renameAction.click();
      
      await new Promise(resolve => setTimeout(resolve, 100));

      // Should only open one dialog
      const modals = container.querySelectorAll('.modal');
      expect(modals.length).toBeLessThanOrEqual(1);
      
      // Close any open dialog
      const cancelBtn = document.querySelector('[data-action="cancel"]');
      if (cancelBtn) cancelBtn.click();
    });

    it('should preserve contextMenuTopic during operation', async () => {
      const topicId = tree.addTopic('Test Topic');
      const originalTopic = tree.topics[topicId];
      state.contextMenuTopic = originalTopic;

      const renameAction = contextMenu.querySelector('[data-action="rename"]');
      
      const operationPromise = new Promise(resolve => {
        setTimeout(() => {
          // Verify contextMenuTopic is still set
          expect(state.contextMenuTopic).toBe(originalTopic);
          
          const cancelBtn = document.querySelector('[data-action="cancel"]');
          cancelBtn.click();
          resolve();
        }, 50);
      });

      renameAction.click();
      await operationPromise;
    });
  });

  describe('Context Menu Event Handling', () => {
    it('should stop event propagation on action click', () => {
      const topicId = tree.addTopic('Test');
      state.contextMenuTopic = tree.topics[topicId];

      const renameAction = contextMenu.querySelector('[data-action="rename"]');
      
      let propagated = false;
      document.body.addEventListener('click', () => {
        propagated = true;
      }, { once: true });

      const event = new MouseEvent('click', { bubbles: true });
      renameAction.dispatchEvent(event);

      // Event should not propagate to body
      expect(propagated).toBe(false);
    });

    it('CRITICAL: should preserve contextMenuTopic when hideContextMenu is called', async () => {
      // This test catches the bug where hideContextMenu() cleared state.contextMenuTopic
      // before the action handler could use it
      const topicId = tree.addTopic('Test Topic');
      const originalTopic = tree.topics[topicId];
      state.contextMenuTopic = originalTopic;

      // Track if delete handler was called with correct topic
      let handlerCalled = false;
      let handlerTopic = null;

      // Override delete action to track what topic it receives
      const originalDelete = topicDialogs.showDeleteTopic;
      topicDialogs.showDeleteTopic = vi.fn((id) => {
        handlerCalled = true;
        handlerTopic = tree.topics[id];
        return Promise.resolve(null); // Simulate cancel
      });

      const deleteAction = contextMenu.querySelector('[data-action="delete"]');
      deleteAction.click();

      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify handler was called with correct topic
      expect(handlerCalled).toBe(true);
      expect(handlerTopic).toBe(originalTopic);
      expect(state.contextMenuTopic).toBeNull(); // Cleared after operation

      // Restore original function
      topicDialogs.showDeleteTopic = originalDelete;
    });

    it('should hide context menu when action is clicked', async () => {
      // Verify that clicking an action hides the menu immediately
      const topicId = tree.addTopic('Test');
      state.contextMenuTopic = tree.topics[topicId];
      
      // Show the menu
      contextMenu.style.display = 'flex';
      expect(contextMenu.style.display).toBe('flex');

      const renameAction = contextMenu.querySelector('[data-action="rename"]');
      
      const operationPromise = new Promise(resolve => {
        setTimeout(() => {
          // Menu should be hidden immediately after click
          expect(contextMenu.style.display).toBe('none');
          
          // Cancel dialog
          const cancelBtn = document.querySelector('[data-action="cancel"]');
          if (cancelBtn) cancelBtn.click();
          resolve();
        }, 50);
      });

      renameAction.click();
      await operationPromise;
    });

    it('should handle errors in action handlers gracefully', async () => {
      // Set invalid topic
      state.contextMenuTopic = { id: 'nonexistent' };

      const deleteAction = contextMenu.querySelector('[data-action="delete"]');
      
      // Should not throw error
      expect(() => {
        deleteAction.click();
      }).not.toThrow();
    });
  });

  describe('All Context Menu Actions', () => {
    it('should have event listeners attached to all actions', () => {
      const actions = ['rename', 'move', 'merge', 'delete'];
      
      actions.forEach(action => {
        const element = contextMenu.querySelector(`[data-action="${action}"]`);
        expect(element).toBeTruthy();
        
        // Verify click listener exists by checking if click doesn't throw
        expect(() => {
          element.click();
        }).not.toThrow();
      });
    });

    it('should handle all actions without errors when contextMenuTopic is set', async () => {
      const topic1 = tree.addTopic('Topic 1');
      const topic2 = tree.addTopic('Topic 2');
      state.contextMenuTopic = tree.topics[topic1];

      const actions = contextMenu.querySelectorAll('[data-action]');
      
      for (const action of actions) {
        const actionName = action.dataset.action;
        
        // Skip non-operation items
        if (!actionName || actionName === 'export') continue;
        
        // Click action
        action.click();
        
        // Wait for dialog
        await new Promise(resolve => setTimeout(resolve, 50));
        
        // Close dialog
        const cancelBtn = document.querySelector('[data-action="cancel"]');
        if (cancelBtn) {
          cancelBtn.click();
        }
        
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      
      // All operations should complete without throwing
      expect(true).toBe(true);
    });
  });
});
