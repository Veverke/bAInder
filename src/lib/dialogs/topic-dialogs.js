/**
 * TopicDialogs - Topic management dialog components
 * 
 * Provides dialogs for CRUD operations on topics:
 * - Add new topic
 * - Rename topic
 * - Move topic
 * - Delete topic
 * - Merge topics
 */

import { DialogManager } from './dialog-manager.js';

export class TopicDialogs {
  constructor(dialogManager, topicTree) {
    this.dialog = dialogManager;
    this.tree = topicTree;
  }

  /**
   * Show add topic dialog
   */
  async showAddTopic(defaultParentId = null) {
    const parentOptions = this.buildTopicOptions(defaultParentId);
    
    const result = await this.dialog.form([
      {
        name: 'name',
        label: 'Topic Name',
        type: 'text',
        placeholder: 'Enter topic name',
        required: true,
        hint: 'Choose a descriptive name for your topic'
      },
      {
        name: 'parentId',
        label: 'Parent Topic',
        type: 'select',
        options: [
          { value: '', label: '(Root Level)' },
          ...parentOptions
        ],
        value: defaultParentId || '',
        hint: 'Select where to place this topic in the hierarchy'
      }
    ], 'Add New Topic', 'Create Topic');

    if (!result) return null;

    try {
      const topicId = this.tree.addTopic(
        result.name,
        result.parentId || null
      );
      
      return {
        success: true,
        topicId,
        name: result.name,
        parentId: result.parentId || null
      };
    } catch (error) {
      await this.dialog.alert(error.message, 'Error Creating Topic');
      return null;
    }
  }

  /**
   * Show rename topic dialog
   */
  async showRenameTopic(topicId) {
    const topic = this.tree.topics[topicId];
    if (!topic) {
      await this.dialog.alert('Topic not found', 'Error');
      return null;
    }

    const result = await this.dialog.form([
      {
        name: 'name',
        label: 'Topic Name',
        type: 'text',
        value: topic.name,
        placeholder: 'Enter new topic name',
        required: true
      }
    ], `Rename "${topic.name}"`, 'Rename');

    if (!result || result.name === topic.name) return null;

    const oldName = topic.name;  // Save old name before renaming
    
    try {
      this.tree.renameTopic(topicId, result.name);
      
      return {
        success: true,
        topicId,
        oldName: oldName,
        newName: result.name
      };
    } catch (error) {
      await this.dialog.alert(error.message, 'Error Renaming Topic');
      return null;
    }
  }

  /**
   * Show move topic dialog
   */
  async showMoveTopic(topicId) {
    const topic = this.tree.topics[topicId];
    if (!topic) {
      await this.dialog.alert('Topic not found', 'Error');
      return null;
    }

    // Build options excluding the topic itself and its descendants
    const parentOptions = this.buildTopicOptions(topic.parentId, [topicId]);
    
    if (parentOptions.length === 0) {
      await this.dialog.alert('No other locations available to move this topic to.', 'Cannot Move');
      return null;
    }

    const result = await this.dialog.form([
      {
        name: 'newParentId',
        label: 'Move To',
        type: 'select',
        options: [
          { value: '', label: '(Root Level)' },
          ...parentOptions
        ],
        value: topic.parentId || '',
        hint: 'Select the new parent topic'
      }
    ], `Move "${topic.name}"`, 'Move');

    if (!result) return null;

    const newParentId = result.newParentId || null;
    
    // Check if anything changed
    if (newParentId === topic.parentId) {
      return null;
    }

    try {
      this.tree.moveTopic(topicId, newParentId);
      
      return {
        success: true,
        topicId,
        oldParentId: topic.parentId,
        newParentId
      };
    } catch (error) {
      await this.dialog.alert(error.message, 'Error Moving Topic');
      return null;
    }
  }

