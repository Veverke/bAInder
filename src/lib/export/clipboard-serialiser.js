/**
 * clipboard-serialiser.js
 *
 * Serialises one or more chats to plain text, Markdown, or HTML for clipboard
 * copy. Provides dual-format HTML write (text/html + text/plain) for richer
 * paste targets, and a rich per-call content-type settings schema.
 */

import { buildExportMarkdown } from './markdown-builder.js';
import browser from '../vendor/browser.js';

/** Legacy single-value key — retained for migration reads. */
export const CLIPBOARD_FORMAT_KEY   = 'clipboardFormat';
/** Current rich-settings key. */
export const CLIPBOARD_SETTINGS_KEY = 'clipboardSettings';

export const MAX_CLIPBOARD_CHARS  = 1_000_000;
export const BULK_WARN_THRESHOLD  = 20;

/** Default settings object. All fields are always present in storage. */
export const DEFAULT_CLIPBOARD_SETTINGS = Object.freeze({
  format:             'plain',  // 'plain' | 'markdown' | 'html'
  includeEmojis:      true,
  includeImages:      false,
  includeAttachments: false,
  separator:          '------------------------------------',
  turnSeparator:      '---',
});

// ─── Separator helpers ────────────────────────────────────────────────────────

/** Tags allowed in a user-defined separator. All others are stripped. */
const ALLOWED_SEP_TAGS = new Set(['hr', 'br', 'p', 'div', 'blockquote', 'span', 'pre']);

/**
 * Strip event handler attributes and non-allowlisted HTML tags from a
 * user-supplied separator string. Text between stripped tags is preserved.
 *
 * @param {string} raw
 * @returns {string}
 */
export function sanitiseSeparator(raw) {
  if (!raw || typeof raw !== 'string') return '';
  return raw
    .replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi, '')
    .replace(/<\/?([a-z][a-z0-9]*)\b[^>]*>/gi, (match, tag) =>
      ALLOWED_SEP_TAGS.has(tag.toLowerCase()) ? match : '');
}

/**
 * Return the separator string to insert between serialised chats,
 * adapted for the target format.
 *
 * Plain text: HTML tags are stripped so `<hr>` doesn't appear literally.
 * Markdown: used as-is (markdown supports inline HTML).
 * HTML: sanitised allowlist applied.
 *
 * @param {string} raw
 * @param {'plain'|'markdown'|'html'} format
 * @returns {string}
 */
export function renderSeparator(raw, format) {
  const sep = (typeof raw === 'string' && raw.trim()) ? raw.trim() : DEFAULT_CLIPBOARD_SETTINGS.separator;
  if (format === 'html')     return `\n${sanitiseSeparator(sep)}\n`;
  if (format === 'markdown') return `\n\n${sep}\n\n`;
  // Plain text: strip any HTML so literal `<hr/>` doesn't appear in output.
  // Fall back to the default chat-separator dash line (not '---') so the result
  // is visually distinct from the turn separator.
  const plainSep = sep.replace(/<[^>]*>/g, '').trim() || DEFAULT_CLIPBOARD_SETTINGS.separator;
  return `\n\n${plainSep}\n\n`;
}

// ─── Content filters ──────────────────────────────────────────────────────────

/** Matches Unicode emoji (Extended_Pictographic covers all modern emoji). */
const EMOJI_RE = /\p{Extended_Pictographic}/gu;

/** Matches Markdown image syntax: ![alt](url) */
const MD_IMAGE_RE = /!\[[^\]]*\]\([^)]*\)/g;

/** Matches [Attached: …] / [Attachment: …] placeholder lines. */
const ATTACHMENT_RE = /^\[Attached?(?:ment)?:[^\]]*\]\s*$/gim;

/**
 * Apply include/exclude content-type filters to a message content string.
 *
 * @param {string} content
 * @param {typeof DEFAULT_CLIPBOARD_SETTINGS} [settings]
 * @returns {string}
 */
export function applyContentFilters(content, settings = DEFAULT_CLIPBOARD_SETTINGS) {
  let out = content ?? '';
  if (!settings.includeImages) {
    out = out.replace(MD_IMAGE_RE, '[Image]');
  }
  if (!settings.includeAttachments) {
    out = out.replace(ATTACHMENT_RE, '').trim();
  }
  if (!settings.includeEmojis) {
    out = out.replace(EMOJI_RE, '').replace(/  +/g, ' ').trim();
  }
  return out;
}

