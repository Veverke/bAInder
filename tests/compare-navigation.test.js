/**
 * tests/compare-navigation.test.js — Phase 1
 * Tests for handleCompare() URL construction and guard clauses.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ── Mock browser ──────────────────────────────────────────────────────────
vi.mock('../src/lib/vendor/browser.js', () => ({
  default: new Proxy({}, { get(_, prop) { return global.chrome?.[prop]; } })
}));

// ── Mock app-context ──────────────────────────────────────────────────────
const mockState = vi.hoisted(() => ({ renderer: null }));
vi.mock('../src/sidepanel/app-context.js', () => ({ state: mockState }));

import { handleCompare } from '../src/sidepanel/features/compare.js';

describe('handleCompare', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default getURL behaviour already set in setup.js:
    // chrome.runtime.getURL returns `chrome-extension://test-id/${path}`
  });

  it('returns immediately with no renderer', async () => {
    mockState.renderer = null;
    await handleCompare();
    expect(chrome.tabs.create).not.toHaveBeenCalled();
  });

  it('returns immediately when 0 chats selected', async () => {
    mockState.renderer = { getSelectedChats: () => [] };
    await handleCompare();
    expect(chrome.tabs.create).not.toHaveBeenCalled();
  });

  it('returns immediately when 1 chat selected', async () => {
    mockState.renderer = { getSelectedChats: () => [{ id: 'chat-abc' }] };
    await handleCompare();
    expect(chrome.tabs.create).not.toHaveBeenCalled();
  });

  it('calls tabs.create with URL containing both IDs when 2 chats selected', async () => {
    mockState.renderer = {
      getSelectedChats: () => [{ id: 'chat-1' }, { id: 'chat-2' }],
    };
    await handleCompare();
    expect(chrome.tabs.create).toHaveBeenCalledOnce();
    const { url } = chrome.tabs.create.mock.calls[0][0];
    expect(url).toContain('chat-1');
    expect(url).toContain('chat-2');
    expect(url).toContain('compare.html');
  });

  it('URL contains all 3 IDs comma-separated when 3 chats selected', async () => {
    mockState.renderer = {
      getSelectedChats: () => [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
    };
    await handleCompare();
    const { url } = chrome.tabs.create.mock.calls[0][0];
    // IDs are encodeURIComponent-encoded individually; commas are the separator (not encoded)
    expect(url).toContain('ids=a,b,c');
  });

  it('encodes IDs with special characters', async () => {
    mockState.renderer = {
      getSelectedChats: () => [{ id: 'chat/1 2' }, { id: 'chat&3' }],
    };
    await handleCompare();
    const { url } = chrome.tabs.create.mock.calls[0][0];
    // encodeURIComponent('chat/1 2') = 'chat%2F1%202'
    expect(url).toContain('chat%2F1%202');
    // encodeURIComponent('chat&3') = 'chat%263'
    expect(url).toContain('chat%263');
  });
});
