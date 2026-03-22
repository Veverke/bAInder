/**
 * tree-sort.js — topic sort strategies for the tree renderer
 *
 * Resolves Code Quality issue 5.4: the original `_sortTopics()` repeated the
 * `pinFirst` guard literally inside every `case`. Here, `pinFirst` is applied
 * exactly once as the outer comparator; the mode-specific inner comparator is
 * selected once and composed in.
 */

/**
 * Return a comparator for the given sort mode (pin-first is handled separately).
 * @param {'alpha-asc'|'alpha-desc'|'updated'|'count'} mode
 * @returns {(a: Object, b: Object) => number}
 */
function getModeComparator(mode) {
  switch (mode) {
    case 'alpha-desc':
      return (a, b) => b.name.toLowerCase().localeCompare(a.name.toLowerCase());
    case 'updated':
      return (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0);
    case 'count':
      return (a, b) => (b.chatIds?.length || 0) - (a.chatIds?.length || 0);
    case 'alpha-asc':
    default:
      return (a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase());
  }
}

/**
 * Sort an array of Topic objects by `mode`, with pinned items always first.
 * The original array is not mutated.
 * @param {Object[]} topics
 * @param {'alpha-asc'|'alpha-desc'|'updated'|'count'} mode
 * @returns {Object[]}
 */
export function sortTopics(topics, mode) {
  const byMode = getModeComparator(mode);
  return [...topics].sort((a, b) => {
    const pinDiff = (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0);
    return pinDiff !== 0 ? pinDiff : byMode(a, b);
  });
}

/**
 * Return a comparator for the given chat sort mode.
 * @param {'date-desc'|'date-asc'|'alpha-asc'|'alpha-desc'} mode
 * @returns {(a: Object, b: Object) => number}
 */
function getChatModeComparator(mode) {
  switch (mode) {
    case 'date-asc':
      return (a, b) => (a.timestamp || 0) - (b.timestamp || 0);
    case 'alpha-asc':
      return (a, b) => (a.title || '').toLowerCase().localeCompare((b.title || '').toLowerCase());
    case 'alpha-desc':
      return (a, b) => (b.title || '').toLowerCase().localeCompare((a.title || '').toLowerCase());
    case 'date-desc':
    default:
      return (a, b) => (b.timestamp || 0) - (a.timestamp || 0);
  }
}

/**
 * Sort an array of chat objects by `mode`.
 * The original array is not mutated.
 * @param {Object[]} chats
 * @param {'date-desc'|'date-asc'|'alpha-asc'|'alpha-desc'} mode
 * @returns {Object[]}
 */
export function sortChats(chats, mode) {
  const byMode = getChatModeComparator(mode);
  return [...chats].sort(byMode);
}
