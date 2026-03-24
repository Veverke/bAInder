/**
 * tree-renderer.js — thin orchestrator for the topic-tree UI
 *
 * The 1,102-line monolith has been decomposed into 8 focused modules under
 * src/lib/renderer/ (resolves Code Quality issue 2.4):
 *
 *   tag-color.js          — getTagColor() — deterministic hue hash
 *   tree-sort.js          — sortTopics()  — sort strategies; fixes issue 5.4
 *   sparkline.js          — buildSparklineEl() — weekly-activity SVG
 *   search-highlight.js   — highlightSearch(), clearHighlight()
 *   flatten.js            — flattenVisible()   — pure tree traversal
 *   virtual-scroll.js     — startVirtualScroll(), renderVirtualRow()
 *   chat-item-builder.js  — buildChatItem()    — DOM factory
 *   topic-node-builder.js — buildTopicNode()   — DOM factory
 *
 * This file keeps the full public API (TreeRenderer class + getTagColor export)
 * so all callers and tests remain unchanged.
 */

import { getTagColor as _getTagColor }    from './tag-color.js';
import { sortTopics, sortChats }            from './tree-sort.js';
import { buildSparklineEl }                from './sparkline.js';
import { highlightSearch as _hl,
         clearHighlight  as _clr }        from './search-highlight.js';
import { flattenVisible }                  from './flatten.js';
import { startVirtualScroll,
         renderVirtualRow }               from './virtual-scroll.js';
import { buildTopicNode }                  from './topic-node-builder.js';
import { buildChatItem }                   from './chat-item-builder.js';

// Re-export for backward compatibility (callers import getTagColor from here)
export { _getTagColor as getTagColor };

// ---------------------------------------------------------------------------

export class TreeRenderer {
  constructor(container, topicTree = null) {
    this.container = container;
    this.tree      = topicTree;
    this.expandedNodes  = new Set();
    this.selectedNodeId = null;
    this.chats          = [];

    // Event handler callbacks (can be overridden by the caller)
    this.onTopicClick       = null;
    this.onTopicContextMenu = null;
    this.onChatClick        = null;
    this.onChatContextMenu  = null;
    this.onTopicPin         = null;
    this.onTopicDrop        = null;
    this.onChatDrop         = null;

    // Internal drag state
    this._drag = null; // { type: 'topic'|'chat', id: string } | null

    // A3: stagger animation counter
    this._nodeIndex = 0;

    // Stage 10: virtual scrolling
    this.virtualThreshold      = 150;
    this._virtualScrollHandler = null;

    // C.9 topic sort mode
    this.sortMode = 'alpha-asc';

    // C.9 chat sort mode
    this.chatSortMode = 'date-desc';

    // C.17 multi-select mode
    this.multiSelectMode   = false;
    this.selectedChatIds   = new Set();
    this.onSelectionChange = null;
  }

  // ---- Data setters -------------------------------------------------------

  setTree(topicTree) { this.tree = topicTree; }

  setChatData(chats) {
    this.chats = Array.isArray(chats) ? chats : [];
  }

  // ---- C.9 Sort -----------------------------------------------------------

  setSortMode(mode) {
    this.sortMode = mode;
    this.render();
  }

  setChatSortMode(mode) {
    this.chatSortMode = mode;
    this.render();
  }

  // ---- C.17 Multi-select --------------------------------------------------

  enterMultiSelectMode() {
    if (this.multiSelectMode) return;
    this.multiSelectMode = true;
    this.selectedChatIds = new Set();
    this.render();
  }

  exitMultiSelectMode() {
    if (!this.multiSelectMode) return;
    this.multiSelectMode = false;
    this.selectedChatIds = new Set();
    this.render();
  }

  toggleChatSelection(chatId) {
    if (this.selectedChatIds.has(chatId)) {
      this.selectedChatIds.delete(chatId);
    } else {
      this.selectedChatIds.add(chatId);
    }
    const li = this.container.querySelector(`[data-chat-id="${CSS.escape(chatId)}"]`);
    if (li) {
      const cb = li.querySelector('.tree-chat-checkbox');
      if (cb) cb.checked = this.selectedChatIds.has(chatId);
      li.classList.toggle('tree-chat-item--selected', this.selectedChatIds.has(chatId));
    }
    if (this.onSelectionChange) {
      this.onSelectionChange(new Set(this.selectedChatIds), this.getSelectedChats());
    }
  }

  clearSelection() {
    this.selectedChatIds = new Set();
    this.container.querySelectorAll('.tree-chat-item--selected').forEach(el => {
      el.classList.remove('tree-chat-item--selected');
      const cb = el.querySelector('.tree-chat-checkbox');
      if (cb) cb.checked = false;
    });
    if (this.onSelectionChange) {
      this.onSelectionChange(new Set(), []);
    }
  }

  getSelectedChats() {
    return this.chats.filter(c => this.selectedChatIds.has(c.id));
  }

  // ---- Expand / collapse --------------------------------------------------

