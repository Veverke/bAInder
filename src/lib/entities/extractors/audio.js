/**
 * audio.js — extractor for Audio entities (Task D.3).
 *
 * Detects audio content via two strategies:
 *
 * 1. DOM <audio> elements inside message containers (when doc is not null).
 *    - Captures src, attempts to read duration.
 *    - For blob: URLs, immediately fetches the arrayBuffer, encodes as base64
 *      data URI, and stores it as src. Capped at 10 MB; marks captureError
 *      when the blob is too large or has expired.
 *    - Captures adjacent .transcript / [data-transcript] text.
 *
 * 2. Structured message content — messages with role 'audio' or content parts
 *    of type 'audio' / 'input_audio' (Realtime API / Voice Mode shapes).
 *
 * NOTE: This extractor returns a Promise because blob-URL capture is async.
 *       extractChatEntities() must await it (Task D.6).
 *
 * Entity fields: { src, mimeType, durationSeconds, transcript, captureError }
 */

import { ENTITY_TYPES, createEntity } from '../chat-entity.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum blob size to capture (10 MB). */
const MAX_BLOB_BYTES = 10 * 1024 * 1024;

/** Part types recognised as audio in structured content arrays. */
const AUDIO_PART_TYPES = new Set(['audio', 'input_audio', 'audio_url']);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Convert an ArrayBuffer to a base64 data URI string.
 * @param {ArrayBuffer} buffer
 * @param {string}      mimeType
 * @returns {string}
 */
function _bufferToDataUri(buffer, mimeType) {
  const bytes  = new Uint8Array(buffer);
  let binary   = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return `data:${mimeType};base64,${btoa(binary)}`;
}

/**
 * Guess MIME type from a blob URL or file extension.
 * @param {string} src
 * @returns {string}
 */
function _guessMime(src) {
  if (!src) return 'audio/mpeg';
  const dataMatch = src.match(/^data:(audio\/[^;,]+)/);
  if (dataMatch) return dataMatch[1];
  const ext = src.split('?')[0].split('.').pop().toLowerCase();
  const extMap = { mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg',
                   webm: 'audio/webm', m4a: 'audio/mp4', aac: 'audio/aac',
                   flac: 'audio/flac', opus: 'audio/ogg; codecs=opus' };
  return extMap[ext] ?? 'audio/mpeg';
}

/**
 * Attempt to find an adjacent transcript element for an <audio> element.
 * @param {HTMLAudioElement} audioEl
 * @returns {string|null}
 */
