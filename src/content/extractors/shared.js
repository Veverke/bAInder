/**
 * Shared utilities used by multiple platform extractors.
 */

/**
 * Remove elements that are descendants of another element in the same list.
 * Prevents nested DOM nodes (all matching a selector) from producing duplicate turns.
 * @param {Element[]} els
 * @returns {Element[]}
 */
export function removeDescendants(els) {
  return els.filter(el => !els.some(other => other !== el && other.contains(el)));
}
