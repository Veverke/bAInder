/**
 * Tests for:
 *   src/lib/renderer/chat-item-builder.js
 *   src/lib/renderer/topic-node-builder.js
 */

import { vi } from 'vitest';

// Mock sparkline so we don't need SVG createElementNS to work perfectly
vi.mock('../src/lib/renderer/sparkline.js', () => ({
  buildSparklineEl: vi.fn(() => {
    const el = document.createElement('span');
    el.className = 'tree-sparkline';
    return el;
  }),
}));

import { buildChatItem }  from '../src/lib/renderer/chat-item-builder.js';
import { buildTopicNode } from '../src/lib/renderer/topic-node-builder.js';
import { buildSparklineEl } from '../src/lib/renderer/sparkline.js';

// ─── Context factories ────────────────────────────────────────────────────────

function makeCtx(overrides = {}) {
  const container = document.createElement('ul');
  document.body.appendChild(container);
  return {
    nodeIndex:         { value: 0 },
    multiSelectMode:   false,
    selectedChatIds:   new Set(),
    selectedNodeId:    null,
    expandedNodes:     new Set(),
    chats:             [],
    tree:              { topics: {}, getChildren: vi.fn(() => []) },
    container,
    getDrag:           vi.fn(() => null),
    setDrag:           vi.fn(),
    onChatClick:       null,
    onChatContextMenu: null,
    onChatDrop:        null,
    onTopicClick:      null,
    onTopicContextMenu: null,
    onTopicPin:        null,
    onTopicDrop:       null,
    toggleChatSelection: vi.fn(),
    toggleNode:        vi.fn(),
    selectNode:        vi.fn(),
    ...overrides,
  };
}

function makeChat(overrides = {}) {
  return {
    id:        'chat-1',
    title:     'My Chat',
    source:    'chatgpt',
    timestamp: 1700000000000,
    tags:      [],
    rating:    0,
    flaggedAsStale: false,
    metadata:  {},
    ...overrides,
  };
}

function makeTopic(overrides = {}) {
  return {
    id:       'topic-1',
    name:     'My Topic',
    children: [],
    chatIds:  [],
    pinned:   false,
    getDateRangeString: vi.fn(() => ''),
    ...overrides,
  };
}

// ─── buildChatItem ────────────────────────────────────────────────────────────

