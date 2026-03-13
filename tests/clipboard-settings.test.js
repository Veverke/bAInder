import { describe, it, expect, beforeEach, vi } from 'vitest';
import { openSettingsPanel } from '../src/sidepanel/features/settings-panel.js';

// ─── DOM fixture ─────────────────────────────────────────────────────────────

function buildDOM(includeClipboard = true) {
  document.body.innerHTML = `
    <div id="settingsPanel" aria-hidden="true">
      <div class="settings-panel__backdrop"></div>
      <button id="settingsPanelClose"></button>
      ${includeClipboard ? `
      <select id="clipboardFormatSelect">
        <option value="plain" selected>Plain text</option>
        <option value="markdown">Markdown</option>
        <option value="html">HTML</option>
      </select>
      <input type="checkbox" id="clipboardIncludeEmojis" checked>
      <label id="clipboardImagesRow" hidden>
        <input type="checkbox" id="clipboardIncludeImages">
      </label>
      <input type="checkbox" id="clipboardIncludeAttachments">
      <input type="text" id="clipboardSeparatorInput" value="------------------------------------">
      <div id="clipboardSeparatorPreview">
        <span class="settings-separator-preview__label">Preview</span>
        <span class="settings-separator-preview__content">------------------------------------</span>
      </div>
      <input type="text" id="clipboardTurnSeparatorInput" value="---">
      <div id="clipboardTurnSeparatorPreview">
        <span class="settings-separator-preview__label">Preview</span>
        <span class="settings-separator-preview__content">---</span>
      </div>
      ` : ''}
    </div>
  `;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('settings-panel clipboard wiring (C.26)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not throw when clipboard controls are absent', async () => {
    buildDOM(false);
    global.chrome.storage.local.get.mockResolvedValue({});
    await expect(Promise.resolve().then(() => openSettingsPanel())).resolves.toBeUndefined();
  });

  it('applies stored clipboardSettings to all controls on open', async () => {
    buildDOM();
    global.chrome.storage.local.get.mockResolvedValue({
      clipboardSettings: {
        format: 'markdown',
        includeEmojis: false,
        includeImages: false,
        includeAttachments: true,
        separator: '===',
        turnSeparator: '~~~',
      },
    });

    openSettingsPanel();
    await Promise.resolve();

    expect(document.getElementById('clipboardFormatSelect').value).toBe('markdown');
    expect(document.getElementById('clipboardIncludeEmojis').checked).toBe(false);
    expect(document.getElementById('clipboardIncludeAttachments').checked).toBe(true);
    expect(document.getElementById('clipboardSeparatorInput').value).toBe('===');
    expect(document.getElementById('clipboardTurnSeparatorInput').value).toBe('~~~');
  });

  it('migrates legacy clipboardFormat key when no clipboardSettings exist', async () => {
    buildDOM();
    global.chrome.storage.local.get.mockResolvedValue({ clipboardFormat: 'markdown' });

    openSettingsPanel();
    await Promise.resolve();

    expect(document.getElementById('clipboardFormatSelect').value).toBe('markdown');
  });

  it('leaves controls at defaults when storage is empty', async () => {
    buildDOM();
    global.chrome.storage.local.get.mockResolvedValue({});

    openSettingsPanel();
    await Promise.resolve();

    expect(document.getElementById('clipboardFormatSelect').value).toBe('plain');
    expect(document.getElementById('clipboardIncludeEmojis').checked).toBe(true);
    expect(document.getElementById('clipboardIncludeAttachments').checked).toBe(false);
    expect(document.getElementById('clipboardSeparatorInput').value).toBe('------------------------------------');
    expect(document.getElementById('clipboardTurnSeparatorInput').value).toBe('---');
  });

  it('shows clipboardImagesRow only when format is "html"', async () => {
    buildDOM();
    global.chrome.storage.local.get.mockResolvedValue({ clipboardSettings: { format: 'html' } });

    openSettingsPanel();
    await Promise.resolve();

    expect(document.getElementById('clipboardImagesRow').hidden).toBe(false);
  });

  it('hides clipboardImagesRow for non-html formats', async () => {
    buildDOM();
    global.chrome.storage.local.get.mockResolvedValue({});

    openSettingsPanel();
    await Promise.resolve();

    expect(document.getElementById('clipboardImagesRow').hidden).toBe(true);
  });

  it('persists full clipboardSettings object when format changes', async () => {
    buildDOM();
    global.chrome.storage.local.get.mockResolvedValue({});
    global.chrome.storage.local.set.mockResolvedValue(undefined);

    openSettingsPanel();
    await Promise.resolve();

    const select = document.getElementById('clipboardFormatSelect');
    select.value = 'html';
    select.dispatchEvent(new Event('change'));

    expect(global.chrome.storage.local.set).toHaveBeenCalledWith({
      clipboardSettings: expect.objectContaining({ format: 'html' }),
    });
  });

  it('persists settings when a checkbox changes', async () => {
    buildDOM();
    global.chrome.storage.local.get.mockResolvedValue({});
    global.chrome.storage.local.set.mockResolvedValue(undefined);

    openSettingsPanel();
    await Promise.resolve();

    const chk = document.getElementById('clipboardIncludeEmojis');
    chk.checked = false;
    chk.dispatchEvent(new Event('change'));

    expect(global.chrome.storage.local.set).toHaveBeenCalledWith({
      clipboardSettings: expect.objectContaining({ includeEmojis: false }),
    });
  });

  it('updates separator preview when input changes', async () => {
    buildDOM();
    global.chrome.storage.local.get.mockResolvedValue({});

    openSettingsPanel();
    await Promise.resolve();

    const inp     = document.getElementById('clipboardSeparatorInput');
    const preview = document.getElementById('clipboardSeparatorPreview');

    inp.value = '===';
    inp.dispatchEvent(new Event('input'));

    expect(preview.querySelector('.settings-separator-preview__content').innerHTML).toBe('===');
  });

  it('updates turn separator preview when input changes', async () => {
    buildDOM();
    global.chrome.storage.local.get.mockResolvedValue({});

    openSettingsPanel();
    await Promise.resolve();

    const inp     = document.getElementById('clipboardTurnSeparatorInput');
    const preview = document.getElementById('clipboardTurnSeparatorPreview');

    inp.value = '~~~';
    inp.dispatchEvent(new Event('input'));

    expect(preview.querySelector('.settings-separator-preview__content').innerHTML).toBe('~~~');
  });

  it('persists turnSeparator when turn separator input changes', async () => {
    buildDOM();
    global.chrome.storage.local.get.mockResolvedValue({});
    global.chrome.storage.local.set.mockResolvedValue(undefined);

    openSettingsPanel();
    await Promise.resolve();

    const inp = document.getElementById('clipboardTurnSeparatorInput');
    inp.value = '<hr>';
    inp.dispatchEvent(new Event('input'));

    expect(global.chrome.storage.local.set).toHaveBeenCalledWith({
      clipboardSettings: expect.objectContaining({ turnSeparator: '<hr>' }),
    });
  });

  it('persists separator when input changes', async () => {
    buildDOM();
    global.chrome.storage.local.get.mockResolvedValue({});
    global.chrome.storage.local.set.mockResolvedValue(undefined);

    openSettingsPanel();
    await Promise.resolve();

    const inp = document.getElementById('clipboardSeparatorInput');
    inp.value = '<hr>';
    inp.dispatchEvent(new Event('input'));

    expect(global.chrome.storage.local.set).toHaveBeenCalledWith({
      clipboardSettings: expect.objectContaining({ separator: '<hr>' }),
    });
  });
});
