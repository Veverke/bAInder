/**
 * auto-export.js
 *
 * Responsibility: building and saving automatic ZIP exports triggered by the
 * "auto-export after N saves" feature.
 *
 * Destination logic (in priority order):
 *  1. User-configured folder — stored as a FileSystemDirectoryHandle in
 *     IndexedDB.  Written via the FileSystem Access API (no `downloads`
 *     browser permission required).
 *  2. Fallback — standard browser download via a DOM-click (triggerDownload).
 *
 * Topic-filter logic:
 *  - `topicFilter` is a comma-separated string of topic names.
 *  - If blank (default) the entire tree is exported.
 *  - If set, only chats whose topic name matches one of the entries are
 *    included (case-insensitive, trimmed).
 */

import JSZip                from '../vendor/jszip-esm.js';
import { buildZipPayload }  from './zip-builder.js';
import { triggerDownload }  from './download.js';
import { logger }           from '../utils/logger.js';

// ── IndexedDB helpers ────────────────────────────────────────────────────────

const DB_NAME    = 'bAInder-auto-export';
const DB_VERSION = 1;
const STORE      = 'config';
const HANDLE_KEY = 'dirHandle';

function _openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = e => e.target.result.createObjectStore(STORE);
    req.onsuccess       = e => resolve(e.target.result);
    req.onerror         = e => reject(e.target.error);
  });
}

/** Persist a FileSystemDirectoryHandle so it survives page reloads. */
export async function storeAutoExportDirHandle(handle) {
  const db = await _openDb();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE, 'readwrite');
    const req = tx.objectStore(STORE).put(handle, HANDLE_KEY);
    req.onsuccess = () => resolve();
    req.onerror   = e => reject(e.target.error);
  });
}

/** Retrieve the previously stored handle, or null if none. */
export async function getAutoExportDirHandle() {
  const db = await _openDb();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(HANDLE_KEY);
    req.onsuccess = e => resolve(e.target.result ?? null);
    req.onerror   = e => reject(e.target.error);
  });
}

/** Remove the stored handle (e.g. when user clears the folder setting). */
export async function clearAutoExportDirHandle() {
  const db = await _openDb();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE, 'readwrite');
    const req = tx.objectStore(STORE).delete(HANDLE_KEY);
    req.onsuccess = () => resolve();
    req.onerror   = e => reject(e.target.error);
  });
}

// ── Filename builder ─────────────────────────────────────────────────────────

function _buildFilename(tree, chats) {
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  const dt  = [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
  ].join('-');
  const nTopics = tree ? Object.keys(tree.topics || {}).length : 0;
  const mChats  = Array.isArray(chats) ? chats.length : 0;
  return `bAInder-${nTopics}-topics-${mChats}-chats-auto-export-${dt}.zip`;
}

// ── Main trigger ─────────────────────────────────────────────────────────────

/**
 * Build a ZIP and save it to the user-configured folder (FileSystem Access
 * API) or, as a fallback, to the browser's default Downloads location.
 *
 * @param {Object} tree         — TopicTree instance
 * @param {Array}  allChats     — full in-memory chat list
 * @param {string} [topicFilter] — comma-separated topic names; '' = export all
 * @returns {Promise<void>}
 */
export async function triggerAutoExport(tree, allChats, topicFilter = '') {
  // ── Apply topic filter ────────────────────────────────────────────────────
  const topicNames = topicFilter
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);

  let chats = allChats;
  if (topicNames.length > 0 && tree?.topics) {
    const matchingIds = new Set(
      Object.values(tree.topics)
        .filter(t => topicNames.includes((t.name || '').trim().toLowerCase()))
        .map(t => t.id)
    );
    chats = allChats.filter(c => matchingIds.has(c.topicId));
  }

  // ── Build ZIP ─────────────────────────────────────────────────────────────
  const files = buildZipPayload(tree, chats, { scope: 'all', format: 'markdown', style: 'raw' });
  const zip   = new JSZip();
  files.forEach(({ path, content }) => zip.file(path, content));
  const blob     = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  const filename = _buildFilename(tree, chats);

  // ── Try user-configured directory first (FileSystem Access API) ───────────
  let savedToFolder = false;
  try {
    const dirHandle = await getAutoExportDirHandle();
    if (dirHandle) {
      // Re-check / request write permission (required after page reload)
      let perm = await dirHandle.queryPermission({ mode: 'readwrite' });
      if (perm !== 'granted') {
        perm = await dirHandle.requestPermission({ mode: 'readwrite' });
      }
      if (perm === 'granted') {
        const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
        const writable   = await fileHandle.createWritable();
        await writable.write(blob);
        await writable.close();
        savedToFolder = true;
      }
    }
  } catch (err) {
    // Permission denied or handle stale — fall back silently
    logger.warn('Auto-export: directory write failed, falling back to download:', err);
  }

  // ── Fallback: standard browser download ───────────────────────────────────
  if (!savedToFolder) {
    triggerDownload(filename, blob, 'application/zip');
  }
}
