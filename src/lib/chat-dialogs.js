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

    const displayTitle = chatEntry.title.length > 50
      ? chatEntry.title.slice(0, 47) + '...'
      : chatEntry.title;

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
    return { topicId: result.topicId, title: result.title.trim() };
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
        }
      ],
      'Rename Chat',
      'Rename'
    );

    if (!result) return null;
    if (result.title.trim() === chat.title.trim()) return null;
    return { title: result.title.trim() };
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

    const truncatedTitle = chat.title.length > 40
      ? chat.title.slice(0, 37) + '...'
      : chat.title;

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
