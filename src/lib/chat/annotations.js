/**
 * bAInder Annotations — src/lib/annotations.js
 *
 * Stores and retrieves text highlights + optional notes for reader pages.
 * Annotations are keyed by chatId in chrome.storage.local (or any injected
 * storage-like object with `.get(keys)` / `.set(obj)` methods).
 *
 * Annotation schema:
 *   {
 *     id:        string   — unique id, e.g. "ann-1708000000000-abc12"
 *     chatId:    string   — owning chat id
 *     start:     number   — char offset in contentEl.textContent
 *     end:       number   — char offset in contentEl.textContent
 *     text:      string   — selected text (display / search only)
 *     color:     string   — CSS colour string, e.g. "#fef08a"
 *     note:      string   — optional user note
 *     createdAt: string   — ISO-8601 timestamp
 *   }
 */

export const ANNOTATION_COLORS = ['#fef08a', '#bbf7d0', '#bfdbfe', '#fecaca', '#e9d5ff'];

// ─── Storage helpers ──────────────────────────────────────────────────────────

/**
 * Save a new annotation for a chat, returning the updated list.
 * @param {string} chatId
 * @param {object} annotation  — must include id, start, end, text, color
 * @param {object} storage     — chrome.storage.local-like API
 * @returns {Promise<Array>}
 */
export async function saveAnnotation(chatId, annotation, storage) {
  const key    = `annotations:${chatId}`;
  const result = await storage.get([key]);
  const list   = result[key] || [];
  list.push({ ...annotation, chatId, createdAt: new Date().toISOString() });
  await storage.set({ [key]: list });
  return list;
}

/**
 * Load all annotations for a chat.
 * @param {string} chatId
 * @param {object} storage
 * @returns {Promise<Array>}
 */
export async function loadAnnotations(chatId, storage) {
  const key    = `annotations:${chatId}`;
  const result = await storage.get([key]);
  return result[key] || [];
}

/**
 * Delete an annotation by id, returning the updated list.
 * @param {string} chatId
 * @param {string} annotationId
 * @param {object} storage
 * @returns {Promise<Array>}
 */
export async function deleteAnnotation(chatId, annotationId, storage) {
  const key    = `annotations:${chatId}`;
  const result = await storage.get([key]);
  const list   = (result[key] || []).filter(a => a.id !== annotationId);
  await storage.set({ [key]: list });
  return list;
}

// ─── Range serialisation ──────────────────────────────────────────────────────

/**
 * Walk all text nodes inside `container` and return the cumulative character
 * offset of `node` (which must be a Text node) + `offset` within it.
 * @param {Node}   container
 * @param {Node}   node    — a Text node inside container
 * @param {number} offset  — character offset within node
 * @returns {number}
 */
export function getCharOffset(container, node, offset) {
  let total  = 0;
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    if (walker.currentNode === node) return total + offset;
    total += walker.currentNode.textContent.length;
  }
  return total + offset; // fallback (shouldn't happen)
}

/**
 * Resolve a character offset inside `container` to a { node, offset } pair.
 * @param {Node}   container
 * @param {number} charOffset
 * @returns {{ node: Text, offset: number } | null}
 */
export function resolveCharOffset(container, charOffset) {
  let total  = 0;
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const len = walker.currentNode.textContent.length;
    if (total + len >= charOffset) {
      return { node: walker.currentNode, offset: charOffset - total };
    }
    total += len;
  }
  return null;
}

/**
 * Serialise a browser Selection Range relative to `container`.
 * @param {Range}   range
 * @param {Element} container
 * @returns {{ start: number, end: number, text: string } | null}
 */
export function serializeRange(range, container) {
  if (!container.contains(range.commonAncestorContainer)) return null;
  const start = getCharOffset(container, range.startContainer, range.startOffset);
  const end   = getCharOffset(container, range.endContainer,   range.endOffset);
  if (start >= end) return null;
  return { start, end, text: range.toString() };
}

// ─── DOM highlight application ────────────────────────────────────────────────

/**
 * Wrap a serialised annotation in a `<mark class="annotation-highlight">`.
 * Silently skips ranges that cross element boundaries (surroundContents
 * limitation) or cannot be resolved.
 * @param {Element} container
 * @param {{ id, start, end, color, note }} ann
 */
export function highlightRange(container, ann) {
  const startPos = resolveCharOffset(container, ann.start);
  const endPos   = resolveCharOffset(container, ann.end);
  if (!startPos || !endPos) return;

  try {
    const range = document.createRange();
    range.setStart(startPos.node, startPos.offset);
    range.setEnd(endPos.node,     endPos.offset);

    const mark                   = document.createElement('mark');
    mark.className               = 'annotation-highlight';
    mark.dataset.annotationId    = ann.id;
    mark.style.setProperty('--ann-color', ann.color || '#fef08a');
    if (ann.note) mark.title     = ann.note;

    range.surroundContents(mark);
  } catch (_) {
    // Cross-element range — skip gracefully
  }
}

/**
 * Apply an array of annotations to `container`, inserting from last → first so
 * earlier char offsets are not invalidated by the DOM mutations.
 * @param {Element} container
 * @param {Array}   annotations
 */
export function applyAnnotations(container, annotations) {
  const sorted = [...annotations].sort((a, b) => b.start - a.start);
  for (const ann of sorted) {
    highlightRange(container, ann);
  }
}

// ─── C.8 Backlink support ─────────────────────────────────────────────────────

/**
 * Extract all `[[...]]` backlink references from an annotation note string.
 * Returns the inner text of each `[[...]]` pair, trimmed.
 * E.g. "see [[My Other Chat]] and [[Topic / Review]]" → ["My Other Chat", "Topic / Review"]
 *
 * @param {string} note
 * @returns {string[]}
 */
export function parseBacklinks(note) {
  if (!note || typeof note !== 'string') return [];
  const refs = [];
  const re = /\[\[([^\]]+)\]\]/g;
  let m;
  while ((m = re.exec(note)) !== null) {
    const trimmed = m[1].trim();
    if (trimmed) refs.push(trimmed);
  }
  return refs;
}
