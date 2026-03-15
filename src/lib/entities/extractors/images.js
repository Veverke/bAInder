/**
 * images.js — extractor for Image entities (Task D.1).
 *
 * Scans messages and DOM for image content via three strategies:
 *
 * 1. Structured content.parts image entries (ChatGPT / Claude API).
 * 2. Markdown ![alt](url) syntax in assistant message text.
 * 3. DOM <img> tags inside assistant message containers (when doc is not null).
 *    Skips tracking/decorative images (< 10 px natural dimensions or aria-hidden).
 *
 * thumbnailDataUri is left null at extraction time; thumbnail generation is
 * deferred to ThumbnailService which runs in the content-script context where
 * images are loaded and OffscreenCanvas is available.
 *
 * Entity fields: { src, mimeType, altText, thumbnailDataUri }
 */

import { ENTITY_TYPES, createEntity } from '../chat-entity.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Part types recognised as images in structured content arrays. */
const IMAGE_PART_TYPES = new Set([
  'image_url',
  'image_file',
  'image',
]);

/** Regex for Markdown image syntax: ![alt](url)
 * Matches both https:// URLs and data: URIs (the latter are produced by
 * resolveImageBlobs() in the content script for Copilot and other platforms
 * that serve images under CORP: same-site headers).
 */
const MARKDOWN_IMG_RE = /!\[([^\]]*)\]\(((?:https?:\/\/|data:)[^)]*)\)/g;

/** Maximum data URI length to accept (5 MB as base64 characters ≈ 6.8M chars). */
const MAX_DATA_URI_LEN = 5 * 1024 * 1024 * 1.4; // ~7 MB chars

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns true for assistant/model roles.
 */
function _isAssistant(role) {
  return role === 'assistant' || role === 'model';
}

/**
 * Guess MIME type from a URL or data URI.
 * @param {string} src
 * @returns {string|null}
 */
function _guessMime(src) {
  if (!src) return null;
  const dataMatch = src.match(/^data:(image\/[^;,]+)/);
  if (dataMatch) return dataMatch[1];
  const ext = src.split('?')[0].split('.').pop().toLowerCase();
  const extMap = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
                   gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
                   avif: 'image/avif' };
  return extMap[ext] ?? null;
}

// ---------------------------------------------------------------------------
// Strategy 1 — structured content.parts
// ---------------------------------------------------------------------------

function _extractFromParts(messages, chatId) {
  const entities = [];

  messages.forEach((m, msgIdx) => {
    const parts = Array.isArray(m.content) ? m.content : null;
    if (!parts) return;

    const messageIndex = m.index ?? msgIdx;
    const role         = m.role ?? 'assistant';

    parts.forEach(part => {
      if (!IMAGE_PART_TYPES.has(part.type)) return;

      const src      = part.url ?? part.image_url?.url ?? null;
      const altText  = part.alt ?? part.altText ?? null;
      const mimeType = part.mime_type ?? _guessMime(src);

      if (!src) return;

      const oversize = typeof src === 'string' && src.startsWith('data:') && src.length > MAX_DATA_URI_LEN;

      entities.push(createEntity(ENTITY_TYPES.IMAGE, messageIndex, chatId, role, {
        src:              oversize ? src : src,
        mimeType,
        altText,
        thumbnailDataUri: null,
        oversize,
      }));
    });
  });

  return entities;
}

// ---------------------------------------------------------------------------
// Strategy 2 — Markdown ![alt](url) syntax
// ---------------------------------------------------------------------------

function _extractFromMarkdown(messages, chatId) {
  const entities = [];
  // Deduplicate across all messages: ChatGPT places DALL-E images both inside the
  // .markdown content div and inside a download <button> within the same turn wrapper.
  // htmlToMarkdown emits both, so the same data: URI can appear twice in one message.
  const seenSrc = new Set();

  messages.forEach((m, msgIdx) => {
    // Scan all roles: assistant messages contain AI-generated images;
    // user messages can contain attached/pasted images (Copilot, ChatGPT).
    const text = typeof m.content === 'string' ? m.content : '';
    if (!text) return;

    const messageIndex = m.index ?? msgIdx;
    const role         = m.role ?? 'unknown';
    MARKDOWN_IMG_RE.lastIndex = 0;

    let match;
    while ((match = MARKDOWN_IMG_RE.exec(text)) !== null) {
      const altText = match[1] || null;
      const src     = match[2];
      if (!src) continue;

      // data: URIs are the already-resolved image — use directly as thumbnail
      // so the entity card can display them without a separate fetch.
      const isDataUri  = src.startsWith('data:');
      const oversize   = isDataUri && src.length > MAX_DATA_URI_LEN;
      const thumbUri   = isDataUri && !oversize ? src : null;

      if (seenSrc.has(src)) continue;
      seenSrc.add(src);

      entities.push(createEntity(ENTITY_TYPES.IMAGE, messageIndex, chatId, role, {
        src,
        mimeType:         _guessMime(src),
        altText,
        thumbnailDataUri: thumbUri,
        oversize,
      }));
    }
  });

  return entities;
}

