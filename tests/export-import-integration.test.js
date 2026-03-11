/**
 * @file export-import-integration.test.js
 * @description Comprehensive integration and UI flow tests for Stage 9:
 * ExportDialog, ImportDialog, and the mocked export→import round-trip.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ─── Mock JSZip via globalThis (dialogs use globalThis.JSZip, not a bare import) ─
// Use regular function (not arrow) for MockJSZip so `new MockJSZip()`
// works reliably in Vitest (arrow-function constructors generate a warning
// and may not return the instance object via `new`).
{
  const files = {};
  function MockJSZip() {
    return {
      file: function (path, content) { files[path] = content; },
      generateAsync: function () {
        return Promise.resolve(new Blob(['fake-zip-content'], { type: 'application/zip' }));
      },
      forEach: function (cb) {
        Object.entries(files).forEach(function ([path, content]) {
          cb(path, { dir: false, async: function () { return Promise.resolve(content); } });
        });
      },
      _files: files,
    };
  }
  // loadAsync must stay a vi.fn so tests can do .mockRejectedValueOnce
  MockJSZip.loadAsync = vi.fn(function () {
    return Promise.resolve(MockJSZip());
  });
  globalThis.JSZip = MockJSZip;
}

// ─── Mock export-engine ───────────────────────────────────────────────────────
vi.mock('../src/lib/export/export-engine.js', () => ({
  buildExportMarkdown: vi.fn((chat, topicPath) => `# ${chat.title}\n${topicPath}`),
  buildExportHtml:     vi.fn((chat, topicPath) => `<html><body>${chat.title}</body></html>`),
  buildZipPayload:     vi.fn(() => [{ path: 'bAInder-export/test.md', content: '# Test' }]),
  buildTopicPath:      vi.fn((id, map) => id ? 'Work > Projects' : 'Uncategorised'),
  triggerDownload:     vi.fn(),
  sanitizeFilename:    vi.fn((n) => (n || 'untitled').toLowerCase().replace(/\s+/g, '-')),
}));

// ─── Mock import-parser ───────────────────────────────────────────────────────
vi.mock('../src/lib/io/import-parser.js', () => ({
  validateZipFile: vi.fn(() => ({ valid: true })),
  parseZipEntries: vi.fn(() => ({
    topicFolders: new Map([
      ['Work', { name: 'Work', path: 'Work', children: [] }],
    ]),
    chatFiles: [
      {
        path: 'Work/test-chat.md',
        content: '---\ntitle: "Test Chat"\nsource: chatgpt\n---',
        topicPath: 'Work',
      },
    ],
    metadata: {
      export_version: '1.0',
      tree_structure: { total_chats: 1, total_topics: 1 },
    },
    warnings: [],
  })),
  buildImportPlan: vi.fn(() => ({
    topicsToCreate: [{ name: 'Work', folderPath: 'Work' }],
    topicsToMerge: [],
    chatsToImport: [
      {
        chatEntry: {
          id: 'imported_1',
          title: 'Test Chat',
          source: 'chatgpt',
          content: '---\ntitle: "Test Chat"\n---',
          timestamp: Date.now(),
          topicId: null,
          messages: [],
          messageCount: 0,
          metadata: { isExcerpt: false, importedAt: Date.now() },
          tags: [],
        },
        targetTopicPath: 'Work',
      },
    ],
    conflicts: [],
    summary: { topics: 1, chats: 1, conflicts: 0 },
  })),
  executeImport: vi.fn(() => ({
    updatedTopics: {
      topic_imported_1: {
        id: 'topic_imported_1',
        name: 'Work',
        parentId: null,
        children: [],
        chatIds: ['imported_1'],
        firstChatDate: null,
        lastChatDate: null,
      },
    },
    updatedRootTopics: ['topic_imported_1'],
    updatedChats: [
      {
        id: 'imported_1',
        title: 'Test Chat',
        source: 'chatgpt',
        topicId: 'topic_imported_1',
        content: '---\ntitle: "Test Chat"\n---',
        timestamp: Date.now(),
        messages: [],
        messageCount: 0,
        metadata: { isExcerpt: false },
        tags: [],
      },
    ],
    summary: { topicsCreated: 1, topicsMerged: 0, chatsImported: 1, errors: [] },
  })),
  parseChatFromMarkdown: vi.fn((content) => ({
    id: 'imported_1',
    title: 'Test Chat',
    source: 'chatgpt',
    content,
    timestamp: Date.now(),
    topicId: null,
    messages: [],
    messageCount: 0,
    metadata: { isExcerpt: false, importedAt: Date.now() },
    tags: [],
  })),
}));

// ─── Shared imports ───────────────────────────────────────────────────────────
import { DialogManager } from '../src/lib/dialogs/dialog-manager.js';
import { ExportDialog }  from '../src/lib/dialogs/export-dialog.js';
import { ImportDialog }  from '../src/lib/dialogs/import-dialog.js';
import {
  buildExportMarkdown,
  buildExportHtml,
  buildZipPayload,
  triggerDownload,
  buildTopicPath,
  sanitizeFilename,
} from '../src/lib/export/export-engine.js';
import {
  validateZipFile,
  parseZipEntries,
  buildImportPlan,
  executeImport,
} from '../src/lib/io/import-parser.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────
const mockTopic = {
  id: 'topic-1',
  name: 'Work',
  parentId: null,
  children: ['topic-2'],
  chatIds: ['chat-1'],
};
const mockTree = {
  topics: { 'topic-1': mockTopic },
  rootTopicIds: ['topic-1'],
};
const mockChat = {
  id: 'chat-1',
  title: 'Test Conversation',
  source: 'chatgpt',
  url: 'https://chat.openai.com/c/abc',
  timestamp: 1700000000000,
  topicId: 'topic-1',
  messages: [
    { role: 'user',      content: 'Hi'    },
    { role: 'assistant', content: 'Hello' },
  ],
  messageCount: 2,
  metadata:  { isExcerpt: false },
  tags: ['test'],
};
const mockChats = [mockChat];

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Flush the microtask queue by waiting one event-loop turn. */
const flush = () => new Promise((r) => setTimeout(r, 0));

/** Click an element and flush the microtask queue. */
async function click(el) {
  if (!el) throw new Error('click helper: element is null');
  el.click();
  await flush();
}

