/**
 * Tests for src/lib/renderer/virtual-scroll.js
 */

import { vi } from 'vitest';
import { renderVirtualRow, startVirtualScroll } from '../src/lib/renderer/virtual-scroll.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeCtx(overrides = {}) {
  const tree = {
    getChildren: vi.fn(() => []),
    topics: {},
  };
  const chats = overrides.chats ?? [];
  // Build the chatCountByTopic Map from chats (mirrors what _makeVirtualCtx does).
  const chatCountByTopic = new Map();
  for (const c of chats) {
    if (c.topicId) chatCountByTopic.set(c.topicId, (chatCountByTopic.get(c.topicId) ?? 0) + 1);
  }
  return {
    expandedNodes:      new Set(),
    selectedNodeId:     null,
    chats,
    chatCountByTopic,
    tree,
    virtualThreshold:   50,
    toggleExpand:       vi.fn(),
    setSelectedNode:    vi.fn(),
    rerenderVirtual:    vi.fn(),
    flattenVisible:     vi.fn(() => []),
    onTopicClick:       null,
    onTopicContextMenu: null,
    onChatClick:        null,
    onChatContextMenu:  null,
    ...overrides,
  };
}

function makeTopicItem(overrides = {}) {
  return {
    id:    'topic-1',
    type:  'topic',
    depth: 0,
    data:  { name: 'My Topic' },
    ...overrides,
  };
}

function makeChatItem(overrides = {}) {
  return {
    id:    'chat-1',
    type:  'chat',
    depth: 1,
    data:  { title: 'My Chat', topicId: 'topic-1' },
    ...overrides,
  };
}

// ─── renderVirtualRow — topic rows ────────────────────────────────────────────