  toggleNode(topicId) {
    if (this.expandedNodes.has(topicId)) {
      this.expandedNodes.delete(topicId);
    } else {
      this.expandedNodes.add(topicId);
    }
    this.render();
  }

  expandNode(topicId) {
    if (!this.expandedNodes.has(topicId)) {
      this.expandedNodes.add(topicId);
      this.render();
    }
  }

  collapseNode(topicId) {
    if (this.expandedNodes.has(topicId)) {
      this.expandedNodes.delete(topicId);
      this.render();
    }
  }

  expandAll() {
    if (!this.tree) return;
    this.tree.getAllTopics().forEach(topic => {
      if (topic.children.length > 0 || this.chats.some(c => c.topicId === topic.id)) {
        this.expandedNodes.add(topic.id);
      }
    });
    this.render();
  }

  collapseAll() {
    this.expandedNodes.clear();
    this.render();
  }

  expandToTopic(topicId) {
    if (!this.tree) return;
    const path = this.tree.getTopicPath(topicId);
    path.forEach(item => {
      if (item.id !== topicId) this.expandedNodes.add(item.id);
    });
    this.render();
  }

  getExpandedState() { return Array.from(this.expandedNodes); }

  setExpandedState(expandedIds) {
    this.expandedNodes = new Set(expandedIds);
    this.render();
  }

  // ---- Node selection -----------------------------------------------------

  selectNode(topicId) {
    this.selectedNodeId = topicId;
    this.container.querySelectorAll('.tree-node').forEach(node => {
      node.classList.toggle('selected', node.dataset.topicId === topicId);
    });
  }

  deselectNode() {
    this.selectedNodeId = null;
    this.container.querySelectorAll('.tree-node').forEach(node => {
      node.classList.remove('selected');
    });
  }

  getSelectedNode() { return this.selectedNodeId; }

  // ---- Main render --------------------------------------------------------

  render() {
    if (!this.tree) { this.renderEmpty(); return; }

    const rootTopics = this.tree.getRootTopics();
    if (rootTopics.length === 0) { this.renderEmpty(); return; }

    const emptyState = this.container.querySelector('#emptyState')
      || document.getElementById('emptyState');
    if (emptyState) emptyState.style.display = 'none';

    const flatNodes = this._flattenVisible();
    if (flatNodes.length > this.virtualThreshold && !this.multiSelectMode) {
      this.renderVirtual(flatNodes);
      return;
    }

    if (this._virtualScrollHandler) {
      this.container.removeEventListener('scroll', this._virtualScrollHandler);
      this._virtualScrollHandler = null;
    }
    this.container.classList.remove('tree-virtual-container');
    this.container.classList.toggle('tree-multiselect-active', this.multiSelectMode);

    // Keep #emptyState mounted so its inline SVG and listeners survive rerenders.
    this.container.querySelectorAll(':scope > :not(#emptyState)').forEach(el => el.remove());

    const ul = document.createElement('ul');
    ul.className = 'tree-root';
    ul.setAttribute('role', 'tree');

    const nodeIndex = { value: 0 };
    const ctx       = this._makeCtx(nodeIndex);

    this._sortTopics(rootTopics).forEach(topic => ul.appendChild(buildTopicNode(topic, 0, ctx)));
    this._nodeIndex = nodeIndex.value;

    // Root-level drop zone (drop here to re-parent a topic to root)
    ul.addEventListener('dragover', (e) => {
      if (!this._drag || this._drag.type !== 'topic') return;
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
      if (this.onTopicDrop) this.onTopicDrop(this._drag.id, null);
      this._drag = null;
    });

    this.container.appendChild(ul);
  }

  renderEmpty() {
    const emptyState = this.container.querySelector('#emptyState')
      || document.getElementById('emptyState');
    if (!emptyState) return;

    // If the TOC body was persisted as collapsed, force it open for onboarding.
    const tocSection = this.container.closest('.toc-section');
    if (tocSection?.classList.contains('section--collapsed')) {
      tocSection.classList.remove('section--collapsed');
      const tocBtn = tocSection.querySelector('#tocCollapseBtn');
      if (tocBtn) tocBtn.setAttribute('aria-expanded', 'true');
      localStorage.removeItem('toc-collapsed');
    }

    if (emptyState.parentElement !== this.container) {
      this.container.appendChild(emptyState);
    }

    this.container.querySelectorAll(':scope > :not(#emptyState)').forEach(el => el.remove());
    emptyState.style.display = 'flex';
  }

  renderVirtual(flatNodes) {
    this._virtualScrollHandler = startVirtualScroll(
      this.container, flatNodes, this._virtualScrollHandler, this._makeVirtualCtx()
    );
  }

  // ---- Node builder delegates (for direct-call compatibility) -------------

  renderNode(topic, level) {
    const nodeIndex = { value: this._nodeIndex };
    const el        = buildTopicNode(topic, level, this._makeCtx(nodeIndex));
    this._nodeIndex = nodeIndex.value;
    return el;
  }

  _renderChatItem(chat, level) {
    const nodeIndex = { value: this._nodeIndex };
    const el        = buildChatItem(chat, level, this._makeCtx(nodeIndex));
    this._nodeIndex = nodeIndex.value;
    return el;
  }