describe('buildChatItem', () => {
  let ctx;

  beforeEach(() => {
    ctx = makeCtx();
  });

  afterEach(() => {
    ctx.container.remove();
  });

  it('returns an <li> element', () => {
    const li = buildChatItem(makeChat(), 0, ctx);
    expect(li.tagName).toBe('LI');
    expect(li.classList.contains('tree-chat-item')).toBe(true);
  });

  it('sets data-chat-id attribute', () => {
    const li = buildChatItem(makeChat({ id: 'abc-123' }), 0, ctx);
    expect(li.getAttribute('data-chat-id')).toBe('abc-123');
  });

  it('sets data-source attribute', () => {
    const li = buildChatItem(makeChat({ source: 'claude' }), 0, ctx);
    expect(li.getAttribute('data-source')).toBe('claude');
  });

  it('uses "unknown" source when source is missing', () => {
    const li = buildChatItem(makeChat({ source: undefined }), 0, ctx);
    expect(li.getAttribute('data-source')).toBe('unknown');
  });

  it('increments nodeIndex', () => {
    ctx.nodeIndex.value = 5;
    buildChatItem(makeChat(), 0, ctx);
    expect(ctx.nodeIndex.value).toBe(6);
  });

  it('sets paddingLeft based on level', () => {
    const li = buildChatItem(makeChat(), 3, ctx);
    const content = li.querySelector('.tree-node-content');
    expect(content.style.paddingLeft).toBe('60px');
  });

  it('renders chat title in label text', () => {
    const li = buildChatItem(makeChat({ title: 'Special Chat' }), 0, ctx);
    const labelText = li.querySelector('.tree-label-text');
    expect(labelText.textContent).toBe('Special Chat');
  });

  it('renders "Untitled Chat" when title is missing', () => {
    const li = buildChatItem(makeChat({ title: '' }), 0, ctx);
    const labelText = li.querySelector('.tree-label-text');
    expect(labelText.textContent).toBe('Untitled Chat');
  });

  it('renders source chip for regular chat', () => {
    const li = buildChatItem(makeChat({ source: 'chatgpt' }), 0, ctx);
    const chip = li.querySelector('.tree-source-chip');
    expect(chip).not.toBeNull();
    expect(chip.textContent).toBe('ChatGPT');
  });

  it('does NOT render source chip for excerpt', () => {
    const li = buildChatItem(makeChat({ metadata: { isExcerpt: true } }), 0, ctx);
    expect(li.querySelector('.tree-source-chip')).toBeNull();
  });

  it('does NOT render source chip for assembled chat', () => {
    const li = buildChatItem(makeChat({ metadata: { isAssembled: true } }), 0, ctx);
    expect(li.querySelector('.tree-source-chip')).toBeNull();
  });

  it('renders correct icon for regular chat (💬)', () => {
    const li = buildChatItem(makeChat(), 0, ctx);
    const icon = li.querySelector('.tree-icon');
    expect(icon.textContent).toBe('💬');
  });

  it('renders correct icon for excerpt (✂️)', () => {
    const li = buildChatItem(makeChat({ metadata: { isExcerpt: true } }), 0, ctx);
    const icon = li.querySelector('.tree-icon');
    expect(icon.textContent).toBe('✂️');
  });

  it('renders correct icon for assembled chat (🔗)', () => {
    const li = buildChatItem(makeChat({ metadata: { isAssembled: true } }), 0, ctx);
    const icon = li.querySelector('.tree-icon');
    expect(icon.textContent).toBe('🔗');
  });

  it('renders date badge when timestamp is provided', () => {
    const li = buildChatItem(makeChat({ timestamp: 1700000000000 }), 0, ctx);
    const badge = li.querySelector('.tree-timespan');
    expect(badge).not.toBeNull();
    expect(badge.textContent.length).toBeGreaterThan(0);
  });

  it('does not render date badge when timestamp is missing', () => {
    const li = buildChatItem(makeChat({ timestamp: undefined }), 0, ctx);
    expect(li.querySelector('.tree-timespan')).toBeNull();
  });

  it('renders star rating badge', () => {
    const li = buildChatItem(makeChat({ rating: 3 }), 0, ctx);
    const badge = li.querySelector('.tree-rating-badge');
    expect(badge).not.toBeNull();
    expect(badge.textContent).toBe('★★★');
  });

  it('does not render rating badge when rating is 0', () => {
    const li = buildChatItem(makeChat({ rating: 0 }), 0, ctx);
    expect(li.querySelector('.tree-rating-badge')).toBeNull();
  });

  it('renders stale badge when flaggedAsStale is true', () => {
    const li = buildChatItem(makeChat({ flaggedAsStale: true }), 0, ctx);
    const badge = li.querySelector('.tree-stale-badge');
    expect(badge).not.toBeNull();
    expect(badge.textContent).toBe('⚠');
  });

  it('stale badge title includes reviewDate when provided', () => {
    const li = buildChatItem(makeChat({ flaggedAsStale: true, reviewDate: '2026-01-01' }), 0, ctx);
    const badge = li.querySelector('.tree-stale-badge');
    expect(badge.title).toContain('2026-01-01');
  });

  it('renders tag chips when tags are present', () => {
    const li = buildChatItem(makeChat({ tags: ['ai', 'code'] }), 0, ctx);
    const chips = li.querySelectorAll('.tree-tag-chip');
    expect(chips.length).toBe(2);
    expect(chips[0].textContent).toBe('ai');
    expect(chips[1].textContent).toBe('code');
  });

  it('renders a spacer (not checkbox) in normal mode', () => {
    const li = buildChatItem(makeChat(), 0, ctx);
    expect(li.querySelector('.tree-expand-spacer')).not.toBeNull();
    expect(li.querySelector('.tree-chat-checkbox')).toBeNull();
  });

  it('renders checkbox in multi-select mode', () => {
    const ctxMs = makeCtx({ multiSelectMode: true });
    const li = buildChatItem(makeChat(), 0, ctxMs);
    const cb = li.querySelector('.tree-chat-checkbox');
    expect(cb).not.toBeNull();
    expect(cb.type).toBe('checkbox');
    ctxMs.container.remove();
  });

  it('checkbox is checked when chat is in selectedChatIds', () => {
    const ctxMs = makeCtx({
      multiSelectMode:  true,
      selectedChatIds:  new Set(['chat-1']),
    });
    const li = buildChatItem(makeChat({ id: 'chat-1' }), 0, ctxMs);
    const cb = li.querySelector('.tree-chat-checkbox');
    expect(cb.checked).toBe(true);
    ctxMs.container.remove();
  });

  it('adds tree-chat-item--selected class when chat is selected in multi-select mode', () => {
    const ctxMs = makeCtx({
      multiSelectMode:  true,
      selectedChatIds:  new Set(['chat-1']),
    });
    const li = buildChatItem(makeChat({ id: 'chat-1' }), 0, ctxMs);
    expect(li.classList.contains('tree-chat-item--selected')).toBe(true);
    ctxMs.container.remove();
  });

  it('click toggles chat selection in multi-select mode', () => {
    const ctxMs = makeCtx({ multiSelectMode: true });
    const li = buildChatItem(makeChat(), 0, ctxMs);
    document.body.appendChild(li);
    li.click();
    expect(ctxMs.toggleChatSelection).toHaveBeenCalledWith('chat-1');
    li.remove();
    ctxMs.container.remove();
  });

  it('click calls onChatClick in normal mode', () => {
    const onChatClick = vi.fn();
    const ctxClick = makeCtx({ onChatClick });
    const li = buildChatItem(makeChat(), 0, ctxClick);
    document.body.appendChild(li);
    li.click();
    expect(onChatClick).toHaveBeenCalled();
    li.remove();
    ctxClick.container.remove();
  });

  it('renders more-actions button', () => {
    const li = buildChatItem(makeChat(), 0, ctx);
    const btn = li.querySelector('.tree-more-btn');
    expect(btn).not.toBeNull();
    expect(btn.textContent).toBe('⋮');
  });

  it('more-actions button click calls onChatContextMenu', () => {
    const onChatContextMenu = vi.fn();
    const ctxCtx = makeCtx({ onChatContextMenu });
    const li = buildChatItem(makeChat(), 0, ctxCtx);
    document.body.appendChild(li);
    const btn = li.querySelector('.tree-more-btn');
    btn.click();
    expect(onChatContextMenu).toHaveBeenCalled();
    li.remove();
    ctxCtx.container.remove();
  });

  it('contextmenu event calls onChatContextMenu', () => {
    const onChatContextMenu = vi.fn();
    const ctxCtx = makeCtx({ onChatContextMenu });
    const li = buildChatItem(makeChat(), 0, ctxCtx);
    document.body.appendChild(li);
    const content = li.querySelector('.tree-node-content');
    content.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    expect(onChatContextMenu).toHaveBeenCalled();
    li.remove();
    ctxCtx.container.remove();
  });

  it('checkbox click calls toggleChatSelection and stops propagation', () => {
    const ctxMs = makeCtx({ multiSelectMode: true });
    const li = buildChatItem(makeChat(), 0, ctxMs);
    document.body.appendChild(li);
    const cb = li.querySelector('.tree-chat-checkbox');
    cb.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(ctxMs.toggleChatSelection).toHaveBeenCalledWith('chat-1');
    li.remove();
    ctxMs.container.remove();
  });

  it('unknown source renders raw source value as chip text', () => {
    const li = buildChatItem(makeChat({ source: 'grok' }), 0, ctx);
    const chip = li.querySelector('.tree-source-chip');
    expect(chip.textContent).toBe('grok');
  });

  // ── Drag events ───────────────────────────────────────────────────────────

  it('dragstart sets drag state and dataTransfer', () => {
    const li = buildChatItem(makeChat({ id: 'drag-chat' }), 0, ctx);
    document.body.appendChild(li);
    const content = li.querySelector('.tree-node-content');
    const dt = { effectAllowed: '', setData: vi.fn(), setDragImage: vi.fn() };
    const event = new MouseEvent('dragstart', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'dataTransfer', { value: dt, writable: true });
    content.dispatchEvent(event);
    expect(ctx.setDrag).toHaveBeenCalledWith({ type: 'chat', id: 'drag-chat' });
    li.remove();
  });

  it('dragend clears drag state and removes dragging class', () => {
    const li = buildChatItem(makeChat(), 0, ctx);
    document.body.appendChild(li);
    const content = li.querySelector('.tree-node-content');
    content.classList.add('dragging');
    content.dispatchEvent(new MouseEvent('dragend', { bubbles: true }));
    expect(ctx.setDrag).toHaveBeenCalledWith(null);
    expect(content.classList.contains('dragging')).toBe(false);
    li.remove();
  });

  it('more-actions button does not call onChatContextMenu when handler is null', () => {
    const li = buildChatItem(makeChat(), 0, ctx);
    document.body.appendChild(li);
    const btn = li.querySelector('.tree-more-btn');
    expect(() => btn.click()).not.toThrow();
    li.remove();
  });

  it('stale badge title uses fallback message when reviewDate is absent', () => {
    const li = buildChatItem(makeChat({ flaggedAsStale: true, reviewDate: undefined }), 0, ctx);
    const badge = li.querySelector('.tree-stale-badge');
    expect(badge.title).toContain('stale');
  });

  it('rating badge singular for 1 star', () => {
    const li = buildChatItem(makeChat({ rating: 1 }), 0, ctx);
    const badge = li.querySelector('.tree-rating-badge');
    expect(badge.title).toBe('1 star');
  });

  it('mouseenter shows overlay when tags are present', () => {
    const li = buildChatItem(makeChat({ tags: ['ai'] }), 0, ctx);
    document.body.appendChild(li);
    const content = li.querySelector('.tree-node-content');
    content.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    const overlay = document.querySelector('.tree-chat-hover-overlay');
    expect(overlay).not.toBeNull();
    li.remove();
    overlay?.remove();
  });

  it('mouseleave removes overlay', () => {
    const li = buildChatItem(makeChat({ tags: ['ts'] }), 0, ctx);
    document.body.appendChild(li);
    const content = li.querySelector('.tree-node-content');
    content.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    content.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
    const overlay = document.querySelector('.tree-chat-hover-overlay');
    expect(overlay).toBeNull();
    li.remove();
  });
});