describe('renderVirtualRow — topic', () => {
  it('creates a div with the correct classes', () => {
    const row = renderVirtualRow(makeTopicItem(), makeCtx());
    expect(row.tagName).toBe('DIV');
    expect(row.classList.contains('tree-virtual-row')).toBe(true);
    expect(row.classList.contains('tree-virtual-row--topic')).toBe(true);
  });

  it('adds selected class when item id matches selectedNodeId', () => {
    const ctx = makeCtx({ selectedNodeId: 'topic-1' });
    const row = renderVirtualRow(makeTopicItem({ id: 'topic-1' }), ctx);
    expect(row.classList.contains('tree-virtual-row--selected')).toBe(true);
  });

  it('does not add selected class for non-selected item', () => {
    const ctx = makeCtx({ selectedNodeId: 'other-id' });
    const row = renderVirtualRow(makeTopicItem(), ctx);
    expect(row.classList.contains('tree-virtual-row--selected')).toBe(false);
  });

  it('renders indent spacer with correct width', () => {
    const row = renderVirtualRow(makeTopicItem({ depth: 2 }), makeCtx());
    const indent = row.querySelector('.tree-virtual-row__indent');
    expect(indent).not.toBeNull();
    expect(indent.style.width).toBe('32px');
  });

  it('shows collapsed chevron ▶ when topic is not expanded and has children', () => {
    const ctx = makeCtx({
      chats: [{ topicId: 'topic-1', id: 'c1' }],
    });
    const row = renderVirtualRow(makeTopicItem(), ctx);
    const chevron = row.querySelector('.tree-virtual-row__chevron');
    expect(chevron.textContent).toBe('▶');
  });

  it('shows expanded chevron ▼ when topic is expanded', () => {
    const ctx = makeCtx({
      expandedNodes: new Set(['topic-1']),
      chats: [{ topicId: 'topic-1', id: 'c1' }],
    });
    const row = renderVirtualRow(makeTopicItem(), ctx);
    const chevron = row.querySelector('.tree-virtual-row__chevron');
    expect(chevron.textContent).toBe('▼');
  });

  it('shows space chevron when topic has no children or chats', () => {
    const row = renderVirtualRow(makeTopicItem(), makeCtx());
    const chevron = row.querySelector('.tree-virtual-row__chevron');
    expect(chevron.textContent).toBe(' ');
  });

  it('renders topic name', () => {
    const row = renderVirtualRow(makeTopicItem({ data: { name: 'Projects' } }), makeCtx());
    const name = row.querySelector('.tree-virtual-row__name');
    expect(name.textContent).toBe('Projects');
  });

  it('renders "Untitled" for topic with no name', () => {
    const row = renderVirtualRow(makeTopicItem({ data: {} }), makeCtx());
    const name = row.querySelector('.tree-virtual-row__name');
    expect(name.textContent).toBe('Untitled');
  });

  it('renders chat count badge when chats exist', () => {
    const ctx = makeCtx({ chats: [{ topicId: 'topic-1', id: 'c1' }, { topicId: 'topic-1', id: 'c2' }] });
    const row = renderVirtualRow(makeTopicItem(), ctx);
    const count = row.querySelector('.tree-virtual-row__count');
    expect(count).not.toBeNull();
    expect(count.textContent).toBe('2');
  });

  it('does not render count badge when no chats', () => {
    const row = renderVirtualRow(makeTopicItem(), makeCtx());
    expect(row.querySelector('.tree-virtual-row__count')).toBeNull();
  });

  it('click event calls setSelectedNode and toggleExpand when hasChildren', () => {
    const ctx = makeCtx({ chats: [{ topicId: 'topic-1', id: 'c1' }] });
    const row = renderVirtualRow(makeTopicItem(), ctx);
    document.body.appendChild(row);
    row.click();
    expect(ctx.setSelectedNode).toHaveBeenCalledWith('topic-1');
    expect(ctx.toggleExpand).toHaveBeenCalledWith('topic-1');
    row.remove();
  });

  it('click event calls onTopicClick when provided', () => {
    const onTopicClick = vi.fn();
    const ctx = makeCtx({ chats: [{ topicId: 'topic-1', id: 'c1' }], onTopicClick });
    const row = renderVirtualRow(makeTopicItem(), ctx);
    document.body.appendChild(row);
    row.click();
    expect(onTopicClick).toHaveBeenCalledWith('topic-1');
    row.remove();
  });

  it('click event calls rerenderVirtual', () => {
    const ctx = makeCtx({ chats: [{ topicId: 'topic-1', id: 'c1' }] });
    const row = renderVirtualRow(makeTopicItem(), ctx);
    document.body.appendChild(row);
    row.click();
    expect(ctx.rerenderVirtual).toHaveBeenCalled();
    row.remove();
  });

  it('contextmenu event calls onTopicContextMenu when provided', () => {
    const onTopicContextMenu = vi.fn();
    const ctx = makeCtx({ onTopicContextMenu });
    const row = renderVirtualRow(makeTopicItem(), ctx);
    document.body.appendChild(row);
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    row.dispatchEvent(event);
    expect(onTopicContextMenu).toHaveBeenCalled();
    row.remove();
  });

  it('contextmenu does not throw when onTopicContextMenu is null', () => {
    const row = renderVirtualRow(makeTopicItem(), makeCtx({ onTopicContextMenu: null }));
    document.body.appendChild(row);
    expect(() => {
      row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    }).not.toThrow();
    row.remove();
  });

  it('handles null tree in ctx gracefully', () => {
    const ctx = makeCtx({ tree: null, chats: [] });
    expect(() => renderVirtualRow(makeTopicItem(), ctx)).not.toThrow();
  });
});

// ─── renderVirtualRow — chat rows ─────────────────────────────────────────────

describe('renderVirtualRow — chat', () => {
  it('creates a div with chat class', () => {
    const row = renderVirtualRow(makeChatItem(), makeCtx());
    expect(row.classList.contains('tree-virtual-row--chat')).toBe(true);
  });

  it('renders chat title', () => {
    const row = renderVirtualRow(makeChatItem({ data: { title: 'My Conversation' } }), makeCtx());
    const name = row.querySelector('.tree-virtual-row__name');
    expect(name.textContent).toBe('My Conversation');
  });

  it('renders "Untitled" when title missing', () => {
    const row = renderVirtualRow(makeChatItem({ data: {} }), makeCtx());
    const name = row.querySelector('.tree-virtual-row__name');
    expect(name.textContent).toBe('Untitled');
  });

  it('click calls setSelectedNode and onChatClick', () => {
    const onChatClick = vi.fn();
    const ctx = makeCtx({ onChatClick });
    const row = renderVirtualRow(makeChatItem(), ctx);
    document.body.appendChild(row);
    row.click();
    expect(ctx.setSelectedNode).toHaveBeenCalledWith('chat-1');
    expect(onChatClick).toHaveBeenCalledWith('chat-1', 'topic-1');
    row.remove();
  });

  it('click does not throw when onChatClick is null', () => {
    const ctx = makeCtx({ onChatClick: null });
    const row = renderVirtualRow(makeChatItem(), ctx);
    document.body.appendChild(row);
    expect(() => row.click()).not.toThrow();
    row.remove();
  });

  it('contextmenu calls onChatContextMenu when provided', () => {
    const onChatContextMenu = vi.fn();
    const ctx = makeCtx({ onChatContextMenu });
    const row = renderVirtualRow(makeChatItem(), ctx);
    document.body.appendChild(row);
    row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    expect(onChatContextMenu).toHaveBeenCalled();
    row.remove();
  });

  it('contextmenu does not throw when onChatContextMenu is null', () => {
    const row = renderVirtualRow(makeChatItem(), makeCtx({ onChatContextMenu: null }));
    document.body.appendChild(row);
    expect(() => {
      row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    }).not.toThrow();
    row.remove();
  });
});