// ─── Single-chat serialisers ──────────────────────────────────────────────────

/**
 * Serialise a single chat to plain text, honouring content-type settings.
 *
 * @param {Object} chat
 * @param {typeof DEFAULT_CLIPBOARD_SETTINGS} [settings]
 * @returns {string}
 */
export function chatToPlainText(chat, settings = DEFAULT_CLIPBOARD_SETTINGS) {
  if (!chat) return '';
  const s = { ...DEFAULT_CLIPBOARD_SETTINGS, ...settings };

  const title    = (chat.title  || 'Untitled Chat').trim();
  const source   = (chat.source || 'unknown').trim();
  const savedStr = chat.timestamp ? new Date(chat.timestamp).toISOString() : '';

  const lines = [];
  lines.push(`# ${title}`);
  lines.push('');
  lines.push(savedStr ? `Source: ${source} | Saved: ${savedStr}` : `Source: ${source}`);
  lines.push('');

  const messages = Array.isArray(chat.messages) ? chat.messages : [];

  // Compute plain-text turn separator (strip any HTML tags the user may have typed)
  const turnSepRaw = (typeof s.turnSeparator === 'string' && s.turnSeparator.trim())
    ? s.turnSeparator.trim()
    : '---';
  const turnSep = turnSepRaw.replace(/<[^>]*>/g, '').trim() || '---';

  if (messages.length === 0) {
    const body = applyContentFilters((chat.content || '').trim(), s);
    if (body) {
      lines.push(body);
      lines.push('');
    }
  } else {
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      const roleLabel =
        msg.role === 'user'      ? 'User'
        : msg.role === 'assistant' ? 'Assistant'
        : msg.role ? msg.role.charAt(0).toUpperCase() + msg.role.slice(1)
        : 'Unknown';

      if (i > 0) {
        lines.push(turnSep);
        lines.push('');
      }
      lines.push(`${roleLabel}: ${applyContentFilters((msg.content || '').trim(), s)}`);
      lines.push('');
    }
  }

  return lines.join('\n');
}

/**
 * Serialise a single chat to a Markdown export document,
 * honouring content-type settings by pre-filtering message content.
 *
 * @param {Object} chat
 * @param {typeof DEFAULT_CLIPBOARD_SETTINGS} [settings]
 * @returns {string}
 */
export function chatToMarkdown(chat, settings = DEFAULT_CLIPBOARD_SETTINGS) {
  if (!chat) return '';
  const s = { ...DEFAULT_CLIPBOARD_SETTINGS, ...settings };
  const filtered = {
    ...chat,
    messages: Array.isArray(chat.messages)
      ? chat.messages.map(m => ({ ...m, content: applyContentFilters(m.content ?? '', s) }))
      : chat.messages,
    content: applyContentFilters(chat.content ?? '', s),
  };
  return buildExportMarkdown(filtered, '');
}

// ─── HTML serialiser ──────────────────────────────────────────────────────────

/** Escape a string for safe insertion into HTML. */
function escHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/**
 * Minimal Markdown → HTML fragment converter for chat message content.
 * Handles fenced code blocks, inline code, bold, italic, headings,
 * images, and newlines. Not a full CommonMark parser — intentionally minimal.
 *
 * @param {string} md  Already-filtered markdown content
 * @param {boolean} includeImages
 * @returns {string}
 */
