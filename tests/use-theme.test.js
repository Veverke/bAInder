/**
 * Tests for src/lib/theme/useTheme.js
 *
 * Strategy: vi.mock() all heavy dependency modules so the tests focus only on
 * the orchestration logic in useTheme.js itself.
 */

import { vi } from 'vitest';

// ─── Mock heavy dependencies before importing useTheme ────────────────────────

vi.mock('../src/lib/theme/theme-sdk.js', () => ({
  validateTheme:          vi.fn(() => null),   // null = valid
  resolveThemeDependencies: vi.fn(async () => {}),
  applyCustomTheme:       vi.fn(),
  mergeWithDefaults:      vi.fn((theme) => ({ ...theme })),
}));

vi.mock('../src/sidepanel/themes/index.js', () => ({
  BUNDLED_THEMES:   {
    light: {
      name: 'Light', version: '1.0',
      variables: { '--primary': '#fff', '--bg-primary': '#fff', '--text-primary': '#000' },
    },
    dark: {
      name: 'Dark', version: '1.0',
      variables: { '--primary': '#000', '--bg-primary': '#000', '--text-primary': '#fff' },
    },
  },
  BUNDLED_THEME_IDS: ['light', 'dark'],
}));

vi.mock('../src/lib/theme/theme-defaults.js', () => ({
  THEME_DEFAULTS: {},
}));

// ─── Import after mocks are set up ────────────────────────────────────────────

import {
  loadTheme,
  persistTheme,
  restoreTheme,
  BUNDLED_THEME_IDS,
} from '../src/lib/theme/useTheme.js';

import {
  validateTheme,
  resolveThemeDependencies,
  applyCustomTheme,
  mergeWithDefaults,
} from '../src/lib/theme/theme-sdk.js';

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('BUNDLED_THEME_IDS re-export', () => {
  it('re-exports BUNDLED_THEME_IDS array', () => {
    expect(Array.isArray(BUNDLED_THEME_IDS)).toBe(true);
    expect(BUNDLED_THEME_IDS).toContain('light');
    expect(BUNDLED_THEME_IDS).toContain('dark');
  });
});

describe('loadTheme', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('validates, merges, resolves, and applies a known theme', async () => {
    await loadTheme('light');
    expect(validateTheme).toHaveBeenCalled();
    expect(mergeWithDefaults).toHaveBeenCalled();
    expect(resolveThemeDependencies).toHaveBeenCalled();
    expect(applyCustomTheme).toHaveBeenCalled();
  });

  it('falls back to "light" for an unknown theme id', async () => {
    await loadTheme('nonexistent-theme');
    expect(console.warn).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.stringContaining('[useTheme]'),
    );
    // After fallback, the light theme should be applied
    expect(applyCustomTheme).toHaveBeenCalled();
  });

  it('returns early (no apply) when validateTheme returns an error string', async () => {
    validateTheme.mockReturnValueOnce('Missing required field: "name".');
    await loadTheme('light');
    expect(console.error).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.stringContaining('[useTheme]'),
    );
    expect(applyCustomTheme).not.toHaveBeenCalled();
  });

  it('loads dark theme successfully', async () => {
    await loadTheme('dark');
    expect(applyCustomTheme).toHaveBeenCalled();
  });
});

describe('persistTheme', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.chrome.storage.local.set.mockResolvedValue();
  });

  it('calls chrome.storage.local.set with the theme id', async () => {
    await persistTheme('dark');
    expect(global.chrome.storage.local.set).toHaveBeenCalledWith({ themeId: 'dark' });
  });

  it('mirrors theme id to localStorage', async () => {
    await persistTheme('dark');
    expect(localStorage.getItem('themeId')).toBe('dark');
  });

  it('persists light theme', async () => {
    await persistTheme('light');
    expect(global.chrome.storage.local.set).toHaveBeenCalledWith({ themeId: 'light' });
  });

  it('handles a localStorage write error gracefully', async () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
      throw new Error('QuotaExceededError');
    });
    await expect(persistTheme('dark')).resolves.not.toThrow();
    spy.mockRestore();
  });
});

describe('restoreTheme', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('applies the persisted theme when found in storage', async () => {
    global.chrome.storage.local.get.mockResolvedValueOnce({ themeId: 'dark' });
    await restoreTheme();
    expect(applyCustomTheme).toHaveBeenCalled();
  });

  it('falls back to "light" when no theme is stored', async () => {
    global.chrome.storage.local.get.mockResolvedValueOnce({});
    await restoreTheme();
    expect(applyCustomTheme).toHaveBeenCalled();
  });

  it('falls back to "light" when chrome.storage.local.get throws', async () => {
    global.chrome.storage.local.get.mockRejectedValueOnce(new Error('storage error'));
    await restoreTheme();
    // Should still apply some theme (the light fallback)
    expect(applyCustomTheme).toHaveBeenCalled();
  });
});
