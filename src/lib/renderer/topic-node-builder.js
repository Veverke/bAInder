/**
 * topic-node-builder.js — DOM factory for topic <li> nodes in the tree
 *
 * Responsibility: build a fully-wired <li> element for one topic node,
 * including expand/collapse button, icon, label with timespan + chat-count
 * badges, sparkline, pin button, more-actions button, click/context-menu
 * handlers, drag source, drop target, and recursive children.
 *
 * RendererCtx (subset used here):
 *   expandedNodes   {Set<string>}
 *   selectedNodeId  {string|null}
 *   chats           {Object[]}
 *   tree            {TopicTree}
 *   nodeIndex       {{value: number}}  — shared mutable counter (by-ref)
 *   container       {HTMLElement}
 *   getDrag         {() => Object|null}
 *   setDrag         {(d: Object|null) => void}
 *   onTopicClick    {Function|null}
 *   onTopicContextMenu {Function|null}
 *   onTopicPin      {Function|null}
 *   onTopicDrop     {Function|null}
 *   onChatDrop      {Function|null}
 *   toggleNode      {(id: string) => void}
 *   selectNode      {(id: string) => void}
 */

import { buildSparklineEl }  from './sparkline.js';
import { buildChatItem }     from './chat-item-builder.js';

/**
 * Build a rendered <li> element for one topic node (recursively includes
 * expanded child topics and chat items).
 * @param {Object} topic
 * @param {number} level — indentation depth (0 = root)
 * @param {Object} ctx   — RendererCtx
 * @returns {HTMLElement}
 */
