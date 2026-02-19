/**
 * TreeRenderer - Renders hierarchical topic tree in the side panel
 * 
 * Features:
 * - Hierarchical display with indentation
 * - Expand/collapse functionality
 * - Timespan badges for topics with chats
 * - Lazy loading for performance
 * - Keyboard navigation support
 */

export class TreeRenderer {
  constructor(container, topicTree = null) {
    this.container = container;
    this.tree = topicTree;
    this.expandedNodes = new Set(); // Track which nodes are expanded
    this.selectedNodeId = null; // Track selected node
    this.chats = []; // Flat chats array (Stage 7)

    // Event handlers (can be overridden)
    this.onTopicClick = null;
    this.onTopicContextMenu = null;
    this.onChatClick = null;        // Stage 7
    this.onChatContextMenu = null;  // Stage 7
  }

  /**
   * Set the topic tree to render
   */
  setTree(topicTree) {
    this.tree = topicTree;
  }

  /**
   * Set the flat chats array so the renderer can display chat items (Stage 7).
   * @param {Array} chats
   */
  setChatData(chats) {
    this.chats = Array.isArray(chats) ? chats : [];
  }

  /**
   * Render the entire tree
   */
  render() {
    if (!this.tree) {
      this.renderEmpty();
      return;
    }

    const rootTopics = this.tree.getRootTopics();
    
    if (rootTopics.length === 0) {
      this.renderEmpty();
      return;
    }

    // Clear container
    this.container.innerHTML = '';
    
    // Render root topics
    const ul = document.createElement('ul');
    ul.className = 'tree-root';
    ul.setAttribute('role', 'tree');
    
    rootTopics.forEach(topic => {
      const li = this.renderNode(topic, 0);
      ul.appendChild(li);
    });
    
    this.container.appendChild(ul);
    
    // Update empty state visibility
    const emptyState = document.getElementById('emptyState');
    if (emptyState) {
      emptyState.style.display = 'none';
    }
  }

  /**
   * Render empty state
   */
  renderEmpty() {
    this.container.innerHTML = '';
    const emptyState = document.getElementById('emptyState');
    if (emptyState) {
      emptyState.style.display = 'flex';
    }
  }

