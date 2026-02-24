import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TreeRenderer, getTagColor } from '../src/lib/tree-renderer.js';
import { TopicTree, Topic } from '../src/lib/tree.js';

describe('TreeRenderer', () => {
  let container;
  let tree;
  let renderer;

  beforeEach(() => {
    // Create container element
    container = document.createElement('div');
    container.id = 'treeView';
    document.body.appendChild(container);

    // Create empty state element (used by renderer)
    const emptyState = document.createElement('div');
    emptyState.id = 'emptyState';
    emptyState.style.display = 'flex';
    document.body.appendChild(emptyState);

    // Create item count element
    const itemCount = document.createElement('span');
    itemCount.id = 'itemCount';
    document.body.appendChild(itemCount);

    // Create a sample tree
    tree = new TopicTree();
  });

  afterEach(() => {
    // Cleanup
    document.body.innerHTML = '';
  });

  describe('Initialization', () => {
    it('should create renderer with container', () => {
      renderer = new TreeRenderer(container);
      expect(renderer.container).toBe(container);
    });

    it('should create renderer with tree', () => {
      renderer = new TreeRenderer(container, tree);
      expect(renderer.tree).toBe(tree);
    });

    it('should initialize with empty expanded nodes', () => {
      renderer = new TreeRenderer(container);
      expect(renderer.expandedNodes.size).toBe(0);
    });

    it('should initialize with null selected node', () => {
      renderer = new TreeRenderer(container);
      expect(renderer.selectedNodeId).toBeNull();
    });
  });

  describe('Empty State', () => {
    it('should show empty state for null tree', () => {
      renderer = new TreeRenderer(container, null);
      renderer.render();
      
      expect(container.innerHTML).toBe('');
      const emptyState = document.getElementById('emptyState');
      expect(emptyState.style.display).toBe('flex');
    });

    it('should show empty state for tree with no topics', () => {
      renderer = new TreeRenderer(container, tree);
      renderer.render();
      
      expect(container.innerHTML).toBe('');
      const emptyState = document.getElementById('emptyState');
      expect(emptyState.style.display).toBe('flex');
    });
  });

  describe('Basic Rendering', () => {
    it('should render single root topic', () => {
      const topicId = tree.addTopic('Work');
      renderer = new TreeRenderer(container, tree);
      renderer.render();

      const nodes = container.querySelectorAll('.tree-node');
      expect(nodes.length).toBe(1);
      expect(nodes[0].dataset.topicId).toBe(topicId);
    });

    it('should render multiple root topics', () => {
      tree.addTopic('Work');
      tree.addTopic('Personal');
      tree.addTopic('Learning');
      renderer = new TreeRenderer(container, tree);
      renderer.render();

      const rootNodes = container.querySelectorAll('.tree-root > .tree-node');
      expect(rootNodes.length).toBe(3);
    });

    it('should render topic with correct name', () => {
      tree.addTopic('My Topic');
      renderer = new TreeRenderer(container, tree);
      renderer.render();

      const labelText = container.querySelector('.tree-label-text');
      expect(labelText.textContent).toBe('My Topic');
    });

    it('should render folder icon for topics with children', () => {
      const parentId = tree.addTopic('Parent');
      tree.addTopic('Child', parentId);
      renderer = new TreeRenderer(container, tree);
      renderer.render();

      const icon = container.querySelector('.tree-icon');
      expect(icon.textContent).toBe('📁');
    });

    it('should render document icon for topics without children', () => {
      tree.addTopic('Leaf Topic');
      renderer = new TreeRenderer(container, tree);
      renderer.render();

      const icon = container.querySelector('.tree-icon');
      expect(icon.textContent).toBe('📄');
    });

    it('should hide empty state when rendering topics', () => {
      tree.addTopic('Topic');
      renderer = new TreeRenderer(container, tree);
      renderer.render();

      const emptyState = document.getElementById('emptyState');
      expect(emptyState.style.display).toBe('none');
    });
  });

  describe('Hierarchical Rendering', () => {
    it('should not render children when node is collapsed', () => {
      const parentId = tree.addTopic('Parent');
      tree.addTopic('Child', parentId);
      renderer = new TreeRenderer(container, tree);
      renderer.render();

      const childrenContainer = container.querySelector('.tree-children');
      expect(childrenContainer).toBeNull();
    });

    it('should render children when node is expanded', () => {
      const parentId = tree.addTopic('Parent');
      const childId = tree.addTopic('Child', parentId);
      renderer = new TreeRenderer(container, tree);
      renderer.expandNode(parentId);

      const childNodes = container.querySelectorAll('.tree-node');
      expect(childNodes.length).toBe(2);
      expect(childNodes[1].dataset.topicId).toBe(childId);
    });

    it('should render nested children correctly', () => {
      const l1 = tree.addTopic('Level 1');
      const l2 = tree.addTopic('Level 2', l1);
      const l3 = tree.addTopic('Level 3', l2);
      
      renderer = new TreeRenderer(container, tree);
      renderer.expandAll();

      const allNodes = container.querySelectorAll('.tree-node');
      expect(allNodes.length).toBe(3);
      
      // Check aria-level attributes
      expect(allNodes[0].getAttribute('aria-level')).toBe('1');
      expect(allNodes[1].getAttribute('aria-level')).toBe('2');
      expect(allNodes[2].getAttribute('aria-level')).toBe('3');
    });

    it('should apply correct indentation based on level', () => {
      const l1 = tree.addTopic('Level 1');
      const l2 = tree.addTopic('Level 2', l1);
      
      renderer = new TreeRenderer(container, tree);
      renderer.expandAll();

      const contents = container.querySelectorAll('.tree-node-content');
      expect(contents[0].style.paddingLeft).toBe('0px');
      expect(contents[1].style.paddingLeft).toBe('20px');
    });
  });

  describe('Expand/Collapse', () => {
    it('should show expand button for topics with children', () => {
      const parentId = tree.addTopic('Parent');
      tree.addTopic('Child', parentId);
      renderer = new TreeRenderer(container, tree);
      renderer.render();

      const expandBtn = container.querySelector('.tree-expand-btn');
      expect(expandBtn).not.toBeNull();
    });

    it('should not show expand button for leaf topics', () => {
      tree.addTopic('Leaf');
      renderer = new TreeRenderer(container, tree);
      renderer.render();

      const expandBtn = container.querySelector('.tree-expand-btn');
      expect(expandBtn).toBeNull();
    });

    it('should show spacer for topics without children', () => {
      tree.addTopic('Leaf');
      renderer = new TreeRenderer(container, tree);
      renderer.render();

      const spacer = container.querySelector('.tree-expand-spacer');
      expect(spacer).not.toBeNull();
    });

    it('should toggle node expansion', () => {
      const parentId = tree.addTopic('Parent');
      tree.addTopic('Child', parentId);
      renderer = new TreeRenderer(container, tree);
      renderer.render();

      // Initially collapsed
      expect(renderer.expandedNodes.has(parentId)).toBe(false);

      // Toggle to expand
      renderer.toggleNode(parentId);
      expect(renderer.expandedNodes.has(parentId)).toBe(true);

      // Toggle to collapse
      renderer.toggleNode(parentId);
      expect(renderer.expandedNodes.has(parentId)).toBe(false);
    });

    it('should expand all nodes', () => {
      const p1 = tree.addTopic('Parent 1');
      tree.addTopic('Child 1', p1);
      const p2 = tree.addTopic('Parent 2');
      tree.addTopic('Child 2', p2);

      renderer = new TreeRenderer(container, tree);
      renderer.expandAll();

      expect(renderer.expandedNodes.has(p1)).toBe(true);
      expect(renderer.expandedNodes.has(p2)).toBe(true);
    });

    it('should expand topics that contain only chats (no sub-topics)', () => {
      const topicId = tree.addTopic('Root with chats');
      renderer = new TreeRenderer(container, tree);
      // Provide a chat assigned to this topic — no child sub-topics
      renderer.setChatData([{ id: 'c1', topicId, title: 'Chat', source: 'chatgpt', timestamp: 0 }]);
      renderer.expandAll();

      expect(renderer.expandedNodes.has(topicId)).toBe(true);
    });

    it('should collapse all nodes', () => {
      const p1 = tree.addTopic('Parent 1');
      tree.addTopic('Child 1', p1);
      
      renderer = new TreeRenderer(container, tree);
      renderer.expandAll();
      expect(renderer.expandedNodes.size).toBeGreaterThan(0);

      renderer.collapseAll();
      expect(renderer.expandedNodes.size).toBe(0);
    });

    it('should expand path to specific topic', () => {
      const l1 = tree.addTopic('Level 1');
      const l2 = tree.addTopic('Level 2', l1);
      const l3 = tree.addTopic('Level 3', l2);

      renderer = new TreeRenderer(container, tree);
      renderer.expandToTopic(l3);

      expect(renderer.expandedNodes.has(l1)).toBe(true);
      expect(renderer.expandedNodes.has(l2)).toBe(true);
      expect(renderer.expandedNodes.has(l3)).toBe(false); // Target itself not expanded
    });
  });

  describe('Selection', () => {
    it('should select a node', () => {
      const topicId = tree.addTopic('Topic');
      renderer = new TreeRenderer(container, tree);
      renderer.render();
      renderer.selectNode(topicId);

      expect(renderer.selectedNodeId).toBe(topicId);
      const node = container.querySelector('.tree-node');
      expect(node.classList.contains('selected')).toBe(true);
    });

    it('should deselect nodes', () => {
      const topicId = tree.addTopic('Topic');
      renderer = new TreeRenderer(container, tree);
      renderer.render();
      renderer.selectNode(topicId);
      renderer.deselectNode();

      expect(renderer.selectedNodeId).toBeNull();
      const node = container.querySelector('.tree-node');
      expect(node.classList.contains('selected')).toBe(false);
    });

    it('should get selected node ID', () => {
      const topicId = tree.addTopic('Topic');
      renderer = new TreeRenderer(container, tree);
      renderer.render();
      renderer.selectNode(topicId);

      expect(renderer.getSelectedNode()).toBe(topicId);
    });

    it('should only have one selected node', () => {
      const id1 = tree.addTopic('Topic 1');
      const id2 = tree.addTopic('Topic 2');
      renderer = new TreeRenderer(container, tree);
      renderer.render();

      renderer.selectNode(id1);
      renderer.selectNode(id2);

      const selectedNodes = container.querySelectorAll('.tree-node.selected');
      expect(selectedNodes.length).toBe(1);
      expect(selectedNodes[0].dataset.topicId).toBe(id2);
    });
  });

  describe('Timespan Display', () => {
    it('should show timespan for topic with chats', () => {
      const topicId = tree.addTopic('Topic');
      const topic = tree.topics[topicId];
      topic.firstChatDate = new Date('2024-01-15');
      topic.lastChatDate = new Date('2024-03-20');

      renderer = new TreeRenderer(container, tree);
      renderer.render();

      const timespan = container.querySelector('.tree-timespan');
      expect(timespan).not.toBeNull();
      expect(timespan.textContent).toContain('Jan');
      expect(timespan.textContent).toContain('Mar');
    });

    it('should not show timespan for topic without chats', () => {
      tree.addTopic('Topic');
      renderer = new TreeRenderer(container, tree);
      renderer.render();

      const timespan = container.querySelector('.tree-timespan');
      expect(timespan).toBeNull();
    });
  });

  describe('Chat Count Badge', () => {
    it('should show chat count for topic with chats', () => {
      const topicId = tree.addTopic('Topic');
      tree.topics[topicId].chatIds = ['chat1', 'chat2', 'chat3'];

      renderer = new TreeRenderer(container, tree);
      renderer.render();

      const badge = container.querySelector('.tree-chat-count');
      expect(badge).not.toBeNull();
      expect(badge.textContent).toBe('3');
    });

    it('should not show chat count for topic without chats', () => {
      tree.addTopic('Topic');
      renderer = new TreeRenderer(container, tree);
      renderer.render();

      const badge = container.querySelector('.tree-chat-count');
      expect(badge).toBeNull();
    });

    it('should show singular tooltip for 1 chat', () => {
      const topicId = tree.addTopic('Topic');
      tree.topics[topicId].chatIds = ['chat1'];

      renderer = new TreeRenderer(container, tree);
      renderer.render();

      const badge = container.querySelector('.tree-chat-count');
      expect(badge.getAttribute('title')).toBe('1 chat');
    });

    it('should show plural tooltip for multiple chats', () => {
      const topicId = tree.addTopic('Topic');
      tree.topics[topicId].chatIds = ['chat1', 'chat2'];

      renderer = new TreeRenderer(container, tree);
      renderer.render();

      const badge = container.querySelector('.tree-chat-count');
      expect(badge.getAttribute('title')).toBe('2 chats');
    });
  });

  describe('Event Handlers', () => {
    it('should call onTopicClick when topic is clicked', () => {
      const topicId = tree.addTopic('Topic');
      const topic = tree.topics[topicId];
      const mockHandler = vi.fn();

      renderer = new TreeRenderer(container, tree);
      renderer.onTopicClick = mockHandler;
      renderer.render();

      const nodeContent = container.querySelector('.tree-node-content');
      nodeContent.click();

      expect(mockHandler).toHaveBeenCalledWith(topic);
    });

    it('should call onTopicContextMenu on right-click', () => {
      const topicId = tree.addTopic('Topic');
      const topic = tree.topics[topicId];
      const mockHandler = vi.fn();

      renderer = new TreeRenderer(container, tree);
      renderer.onTopicContextMenu = mockHandler;
      renderer.render();

      const nodeContent = container.querySelector('.tree-node-content');
      const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
      nodeContent.dispatchEvent(event);

      expect(mockHandler).toHaveBeenCalled();
      expect(mockHandler.mock.calls[0][0]).toBe(topic);
    });
  });

  describe('Search Highlighting', () => {
    it('should highlight matching topics', () => {
      tree.addTopic('JavaScript');
      tree.addTopic('Python');
      tree.addTopic('Java');

      renderer = new TreeRenderer(container, tree);
      renderer.render();
      renderer.highlightSearch('java');

      const matches = container.querySelectorAll('.tree-node.search-match');
      expect(matches.length).toBe(2); // JavaScript and Java
    });

    it('should clear highlighting', () => {
      tree.addTopic('JavaScript');
      renderer = new TreeRenderer(container, tree);
      renderer.render();
      renderer.highlightSearch('java');

      let matches = container.querySelectorAll('.tree-node.search-match');
      expect(matches.length).toBe(1);

      renderer.clearHighlight();
      matches = container.querySelectorAll('.tree-node.search-match');
      expect(matches.length).toBe(0);
    });

    it('should handle empty search term', () => {
      tree.addTopic('Topic');
      renderer = new TreeRenderer(container, tree);
      renderer.render();
      renderer.highlightSearch('');

      const matches = container.querySelectorAll('.tree-node.search-match');
      expect(matches.length).toBe(0);
    });
  });

  describe('Topic Count Update', () => {
    it('should update topic count badge', () => {
      tree.addTopic('Topic 1');
      tree.addTopic('Topic 2');
      tree.addTopic('Topic 3');

      renderer = new TreeRenderer(container, tree);
      renderer.updateTopicCount();

      const itemCount = document.getElementById('itemCount');
      expect(itemCount.textContent).toBe('3 topics');
    });

    it('should show singular for 1 topic', () => {
      tree.addTopic('Topic');
      renderer = new TreeRenderer(container, tree);
      renderer.updateTopicCount();

      const itemCount = document.getElementById('itemCount');
      expect(itemCount.textContent).toBe('1 topic');
    });

    it('should show 0 topics for empty tree', () => {
      renderer = new TreeRenderer(container, tree);
      renderer.updateTopicCount();

      const itemCount = document.getElementById('itemCount');
      expect(itemCount.textContent).toBe('0 topics');
    });
  });

  describe('State Persistence', () => {
    it('should get expanded state', () => {
      const p1 = tree.addTopic('Parent 1');
      const p2 = tree.addTopic('Parent 2');
      tree.addTopic('Child 1', p1);
      tree.addTopic('Child 2', p2);

      renderer = new TreeRenderer(container, tree);
      renderer.expandNode(p1);
      renderer.expandNode(p2);

      const expandedIds = renderer.getExpandedState();
      expect(expandedIds).toContain(p1);
      expect(expandedIds).toContain(p2);
      expect(expandedIds.length).toBe(2);
    });

    it('should restore expanded state', () => {
      const p1 = tree.addTopic('Parent 1');
      const p2 = tree.addTopic('Parent 2');
      tree.addTopic('Child 1', p1);
      tree.addTopic('Child 2', p2);

      renderer = new TreeRenderer(container, tree);
      renderer.setExpandedState([p1, p2]);

      expect(renderer.expandedNodes.has(p1)).toBe(true);
      expect(renderer.expandedNodes.has(p2)).toBe(true);
    });
  });

  describe('Accessibility', () => {
    it('should set role="tree" on root list', () => {
      tree.addTopic('Topic');
      renderer = new TreeRenderer(container, tree);
      renderer.render();

      const rootList = container.querySelector('.tree-root');
      expect(rootList.getAttribute('role')).toBe('tree');
    });

    it('should set role="treeitem" on nodes', () => {
      tree.addTopic('Topic');
      renderer = new TreeRenderer(container, tree);
      renderer.render();

      const node = container.querySelector('.tree-node');
      expect(node.getAttribute('role')).toBe('treeitem');
    });

    it('should set aria-expanded for expandable nodes', () => {
      const parentId = tree.addTopic('Parent');
      tree.addTopic('Child', parentId);
      renderer = new TreeRenderer(container, tree);
      renderer.render();

      const node = container.querySelector('.tree-node');
      expect(node.hasAttribute('aria-expanded')).toBe(true);
    });

    it('should update aria-expanded when expanding', () => {
      const parentId = tree.addTopic('Parent');
      tree.addTopic('Child', parentId);
      renderer = new TreeRenderer(container, tree);
      renderer.render();

      let node = container.querySelector('.tree-node');
      expect(node.getAttribute('aria-expanded')).toBe('false');

      renderer.expandNode(parentId);
      node = container.querySelector('.tree-node');
      expect(node.getAttribute('aria-expanded')).toBe('true');
    });

    it('should set aria-label on expand buttons', () => {
      const parentId = tree.addTopic('Parent');
      tree.addTopic('Child', parentId);
      renderer = new TreeRenderer(container, tree);
      renderer.render();

      const expandBtn = container.querySelector('.tree-expand-btn');
      expect(expandBtn.getAttribute('aria-label')).toBe('Expand');
    });
  });
});

