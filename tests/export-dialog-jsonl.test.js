/**
 * export-dialog-jsonl.test.js
 *
 * Unit tests for the JSONL export paths added in C.20.
 * Covers _doExportChat, _doExportDigest, _doExportTopic with format='jsonl',
 * and the style/jsonl section visibility toggling in updateVisibility.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../src/lib/vendor/jszip-esm.js', () => ({ default: vi.fn() }));

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
});
