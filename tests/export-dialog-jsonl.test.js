/**
 * export-dialog-jsonl.test.js
 *
 * Unit tests for the JSONL export paths added in C.20.
 * Covers _doExportChat, _doExportDigest, _doExportTopic with format='jsonl',
 * and the style/jsonl section visibility toggling in updateVisibility.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ─── Mocks ────────────────────────────────────────────────────────────────────

// ─── JSZip mock via globalThis (vitest aliases ../vendor/jszip-esm.js to
//     tests/__mocks__/jszip.js which reads globalThis.JSZip at call time) ────
let mockJSZipFile;
let mockJSZipGenerate;

vi.mock('../src/lib/export/export-engine.js', () => ({
  buildFineTuningJsonl:     vi.fn(),
  buildFineTuningJsonlMulti: vi.fn(),
  triggerDownload:          vi.fn(),
  buildTopicPath:           vi.fn(() => 'Work'),
  sanitizeFilename:         vi.fn(s => s),
  buildExportMarkdown:      vi.fn(() => 'md'),
  buildExportHtml:          vi.fn(() => '<html/>'),
  buildZipPayload:          vi.fn(() => []),
  buildDigestMarkdown:      vi.fn(() => 'md'),
  buildDigestHtml:          vi.fn(() => '<html/>'),
  buildMetadataJson:        vi.fn(() => '{}'),
  buildReadme:              vi.fn(() => 'readme'),
  setDownloadDriver:        vi.fn(),
  _mdToHtml:                vi.fn(s => s),
  EXPORT_ENGINE_VERSION:    '1.0',
}));

vi.mock('../src/lib/theme/style-transformer.js', () => ({
  STYLES:       { RAW: 'raw' },
  STYLE_LABELS: { raw: 'Raw' },
}));

vi.mock('../src/lib/vendor/browser.js', () => ({
  default: { storage: { local: { set: vi.fn() } } },
}));

import { ExportDialog } from '../src/lib/dialogs/export-dialog.js';
import {
  buildFineTuningJsonl,
  buildFineTuningJsonlMulti,
  triggerDownload,
} from '../src/lib/export/export-engine.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const makeChat = (overrides = {}) => ({
  id: 'chat-1',
  title: 'Test Chat',
  topicId: 'topic-1',
  messages: [
    { role: 'user', content: 'Hello' },
    { role: 'assistant', content: 'Hi!' },
  ],
  ...overrides,
});

const makeTree = () => ({
  topics: {
    'topic-1': { id: 'topic-1', name: 'Work', parentId: null, children: [], chatIds: ['chat-1'] },
  },
  rootTopics: ['topic-1'],
});

// ─── Setup ────────────────────────────────────────────────────────────────────

let container, dialog, exportDialog;

beforeEach(() => {
  vi.clearAllMocks();

  // Create fresh JSZip spies each test and install via globalThis
  mockJSZipFile     = vi.fn();
  mockJSZipGenerate = vi.fn().mockResolvedValue(new Blob(['zip']));
  const mockJSZipFileCap     = mockJSZipFile;
  const mockJSZipGenerateCap = mockJSZipGenerate;
  function MockJSZip() {
    return { file: mockJSZipFileCap, generateAsync: mockJSZipGenerateCap };
  }
  globalThis.JSZip = MockJSZip;

  container = document.createElement('div');
  dialog = {
    container,
    show:      vi.fn((html) => { container.innerHTML = html; }),
    close:     vi.fn(),
    alert:     vi.fn(),
    confirm:   vi.fn(),
    escapeHtml: vi.fn(s => s),
  };
  exportDialog = new ExportDialog(dialog);
});

// ─── Helper: render the main export dialog and select JSONL ──────────────────

/**
 * jsdom does not automatically uncheck sibling radios when .checked is set
 * programmatically, so we must clear the group manually before selecting.
 */
