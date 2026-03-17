/**
 * Tests for src/sidepanel/features/save-banner.js
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  _setContext,
  detectPlatformFromUrl,
  setSaveBtnState,
  initSaveBanner,
  handlePanelSave,
} from '../src/sidepanel/features/save-banner.js';
import { elements } from '../src/sidepanel/app-context.js';

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('../src/lib/vendor/browser.js', () => ({
  default: {
    tabs: {
      query:       vi.fn().mockResolvedValue([{ id: 1, url: 'https://chatgpt.com/c/123' }]),
      sendMessage: vi.fn().mockResolvedValue({ success: true, data: { title: 'Test', messageCount: 1 } }),
    },
    runtime: {
      sendMessage: vi.fn().mockResolvedValue({ success: true }),
    },
  },
}));

vi.mock('../src/sidepanel/features/storage-usage.js', () => ({
  updateStorageUsage: vi.fn().mockResolvedValue(undefined),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeSaveBtn() {
  const btn = document.createElement('button');
  btn.id = 'saveBtn';
  document.body.appendChild(btn);
  elements.saveBtn = btn;
  return btn;
}

function makeBanner() {
  const banner = document.createElement('div');
  banner.id = 'saveBanner';
  document.body.appendChild(banner);
  elements.saveBanner = banner;
  return banner;
}

function makeBannerMsg() {
  const msg = document.createElement('span');
  msg.id = 'saveBannerMsg';
  document.body.appendChild(msg);
  elements.saveBannerMsg = msg;
  return msg;
}

beforeEach(() => {
  document.body.innerHTML = '';
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
  elements.saveBtn     = null;
  elements.saveBanner  = null;
  elements.saveBannerMsg = null;
  _setContext({ tree: null, lastCreatedTopicId: null, lastUsedTopicId: null });
  vi.clearAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────
// detectPlatformFromUrl()
// ─────────────────────────────────────────────────────────────────────────────

describe('detectPlatformFromUrl()', () => {
  it('returns null for null input', () => {
    expect(detectPlatformFromUrl(null)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(detectPlatformFromUrl('')).toBeNull();
  });

  it('detects ChatGPT', () => {
    expect(detectPlatformFromUrl('https://chatgpt.com/c/abc')).toBe('ChatGPT');
  });

  it('detects Claude', () => {
    expect(detectPlatformFromUrl('https://claude.ai/chat/xyz')).toBe('Claude');
  });

  it('detects Gemini', () => {
    expect(detectPlatformFromUrl('https://gemini.google.com/app')).toBe('Gemini');
  });

  it('detects Copilot (copilot.microsoft.com)', () => {
    expect(detectPlatformFromUrl('https://copilot.microsoft.com/')).toBe('Copilot');
  });

  it('detects Perplexity', () => {
    expect(detectPlatformFromUrl('https://www.perplexity.ai/search')).toBe('Perplexity');
  });

  it('detects DeepSeek', () => {
    expect(detectPlatformFromUrl('https://chat.deepseek.com/')).toBe('DeepSeek');
  });

  it('returns null for unknown sites', () => {
    expect(detectPlatformFromUrl('https://example.com')).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// setSaveBtnState()
// ─────────────────────────────────────────────────────────────────────────────

describe('setSaveBtnState()', () => {
  it('does nothing when saveBtn element is absent', () => {
    elements.saveBtn = null;
    expect(() => setSaveBtnState('default')).not.toThrow();
  });

  it('sets default state with generic label when no topic', () => {
    const btn = makeSaveBtn();
    _setContext({ tree: null, lastCreatedTopicId: null, lastUsedTopicId: null });
    setSaveBtnState('default');
    expect(btn.textContent).toBe('💾 Save');
    expect(btn.disabled).toBe(false);
  });

  it('includes topic name in default label when lastCreatedTopicId is set', () => {
    const btn = makeSaveBtn();
    const tree = { topics: { t1: { id: 't1', name: 'Work Notes' } } };
    _setContext({ tree, lastCreatedTopicId: 't1', lastUsedTopicId: null });
    setSaveBtnState('default');
    expect(btn.textContent).toContain('Work Notes');
  });

  it('truncates long topic names in the default label', () => {
    const btn = makeSaveBtn();
    const tree = { topics: { t1: { id: 't1', name: 'A'.repeat(30) } } };
    _setContext({ tree, lastCreatedTopicId: 't1', lastUsedTopicId: null });
    setSaveBtnState('default');
    expect(btn.textContent.length).toBeLessThan(50);
    expect(btn.textContent).toContain('…');
  });

  it('sets loading state (disabled)', () => {
    const btn = makeSaveBtn();
    setSaveBtnState('loading');
    expect(btn.textContent).toContain('Saving');
    expect(btn.disabled).toBe(true);
  });

  it('sets success state and auto-resets after timeout', () => {
    const btn = makeSaveBtn();
    _setContext({ tree: null, lastCreatedTopicId: null, lastUsedTopicId: null });
    setSaveBtnState('success');
    expect(btn.textContent).toContain('Saved');
    expect(btn.disabled).toBe(true);
    vi.runAllTimers();
    // After timeout it resets to default
    expect(btn.textContent).toContain('💾');
  });

  it('sets error state (not disabled, auto-resets)', () => {
    const btn = makeSaveBtn();
    _setContext({ tree: null, lastCreatedTopicId: null, lastUsedTopicId: null });
    setSaveBtnState('error');
    expect(btn.textContent).toContain('Error');
    expect(btn.disabled).toBe(false);
    vi.runAllTimers();
    expect(btn.textContent).toContain('💾');
  });

  it('sets empty state (auto-resets)', () => {
    const btn = makeSaveBtn();
    _setContext({ tree: null, lastCreatedTopicId: null, lastUsedTopicId: null });
    setSaveBtnState('empty');
    expect(btn.textContent).toContain('No chat');
    vi.runAllTimers();
    expect(btn.textContent).toContain('💾');
  });

  it('sets reload state', () => {
    const btn = makeSaveBtn();
    setSaveBtnState('reload');
    expect(btn.textContent).toContain('Reload');
    expect(btn._reloadMode).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// initSaveBanner()
// ─────────────────────────────────────────────────────────────────────────────

describe('initSaveBanner()', () => {
  it('does nothing when saveBanner element is absent', async () => {
    elements.saveBanner = null;
    await expect(initSaveBanner()).resolves.toBeUndefined();
  });

  it('shows banner when active tab is a supported AI platform', async () => {
    const browser = (await import('../src/lib/vendor/browser.js')).default;
    browser.tabs.query.mockResolvedValueOnce([{ id: 1, url: 'https://chatgpt.com/c/1' }]);

    const banner = makeBanner();
    const msg    = makeBannerMsg();
    const btn    = makeSaveBtn();
    _setContext({ tree: null, lastCreatedTopicId: null, lastUsedTopicId: null });

    await initSaveBanner();
    expect(banner.style.display).toBe('flex');
    expect(msg.textContent).toContain('ChatGPT');
  });

  it('hides banner when active tab is not a supported platform', async () => {
    const browser = (await import('../src/lib/vendor/browser.js')).default;
    browser.tabs.query.mockResolvedValueOnce([{ id: 1, url: 'https://example.com' }]);

    const banner = makeBanner();
    makeBannerMsg();
    makeSaveBtn();

    await initSaveBanner();
    expect(banner.style.display).toBe('none');
  });

  it('hides banner when tabs.query throws', async () => {
    const browser = (await import('../src/lib/vendor/browser.js')).default;
    browser.tabs.query.mockRejectedValueOnce(new Error('Permission denied'));

    const banner = makeBanner();
    makeSaveBtn();

    await initSaveBanner();
    expect(banner.style.display).toBe('none');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// handlePanelSave()
// ─────────────────────────────────────────────────────────────────────────────

describe('handlePanelSave()', () => {
  it('sets loading state, then success when chain succeeds', async () => {
    const browser = (await import('../src/lib/vendor/browser.js')).default;
    browser.tabs.query.mockResolvedValueOnce([{ id: 1, url: 'https://chatgpt.com/' }]);
    browser.tabs.sendMessage.mockResolvedValueOnce({
      success: true,
      data: { title: 'Chat A', messageCount: 5 },
    });
    browser.runtime.sendMessage.mockResolvedValueOnce({ success: true });

    const btn = makeSaveBtn();
    makeBannerMsg();
    _setContext({ tree: null, lastCreatedTopicId: null, lastUsedTopicId: null });

    const { updateStorageUsage } = await import('../src/sidepanel/features/storage-usage.js');
    updateStorageUsage.mockClear();

    await handlePanelSave();
    // success: updateStorageUsage is called, no error state set
    expect(updateStorageUsage).toHaveBeenCalled();
    // success state is deferred to handleChatSaved — btn stays in loading
    expect(btn.textContent).toContain('Saving');
  });

  it('sets "empty" state when chat has no messages', async () => {
    const browser = (await import('../src/lib/vendor/browser.js')).default;
    browser.tabs.query.mockResolvedValueOnce([{ id: 1 }]);
    browser.tabs.sendMessage.mockResolvedValueOnce({
      success: true,
      data: { title: '', messageCount: 0, messages: [] },
    });

    const btn = makeSaveBtn();
    _setContext({ tree: null, lastCreatedTopicId: null, lastUsedTopicId: null });

    await handlePanelSave();
    vi.runAllTimers(); // let the auto-reset fire
    // After the empty state auto-reset, btn should be back to default
    expect(btn.textContent).toContain('💾');
  });

  it('sets "reload" state when content script is unreachable', async () => {
    const browser = (await import('../src/lib/vendor/browser.js')).default;
    browser.tabs.query.mockResolvedValueOnce([{ id: 1 }]);
    browser.tabs.sendMessage.mockRejectedValueOnce(
      new Error('Could not establish connection. Receiving end does not exist')
    );

    const btn    = makeSaveBtn();
    const msg    = makeBannerMsg();
    makeBanner();
    _setContext({ tree: null, lastCreatedTopicId: null, lastUsedTopicId: null });

    await handlePanelSave();
    expect(btn.textContent).toContain('Reload');
    expect(msg.textContent).toContain('Reload');
  });

  it('sets "error" state on generic failure', async () => {
    const browser = (await import('../src/lib/vendor/browser.js')).default;
    browser.tabs.query.mockResolvedValueOnce([{ id: 1 }]);
    browser.tabs.sendMessage.mockRejectedValueOnce(new Error('Unknown error'));

    const btn = makeSaveBtn();
    _setContext({ tree: null, lastCreatedTopicId: null, lastUsedTopicId: null });

    await handlePanelSave();
    expect(btn.textContent).toContain('Error');
  });

  it('sets error when extraction fails (success: false)', async () => {
    const browser = (await import('../src/lib/vendor/browser.js')).default;
    browser.tabs.query.mockResolvedValueOnce([{ id: 1 }]);
    browser.tabs.sendMessage.mockResolvedValueOnce({
      success: false, error: 'Extraction failed',
    });

    const btn = makeSaveBtn();
    _setContext({ tree: null, lastCreatedTopicId: null, lastUsedTopicId: null });

    await handlePanelSave();
    expect(btn.textContent).toContain('Error');
  });

  it('throws when no active tab found', async () => {
    const browser = (await import('../src/lib/vendor/browser.js')).default;
    browser.tabs.query.mockResolvedValueOnce([]);

    const btn = makeSaveBtn();
    _setContext({ tree: null, lastCreatedTopicId: null, lastUsedTopicId: null });

    await handlePanelSave();
    expect(btn.textContent).toContain('Error');
  });
});
