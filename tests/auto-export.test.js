/**
 * Tests for src/lib/export/auto-export.js
 *
 * Covers:
 *  - storeAutoExportDirHandle / getAutoExportDirHandle / clearAutoExportDirHandle
 *  - triggerAutoExport — topic filtering, ZIP-to-folder path, download fallback
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../src/lib/export/zip-builder.js', () => ({
  buildZipPayload: vi.fn(() => [{ path: 'chat.md', content: '# Chat' }]),
}));

vi.mock('../src/lib/export/download.js', () => ({
  triggerDownload: vi.fn(),
}));

vi.mock('../src/lib/utils/logger.js', () => ({
  logger: { warn: vi.fn(), error: vi.fn() },
}));

// JSZip is routed via alias to tests/__mocks__/jszip.js which reads globalThis.JSZip

// ── In-memory IndexedDB fake ──────────────────────────────────────────────────

let _dbStore = {};

function makeFakeIndexedDB() {
  return {
    open(_name, _version) {
      const db = {
        transaction(_store, _mode) {
          return {
            objectStore() {
              return {
                put(value, key) {
                  const req = {};
                  _dbStore[key] = value;
                  Promise.resolve().then(() => req.onsuccess?.());
                  return req;
                },
                get(key) {
                  const req = {};
                  Promise.resolve().then(() => {
                    req.onsuccess?.({ target: { result: _dbStore[key] } });
                  });
                  return req;
                },
                delete(key) {
                  const req = {};
                  delete _dbStore[key];
                  Promise.resolve().then(() => req.onsuccess?.());
                  return req;
                },
              };
            },
          };
        },
        createObjectStore() {},
      };
      const openReq = {};
      Promise.resolve().then(() => {
        openReq.onupgradeneeded?.({ target: { result: db } });
        openReq.onsuccess?.({ target: { result: db } });
      });
      return openReq;
    },
  };
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const mockTree = {
  topics: {
    't1': { id: 't1', name: 'Work',    chatIds: ['c1'] },
    't2': { id: 't2', name: 'Personal', chatIds: ['c2'] },
  },
};

const mockChats = [
  { id: 'c1', title: 'Work Chat',     topicId: 't1' },
  { id: 'c2', title: 'Personal Chat', topicId: 't2' },
];

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  _dbStore = {};
  vi.stubGlobal('indexedDB', makeFakeIndexedDB());

  // Use a regular function constructor (not arrow) so `new JSZip()` works
  // reliably in Vitest without triggering the arrow-constructor warning.
  const _zipFiles = {};
  function MockJSZip() {
    return {
      file: function (path, content) { _zipFiles[path] = content; },
      generateAsync: function () {
        return Promise.resolve(new Blob(['zip'], { type: 'application/zip' }));
      },
      _files: _zipFiles,
    };
  }
  globalThis.JSZip = MockJSZip;
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete globalThis.JSZip;
});

// ── Import under test (after mocks are in place) ──────────────────────────────

import {
  storeAutoExportDirHandle,
  getAutoExportDirHandle,
  clearAutoExportDirHandle,
  triggerAutoExport,
} from '../src/lib/export/auto-export.js';

import { buildZipPayload } from '../src/lib/export/zip-builder.js';
import { triggerDownload  } from '../src/lib/export/download.js';

// ─────────────────────────────────────────────────────────────────────────────
// IndexedDB helpers
// ─────────────────────────────────────────────────────────────────────────────

describe('storeAutoExportDirHandle()', () => {
  it('stores a handle so getAutoExportDirHandle returns it', async () => {
    const handle = { kind: 'directory', name: 'exports' };
    await storeAutoExportDirHandle(handle);
    const retrieved = await getAutoExportDirHandle();
    expect(retrieved).toBe(handle);
  });
});

describe('getAutoExportDirHandle()', () => {
  it('returns null when nothing has been stored', async () => {
    const result = await getAutoExportDirHandle();
    expect(result).toBeNull();
  });
});

describe('clearAutoExportDirHandle()', () => {
  it('removes a previously stored handle', async () => {
    const handle = { kind: 'directory', name: 'my-folder' };
    await storeAutoExportDirHandle(handle);
    await clearAutoExportDirHandle();
    const result = await getAutoExportDirHandle();
    expect(result).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// triggerAutoExport — topic filtering
// ─────────────────────────────────────────────────────────────────────────────

describe('triggerAutoExport() — topic filtering', () => {
  it('passes all chats when topicFilter is empty', async () => {
    await triggerAutoExport(mockTree, mockChats, '');
    expect(buildZipPayload).toHaveBeenCalledWith(
      mockTree,
      mockChats,
      expect.any(Object)
    );
  });

  it('filters chats to named topics (case-insensitive)', async () => {
    await triggerAutoExport(mockTree, mockChats, 'WORK');
    const callArg = vi.mocked(buildZipPayload).mock.calls.at(-1)[1];
    expect(callArg).toHaveLength(1);
    expect(callArg[0].id).toBe('c1');
  });

  it('includes chats from multiple comma-separated topic names', async () => {
    await triggerAutoExport(mockTree, mockChats, 'Work, Personal');
    const callArg = vi.mocked(buildZipPayload).mock.calls.at(-1)[1];
    expect(callArg).toHaveLength(2);
  });

  it('results in empty chat list when topic name does not match', async () => {
    await triggerAutoExport(mockTree, mockChats, 'Nonexistent');
    const callArg = vi.mocked(buildZipPayload).mock.calls.at(-1)[1];
    expect(callArg).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// triggerAutoExport — download fallback (no stored handle)
// ─────────────────────────────────────────────────────────────────────────────

describe('triggerAutoExport() — download fallback', () => {
  it('calls triggerDownload when no directory handle is stored', async () => {
    vi.mocked(triggerDownload).mockClear();
    await triggerAutoExport(mockTree, mockChats, '');
    expect(triggerDownload).toHaveBeenCalledTimes(1);
    const [filename, blob, mime] = vi.mocked(triggerDownload).mock.calls[0];
    expect(filename).toMatch(/^bAInder-.*auto-export.*\.zip$/);
    expect(blob).toBeInstanceOf(Blob);
    expect(mime).toBe('application/zip');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// triggerAutoExport — writes to stored directory handle
// ─────────────────────────────────────────────────────────────────────────────

describe('triggerAutoExport() — FileSystem Access API path', () => {
  function makeDirHandle(permResult = 'granted') {
    const writable = { write: vi.fn().mockResolvedValue(undefined), close: vi.fn().mockResolvedValue(undefined) };
    const fileHandle = { createWritable: vi.fn().mockResolvedValue(writable) };
    return {
      kind: 'directory',
      queryPermission:   vi.fn().mockResolvedValue(permResult),
      requestPermission: vi.fn().mockResolvedValue(permResult),
      getFileHandle:     vi.fn().mockResolvedValue(fileHandle),
      _fileHandle:       fileHandle,
      _writable:         writable,
    };
  }

  it('writes blob to the stored directory when permission is granted', async () => {
    const dirHandle = makeDirHandle('granted');
    await storeAutoExportDirHandle(dirHandle);

    vi.mocked(triggerDownload).mockClear();
    await triggerAutoExport(mockTree, mockChats, '');

    expect(dirHandle.getFileHandle).toHaveBeenCalledWith(
      expect.stringMatching(/\.zip$/), { create: true }
    );
    expect(dirHandle._writable.write).toHaveBeenCalled();
    expect(dirHandle._writable.close).toHaveBeenCalled();
    expect(triggerDownload).not.toHaveBeenCalled();
  });

  it('requests permission when queryPermission returns "prompt"', async () => {
    const dirHandle = makeDirHandle();
    dirHandle.queryPermission.mockResolvedValue('prompt');
    dirHandle.requestPermission.mockResolvedValue('granted');
    await storeAutoExportDirHandle(dirHandle);

    await triggerAutoExport(mockTree, mockChats, '');
    expect(dirHandle.requestPermission).toHaveBeenCalledWith({ mode: 'readwrite' });
    expect(dirHandle._writable.write).toHaveBeenCalled();
  });

  it('falls back to triggerDownload when permission is denied', async () => {
    const dirHandle = makeDirHandle('denied');
    await storeAutoExportDirHandle(dirHandle);

    vi.mocked(triggerDownload).mockClear();
    await triggerAutoExport(mockTree, mockChats, '');
    expect(triggerDownload).toHaveBeenCalled();
  });

  it('falls back to triggerDownload when getFileHandle throws', async () => {
    const dirHandle = makeDirHandle('granted');
    dirHandle.getFileHandle.mockRejectedValue(new Error('disk full'));
    await storeAutoExportDirHandle(dirHandle);

    vi.mocked(triggerDownload).mockClear();
    await triggerAutoExport(mockTree, mockChats, '');
    expect(triggerDownload).toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// _buildFilename (tested indirectly via triggerDownload call)
// ─────────────────────────────────────────────────────────────────────────────

describe('filename format', () => {
  it('filename contains topic count, chat count and datetime', async () => {
    vi.mocked(triggerDownload).mockClear();
    await triggerAutoExport(mockTree, mockChats, '');
    const [filename] = vi.mocked(triggerDownload).mock.calls[0];
    // bAInder-2-topics-2-chats-auto-export-YYYY-MM-DD-HH-mm-ss.zip
    expect(filename).toMatch(/bAInder-2-topics-2-chats-auto-export-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}\.zip/);
  });

  it('filename reflects the filtered chat count when a topic filter is applied', async () => {
    vi.mocked(triggerDownload).mockClear();
    await triggerAutoExport(mockTree, mockChats, 'Work');
    const [filename] = vi.mocked(triggerDownload).mock.calls[0];
    // Only 1 chat passes the filter
    expect(filename).toContain('-1-chats-');
  });
});
