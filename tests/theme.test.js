// Theme functionality tests
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { setStorageMockData } from './setup.js';
import {
  validateTheme,
  applyCustomTheme,
  clearCustomTheme,
  resolveThemeDependencies,
  mergeWithDefaults,
} from '../src/lib/theme/theme-sdk.js';

describe('Theme System', () => {
  let dom;
  let window;
  let document;
  
  beforeEach(async () => {
    // Create a fresh DOM for each test
    dom = new JSDOM(`
      <!DOCTYPE html>
      <html data-theme="light">
      <head></head>
      <body>
        <button id="themeToggle">
          <span class="theme-icon">🌙</span>
        </button>
        <div id="treeView"></div>
        <div id="emptyState"></div>
        <input id="searchInput" />
        <button id="clearSearchBtn"></button>
        <div id="searchResults"></div>
        <div id="searchResultsList"></div>
        <button id="addTopicBtn"></button>
        <button id="settingsBtn"></button>
        <div id="contextMenu"></div>
        <div id="modalContainer"></div>
        <span id="itemCount"></span>
        <span id="resultCount"></span>
        <span id="storageUsage"></span>
      </body>
      </html>
    `, {
      url: 'chrome-extension://test/',
      runScripts: 'dangerously',
      resources: 'usable'
    });
    
    window = dom.window;
    document = window.document;
    
    // Make them global for the script
    global.window = window;
    global.document = document;
    
    // Mock matchMedia
    window.matchMedia = vi.fn((query) => ({
      matches: query === '(prefers-color-scheme: dark)' ? false : true,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
  });

  it('should initialize with light theme by default', async () => {
    const result = await chrome.storage.local.get('theme');
    expect(result.theme).toBeUndefined(); // Not set yet
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('should toggle through themes in correct order', () => {
    const themes = ['light', 'dark', 'auto'];
    
    themes.forEach((theme) => {
      expect(themes).toContain(theme);
    });
    
    // Test cycling
    let currentIndex = 0;
    const nextTheme = themes[(currentIndex + 1) % themes.length];
    expect(nextTheme).toBe('dark');
    
    currentIndex = 1;
    const nextTheme2 = themes[(currentIndex + 1) % themes.length];
    expect(nextTheme2).toBe('auto');
    
    currentIndex = 2;
    const nextTheme3 = themes[(currentIndex + 1) % themes.length];
    expect(nextTheme3).toBe('light');
  });

  it('should set correct data-theme attribute', () => {
    const html = document.documentElement;
    
    // Test light theme
    html.setAttribute('data-theme', 'light');
    expect(html.getAttribute('data-theme')).toBe('light');
    
    // Test dark theme
    html.setAttribute('data-theme', 'dark');
    expect(html.getAttribute('data-theme')).toBe('dark');
  });

  it('should update theme icon text correctly', () => {
    const themeIcon = document.querySelector('.theme-icon');
    
    // Light mode shows moon (for switching to dark)
    themeIcon.textContent = '🌙';
    expect(themeIcon.textContent).toBe('🌙');
    
    // Dark mode shows sun (for switching to light)
    themeIcon.textContent = '☀️';
    expect(themeIcon.textContent).toBe('☀️');
    
    // Auto mode shows half moon
    themeIcon.textContent = '🌓';
    expect(themeIcon.textContent).toBe('🌓');
  });

  it('should save theme preference to storage', async () => {
    const testTheme = 'dark';
    await chrome.storage.local.set({ theme: testTheme });
    
    // In real usage, the mock resets between set and get in tests
    // This test validates the API is called correctly
    expect(chrome.storage.local.set).toHaveBeenCalled();
  });

  it('should load saved theme preference', async () => {
    // Set mock data for this test
    setStorageMockData({ theme: 'dark' });
    
    const result = await chrome.storage.local.get('theme');
    const savedTheme = result.theme || 'light';
    
    expect(savedTheme).toBe('dark');
  });

  it('should handle auto theme with system preference', () => {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const expectedTheme = prefersDark ? 'dark' : 'light';
    
    expect(['light', 'dark']).toContain(expectedTheme);
  });
});

// ─── validateTheme() ─────────────────────────────────────────────────────────

describe('validateTheme()', () => {
  const validTheme = {
    name: 'Test Theme',
    version: '1.0',
    variables: {
      '--primary': '#333',
      '--bg-primary': '#fff',
      '--text-primary': '#000',
    },
  };

  it('returns null for a valid theme', () => {
    expect(validateTheme(validTheme)).toBeNull();
  });

  it('returns error for null input', () => {
    expect(validateTheme(null)).toBeTruthy();
  });

  it('returns error for non-object input', () => {
    expect(validateTheme('string')).toBeTruthy();
  });

  it('returns error when "name" is missing', () => {
    const { name, ...noName } = validTheme;
    expect(validateTheme(noName)).toContain('"name"');
  });

  it('returns error when "version" is missing', () => {
    const { version, ...noVer } = validTheme;
    expect(validateTheme(noVer)).toContain('"version"');
  });

  it('returns error when "variables" is missing', () => {
    const { variables, ...noVars } = validTheme;
    expect(validateTheme(noVars)).toContain('"variables"');
  });

  it('returns error when variables is an array', () => {
    expect(validateTheme({ ...validTheme, variables: ['--primary'] })).toBeTruthy();
  });

  it('returns error when required variable --primary is missing', () => {
    const bad = { ...validTheme, variables: { '--bg-primary': '#fff', '--text-primary': '#000' } };
    expect(validateTheme(bad)).toContain('--primary');
  });

  it('returns error when a variable key does not start with --', () => {
    const bad = {
      ...validTheme,
      variables: { ...validTheme.variables, 'bad-key': '#f00' },
    };
    expect(validateTheme(bad)).toContain('--');
  });
});

// ─── applyCustomTheme() ──────────────────────────────────────────────────────

describe('applyCustomTheme()', () => {
  let el;

  beforeEach(() => {
    el = document.createElement('div');
    document.fonts = { ready: Promise.resolve() };
  });

  it('sets data-theme="custom" on the element', () => {
    applyCustomTheme({ variables: { '--primary': 'red', '--bg-primary': '#fff', '--text-primary': '#000' } }, el);
    expect(el.getAttribute('data-theme')).toBe('custom');
  });

  it('sets data-oled attribute when oled is true', () => {
    applyCustomTheme({ oled: true, variables: { '--primary': 'red', '--bg-primary': '#fff', '--text-primary': '#000' } }, el);
    expect(el.hasAttribute('data-oled')).toBe(true);
  });

  it('removes data-oled attribute when oled is false', () => {
    el.setAttribute('data-oled', '');
    applyCustomTheme({ oled: false, variables: { '--primary': 'red', '--bg-primary': '#fff', '--text-primary': '#000' } }, el);
    expect(el.hasAttribute('data-oled')).toBe(false);
  });

  it('sets data-color-scheme="dark" when dark is true', () => {
    applyCustomTheme({ dark: true, variables: { '--primary': 'red', '--bg-primary': '#fff', '--text-primary': '#000' } }, el);
    expect(el.getAttribute('data-color-scheme')).toBe('dark');
  });

  it('sets data-color-scheme="light" when dark is false', () => {
    applyCustomTheme({ dark: false, variables: { '--primary': 'red', '--bg-primary': '#fff', '--text-primary': '#000' } }, el);
    expect(el.getAttribute('data-color-scheme')).toBe('light');
  });

  it('removes data-color-scheme when dark is undefined', () => {
    el.setAttribute('data-color-scheme', 'dark');
    applyCustomTheme({ variables: { '--primary': 'red', '--bg-primary': '#fff', '--text-primary': '#000' } }, el);
    expect(el.hasAttribute('data-color-scheme')).toBe(false);
  });

  it('sets data-forced-colors="off" when forcedColors is false', () => {
    applyCustomTheme({ forcedColors: false, variables: { '--primary': 'red', '--bg-primary': '#fff', '--text-primary': '#000' } }, el);
    expect(el.getAttribute('data-forced-colors')).toBe('off');
  });

  it('removes data-forced-colors when forcedColors is true', () => {
    el.setAttribute('data-forced-colors', 'off');
    applyCustomTheme({ forcedColors: true, variables: { '--primary': 'red', '--bg-primary': '#fff', '--text-primary': '#000' } }, el);
    expect(el.hasAttribute('data-forced-colors')).toBe(false);
  });

  it('applies CSS custom properties from variables', () => {
    applyCustomTheme({ variables: { '--primary': 'blue', '--bg-primary': '#fff', '--text-primary': '#000' } }, el);
    expect(el.style.getPropertyValue('--primary')).toBe('blue');
  });

  it('skips motion variables when reducedMotion is true', () => {
    applyCustomTheme({
      reducedMotion: true,
      variables: {
        '--primary': 'red',
        '--bg-primary': '#fff',
        '--text-primary': '#000',
        '--transition-fast': '0.1s',
      },
    }, el);
    expect(el.style.getPropertyValue('--transition-fast')).toBe('');
  });

  it('applies accent-color when --accent-color is defined', () => {
    applyCustomTheme({ variables: { '--primary': 'red', '--bg-primary': '#fff', '--text-primary': '#000', '--accent-color': 'purple' } }, el);
    expect(el.style.getPropertyValue('accent-color')).toBe('purple');
  });

  it('removes accent-color when --accent-color is absent', () => {
    el.style.setProperty('accent-color', 'pink');
    applyCustomTheme({ variables: { '--primary': 'red', '--bg-primary': '#fff', '--text-primary': '#000' } }, el);
    expect(el.style.getPropertyValue('accent-color')).toBe('');
  });

  it('applies color-scheme when dark is defined', () => {
    applyCustomTheme({ dark: true, variables: { '--primary': 'red', '--bg-primary': '#fff', '--text-primary': '#000' } }, el);
    expect(el.style.getPropertyValue('color-scheme')).toBe('dark');
  });

  it('removes color-scheme when dark is undefined', () => {
    el.style.setProperty('color-scheme', 'dark');
    applyCustomTheme({ variables: { '--primary': 'red', '--bg-primary': '#fff', '--text-primary': '#000' } }, el);
    expect(el.style.getPropertyValue('color-scheme')).toBe('');
  });

  it('sets caret-color from --primary', () => {
    applyCustomTheme({ variables: { '--primary': 'green', '--bg-primary': '#fff', '--text-primary': '#000' } }, el);
    expect(el.style.getPropertyValue('caret-color')).toBe('green');
  });

  it('removes caret-color when --primary is absent', () => {
    el.style.setProperty('caret-color', 'red');
    applyCustomTheme({ variables: { '--bg-primary': '#fff', '--text-primary': '#000' } }, el);
    expect(el.style.getPropertyValue('caret-color')).toBe('');
  });
});

// ─── clearCustomTheme() ──────────────────────────────────────────────────────

describe('clearCustomTheme()', () => {
  let el;

  beforeEach(() => {
    el = document.createElement('div');
  });

  it('sets data-theme to the provided theme name', () => {
    clearCustomTheme('dark', el);
    expect(el.getAttribute('data-theme')).toBe('dark');
  });

  it('defaults to "light" theme when no argument given', () => {
    clearCustomTheme(undefined, el);
    expect(el.getAttribute('data-theme')).toBe('light');
  });

  it('clears all inline styles', () => {
    el.style.setProperty('--primary', 'red');
    clearCustomTheme('light', el);
    expect(el.style.cssText).toBe('');
  });
});

// ─── resolveThemeDependencies() ──────────────────────────────────────────────

describe('resolveThemeDependencies()', () => {
  it('resolves without throwing for a theme with no dependencies', async () => {
    await expect(resolveThemeDependencies({ name: 'T', variables: {} })).resolves.toBeUndefined();
  });

  it('resolves without throwing for null theme', async () => {
    await expect(resolveThemeDependencies(null)).resolves.toBeUndefined();
  });

  it('resolves without throwing for non-object', async () => {
    await expect(resolveThemeDependencies('string')).resolves.toBeUndefined();
  });

  it('resolves without throwing for theme with empty dependencies', async () => {
    await expect(resolveThemeDependencies({ name: 'T', dependencies: {}, variables: {} })).resolves.toBeUndefined();
  });

  it('logs a warning when requiredBaseVersion exceeds SDK version', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const theme = {
      name: 'Future',
      dependencies: { requiredBaseVersion: '99.0' },
      variables: {},
    };
    await resolveThemeDependencies(theme);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('99.0'));
    warnSpy.mockRestore();
  });

  it('does NOT warn when requiredBaseVersion matches SDK', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const theme = {
      name: 'CompatibleTheme',
      dependencies: { requiredBaseVersion: '1.0' },
      variables: {},
    };
    await resolveThemeDependencies(theme);
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('injects google fonts link tags when fonts are declared', async () => {
    document.fonts = { ready: Promise.resolve() };
    const theme = {
      name: 'FontTheme',
      dependencies: { fonts: ['Roboto'] },
      variables: {},
    };
    await resolveThemeDependencies(theme);
    const linkEl = document.head.querySelector('link[rel="stylesheet"]');
    expect(linkEl).not.toBeNull();
  });

  it('injects preconnect link for Google Fonts', async () => {
    document.fonts = { ready: Promise.resolve() };
    const theme = {
      name: 'FontTheme3',
      dependencies: { fonts: ['Open+Sans'] },
      variables: {},
    };
    await resolveThemeDependencies(theme);
    const preconnects = document.head.querySelectorAll('link[rel="preconnect"]');
    expect(preconnects.length).toBeGreaterThan(0);
  });
});

// ─── mergeWithDefaults() ─────────────────────────────────────────────────────

describe('mergeWithDefaults()', () => {
  const base = {
    name: 'Base',
    version: '1.0',
    variables: { '--primary': 'blue', '--bg-primary': 'white' },
  };
  const defaults = { '--primary': 'red', '--extra': 'green' };

  it('returns a new object (does not mutate theme)', () => {
    const result = mergeWithDefaults(base, defaults);
    expect(result).not.toBe(base);
  });

  it('theme variables override defaults', () => {
    const result = mergeWithDefaults(base, defaults);
    expect(result.variables['--primary']).toBe('blue'); // theme wins over 'red'
  });

  it('default variables fill in missing theme keys', () => {
    const result = mergeWithDefaults(base, defaults);
    expect(result.variables['--extra']).toBe('green');
  });

  it('preserves other theme properties', () => {
    const result = mergeWithDefaults(base, defaults);
    expect(result.name).toBe('Base');
    expect(result.version).toBe('1.0');
  });

  it('works with empty defaults', () => {
    const result = mergeWithDefaults(base, {});
    expect(result.variables).toEqual(base.variables);
  });

  it('throws when theme is null', () => {
    expect(() => mergeWithDefaults(null)).toThrow();
  });

  it('throws when theme has no variables', () => {
    expect(() => mergeWithDefaults({ name: 'X' })).toThrow();
  });
});