// ---------------------------------------------------------------------------
// Branch-gap tests for TreeRenderer
// ---------------------------------------------------------------------------

describe('TreeRenderer – collapseNode() when node is not expanded (no-op)', () => {
  let renderer;

  beforeEach(() => {
    const container2 = document.createElement('div');
    document.body.appendChild(container2);
    const t = new TopicTree();
    renderer = new TreeRenderer(container2, t);
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('should be a no-op when topicId is not in expandedNodes', () => {
    // collapseNode on a node that was never expanded – the if branch is false
    expect(() => renderer.collapseNode('non-expanded-id')).not.toThrow();
    expect(renderer.expandedNodes.has('non-expanded-id')).toBe(false);
  });

  it('should collapse a node that is expanded', () => {
    const t = new TopicTree();
    const parentId = t.addTopic('Parent');
    t.addTopic('Child', parentId);
    const c = document.createElement('div');
    document.body.appendChild(c);
    const r = new TreeRenderer(c, t);
    r.expandNode(parentId); // now expanded
    expect(r.expandedNodes.has(parentId)).toBe(true);
    r.collapseNode(parentId); // now collapse
    expect(r.expandedNodes.has(parentId)).toBe(false);
  });
});

describe('TreeRenderer – refreshNode() early-return branches', () => {
  let container3;
  let tree3;
  let renderer3;

  beforeEach(() => {
    container3 = document.createElement('div');
    document.body.appendChild(container3);
    tree3 = new TopicTree();
    renderer3 = new TreeRenderer(container3, tree3);
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('should be a no-op when topicId has no DOM node', () => {
    // No nodes rendered yet, so querySelector returns null
    expect(() => renderer3.refreshNode('ghost-id')).not.toThrow();
  });

  it('should be a no-op when tree is null', () => {
    const topicId = tree3.addTopic('Test');
    renderer3.render();
    // Now set tree to null and call refreshNode
    renderer3.tree = null;
    expect(() => renderer3.refreshNode(topicId)).not.toThrow();
  });

  it('should be a no-op when topic no longer exists in tree', () => {
    const topicId = tree3.addTopic('Test');
    renderer3.render();
    // Delete the topic from the tree but leave the DOM node
    delete tree3.topics[topicId];
    expect(() => renderer3.refreshNode(topicId)).not.toThrow();
  });

  it('should replace the DOM node when topic is valid', () => {
    const topicId = tree3.addTopic('Test');
    renderer3.render();
    const beforeNode = container3.querySelector(`[data-topic-id="${topicId}"]`);
    expect(beforeNode).toBeTruthy();
    // Rename topic and refresh
    tree3.topics[topicId].name = 'Updated';
    renderer3.refreshNode(topicId);
    const afterNode = container3.querySelector(`[data-topic-id="${topicId}"]`);
    expect(afterNode).toBeTruthy();
    expect(afterNode.textContent).toContain('Updated');
  });
});

// ─── Stage 7: Chat item rendering ────────────────────────────────────────────

describe('TreeRenderer – Stage 7 chat items', () => {
  let container;
  let tree;
  let renderer;

  const makeChat = (id, topicId, overrides = {}) => ({
    id, title: `Chat ${id}`, url: 'https://chat.openai.com', timestamp: Date.now(),
    topicId, metadata: {}, ...overrides
  });

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);

    const emptyState = document.createElement('div');
    emptyState.id = 'emptyState';
    emptyState.style.display = 'flex';
    document.body.appendChild(emptyState);

    const itemCount = document.createElement('span');
    itemCount.id = 'itemCount';
    document.body.appendChild(itemCount);

    tree = new TopicTree();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  describe('setChatData', () => {
    it('stores a valid array', () => {
      renderer = new TreeRenderer(container, tree);
      const chats = [makeChat('c1', null)];
      renderer.setChatData(chats);
      expect(renderer.chats).toBe(chats);
    });

    it('initialises to empty array in constructor', () => {
      renderer = new TreeRenderer(container, tree);
      expect(renderer.chats).toEqual([]);
    });

    it('falls back to empty array for non-array input', () => {
      renderer = new TreeRenderer(container, tree);
      renderer.setChatData(null);
      expect(renderer.chats).toEqual([]);
      renderer.setChatData('bad');
      expect(renderer.chats).toEqual([]);
    });
  });

  describe('hasChildren includes chats', () => {
    it('topic with no children and no chats is a leaf node', () => {
      const topicId = tree.addTopic('Empty');
      renderer = new TreeRenderer(container, tree);
      renderer.setChatData([]);
      renderer.render();
      const node = container.querySelector(`[data-topic-id="${topicId}"]`);
      // leaf nodes use 📄 icon
      expect(node.textContent).toContain('📄');
    });

    it('topic with assigned chat shows folder icon (has children)', () => {
      const topicId = tree.addTopic('Has Chats');
      renderer = new TreeRenderer(container, tree);
      renderer.setChatData([makeChat('c1', topicId)]);
      renderer.render();
      const node = container.querySelector(`[data-topic-id="${topicId}"]`);
      // folder icon when hasChildren is true
      expect(node.textContent).toContain('📁');
    });
  });

  describe('chat item rendering', () => {
    it('renders chat items inside expanded topic', () => {
      const topicId = tree.addTopic('Work');
      renderer = new TreeRenderer(container, tree);
      renderer.setChatData([makeChat('c1', topicId), makeChat('c2', topicId)]);
      renderer.expandNode(topicId);
      renderer.render();

      const chatItems = container.querySelectorAll('.tree-chat-item');
      expect(chatItems.length).toBe(2);
    });

    it('does not render chat items when topic is collapsed', () => {
      const topicId = tree.addTopic('Work');
      renderer = new TreeRenderer(container, tree);
      renderer.setChatData([makeChat('c1', topicId)]);
      // NOT expanded
      renderer.render();

      const chatItems = container.querySelectorAll('.tree-chat-item');
      expect(chatItems.length).toBe(0);
    });

    it('renders chat item with correct data-chat-id', () => {
      const topicId = tree.addTopic('Work');
      renderer = new TreeRenderer(container, tree);
      renderer.setChatData([makeChat('chat-abc', topicId)]);
      renderer.expandNode(topicId);
      renderer.render();

      const item = container.querySelector('[data-chat-id="chat-abc"]');
      expect(item).not.toBeNull();
    });

    it('shows 💬 icon for regular chats', () => {
      const topicId = tree.addTopic('T');
      renderer = new TreeRenderer(container, tree);
      renderer.setChatData([makeChat('c1', topicId, { metadata: { isExcerpt: false } })]);
      renderer.expandNode(topicId);
      renderer.render();

      const icon = container.querySelector('.tree-chat-item .tree-icon');
      expect(icon.textContent).toBe('💬');
    });

    it('shows ✂️ icon for excerpt chats', () => {
      const topicId = tree.addTopic('T');
      renderer = new TreeRenderer(container, tree);
      renderer.setChatData([makeChat('c1', topicId, { metadata: { isExcerpt: true } })]);
      renderer.expandNode(topicId);
      renderer.render();

      const icon = container.querySelector('.tree-chat-item .tree-icon');
      expect(icon.textContent).toBe('✂️');
    });

    it('shows chat title in label', () => {
      const topicId = tree.addTopic('T');
      renderer = new TreeRenderer(container, tree);
      renderer.setChatData([makeChat('c1', topicId, { title: 'My Interesting Chat' })]);
      renderer.expandNode(topicId);
      renderer.render();

      const label = container.querySelector('.tree-chat-item .tree-label-text');
      expect(label.textContent).toBe('My Interesting Chat');
    });

    it('falls back to "Untitled Chat" when title is missing', () => {
      const topicId = tree.addTopic('T');
      renderer = new TreeRenderer(container, tree);
      renderer.setChatData([{ id: 'c1', topicId, metadata: {}, timestamp: null }]);
      renderer.expandNode(topicId);
      renderer.render();

      const label = container.querySelector('.tree-chat-item .tree-label-text');
      expect(label.textContent).toBe('Untitled Chat');
    });

    it('shows date badge when chat has timestamp', () => {
      const topicId = tree.addTopic('T');
      renderer = new TreeRenderer(container, tree);
      renderer.setChatData([makeChat('c1', topicId, { timestamp: new Date('2024-06-01').getTime() })]);
      renderer.expandNode(topicId);
      renderer.render();

      const badge = container.querySelector('.tree-chat-item .tree-timespan');
      expect(badge).not.toBeNull();
      expect(badge.textContent.length).toBeGreaterThan(0);
    });

    it('omits date badge when chat has no timestamp', () => {
      const topicId = tree.addTopic('T');
      renderer = new TreeRenderer(container, tree);
      renderer.setChatData([makeChat('c1', topicId, { timestamp: null })]);
      renderer.expandNode(topicId);
      renderer.render();

      const badge = container.querySelector('.tree-chat-item .tree-timespan');
      expect(badge).toBeNull();
    });

    it('renders chats from other topics only in their own topic', () => {
      const t1 = tree.addTopic('T1');
      const t2 = tree.addTopic('T2');
      renderer = new TreeRenderer(container, tree);
      renderer.setChatData([makeChat('ca', t1), makeChat('cb', t2)]);
      renderer.expandNode(t1);
      renderer.expandNode(t2);
      renderer.render();

      const t1Node = container.querySelector(`[data-topic-id="${t1}"]`).closest('li');
      const t2Node = container.querySelector(`[data-topic-id="${t2}"]`).closest('li');
      expect(t1Node.querySelector('[data-chat-id="ca"]')).not.toBeNull();
      expect(t1Node.querySelector('[data-chat-id="cb"]')).toBeNull();
      expect(t2Node.querySelector('[data-chat-id="cb"]')).not.toBeNull();
    });
  });

  describe('chat item event handlers', () => {
    it('calls onChatClick when chat item is clicked', () => {
      const topicId = tree.addTopic('T');
      renderer = new TreeRenderer(container, tree);
      const chat = makeChat('c1', topicId);
      renderer.setChatData([chat]);
      renderer.expandNode(topicId);
      renderer.onChatClick = vi.fn();
      renderer.render();

      const content = container.querySelector('.tree-chat-item .tree-node-content');
      content.click();
      expect(renderer.onChatClick).toHaveBeenCalledWith(expect.objectContaining({ id: 'c1' }));
    });

    it('does not throw when onChatClick is null', () => {
      const topicId = tree.addTopic('T');
      renderer = new TreeRenderer(container, tree);
      renderer.setChatData([makeChat('c1', topicId)]);
      renderer.expandNode(topicId);
      renderer.onChatClick = null;
      renderer.render();

      const content = container.querySelector('.tree-chat-item .tree-node-content');
      expect(() => content.click()).not.toThrow();
    });

    it('calls onChatContextMenu on right-click', () => {
      const topicId = tree.addTopic('T');
      renderer = new TreeRenderer(container, tree);
      const chat = makeChat('c1', topicId);
      renderer.setChatData([chat]);
      renderer.expandNode(topicId);
      renderer.onChatContextMenu = vi.fn();
      renderer.render();

      const content = container.querySelector('.tree-chat-item .tree-node-content');
      const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
      content.dispatchEvent(event);
      expect(renderer.onChatContextMenu).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'c1' }),
        expect.any(MouseEvent)
      );
    });

    it('does not throw when onChatContextMenu is null', () => {
      const topicId = tree.addTopic('T');
      renderer = new TreeRenderer(container, tree);
      renderer.setChatData([makeChat('c1', topicId)]);
      renderer.expandNode(topicId);
      renderer.onChatContextMenu = null;
      renderer.render();

      const content = container.querySelector('.tree-chat-item .tree-node-content');
      const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
      expect(() => content.dispatchEvent(event)).not.toThrow();
    });
  });
});

