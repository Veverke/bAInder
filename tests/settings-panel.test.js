/**
 * Tests for src/sidepanel/features/settings-panel.js
 *
 * openSettingsPanel / closeSettingsPanel wire DOM controls and delegate
 * persistence to browser.storage.local.  The browser API is mocked.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  openSettingsPanel,
  closeSettingsPanel,
} from '../src/sidepanel/features/settings-panel.js';

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('../src/lib/vendor/browser.js', () => ({
  default: {
    storage: {
      local: {
        get:  vi.fn().mockResolvedValue({}),
        set:  vi.fn().mockResolvedValue(undefined),
      },
    },
  },
}));

vi.mock('../src/lib/utils/logger.js', () => ({
  logger: {
    getLevel: vi.fn().mockReturnValue('warn'),
    setLevel: vi.fn(),
    debug:    vi.fn(),
    warn:     vi.fn(),
    error:    vi.fn(),
  },
}));

vi.mock('../src/lib/export/auto-export.js', () => ({
  getAutoExportDirHandle:   vi.fn().mockResolvedValue(null),
  storeAutoExportDirHandle: vi.fn().mockResolvedValue(undefined),
  clearAutoExportDirHandle: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../src/lib/export/clipboard-serialiser.js', async (importOriginal) => {
  const actual = await importOriginal();
  return actual;
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildPanelDOM() {
  document.body.innerHTML = `
    <div id="settingsPanel" aria-hidden="true">
      <button id="settingsPanelClose"></button>
      <button class="settings-nav__item settings-nav__item--active" data-settings-tab="general" aria-selected="true"></button>
      <button class="settings-nav__item" data-settings-tab="clipboard" aria-selected="false"></button>
      <button class="settings-nav__item" data-settings-tab="reader" aria-selected="false"></button>
      <button class="settings-nav__item" data-settings-tab="export" aria-selected="false"></button>
      <section class="settings-tab-panel settings-tab-panel--active" id="settings-tab-general"></section>
      <section class="settings-tab-panel" id="settings-tab-clipboard" hidden></section>
      <section class="settings-tab-panel" id="settings-tab-reader" hidden></section>
      <section class="settings-tab-panel" id="settings-tab-export" hidden></section>
      <select id="logLevelSelect">
        <option value="debug">Debug</option>
        <option value="info">Info</option>
        <option value="warn">Warn</option>
        <option value="error">Error</option>
      </select>
      <input type="checkbox" id="backupReminderToggle" />
      <select id="backupReminderIntervalSelect">
        <option value="7">7</option>
        <option value="30">30</option>
      </select>
      <select id="clipboardFormatSelect">
        <option value="plain">Plain text</option>
        <option value="html">HTML</option>
      </select>
      <input type="checkbox" id="clipboardIncludeEmojis" checked />
      <input type="checkbox" id="clipboardIncludeImages" />
      <div id="clipboardImagesRow"></div>
      <input type="checkbox" id="clipboardIncludeAttachments" />
      <input type="text" id="clipboardSeparatorInput" />
      <div id="clipboardSeparatorPreview"><span class="settings-separator-preview__content"></span></div>
      <input type="text" id="clipboardTurnSeparatorInput" />
      <div id="clipboardTurnSeparatorPreview"><span class="settings-separator-preview__content"></span></div>
      <input type="checkbox" id="showOrdinalsToggle" />
      <input type="checkbox" id="autoExportToggle" />
      <input type="number" id="autoExportThresholdInput" value="10" />
      <input type="text"   id="autoExportTopicsInput" value="" />
      <span id="autoExportFolderName"></span>
      <button id="autoExportFolderBrowseBtn"></button>
      <button id="autoExportFolderClearBtn" hidden></button>
    </div>
  `;
}

beforeEach(() => {
  buildPanelDOM();
});

afterEach(() => {
  document.body.innerHTML = '';
  vi.clearAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────
// openSettingsPanel()
// ─────────────────────────────────────────────────────────────────────────────

describe('openSettingsPanel()', () => {
  it('does nothing when #settingsPanel is absent', () => {
    document.body.innerHTML = '';
    expect(() => openSettingsPanel()).not.toThrow();
  });

  it('adds the settings-panel--open class', () => {
    openSettingsPanel();
    expect(document.getElementById('settingsPanel').classList.contains('settings-panel--open')).toBe(true);
  });

  it('sets aria-hidden to false', () => {
    openSettingsPanel();
    expect(document.getElementById('settingsPanel').getAttribute('aria-hidden')).toBe('false');
  });

  it('sets logLevelSelect value from logger.getLevel()', async () => {
    const { logger } = await import('../src/lib/utils/logger.js');
    logger.getLevel.mockReturnValue('debug');
    openSettingsPanel();
    expect(document.getElementById('logLevelSelect').value).toBe('debug');
  });

  it('wires logLevelSelect change to logger.setLevel', async () => {
    const { logger } = await import('../src/lib/utils/logger.js');
    logger.getLevel.mockReturnValue('warn');
    openSettingsPanel();
    const sel = document.getElementById('logLevelSelect');
    sel.value = 'error';
    sel.dispatchEvent(new Event('change'));
    expect(logger.setLevel).toHaveBeenCalledWith('error');
  });

  it('does not re-wire logLevelSelect on second open (idempotent)', async () => {
    const { logger } = await import('../src/lib/utils/logger.js');
    logger.getLevel.mockReturnValue('warn');
    openSettingsPanel();
    openSettingsPanel();
    const sel = document.getElementById('logLevelSelect');
    sel.value = 'info';
    sel.dispatchEvent(new Event('change'));
    // setLevel should be called once, not twice
    expect(logger.setLevel).toHaveBeenCalledTimes(1);
  });

  it('wires close button to close the panel', () => {
    openSettingsPanel();
    const panel = document.getElementById('settingsPanel');
    document.getElementById('settingsPanelClose').click();
    expect(panel.classList.contains('settings-panel--open')).toBe(false);
  });

  it('wires sidebar nav to switch active tab', () => {
    openSettingsPanel();
    const panel = document.getElementById('settingsPanel');
    const clipboardBtn = panel.querySelector('[data-settings-tab="clipboard"]');
    clipboardBtn.click();
    expect(clipboardBtn.classList.contains('settings-nav__item--active')).toBe(true);
    expect(document.getElementById('settings-tab-clipboard').hidden).toBe(false);
    expect(document.getElementById('settings-tab-general').hidden).toBe(true);
  });

  it('does not re-wire nav tabs on second open (idempotent)', () => {
    openSettingsPanel();
    openSettingsPanel();
    // Only one set of listeners — clicking still works without double-firing
    const panel = document.getElementById('settingsPanel');
    const exportBtn = panel.querySelector('[data-settings-tab="export"]');
    exportBtn.click();
    expect(exportBtn.getAttribute('aria-selected')).toBe('true');
  });

  it('loads backupReminderToggle state from storage', async () => {
    const { default: browser } = await import('../src/lib/vendor/browser.js');
    browser.storage.local.get.mockResolvedValueOnce({ backupReminderDisabled: true });
    openSettingsPanel();
    // Allow the Promise to resolve
    await Promise.resolve();
    await Promise.resolve();
    const toggle = document.getElementById('backupReminderToggle');
    expect(toggle.checked).toBe(false); // disabled means unchecked
  });

  it('loads backupReminderIntervalSelect from storage', async () => {
    const { default: browser } = await import('../src/lib/vendor/browser.js');
    browser.storage.local.get.mockImplementation(keys => {
      if (Array.isArray(keys) && keys.includes('backupReminderIntervalDays'))
        return Promise.resolve({ backupReminderIntervalDays: 30 });
      return Promise.resolve({});
    });
    openSettingsPanel();
    await Promise.resolve();
    await Promise.resolve();
    expect(document.getElementById('backupReminderIntervalSelect').value).toBe('30');
  });

  it('persists backupReminderToggle change to storage', async () => {
    const { default: browser } = await import('../src/lib/vendor/browser.js');
    openSettingsPanel();
    const toggle = document.getElementById('backupReminderToggle');
    toggle.checked = false;
    toggle.dispatchEvent(new Event('change'));
    await Promise.resolve();
    expect(browser.storage.local.set).toHaveBeenCalledWith(
      expect.objectContaining({ backupReminderDisabled: true })
    );
  });

  it('persists backupReminderIntervalSelect change to storage', async () => {
    const { default: browser } = await import('../src/lib/vendor/browser.js');
    openSettingsPanel();
    const sel = document.getElementById('backupReminderIntervalSelect');
    sel.value = '30';
    sel.dispatchEvent(new Event('change'));
    await Promise.resolve();
    expect(browser.storage.local.set).toHaveBeenCalledWith(
      expect.objectContaining({ backupReminderIntervalDays: 30 })
    );
  });

  it('loads clipboardFormatSelect from storage', async () => {
    const { default: browser } = await import('../src/lib/vendor/browser.js');
    browser.storage.local.get.mockImplementation(keys => {
      if (Array.isArray(keys) && keys.includes('clipboardSettings'))
        return Promise.resolve({ clipboardSettings: { format: 'html' } });
      return Promise.resolve({});
    });
    openSettingsPanel();
    await Promise.resolve();
    await Promise.resolve();
    expect(document.getElementById('clipboardFormatSelect').value).toBe('html');
  });

  it('hides imagesRow when format is not html', async () => {
    const { default: browser } = await import('../src/lib/vendor/browser.js');
    browser.storage.local.get.mockImplementation(keys => {
      if (Array.isArray(keys) && keys.includes('clipboardSettings'))
        return Promise.resolve({ clipboardSettings: { format: 'plain' } });
      return Promise.resolve({});
    });
    openSettingsPanel();
    await Promise.resolve();
    await Promise.resolve();
    const row = document.getElementById('clipboardImagesRow');
    expect(row.hidden).toBe(true);
  });

  it('fires persist on clipboardFormatSelect change', async () => {
    const { default: browser } = await import('../src/lib/vendor/browser.js');
    openSettingsPanel();
    const sel = document.getElementById('clipboardFormatSelect');
    sel.value = 'html';
    sel.dispatchEvent(new Event('change'));
    await Promise.resolve();
    expect(browser.storage.local.set).toHaveBeenCalledWith(
      expect.objectContaining({ clipboardSettings: expect.objectContaining({ format: 'html' }) })
    );
  });

  it('wires showOrdinalsToggle change to storage', async () => {
    const { default: browser } = await import('../src/lib/vendor/browser.js');
    browser.storage.local.get.mockResolvedValueOnce({ readerSettings: { showOrdinals: true } });
    openSettingsPanel();
    const toggle = document.getElementById('showOrdinalsToggle');
    toggle.checked = false;
    toggle.dispatchEvent(new Event('change'));
    await Promise.resolve();
    expect(browser.storage.local.get).toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// closeSettingsPanel()
// ─────────────────────────────────────────────────────────────────────────────

describe('closeSettingsPanel()', () => {
  it('does nothing when #settingsPanel is absent', () => {
    document.body.innerHTML = '';
    expect(() => closeSettingsPanel()).not.toThrow();
  });

  it('removes the settings-panel--open class', () => {
    const panel = document.getElementById('settingsPanel');
    panel.classList.add('settings-panel--open');
    closeSettingsPanel();
    expect(panel.classList.contains('settings-panel--open')).toBe(false);
  });

  it('sets aria-hidden to true', () => {
    const panel = document.getElementById('settingsPanel');
    panel.setAttribute('aria-hidden', 'false');
    closeSettingsPanel();
    expect(panel.getAttribute('aria-hidden')).toBe('true');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// openSettingsPanel() — auto-export controls
// ─────────────────────────────────────────────────────────────────────────────

describe('openSettingsPanel() — auto-export controls', () => {
  it('loads autoExport settings from storage and applies to form', async () => {
    const { default: browser } = await import('../src/lib/vendor/browser.js');
    browser.storage.local.get.mockImplementation(keys => {
      if (Array.isArray(keys) && keys.includes('autoExportEnabled'))
        return Promise.resolve({ autoExportEnabled: true, autoExportThreshold: 25, autoExportTopics: 'topic1' });
      return Promise.resolve({});
    });
    openSettingsPanel();
    await Promise.resolve();
    await Promise.resolve();
    expect(document.getElementById('autoExportToggle').checked).toBe(true);
    expect(document.getElementById('autoExportThresholdInput').value).toBe('25');
    expect(document.getElementById('autoExportTopicsInput').value).toBe('topic1');
  });

  it('disables threshold input when autoExport is off after loading', async () => {
    const { default: browser } = await import('../src/lib/vendor/browser.js');
    browser.storage.local.get.mockImplementation(keys => {
      if (Array.isArray(keys) && keys.includes('autoExportEnabled'))
        return Promise.resolve({ autoExportEnabled: false });
      return Promise.resolve({});
    });
    openSettingsPanel();
    await Promise.resolve();
    await Promise.resolve();
    expect(document.getElementById('autoExportThresholdInput').disabled).toBe(true);
  });

  it('shows folder name and unhides clear button when getAutoExportDirHandle resolves with a handle', async () => {
    const { getAutoExportDirHandle } = await import('../src/lib/export/auto-export.js');
    getAutoExportDirHandle.mockResolvedValueOnce({ name: 'MyExportFolder' });
    openSettingsPanel();
    await Promise.resolve();
    await Promise.resolve();
    expect(document.getElementById('autoExportFolderName').textContent).toBe('MyExportFolder');
    expect(document.getElementById('autoExportFolderClearBtn').hidden).toBe(false);
  });

  it('shows "Downloads (default)" and hides clear button when no dir handle', async () => {
    const { getAutoExportDirHandle } = await import('../src/lib/export/auto-export.js');
    getAutoExportDirHandle.mockResolvedValueOnce(null);
    openSettingsPanel();
    await Promise.resolve();
    await Promise.resolve();
    expect(document.getElementById('autoExportFolderName').textContent).toBe('Downloads (default)');
    expect(document.getElementById('autoExportFolderClearBtn').hidden).toBe(true);
  });

  it('autoExportToggle change saves autoExportEnabled to storage', async () => {
    const { default: browser } = await import('../src/lib/vendor/browser.js');
    openSettingsPanel();
    const toggle = document.getElementById('autoExportToggle');
    toggle.checked = true;
    toggle.dispatchEvent(new Event('change'));
    await Promise.resolve();
    expect(browser.storage.local.set).toHaveBeenCalledWith({ autoExportEnabled: true });
  });

  it('autoExportToggle change enables threshold input when toggled on', () => {
    openSettingsPanel();
    const toggle = document.getElementById('autoExportToggle');
    const thresholdInput = document.getElementById('autoExportThresholdInput');
    thresholdInput.disabled = true;
    toggle.checked = true;
    toggle.dispatchEvent(new Event('change'));
    expect(thresholdInput.disabled).toBe(false);
  });

  it('threshold input change saves value to storage', async () => {
    const { default: browser } = await import('../src/lib/vendor/browser.js');
    openSettingsPanel();
    const thresholdInput = document.getElementById('autoExportThresholdInput');
    thresholdInput.value = '20';
    thresholdInput.dispatchEvent(new Event('change'));
    await Promise.resolve();
    expect(browser.storage.local.set).toHaveBeenCalledWith({ autoExportThreshold: 20 });
  });

  it('threshold input clamps value to 1 when set to 0', async () => {
    const { default: browser } = await import('../src/lib/vendor/browser.js');
    openSettingsPanel();
    // Let the storage-load promise resolve so it does not overwrite the input value below
    await Promise.resolve();
    await Promise.resolve();
    const thresholdInput = document.getElementById('autoExportThresholdInput');
    thresholdInput.value = '0';
    thresholdInput.dispatchEvent(new Event('change'));
    expect(thresholdInput.value).toBe('1');
    expect(browser.storage.local.set).toHaveBeenCalledWith({ autoExportThreshold: 1 });
  });

  it('threshold input clamps negative value to 1', async () => {
    const { default: browser } = await import('../src/lib/vendor/browser.js');
    openSettingsPanel();
    await Promise.resolve();
    await Promise.resolve();
    const thresholdInput = document.getElementById('autoExportThresholdInput');
    thresholdInput.value = '-5';
    thresholdInput.dispatchEvent(new Event('change'));
    expect(thresholdInput.value).toBe('1');
    expect(browser.storage.local.set).toHaveBeenCalledWith({ autoExportThreshold: 1 });
  });

  it('autoExportTopicsInput input event saves topics to storage', async () => {
    const { default: browser } = await import('../src/lib/vendor/browser.js');
    openSettingsPanel();
    const topicsInput = document.getElementById('autoExportTopicsInput');
    topicsInput.value = 'work,personal';
    topicsInput.dispatchEvent(new Event('input'));
    await Promise.resolve();
    expect(browser.storage.local.set).toHaveBeenCalledWith({ autoExportTopics: 'work,personal' });
  });

  it('browse button click stores handle and updates folder display', async () => {
    const { storeAutoExportDirHandle } = await import('../src/lib/export/auto-export.js');
    const mockHandle = { name: 'ChosenFolder' };
    window.showDirectoryPicker = vi.fn().mockResolvedValue(mockHandle);
    openSettingsPanel();
    document.getElementById('autoExportFolderBrowseBtn').click();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(storeAutoExportDirHandle).toHaveBeenCalledWith(mockHandle);
    expect(document.getElementById('autoExportFolderName').textContent).toBe('ChosenFolder');
  });

  it('browse button click — AbortError is silently ignored', async () => {
    const { logger } = await import('../src/lib/utils/logger.js');
    const abortErr = new DOMException('User cancelled', 'AbortError');
    window.showDirectoryPicker = vi.fn().mockRejectedValue(abortErr);
    openSettingsPanel();
    document.getElementById('autoExportFolderBrowseBtn').click();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('browse button click — non-AbortError logs a warning', async () => {
    const { logger } = await import('../src/lib/utils/logger.js');
    const err = new Error('Picker unavailable');
    err.name = 'NotAllowedError';
    window.showDirectoryPicker = vi.fn().mockRejectedValue(err);
    openSettingsPanel();
    document.getElementById('autoExportFolderBrowseBtn').click();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(logger.warn).toHaveBeenCalledWith('Folder picker error:', err);
  });

  it('clear button click clears stored handle and resets display', async () => {
    const { clearAutoExportDirHandle } = await import('../src/lib/export/auto-export.js');
    openSettingsPanel();
    document.getElementById('autoExportFolderName').textContent = 'SomeFolder';
    document.getElementById('autoExportFolderClearBtn').click();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(clearAutoExportDirHandle).toHaveBeenCalled();
    expect(document.getElementById('autoExportFolderName').textContent).toBe('Downloads (default)');
    expect(document.getElementById('autoExportFolderClearBtn').hidden).toBe(true);
  });

  it('is idempotent — second open does not re-wire auto-export toggle', async () => {
    const { default: browser } = await import('../src/lib/vendor/browser.js');
    openSettingsPanel();
    openSettingsPanel();
    const toggle = document.getElementById('autoExportToggle');
    toggle.checked = true;
    toggle.dispatchEvent(new Event('change'));
    const autoExportSetCalls = browser.storage.local.set.mock.calls.filter(
      ([arg]) => 'autoExportEnabled' in arg
    );
    expect(autoExportSetCalls).toHaveLength(1);
  });

  it('silently ignores getAutoExportDirHandle rejection', async () => {
    const { getAutoExportDirHandle } = await import('../src/lib/export/auto-export.js');
    getAutoExportDirHandle.mockRejectedValueOnce(new Error('IDB unavailable'));
    // Should not throw; panel opens normally
    expect(() => openSettingsPanel()).not.toThrow();
    // Flush the rejected promise so the unhandled-rejection doesn't leak
    await Promise.resolve();
    await Promise.resolve();
  });
});