function selectFormatRadio(name, value) {
  container.querySelectorAll(`input[name="${name}"]`).forEach(r => { r.checked = false; });
  const radio = container.querySelector(`input[name="${name}"][value="${value}"]`);
  if (radio) {
    radio.checked = true;
    radio.dispatchEvent(new Event('change', { bubbles: true }));
  }
}

function renderChatDialog(chat, tree) {
  exportDialog.showExportChat(chat, tree);
  selectFormatRadio('export-format', 'jsonl');
}

function renderTopicDialog(topic, tree, chats) {
  exportDialog.showExportTopic(topic, tree, chats);
  selectFormatRadio('export-format', 'jsonl');
}

function clickExport() {
  container.querySelector('[data-action="export"]')?.click();
}

// ─── _doExportChat ─────────────────────────────────────────────────────────────

describe('ExportDialog – _doExportChat JSONL', () => {
  it('renders a JSONL format card in the dialog', async () => {
    const chat = makeChat();
    await exportDialog.showExportChat(chat, makeTree());
    expect(container.innerHTML).toContain('value="jsonl"');
    expect(container.innerHTML).toContain('JSONL');
  });

  it('calls buildFineTuningJsonl with the chat when JSONL is selected', async () => {
    buildFineTuningJsonl.mockReturnValue('{"messages":[]}');
    const chat = makeChat();
    renderChatDialog(chat, makeTree());
    clickExport();
    await Promise.resolve();
    expect(buildFineTuningJsonl).toHaveBeenCalledWith(chat, expect.objectContaining({}));
  });

  it('calls triggerDownload with .jsonl extension and application/jsonlines MIME on success', async () => {
    buildFineTuningJsonl.mockReturnValue('{"messages":[]}');
    const chat = makeChat({ title: 'My Chat' });
    renderChatDialog(chat, makeTree());
    clickExport();
    await Promise.resolve();
    expect(triggerDownload).toHaveBeenCalledWith(
      expect.stringMatching(/\.jsonl$/),
      '{"messages":[]}',
      'application/jsonlines'
    );
  });

  it('calls dialog.alert and does NOT call triggerDownload when buildFineTuningJsonl returns empty string', async () => {
    buildFineTuningJsonl.mockReturnValue('');
    const chat = makeChat();
    renderChatDialog(chat, makeTree());
    clickExport();
    await Promise.resolve();
    expect(dialog.alert).toHaveBeenCalled();
    expect(triggerDownload).not.toHaveBeenCalled();
  });

  it('reads the system-message input and passes it as options.systemMessage', async () => {
    buildFineTuningJsonl.mockReturnValue('{"messages":[]}');
    const chat = makeChat();
    renderChatDialog(chat, makeTree());

    const sysInput = container.querySelector('#export-jsonl-sysmsg');
    expect(sysInput).not.toBeNull();
    sysInput.value = 'You are a helpful assistant.';

    clickExport();
    await Promise.resolve();
    expect(buildFineTuningJsonl).toHaveBeenCalledWith(
      chat,
      expect.objectContaining({ systemMessage: 'You are a helpful assistant.' })
    );
  });

  it('calls dialog.close(null) on successful export', async () => {
    buildFineTuningJsonl.mockReturnValue('{"messages":[]}');
    const chat = makeChat();
    renderChatDialog(chat, makeTree());
    clickExport();
    await Promise.resolve();
    expect(dialog.close).toHaveBeenCalledWith(null);
  });
});

// ─── _doExportDigest ──────────────────────────────────────────────────────────

