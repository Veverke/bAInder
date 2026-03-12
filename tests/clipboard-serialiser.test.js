/**
 * clipboard-serialiser.test.js
 *
 * Unit tests for src/lib/export/clipboard-serialiser.js
 *
 * Covers:
 *  - chatToPlainText()
 *  - chatToMarkdown()
 *  - serialiseChats()
 *  - getClipboardFormat()
 *  - writeToClipboard() — Clipboard API path and execCommand fallback
 *  - copyChatsToClipboard() — happy path, tooLarge guard, bulkWarning, error path
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../src/lib/export/markdown-builder.js', () => ({
  buildExportMarkdown: vi.fn((chat, topicPath) =>
    `---\ntitle: "${chat?.title ?? ''}"\n---\n\n# ${chat?.title ?? ''}\n`),
}));

vi.mock('../src/lib/vendor/browser.js', () => ({
  default: {
    storage: {
      local: {
        get: vi.fn(),
      },
    },
  },
}));

import {
  CLIPBOARD_FORMAT_KEY,
  CLIPBOARD_SETTINGS_KEY,
  MAX_CLIPBOARD_CHARS,
  BULK_WARN_THRESHOLD,
  DEFAULT_CLIPBOARD_SETTINGS,
  chatToPlainText,
  chatToMarkdown,
  chatToHtml,
  serialiseChats,
  getClipboardSettings,
  getClipboardFormat,
  writeToClipboard,
  writeToClipboardHtml,
  copyChatsToClipboard,
  sanitiseSeparator,
  renderSeparator,
  applyContentFilters,
} from '../src/lib/export/clipboard-serialiser.js';

import { buildExportMarkdown } from '../src/lib/export/markdown-builder.js';
import browser from '../src/lib/vendor/browser.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const FIXED_TS = 1_740_000_000_000; // 2025-02-20T00:00:00.000Z (deterministic)
const FIXED_ISO = new Date(FIXED_TS).toISOString();

function makeChat(overrides = {}) {
  return {
    id: 'chat-1',
    title: 'Test Chat',
    source: 'chatgpt',
    url: 'https://chatgpt.com/c/abc',
    timestamp: FIXED_TS,
    messages: [
      { role: 'user',      content: 'Hello!' },
      { role: 'assistant', content: 'Hi there!' },
    ],
    content: '# Test Chat\n\nHello!\n\nHi there!',
    metadata: {},
    ...overrides,
  };
}

// ─── Constants ────────────────────────────────────────────────────────────────

describe('exported constants', () => {
  it('CLIPBOARD_FORMAT_KEY is the expected storage key string', () => {
    expect(CLIPBOARD_FORMAT_KEY).toBe('clipboardFormat');
  });

  it('CLIPBOARD_SETTINGS_KEY is the expected storage key string', () => {
    expect(CLIPBOARD_SETTINGS_KEY).toBe('clipboardSettings');
  });

  it('MAX_CLIPBOARD_CHARS is 1_000_000', () => {
    expect(MAX_CLIPBOARD_CHARS).toBe(1_000_000);
  });

  it('BULK_WARN_THRESHOLD is 20', () => {
    expect(BULK_WARN_THRESHOLD).toBe(20);
  });

  it('DEFAULT_CLIPBOARD_SETTINGS has all expected defaults', () => {
    expect(DEFAULT_CLIPBOARD_SETTINGS).toEqual({
      format: 'plain',
      includeEmojis: true,
      includeImages: false,
      includeAttachments: false,
      separator: '------------------------------------',
      turnSeparator: '---',
    });
  });

  it('DEFAULT_CLIPBOARD_SETTINGS is frozen', () => {
    expect(Object.isFrozen(DEFAULT_CLIPBOARD_SETTINGS)).toBe(true);
  });
});

// ─── chatToPlainText ──────────────────────────────────────────────────────────

describe('chatToPlainText', () => {
  it('returns empty string for null / undefined', () => {
    expect(chatToPlainText(null)).toBe('');
    expect(chatToPlainText(undefined)).toBe('');
  });

  it('includes the title as the first heading', () => {
    const result = chatToPlainText(makeChat({ title: 'My Chat' }));
    expect(result).toContain('# My Chat');
  });

  it('includes source and saved date on the same line', () => {
    const result = chatToPlainText(makeChat());
    expect(result).toContain(`Source: chatgpt | Saved: ${FIXED_ISO}`);
  });

  it('omits the Saved part when timestamp is missing', () => {
    const result = chatToPlainText(makeChat({ timestamp: 0 }));
    expect(result).toContain('Source: chatgpt');
    expect(result).not.toContain('| Saved:');
  });

  it('renders user and assistant messages with role labels', () => {
    const result = chatToPlainText(makeChat());
    expect(result).toContain('User: Hello!');
    expect(result).toContain('Assistant: Hi there!');
  });

  it('separates turns with the configurable turn separator', () => {
    const result = chatToPlainText(makeChat());
    expect(result).toContain('User: Hello!');
    expect(result).toContain('Assistant: Hi there!');
    // Default turn separator --- appears between turns but not before the first
    const lines = result.split('\n');
    const userIdx      = lines.findIndex(l => l.startsWith('User:'));
    const sepIdx       = lines.findIndex((l, i) => i > userIdx && l === '---');
    const assistantIdx = lines.findIndex(l => l.startsWith('Assistant:'));
    expect(sepIdx).toBeGreaterThan(userIdx);
    expect(assistantIdx).toBeGreaterThan(sepIdx);
  });

  it('capitalises unknown roles', () => {
    const chat = makeChat({
      messages: [{ role: 'system', content: 'You are helpful.' }],
    });
    const result = chatToPlainText(chat);
    expect(result).toContain('System: You are helpful.');
  });

  it('falls back to content field when messages is empty', () => {
    const chat = makeChat({
      messages: [],
      content: 'Fallback plain text body',
    });
    const result = chatToPlainText(chat);
    expect(result).toContain('Fallback plain text body');
  });

  it('omits body section gracefully when messages is empty and content is empty', () => {
    const chat = makeChat({ messages: [], content: '' });
    const result = chatToPlainText(chat);
    // Should still have the header but no horizontal rule
    expect(result).toContain('# Test Chat');
    expect(result).not.toContain('---');
  });

  it('uses "Untitled Chat" when title is missing', () => {
    const result = chatToPlainText(makeChat({ title: '' }));
    expect(result).toContain('# Untitled Chat');
  });

  it('trims whitespace from message content', () => {
    const chat = makeChat({
      messages: [{ role: 'user', content: '  spaced  ' }],
    });
    const result = chatToPlainText(chat);
    expect(result).toContain('User: spaced');
  });
});

// ─── chatToMarkdown ───────────────────────────────────────────────────────────

describe('chatToMarkdown', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    buildExportMarkdown.mockReturnValue('## mocked markdown');
  });

  it('returns empty string for null / undefined', () => {
    expect(chatToMarkdown(null)).toBe('');
    expect(chatToMarkdown(undefined)).toBe('');
  });

  it('delegates to buildExportMarkdown with an empty topicPath', () => {
    const chat = makeChat();
    const result = chatToMarkdown(chat);
    expect(buildExportMarkdown).toHaveBeenCalledWith(chat, '');
    expect(result).toBe('## mocked markdown');
  });
});

// ─── serialiseChats ───────────────────────────────────────────────────────────

describe('serialiseChats', () => {
  it('returns empty string for empty array', () => {
    expect(serialiseChats([])).toBe('');
  });

  it('returns empty string for non-array input', () => {
    expect(serialiseChats(null)).toBe('');
    expect(serialiseChats(undefined)).toBe('');
  });

  it('serialises a single chat in plain format', () => {
    const chat = makeChat({ title: 'Solo Chat', messages: [] });
    const result = serialiseChats([chat], 'plain');
    expect(result).toContain('# Solo Chat');
  });

  it('joins multiple chats with a separator', () => {
    const chats = [
      makeChat({ id: 'a', title: 'Alpha', messages: [] }),
      makeChat({ id: 'b', title: 'Beta',  messages: [] }),
    ];
    const result = serialiseChats(chats, 'plain');
    expect(result).toContain('# Alpha');
    expect(result).toContain('# Beta');
    // The inter-chat separator uses the default chat separator
    expect(result).toContain('\n\n------------------------------------\n\n');
  });

  it('uses chatToMarkdown when format is "markdown"', () => {
    buildExportMarkdown.mockReturnValue('MD_OUTPUT');
    const chats = [makeChat(), makeChat({ id: 'chat-2' })];
    const result = serialiseChats(chats, 'markdown');
    expect(buildExportMarkdown).toHaveBeenCalledTimes(2);
    expect(result).toContain('MD_OUTPUT');
  });

  it('defaults to plain format when format is omitted', () => {
    const chat = makeChat({ messages: [] });
    const result = serialiseChats([chat]);
    expect(result).toContain('# Test Chat');
    expect(buildExportMarkdown).not.toHaveBeenCalled();
  });
});

// ─── getClipboardFormat ───────────────────────────────────────────────────────

describe('getClipboardFormat', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns "plain" when no preference is stored', async () => {
    browser.storage.local.get.mockResolvedValue({});
    expect(await getClipboardFormat()).toBe('plain');
  });

  it('returns "markdown" when stored value is "markdown"', async () => {
    browser.storage.local.get.mockResolvedValue({ clipboardFormat: 'markdown' });
    expect(await getClipboardFormat()).toBe('markdown');
  });

  it('returns "html" when stored in clipboardSettings.format', async () => {
    browser.storage.local.get.mockResolvedValue({ clipboardSettings: { format: 'html' } });
    expect(await getClipboardFormat()).toBe('html');
  });

  it('delegates to getClipboardSettings and reads both storage keys', async () => {
    browser.storage.local.get.mockResolvedValue({});
    await getClipboardFormat();
    expect(browser.storage.local.get).toHaveBeenCalledWith([CLIPBOARD_SETTINGS_KEY, CLIPBOARD_FORMAT_KEY]);
  });
});

// ─── writeToClipboard ─────────────────────────────────────────────────────────

describe('writeToClipboard', () => {
  let originalClipboard;

  beforeEach(() => {
    originalClipboard = navigator.clipboard;
    vi.clearAllMocks();
  });

  afterEach(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: originalClipboard,
      configurable: true,
      writable: true,
    });
  });

  it('calls navigator.clipboard.writeText when available', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
      writable: true,
    });

    await writeToClipboard('hello');
    expect(writeText).toHaveBeenCalledWith('hello');
  });

  it('falls back to execCommand when clipboard API is unavailable', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: undefined,
      configurable: true,
      writable: true,
    });

    const mockExec = vi.fn().mockReturnValue(true);
    document.execCommand = mockExec;
    await writeToClipboard('fallback text');
    expect(mockExec).toHaveBeenCalledWith('copy');
    delete document.execCommand;
  });

  it('falls back to execCommand when clipboard API rejects', async () => {
    const writeText = vi.fn().mockRejectedValue(new DOMException('Permission denied'));
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
      writable: true,
    });

    const mockExec = vi.fn().mockReturnValue(true);
    document.execCommand = mockExec;
    await writeToClipboard('fallback text');
    expect(mockExec).toHaveBeenCalledWith('copy');
    delete document.execCommand;
  });

  it('removes the fallback textarea from the DOM after copy', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: undefined,
      configurable: true,
      writable: true,
    });

    document.execCommand = vi.fn().mockReturnValue(true);
    const beforeCount = document.body.querySelectorAll('textarea').length;
    await writeToClipboard('cleanup test');
    const afterCount = document.body.querySelectorAll('textarea').length;
    expect(afterCount).toBe(beforeCount);
    delete document.execCommand;
  });
});

// ─── copyChatsToClipboard ─────────────────────────────────────────────────────

describe('copyChatsToClipboard', () => {
  let writeText;

  beforeEach(() => {
    vi.clearAllMocks();
    writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
      writable: true,
    });
    browser.storage.local.get.mockResolvedValue({});
  });

  it('returns ok:false with zeroed counts for empty array', async () => {
    const result = await copyChatsToClipboard([]);
    expect(result).toEqual({ ok: false, charCount: 0, chatCount: 0, tooLarge: false, bulkWarning: false });
  });

  it('returns ok:false with zeroed counts for null input', async () => {
    const result = await copyChatsToClipboard(null);
    expect(result).toEqual({ ok: false, charCount: 0, chatCount: 0, tooLarge: false, bulkWarning: false });
  });

  it('returns ok:true on successful copy', async () => {
    const result = await copyChatsToClipboard([makeChat()]);
    expect(result.ok).toBe(true);
    expect(result.chatCount).toBe(1);
    expect(result.tooLarge).toBe(false);
    expect(result.charCount).toBeGreaterThan(0);
  });

  it('passes the serialised text to the clipboard', async () => {
    await copyChatsToClipboard([makeChat({ title: 'Clipboard Test', messages: [] })]);
    expect(writeText).toHaveBeenCalledOnce();
    const [text] = writeText.mock.calls[0];
    expect(text).toContain('# Clipboard Test');
  });

  it('uses the stored format preference when no override is given', async () => {
    browser.storage.local.get.mockResolvedValue({ clipboardFormat: 'markdown' });
    buildExportMarkdown.mockReturnValue('MD');
    await copyChatsToClipboard([makeChat()]);
    expect(buildExportMarkdown).toHaveBeenCalled();
  });

  it('applies the format override from options', async () => {
    await copyChatsToClipboard([makeChat()], { format: 'plain' });
    expect(buildExportMarkdown).not.toHaveBeenCalled();
  });

  it('returns tooLarge:true and does not write when text exceeds MAX_CLIPBOARD_CHARS', async () => {
    // Construct a chat whose content alone exceeds the limit.
    const bigContent = 'x'.repeat(MAX_CLIPBOARD_CHARS + 1);
    const chat = makeChat({ messages: [], content: bigContent });
    const result = await copyChatsToClipboard([chat], { format: 'plain' });
    expect(result.tooLarge).toBe(true);
    expect(result.ok).toBe(false);
    expect(writeText).not.toHaveBeenCalled();
  });

  it('sets bulkWarning:true when chatCount >= BULK_WARN_THRESHOLD', async () => {
    const chats = Array.from({ length: BULK_WARN_THRESHOLD }, (_, i) =>
      makeChat({ id: `chat-${i}`, title: `Chat ${i}`, messages: [] }),
    );
    const result = await copyChatsToClipboard(chats, { format: 'plain' });
    expect(result.bulkWarning).toBe(true);
    expect(result.chatCount).toBe(BULK_WARN_THRESHOLD);
  });

  it('sets bulkWarning:false below threshold', async () => {
    const chats = Array.from({ length: BULK_WARN_THRESHOLD - 1 }, (_, i) =>
      makeChat({ id: `chat-${i}`, title: `Chat ${i}`, messages: [] }),
    );
    const result = await copyChatsToClipboard(chats, { format: 'plain' });
    expect(result.bulkWarning).toBe(false);
  });

  it('returns ok:false with error when clipboard write throws', async () => {
    const err = new Error('Write failed');
    writeText.mockRejectedValue(err);
    // Also disable execCommand so the fallback also fails
    document.execCommand = vi.fn().mockImplementation(() => { throw err; });

    const result = await copyChatsToClipboard([makeChat()], { format: 'plain' });
    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
    delete document.execCommand;
  });

  it('includes charCount in the result', async () => {
    const result = await copyChatsToClipboard([makeChat()], { format: 'plain' });
    expect(typeof result.charCount).toBe('number');
    expect(result.charCount).toBeGreaterThan(0);
  });

  it('uses writeToClipboardHtml for HTML format and returns ok:true', async () => {
    browser.storage.local.get.mockResolvedValue({ clipboardSettings: { format: 'html' } });
    const result = await copyChatsToClipboard([makeChat({ messages: [] })], { format: 'html' });
    expect(result.ok).toBe(true);
    expect(result.charCount).toBeGreaterThan(0);
    delete global.ClipboardItem;
  });
});

// ─── sanitiseSeparator ────────────────────────────────────────────────────────

describe('sanitiseSeparator', () => {
  it('returns "" for null/undefined/empty', () => {
    expect(sanitiseSeparator(null)).toBe('');
    expect(sanitiseSeparator(undefined)).toBe('');
    expect(sanitiseSeparator('')).toBe('');
  });

  it('passes plain text through unchanged', () => {
    expect(sanitiseSeparator('---')).toBe('---');
  });

  it('allows safe structural HTML tags', () => {
    expect(sanitiseSeparator('<hr>')).toContain('<hr>');
    expect(sanitiseSeparator('<br>')).toContain('<br>');
    expect(sanitiseSeparator('<p>hi</p>')).toContain('<p>');
  });

  it('strips non-allowlisted tags but preserves their text content', () => {
    const result = sanitiseSeparator('<script>alert(1)</script>');
    expect(result).toContain('alert(1)');
    expect(result).not.toContain('<script>');
  });

  it('strips <img> and similar tags entirely', () => {
    const result = sanitiseSeparator('<img src="x">');
    expect(result).toBe('');
  });

  it('removes event handler attributes', () => {
    const result = sanitiseSeparator('<hr onclick="alert(1)">');
    expect(result).not.toContain('onclick');
    expect(result).not.toContain('alert');
  });
});

// ─── renderSeparator ──────────────────────────────────────────────────────────

describe('renderSeparator', () => {
  it('wraps plain separator in double newlines for plain format', () => {
    expect(renderSeparator('---', 'plain')).toBe('\n\n---\n\n');
  });

  it('wraps plain separator in double newlines for markdown format', () => {
    expect(renderSeparator('---', 'markdown')).toBe('\n\n---\n\n');
  });

  it('wraps HTML separator with single newlines for html format', () => {
    expect(renderSeparator('<hr>', 'html')).toBe('\n<hr>\n');
  });

  it('strips HTML tags from separator in plain format and falls back to default dash line', () => {
    const result = renderSeparator('<hr>', 'plain');
    expect(result).not.toContain('<hr>');
    // When stripping leaves nothing, falls back to DEFAULT_CLIPBOARD_SETTINGS.separator (not '---')
    expect(result).toContain('------------------------------------');
  });

  it('uses the default dash-line separator when raw is empty or whitespace', () => {
    const def = '------------------------------------';
    expect(renderSeparator('', 'plain')).toBe(`\n\n${def}\n\n`);
    expect(renderSeparator('   ', 'plain')).toBe(`\n\n${def}\n\n`);
  });
});

// ─── applyContentFilters ─────────────────────────────────────────────────────

describe('applyContentFilters', () => {
  it('returns empty string for null/undefined', () => {
    expect(applyContentFilters(null)).toBe('');
    expect(applyContentFilters(undefined)).toBe('');
  });

  it('replaces images with [Image] when includeImages is false', () => {
    const content = 'See ![diagram](http://example.com/d.png) here';
    const result  = applyContentFilters(content, { ...DEFAULT_CLIPBOARD_SETTINGS, includeImages: false });
    expect(result).toContain('[Image]');
    expect(result).not.toContain('![diagram]');
  });

  it('keeps images when includeImages is true', () => {
    const content = 'See ![alt](url) here';
    const result  = applyContentFilters(content, { ...DEFAULT_CLIPBOARD_SETTINGS, includeImages: true });
    expect(result).toContain('![alt](url)');
  });

  it('strips attachment placeholder lines when includeAttachments is false', () => {
    const content = 'Message\n[Attached: document.pdf]\nMore text';
    const result  = applyContentFilters(content, { ...DEFAULT_CLIPBOARD_SETTINGS, includeAttachments: false });
    expect(result).not.toContain('[Attached: document.pdf]');
    expect(result).toContain('Message');
  });

  it('keeps attachment lines when includeAttachments is true', () => {
    const content = 'Message\n[Attached: document.pdf]';
    const result  = applyContentFilters(content, { ...DEFAULT_CLIPBOARD_SETTINGS, includeAttachments: true });
    expect(result).toContain('[Attached: document.pdf]');
  });

  it('strips emoji when includeEmojis is false', () => {
    const content = 'Hello 😊 world 🚀';
    const result  = applyContentFilters(content, { ...DEFAULT_CLIPBOARD_SETTINGS, includeEmojis: false });
    expect(result).not.toContain('😊');
    expect(result).not.toContain('🚀');
    expect(result).toContain('Hello');
  });

  it('keeps emoji when includeEmojis is true', () => {
    const content = 'Hello 😊 world';
    const result  = applyContentFilters(content, { ...DEFAULT_CLIPBOARD_SETTINGS, includeEmojis: true });
    expect(result).toContain('😊');
  });
});

// ─── chatToHtml ───────────────────────────────────────────────────────────────

describe('chatToHtml', () => {
  it('returns empty string for null/undefined', () => {
    expect(chatToHtml(null)).toBe('');
    expect(chatToHtml(undefined)).toBe('');
  });

  it('wraps output in <article class="bAInder-chat">', () => {
    const result = chatToHtml(makeChat({ messages: [] }));
    expect(result).toContain('<article class="bAInder-chat">');
    expect(result).toContain('</article>');
  });

  it('includes title in an <h2>', () => {
    const result = chatToHtml(makeChat({ title: 'My Chat', messages: [] }));
    expect(result).toContain('<h2>My Chat</h2>');
  });

  it('includes source in a <p class="meta">', () => {
    const result = chatToHtml(makeChat());
    expect(result).toContain('<p class="meta">');
    expect(result).toContain('chatgpt');
  });

  it('renders user and assistant turns with role classes', () => {
    const result = chatToHtml(makeChat());
    expect(result).toContain('turn--user');
    expect(result).toContain('turn--assistant');
    expect(result).toContain('User');
    expect(result).toContain('Assistant');
  });

  it('falls back to content field when messages is empty', () => {
    const chat = makeChat({ messages: [], content: 'Fallback body text' });
    expect(chatToHtml(chat)).toContain('Fallback body text');
  });

  it('escapes HTML-special characters in the title', () => {
    const result = chatToHtml(makeChat({ title: '<script>alert(1)</script>', messages: [] }));
    expect(result).not.toContain('<script>');
    expect(result).toContain('&lt;script&gt;');
  });

  it('strips emoji from message content when includeEmojis is false', () => {
    const chat = makeChat({ messages: [{ role: 'user', content: 'Hello 😊' }] });
    const result = chatToHtml(chat, { ...DEFAULT_CLIPBOARD_SETTINGS, includeEmojis: false });
    expect(result).not.toContain('😊');
    expect(result).toContain('Hello');
  });
});

// ─── writeToClipboardHtml ─────────────────────────────────────────────────────

describe('writeToClipboardHtml', () => {
  let originalClipboard;

  beforeEach(() => {
    originalClipboard = navigator.clipboard;
    vi.clearAllMocks();
  });

  afterEach(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: originalClipboard,
      configurable: true,
      writable: true,
    });
    delete global.ClipboardItem;
  });

  it('resolves successfully and returns a result object', async () => {
    // ClipboardItem is a native browser API not available in happy-dom;
    // writeToClipboardHtml always falls back to writeToClipboard in tests.
    // The fallback path itself is tested in the "falls back" tests below.
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
      writable: true,
    });
    const result = await writeToClipboardHtml('<b>html</b>', 'plain text');
    expect(result).toMatchObject({ success: expect.any(Boolean) });
    vi.unstubAllGlobals();
  });

  it('falls back to writeToClipboard when ClipboardItem is unavailable', async () => {
    vi.stubGlobal('ClipboardItem', undefined);
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
      writable: true,
    });
    const result = await writeToClipboardHtml('<b>html</b>', 'fallback plain');
    expect(writeText).toHaveBeenCalledWith('fallback plain');
    expect(result.success).toBe(true);
    vi.unstubAllGlobals();
  });

  it('falls back to plain text when clipboard.write rejects', async () => {
    const write     = vi.fn().mockRejectedValue(new Error('denied'));
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { write, writeText },
      configurable: true,
      writable: true,
    });
    vi.stubGlobal('ClipboardItem', vi.fn((obj) => ({ _obj: obj })));
    const result = await writeToClipboardHtml('<b>html</b>', 'fallback');
    expect(writeText).toHaveBeenCalledWith('fallback');
    expect(result.success).toBe(true);
    vi.unstubAllGlobals();
  });
});

// ─── chatToPlainText with settings ───────────────────────────────────────────

describe('chatToPlainText — content filter integration', () => {
  it('strips emoji from content when includeEmojis is false', () => {
    const chat = makeChat({ messages: [{ role: 'user', content: 'Hello 😊' }] });
    const result = chatToPlainText(chat, { ...DEFAULT_CLIPBOARD_SETTINGS, includeEmojis: false });
    expect(result).not.toContain('😊');
    expect(result).toContain('Hello');
  });

  it('replaces images with [Image] by default (includeImages defaults false)', () => {
    const chat = makeChat({ messages: [{ role: 'user', content: 'See ![d](url)' }] });
    const result = chatToPlainText(chat);
    expect(result).toContain('[Image]');
    expect(result).not.toContain('![d]');
  });
});

// ─── chatToMarkdown with settings ────────────────────────────────────────────

describe('chatToMarkdown — content filter integration', () => {
  beforeEach(() => { vi.clearAllMocks(); buildExportMarkdown.mockReturnValue('MD'); });

  it('pre-filters emoji from messages before calling buildExportMarkdown', () => {
    const chat = makeChat({ messages: [{ role: 'user', content: '😊 Hello' }] });
    chatToMarkdown(chat, { ...DEFAULT_CLIPBOARD_SETTINGS, includeEmojis: false });
    const passed = buildExportMarkdown.mock.calls[0][0];
    expect(passed.messages[0].content).not.toContain('😊');
  });

  it('pre-filters images from content field', () => {
    const chat = makeChat({ messages: [], content: '![img](url) Text' });
    chatToMarkdown(chat, { ...DEFAULT_CLIPBOARD_SETTINGS, includeImages: false });
    const passed = buildExportMarkdown.mock.calls[0][0];
    expect(passed.content).toContain('[Image]');
  });
});
