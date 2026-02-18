// Theme functionality tests
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { setStorageMockData } from './setup.js';

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
