import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TreeRenderer } from '../src/lib/tree-renderer.js';
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