/**
 * Select a named radio by value, explicitly unchecking all siblings first.
 * happy-dom does NOT auto-uncheck radio siblings when `.checked` is set
 * programmatically, so the `:checked` pseudo-class selector can otherwise
 * match the wrong element.
 */
function selectRadio(ctr, name, value) {
  ctr.querySelectorAll(`input[name="${name}"]`).forEach((r) => { r.checked = false; });
  const target = ctr.querySelector(`input[name="${name}"][value="${value}"]`);
  if (!target) throw new Error(`selectRadio: no input[name="${name}"][value="${value}"]`);
  target.checked = true;
  target.dispatchEvent(new Event('change', { bubbles: true }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Part 1 — ExportDialog
// ─────────────────────────────────────────────────────────────────────────────

describe('ExportDialog — constructor', () => {
  let container, dialog, exportDialog;

  beforeEach(() => {
    container = document.createElement('div');
    container.id = 'modalContainer';
    document.body.appendChild(container);
    dialog = new DialogManager(container);
    exportDialog = new ExportDialog(dialog);
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  it('stores dialogManager reference', () => {
    expect(exportDialog.dialog).toBe(dialog);
  });

  it('showExportTopic is a function', () => {
    expect(typeof exportDialog.showExportTopic).toBe('function');
  });

  it('showExportChat is a function', () => {
    expect(typeof exportDialog.showExportChat).toBe('function');
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('ExportDialog — showExportTopic() — dialog rendering', () => {
  let container, dialog, exportDialog;

  beforeEach(() => {
    container = document.createElement('div');
    container.id = 'modalContainer';
    document.body.appendChild(container);
    dialog = new DialogManager(container);
    exportDialog = new ExportDialog(dialog);
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  it('null topic → calls dialog.alert and returns early', async () => {
    const alertSpy = vi.spyOn(dialog, 'alert').mockResolvedValue(undefined);
    await exportDialog.showExportTopic(null, mockTree, mockChats);
    expect(alertSpy).toHaveBeenCalledWith('No topic selected for export.', 'Export');
    expect(container.querySelector('.modal-content')).toBeNull();
  });

  it('null chats array → calls dialog.alert and returns early', async () => {
    const alertSpy = vi.spyOn(dialog, 'alert').mockResolvedValue(undefined);
    await exportDialog.showExportTopic(mockTopic, mockTree, null);
    expect(alertSpy).toHaveBeenCalledWith('Chat data is unavailable.', 'Export');
  });

  it('shows modal with class modal-content', async () => {
    exportDialog.showExportTopic(mockTopic, mockTree, mockChats);
    await flush();
    expect(container.querySelector('.modal-content')).not.toBeNull();
  });

  it('dialog contains markdown format radio button', async () => {
    exportDialog.showExportTopic(mockTopic, mockTree, mockChats);
    await flush();
    const md = container.querySelector('input[name="export-format"][value="markdown"]');
    expect(md).not.toBeNull();
  });

  it('dialog contains html format radio button', async () => {
    exportDialog.showExportTopic(mockTopic, mockTree, mockChats);
    await flush();
    const html = container.querySelector('input[name="export-format"][value="html"]');
    expect(html).not.toBeNull();
  });

  it('dialog contains pdf format radio button', async () => {
    exportDialog.showExportTopic(mockTopic, mockTree, mockChats);
    await flush();
    const pdf = container.querySelector('input[name="export-format"][value="pdf"]');
    expect(pdf).not.toBeNull();
  });

  it('dialog contains zip format radio button', async () => {
    exportDialog.showExportTopic(mockTopic, mockTree, mockChats);
    await flush();
    const zip = container.querySelector('input[name="export-format"][value="zip"]');
    expect(zip).not.toBeNull();
  });

  it('dialog contains scope radio buttons', async () => {
    exportDialog.showExportTopic(mockTopic, mockTree, mockChats);
    await flush();
    expect(container.querySelector('input[name="export-scope"][value="this-topic"]')).not.toBeNull();
    expect(container.querySelector('input[name="export-scope"][value="topic-recursive"]')).not.toBeNull();
    expect(container.querySelector('input[name="export-scope"][value="entire-tree"]')).not.toBeNull();
  });

  it('dialog contains style radio buttons', async () => {
    exportDialog.showExportTopic(mockTopic, mockTree, mockChats);
    await flush();
    const styleInputs = container.querySelectorAll('input[name="export-style"]');
    expect(styleInputs.length).toBeGreaterThan(0);
  });

  it('dialog contains Export button', async () => {
    exportDialog.showExportTopic(mockTopic, mockTree, mockChats);
    await flush();
    expect(container.querySelector('[data-action="export"]')).not.toBeNull();
  });

  it('dialog contains Cancel button', async () => {
    exportDialog.showExportTopic(mockTopic, mockTree, mockChats);
    await flush();
    expect(container.querySelector('[data-action="cancel"]')).not.toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('ExportDialog — showExportTopic() — format visibility', () => {
  let container, dialog, exportDialog;

  beforeEach(() => {
    container = document.createElement('div');
    container.id = 'modalContainer';
    document.body.appendChild(container);
    dialog = new DialogManager(container);
    exportDialog = new ExportDialog(dialog);
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  function selectFormat(value) { selectRadio(container, 'export-format', value); }

  it('selecting PDF format hides style section', async () => {
    exportDialog.showExportTopic(mockTopic, mockTree, mockChats);
    selectFormat('pdf');
    const styleSection = container.querySelector('#export-style-section');
    expect(styleSection.style.display).toBe('none');
  });

  it('selecting ZIP format hides style section', async () => {
    exportDialog.showExportTopic(mockTopic, mockTree, mockChats);
    selectFormat('zip');
    const styleSection = container.querySelector('#export-style-section');
    expect(styleSection.style.display).toBe('none');
  });

  it('selecting Markdown format shows style section', async () => {
    exportDialog.showExportTopic(mockTopic, mockTree, mockChats);
    // First hide by selecting pdf, then restore with markdown
    selectFormat('pdf');
    selectFormat('markdown');
    const styleSection = container.querySelector('#export-style-section');
    expect(styleSection.style.display).not.toBe('none');
  });

  it('selecting HTML format shows style section', async () => {
    exportDialog.showExportTopic(mockTopic, mockTree, mockChats);
    selectFormat('pdf');
    selectFormat('html');
    const styleSection = container.querySelector('#export-style-section');
    expect(styleSection.style.display).not.toBe('none');
  });

  it('ZIP format makes zip-note visible', async () => {
    exportDialog.showExportTopic(mockTopic, mockTree, mockChats);
    selectFormat('zip');
    const note = container.querySelector('#export-zip-note');
    expect(note.classList.contains('visible')).toBe(true);
  });

  it('Markdown format hides zip-note', async () => {
    exportDialog.showExportTopic(mockTopic, mockTree, mockChats);
    selectFormat('markdown');
    const note = container.querySelector('#export-zip-note');
    expect(note.classList.contains('visible')).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('ExportDialog — showExportTopic() — export actions', () => {
  let container, dialog, exportDialog;

  beforeEach(() => {
    container = document.createElement('div');
    container.id = 'modalContainer';
    document.body.appendChild(container);
    dialog = new DialogManager(container);
    exportDialog = new ExportDialog(dialog);
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  async function openTopicExport() {
    exportDialog.showExportTopic(mockTopic, mockTree, mockChats);
    await flush();
  }

  function selectFormat(value) { selectRadio(container, 'export-format', value); }
  function selectScope(value)  { selectRadio(container, 'export-scope',  value); }

  it('Markdown + this-topic: clicking Export calls buildExportMarkdown', async () => {
    await openTopicExport();
    selectFormat('markdown');
    selectScope('this-topic');
    await click(container.querySelector('[data-action="export"]'));
    expect(buildExportMarkdown).toHaveBeenCalled();
  });

  it('Markdown + this-topic: clicking Export calls triggerDownload', async () => {
    await openTopicExport();
    selectFormat('markdown');
    selectScope('this-topic');
    await click(container.querySelector('[data-action="export"]'));
    expect(triggerDownload).toHaveBeenCalled();
  });

  it('ZIP + entire-tree: clicking Export calls buildZipPayload', async () => {
    await openTopicExport();
    selectFormat('zip');
    selectScope('entire-tree');
    await click(container.querySelector('[data-action="export"]'));
    await flush();
    expect(buildZipPayload).toHaveBeenCalled();
  });

  it('ZIP + entire-tree: clicking Export calls triggerDownload with a Blob', async () => {
    await openTopicExport();
    selectFormat('zip');
    selectScope('entire-tree');
    await click(container.querySelector('[data-action="export"]'));
    await flush();
    expect(triggerDownload).toHaveBeenCalled();
    const blobArg = triggerDownload.mock.calls[0][1];
    expect(blobArg).toBeInstanceOf(Blob);
  });

  it('Cancel button closes dialog (container no longer visible)', async () => {
    await openTopicExport();
    await click(container.querySelector('[data-action="cancel"]'));
    expect(container.style.display).toBe('none');
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('ExportDialog — showExportChat() — dialog rendering', () => {
  let container, dialog, exportDialog;

  beforeEach(() => {
    container = document.createElement('div');
    container.id = 'modalContainer';
    document.body.appendChild(container);
    dialog = new DialogManager(container);
    exportDialog = new ExportDialog(dialog);
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  it('null chat → calls dialog.alert and returns early', async () => {
    const alertSpy = vi.spyOn(dialog, 'alert').mockResolvedValue(undefined);
    await exportDialog.showExportChat(null, mockTree);
    expect(alertSpy).toHaveBeenCalledWith('No chat selected for export.', 'Export');
    expect(container.querySelector('.modal-content')).toBeNull();
  });

  it('shows modal with format radio buttons (markdown, html, pdf)', async () => {
    exportDialog.showExportChat(mockChat, mockTree);
    await flush();
    expect(container.querySelector('input[name="export-format"][value="markdown"]')).not.toBeNull();
    expect(container.querySelector('input[name="export-format"][value="html"]')).not.toBeNull();
    expect(container.querySelector('input[name="export-format"][value="pdf"]')).not.toBeNull();
  });

  it('does NOT include zip format radio in chat mode', async () => {
    exportDialog.showExportChat(mockChat, mockTree);
    await flush();
    expect(container.querySelector('input[name="export-format"][value="zip"]')).toBeNull();
  });

  it('does NOT show scope section in chat mode', async () => {
    exportDialog.showExportChat(mockChat, mockTree);
    await flush();
    expect(container.querySelector('#export-scope-group')).toBeNull();
    expect(container.querySelector('input[name="export-scope"]')).toBeNull();
  });

  it('shows style section in chat mode', async () => {
    exportDialog.showExportChat(mockChat, mockTree);
    await flush();
    expect(container.querySelector('#export-style-section')).not.toBeNull();
    const styleInputs = container.querySelectorAll('input[name="export-style"]');
    expect(styleInputs.length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('ExportDialog — showExportChat() — export actions', () => {
  let container, dialog, exportDialog;

  beforeEach(() => {
    container = document.createElement('div');
    container.id = 'modalContainer';
    document.body.appendChild(container);
    dialog = new DialogManager(container);
    exportDialog = new ExportDialog(dialog);
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  function openChatExport() { exportDialog.showExportChat(mockChat, mockTree); }
  function selectFormat(value) { selectRadio(container, 'export-format', value); }

  it('Markdown: clicking Export calls buildExportMarkdown', async () => {
    openChatExport();
    selectFormat('markdown');
    await click(container.querySelector('[data-action="export"]'));
    expect(buildExportMarkdown).toHaveBeenCalledWith(
      mockChat,
      expect.any(String),
    );
  });

  it('Markdown: clicking Export calls triggerDownload', async () => {
    openChatExport();
    selectFormat('markdown');
    await click(container.querySelector('[data-action="export"]'));
    expect(triggerDownload).toHaveBeenCalled();
    const [filename, , mimeType] = triggerDownload.mock.calls[0];
    expect(filename).toMatch(/\.md$/);
    expect(mimeType).toBe('text/markdown');
  });

  it('HTML: clicking Export calls buildExportHtml', async () => {
    openChatExport();
    selectFormat('html');
    await click(container.querySelector('[data-action="export"]'));
    expect(buildExportHtml).toHaveBeenCalledWith(
      mockChat,
      expect.any(String),
      expect.any(Object),
    );
  });

  it('HTML: clicking Export calls triggerDownload with .html filename', async () => {
    openChatExport();
    selectFormat('html');
    await click(container.querySelector('[data-action="export"]'));
    expect(triggerDownload).toHaveBeenCalled();
    const [filename, , mimeType] = triggerDownload.mock.calls[0];
    expect(filename).toMatch(/\.html$/);
    expect(mimeType).toBe('text/html');
  });

  it('Cancel button closes dialog', async () => {
    openChatExport();
    await click(container.querySelector('[data-action="cancel"]'));
    expect(container.style.display).toBe('none');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Part 2 — ImportDialog
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ImportDialog.showImportDialog() does `await this.dialog.show(html)`, but
 * DialogManager.show() only resolves when dialog.close() is called — so
 * _initDialog() is never reached through the normal async flow in a test.
 *
 * We bypass this by:
 *   1. Injecting the dialog HTML directly into the container (replicating
 *      what DialogManager.show() does synchronously in its Promise body).
 *   2. Calling importDialog._initDialog() manually to register all listeners.
 *   3. Spying on dialog.alert so it never replaces the import-dialog DOM.
 */
function injectImportDialogDOM(importDialog, container) {
  const html = importDialog._buildDialogHtml();
  const modal = document.createElement('div');
  modal.className = 'modal';
  const mc = document.createElement('div');
  mc.className = 'modal-content large';
  mc.innerHTML = html;
  modal.appendChild(mc);
  container.innerHTML = '';
  container.appendChild(modal);
  container.style.display = 'flex';
}

async function openImportDialog(importDialog, dialog, container, {
  tree = mockTree,
  chats = mockChats,
  onComplete = vi.fn().mockResolvedValue(undefined),
} = {}) {
  injectImportDialogDOM(importDialog, container);
  importDialog._initDialog(tree, chats, onComplete);
  await flush();
  return onComplete;
}

function simulateFileInput(container, file) {
  const fileInput = document.getElementById('importFileInput');
  Object.defineProperty(fileInput, 'files', { value: [file], configurable: true });
  fileInput.dispatchEvent(new Event('change'));
}

const fakeZip = () => new File(['fake-zip'], 'export.zip', { type: 'application/zip' });

// ────────────────────────────────────────────────────

describe('ImportDialog — constructor', () => {
  let container, dialog, importDialog;

  beforeEach(() => {
    container = document.createElement('div');
    container.id = 'modalContainer';
    document.body.appendChild(container);
    dialog = new DialogManager(container);
    importDialog = new ImportDialog(dialog);
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  it('stores dialogManager reference', () => {
    expect(importDialog.dialog).toBe(dialog);
  });

  it('showImportDialog is a function', () => {
    expect(typeof importDialog.showImportDialog).toBe('function');
  });
});

// ────────────────────────────────────────────────────

describe('ImportDialog — showImportDialog() — Phase 1 rendering', () => {
  let container, dialog, importDialog;

  beforeEach(async () => {
    container = document.createElement('div');
    container.id = 'modalContainer';
    document.body.appendChild(container);
    dialog = new DialogManager(container);
    vi.spyOn(dialog, 'alert').mockResolvedValue(undefined);
    importDialog = new ImportDialog(dialog);
    await openImportDialog(importDialog, dialog, container);
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  it('shows a drop zone', () => {
    expect(document.getElementById('importDropZone')).not.toBeNull();
  });

  it('shows merge strategy radio', () => {
    expect(container.querySelector('input[name="importStrategy"][value="merge"]')).not.toBeNull();
  });

  it('shows replace strategy radio', () => {
    expect(container.querySelector('input[name="importStrategy"][value="replace"]')).not.toBeNull();
  });

  it('shows new-root strategy radio', () => {
    expect(container.querySelector('input[name="importStrategy"][value="new-root"]')).not.toBeNull();
  });

  it('Import button is initially disabled', () => {
    expect(document.getElementById('importStartBtn').disabled).toBe(true);
  });

  it('Phase 1 is initially active', () => {
    expect(document.getElementById('importPhase1').classList.contains('active')).toBe(true);
  });

  it('Cancel button calls dialog.close', async () => {
    const closeSpy = vi.spyOn(dialog, 'close');
    await click(document.getElementById('importCancelBtn1'));
    expect(closeSpy).toHaveBeenCalled();
  });
});

// ────────────────────────────────────────────────────

describe('ImportDialog — showImportDialog() — file selection', () => {
  let container, dialog, importDialog;

  beforeEach(async () => {
    container = document.createElement('div');
    container.id = 'modalContainer';
    document.body.appendChild(container);
    dialog = new DialogManager(container);
    vi.spyOn(dialog, 'alert').mockResolvedValue(undefined);
    importDialog = new ImportDialog(dialog);
    await openImportDialog(importDialog, dialog, container);
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  it('after valid file selected, Import button becomes enabled', async () => {
    simulateFileInput(container, fakeZip());
    await flush();
    expect(document.getElementById('importStartBtn').disabled).toBe(false);
  });

  it('validateZipFile is called with the chosen file', async () => {
    const file = fakeZip();
    simulateFileInput(container, file);
    await flush();
    expect(validateZipFile).toHaveBeenCalledWith(file);
  });

  it('file chip shows the file name after selection', async () => {
    simulateFileInput(container, new File(['data'], 'my-export.zip', { type: 'application/zip' }));
    await flush();
    expect(document.getElementById('importFileName').textContent).toContain('my-export.zip');
  });

  it('drop zone gains file-selected CSS class', async () => {
    simulateFileInput(container, fakeZip());
    await flush();
    expect(document.getElementById('importDropZone').classList.contains('file-selected')).toBe(true);
  });

  it('invalid file — dialog.alert is called with error detail', async () => {
    validateZipFile.mockReturnValueOnce({ valid: false, error: 'Bad format' });
    simulateFileInput(container, fakeZip());
    await flush();
    expect(dialog.alert).toHaveBeenCalled();
    expect(dialog.alert.mock.calls[0][0]).toContain('Bad format');
  });

  it('invalid file — Import button stays disabled', async () => {
    validateZipFile.mockReturnValueOnce({ valid: false, error: 'Bad format' });
    simulateFileInput(container, fakeZip());
    await flush();
    expect(document.getElementById('importStartBtn').disabled).toBe(true);
  });
});

// ────────────────────────────────────────────────────

describe('ImportDialog — showImportDialog() — Phase 2 (Preview)', () => {
  let container, dialog, importDialog;

  async function openSelectAndPreview() {
    await openImportDialog(importDialog, dialog, container);
    simulateFileInput(container, fakeZip());
    await flush();
    await click(document.getElementById('importStartBtn'));
    await flush();
  }

  beforeEach(() => {
    container = document.createElement('div');
    container.id = 'modalContainer';
    document.body.appendChild(container);
    dialog = new DialogManager(container);
    vi.spyOn(dialog, 'alert').mockResolvedValue(undefined);
    importDialog = new ImportDialog(dialog);
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  it('clicking Import transitions to Phase 2 (active class)', async () => {
    await openSelectAndPreview();
    expect(document.getElementById('importPhase2').classList.contains('active')).toBe(true);
  });

  it('Phase 2 shows correct topics-to-create count', async () => {
    await openSelectAndPreview();
    expect(document.getElementById('sumTopicsCreate').textContent).toBe('1');
  });

  it('Phase 2 shows correct chats-to-import count', async () => {
    await openSelectAndPreview();
    expect(document.getElementById('sumChats').textContent).toBe('1');
  });

  it('Phase 2 shows correct conflict count', async () => {
    await openSelectAndPreview();
    expect(document.getElementById('sumConflicts').textContent).toBe('0');
  });

  it('Back button returns to Phase 1', async () => {
    await openSelectAndPreview();
    await click(document.getElementById('importBackBtn'));
    expect(document.getElementById('importPhase1').classList.contains('active')).toBe(true);
  });

  it('parseZipEntries is called during preparation', async () => {
    await openSelectAndPreview();
    expect(parseZipEntries).toHaveBeenCalled();
  });

  it('buildImportPlan is called during preparation', async () => {
    await openSelectAndPreview();
    expect(buildImportPlan).toHaveBeenCalled();
  });
});

// ────────────────────────────────────────────────────

describe('ImportDialog — showImportDialog() — Phase 3 (Import)', () => {
  let container, dialog, importDialog;

  async function openPreviewAndImport(onComplete) {
    await openImportDialog(importDialog, dialog, container, { onComplete });
    simulateFileInput(container, fakeZip());
    await flush();
    await click(document.getElementById('importStartBtn'));
    await flush();
    await click(document.getElementById('importNowBtn'));
    await flush();
  }

  beforeEach(() => {
    container = document.createElement('div');
    container.id = 'modalContainer';
    document.body.appendChild(container);
    dialog = new DialogManager(container);
    vi.spyOn(dialog, 'alert').mockResolvedValue(undefined);
    vi.spyOn(dialog, 'confirm').mockResolvedValue(true);
    importDialog = new ImportDialog(dialog);
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  it('clicking Import Now calls executeImport', async () => {
    await openPreviewAndImport(vi.fn().mockResolvedValue(undefined));
    expect(executeImport).toHaveBeenCalled();
  });

  it('onComplete is called with correct shape', async () => {
    const onComplete = vi.fn().mockResolvedValue(undefined);
    await openPreviewAndImport(onComplete);
    expect(onComplete).toHaveBeenCalledWith(
      expect.objectContaining({ topic_imported_1: expect.any(Object) }),
      expect.arrayContaining(['topic_imported_1']),
      expect.arrayContaining([expect.objectContaining({ id: 'imported_1' })]),
      expect.objectContaining({ topicsCreated: 1, chatsImported: 1 }),
    );
  });

  it('Phase 3 becomes active after import', async () => {
    await openPreviewAndImport(vi.fn().mockResolvedValue(undefined));
    expect(document.getElementById('importPhase3').classList.contains('active')).toBe(true);
  });

  it('done content becomes visible', async () => {
    await openPreviewAndImport(vi.fn().mockResolvedValue(undefined));
    expect(document.getElementById('importDoneContent').style.display).toBe('block');
  });

  it('done header says Import Complete', async () => {
    await openPreviewAndImport(vi.fn().mockResolvedValue(undefined));
    expect(document.querySelector('.dim-done-header').textContent).toContain('Import complete');
  });

  it('Done button calls dialog.close', async () => {
    const closeSpy = vi.spyOn(dialog, 'close');
    await openPreviewAndImport(vi.fn().mockResolvedValue(undefined));
    await click(document.getElementById('importDoneBtn'));
    expect(closeSpy).toHaveBeenCalled();
  });

  it('Replace strategy: confirm dialog is shown before import', async () => {
    await openImportDialog(importDialog, dialog, container, {
      onComplete: vi.fn().mockResolvedValue(undefined),
    });
    selectRadio(container, 'importStrategy', 'replace');
    simulateFileInput(container, fakeZip());
    await flush();
    await click(document.getElementById('importStartBtn'));
    await flush();
    await click(document.getElementById('importNowBtn'));
    await flush();
    expect(dialog.confirm).toHaveBeenCalled();
  });

  it('Replace strategy + confirmation cancelled: executeImport NOT called', async () => {
    dialog.confirm.mockResolvedValue(false);
    await openImportDialog(importDialog, dialog, container, {
      onComplete: vi.fn().mockResolvedValue(undefined),
    });
    selectRadio(container, 'importStrategy', 'replace');
    simulateFileInput(container, fakeZip());
    await flush();
    await click(document.getElementById('importStartBtn'));
    await flush();
    await click(document.getElementById('importNowBtn'));
    await flush();
    expect(executeImport).not.toHaveBeenCalled();
  });
});

// ────────────────────────────────────────────────────

describe('ImportDialog — showImportDialog() — error handling', () => {
  let container, dialog, importDialog;

  async function openWithFile(onComplete) {
    await openImportDialog(importDialog, dialog, container, { onComplete });
    simulateFileInput(container, fakeZip());
    await flush();
  }

  beforeEach(() => {
    container = document.createElement('div');
    container.id = 'modalContainer';
    document.body.appendChild(container);
    dialog = new DialogManager(container);
    vi.spyOn(dialog, 'alert').mockResolvedValue(undefined);
    vi.spyOn(dialog, 'confirm').mockResolvedValue(true);
    importDialog = new ImportDialog(dialog);
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  it('JSZip.loadAsync rejects → inline error is shown', async () => {
    globalThis.JSZip.loadAsync.mockRejectedValueOnce(new Error('Corrupt zip'));
    await openWithFile();
    await click(document.getElementById('importStartBtn'));
    await flush();
    const errEl = document.getElementById('importPhase1Error');
    expect(errEl.classList.contains('visible')).toBe(true);
    expect(errEl.textContent).toContain('Corrupt zip');
  });

  it('JSZip.loadAsync rejects → stays on Phase 1', async () => {
    globalThis.JSZip.loadAsync.mockRejectedValueOnce(new Error('Corrupt zip'));
    await openWithFile();
    await click(document.getElementById('importStartBtn'));
    await flush();
    expect(document.getElementById('importPhase1').classList.contains('active')).toBe(true);
  });

  it('JSZip.loadAsync rejects → Import button is re-enabled', async () => {
    globalThis.JSZip.loadAsync.mockRejectedValueOnce(new Error('Bad zip'));
    await openWithFile();
    await click(document.getElementById('importStartBtn'));
    await flush();
    expect(document.getElementById('importStartBtn').disabled).toBe(false);
  });

  it('executeImport throws → dialog.alert is called with error message', async () => {
    executeImport.mockImplementationOnce(() => { throw new Error('DB write fail'); });
    await openWithFile();
    await click(document.getElementById('importStartBtn'));
    await flush();
    await click(document.getElementById('importNowBtn'));
    await flush();
    expect(dialog.alert).toHaveBeenCalled();
    expect(dialog.alert.mock.calls.at(-1)[0]).toContain('DB write fail');
  });

  it('onComplete throws → dialog.alert is called', async () => {
    const onComplete = vi.fn().mockRejectedValueOnce(new Error('Callback boom'));
    await openWithFile(onComplete);
    await click(document.getElementById('importStartBtn'));
    await flush();
    await click(document.getElementById('importNowBtn'));
    await flush();
    expect(dialog.alert).toHaveBeenCalled();
    expect(dialog.alert.mock.calls.at(-1)[0]).toContain('Callback boom');
  });

  it('onComplete throws → does not crash silently', async () => {
    const onComplete = vi.fn().mockRejectedValueOnce(new Error('Callback boom'));
    await openWithFile(onComplete);
    await click(document.getElementById('importStartBtn'));
    await flush();
    await expect(
      click(document.getElementById('importNowBtn')).then(() => flush()),
    ).resolves.toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Part 3 — Mocked Round-Trip Flow
// ─────────────────────────────────────────────────────────────────────────────

describe('Round-trip flow — mocked engine → ImportDialog → onComplete', () => {
  let container, dialog, importDialog;

  async function runFullFlow(onComplete = vi.fn().mockResolvedValue(undefined)) {
    await openImportDialog(importDialog, dialog, container, { onComplete });
    simulateFileInput(container, fakeZip());
    await flush();
    await click(document.getElementById('importStartBtn'));
    await flush();
    await click(document.getElementById('importNowBtn'));
    await flush();
    return onComplete;
  }

  beforeEach(() => {
    container = document.createElement('div');
    container.id = 'modalContainer';
    document.body.appendChild(container);
    dialog = new DialogManager(container);
    vi.spyOn(dialog, 'alert').mockResolvedValue(undefined);
    vi.spyOn(dialog, 'confirm').mockResolvedValue(true);
    importDialog = new ImportDialog(dialog);
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  it('full pipeline: validateZipFile is called', async () => {
    await runFullFlow();
    expect(validateZipFile).toHaveBeenCalled();
  });

  it('full pipeline: parseZipEntries is called', async () => {
    await runFullFlow();
    expect(parseZipEntries).toHaveBeenCalled();
  });

  it('full pipeline: buildImportPlan is called', async () => {
    await runFullFlow();
    expect(buildImportPlan).toHaveBeenCalled();
  });

  it('full pipeline: executeImport is called', async () => {
    await runFullFlow();
    expect(executeImport).toHaveBeenCalled();
  });

  it('onComplete receives updatedTopics as a non-null object', async () => {
    const onComplete = await runFullFlow();
    const [updatedTopics] = onComplete.mock.calls[0];
    expect(typeof updatedTopics).toBe('object');
    expect(updatedTopics).not.toBeNull();
  });

  it('onComplete receives updatedRootTopics as an array', async () => {
    const onComplete = await runFullFlow();
    const [, updatedRootTopics] = onComplete.mock.calls[0];
    expect(Array.isArray(updatedRootTopics)).toBe(true);
  });

  it('onComplete receives updatedChats as an array', async () => {
    const onComplete = await runFullFlow();
    const [, , updatedChats] = onComplete.mock.calls[0];
    expect(Array.isArray(updatedChats)).toBe(true);
  });

  it('onComplete receives summary with required properties', async () => {
    const onComplete = await runFullFlow();
    const [, , , summary] = onComplete.mock.calls[0];
    expect(summary).toHaveProperty('topicsCreated');
    expect(summary).toHaveProperty('chatsImported');
    expect(summary).toHaveProperty('errors');
  });

  it('imported chat has correct title', async () => {
    const onComplete = await runFullFlow();
    const [, , updatedChats] = onComplete.mock.calls[0];
    expect(updatedChats[0].title).toBe('Test Chat');
  });

  it('imported chat has correct source', async () => {
    const onComplete = await runFullFlow();
    const [, , updatedChats] = onComplete.mock.calls[0];
    expect(updatedChats[0].source).toBe('chatgpt');
  });

  it('done screen displays correct topics-created count', async () => {
    await runFullFlow();
    expect(document.getElementById('doneTopicsCreated').textContent).toBe('1');
  });

  it('done screen displays correct chats-imported count', async () => {
    await runFullFlow();
    expect(document.getElementById('doneChatsImported').textContent).toBe('1');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Part 4 — showImportDialog() public API (tests the real entry-point)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * These tests call showImportDialog() directly (the public API) rather than
 * the _initDialog() workaround used above.  They verify that the bug where
 * `await this.dialog.show()` blocked _initDialog from ever running is fixed.
 */
describe('ImportDialog — showImportDialog() public API wiring', () => {
  let container, dialog, importDialog;

  function openViaPublicAPI(onComplete = vi.fn().mockResolvedValue(undefined)) {
    // Do NOT await — the promise only resolves when dialog.close() is called.
    importDialog.showImportDialog(mockTree, mockChats, onComplete);
  }

  beforeEach(() => {
    container = document.createElement('div');
    container.id = 'modalContainer';
    document.body.appendChild(container);
    dialog = new DialogManager(container);
    vi.spyOn(dialog, 'alert').mockResolvedValue(undefined);
    vi.spyOn(dialog, 'confirm').mockResolvedValue(true);
    importDialog = new ImportDialog(dialog);
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  it('DOM is available immediately after showImportDialog() call', async () => {
    openViaPublicAPI();
    await flush();
    expect(document.getElementById('importStartBtn')).not.toBeNull();
    expect(document.getElementById('importPhase1')).not.toBeNull();
  });

  it('Import button is disabled before file selection', async () => {
    openViaPublicAPI();
    await flush();
    expect(document.getElementById('importStartBtn').disabled).toBe(true);
  });

  it('file selection enables Import button', async () => {
    openViaPublicAPI();
    await flush();
    simulateFileInput(container, fakeZip());
    await flush();
    expect(document.getElementById('importStartBtn').disabled).toBe(false);
  });

  it('clicking Import ▶ transitions to Phase 2', async () => {
    openViaPublicAPI();
    await flush();
    simulateFileInput(container, fakeZip());
    await flush();
    await click(document.getElementById('importStartBtn'));
    await flush();
    expect(document.getElementById('importPhase2').classList.contains('active')).toBe(true);
  });

  it('clicking Import Now ▶ calls executeImport', async () => {
    openViaPublicAPI();
    await flush();
    simulateFileInput(container, fakeZip());
    await flush();
    await click(document.getElementById('importStartBtn'));
    await flush();
    await click(document.getElementById('importNowBtn'));
    await flush();
    expect(executeImport).toHaveBeenCalled();
  });

  it('onComplete is invoked after Import Now ▶', async () => {
    const onComplete = vi.fn().mockResolvedValue(undefined);
    openViaPublicAPI(onComplete);
    await flush();
    simulateFileInput(container, fakeZip());
    await flush();
    await click(document.getElementById('importStartBtn'));
    await flush();
    await click(document.getElementById('importNowBtn'));
    await flush();
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('Phase 3 done screen is shown after successful import', async () => {
    openViaPublicAPI();
    await flush();
    simulateFileInput(container, fakeZip());
    await flush();
    await click(document.getElementById('importStartBtn'));
    await flush();
    await click(document.getElementById('importNowBtn'));
    await flush();
    expect(document.getElementById('importPhase3').classList.contains('active')).toBe(true);
    expect(document.getElementById('importDoneContent').style.display).toBe('block');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Part 5 — Strategy forwarding to buildImportPlan
// ─────────────────────────────────────────────────────────────────────────────

describe('ImportDialog — strategy forwarding to buildImportPlan', () => {
  let container, dialog, importDialog;

  async function openAndClickImport(strategy) {
    await openImportDialog(importDialog, dialog, container);
    selectRadio(container, 'importStrategy', strategy);
    simulateFileInput(container, fakeZip());
    await flush();
    await click(document.getElementById('importStartBtn'));
    await flush();
  }

  beforeEach(() => {
    container = document.createElement('div');
    container.id = 'modalContainer';
    document.body.appendChild(container);
    dialog = new DialogManager(container);
    vi.spyOn(dialog, 'alert').mockResolvedValue(undefined);
    importDialog = new ImportDialog(dialog);
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  it('merge strategy: buildImportPlan is called with "merge"', async () => {
    await openAndClickImport('merge');
    expect(buildImportPlan).toHaveBeenCalledWith(
      expect.anything(), expect.anything(), 'merge'
    );
  });

  it('replace strategy: buildImportPlan is called with "replace"', async () => {
    await openAndClickImport('replace');
    expect(buildImportPlan).toHaveBeenCalledWith(
      expect.anything(), expect.anything(), 'replace'
    );
  });

  it('new-root strategy: buildImportPlan is called with "new-root"', async () => {
    await openAndClickImport('new-root');
    expect(buildImportPlan).toHaveBeenCalledWith(
      expect.anything(), expect.anything(), 'new-root'
    );
  });

  it('default strategy (no explicit selection) is "merge"', async () => {
    // No selectRadio call — rely on the default checked radio in the HTML
    await openImportDialog(importDialog, dialog, container);
    simulateFileInput(container, fakeZip());
    await flush();
    await click(document.getElementById('importStartBtn'));
    await flush();
    expect(buildImportPlan).toHaveBeenCalledWith(
      expect.anything(), expect.anything(), 'merge'
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Part 6 — Merge path end-to-end
// ─────────────────────────────────────────────────────────────────────────────

describe('ImportDialog — Merge strategy end-to-end', () => {
  let container, dialog, importDialog;

  async function runMergeFlow(onComplete = vi.fn().mockResolvedValue(undefined)) {
    await openImportDialog(importDialog, dialog, container, { onComplete });
    selectRadio(container, 'importStrategy', 'merge');
    simulateFileInput(container, fakeZip());
    await flush();
    await click(document.getElementById('importStartBtn'));
    await flush();
    await click(document.getElementById('importNowBtn'));
    await flush();
    return onComplete;
  }

  beforeEach(() => {
    container = document.createElement('div');
    container.id = 'modalContainer';
    document.body.appendChild(container);
    dialog = new DialogManager(container);
    vi.spyOn(dialog, 'alert').mockResolvedValue(undefined);
    vi.spyOn(dialog, 'confirm').mockResolvedValue(true);
    importDialog = new ImportDialog(dialog);
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  it('merge: no confirmation dialog is shown', async () => {
    await runMergeFlow();
    expect(dialog.confirm).not.toHaveBeenCalled();
  });

  it('merge: executeImport is called', async () => {
    await runMergeFlow();
    expect(executeImport).toHaveBeenCalled();
  });

  it('merge: onComplete is invoked', async () => {
    const onComplete = await runMergeFlow();
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('merge: Phase 3 becomes active', async () => {
    await runMergeFlow();
    expect(document.getElementById('importPhase3').classList.contains('active')).toBe(true);
  });

  it('merge: done content is visible', async () => {
    await runMergeFlow();
    expect(document.getElementById('importDoneContent').style.display).toBe('block');
  });

  it('merge: done screen shows correct topics-created count', async () => {
    await runMergeFlow();
    expect(document.getElementById('doneTopicsCreated').textContent).toBe('1');
  });

  it('merge: done screen shows correct chats-imported count', async () => {
    await runMergeFlow();
    expect(document.getElementById('doneChatsImported').textContent).toBe('1');
  });

  it('merge: inProgress indicator is hidden after completion', async () => {
    await runMergeFlow();
    expect(document.getElementById('importInProgress').style.display).toBe('none');
  });

  it('merge: Done ✓ button is visible', async () => {
    await runMergeFlow();
    expect(document.getElementById('importDoneBtnRow').style.display).toBe('flex');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Part 7 — Replace strategy end-to-end
// ─────────────────────────────────────────────────────────────────────────────

describe('ImportDialog — Replace strategy end-to-end', () => {
  let container, dialog, importDialog;

  async function setupToPhase2() {
    await openImportDialog(importDialog, dialog, container, {
      onComplete: vi.fn().mockResolvedValue(undefined),
    });
    selectRadio(container, 'importStrategy', 'replace');
    simulateFileInput(container, fakeZip());
    await flush();
    await click(document.getElementById('importStartBtn'));
    await flush();
  }

  beforeEach(() => {
    container = document.createElement('div');
    container.id = 'modalContainer';
    document.body.appendChild(container);
    dialog = new DialogManager(container);
    vi.spyOn(dialog, 'alert').mockResolvedValue(undefined);
    vi.spyOn(dialog, 'confirm').mockResolvedValue(true);
    importDialog = new ImportDialog(dialog);
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  it('replace: confirm dialog is shown when Import Now ▶ is clicked', async () => {
    await setupToPhase2();
    await click(document.getElementById('importNowBtn'));
    await flush();
    expect(dialog.confirm).toHaveBeenCalled();
  });

  it('replace confirmed: executeImport is called', async () => {
    await setupToPhase2();
    await click(document.getElementById('importNowBtn'));
    await flush();
    expect(executeImport).toHaveBeenCalled();
  });

  it('replace confirmed: onComplete is invoked', async () => {
    const onComplete = vi.fn().mockResolvedValue(undefined);
    await openImportDialog(importDialog, dialog, container, { onComplete });
    selectRadio(container, 'importStrategy', 'replace');
    simulateFileInput(container, fakeZip());
    await flush();
    await click(document.getElementById('importStartBtn'));
    await flush();
    await click(document.getElementById('importNowBtn'));
    await flush();
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('replace confirmed: Phase 3 becomes active', async () => {
    await setupToPhase2();
    await click(document.getElementById('importNowBtn'));
    await flush();
    expect(document.getElementById('importPhase3').classList.contains('active')).toBe(true);
  });

  it('replace confirmed: done screen is visible', async () => {
    await setupToPhase2();
    await click(document.getElementById('importNowBtn'));
    await flush();
    expect(document.getElementById('importDoneContent').style.display).toBe('block');
  });

  it('replace cancelled: executeImport is NOT called', async () => {
    dialog.confirm.mockResolvedValueOnce(false);
    await setupToPhase2();
    await click(document.getElementById('importNowBtn'));
    await flush();
    expect(executeImport).not.toHaveBeenCalled();
  });

  it('replace cancelled: stays on Phase 2', async () => {
    dialog.confirm.mockResolvedValueOnce(false);
    await setupToPhase2();
    await click(document.getElementById('importNowBtn'));
    await flush();
    expect(document.getElementById('importPhase2').classList.contains('active')).toBe(true);
  });

  it('replace cancelled: onComplete is NOT called', async () => {
    dialog.confirm.mockResolvedValueOnce(false);
    const onComplete = vi.fn().mockResolvedValue(undefined);
    await openImportDialog(importDialog, dialog, container, { onComplete });
    selectRadio(container, 'importStrategy', 'replace');
    simulateFileInput(container, fakeZip());
    await flush();
    await click(document.getElementById('importStartBtn'));
    await flush();
    await click(document.getElementById('importNowBtn'));
    await flush();
    expect(onComplete).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Part 8 — New-Root strategy end-to-end
// ─────────────────────────────────────────────────────────────────────────────

describe('ImportDialog — New-Root strategy end-to-end', () => {
  let container, dialog, importDialog;

  async function runNewRootFlow(onComplete = vi.fn().mockResolvedValue(undefined)) {
    await openImportDialog(importDialog, dialog, container, { onComplete });
    selectRadio(container, 'importStrategy', 'new-root');
    simulateFileInput(container, fakeZip());
    await flush();
    await click(document.getElementById('importStartBtn'));
    await flush();
    await click(document.getElementById('importNowBtn'));
    await flush();
    return onComplete;
  }

  beforeEach(() => {
    container = document.createElement('div');
    container.id = 'modalContainer';
    document.body.appendChild(container);
    dialog = new DialogManager(container);
    vi.spyOn(dialog, 'alert').mockResolvedValue(undefined);
    vi.spyOn(dialog, 'confirm').mockResolvedValue(true);
    importDialog = new ImportDialog(dialog);
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  it('new-root: no confirmation dialog is shown', async () => {
    await runNewRootFlow();
    expect(dialog.confirm).not.toHaveBeenCalled();
  });

  it('new-root: buildImportPlan is called with "new-root"', async () => {
    await runNewRootFlow();
    expect(buildImportPlan).toHaveBeenCalledWith(
      expect.anything(), expect.anything(), 'new-root'
    );
  });

  it('new-root: executeImport is called', async () => {
    await runNewRootFlow();
    expect(executeImport).toHaveBeenCalled();
  });

  it('new-root: onComplete is invoked', async () => {
    const onComplete = await runNewRootFlow();
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('new-root: Phase 3 becomes active', async () => {
    await runNewRootFlow();
    expect(document.getElementById('importPhase3').classList.contains('active')).toBe(true);
  });

  it('new-root: done content is visible', async () => {
    await runNewRootFlow();
    expect(document.getElementById('importDoneContent').style.display).toBe('block');
  });

  it('new-root: done screen shows correct topics-created count', async () => {
    await runNewRootFlow();
    expect(document.getElementById('doneTopicsCreated').textContent).toBe('1');
  });

  it('new-root: done screen shows correct chats-imported count', async () => {
    await runNewRootFlow();
    expect(document.getElementById('doneChatsImported').textContent).toBe('1');
  });
});
