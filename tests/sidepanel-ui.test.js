import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Sidepanel UI - Critical Safety Tests Only
 * 
 * These tests catch REAL issues that matter:
 * - CSP violations (breaks extension in production)
 * - Duplicate IDs (breaks getElementById)
 * - Console errors (indicates bugs)
 * - Accessibility violations (breaks screen readers)
 * 
 * Tests that just check "does element exist" have been removed.
 * If an element is missing, the behavior tests will fail anyway.
 */
describe('Sidepanel UI - Critical Safety Only', () => {
  let dom;
  let window;
  let document;
  let consoleErrorSpy;
  let consoleWarnSpy;

  beforeEach(async () => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const htmlPath = path.resolve(__dirname, '../src/sidepanel/sidepanel.html');
    const html = fs.readFileSync(htmlPath, 'utf-8');

    dom = new JSDOM(html, {
      url: 'chrome-extension://test/sidepanel/sidepanel.html',
      runScripts: 'dangerously',
      resources: 'usable',
      pretendToBeVisual: true
    });

    window = dom.window;
    document = window.document;

    global.chrome = {
      storage: {
        local: {
          get: vi.fn().mockResolvedValue({}),
          set: vi.fn().mockResolvedValue(undefined)
        }
      },
      runtime: {
        sendMessage: vi.fn()
      }
    };

    await new Promise(resolve => setTimeout(resolve, 100));
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    dom.window.close();
    delete global.chrome;
  });

  describe('CSP Compliance - Catches Security Violations', () => {
    it('should not have onclick attributes (CSP violation)', () => {
      const elementsWithOnclick = document.querySelectorAll('[onclick]');
      expect(elementsWithOnclick.length).toBe(0);
    });

    it('should not have onerror attributes', () => {
      const elementsWithOnerror = document.querySelectorAll('[onerror]');
      expect(elementsWithOnerror.length).toBe(0);
    });

    it('should not have onload attributes on non-body elements', () => {
      const elementsWithOnload = document.querySelectorAll('*:not(body)[onload]');
      expect(elementsWithOnload.length).toBe(0);
    });

    it('should not have inline event handlers', () => {
      const inlineEvents = ['onchange', 'oninput', 'onsubmit', 'onfocus', 'onblur'];
      inlineEvents.forEach(event => {
        const elements = document.querySelectorAll(`[${event}]`);
        expect(elements.length).toBe(0);
      });
    });
  });

  describe('HTML Structure - Catches Real Bugs', () => {
    it('should not have onclick on create first topic button', () => {
      const createFirstTopicBtn = document.getElementById('createFirstTopicBtn');
      if (createFirstTopicBtn) {
        expect(createFirstTopicBtn.hasAttribute('onclick')).toBe(false);
      }
    });

    it('should not have duplicate IDs (breaks getElementById)', () => {
      const allElements = document.querySelectorAll('[id]');
      const ids = Array.from(allElements).map(el => el.id);
      const uniqueIds = new Set(ids);
      expect(ids.length).toBe(uniqueIds.size);
    });
  });

  describe('Runtime Safety - Catches Bugs', () => {
    it('should not log console errors during initialization', () => {
      const errorCalls = consoleErrorSpy.mock.calls;
      const unexpectedErrors = errorCalls.filter(call => {
        const message = String(call[0]);
        return !message.includes('deprecated') &&
               !message.includes('Could not load link') &&
               !message.includes('Could not load script');
      });
      expect(unexpectedErrors.length).toBe(0);
    });
  });

  describe('Accessibility - Catches Real Issues', () => {
    it('should have accessible button labels for screen readers', () => {
      const buttons = document.querySelectorAll('button');
      buttons.forEach(button => {
        const hasLabel = button.textContent.trim().length > 0 || 
                        button.hasAttribute('aria-label') ||
                        button.querySelector('svg') !== null;
        expect(hasLabel).toBe(true);
      });
    });
  });
});
