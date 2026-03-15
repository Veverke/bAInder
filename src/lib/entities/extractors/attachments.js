/**
 * attachments.js — extractor for Attachment entities.
 *
 * Scans messages for attachment metadata using three strategies (tried in order;
 * the first that produces results wins):
 *
 * 1. Structured `content.parts` entries on message objects: ChatGPT API
 *    returns parts of type 'image_file' / 'file_reference' / 'image_url'
 *    with 'filename' and 'mime_type'.
 * 2. DOM scan (when `doc` not null): query [data-filename], [data-file-type],
 *    and .attachment-name elements in message containers.
 * 3. Markdown text scan (fallback): detect filenames that appear on their own
 *    line in the markdown content string.  This is the primary path for chats
 *    captured via bAInder's DOM extractor, where ChatGPT's file-chip UI is
 *    converted to plain text like "report.pdf\n\nPDF".
 *
 * Both user-role and assistant-role messages are scanned by all strategies.
 */

import { ENTITY_TYPES, createEntity } from '../chat-entity.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Part types recognised as file attachments in structured content arrays. */
const ATTACHMENT_PART_TYPES = new Set([
  'image_file',
  'file_reference',
  'image_url',
  'file',
  'document',
]);

// ---------------------------------------------------------------------------
// Strategy 1 — structured content.parts
// ---------------------------------------------------------------------------

/**
 * Extract attachments from structured `content` arrays (ChatGPT / Claude API).
 *
 * @param {Object[]} messages
 * @param {string}   chatId
 * @returns {Object[]}
 */
function _extractFromParts(messages, chatId) {
  const entities = [];
  let userOrdinal = 0;
  let asstOrdinal = 0;

  messages.forEach((m, msgIdx) => {
    const parts = Array.isArray(m.content) ? m.content : null;
    const role  = m.role ?? 'user';
    const isAsst = role === 'assistant' || role === 'model';

    if (isAsst) asstOrdinal++; else userOrdinal++;

    if (!parts) return;

    const messageIndex = m.index ?? msgIdx;
    const roleOrdinal  = isAsst ? asstOrdinal : userOrdinal;

    parts.forEach(part => {
      if (!ATTACHMENT_PART_TYPES.has(part.type)) return;

      const filename  = part.filename ?? part.name ?? null;
      const mimeType  = part.mime_type ?? part.mimeType ?? _guessMime(filename);
      const sizeBytes = part.size_bytes ?? part.sizeBytes ?? null;

      entities.push(createEntity(
        ENTITY_TYPES.ATTACHMENT, messageIndex, chatId, role, {
          roleOrdinal,
          filename,
          mimeType,
          sizeBytes,
        }
      ));
    });
  });

  return entities;
}

// ---------------------------------------------------------------------------
// Strategy 2 — DOM scan
// ---------------------------------------------------------------------------

/**
 * Extract attachments by inspecting rendered DOM elements.
 *
 * Looks for:
 *  - `[data-filename]`     — filename in attribute
 *  - `.attachment-name`    — filename in text content
 *  - `[data-file-type]`    — mime type hint in attribute
 *
 * @param {Document} doc
 * @param {Object[]} messages  Used only for length / index estimation
 * @param {string}   chatId
 * @returns {Object[]}
 */