export function buildTopicNode(topic, level, ctx) {
  const li = document.createElement('li');
  li.className = level === 0 ? 'tree-node tree-node--card' : 'tree-node';
  li.setAttribute('role', 'treeitem');
  li.setAttribute('aria-level', level + 1);
  li.dataset.topicId = topic.id;
  li.style.setProperty('--node-index', ctx.nodeIndex.value++);

  const hasChildren = topic.children.length > 0 ||
    ctx.chats.some(c => c.topicId === topic.id);
  const isExpanded = ctx.expandedNodes.has(topic.id);
  const isSelected = ctx.selectedNodeId === topic.id;

  if (hasChildren) li.setAttribute('aria-expanded', isExpanded);
  if (isSelected)  li.classList.add('selected');

  // ── Node content row ─────────────────────────────────────────────────────
  const nodeContent = document.createElement('div');
  nodeContent.className = 'tree-node-content';
  nodeContent.style.paddingLeft = `${level * 20}px`;
  nodeContent.tabIndex = 0; // U6 keyboard navigation

  // Expand/collapse button or spacer for alignment
  if (hasChildren) {
    const expandBtn = document.createElement('button');
    expandBtn.className = 'tree-expand-btn';
    expandBtn.setAttribute('aria-label', isExpanded ? 'Collapse' : 'Expand');
    expandBtn.innerHTML = isExpanded ? '▼' : '▶';
    expandBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      ctx.toggleNode(topic.id);
    });
    nodeContent.appendChild(expandBtn);
  } else {
    const spacer = document.createElement('span');
    spacer.className = 'tree-expand-spacer';
    nodeContent.appendChild(spacer);
  }

  // Icon
  const icon = document.createElement('span');
  icon.className   = 'tree-icon';
  icon.textContent = hasChildren ? '📁' : '📄';
  nodeContent.appendChild(icon);

  // ── Label: name + timespan badge + chat-count badge ──────────────────────
  const label = document.createElement('span');
  label.className = 'tree-label';

  const labelText = document.createElement('span');
  labelText.className   = 'tree-label-text';
  labelText.textContent = topic.name;
  label.appendChild(labelText);

  const timespan = topic.getDateRangeString();
  if (timespan) {
    const badge = document.createElement('span');
    badge.className   = 'tree-timespan';
    badge.textContent = timespan;
    label.appendChild(badge);
  }

  if (topic.chatIds.length > 0) {
    const chatBadge = document.createElement('span');
    chatBadge.className   = 'tree-chat-count';
    chatBadge.textContent = topic.chatIds.length;
    chatBadge.setAttribute(
      'title',
      `${topic.chatIds.length} chat${topic.chatIds.length !== 1 ? 's' : ''}`
    );
    label.appendChild(chatBadge);
  }

  nodeContent.appendChild(label);

  // ── Sparkline — weekly activity for last 6 weeks (root level only) ───────
  if (level === 0 && topic.chatIds.length > 0) {
    nodeContent.appendChild(buildSparklineEl(topic.id, ctx.chats));
  }

  // ── Pin button (root-level topics only, U2) ───────────────────────────────
  if (level === 0) {
    const pinBtn = document.createElement('button');
    pinBtn.className = `tree-pin-btn${topic.pinned ? ' tree-pin-btn--active' : ''}`;
    pinBtn.setAttribute('aria-label', topic.pinned ? 'Unpin topic' : 'Pin topic');
    pinBtn.setAttribute('title',       topic.pinned ? 'Unpin'        : 'Pin to top');
    pinBtn.textContent = '\uD83D\uDCCC'; // 📌
    pinBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (ctx.onTopicPin) ctx.onTopicPin(topic.id, !topic.pinned);
    });
    nodeContent.appendChild(pinBtn);
  }

  // ── ⋮ more-actions button (visible on hover) ─────────────────────────────
  const topicMoreBtn = document.createElement('button');
  topicMoreBtn.className = 'tree-more-btn';
  topicMoreBtn.setAttribute('aria-label', 'More actions');
  topicMoreBtn.textContent = '⋮';
  topicMoreBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (ctx.onTopicContextMenu) ctx.onTopicContextMenu(topic, e);
  });
  nodeContent.appendChild(topicMoreBtn);

  // ── Click: select + expand/collapse ──────────────────────────────────────
  nodeContent.addEventListener('click', () => {
    ctx.selectNode(topic.id);
    if (hasChildren) ctx.toggleNode(topic.id);
    if (ctx.onTopicClick) ctx.onTopicClick(topic);
  });

  // ── Context menu ──────────────────────────────────────────────────────────
  nodeContent.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (ctx.onTopicContextMenu) ctx.onTopicContextMenu(topic, e);
  });

  // ── Drag source (topic) ───────────────────────────────────────────────────
  nodeContent.draggable = true;
  nodeContent.addEventListener('dragstart', (e) => {
    ctx.setDrag({ type: 'topic', id: topic.id });
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', topic.id);
    const ghost = document.createElement('div');
    ghost.className   = 'tree-drag-ghost';
    ghost.textContent = `\uD83D\uDCC1 ${topic.name}`;
    document.body.appendChild(ghost);
    e.dataTransfer.setDragImage(ghost, 0, 14);
    requestAnimationFrame(() => ghost.remove());
    setTimeout(() => nodeContent.classList.add('dragging'), 0);
  });
  nodeContent.addEventListener('dragend', () => {
    nodeContent.classList.remove('dragging');
    ctx.setDrag(null);
    ctx.container.querySelectorAll('.drop-target').forEach(el => el.classList.remove('drop-target'));
  });

  // ── Drop target (topic) ───────────────────────────────────────────────────
  nodeContent.addEventListener('dragover', (e) => {
    const drag = ctx.getDrag();
    if (!drag) return;
    if (drag.type === 'topic' && drag.id === topic.id) return; // can't drop on self
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
    const drag = ctx.getDrag();
    if (!drag) return;
    if (drag.type === 'topic' && drag.id !== topic.id) {
      if (ctx.onTopicDrop) ctx.onTopicDrop(drag.id, topic.id);
    } else if (drag.type === 'chat') {
      if (ctx.onChatDrop) ctx.onChatDrop(drag.id, topic.id);
    }
    ctx.setDrag(null);
  });

  li.appendChild(nodeContent);

  // ── Children (rendered only when expanded) ────────────────────────────────
  const topicChats = ctx.chats.filter(c => c.topicId === topic.id);
  if (hasChildren && isExpanded) {
    const childrenUl = document.createElement('ul');
    childrenUl.className = 'tree-children';
    childrenUl.setAttribute('role', 'group');

    topic.children.forEach(childId => {
      const childTopic = ctx.tree.topics[childId];
      if (childTopic) {
        childrenUl.appendChild(buildTopicNode(childTopic, level + 1, ctx));
      }
    });

    // Cap initial render at CHAT_RENDER_THRESHOLD to avoid stamping hundreds of
    // full DOM nodes for large topics in one synchronous pass (fixes P2.2).
    const CHAT_RENDER_THRESHOLD = 100;
    topicChats.slice(0, CHAT_RENDER_THRESHOLD).forEach(chat => {
      childrenUl.appendChild(buildChatItem(chat, level + 1, ctx));
    });

    if (topicChats.length > CHAT_RENDER_THRESHOLD) {
      const remaining = topicChats.length - CHAT_RENDER_THRESHOLD;
      const showMoreLi = document.createElement('li');
      showMoreLi.className = 'tree-chat-showmore';
      const showMoreBtn = document.createElement('button');
      showMoreBtn.className = 'tree-chat-showmore__btn';
      showMoreBtn.textContent = `Show ${remaining} more chat${remaining !== 1 ? 's' : ''}…`;
      showMoreBtn.addEventListener('click', () => {
        showMoreLi.remove();
        topicChats.slice(CHAT_RENDER_THRESHOLD).forEach(chat => {
          childrenUl.appendChild(buildChatItem(chat, level + 1, ctx));
        });
      });
      showMoreLi.appendChild(showMoreBtn);
      childrenUl.appendChild(showMoreLi);
    }

    li.appendChild(childrenUl);
  }

  return li;
}