  /**
   * Show delete topic dialog
   */
  async showDeleteTopic(topicId) {
    const topic = this.tree.topics[topicId];
    if (!topic) {
      await this.dialog.alert('Topic not found', 'Error');
      return null;
    }

    const childCount = topic.children.length;
    const chatCount = topic.chatIds.length;
    
    let message = `Are you sure you want to delete "${topic.name}"?`;
    
    if (childCount > 0 || chatCount > 0) {
      message += '\n\nThis will also delete:';
      if (childCount > 0) {
        message += `\n• ${childCount} child topic${childCount !== 1 ? 's' : ''}`;
      }
      if (chatCount > 0) {
        message += `\n• ${chatCount} chat${chatCount !== 1 ? 's' : ''}`;
      }
      message += '\n\nThis action cannot be undone.';
    }

    const confirmed = await this.dialog.confirm(message, 'Delete Topic');
    
    if (!confirmed) return null;

    try {
      const result = this.tree.deleteTopic(topicId, true);
      
      return {
        success: true,
        topicId,
        name: topic.name,
        deletedChatCount: result.chatIds.length
      };
    } catch (error) {
      await this.dialog.alert(error.message, 'Error Deleting Topic');
      return null;
    }
  }

  /**
   * Show merge topics dialog
   */
  async showMergeTopic(sourceTopicId) {
    const sourceTopic = this.tree.topics[sourceTopicId];
    if (!sourceTopic) {
      await this.dialog.alert('Topic not found', 'Error');
      return null;
    }

    // Build options excluding the source topic and its descendants/ancestors
    const excludeIds = [sourceTopicId];
    
    // Exclude descendants
    const addDescendants = (topicId) => {
      const topic = this.tree.topics[topicId];
      if (topic) {
        topic.children.forEach(childId => {
          excludeIds.push(childId);
          addDescendants(childId);
        });
      }
    };
    addDescendants(sourceTopicId);
    
    // Exclude ancestors
    let currentId = sourceTopic.parentId;
    while (currentId) {
      excludeIds.push(currentId);
      const parent = this.tree.topics[currentId];
      currentId = parent ? parent.parentId : null;
    }

    const targetOptions = this.buildTopicOptions(null, excludeIds);
    
    if (targetOptions.length === 0) {
      await this.dialog.alert('No other topics available to merge with.', 'Cannot Merge');
      return null;
    }

    const result = await this.dialog.form([
      {
        name: 'targetTopicId',
        label: 'Merge Into',
        type: 'select',
        options: targetOptions,
        required: true,
        hint: 'All chats and subtopics will be moved to the selected topic'
      }
    ], `Merge "${sourceTopic.name}"`, 'Merge Topics');

    if (!result) return null;

    const targetTopic = this.tree.topics[result.targetTopicId];
    
    const confirmed = await this.dialog.confirm(
      `Merge "${sourceTopic.name}" into "${targetTopic.name}"?\n\n` +
      `This will:\n` +
      `• Move all chats from "${sourceTopic.name}" to "${targetTopic.name}"\n` +
      `• Move all child topics from "${sourceTopic.name}" to "${targetTopic.name}"\n` +
      `• Delete "${sourceTopic.name}"\n\n` +
      `This action cannot be undone.`,
      'Confirm Merge'
    );
    
    if (!confirmed) return null;

    try {
      const mergeResult = this.tree.mergeTopics(sourceTopicId, result.targetTopicId);
      
      return {
        success: true,
        sourceTopicId,
        sourceName: sourceTopic.name,
        targetTopicId: result.targetTopicId,
        targetName: targetTopic.name,
        movedChatCount: mergeResult.chatIds.length
      };
    } catch (error) {
      await this.dialog.alert(error.message, 'Error Merging Topics');
      return null;
    }
  }

  /**
   * Build topic options for dropdowns
   * Excludes specified topics and formats with indentation
   */
  buildTopicOptions(selectedId = null, excludeIds = []) {
    const options = [];
    const excludeSet = new Set(excludeIds);
    
    const addTopicOptions = (topicId, level = 0) => {
      const topic = this.tree.topics[topicId];
      if (!topic || excludeSet.has(topicId)) return;
      
      const indent = '  '.repeat(level);
      const icon = topic.children.length > 0 ? '📁' : '📄';
      
      options.push({
        value: topicId,
        label: `${indent}${icon} ${topic.name}`,
        selected: topicId === selectedId
      });
      
      // Add children recursively (already sorted alphabetically)
      topic.children.forEach(childId => {
        addTopicOptions(childId, level + 1);
      });
    };
    
    // Add all root topics and their children
    this.tree.getRootTopics().forEach(topic => {
      addTopicOptions(topic.id);
    });
    
    return options;
  }

