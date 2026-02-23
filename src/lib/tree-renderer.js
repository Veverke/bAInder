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

/**
 * Deterministic HSL hue (0-359) from a tag string via djb2 hash.
 * Same tag always yields the same hue across all renders.
 * @param {string} tag
 * @returns {number} hue in [0, 359]
 */
export function getTagColor(tag) {
  let h = 5381;
  for (let i = 0; i < tag.length; i++) h = (Math.imul(33, h) ^ tag.charCodeAt(i)) >>> 0;
  return h % 360;
}

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
    this.onTopicPin = null;         // U2 (Round 2) — (topicId, pinned) => void

    // Drag-and-drop callbacks
    // onTopicDrop(draggedTopicId, targetTopicId | null)
    //   targetTopicId === null means "drop to root level"
    this.onTopicDrop = null;
    // onChatDrop(chatId, targetTopicId)
    this.onChatDrop = null;

    // Internal drag state
    this._drag = null; // { type: 'topic'|'chat', id: string }

    // A3: stagger counter — incremented per node/chat <li> during each render()
    this._nodeIndex = 0;
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

    // U2: pinned topics float to top; A3: reset stagger counter each render
    rootTopics.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
    this._nodeIndex = 0;

    rootTopics.forEach(topic => {
      const li = this.renderNode(topic, 0);
      ul.appendChild(li);
    });

    // Root-level drop zone: dropping here re-parents a topic to root
    ul.addEventListener('dragover', (e) => {
      if (!this._drag || this._drag.type !== 'topic') return;
      // Only accept if the direct target is the ul itself (not a child)
      if (e.target !== ul) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      ul.classList.add('drop-target');
    });
    ul.addEventListener('dragleave', (e) => {
      if (!ul.contains(e.relatedTarget)) ul.classList.remove('drop-target');
    });
    ul.addEventListener('drop', (e) => {
      if (e.target !== ul) return;
      ul.classList.remove('drop-target');
      if (!this._drag || this._drag.type !== 'topic') return;
      e.preventDefault();
      e.stopPropagation();
      if (this.onTopicDrop) this.onTopicDrop(this._drag.id, null); // null = root
      this._drag = null;
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
    li.className = level === 0 ? 'tree-node tree-node--card' : 'tree-node';
    li.setAttribute('role', 'treeitem');
    li.setAttribute('aria-level', level + 1);
    li.dataset.topicId = topic.id;
    li.style.setProperty('--node-index', this._nodeIndex++); // A3 stagger

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
    nodeContent.tabIndex = 0; // U6 keyboard navigation

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

    // ── Sparkline — weekly activity for last 6 weeks (U3) ─────────────────
    if (level === 0 && topic.chatIds.length > 0) {
      nodeContent.appendChild(this._buildSparklineEl(topic.id));
    }

    // ── Star / pin button (level-0 topics only, U2) ───────────────────────
    if (level === 0) {
      const starBtn = document.createElement('button');
      starBtn.className = `tree-star-btn${topic.pinned ? ' tree-star-btn--active' : ''}`;
      starBtn.setAttribute('aria-label', topic.pinned ? 'Unpin topic' : 'Pin topic');
      starBtn.setAttribute('title',       topic.pinned ? 'Unpin'        : 'Pin to top');
      starBtn.textContent = '\u2605'; // ★
      starBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.onTopicPin) this.onTopicPin(topic.id, !topic.pinned);
      });
      nodeContent.appendChild(starBtn);
    }

    // ── ⋮ more-actions button (visible on hover) ──────────────────────────
    const topicMoreBtn = document.createElement('button');
    topicMoreBtn.className = 'tree-more-btn';
    topicMoreBtn.setAttribute('aria-label', 'More actions');
    topicMoreBtn.textContent = '⋮';
    topicMoreBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.onTopicContextMenu) {
        this.onTopicContextMenu(topic, e);
      }
    });
    nodeContent.appendChild(topicMoreBtn);

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

    // ── Drag source (topic) ───────────────────────────────────────────────
    nodeContent.draggable = true;
    nodeContent.addEventListener('dragstart', (e) => {
      this._drag = { type: 'topic', id: topic.id };
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', topic.id);
      // Custom drag ghost pill (A2)
      const ghost = document.createElement('div');
      ghost.className = 'tree-drag-ghost';
      ghost.textContent = `\uD83D\uDCC1 ${topic.name}`;
      document.body.appendChild(ghost);
      e.dataTransfer.setDragImage(ghost, 0, 14);
      requestAnimationFrame(() => ghost.remove());
      // Slight delay so the drag image captures the element before opacity changes
      setTimeout(() => nodeContent.classList.add('dragging'), 0);
    });
    nodeContent.addEventListener('dragend', () => {
      nodeContent.classList.remove('dragging');
      this._drag = null;
      // Remove any leftover drop-target highlights
      this.container.querySelectorAll('.drop-target').forEach(el => el.classList.remove('drop-target'));
    });

    // ── Drop target (topic) ───────────────────────────────────────────────
    nodeContent.addEventListener('dragover', (e) => {
      if (!this._drag) return;
      // Prevent dropping a topic onto itself
      if (this._drag.type === 'topic' && this._drag.id === topic.id) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      nodeContent.classList.add('drop-target');
    });
    nodeContent.addEventListener('dragleave', (e) => {
      if (!nodeContent.contains(e.relatedTarget)) {
        nodeContent.classList.remove('drop-target');
      }
    });
    nodeContent.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      nodeContent.classList.remove('drop-target');
      if (!this._drag) return;
      if (this._drag.type === 'topic' && this._drag.id !== topic.id) {
        if (this.onTopicDrop) this.onTopicDrop(this._drag.id, topic.id);
      } else if (this._drag.type === 'chat') {
        if (this.onChatDrop) this.onChatDrop(this._drag.id, topic.id);
      }
      this._drag = null;
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
    li.style.setProperty('--node-index', this._nodeIndex++); // A3 stagger

    // Source attribute drives the CSS left-border accent colour
    const source = chat.source || 'unknown';
    li.setAttribute('data-source', source);

    const content = document.createElement('div');
    content.className = 'tree-node-content';
    content.style.paddingLeft = `${level * 20}px`;
    content.tabIndex = 0; // U6 keyboard navigation

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

    // Source badge chip
    if (!chat.metadata?.isExcerpt) {
      const SOURCE_LABELS = { chatgpt: 'ChatGPT', claude: 'Claude', gemini: 'Gemini', copilot: 'Copilot' };
      const sourceChip = document.createElement('span');
      sourceChip.className = `tree-source-chip tree-source-chip--${source}`;
      sourceChip.textContent = SOURCE_LABELS[source] || source;
      label.appendChild(sourceChip);
    }

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

    // Tag chips
    const tags = chat.tags || [];
    if (tags.length > 0) {
      const tagsEl = document.createElement('span');
      tagsEl.className = 'tree-chat-tags';
      tags.forEach(tag => {
        const chip = document.createElement('span');
        chip.className = 'tree-tag-chip';
        chip.style.setProperty('--tag-hue', getTagColor(tag));
        chip.textContent = tag;
        tagsEl.appendChild(chip);
      });
      label.appendChild(tagsEl);

      // ── Tag hover overlay ──────────────────────────────────────────────
      // Shows a floating card with coloured pills separated by " | " when
      // the user hovers over the tags area (or anywhere on the row).
      let _overlay = null;
      const _showOverlay = (anchorRect) => {
        if (_overlay) return;
        _overlay = document.createElement('div');
        _overlay.className = 'tree-tag-hover-overlay';
        tags.forEach((tag) => {
          const pill = document.createElement('span');
          pill.className = 'tree-tag-chip tree-tag-chip--overlay';
          pill.style.setProperty('--tag-hue', getTagColor(tag));
          pill.textContent = tag;
          _overlay.appendChild(pill);
        });
        document.body.appendChild(_overlay);
        // Position below the row, left-aligned
        const left = Math.min(anchorRect.left, window.innerWidth - 240);
        const top  = anchorRect.bottom + 4;
        _overlay.style.left = `${left}px`;
        _overlay.style.top  = `${top}px`;
      };
      const _hideOverlay = () => {
        if (_overlay) { _overlay.remove(); _overlay = null; }
      };
      content.addEventListener('mouseenter', () => {
        _showOverlay(content.getBoundingClientRect());
      });
      content.addEventListener('mouseleave', _hideOverlay);
    }

    content.appendChild(label);

    // ── ⋮ more-actions button (visible on hover) ──────────────────────────
    const chatMoreBtn = document.createElement('button');
    chatMoreBtn.className = 'tree-more-btn';
    chatMoreBtn.setAttribute('aria-label', 'More actions');
    chatMoreBtn.textContent = '⋮';
    chatMoreBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.onChatContextMenu) this.onChatContextMenu(chat, e);
    });
    content.appendChild(chatMoreBtn);

    // Click → open original chat URL + ripple effect (A6)
    content.addEventListener('click', (e) => {
      const ripple = document.createElement('span');
      ripple.className = 'tree-ripple';
      const rect  = content.getBoundingClientRect();
      const size  = Math.max(rect.width, rect.height);
      ripple.style.cssText = `width:${size}px;height:${size}px;top:${e.clientY - rect.top - size / 2}px;left:${e.clientX - rect.left - size / 2}px`;
      content.appendChild(ripple);
      ripple.addEventListener('animationend', () => ripple.remove(), { once: true });
      if (this.onChatClick) this.onChatClick(chat);
    });

    // Right-click → chat context menu
    content.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (this.onChatContextMenu) this.onChatContextMenu(chat, e);
    });

    // ── Drag source (chat item) ───────────────────────────────────────────
    content.draggable = true;
    content.addEventListener('dragstart', (e) => {
      this._drag = { type: 'chat', id: chat.id };
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', chat.id);
      // Custom drag ghost pill (A2)
      const ghost = document.createElement('div');
      ghost.className = 'tree-drag-ghost';
      ghost.textContent = `\uD83D\uDCAC ${chat.title || 'Untitled Chat'}`;
      document.body.appendChild(ghost);
      e.dataTransfer.setDragImage(ghost, 0, 14);
      requestAnimationFrame(() => ghost.remove());
      setTimeout(() => content.classList.add('dragging'), 0);
    });
    content.addEventListener('dragend', () => {
      content.classList.remove('dragging');
      this._drag = null;
      this.container.querySelectorAll('.drop-target').forEach(el => el.classList.remove('drop-target'));
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

  /**
   * Build a sparkline SVG element showing how many chats were saved per week
   * over the last 6 weeks (U3).
   * @param {string} topicId
   * @returns {SVGElement}
   */
  _buildSparklineEl(topicId) {
    const WEEKS   = 6;
    const BAR_W   = 6;
    const GAP     = 2;
    const HEIGHT  = 16;
    const now     = Date.now();
    const weekMs  = 7 * 24 * 60 * 60 * 1000;
    const counts  = new Array(WEEKS).fill(0);

    this.chats
      .filter(c => c.topicId === topicId && c.timestamp)
      .forEach(c => {
        const age = Math.floor((now - new Date(c.timestamp).getTime()) / weekMs);
        if (age >= 0 && age < WEEKS) counts[WEEKS - 1 - age]++;
      });

    const max   = Math.max(...counts, 1);
    const WIDTH = WEEKS * (BAR_W + GAP) - GAP;
    const ns    = 'http://www.w3.org/2000/svg';
    const svg   = document.createElementNS(ns, 'svg');
    svg.setAttribute('class',   'tree-sparkline');
    svg.setAttribute('width',   WIDTH);
    svg.setAttribute('height',  HEIGHT);
    svg.setAttribute('viewBox', `0 0 ${WIDTH} ${HEIGHT}`);
    svg.setAttribute('aria-hidden', 'true');

    counts.forEach((count, i) => {
      const h = Math.max(Math.round((count / max) * HEIGHT), 2);
      const rect = document.createElementNS(ns, 'rect');
      rect.setAttribute('x',      i * (BAR_W + GAP));
      rect.setAttribute('y',      HEIGHT - h);
      rect.setAttribute('width',  BAR_W);
      rect.setAttribute('height', h);
      rect.setAttribute('rx',     '1');
      svg.appendChild(rect);
    });

    return svg;
  }
}