  /**
   * Render a single tree node (topic)
   */
  renderNode(topic, level) {
    const li = document.createElement('li');
    li.className = 'tree-node';
    li.setAttribute('role', 'treeitem');
    li.setAttribute('aria-level', level + 1);
    li.dataset.topicId = topic.id;
    
    const hasChildren = topic.children.length > 0 ||
      this.chats.some(c => c.topicId === topic.id);
    const isExpanded = this.expandedNodes.has(topic.id);
    const isSelected = this.selectedNodeId === topic.id;
    
    if (hasChildren) {
      li.setAttribute('aria-expanded', isExpanded);
    }
    
    if (isSelected) {
      li.classList.add('selected');
    }

    // Create node content
    const nodeContent = document.createElement('div');
    nodeContent.className = 'tree-node-content';
    nodeContent.style.paddingLeft = `${level * 20}px`;
    
    // Expand/collapse button
    if (hasChildren) {
      const expandBtn = document.createElement('button');
      expandBtn.className = 'tree-expand-btn';
      expandBtn.setAttribute('aria-label', isExpanded ? 'Collapse' : 'Expand');
      expandBtn.innerHTML = isExpanded ? '▼' : '▶';
      expandBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleNode(topic.id);
      });
      nodeContent.appendChild(expandBtn);
    } else {
      // Spacer for alignment
      const spacer = document.createElement('span');
      spacer.className = 'tree-expand-spacer';
      nodeContent.appendChild(spacer);
    }
    
    // Icon
    const icon = document.createElement('span');
    icon.className = 'tree-icon';
    icon.textContent = hasChildren ? '📁' : '📄';
    nodeContent.appendChild(icon);
    
    // Label with timespan
    const label = document.createElement('span');
    label.className = 'tree-label';
    
    const labelText = document.createElement('span');
    labelText.className = 'tree-label-text';
    labelText.textContent = topic.name;
    label.appendChild(labelText);
    
    // Add timespan badge if topic has chats
    const timespan = topic.getDateRangeString();
    if (timespan) {
      const badge = document.createElement('span');
      badge.className = 'tree-timespan';
      badge.textContent = timespan;
      label.appendChild(badge);
    }
    
    // Chat count badge
    if (topic.chatIds.length > 0) {
      const chatBadge = document.createElement('span');
      chatBadge.className = 'tree-chat-count';
      chatBadge.textContent = topic.chatIds.length;
      chatBadge.setAttribute('title', `${topic.chatIds.length} chat${topic.chatIds.length !== 1 ? 's' : ''}`);
      label.appendChild(chatBadge);
    }

    nodeContent.appendChild(label);

    // Click handler for selection
    nodeContent.addEventListener('click', () => {
      this.selectNode(topic.id);
      if (this.onTopicClick) {
        this.onTopicClick(topic);
      }
    });

    // Context menu handler
    nodeContent.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (this.onTopicContextMenu) {
        this.onTopicContextMenu(topic, e);
      }
    });

    li.appendChild(nodeContent);

    // Render children and chats if expanded
    const topicChats = this.chats.filter(c => c.topicId === topic.id);
    if (hasChildren && isExpanded) {
      const childrenUl = document.createElement('ul');
      childrenUl.className = 'tree-children';
      childrenUl.setAttribute('role', 'group');

      topic.children.forEach(childId => {
        const childTopic = this.tree.topics[childId];
        if (childTopic) {
          const childLi = this.renderNode(childTopic, level + 1);
          childrenUl.appendChild(childLi);
        }
      });

      // Render chat items after child topics
      topicChats.forEach(chat => {
        const chatLi = this._renderChatItem(chat, level + 1);
        childrenUl.appendChild(chatLi);
      });

      li.appendChild(childrenUl);
    }

    return li;
  }

  /**
   * Return a single rendered <li> element for a chat entry.
   * @param {Object} chat
   * @param {number} level  Indentation level
   * @returns {HTMLElement}
   */
  _renderChatItem(chat, level) {
    const li = document.createElement('li');
    li.className = 'tree-node tree-chat-item';
    li.setAttribute('role', 'treeitem');
    li.setAttribute('data-chat-id', chat.id);

    const content = document.createElement('div');
    content.className = 'tree-node-content';
    content.style.paddingLeft = `${level * 20}px`;

    // Spacer (no expand button – chats are leaf items)
    const spacer = document.createElement('span');
    spacer.className = 'tree-expand-spacer';
    content.appendChild(spacer);

    // Icon: excerpt vs full chat
    const icon = document.createElement('span');
    icon.className = 'tree-icon';
    icon.textContent = chat.metadata?.isExcerpt ? '✂️' : '💬';
    content.appendChild(icon);

    // Label
    const label = document.createElement('span');
    label.className = 'tree-label';

    const labelText = document.createElement('span');
    labelText.className = 'tree-label-text';
    labelText.textContent = chat.title || 'Untitled Chat';
    label.appendChild(labelText);

    // Date badge
    if (chat.timestamp) {
      const dateBadge = document.createElement('span');
      dateBadge.className = 'tree-timespan';
      dateBadge.textContent = new Date(chat.timestamp).toLocaleDateString(
        'en-US', { month: 'short', day: 'numeric', year: 'numeric' }
      );
      label.appendChild(dateBadge);
    }

    content.appendChild(label);

    // Click → open original chat URL
    content.addEventListener('click', () => {
      if (this.onChatClick) this.onChatClick(chat);
    });

    // Right-click → chat context menu
    content.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (this.onChatContextMenu) this.onChatContextMenu(chat, e);
    });

    li.appendChild(content);
    return li;
  }

  /**
   * Toggle expand/collapse state of a node
   */
  toggleNode(topicId) {
    if (this.expandedNodes.has(topicId)) {
      this.expandedNodes.delete(topicId);
    } else {
      this.expandedNodes.add(topicId);
    }
    this.render(); // Re-render tree
  }

  /**
   * Expand a node
   */
  expandNode(topicId) {
    if (!this.expandedNodes.has(topicId)) {
      this.expandedNodes.add(topicId);
      this.render();
    }
  }

  /**
   * Collapse a node
   */
  collapseNode(topicId) {
    if (this.expandedNodes.has(topicId)) {
      this.expandedNodes.delete(topicId);
      this.render();
    }
  }

  /**
   * Expand all nodes
   */
  expandAll() {
    if (!this.tree) return;
    
    const allTopics = this.tree.getAllTopics();
    allTopics.forEach(topic => {
      if (topic.children.length > 0) {
        this.expandedNodes.add(topic.id);
      }
    });
    this.render();
  }

  /**
   * Collapse all nodes
   */
  collapseAll() {
    this.expandedNodes.clear();
    this.render();
  }

  /**
   * Select a node
   */
  selectNode(topicId) {
    this.selectedNodeId = topicId;
    
    // Update DOM
    const allNodes = this.container.querySelectorAll('.tree-node');
    allNodes.forEach(node => {
      if (node.dataset.topicId === topicId) {
        node.classList.add('selected');
      } else {
        node.classList.remove('selected');
      }
    });
  }

  /**
   * Deselect current node
   */
  deselectNode() {
    this.selectedNodeId = null;
    const allNodes = this.container.querySelectorAll('.tree-node');
    allNodes.forEach(node => {
      node.classList.remove('selected');
    });
  }

  /**
   * Get selected node ID
   */
  getSelectedNode() {
    return this.selectedNodeId;
  }

  /**
   * Expand path to a specific topic (makes it visible)
   */
  expandToTopic(topicId) {
    if (!this.tree) return;
    
    const path = this.tree.getTopicPath(topicId);
    path.forEach(item => {
      if (item.id !== topicId) { // Don't expand the target itself
        this.expandedNodes.add(item.id);
      }
    });
    this.render();
  }

  /**
   * Refresh a specific node (after data change)
   */
  refreshNode(topicId) {
    const node = this.container.querySelector(`[data-topic-id="${topicId}"]`);
    if (!node || !this.tree) return;
    
    const topic = this.tree.topics[topicId];
    if (!topic) return;
    
    // Get level from node
    const level = parseInt(node.getAttribute('aria-level')) - 1;
    
    // Replace node
    const newNode = this.renderNode(topic, level);
    node.replaceWith(newNode);
  }

  /**
   * Update topic count badge in header
   */
  updateTopicCount() {
    const itemCount = document.getElementById('itemCount');
    if (itemCount && this.tree) {
      const count = this.tree.getAllTopics().length;
      itemCount.textContent = `${count} topic${count !== 1 ? 's' : ''}`;
    }
  }

  /**
   * Get all expanded node IDs (for persistence)
   */
  getExpandedState() {
    return Array.from(this.expandedNodes);
  }

  /**
   * Restore expanded state (from persistence)
   */
  setExpandedState(expandedIds) {
    this.expandedNodes = new Set(expandedIds);
    this.render();
  }

  /**
   * Search and highlight topics
   */
  highlightSearch(searchTerm) {
    if (!searchTerm) {
      this.clearHighlight();
      return;
    }
    
    const allNodes = this.container.querySelectorAll('.tree-label-text');
    const term = searchTerm.toLowerCase();
    
    allNodes.forEach(node => {
      const text = node.textContent.toLowerCase();
      if (text.includes(term)) {
        node.parentElement.parentElement.parentElement.classList.add('search-match');
      }
    });
  }

  /**
   * Clear search highlighting
   */
  clearHighlight() {
    const allNodes = this.container.querySelectorAll('.tree-node');
    allNodes.forEach(node => {
      node.classList.remove('search-match');
    });
  }
}
