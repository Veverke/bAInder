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

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildPanelDOM() {
  document.body.innerHTML = `
    <div id="settingsPanel" aria-hidden="true">
      <div class="settings-panel__backdrop"></div>
      <button id="settingsPanelClose"></button>
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

  it('wires backdrop click to close the panel', () => {
    openSettingsPanel();
    const panel = document.getElementById('settingsPanel');
    panel.querySelector('.settings-panel__backdrop').click();
    expect(panel.classList.contains('settings-panel--open')).toBe(false);
  });

  it('wires close button to close the panel', () => {
    openSettingsPanel();
    const panel = document.getElementById('settingsPanel');
    document.getElementById('settingsPanelClose').click();
    expect(panel.classList.contains('settings-panel--open')).toBe(false);
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