describe('ExportDialog – _doExportDigest JSONL', () => {
  function renderDigestDialog(chats, tree) {
    exportDialog.showExportDigest(chats, tree);
    selectFormatRadio('export-format', 'jsonl');
  }

  it('calls buildFineTuningJsonlMulti with the chats array when JSONL is selected', async () => {
    buildFineTuningJsonlMulti.mockReturnValue('line1\nline2');
    const chats = [makeChat({ id: 'c1' }), makeChat({ id: 'c2' })];
    renderDigestDialog(chats, makeTree());
    clickExport();
    await Promise.resolve();
    expect(buildFineTuningJsonlMulti).toHaveBeenCalledWith(chats, expect.anything());
  });

  it('calls triggerDownload with .jsonl filename when multi returns a non-empty string', async () => {
    buildFineTuningJsonlMulti.mockReturnValue('line1\nline2');
    const chats = [makeChat({ id: 'c1' }), makeChat({ id: 'c2' })];
    renderDigestDialog(chats, makeTree());
    clickExport();
    await Promise.resolve();
    expect(triggerDownload).toHaveBeenCalledWith(
      expect.stringMatching(/\.jsonl$/),
      'line1\nline2',
      'application/jsonlines'
    );
  });

  it('calls dialog.alert and does NOT call triggerDownload when multi returns empty string', async () => {
    buildFineTuningJsonlMulti.mockReturnValue('');
    const chats = [makeChat({ id: 'c1' }), makeChat({ id: 'c2' })];
    renderDigestDialog(chats, makeTree());
    clickExport();
    await Promise.resolve();
    expect(dialog.alert).toHaveBeenCalled();
    expect(triggerDownload).not.toHaveBeenCalled();
  });

  it('calls dialog.close(null) on successful digest JSONL export', async () => {
    buildFineTuningJsonlMulti.mockReturnValue('line1\nline2');
    const chats = [makeChat({ id: 'c1' }), makeChat({ id: 'c2' })];
    renderDigestDialog(chats, makeTree());
    clickExport();
    await Promise.resolve();
    expect(dialog.close).toHaveBeenCalledWith(null);
  });
});

// ─── _doExportTopic ───────────────────────────────────────────────────────────

describe('ExportDialog – _doExportTopic JSONL', () => {
  const topic = { id: 'topic-1', name: 'Work', parentId: null, children: [] };

  it('calls buildFineTuningJsonlMulti with scoped chats when JSONL is selected', async () => {
    buildFineTuningJsonlMulti.mockReturnValue('line1');
    const chats = [makeChat()];
    renderTopicDialog(topic, makeTree(), chats);
    clickExport();
    await Promise.resolve();
    expect(buildFineTuningJsonlMulti).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ id: 'chat-1' })]),
      expect.anything()
    );
  });

  it('uses the chat title as filename for a single-chat JSONL topic export', async () => {
    buildFineTuningJsonlMulti.mockReturnValue('line1');
    const chats = [makeChat({ title: 'My Chat' })];
    renderTopicDialog(topic, makeTree(), chats);
    clickExport();
    await Promise.resolve();
    const [filename] = triggerDownload.mock.calls[0];
    expect(filename).toMatch(/My Chat.*\.jsonl$/);
  });

  it('uses bAInder-finetune-<date>.jsonl filename for multi-chat JSONL topic export', async () => {
    buildFineTuningJsonlMulti.mockReturnValue('line1\nline2');
    const chats = [makeChat({ id: 'c1', title: 'Chat A' }), makeChat({ id: 'c2', title: 'Chat B', topicId: 'topic-1' })];
    const tree = {
      topics: {
        'topic-1': { id: 'topic-1', name: 'Work', parentId: null, children: [], chatIds: ['c1', 'c2'] },
      },
      rootTopics: ['topic-1'],
    };
    renderTopicDialog(topic, tree, chats);
    clickExport();
    await Promise.resolve();
    const [filename] = triggerDownload.mock.calls[0];
    expect(filename).toMatch(/^bAInder-finetune-\d{4}-\d{2}-\d{2}\.jsonl$/);
  });

  it('calls dialog.alert when buildFineTuningJsonlMulti returns empty string', async () => {
    buildFineTuningJsonlMulti.mockReturnValue('');
    const chats = [makeChat()];
    renderTopicDialog(topic, makeTree(), chats);
    clickExport();
    await Promise.resolve();
    expect(dialog.alert).toHaveBeenCalled();
    expect(triggerDownload).not.toHaveBeenCalled();
  });
});