// ─── getTagColor ─────────────────────────────────────────────────────────────

describe('getTagColor()', () => {
  it('returns a number in [0, 359]', () => {
    const h = getTagColor('react');
    expect(typeof h).toBe('number');
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThan(360);
  });

  it('is deterministic — same tag always yields same hue', () => {
    expect(getTagColor('performance')).toBe(getTagColor('performance'));
    expect(getTagColor('debug')).toBe(getTagColor('debug'));
  });

  it('produces different hues for different tags', () => {
    const hues = ['react', 'debug', 'performance', 'typescript', 'css'].map(getTagColor);
    const unique = new Set(hues);
    // At least some should differ (all 5 the same would be extremely unlikely)
    expect(unique.size).toBeGreaterThan(1);
  });

  it('handles empty string without throwing', () => {
    expect(() => getTagColor('')).not.toThrow();
  });

  it('handles single-char tags', () => {
    const h = getTagColor('a');
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThan(360);
  });

  describe('chip rendering', () => {
    let c2;
    let tr;
    let t2;

    beforeEach(() => {
      c2 = document.createElement('div');
      document.body.appendChild(c2);
      const emptyState = document.createElement('div');
      emptyState.id = 'emptyState';
      document.body.appendChild(emptyState);
      t2 = new TopicTree();
    });

    afterEach(() => { document.body.innerHTML = ''; });

    it('applies --tag-hue CSS custom property to rendered tag chips', () => {
      const topicId = t2.addTopic('Colors');
      tr = new TreeRenderer(c2, t2);
      const chat = { id: 'c-color', title: 'Colored Chat', topicId, tags: ['react', 'css'], timestamp: Date.now() };
      tr.setChatData([chat]);
      tr.expandNode(topicId);
      tr.render();

      const chips = c2.querySelectorAll('.tree-tag-chip');
      expect(chips.length).toBeGreaterThanOrEqual(2);
      chips.forEach(chip => {
        const hue = chip.style.getPropertyValue('--tag-hue');
        expect(hue).not.toBe('');
      });
    });
  });
});
