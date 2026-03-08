/**
 * virtual-scroll.js — virtual-scroll renderer for large trees (Stage 10)
 *
 * Responsibilities:
 *   - Compute the visible window of rows from the current scroll position
 *   - Stamp only those rows into the DOM; a sizer div provides total scroll height
 *   - Attach / detach the scroll listener; return the handler to the caller
 *     so TreeRenderer can store it for future teardown
 *
 * Context shape (VirtualCtx — subset of RendererCtx used here):
 *   expandedNodes     {Set<string>}
 *   selectedNodeId    {string|null}
 *   chats             {Object[]}
 *   tree              {TopicTree}
 *   virtualThreshold  {number}
 *   toggleExpand      {(id: string) => void}
 *   setSelectedNode   {(id: string) => void}
 *   rerenderVirtual   {(newFlat: FlatNode[]) => void}
 *   flattenVisible    {() => FlatNode[]}
 *   onTopicClick      {Function|null}
 *   onTopicContextMenu {Function|null}
 *   onChatClick       {Function|null}
 *   onChatContextMenu {Function|null}
 */

const ITEM_HEIGHT = 36;
const BUFFER      = 5;
const INDENT_PX   = 16;

/**
 * Render a single lightweight row element for virtual scrolling.
 * @param {FlatNode}    item
 * @param {VirtualCtx}  ctx
 * @returns {HTMLElement}
 */
export function renderVirtualRow(item, ctx) {
  const row = document.createElement('div');
  row.className = `tree-virtual-row tree-virtual-row--${item.type}`;
  if (item.id === ctx.selectedNodeId) row.classList.add('tree-virtual-row--selected');

  // Indent spacer
  const indent = document.createElement('span');
  indent.className = 'tree-virtual-row__indent';
  indent.style.width   = `${item.depth * INDENT_PX}px`;
  indent.style.display = 'inline-block';
  row.appendChild(indent);

  if (item.type === 'topic') {
    const isExpanded  = ctx.expandedNodes.has(item.id);
    const children    = ctx.tree ? ctx.tree.getChildren(item.id) : [];
    const chats       = ctx.chats.filter(c => c.topicId === item.id);
    const hasChildren = children.length > 0 || chats.length > 0;

    // Chevron
    const chevron = document.createElement('span');
    chevron.className   = 'tree-virtual-row__chevron';
    chevron.textContent = hasChildren ? (isExpanded ? '▼' : '▶') : ' ';
    row.appendChild(chevron);

    // Name
    const name = document.createElement('span');
    name.className   = 'tree-virtual-row__name';
    name.textContent = item.data.name || 'Untitled';
    row.appendChild(name);

    // Chat count badge
    if (chats.length > 0) {
      const count = document.createElement('span');
      count.className   = 'tree-virtual-row__count';
      count.textContent = chats.length;
      row.appendChild(count);
    }

    // Click: toggle expand + re-render
    row.addEventListener('click', (e) => {
      e.stopPropagation();
      ctx.setSelectedNode(item.id);
      if (hasChildren) ctx.toggleExpand(item.id);
      if (ctx.onTopicClick) ctx.onTopicClick(item.id);
      const newFlat = ctx.flattenVisible();
      ctx.rerenderVirtual(newFlat);
    });

    row.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (ctx.onTopicContextMenu) ctx.onTopicContextMenu(e, item.id);
    });

  } else {
    // Chat row — name only, no chevron
    const name = document.createElement('span');
    name.className   = 'tree-virtual-row__name';
    name.textContent = item.data.title || 'Untitled';
    row.appendChild(name);

    row.addEventListener('click', (e) => {
      e.stopPropagation();
      ctx.setSelectedNode(item.id);
      if (ctx.onChatClick) ctx.onChatClick(item.id, item.data.topicId);
    });

    row.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (ctx.onChatContextMenu) ctx.onChatContextMenu(e, item.id);
    });
  }

  return row;
}

/**
 * Mount virtual scrolling on `container` for `flatNodes`.
 * Tears down `prevHandler` (pass `null` if none).
 * Returns the new scroll handler — the caller must store it for future teardown.
 *
 * @param {HTMLElement}   container
 * @param {FlatNode[]}    flatNodes
 * @param {Function|null} prevHandler  — existing scroll listener to remove
 * @param {VirtualCtx}    ctx
 * @returns {Function}   new scroll handler
 */
export function startVirtualScroll(container, flatNodes, prevHandler, ctx) {
  if (prevHandler) {
    container.removeEventListener('scroll', prevHandler);
  }

  container.classList.add('tree-virtual-container');
  container.innerHTML = '';

  // Sizer gives the scrollbar the correct total height
  const sizer = document.createElement('div');
  sizer.className    = 'tree-virtual-sizer';
  sizer.style.height = `${flatNodes.length * ITEM_HEIGHT}px`;
  container.appendChild(sizer);

  // Viewport: the translated slice container
  const viewport = document.createElement('div');
  viewport.className = 'tree-virtual-viewport';
  container.appendChild(viewport);

  const renderSlice = () => {
    const scrollTop    = container.scrollTop;
    const clientHeight = container.clientHeight || 400;
    const startIdx     = Math.max(0, Math.floor(scrollTop / ITEM_HEIGHT) - BUFFER);
    const visibleCount = Math.ceil(clientHeight / ITEM_HEIGHT);
    const endIdx       = Math.min(flatNodes.length, startIdx + visibleCount + BUFFER * 2);

    viewport.style.transform = `translateY(${startIdx * ITEM_HEIGHT}px)`;
    viewport.innerHTML = '';
    for (let i = startIdx; i < endIdx; i++) {
      viewport.appendChild(renderVirtualRow(flatNodes[i], ctx));
    }
  };

  renderSlice();

  container.addEventListener('scroll', renderSlice, { passive: true });
  return renderSlice;
}