// ─── Style / JSONL section visibility ─────────────────────────────────────────

describe('ExportDialog – section visibility', () => {
  function selectFormat(fmt) {
    selectFormatRadio('export-format', fmt);
  }

  beforeEach(async () => {
    const chat = makeChat();
    await exportDialog.showExportChat(chat, makeTree());
  });

  it('selecting JSONL hides the #export-style-section', () => {
    selectFormat('jsonl');
    const styleSection = container.querySelector('#export-style-section');
    expect(styleSection?.style.display).toBe('none');
  });

  it('selecting JSONL shows the #export-jsonl-section', () => {
    selectFormat('jsonl');
    const jsonlSection = container.querySelector('#export-jsonl-section');
    expect(jsonlSection?.style.display).toBe('');
  });

  it('selecting markdown shows #export-style-section and hides #export-jsonl-section', () => {
    // First switch to JSONL to verify toggle, then back to markdown
    selectFormat('jsonl');
    selectFormat('markdown');
    const styleSection = container.querySelector('#export-style-section');
    const jsonlSection = container.querySelector('#export-jsonl-section');
    expect(styleSection?.style.display).toBe('');
    expect(jsonlSection?.style.display).toBe('none');
  });

  it('selecting pdf hides #export-style-section (pdf has no style option)', () => {
    selectFormat('pdf');
    const styleSection = container.querySelector('#export-style-section');
    expect(styleSection?.style.display).toBe('none');
  });
});

// ─── _doExportChat markdown / html ────────────────────────────────────────────

describe('ExportDialog – _doExportChat markdown/html/alert', () => {
  it('calls triggerDownload with .md extension for markdown format', async () => {
    const chat = makeChat({ title: 'My Chat' });
    exportDialog.showExportChat(chat, makeTree());
    // markdown is the first format (default selected)
    clickExport();
    await Promise.resolve();
    expect(triggerDownload).toHaveBeenCalledWith(
      expect.stringMatching(/\.md$/),
      'md',
      'text/markdown'
    );
    expect(dialog.close).toHaveBeenCalledWith(null);
  });

  it('calls triggerDownload with .html extension for html format', async () => {
    exportDialog.showExportChat(makeChat(), makeTree());
    selectFormatRadio('export-format', 'html');
    clickExport();
    await Promise.resolve();
    expect(triggerDownload).toHaveBeenCalledWith(
      expect.stringMatching(/\.html$/),
      '<html/>',
      'text/html'
    );
  });

  it('calls dialog.alert and does not call show when chat is null', async () => {
    await exportDialog.showExportChat(null, makeTree());
    expect(dialog.alert).toHaveBeenCalled();
    expect(dialog.show).not.toHaveBeenCalled();
  });
});

// ─── _doExportChat pdf / _openPrintWindow ─────────────────────────────────────