  refreshNode(topicId) {
    const node = this.container.querySelector(`[data-topic-id="${topicId}"]`);
    if (!node || !this.tree) return;
    const topic = this.tree.topics[topicId];
    if (!topic) return;
    const level   = parseInt(node.getAttribute('aria-level')) - 1;
    node.replaceWith(this.renderNode(topic, level));
  }

  // ---- Utility ------------------------------------------------------------

  updateTopicCount() {
    const itemCount = document.getElementById('itemCount');
    const chatCount = document.getElementById('chatCount');
    if (itemCount && this.tree) {
      const count = this.tree.getAllTopics().length;
      itemCount.textContent = `${count} topic${count !== 1 ? 's' : ''}`;
    }
    if (chatCount && Array.isArray(this.chats)) {
      const count = this.chats.length;
      chatCount.textContent = `${count} chat${count !== 1 ? 's' : ''}`;
    }
  }

  highlightSearch(searchTerm) { _hl(this.container, searchTerm);  }
  clearHighlight()             { _clr(this.container); }

  // ---- Internal delegates -------------------------------------------------

  _sortTopics(topics) {
    return sortTopics(topics, this.sortMode);
  }

  _sortChats(chats) {
    return sortChats(chats, this.chatSortMode);
  }

  _flattenVisible() {
    if (!this.tree) return [];
    return flattenVisible(
      this.tree,
      this.expandedNodes,
      this.chats,
      topics => this._sortTopics(topics),
      chats  => this._sortChats(chats)
    );
  }

  _buildSparklineEl(topicId) {
    return buildSparklineEl(topicId, this.chats);
  }

  _renderVirtualRow(item) {
    return renderVirtualRow(item, this._makeVirtualCtx());
  }

  // ---- Context factories --------------------------------------------------

  /**
   * Renderer context for normal (non-virtual) DOM building.
   * Callbacks are lambdas so they always read the current handler from `this`.
   */
  _makeCtx(nodeIndex) {
    return {
      expandedNodes:   this.expandedNodes,
      selectedNodeId:  this.selectedNodeId,
      multiSelectMode: this.multiSelectMode,
      selectedChatIds: this.selectedChatIds,
      chats:           this.chats,
      tree:            this.tree,
      nodeIndex,
      getDrag:  ()  => this._drag,
      setDrag:  (d) => { this._drag = d; },
      onTopicClick:        (t)       => this.onTopicClick?.(t),
      onTopicContextMenu:  (t, e)    => this.onTopicContextMenu?.(t, e),
      onTopicPin:          (id, p)   => this.onTopicPin?.(id, p),
      onTopicDrop:         (d, tgt)  => this.onTopicDrop?.(d, tgt),
      onChatDrop:          (id, tgt) => this.onChatDrop?.(id, tgt),
      onChatClick:         (c)       => this.onChatClick?.(c),
      onChatContextMenu:   (c, e)    => this.onChatContextMenu?.(c, e),
      onSelectionChange:   (...a)    => this.onSelectionChange?.(...a),
      sortChats:           (c)  => this._sortChats(c),
      toggleNode:          (id) => this.toggleNode(id),
      selectNode:          (id) => this.selectNode(id),
      toggleChatSelection: (id) => this.toggleChatSelection(id),
      getSelectedChats:    ()   => this.getSelectedChats(),
      container: this.container,
    };
  }

  /** Context for the virtual-scroll path. */
  _makeVirtualCtx() {
    // Build a topic→chatCount index once per render; renderVirtualRow does a
    // constant-time Map.get() instead of a linear Array.filter() for every
    // row stamped during a scroll event (fixes P2.1 — O(n×m) scroll cost).
    const chatCountByTopic = new Map();
    for (const chat of this.chats) {
      if (chat.topicId) {
        chatCountByTopic.set(chat.topicId, (chatCountByTopic.get(chat.topicId) ?? 0) + 1);
      }
    }
    return {
      expandedNodes:   this.expandedNodes,
      selectedNodeId:  this.selectedNodeId,
      chats:           this.chats,
      chatCountByTopic,
      tree:            this.tree,
      virtualThreshold: this.virtualThreshold,
      toggleExpand:    (id) => {
        if (this.expandedNodes.has(id)) this.expandedNodes.delete(id);
        else this.expandedNodes.add(id);
      },
      setSelectedNode: (id) => { this.selectedNodeId = id; },
      rerenderVirtual: (newFlat) => {
        if (newFlat.length > this.virtualThreshold) this.renderVirtual(newFlat);
        else this.render();
      },
      flattenVisible:  () => this._flattenVisible(),
      onTopicClick:        (id)       => this.onTopicClick?.(id),
      onTopicContextMenu:  (e, id)    => this.onTopicContextMenu?.(e, id),
      onChatClick:         (id, tid)  => this.onChatClick?.(id, tid),
      onChatContextMenu:   (e, id)    => this.onChatContextMenu?.(e, id),
    };
  }
}