function _findTranscript(audioEl) {
  // Search siblings and parent for transcript containers
  const candidates = [
    audioEl.parentElement?.querySelector('.transcript'),
    audioEl.parentElement?.querySelector('[data-transcript]'),
    audioEl.closest('[data-transcript]'),
  ].filter(Boolean);

  for (const el of candidates) {
    const text = el.textContent?.trim();
    if (text) return text;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Strategy 1 — DOM <audio> elements
// ---------------------------------------------------------------------------

/** Selectors for message containers (any role). */
const MESSAGE_CONTAINER_SELECTORS = [
  '[data-role]',
  '.message',
  'user-query',
  'model-response',
];

function _findMessageContainers(doc) {
  for (const sel of MESSAGE_CONTAINER_SELECTORS) {
    const els = [...doc.querySelectorAll(sel)];
    if (els.length > 0) return els;
  }
  return [doc.body ?? doc.documentElement];
}

/**
 * Fetch a blob URL and encode it as a base64 data URI.
 * Returns { src, captureError } — `captureError` is set on failure.
 *
 * @param {string} blobUrl
 * @returns {Promise<{ src: string|null, captureError: string|null }>}
 */
async function _captureBlobUrl(blobUrl) {
  try {
    const response = await fetch(blobUrl);
    if (!response.ok) return { src: null, captureError: 'expired' };

    const contentLength = parseInt(response.headers.get('content-length') ?? '0', 10);
    if (contentLength > MAX_BLOB_BYTES) {
      return { src: null, captureError: 'too_large' };
    }

    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > MAX_BLOB_BYTES) {
      return { src: null, captureError: 'too_large' };
    }

    const mimeType = response.headers.get('content-type') ?? 'audio/mpeg';
    return { src: _bufferToDataUri(buffer, mimeType.split(';')[0].trim()), captureError: null };
  } catch {
    return { src: null, captureError: 'expired' };
  }
}

/**
 * Extract audio from DOM <audio> elements.
 * @param {Document} doc
 * @param {string}   chatId
 * @returns {Promise<Object[]>}
 */
async function _extractFromDOM(doc, chatId) {
  const entities   = [];
  const containers = _findMessageContainers(doc);
  const audioEls   = containers.flatMap(c => [...c.querySelectorAll('audio')]);

  for (let i = 0; i < audioEls.length; i++) {
    const audioEl  = audioEls[i];
    const rawSrc   = audioEl.src ?? audioEl.getAttribute('src') ?? null;
    const mimeType = audioEl.getAttribute('type') ?? _guessMime(rawSrc ?? '');

    // Duration from the element (may be NaN if not loaded)
    const duration = typeof audioEl.duration === 'number' && isFinite(audioEl.duration)
      ? audioEl.duration
      : null;

    const transcript = _findTranscript(audioEl);

    let src          = rawSrc;
    let captureError = null;

    if (rawSrc?.startsWith('blob:')) {
      const captured = await _captureBlobUrl(rawSrc);
      src          = captured.src;
      captureError = captured.captureError;
    }

    entities.push(createEntity(ENTITY_TYPES.AUDIO, i, chatId, 'assistant', {
      src,
      mimeType,
      durationSeconds: duration,
      transcript,
      captureError,
    }));
  }

  return entities;
}

// ---------------------------------------------------------------------------
// Strategy 2 — structured content parts (Realtime API / Voice Mode)
// ---------------------------------------------------------------------------

function _extractFromParts(messages, chatId) {
  const entities = [];

  messages.forEach((m, msgIdx) => {
    const parts = Array.isArray(m.content) ? m.content : null;
    if (!parts && m.role !== 'audio') return;

    const messageIndex = m.index ?? msgIdx;
    const role         = m.role === 'audio' ? 'user' : (m.role ?? 'assistant');

    if (m.role === 'audio' && typeof m.content === 'string') {
      // Realtime API audio message with base64 data in content
      entities.push(createEntity(ENTITY_TYPES.AUDIO, messageIndex, chatId, role, {
        src:             m.content ? `data:audio/pcm;base64,${m.content}` : null,
        mimeType:        'audio/pcm',
        durationSeconds: null,
        transcript:      m.transcript ?? null,
        captureError:    null,
      }));
      return;
    }

    if (parts) {
      parts.forEach(part => {
        if (!AUDIO_PART_TYPES.has(part.type)) return;

        const src      = part.url ?? part.audio_url ?? null;
        const mimeType = part.mime_type ?? _guessMime(src ?? '');

        entities.push(createEntity(ENTITY_TYPES.AUDIO, messageIndex, chatId, role, {
          src,
          mimeType,
          durationSeconds: part.duration ?? null,
          transcript:      part.transcript ?? null,
          captureError:    null,
        }));
      });
    }
  });

  return entities;
}

// ---------------------------------------------------------------------------
// Strategy 3 — Markdown markers (stored message content)
// ---------------------------------------------------------------------------
// htmlToMarkdown emits [🔊 Generated audio](src) when it encounters an <audio>
// element that has been pre-processed by resolveAudioBlobs().  The background
// heuristic also injects [🔊 Generated audio (not captured)] with no URL.
// Since the entity extractor runs in the background (doc = null), the DOM
// strategy never fires for saved chats.  This strategy fills that gap.

// Matches markers WITH a URL: [🔊 Generated audio...](url)
const AUDIO_MARKER_RE = /\[🔊 Generated audio([^\]]*)\]\(([^)]+)\)/g;
// Matches no-URL placeholder: [🔊 Generated audio (not captured)] etc.
const AUDIO_PLACEHOLDER_RE = /\[🔊 Generated audio([^\]]*)\](?!\()/g;

function _extractFromMarkdown(messages, chatId) {
  const entities = [];
  const seenSrc  = new Set();

  messages.forEach((m, msgIdx) => {
    const text = typeof m.content === 'string' ? m.content : '';
    if (!text) return;

    const messageIndex = m.index ?? msgIdx;
    const role         = m.role ?? 'assistant';

    let audioIndex = 0;

    // Markers WITH a URL
    AUDIO_MARKER_RE.lastIndex = 0;
    let match;
    while ((match = AUDIO_MARKER_RE.exec(text)) !== null) {
      const src = match[2];
      if (!src || seenSrc.has(src)) continue;
      seenSrc.add(src);
      const mimeType = _guessMime(src);
      entities.push(createEntity(ENTITY_TYPES.AUDIO, messageIndex, chatId, role, {
        src,
        mimeType,
        durationSeconds: null,
        transcript:      null,
        captureError:    src.startsWith('blob:') ? 'expired' : null,
        snippetIndex:    audioIndex++,
      }));
    }

    // No-URL placeholders: [🔊 Generated audio (not captured)] etc.
    AUDIO_PLACEHOLDER_RE.lastIndex = 0;
    while ((match = AUDIO_PLACEHOLDER_RE.exec(text)) !== null) {
      const note    = (match[1] || '').trim(); // e.g. " (not captured)"
      const key     = `placeholder:${messageIndex}:${note}`;
      if (seenSrc.has(key)) continue;
      seenSrc.add(key);
      const captureError = note.includes('too large') ? 'too_large' : 'not_captured';
      entities.push(createEntity(ENTITY_TYPES.AUDIO, messageIndex, chatId, role, {
        src:             null,
        mimeType:        'audio/mpeg',
        durationSeconds: null,
        transcript:      null,
        captureError,
        snippetIndex:    audioIndex++,
      }));
    }
  });

  return entities;
}

// ---------------------------------------------------------------------------
// Public extractor (async)
// ---------------------------------------------------------------------------

/**
 * Extract audio entities from messages and/or the rendered DOM.
 *
 * NOTE: Returns a Promise — must be awaited by the extraction pipeline.
 *
 * @param {Object[]}      messages   Chat messages array
 * @param {Document|null} doc        Rendered DOM; null in background context
 * @param {string}        chatId     Parent chat ID
 * @returns {Promise<Object[]>}      Array of Audio entities
 */
export async function extractAudio(messages, doc, chatId) {
  const fromParts    = _extractFromParts(messages, chatId);
  const fromMarkdown = _extractFromMarkdown(messages, chatId);
  const fromDOM      = doc ? await _extractFromDOM(doc, chatId) : [];

  // Merge all strategies; deduplicate by src
  const merged  = [...fromParts, ...fromMarkdown, ...fromDOM];

  // Deduplicate by src when both strategies produce results with the same src
  const seenSrc = new Set();
  return merged.filter(e => {
    if (!e.src) return true; // keep entries with no src (captureError case)
    if (seenSrc.has(e.src)) return false;
    seenSrc.add(e.src);
    return true;
  });
}