function _extractFromDom(doc, messages, chatId) {
  const entities = [];

  // [data-filename] elements
  const filenameEls = doc.querySelectorAll('[data-filename]');
  filenameEls.forEach(el => {
    const filename  = el.getAttribute('data-filename') || null;
    const mimeType  = el.getAttribute('data-file-type') || _guessMime(filename);
    const sizeBytes = _parseSizeAttr(el.getAttribute('data-size-bytes') ?? el.getAttribute('data-filesize'));

    entities.push(createEntity(
      ENTITY_TYPES.ATTACHMENT, 0, chatId, 'user', { filename, mimeType, sizeBytes }
    ));
  });

  // .attachment-name elements (that weren't already captured via data-filename)
  const nameEls = doc.querySelectorAll('.attachment-name');
  nameEls.forEach(el => {
    const filename = el.textContent?.trim() || null;
    if (!filename) return;

    // Skip if already captured by [data-filename] (same parent element)
    if (el.closest('[data-filename]')) return;

    const container = el.closest('[data-file-type]');
    const mimeType  = container?.getAttribute('data-file-type') ?? _guessMime(filename);
    const sizeBytes = _parseSizeAttr(container?.getAttribute('data-size-bytes') ?? null);

    entities.push(createEntity(
      ENTITY_TYPES.ATTACHMENT, 0, chatId, 'user', { filename, mimeType, sizeBytes }
    ));
  });

  return entities;
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

/**
 * Guess MIME type from a filename extension.
 *
 * @param {string|null} filename
 * @returns {string|null}
 */
function _guessMime(filename) {
  if (!filename) return null;
  const ext = filename.split('.').pop()?.toLowerCase();
  const map = {
    pdf:  'application/pdf',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    doc:  'application/msword',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    csv:  'text/csv',
    txt:  'text/plain',
    md:   'text/markdown',
    json: 'application/json',
    py:   'text/x-python',
    js:   'text/javascript',
    ts:   'text/typescript',
    png:  'image/png',
    jpg:  'image/jpeg',
    jpeg: 'image/jpeg',
    gif:  'image/gif',
    svg:  'image/svg+xml',
    webp: 'image/webp',
    mp3:  'audio/mpeg',
    wav:  'audio/wav',
    mp4:  'video/mp4',
    zip:  'application/zip',
  };
  return map[ext] ?? null;
}

/**
 * Parse an integer byte count from an attribute string.
 *
 * @param {string|null} attr
 * @returns {number|null}
 */
function _parseSizeAttr(attr) {
  if (!attr) return null;
  const n = parseInt(attr, 10);
  return isNaN(n) ? null : n;
}

// ---------------------------------------------------------------------------
// Strategy 3 — markdown text scan (primary path for DOM-captured chats)
// ---------------------------------------------------------------------------

/**
 * Known file extensions for which a standalone filename line in markdown text
 * is treated as an attachment.  Listed as an alternation for the regex.
 */
const _ATTACHMENT_EXTS = [
  'pdf', 'docx?', 'xlsx?', 'pptx?', 'txt', 'md', 'csv', 'rtf',
  'py', 'rb', 'rs', 'go', 'php', 'java', 'swift', 'jsx?', 'tsx?', 'sql',
  'sh', 'bash', 'c', 'cpp?', 'h(?:pp?)?',
  'json', 'xml', 'ya?ml', 'toml',
  'png', 'jpe?g', 'gif', 'svg', 'webp', 'bmp', 'ico',
  'mp3', 'wav', 'm4a', 'ogg', 'flac',
  'mp4', 'mov', 'mkv', 'avi', 'webm',
  'zip', 'tar', 'gz', 'rar', '7z',
  'db', 'sqlite3?',
].join('|');

/**
 * Matches a line whose entire trimmed content is a filename with a known
 * extension  —  the format produced when htmlToMarkdown converts any platform's
 * file-upload chip to plain text (e.g. "termination_letter_template.pdf").
 *
 * Character class covers: word chars, accented letters, spaces, hyphens,
 * underscores, dots, parentheses, square brackets.
 * First character must be alphanumeric (rules out lines starting with markdown
 * syntax like #, *, -, >, `, |).
 */
const _FILENAME_LINE_RE = new RegExp(
  `^([\\w\\u00C0-\\u024F][\\w\\u00C0-\\u024F \\-_.()\\[\\]]{0,199}\\.(?:${_ATTACHMENT_EXTS}))\\s*$`,
  'gim'
);

/**
 * Strip fenced code blocks and inline code from markdown text to reduce
 * false positives (filenames mentioned inside code should not become entities).
 * Also strips Markdown URL destinations ([text](URL)) to avoid treating URL
 * path segments as filenames.
 *
 * @param {string} text
 * @returns {string}
 */
function _stripCodeAndUrls(text) {
  return text
    .replace(/```[\s\S]*?```/g, '')          // fenced blocks
    .replace(/`[^`\n]+`/g, '')               // inline code
    .replace(/\]\([^)]*\)/g, ']()')          // [text](URL) → erase URL
    .replace(/https?:\/\/\S+/g, '');         // bare URLs
}

/**
 * Extract attachments by scanning markdown text content for standalone
 * filename lines.
 *
 * @param {Object[]} messages
 * @param {string}   chatId
 * @returns {Object[]}
 */
function _extractFromText(messages, chatId) {
  const entities = [];
  let userOrdinal = 0;
  let asstOrdinal = 0;

  console.log('[bAInder] [attachments] _extractFromText: scanning', messages.length, 'messages for', chatId);

  messages.forEach((m, msgIdx) => {
    const role   = m.role ?? 'user';
    const isAsst = role === 'assistant' || role === 'model';

    if (isAsst) asstOrdinal++; else userOrdinal++;

    if (typeof m.content !== 'string') return;

    const messageIndex = m.index ?? msgIdx;
    const roleOrdinal  = isAsst ? asstOrdinal : userOrdinal;
    const cleaned      = _stripCodeAndUrls(m.content);

    console.log('[bAInder] [attachments] msg', msgIdx, role,
      '| content[:200]:', JSON.stringify(m.content.slice(0, 200)));

    const seen = new Set(); // deduplicate within a single message
    _FILENAME_LINE_RE.lastIndex = 0;

    let match;
    while ((match = _FILENAME_LINE_RE.exec(cleaned)) !== null) {
      const filename = match[1].trim();
      if (seen.has(filename)) continue;
      seen.add(filename);

      entities.push(createEntity(
        ENTITY_TYPES.ATTACHMENT, messageIndex, chatId, role, {
          roleOrdinal,
          filename,
          mimeType:  _guessMime(filename),
          sizeBytes: null,
        }
      ));
    }
  });

  return entities;
}

// ---------------------------------------------------------------------------
// Public extractor
// ---------------------------------------------------------------------------

/**
 * Extract Attachment entities from messages and/or the rendered DOM.
 *
 * Tries strategies in order:
 * 1. Structured content.parts (API messages)
 * 2. DOM scan (when doc is provided)
 * 3. Markdown text scan (fallback — primary path for DOM-captured chats)
 *
 * @param {Object[]}      messages
 * @param {Document|null} doc
 * @param {string}        chatId
 * @returns {Object[]}
 */
export function extractAttachments(messages, doc, chatId) {
  const structured = _extractFromParts(messages, chatId);
  console.log('[bAInder] [attachments] strategy1 (parts):', structured.length, 'found');
  if (structured.length > 0) return structured;

  if (doc) {
    const domResults = _extractFromDom(doc, messages, chatId);
    console.log('[bAInder] [attachments] strategy2 (dom):', domResults.length, 'found');
    if (domResults.length > 0) return domResults;
  }

  const textResults = _extractFromText(messages, chatId);
  console.log('[bAInder] [attachments] strategy3 (text):', textResults.length, 'found');
  return textResults;
}
