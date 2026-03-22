/**
 * flatten.js — converts a TopicTree into a flat ordered list of visible nodes
 *
 * Pure function: no DOM access, no side-effects.
 * Used by both the normal render path (to decide whether to activate virtual
 * scrolling) and by the virtual scroll renderer itself.
 *
 * @typedef {{ type: 'topic'|'chat', id: string, depth: number, data: Object }} FlatNode
 */

/**
 * Return a flat ordered array of all currently-visible nodes
 * (topics and chats), respecting the `expandedNodes` set.
 *
 * @param {Object}        tree          — TopicTree instance
 * @param {Set<string>}   expandedNodes — set of currently-expanded topic IDs
 * @param {Object[]}      chats         — flat chats array
 * @param {Function}      sortFn        — `(topics: Object[]) => Object[]`
 *                                        e.g. `topics => sortTopics(topics, mode)`
 * @param {Function}      [chatSortFn]  — `(chats: Object[]) => Object[]`
 *                                        optional; defaults to identity (no sort)
 * @returns {FlatNode[]}
 */
export function flattenVisible(tree, expandedNodes, chats, sortFn, chatSortFn) {
  const _sortChats = typeof chatSortFn === 'function' ? chatSortFn : c => c;
  const result = [];

  const walk = (topics, depth) => {
    const sorted = sortFn(topics);
    for (const topic of sorted) {
      result.push({ type: 'topic', id: topic.id, depth, data: topic });
      if (expandedNodes.has(topic.id)) {
        // Chats belonging directly to this topic
        const topicChats = _sortChats(chats.filter(c => c.topicId === topic.id));
        for (const chat of topicChats) {
          result.push({ type: 'chat', id: chat.id, depth: depth + 1, data: chat });
        }
        // Child topics (recurse)
        const children = tree.getChildren(topic.id);
        if (children.length) walk(children, depth + 1);
      }
    }
  };

  walk(tree.getRootTopics(), 0);
  return result;
}
