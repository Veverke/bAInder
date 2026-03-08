/**
 * ChatDialogs - Stage 7
 * Dialog wrappers for chat management operations.
 * Mirrors the pattern of TopicDialogs.
 */

export class ChatDialogs {
  /**
   * @param {import('./dialog-manager.js').DialogManager} dialogManager
   * @param {import('./tree.js').TopicTree} topicTree
   */
  constructor(dialogManager, topicTree) {
    if (!dialogManager) throw new Error('DialogManager is required');
    if (!topicTree)     throw new Error('TopicTree is required');
    this.dialog = dialogManager;
    this.tree   = topicTree;
  }

  /**
   * Show dialog to assign a newly saved chat to a topic.
   * Also lets the user edit the title before assigning.
   *
   * @param {Object} chatEntry  The ChatEntry returned by the background save
   * @returns {Promise<{topicId: string, title: string}|null>}
   */
  async showAssignChat(chatEntry) {
    if (!chatEntry) throw new Error('Chat entry is required');

    const topicOptions = this._buildTopicOptions();

    if (topicOptions.length === 0) {
      await this.dialog.alert(
        'Create at least one topic before assigning chats.',
        'No Topics Available'
      );
      return null;
    }

    const displayTitle = this._truncate(chatEntry.title, 50);

    const result = await this.dialog.form(
      [
        {
          name:        'title',
          label:       'Chat Title',
          type:        'text',
          value:       chatEntry.title,
          placeholder: 'Enter a title for this chat',
          required:    true
        },
        {
          name:        'tags',
          label:       'Tags',
          type:        'text',
          value:       (chatEntry.tags || []).join(', '),
          placeholder: 'e.g. react, performance, debugging'
        },
        {
          name:     'topicId',
          label:    'Assign to Topic',
          type:     'select',
          options:  topicOptions,
          required: true
        }
      ],
      `Save Chat: "${displayTitle}"`,
      'Assign to Topic'
    );

    if (!result) return null;
    const tags = this._parseTags(result.tags);
    return { topicId: result.topicId, title: result.title.trim(), tags };
  }

  /**
   * Show dialog to edit only the tags of a chat.
   *
   * @param {Object} chat
   * @returns {Promise<{tags: string[]}|null>}
   */
  async showEditTags(chat) {
    if (!chat) throw new Error('Chat is required');

    const result = await this.dialog.form(
      [
        {
          name:        'tags',
          label:       'Tags',
          type:        'text',
          value:       (chat.tags || []).join(', '),
          placeholder: 'e.g. react, performance, debugging'
        }
      ],
      `Edit Tags: "${this._truncate(chat.title, 40)}"`,      'Save Tags'
    );

    if (!result) return null;
    return { tags: this._parseTags(result.tags) };
  }

  /**
   * Show dialog to rename a chat.
   *
   * @param {Object} chat
   * @returns {Promise<{title: string}|null>}
   */
  async showRenameChat(chat) {
    if (!chat) throw new Error('Chat is required');

    const result = await this.dialog.form(
      [
        {
          name:        'title',
          label:       'Chat Title',
          type:        'text',
          value:       chat.title,
          placeholder: 'Enter a new title',
          required:    true
        },
        {
          name:        'tags',
          label:       'Tags',
          type:        'text',
          value:       (chat.tags || []).join(', '),
          placeholder: 'e.g. react, performance, debugging'
        }
      ],
      'Edit Chat',
      'Save'
    );

    if (!result) return null;
    const newTitle = result.title.trim();
    const tags = this._parseTags(result.tags);
    if (newTitle === chat.title.trim() &&
        JSON.stringify(tags) === JSON.stringify(chat.tags || [])) return null;
    return { title: newTitle, tags };
  }

  /**
   * Show dialog to move a chat to a different topic.
   *
   * @param {Object} chat
   * @returns {Promise<{topicId: string}|null>}
   */
  async showMoveChat(chat) {
    if (!chat) throw new Error('Chat is required');

    const topicOptions = this._buildTopicOptions(chat.topicId);

    if (topicOptions.length === 0) {
      await this.dialog.alert('No other topics to move to.', 'Move Chat');
      return null;
    }

    const truncatedTitle = this._truncate(chat.title, 40);

    const result = await this.dialog.form(
      [
        {
          name:     'topicId',
          label:    'Move to Topic',
          type:     'select',
          options:  topicOptions,
          required: true
        }
      ],
      `Move "${truncatedTitle}"`,
      'Move'
    );

    if (!result) return null;
    return { topicId: result.topicId };
  }

  /**
   * C.19 — Show dialog to set or clear a review date on a chat.
   *
   * @param {Object} chat
   * @returns {Promise<{reviewDate: string|null}|null>}
   */
  async showSetReviewDate(chat) {
    if (!chat) throw new Error('Chat is required');

    const result = await this.dialog.form(
      [
        {
          name:  'reviewDate',
          label: 'Review Date',
          type:  'date',
          value: chat.reviewDate || '',
        }
      ],
      chat.reviewDate ? 'Update Review Date' : 'Set Review Date',
      'Save'
    );

    if (!result) return null;
    return { reviewDate: result.reviewDate || null };
  }

  /**
   * Show confirmation dialog to delete a chat.
   *
   * @param {Object} chat
   * @returns {Promise<{chatId: string}|null>}
   */
  async showDeleteChat(chat) {
    if (!chat) throw new Error('Chat is required');

    const confirmed = await this.dialog.confirm(
      `Delete "${chat.title}"? This action cannot be undone.`,
      'Delete Chat'
    );

    return confirmed ? { chatId: chat.id } : null;
  }

  /**
   * Truncate a title to `maxLength` characters, appending '…' if clipped.
   * Extracted to eliminate the identical ternary that previously appeared
   * in showAssignChat (50-char limit), showEditTags and showMoveChat (40-char).
   *
   * @param {string} title
   * @param {number} maxLength
   * @returns {string}
   */
  _truncate(title, maxLength) {
    return title.length > maxLength
      ? title.slice(0, maxLength - 3) + '...'
      : title;
  }

  /**
   * Parse a comma-separated tag string into a normalised lowercase array.
   * Extracted to eliminate an identical `.split/map/filter` chain that
   * previously appeared in showAssignChat, showEditTags, and showRenameChat.
   *
   * @param {string|undefined} raw  — e.g. "React, Performance, debugging"
   * @returns {string[]}            — e.g. ["react", "performance", "debugging"]
   */
  _parseTags(raw) {
    return (raw || '')
      .split(',')
      .map(t => t.trim().toLowerCase())
      .filter(t => t.length > 0);
  }

  /**
   * Build topic options for select dropdowns.
   * Optionally excludes a specific topic (e.g. current topic when moving).
   *
   * @param {string|null} excludeTopicId
   * @returns {Array<{value: string, label: string}>}
   */
  _buildTopicOptions(excludeTopicId = null) {
    const topics = Object.values(this.tree.topics || {});
    return topics
      .filter(t => t.id !== excludeTopicId)
      .map(t => ({ value: t.id, label: t.name }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }
}