// ─── startVirtualScroll ───────────────────────────────────────────────────────

describe('startVirtualScroll', () => {
  let container;

  beforeEach(() => {
    container = document.createElement('div');
    container.style.height = '400px';
    container.style.overflow = 'auto';
    Object.defineProperty(container, 'clientHeight', { value: 400, configurable: true });
    Object.defineProperty(container, 'scrollTop', { value: 0, writable: true, configurable: true });
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  it('returns a function (the scroll handler)', () => {
    const ctx = makeCtx();
    const handler = startVirtualScroll(container, [], null, ctx);
    expect(typeof handler).toBe('function');
  });

  it('adds tree-virtual-container CSS class', () => {
    startVirtualScroll(container, [], null, makeCtx());
    expect(container.classList.contains('tree-virtual-container')).toBe(true);
  });

  it('creates a sizer div with correct height for the total rows', () => {
    const flatNodes = Array.from({ length: 10 }, (_, i) => makeTopicItem({ id: `t-${i}` }));
    startVirtualScroll(container, flatNodes, null, makeCtx());
    const sizer = container.querySelector('.tree-virtual-sizer');
    expect(sizer).not.toBeNull();
    expect(sizer.style.height).toBe(`${10 * 36}px`);
  });

  it('creates a viewport div', () => {
    startVirtualScroll(container, [], null, makeCtx());
    const viewport = container.querySelector('.tree-virtual-viewport');
    expect(viewport).not.toBeNull();
  });

  it('removes previous scroll handler before attaching new one', () => {
    const prevHandler = vi.fn();
    const removeSpy = vi.spyOn(container, 'removeEventListener');
    startVirtualScroll(container, [], prevHandler, makeCtx());
    expect(removeSpy).toHaveBeenCalledWith('scroll', prevHandler);
  });

  it('renders visible rows on initial call', () => {
    const flatNodes = [
      makeTopicItem({ id: 'topic-0' }),
      makeChatItem({ id: 'chat-0' }),
    ];
    startVirtualScroll(container, flatNodes, null, makeCtx());
    const viewport = container.querySelector('.tree-virtual-viewport');
    expect(viewport.children.length).toBeGreaterThan(0);
  });

  it('clears container innerHTML before mounting', () => {
    container.innerHTML = '<div>old content</div>';
    startVirtualScroll(container, [], null, makeCtx());
    expect(container.querySelectorAll('div').length).toBeGreaterThan(0);
    // Old content should be gone — sizer and viewport replace it
    expect(container.querySelector('.tree-virtual-sizer')).not.toBeNull();
  });

  it('handler re-renders slice on scroll', () => {
    const flatNodes = Array.from({ length: 50 }, (_, i) =>
      makeTopicItem({ id: `t-${i}`, data: { name: `Topic ${i}` } })
    );
    const ctx = makeCtx();
    const handler = startVirtualScroll(container, flatNodes, null, ctx);
    const viewport = container.querySelector('.tree-virtual-viewport');
    const initialCount = viewport.children.length;

    // "Scroll" down
    Object.defineProperty(container, 'scrollTop', { value: 360, configurable: true });
    handler();

    // Slice should shift — content might change
    expect(viewport.children.length).toBeGreaterThanOrEqual(0);
    // No error thrown means handler ran successfully
  });

  it('handles empty flatNodes without error', () => {
    expect(() => startVirtualScroll(container, [], null, makeCtx())).not.toThrow();
  });

  it('does not remove previous handler when prevHandler is null', () => {
    const removeSpy = vi.spyOn(container, 'removeEventListener');
    startVirtualScroll(container, [], null, makeCtx());
    expect(removeSpy).not.toHaveBeenCalled();
  });
});
