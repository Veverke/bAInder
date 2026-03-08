/**
 * search-highlight.js — DOM utilities for search-match highlighting in the tree
 *
 * Pure DOM utilities: both functions accept the container element so they are
 * fully testable without a TreeRenderer instance.
 */

/**
 * Add `search-match` class to every tree node whose visible label text
 * contains `term` (case-insensitive).
 * If `term` is falsy, all highlights are cleared instead.
 * @param {HTMLElement} container
 * @param {string}      term
 */
export function highlightSearch(container, term) {
  if (!term) {
    clearHighlight(container);
    return;
  }
  const lower = term.toLowerCase();
  container.querySelectorAll('.tree-label-text').forEach(node => {
    if (node.textContent.toLowerCase().includes(lower)) {
      node.parentElement.parentElement.parentElement.classList.add('search-match');
    }
  });
}

/**
 * Remove all `search-match` highlights inside `container`.
 * @param {HTMLElement} container
 */
export function clearHighlight(container) {
  container.querySelectorAll('.tree-node').forEach(node => {
    node.classList.remove('search-match');
  });
}