  /**
   * Show the markdown-input dialog for the "Import markdown" flow.
   *
   * Presents a textarea for pasting markdown and a "Browse file…" button for
   * loading from disk.  Selecting a file disables the textarea; the file
   * content takes precedence.  Returns the raw markdown string and the source
   * filename (empty string when pasted), or null if the user cancels.
   *
   * @returns {Promise<{ content: string, filename: string }|null>}
   */
  async showMarkdownInputDialog() {
    let selectedFileContent = null;
    let selectedFileName    = '';

    const html = `
      <div class="modal-header">
        <h2>Import Markdown Chat</h2>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label for="md-import-textarea">Paste markdown</label>
          <textarea id="md-import-textarea" class="form-textarea"
            placeholder="Paste your Markdown conversation here…"
            style="min-height:160px;resize:vertical"></textarea>
        </div>
        <div class="form-group" style="display:flex;align-items:center;gap:8px;margin-top:4px">
          <button type="button" class="btn-secondary" id="md-import-browse">Browse file…</button>
          <span id="md-import-file-name"
            style="font-size:0.85em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:200px"
          ></span>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" id="md-import-cancel">Cancel</button>
        <button class="btn-primary"   id="md-import-confirm">Import</button>
      </div>
    `;

    // show() synchronously mounts the HTML then returns a Promise that
    // resolves when close() is called from any code path.
    const showPromise = this.dialog.show(html);
    const container   = this.dialog.container;

    const textarea   = container.querySelector('#md-import-textarea');
    const browseBtn  = container.querySelector('#md-import-browse');
    const fileLabel  = container.querySelector('#md-import-file-name');
    const cancelBtn  = container.querySelector('#md-import-cancel');
    const confirmBtn = container.querySelector('#md-import-confirm');

    // ── Browse button: open a hidden file input ──────────────────────────
    browseBtn.addEventListener('click', () => {
      const input = document.createElement('input');
      input.type   = 'file';
      input.accept = '.md,text/markdown,text/plain';
      input.style.display = 'none';
      document.body.appendChild(input);

      input.addEventListener('change', async () => {
        if (document.body.contains(input)) document.body.removeChild(input);
        const file = input.files && input.files[0];
        if (!file) return;
        try {
          selectedFileContent  = await file.text();
          selectedFileName     = file.name;
          textarea.disabled    = true;
          fileLabel.textContent = file.name;
        } catch (_) {
          // Read error — leave textarea usable
        }
      }, { once: true });

      // Heuristic: window re-focuses after file picker closes without selection
      const onFocus = () => {
        setTimeout(() => {
          if (document.body.contains(input)) document.body.removeChild(input);
          window.removeEventListener('focus', onFocus);
        }, 300);
      };
      window.addEventListener('focus', onFocus);
      input.click();
    });

    // ── Cancel ───────────────────────────────────────────────────────────
    cancelBtn.addEventListener('click', () => {
      selectedFileContent = null;
      selectedFileName    = '';
      this.dialog.close(null);
    });

    // ── Import ───────────────────────────────────────────────────────────
    confirmBtn.addEventListener('click', () => {
      const content = selectedFileContent !== null
        ? selectedFileContent
        : textarea.value;
      if (!content || !content.trim()) {
        textarea.classList.add('error');
        return;
      }
      this.dialog.close({ content, filename: selectedFileName });
    });

    // ESC / backdrop close resolve showPromise with undefined → treated as null
    return (await showPromise) ?? null;
  }

  /**
   * Show the "Import markdown" metadata confirmation dialog.
   *
   * Pre-fills title and source from the parsed markdown; the user may edit
   * both fields before confirming.
   *
   * @param {{ title: string, source: string }} defaults  Pre-parsed metadata
   * @returns {Promise<{ title: string, source: string }|null>}
   *   Resolves with the confirmed values, or null if the user cancels.
   */
  async showImportMarkdownDialog(defaults = {}) {
    const result = await this.dialog.form([
      {
        name:        'title',
        label:       'Chat title',
        type:        'text',
        value:       defaults.title || '',
        placeholder: 'Enter a title for this chat',
        required:    true,
      },
      {
        name:        'source',
        label:       'Source',
        type:        'text',
        value:       defaults.source || 'external',
        placeholder: 'e.g. VS Code Copilot, Cursor, Windsurf',
        hint:        'The tool or service where this conversation took place',
      },
    ], 'Import Markdown Chat', 'Import');

    if (!result) return null;
    return {
      title:  result.title.trim()  || defaults.title  || 'Imported chat',
      source: result.source.trim() || defaults.source || 'external',
    };
  }
}
