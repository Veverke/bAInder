/**
 * tag-color.js — deterministic HSL hue from tag string
 *
 * Extracted from tree-renderer.js so it can be used by chat-item-builder.js
 * without creating a circular import.
 * tree-renderer.js re-exports this for backward compatibility.
 */

/**
 * Return a deterministic HSL hue (0-359) for a tag string via djb2 hash.
 * Same tag always yields the same hue across all renders.
 * @param {string} tag
 * @returns {number} hue in [0, 359]
 */
export function getTagColor(tag) {
  let h = 5381;
  for (let i = 0; i < tag.length; i++) h = (Math.imul(33, h) ^ tag.charCodeAt(i)) >>> 0;
  return h % 360;
}