// ─── buildTopicNode ───────────────────────────────────────────────────────────

describe('buildTopicNode', () => {
  let ctx;

  beforeEach(() => {
    ctx = makeCtx();
  });

  afterEach(() => {
    ctx.container.remove();
  });

  it('returns an <li> element', () => {
    const li = buildTopicNode(makeTopic(), 0, ctx);
    expect(li.tagName).toBe('LI');
  });

  it('adds tree-node--card class for root-level topics', () => {
    const li = buildTopicNode(makeTopic(), 0, ctx);
    expect(li.classList.contains('tree-node--card')).toBe(true);
  });

  it('does not add tree-node--card class for nested topics', () => {
    const li = buildTopicNode(makeTopic(), 1, ctx);
    expect(li.classList.contains('tree-node--card')).toBe(false);
  });

  it('sets data-topic-id attribute', () => {
    const li = buildTopicNode(makeTopic({ id: 'my-topic' }), 0, ctx);
    expect(li.dataset.topicId).toBe('my-topic');
  });

  it('adds "selected" class when selectedNodeId matches', () => {
    const ctxSel = makeCtx({ selectedNodeId: 'topic-1' });
    const li = buildTopicNode(makeTopic({ id: 'topic-1' }), 0, ctxSel);
    expect(li.classList.contains('selected')).toBe(true);
    ctxSel.container.remove();
  });

  it('renders topic name', () => {
    const li = buildTopicNode(makeTopic({ name: 'Work Projects' }), 0, ctx);
    const labelText = li.querySelector('.tree-label-text');
    expect(labelText.textContent).toBe('Work Projects');
  });

  it('renders expand button when topic has children', () => {
    const ctxTree = makeCtx({
      tree: {
        topics: { 'child-1': makeTopic({ id: 'child-1', name: 'Child' }) },
        getChildren: vi.fn(() => ['child-1']),
      },
    });
    const topicWithChildren = makeTopic({ children: ['child-1'] });
    const li = buildTopicNode(topicWithChildren, 0, ctxTree);
    const btn = li.querySelector('.tree-expand-btn');
    expect(btn).not.toBeNull();
    ctxTree.container.remove();
  });

  it('renders spacer when topic has no children', () => {
    const li = buildTopicNode(makeTopic(), 0, ctx);
    expect(li.querySelector('.tree-expand-spacer')).not.toBeNull();
    expect(li.querySelector('.tree-expand-btn')).toBeNull();
  });

  it('expand button shows ▼ when topic is expanded', () => {
    const ctxExp = makeCtx({ expandedNodes: new Set(['topic-1']) });
    const topicWithChats = makeTopic({ chatIds: ['c1'] });
    ctxExp.chats = [{ topicId: 'topic-1', id: 'c1' }];
    const li = buildTopicNode(topicWithChats, 0, ctxExp);
    const btn = li.querySelector('.tree-expand-btn');
    expect(btn?.innerHTML).toBe('▼');
    ctxExp.container.remove();
  });

  it('expand button calls toggleNode on click', () => {
    const ctxExp = makeCtx({ chats: [{ topicId: 'topic-1', id: 'c1' }] });
    const topic = makeTopic({ chatIds: ['c1'] });
    const li = buildTopicNode(topic, 0, ctxExp);
    document.body.appendChild(li);
    const btn = li.querySelector('.tree-expand-btn');
    if (btn) {
      btn.click();
      expect(ctxExp.toggleNode).toHaveBeenCalledWith('topic-1');
    }
    li.remove();
    ctxExp.container.remove();
  });

  it('renders icon 📁 when topic has children', () => {
    const ctxChat = makeCtx({ chats: [{ topicId: 'topic-1', id: 'c1' }] });
    const topic = makeTopic({ chatIds: ['c1'] });
    const li = buildTopicNode(topic, 0, ctxChat);
    const icon = li.querySelector('.tree-icon');
    expect(icon.textContent).toBe('📁');
    ctxChat.container.remove();
  });

  it('renders icon 📄 when topic has no children', () => {
    const li = buildTopicNode(makeTopic(), 0, ctx);
    const icon = li.querySelector('.tree-icon');
    expect(icon.textContent).toBe('📄');
  });

  it('renders timespan badge when getDateRangeString returns non-empty', () => {
    const topic = makeTopic({ getDateRangeString: vi.fn(() => 'Jan 2026 – Mar 2026') });
    const li = buildTopicNode(topic, 0, ctx);
    const badge = li.querySelector('.tree-timespan');
    expect(badge).not.toBeNull();
    expect(badge.textContent).toBe('Jan 2026 – Mar 2026');
  });

  it('does not render timespan badge when getDateRangeString returns empty', () => {
    const li = buildTopicNode(makeTopic(), 0, ctx);
    expect(li.querySelector('.tree-timespan')).toBeNull();
  });

  it('renders chat count badge when chatIds are present', () => {
    const topic = makeTopic({ chatIds: ['c1', 'c2'] });
    const li = buildTopicNode(topic, 0, ctx);
    const badge = li.querySelector('.tree-chat-count');
    expect(badge).not.toBeNull();
    expect(badge.textContent).toBe('2');
  });

  it('renders sparkline for root-level topics with chats', () => {
    const ctxChat = makeCtx({ chats: [{ topicId: 'topic-1', id: 'c1', timestamp: Date.now() }] });
    const topic = makeTopic({ chatIds: ['c1'] });
    const li = buildTopicNode(topic, 0, ctxChat);
    expect(li.querySelector('.tree-sparkline')).not.toBeNull();
    ctxChat.container.remove();
  });

  it('does not render sparkline for nested topics', () => {
    const ctxChat = makeCtx({ chats: [{ topicId: 'topic-1', id: 'c1' }] });
    const topic = makeTopic({ chatIds: ['c1'] });
    buildSparklineEl.mockClear();
    buildTopicNode(topic, 1, ctxChat);
    // sparkline won't be called for level > 0
    expect(buildSparklineEl).not.toHaveBeenCalled();
    ctxChat.container.remove();
  });

  it('renders pin button for root-level topics', () => {
    const li = buildTopicNode(makeTopic(), 0, ctx);
    const pinBtn = li.querySelector('.tree-pin-btn');
    expect(pinBtn).not.toBeNull();
  });

  it('does not render pin button for nested topics', () => {
    const li = buildTopicNode(makeTopic(), 2, ctx);
    expect(li.querySelector('.tree-pin-btn')).toBeNull();
  });

  it('pin button has active class when topic is pinned', () => {
    const li = buildTopicNode(makeTopic({ pinned: true }), 0, ctx);
    const pinBtn = li.querySelector('.tree-pin-btn');
    expect(pinBtn.classList.contains('tree-pin-btn--active')).toBe(true);
  });

  it('pin button click calls onTopicPin', () => {
    const onTopicPin = vi.fn();
    const ctxPin = makeCtx({ onTopicPin });
    const li = buildTopicNode(makeTopic(), 0, ctxPin);
    document.body.appendChild(li);
    const pinBtn = li.querySelector('.tree-pin-btn');
    pinBtn.click();
    expect(onTopicPin).toHaveBeenCalledWith('topic-1', true); // toggle pinned from false → true
    li.remove();
    ctxPin.container.remove();
  });

  it('renders more-actions button', () => {
    const li = buildTopicNode(makeTopic(), 0, ctx);
    const btn = li.querySelector('.tree-more-btn');
    expect(btn).not.toBeNull();
    expect(btn.textContent).toBe('⋮');
  });

  it('more-actions button click calls onTopicContextMenu', () => {
    const onTopicContextMenu = vi.fn();
    const ctxCtx = makeCtx({ onTopicContextMenu });
    const li = buildTopicNode(makeTopic(), 0, ctxCtx);
    document.body.appendChild(li);
    const btn = li.querySelector('.tree-more-btn');
    btn.click();
    expect(onTopicContextMenu).toHaveBeenCalled();
    li.remove();
    ctxCtx.container.remove();
  });

  it('nodeContent click calls selectNode and onTopicClick', () => {
    const onTopicClick = vi.fn();
    const ctxClick = makeCtx({ onTopicClick });
    const li = buildTopicNode(makeTopic(), 0, ctxClick);
    document.body.appendChild(li);
    const nodeContent = li.querySelector('.tree-node-content');
    nodeContent.click();
    expect(ctxClick.selectNode).toHaveBeenCalledWith('topic-1');
    expect(onTopicClick).toHaveBeenCalled();
    li.remove();
    ctxClick.container.remove();
  });

  it('contextmenu on nodeContent calls onTopicContextMenu', () => {
    const onTopicContextMenu = vi.fn();
    const ctxCtx = makeCtx({ onTopicContextMenu });
    const li = buildTopicNode(makeTopic(), 0, ctxCtx);
    document.body.appendChild(li);
    const nodeContent = li.querySelector('.tree-node-content');
    nodeContent.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    expect(onTopicContextMenu).toHaveBeenCalled();
    li.remove();
    ctxCtx.container.remove();
  });

  it('renders children list when expanded', () => {
    const childChat = { id: 'c1', topicId: 'topic-1' };
    const ctxExp = makeCtx({
      expandedNodes: new Set(['topic-1']),
      chats:         [childChat],
    });
    const topic = makeTopic({ chatIds: ['c1'] });
    topic.children = [];
    const li = buildTopicNode(topic, 0, ctxExp);
    const ul = li.querySelector('.tree-children');
    expect(ul).not.toBeNull();
    ctxExp.container.remove();
  });

  it('does not render children list when collapsed', () => {
    const ctxCol = makeCtx({ chats: [{ id: 'c1', topicId: 'topic-1' }] });
    const topic = makeTopic({ chatIds: ['c1'] });
    const li = buildTopicNode(topic, 0, ctxCol);
    expect(li.querySelector('.tree-children')).toBeNull();
    ctxCol.container.remove();
  });

  it('sets aria-expanded when topic has children', () => {
    const ctxChat = makeCtx({ chats: [{ topicId: 'topic-1', id: 'c1' }] });
    const topic = makeTopic({ chatIds: ['c1'] });
    const li = buildTopicNode(topic, 0, ctxChat);
    expect(li.getAttribute('aria-expanded')).not.toBeNull();
    ctxChat.container.remove();
  });

  // ── Drag events on topic node ─────────────────────────────────────────────

  it('dragstart on topic sets drag state', () => {
    const li = buildTopicNode(makeTopic({ id: 'drag-topic' }), 0, ctx);
    document.body.appendChild(li);
    const content = li.querySelector('.tree-node-content');
    const dt = { effectAllowed: '', setData: vi.fn(), setDragImage: vi.fn() };
    const event = new MouseEvent('dragstart', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'dataTransfer', { value: dt, writable: true });
    content.dispatchEvent(event);
    expect(ctx.setDrag).toHaveBeenCalledWith({ type: 'topic', id: 'drag-topic' });
    li.remove();
  });

  it('dragend on topic clears drag state', () => {
    const li = buildTopicNode(makeTopic(), 0, ctx);
    document.body.appendChild(li);
    const content = li.querySelector('.tree-node-content');
    content.dispatchEvent(new MouseEvent('dragend', { bubbles: true }));
    expect(ctx.setDrag).toHaveBeenCalledWith(null);
    li.remove();
  });

  it('dragover on topic adds drop-target class when valid drag in progress', () => {
    const onTopicDrop = vi.fn();
    const ctxDrag = makeCtx({ getDrag: vi.fn(() => ({ type: 'chat', id: 'c1' })), onTopicDrop });
    const topic = makeTopic({ id: 'target-topic' });
    const li = buildTopicNode(topic, 0, ctxDrag);
    document.body.appendChild(li);
    const content = li.querySelector('.tree-node-content');
    const dt2 = { dropEffect: '' };
    const ev2 = new MouseEvent('dragover', { bubbles: true, cancelable: true });
    Object.defineProperty(ev2, 'dataTransfer', { value: dt2, writable: true });
    content.dispatchEvent(ev2);
    expect(content.classList.contains('drop-target')).toBe(true);
    li.remove();
    ctxDrag.container.remove();
  });

  it('drop on topic calls onChatDrop when drag type is chat', () => {
    const onChatDrop = vi.fn();
    const ctxDrag = makeCtx({
      getDrag: vi.fn(() => ({ type: 'chat', id: 'c1' })),
      onChatDrop,
    });
    const topic = makeTopic({ id: 'drop-topic' });
    const li = buildTopicNode(topic, 0, ctxDrag);
    document.body.appendChild(li);
    const content = li.querySelector('.tree-node-content');
    content.dispatchEvent(new MouseEvent('drop', { bubbles: true, cancelable: true }));
    expect(onChatDrop).toHaveBeenCalledWith('c1', 'drop-topic');
    li.remove();
    ctxDrag.container.remove();
  });

  it('drop on topic calls onTopicDrop when drag type is different topic', () => {
    const onTopicDrop = vi.fn();
    const ctxDrag = makeCtx({
      getDrag: vi.fn(() => ({ type: 'topic', id: 'other-topic' })),
      onTopicDrop,
    });
    const topic = makeTopic({ id: 'drop-topic' });
    const li = buildTopicNode(topic, 0, ctxDrag);
    document.body.appendChild(li);
    const content = li.querySelector('.tree-node-content');
    content.dispatchEvent(new MouseEvent('drop', { bubbles: true, cancelable: true }));
    expect(onTopicDrop).toHaveBeenCalledWith('other-topic', 'drop-topic');
    li.remove();
    ctxDrag.container.remove();
  });

  it('dragover is no-op when no drag in progress', () => {
    const ctxNoDrag = makeCtx({ getDrag: vi.fn(() => null) });
    const li = buildTopicNode(makeTopic(), 0, ctxNoDrag);
    document.body.appendChild(li);
    const content = li.querySelector('.tree-node-content');
    expect(() => content.dispatchEvent(new MouseEvent('dragover', { bubbles: true, cancelable: true }))).not.toThrow();
    expect(content.classList.contains('drop-target')).toBe(false);
    li.remove();
    ctxNoDrag.container.remove();
  });

  it('dragleave removes drop-target class', () => {
    const ctxDrag = makeCtx({ getDrag: vi.fn(() => ({ type: 'chat', id: 'c1' })) });
    const li = buildTopicNode(makeTopic(), 0, ctxDrag);
    document.body.appendChild(li);
    const content = li.querySelector('.tree-node-content');
    content.classList.add('drop-target');
    content.dispatchEvent(new MouseEvent('dragleave', { bubbles: true, relatedTarget: document.body }));
    expect(content.classList.contains('drop-target')).toBe(false);
    li.remove();
    ctxDrag.container.remove();
  });

  it('drop when getDrag returns null does not call any drop handler', () => {
    const onChatDrop = vi.fn();
    const onTopicDrop = vi.fn();
    const ctxNull = makeCtx({ getDrag: vi.fn(() => null), onChatDrop, onTopicDrop });
    const li = buildTopicNode(makeTopic({ id: 'drop-null' }), 0, ctxNull);
    document.body.appendChild(li);
    const content = li.querySelector('.tree-node-content');
    content.dispatchEvent(new MouseEvent('drop', { bubbles: true, cancelable: true }));
    expect(onChatDrop).not.toHaveBeenCalled();
    expect(onTopicDrop).not.toHaveBeenCalled();
    li.remove();
    ctxNull.container.remove();
  });

  it('drop with topic drag but missing onTopicDrop handler does not throw', () => {
    const ctxNoHandler = makeCtx({ getDrag: vi.fn(() => ({ type: 'topic', id: 'other' })), onTopicDrop: null });
    const li = buildTopicNode(makeTopic({ id: 'target' }), 0, ctxNoHandler);
    document.body.appendChild(li);
    const content = li.querySelector('.tree-node-content');
    expect(() => content.dispatchEvent(new MouseEvent('drop', { bubbles: true, cancelable: true }))).not.toThrow();
    li.remove();
    ctxNoHandler.container.remove();
  });

  it('drop with chat drag but missing onChatDrop handler does not throw', () => {
    const ctxNoHandler = makeCtx({ getDrag: vi.fn(() => ({ type: 'chat', id: 'c1' })), onChatDrop: null });
    const li = buildTopicNode(makeTopic({ id: 'target2' }), 0, ctxNoHandler);
    document.body.appendChild(li);
    const content = li.querySelector('.tree-node-content');
    expect(() => content.dispatchEvent(new MouseEvent('drop', { bubbles: true, cancelable: true }))).not.toThrow();
    li.remove();
    ctxNoHandler.container.remove();
  });

  it('renders children even when a childId references a missing topic (undefined branch)', () => {
    const ctxTree = makeCtx({
      expandedNodes: new Set(['parent-topic']),
      tree: {
        topics: { 'real-child': makeTopic({ id: 'real-child', name: 'Real' }) },
        getChildren: vi.fn(() => []),
      },
    });
    const topic = makeTopic({ id: 'parent-topic', children: ['missing-id', 'real-child'] });
    const li = buildTopicNode(topic, 0, ctxTree);
    // Should render without throwing even though 'missing-id' is not in topics
    expect(li.querySelector('.tree-children')).not.toBeNull();
    ctxTree.container.remove();
  });

  it('contextmenu on nodeContent does not throw when onTopicContextMenu is null', () => {
    // Tests the if(ctx.onTopicContextMenu) FALSE branch (line 153)
    const ctx = makeCtx({ onTopicContextMenu: null });
    const li = buildTopicNode(makeTopic(), 0, ctx);
    const nodeContent = li.querySelector('.tree-node-content');
    // Dispatch contextmenu — with null handler should not throw
    expect(() => nodeContent.dispatchEvent(
      new MouseEvent('contextmenu', { bubbles: true, cancelable: true })
    )).not.toThrow();
    ctx.container.remove();
  });

  it('dragleave when relatedTarget is inside nodeContent does NOT remove drop-target class', () => {
    // Tests the if(!nodeContent.contains(relatedTarget)) FALSE branch (lines 182-186)
    const ctx = makeCtx({ getDrag: vi.fn(() => ({ type: 'topic', id: 'other' })) });
    const li = buildTopicNode(makeTopic({ id: 'drag-host' }), 0, ctx);
    const nodeContent = li.querySelector('.tree-node-content');
    nodeContent.classList.add('drop-target');  // Pre-add the class

    // Create a child element inside nodeContent to act as relatedTarget
    const child = document.createElement('span');
    nodeContent.appendChild(child);

    const leaveEvent = new MouseEvent('dragleave', { bubbles: true, cancelable: true });
    Object.defineProperty(leaveEvent, 'relatedTarget', { value: child, writable: false });
    nodeContent.dispatchEvent(leaveEvent);

    // relatedTarget is inside nodeContent → class should NOT be removed
    expect(nodeContent.classList.contains('drop-target')).toBe(true);
    ctx.container.remove();
  });
});