describe('ExportDialog – _doExportChat pdf / _openPrintWindow', () => {
  let openSpy, revokeObjectURLSpy, createObjectURLSpy;

  beforeEach(() => {
    createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test-url');
    revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL').mockReturnValue(undefined);
    openSpy = vi.spyOn(window, 'open');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('calls window.open and dialog.close when pdf format exports successfully', async () => {
    const mockWin = { onload: null, print: vi.fn() };
    openSpy.mockReturnValue(mockWin);

    exportDialog.showExportChat(makeChat(), makeTree());
    selectFormatRadio('export-format', 'pdf');
    clickExport();
    await Promise.resolve();

    expect(openSpy).toHaveBeenCalledWith('blob:test-url', '_blank');
    expect(dialog.close).toHaveBeenCalledWith(null);
    // Trigger onload to cover the win.print() + setTimeout path
    vi.useFakeTimers();
    mockWin.onload?.();
    expect(mockWin.print).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('calls dialog.alert when window.open returns null (pop-ups blocked)', async () => {
    openSpy.mockReturnValue(null);

    exportDialog.showExportChat(makeChat(), makeTree());
    selectFormatRadio('export-format', 'pdf');
    clickExport();
    for (let i = 0; i < 3; i++) await Promise.resolve();

    expect(dialog.alert).toHaveBeenCalledWith(
      expect.stringContaining('Could not open'),
      'PDF Export'
    );
    expect(revokeObjectURLSpy).toHaveBeenCalled();
  });

  it('calls _openPrintWindow for a single-chat topic PDF export', async () => {
    const mockWin = { onload: null, print: vi.fn() };
    openSpy.mockReturnValue(mockWin);
    const topic = { id: 'topic-1', name: 'Work', parentId: null };

    exportDialog.showExportTopic(topic, makeTree(), [makeChat()]);
    selectFormatRadio('export-format', 'pdf');
    clickExport();
    await Promise.resolve();

    expect(openSpy).toHaveBeenCalledWith('blob:test-url', '_blank');
    expect(dialog.close).toHaveBeenCalledWith(null);
  });

  it('alerts and downloads a ZIP when PDF is selected with 2+ chats in topic', async () => {
    const topic = { id: 'topic-1', name: 'Work', parentId: null };
    const chats = [
      makeChat({ id: 'c1', title: 'A', topicId: 'topic-1' }),
      makeChat({ id: 'c2', title: 'B', topicId: 'topic-1' }),
    ];
    const tree = {
      topics: {
        'topic-1': { id: 'topic-1', name: 'Work', parentId: null, children: [], chatIds: ['c1', 'c2'] },
      },
      rootTopics: ['topic-1'],
    };
    // dialog.alert is awaited inside _doExportTopic before zipping
    dialog.alert.mockResolvedValue(undefined);

    exportDialog.showExportTopic(topic, tree, chats);
    selectFormatRadio('export-format', 'pdf');
    clickExport();
    // One tick for alert await, one for generateAsync
    for (let i = 0; i < 5; i++) await Promise.resolve();

    expect(dialog.alert).toHaveBeenCalledWith(
      expect.stringContaining('PDF export works one chat at a time'),
      'PDF Export'
    );
    expect(triggerDownload).toHaveBeenCalledWith(
      expect.stringMatching(/\.zip$/),
      expect.anything(),
      'application/zip'
    );
  });

  it('calls _openPrintWindow for digest PDF export', async () => {
    const mockWin = { onload: null, print: vi.fn() };
    openSpy.mockReturnValue(mockWin);

    const chats = [makeChat({ id: 'c1' }), makeChat({ id: 'c2' })];
    exportDialog.showExportDigest(chats, makeTree());
    selectFormatRadio('export-format', 'pdf');
    clickExport();
    await Promise.resolve();

    expect(openSpy).toHaveBeenCalledWith('blob:test-url', '_blank');
    expect(dialog.close).toHaveBeenCalledWith(null);
  });
});

// ─── showExportTopic validation ───────────────────────────────────────────────

describe('ExportDialog – showExportTopic', () => {
  const topic = { id: 'topic-1', name: 'Work', parentId: null };

  it('calls dialog.alert and does not show dialog when topic is null', async () => {
    await exportDialog.showExportTopic(null, makeTree(), []);
    expect(dialog.alert).toHaveBeenCalledWith('No topic selected for export.', 'Export');
    expect(dialog.show).not.toHaveBeenCalled();
  });

  it('calls dialog.alert when chats is not an array', async () => {
    await exportDialog.showExportTopic(topic, makeTree(), null);
    expect(dialog.alert).toHaveBeenCalledWith('Chat data is unavailable.', 'Export');
  });

  it('calls dialog.show when topic and chats are valid', async () => {
    await exportDialog.showExportTopic(topic, makeTree(), [makeChat()]);
    expect(dialog.show).toHaveBeenCalled();
  });

  it('downloads .md when markdown format and scope collects 1 chat', async () => {
    const chats = [makeChat()]; // topicId: 'topic-1' matches topic.id
    exportDialog.showExportTopic(topic, makeTree(), chats);
    selectFormatRadio('export-format', 'markdown');
    clickExport();
    await Promise.resolve();
    expect(triggerDownload).toHaveBeenCalledWith(
      expect.stringMatching(/\.md$/),
      'md',
      'text/markdown'
    );
    expect(dialog.close).toHaveBeenCalledWith(null);
  });

  it('downloads .html when html format and scope collects 1 chat', async () => {
    const chats = [makeChat()];
    exportDialog.showExportTopic(topic, makeTree(), chats);
    selectFormatRadio('export-format', 'html');
    clickExport();
    await Promise.resolve();
    expect(triggerDownload).toHaveBeenCalledWith(
      expect.stringMatching(/\.html$/),
      '<html/>',
      'text/html'
    );
  });

  it('calls dialog.alert when no chats match the selected scope', async () => {
    const chats = [makeChat({ topicId: 'other-topic' })]; // no chat for topic-1
    exportDialog.showExportTopic(topic, makeTree(), chats);
    selectFormatRadio('export-format', 'markdown');
    clickExport();
    await Promise.resolve();
    expect(dialog.alert).toHaveBeenCalledWith(
      expect.stringContaining('No chats found'),
      'Export'
    );
    expect(triggerDownload).not.toHaveBeenCalled();
  });
});

// ─── showExportTree validation ────────────────────────────────────────────────

describe('ExportDialog – showExportTree', () => {
  it('calls dialog.alert and does not show dialog when chats is not an array', async () => {
    await exportDialog.showExportTree(makeTree(), null);
    expect(dialog.alert).toHaveBeenCalledWith('Chat data is unavailable.', 'Export');
    expect(dialog.show).not.toHaveBeenCalled();
  });

  it('renders the dialog with "Entire Tree" in the title when chats is valid', async () => {
    await exportDialog.showExportTree(makeTree(), [makeChat()]);
    expect(dialog.show).toHaveBeenCalled();
    expect(container.querySelector('h2').textContent).toContain('Entire Tree');
  });
});

// ─── _doExportTopic multi-chat bundling (markdown & html scope) ───────────────

describe('ExportDialog – _doExportTopic multi-chat markdown/html via scope', () => {
  const topic = { id: 'topic-1', name: 'Work', parentId: null };

  const makeMultiChatTree = () => ({
    topics: {
      'topic-1': { id: 'topic-1', name: 'Work', parentId: null, children: [], chatIds: ['c1', 'c2'] },
    },
    rootTopics: ['topic-1'],
  });

  function makeMultiChats() {
    return [
      makeChat({ id: 'c1', title: 'Chat A', topicId: 'topic-1' }),
      makeChat({ id: 'c2', title: 'Chat B', topicId: 'topic-1' }),
    ];
  }

  it('downloads a ZIP with .md files when 2 chats in topic and markdown format', async () => {
    const chats = makeMultiChats();
    exportDialog.showExportTopic(topic, makeMultiChatTree(), chats);
    selectFormatRadio('export-format', 'markdown');
    clickExport();
    // Flush all microtasks and settled promises
    for (let i = 0; i < 5; i++) await Promise.resolve();

    expect(mockJSZipGenerate).toHaveBeenCalled();
    expect(triggerDownload).toHaveBeenCalledWith(
      expect.stringMatching(/\.zip$/),
      expect.anything(),
      'application/zip'
    );
  });

  it('downloads a ZIP with .html files when 2 chats and html format', async () => {
    const chats = makeMultiChats();
    exportDialog.showExportTopic(topic, makeMultiChatTree(), chats);
    selectFormatRadio('export-format', 'html');
    clickExport();
    for (let i = 0; i < 5; i++) await Promise.resolve();

    expect(mockJSZipGenerate).toHaveBeenCalled();
    expect(triggerDownload).toHaveBeenCalledWith(
      expect.stringMatching(/\.zip$/),
      expect.anything(),
      'application/zip'
    );
  });

  it('collects chats from entire-tree scope when scope radio is entire-tree', async () => {
    const chats = [
      makeChat({ id: 'c1', topicId: 'topic-1' }),
      makeChat({ id: 'c2', topicId: 'other-topic' }),
    ];
    const tree = {
      topics: {
        'topic-1': { id: 'topic-1', name: 'Work', parentId: null, children: [], chatIds: ['c1'] },
      },
      rootTopics: ['topic-1'],
    };
    exportDialog.showExportTopic(topic, tree, chats);
    selectFormatRadio('export-format', 'markdown');
    selectFormatRadio('export-scope', 'entire-tree');
    clickExport();
    for (let i = 0; i < 5; i++) await Promise.resolve();
    expect(triggerDownload).toHaveBeenCalledWith(expect.stringMatching(/\.zip$/), expect.anything(), 'application/zip');
  });

  it('collects chats recursively from subtopics when scope is topic-recursive', async () => {
    const treeWithSubtopic = {
      topics: {
        'topic-1': { id: 'topic-1', name: 'Work', parentId: null, children: ['sub-1'], chatIds: ['c1'] },
        'sub-1':   { id: 'sub-1',   name: 'Sub',  parentId: 'topic-1', children: [], chatIds: ['c2'] },
      },
      rootTopics: ['topic-1'],
    };
    const chats = [
      makeChat({ id: 'c1', topicId: 'topic-1' }),
      makeChat({ id: 'c2', topicId: 'sub-1'   }),
    ];
    exportDialog.showExportTopic(topic, treeWithSubtopic, chats);
    selectFormatRadio('export-format', 'markdown');
    selectFormatRadio('export-scope', 'topic-recursive');
    clickExport();
    for (let i = 0; i < 5; i++) await Promise.resolve();
    // Both chats (from topic-1 and its subtopic) should end up in the ZIP
    expect(mockJSZipFile).toHaveBeenCalledTimes(2);
  });
});

// ─── _doExportDigest markdown / html ─────────────────────────────────────────

describe('ExportDialog – _doExportDigest markdown/html', () => {
  function renderDigestDialog(chats, tree) {
    exportDialog.showExportDigest(chats, tree);
  }

  it('calls triggerDownload with .md extension for digest markdown export', async () => {
    const chats = [makeChat({ id: 'c1' }), makeChat({ id: 'c2' })];
    renderDigestDialog(chats, makeTree());
    // markdown is the default (first) format for digest
    clickExport();
    await Promise.resolve();
    expect(triggerDownload).toHaveBeenCalledWith(
      expect.stringMatching(/\.md$/),
      'md',
      'text/markdown'
    );
    expect(dialog.close).toHaveBeenCalledWith(null);
  });

  it('calls triggerDownload with .html extension for digest html export', async () => {
    const chats = [makeChat({ id: 'c1' }), makeChat({ id: 'c2' })];
    renderDigestDialog(chats, makeTree());
    selectFormatRadio('export-format', 'html');
    clickExport();
    await Promise.resolve();
    expect(triggerDownload).toHaveBeenCalledWith(
      expect.stringMatching(/\.html$/),
      '<html/>',
      'text/html'
    );
  });

  it('calls dialog.alert when selectedChats has fewer than 2 entries', async () => {
    await exportDialog.showExportDigest([makeChat()], makeTree());
    expect(dialog.alert).toHaveBeenCalled();
    expect(dialog.show).not.toHaveBeenCalled();
  });

  it('calls dialog.alert when selectedChats is not an array', async () => {
    await exportDialog.showExportDigest(null, makeTree());
    expect(dialog.alert).toHaveBeenCalled();
  });
});