// ---------------------------------------------------------------------------
// Strategy 3 — DOM <img> elements
// ---------------------------------------------------------------------------

/** Selectors for assistant message containers, ordered from most- to least-specific. */
const ASSISTANT_CONTAINER_SELECTORS = [
  '[data-role="assistant"]',
  '[data-role="model"]',
  '.message--assistant',
  '.model-response',
  'model-response',
];

/**
 * Find all assistant message container elements in the doc.
 * @param {Document} doc
 * @returns {Element[]}
 */
function _findAssistantContainers(doc) {
  for (const sel of ASSISTANT_CONTAINER_SELECTORS) {
    const els = [...doc.querySelectorAll(sel)];
    if (els.length > 0) return els;
  }
  // Fallback: all visible <p>/<div> siblings — empty when nothing found.
  return [];
}

/**
 * Returns true for images that should be excluded (tracking pixels, icons, decorative).
 * @param {HTMLImageElement} img
 * @returns {boolean}
 */
function _isDecorative(img) {
  if (img.getAttribute('aria-hidden') === 'true') return true;
  // Skip images with role="presentation" or alt="" that are known decorative patterns
  const role = img.getAttribute('role');
  if (role === 'presentation' || role === 'none') return true;
  // Skip tiny images (< 10 px on either dimension) based on attribute values
  const w = parseInt(img.getAttribute('width') ?? '0', 10);
  const h = parseInt(img.getAttribute('height') ?? '0', 10);
  if ((w > 0 && w < 10) || (h > 0 && h < 10)) return true;
  return false;
}

function _extractFromDOM(doc, chatId, messageIndex) {
  const entities = [];
  const containers = _findAssistantContainers(doc);

  const imgs = containers.length > 0
    ? containers.flatMap(c => [...c.querySelectorAll('img')])
    : [...doc.querySelectorAll('img')];

  const seen = new Set();

  imgs.forEach(img => {
    if (_isDecorative(img)) return;

    const src = img.src ?? img.getAttribute('src') ?? null;
    if (!src || seen.has(src)) return;
    seen.add(src);

    const altText  = img.alt || img.getAttribute('alt') || null;
    const mimeType = _guessMime(src);
    const oversize = src.startsWith('data:') && src.length > MAX_DATA_URI_LEN;

    entities.push(createEntity(ENTITY_TYPES.IMAGE, messageIndex, chatId, 'assistant', {
      src,
      mimeType,
      altText,
      thumbnailDataUri: null,
      oversize,
    }));
  });

  return entities;
}

// ---------------------------------------------------------------------------
// Public extractor
// ---------------------------------------------------------------------------

/**
 * Extract image entities from messages and/or the rendered DOM.
 *
 * @param {Object[]}      messages   Chat messages array
 * @param {Document|null} doc        Rendered DOM; null in background context
 * @param {string}        chatId     Parent chat ID
 * @returns {Object[]}               Array of Image entities
 */
export function extractImages(messages, doc, chatId) {
  // Strategy 1 — structured content.parts
  const fromParts = _extractFromParts(messages, chatId);
  if (fromParts.length > 0) return fromParts;

  // Strategy 2 — Markdown syntax
  const fromMarkdown = _extractFromMarkdown(messages, chatId);

  // Strategy 3 — DOM scan (supplemental when doc is available)
  const fromDOM = doc ? _extractFromDOM(doc, chatId, 0) : [];

  // Merge, de-duplicating by src
  const seen = new Set(fromMarkdown.map(e => e.src));
  const merged = [...fromMarkdown];
  for (const e of fromDOM) {
    if (!seen.has(e.src)) {
      merged.push(e);
      seen.add(e.src);
    }
  }

  return merged;
}