function mdToHtmlFragment(md, includeImages) {
  if (!md) return '';
  const blocks = [];
  // Protect fenced code blocks first
  let html = md.replace(/```([\s\S]*?)```/g, (_, inner) => {
    const i = blocks.push(`<pre><code>${escHtml(inner.replace(/^[^\n]*\n?/, ''))}</code></pre>`) - 1;
    return `\x00BLOCK${i}\x00`;
  });
  // Escape HTML in the remaining text
  html = escHtml(html);
  // Restore code blocks (already wrapped and escaped)
  html = html.replace(/\x00BLOCK(\d+)\x00/g, (_, i) => blocks[+i]);
  // Inline code
  html = html.replace(/`([^`]+)`/g, (_, c) => `<code>${escHtml(c)}</code>`);
  // Images — already collapsed to `[Image]` by applyContentFilters if excluded
  if (includeImages) {
    html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g,
      (_, alt, src) => `<img src="${escHtml(src)}" alt="${escHtml(alt)}">`);
  }
  // Bold, italic
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*([^*]+)\*/g,     '<em>$1</em>');
  // Headings (must be at line start)
  html = html.replace(/^(#{1,6}) (.+)$/gm, (_, h, t) => `<h${h.length}>${t}</h${h.length}>`);
  // Newlines → <br>
  html = html.replace(/\n/g, '<br>\n');
  return html;
}

/**
 * Serialise a single chat to an HTML document fragment.
 *
 * @param {Object} chat
 * @param {typeof DEFAULT_CLIPBOARD_SETTINGS} [settings]
 * @returns {string}
 */
export function chatToHtml(chat, settings = DEFAULT_CLIPBOARD_SETTINGS) {
  if (!chat) return '';
  const s = { ...DEFAULT_CLIPBOARD_SETTINGS, ...settings };

  const title    = escHtml((chat.title  || 'Untitled Chat').trim());
  const source   = escHtml((chat.source || 'unknown').trim());
  const savedStr = chat.timestamp ? new Date(chat.timestamp).toISOString() : '';

  const parts = [`<article class="bAInder-chat">`];
  parts.push(`  <h2>${title}</h2>`);
  const meta = [`<strong>Source:</strong> ${source}`];
  if (savedStr) meta.push(`<strong>Saved:</strong> ${escHtml(savedStr)}`);
  parts.push(`  <p class="meta">${meta.join(' | ')}</p>`);
  parts.push(`  <div class="messages">`);

  const messages = Array.isArray(chat.messages) ? chat.messages : [];

  if (messages.length === 0) {
    const body = applyContentFilters((chat.content || '').trim(), s);
    if (body) {
      parts.push(`    <div class="turn">`);
      parts.push(`      <div class="turn__content">${mdToHtmlFragment(body, s.includeImages)}</div>`);
      parts.push(`    </div>`);
    }
  } else {
    for (const msg of messages) {
      const roleLabel =
        msg.role === 'user'      ? 'User'
        : msg.role === 'assistant' ? 'Assistant'
        : msg.role ? msg.role.charAt(0).toUpperCase() + msg.role.slice(1)
        : 'Unknown';
      const filtered = applyContentFilters((msg.content || '').trim(), s);
      parts.push(`    <div class="turn turn--${escHtml(msg.role || 'unknown')}">`);
      parts.push(`      <strong class="turn__role">${escHtml(roleLabel)}</strong>`);
      parts.push(`      <div class="turn__content">${mdToHtmlFragment(filtered, s.includeImages)}</div>`);
      parts.push(`    </div>`);
    }
  }

  parts.push(`  </div>`);
  parts.push(`</article>`);
  return parts.join('\n');
}

// ─── Multi-chat serialiser ────────────────────────────────────────────────────

/**
 * Serialise an array of chats to a single string in the requested format.
 *
 * Accepts either a full settings object or a legacy format string
 * ('plain' | 'markdown') for backward compatibility.
 *
 * @param {Object[]} chats
 * @param {typeof DEFAULT_CLIPBOARD_SETTINGS | 'plain' | 'markdown' | 'html'} [settingsOrFormat]
 * @returns {string}
 */
export function serialiseChats(chats, settingsOrFormat = DEFAULT_CLIPBOARD_SETTINGS) {
  if (!Array.isArray(chats) || chats.length === 0) return '';
  const settings = (typeof settingsOrFormat === 'string')
    ? { ...DEFAULT_CLIPBOARD_SETTINGS, format: settingsOrFormat }
    : { ...DEFAULT_CLIPBOARD_SETTINGS, ...settingsOrFormat };
  const sep = renderSeparator(settings.separator, settings.format);
  if (settings.format === 'html')     return chats.map(c => chatToHtml(c, settings)).join(sep);
  if (settings.format === 'markdown') return chats.map(c => chatToMarkdown(c, settings)).join(sep);
  return chats.map(c => chatToPlainText(c, settings)).join(sep);
}

// ─── Storage ──────────────────────────────────────────────────────────────────

/**
 * Read the full clipboard settings from storage, merging stored values over
 * defaults. Migrates from the legacy `clipboardFormat` key on first access.
 *
 * @param {Object} [storageOverride]  Injectable storage for tests (must have .get())
 * @returns {Promise<typeof DEFAULT_CLIPBOARD_SETTINGS>}
 */
export async function getClipboardSettings(storageOverride) {
  const store = storageOverride ?? browser.storage.local;
  const result = await store.get([CLIPBOARD_SETTINGS_KEY, CLIPBOARD_FORMAT_KEY]);
  const stored = result[CLIPBOARD_SETTINGS_KEY] ?? {};
  // Migrate: honour the old single-key format if no new settings have been saved yet
  if (!result[CLIPBOARD_SETTINGS_KEY] && result[CLIPBOARD_FORMAT_KEY]) {
    stored.format = result[CLIPBOARD_FORMAT_KEY];
  }
  return { ...DEFAULT_CLIPBOARD_SETTINGS, ...stored };
}

/**
 * Read the stored clipboard format preference.
 * Shim retained for callers that only need the format string.
 *
 * @param {Object} [storageOverride]
 * @returns {Promise<'plain'|'markdown'|'html'>}
 */
export async function getClipboardFormat(storageOverride) {
  const s = await getClipboardSettings(storageOverride);
  return s.format;
}

// ─── Clipboard I/O ────────────────────────────────────────────────────────────

/**
 * Write text to the clipboard using the Clipboard API when available, falling
 * back to a hidden textarea + execCommand('copy') for restricted contexts.
 *
 * @param {string} text
 * @returns {Promise<{ success: boolean, usedFallback: boolean }>}
 */
export async function writeToClipboard(text) {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return { success: true, usedFallback: false };
    } catch (_) {
      // fall through to execCommand
    }
  }

  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0';
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  try {
    const ok = document.execCommand('copy');
    return { success: ok, usedFallback: true };
  } finally {
    document.body.removeChild(ta);
  }
}

/**
 * Write content to the clipboard in both text/html and text/plain MIME types.
 * Enables rich-paste in apps that support it (Word, Notion, Google Docs)
 * while falling back to plain-text-only when ClipboardItem is unavailable.
 *
 * @param {string} htmlText
 * @param {string} plainText
 * @returns {Promise<{ success: boolean, usedFallback: boolean }>}
 */
export async function writeToClipboardHtml(htmlText, plainText) {
  if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
    try {
      const item = new ClipboardItem({
        'text/html':  new Blob([htmlText],  { type: 'text/html' }),
        'text/plain': new Blob([plainText], { type: 'text/plain' }),
      });
      await navigator.clipboard.write([item]);
      return { success: true, usedFallback: false };
    } catch (_) {
      // fall through to plain-text fallback
    }
  }
  return writeToClipboard(plainText);
}

// ─── Main public API ──────────────────────────────────────────────────────────

/**
 * Serialise one or more chats and copy the result to the clipboard.
 *
 * Reads settings from storage, then merges any overrides from `options`.
 * For HTML format, writes both text/html and text/plain to the clipboard.
 *
 * @param {Object[]} chats
 * @param {Partial<typeof DEFAULT_CLIPBOARD_SETTINGS> & { storageOverride?: Object }} [options]
 * @returns {Promise<{
 *   ok:          boolean,
 *   charCount:   number,
 *   chatCount:   number,
 *   tooLarge:    boolean,
 *   bulkWarning: boolean,
 *   error?:      Error
 * }>}
 */
export async function copyChatsToClipboard(chats, options = {}) {
  if (!Array.isArray(chats) || chats.length === 0) {
    return { ok: false, charCount: 0, chatCount: 0, tooLarge: false, bulkWarning: false };
  }

  const { storageOverride, ...settingsOverride } = options;
  const base     = await getClipboardSettings(storageOverride);
  const settings = { ...base, ...settingsOverride };

  const chatCount   = chats.length;
  const bulkWarning = chatCount >= BULK_WARN_THRESHOLD;

  const text      = serialiseChats(chats, settings);
  const charCount = text.length;

  if (charCount > MAX_CLIPBOARD_CHARS) {
    return { ok: false, charCount, chatCount, tooLarge: true, bulkWarning };
  }

  try {
    let result;
    if (settings.format === 'html') {
      const plainText = serialiseChats(chats, { ...settings, format: 'plain' });
      result = await writeToClipboardHtml(text, plainText);
    } else {
      result = await writeToClipboard(text);
    }
    return { ok: result.success, charCount, chatCount, tooLarge: false, bulkWarning };
  } catch (error) {
    return { ok: false, charCount, chatCount, tooLarge: false, bulkWarning, error };
  }
}
