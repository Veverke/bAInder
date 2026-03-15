/**
 * artifacts.js — extractor for Artifact entities (Task E.1).
 *
 * Detects artifact containers in the rendered DOM. DOM-only; returns empty
 * when `doc` is null.
 *
 * Two platform strategies:
 *  1. Claude Artifacts: `[data-artifact-type]` or `.artifact-container`
 *  2. ChatGPT Canvas: `.canvas-panel` or `[data-panel="canvas"]`
 *
 * `screenshotDataUri` is null at extraction time; set later by
 * ArtifactScreenshotService (E.2).
 */

import { ENTITY_TYPES, createEntity } from '../chat-entity.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Derive the MIME type from an artifactType string. */
function _mimeType(artifactType) {
  switch ((artifactType ?? '').toLowerCase()) {
    case 'html':   return 'text/html';
    case 'react':  return 'text/jsx';
    case 'svg':    return 'image/svg+xml';
    case 'text':   return 'text/plain';
    case 'code':   return 'text/plain';
    default:       return 'text/plain';
  }
}

/**
 * Extract source text from a Claude artifact container element.
 * Tries `<pre>` or `<textarea>` children first; falls back to textContent.
 */
function _extractSource(containerEl) {
  const pre = containerEl.querySelector('pre');
  if (pre) return pre.textContent ?? '';
  const textarea = containerEl.querySelector('textarea');
  if (textarea) return textarea.value ?? textarea.textContent ?? '';
  return containerEl.textContent ?? '';
}

/**
 * Extract the title from adjacent heading siblings / data attributes.
 */
function _extractTitle(el) {
  // data-artifact-title attribute (some Claude versions)
  const attr = el.getAttribute('data-artifact-title') || el.getAttribute('data-title');
  if (attr) return attr;

  // Preceding sibling heading element
  let sibling = el.previousElementSibling;
  while (sibling) {
    if (/^H[1-6]$/.test(sibling.tagName)) return sibling.textContent.trim();
    sibling = sibling.previousElementSibling;
  }

  // Heading child inside the container
  const heading = el.querySelector('h1, h2, h3, h4, h5, h6');
  if (heading) return heading.textContent.trim();

  return '';
}

// ---------------------------------------------------------------------------
// Strategy 1 — Claude Artifacts
// ---------------------------------------------------------------------------

function _extractClaude(doc, chatId, messageIndex) {
  const entities = [];

  // `[data-artifact-type]` containers
  const byAttr = Array.from(doc.querySelectorAll('[data-artifact-type]'));
  for (const el of byAttr) {
    const artifactType = (el.getAttribute('data-artifact-type') ?? 'text').toLowerCase();
    const title  = _extractTitle(el);
    const source = _extractSource(el);
    entities.push(createEntity(
      ENTITY_TYPES.ARTIFACT,
      messageIndex,
      chatId,
      'assistant',
      { artifactType, title, source, mimeType: _mimeType(artifactType), screenshotDataUri: null },
    ));
  }

  // `.artifact-container` elements not already matched above
  const byClass = Array.from(doc.querySelectorAll('.artifact-container'));
  for (const el of byClass) {
    // Skip if it or a descendant already has data-artifact-type (already processed)
    if (el.hasAttribute('data-artifact-type') || el.querySelector('[data-artifact-type]')) continue;
    const artifactType = (el.getAttribute('data-type') ?? el.dataset.type ?? 'text').toLowerCase();
    const title  = _extractTitle(el);
    const source = _extractSource(el);
    entities.push(createEntity(
      ENTITY_TYPES.ARTIFACT,
      messageIndex,
      chatId,
      'assistant',
      { artifactType, title, source, mimeType: _mimeType(artifactType), screenshotDataUri: null },
    ));
  }

  return entities;
}

// ---------------------------------------------------------------------------
// Strategy 2 — ChatGPT Canvas
// ---------------------------------------------------------------------------

function _extractCanvas(doc, chatId, messageIndex) {
  const entities = [];

  const selectors = ['.canvas-panel', '[data-panel="canvas"]'];
  const seen = new Set();

  for (const sel of selectors) {
    for (const el of doc.querySelectorAll(sel)) {
      if (seen.has(el)) continue;
      seen.add(el);
      const source = _extractSource(el);
      const title  = _extractTitle(el);
      entities.push(createEntity(
        ENTITY_TYPES.ARTIFACT,
        messageIndex,
        chatId,
        'assistant',
        { artifactType: 'canvas', title, source, mimeType: 'text/html', screenshotDataUri: null },
      ));
    }
  }

  return entities;
}

// ---------------------------------------------------------------------------
// Public extractor
// ---------------------------------------------------------------------------

/**
 * Extract artifact entities from the rendered DOM.
 *
 * @param {Array}       messages   Chat message array (not used directly; doc is the DOM source)
 * @param {Document|null} doc      The rendered document. Returns [] when null.
 * @param {string}      chatId
 * @returns {Object[]}
 */
export function extractArtifacts(messages, doc, chatId) {
  if (!doc) return [];

  // Use messageIndex 0 as a default for DOM-only artifacts (no direct message binding)
  const messageIndex = 0;

  return [
    ..._extractClaude(doc, chatId, messageIndex),
    ..._extractCanvas(doc, chatId, messageIndex),
  ];
}
