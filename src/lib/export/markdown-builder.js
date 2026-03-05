/**
 * Markdown export builders.
 * Serialises single chats and multi-chat digests to Markdown documents.
 */

import { messagesToMarkdown, escapeYaml } from '../markdown-serialiser.js';
import { buildTopicPath }                  from './filename-utils.js';
import { cap, sourceLabel, formatDateHuman, stripFrontmatter, digestAnchor } from './format-helpers.js';

// ─── Single-chat ──────────────────────────────────────────────────────────────

/**
 * Serialise a single chat object to a self-contained Markdown document
 * suitable for export (richer frontmatter than storage format).
 *
 * @param {Object} chat  - chat entry from storage
 * @param {string} topicPath  - breadcrumb string, e.g. "Work > Projects"
 * @returns {string}
 */
export function buildExportMarkdown(chat, topicPath) {
  if (!chat) return '';

  const title      = (chat.title || 'Untitled Chat').trim();
  const source     = chat.source || 'unknown';
  const url        = chat.url || '';
  const isExcerpt  = Boolean(chat.metadata?.isExcerpt);
  const exportedAt = new Date().toISOString();
  const dateStr    = chat.timestamp ? new Date(chat.timestamp).toISOString() : '';
  const tags       = Array.isArray(chat.tags) && chat.tags.length ? chat.tags.join(', ') : '';

  // ── Enriched frontmatter ───────────────────────────────────────────────────
  const fm = [
    '---',
    `title: "${escapeYaml(title)}"`,
    `source: ${source}`,
  ];
  if (url)     fm.push(`url: ${url}`);
  if (dateStr) fm.push(`date: ${dateStr}`);
  fm.push(`topic: "${escapeYaml(topicPath)}"`);
  fm.push(`chat_id: ${chat.id || 'unknown'}`);
  if (tags)    fm.push(`tags: [${tags}]`);
  fm.push(`exported: ${exportedAt}`);
  fm.push('contentFormat: markdown-v1');
  fm.push('---');
  fm.push('');

  const lines = [...fm];

  // ── Title heading ──────────────────────────────────────────────────────────
  if (!isExcerpt) {
    lines.push(`# ${title}`);
    lines.push('');
  }

  // ── Metadata block ─────────────────────────────────────────────────────────
  const srcLabel = sourceLabel(source);
  if (!isExcerpt) {
    lines.push(`**Source:** ${srcLabel}  `);
    if (dateStr) lines.push(`**Date:** ${formatDateHuman(chat.timestamp)}  `);
    lines.push(`**Topic:** ${topicPath}  `);
    if (tags) lines.push(`**Tags:** ${tags}  `);
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  // ── Conversation ───────────────────────────────────────────────────────────
  const messages = Array.isArray(chat.messages) ? chat.messages : [];

  if (messages.length > 0) {
    lines.push('## Conversation');
    lines.push('');
    messages.forEach((msg, idx) => {
      const role = msg.role === 'user' ? 'User'
        : msg.role === 'assistant' ? 'Assistant'
        : cap(msg.role || 'Unknown');
      lines.push(`### ${role}`);
      lines.push('');
      lines.push((msg.content || '').trim());
      lines.push('');
      if (idx < messages.length - 1) {
        lines.push('---');
        lines.push('');
      }
    });
  } else {
    // Fall back to stored content (strip existing frontmatter first)
    const body = stripFrontmatter(chat.content || '');
    lines.push(body.trim());
    lines.push('');
  }

  // ── Footer ─────────────────────────────────────────────────────────────────
  lines.push('---');
  lines.push('');
  lines.push(`*Exported from bAInder on ${formatDateHuman(Date.now())}*`);

  return lines.join('\n');
}

// ─── Multi-chat digest ────────────────────────────────────────────────────────

/**
 * Build a single Markdown document from multiple chats, each under its own
 * `## <title>` heading with an optional table of contents.
 *
 * @param {Object[]} chats     - chat entries (each may contain `messages` array)
 * @param {Object}   topicsMap - tree.topics flat map used for breadcrumb paths
 * @param {{ includeToc?: boolean }} [options]
 * @returns {string}
 */
export function buildDigestMarkdown(chats, topicsMap, options = {}) {
  if (!Array.isArray(chats) || chats.length === 0) return '';

  const includeToc = options.includeToc !== false; // default true
  const exportedAt = Date.now();
  const topics     = topicsMap || {};
  const lines      = [];

  // ── Frontmatter ────────────────────────────────────────────────────────────
  lines.push('---');
  lines.push(`title: "bAInder Digest — ${chats.length} chats"`);
  lines.push(`exported: ${new Date(exportedAt).toISOString()}`);
  lines.push(`chat_count: ${chats.length}`);
  lines.push('contentFormat: digest-markdown-v1');
  lines.push('---');
  lines.push('');

  // ── Title heading ──────────────────────────────────────────────────────────
  lines.push('# bAInder Digest');
  lines.push('');
  lines.push(`*${chats.length} chat${chats.length !== 1 ? 's' : ''} compiled on ${formatDateHuman(exportedAt)}*`);
  lines.push('');
  lines.push('---');
  lines.push('');

  // ── Table of contents ──────────────────────────────────────────────────────
  if (includeToc) {
    lines.push('## Contents');
    lines.push('');
    chats.forEach((chat, idx) => {
      const title  = (chat.title || 'Untitled Chat').trim();
      const anchor = digestAnchor(title, idx);
      lines.push(`${idx + 1}. [${title}](#${anchor})`);
    });
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  // ── Chat sections ──────────────────────────────────────────────────────────
  chats.forEach((chat, idx) => {
    const title       = (chat.title || 'Untitled Chat').trim();
    const topicPath   = buildTopicPath(chat.topicId, topics);
    const srcLabel    = sourceLabel(chat.source || 'unknown');
    const dateStr     = chat.timestamp ? formatDateHuman(chat.timestamp) : '';
    const messages    = Array.isArray(chat.messages) ? chat.messages : [];
    const anchor      = digestAnchor(title, idx);

    lines.push(`## ${title}`);
    // HTML anchor comment so IntelliJ/Obsidian TOC links resolve
    lines.push(`<!-- id: ${anchor} -->`);
    lines.push('');

    lines.push(`**Source:** ${srcLabel}  `);
    if (dateStr) lines.push(`**Date:** ${dateStr}  `);
    lines.push(`**Topic:** ${topicPath}  `);
    lines.push(`[↗ View in tree](bainder://select-chat?id=${chat.id})`);
    lines.push('');

    if (messages.length > 0 && options.forAssembly) {
      // For chats stored as assembled nodes, reuse the canonical serialiser so
      // the reader's wrapChatTurns, turn styling, and emoji labels are identical
      // to individually opened chats.
      const raw = messagesToMarkdown(messages, {
        title,
        source: chat.source || 'unknown',
        timestamp: chat.timestamp,
        messageCount: messages.length,
        url: chat.url || '',
      });
      // Strip YAML frontmatter and the duplicate # Title heading (the ## section
      // heading above already provides the title).
      const bodyRaw = stripFrontmatter(raw);
      const bodyLines = bodyRaw.split('\n');
      const titleIdx = bodyLines.findIndex(l => l.startsWith('# '));
      if (titleIdx !== -1) {
        const extra = bodyLines[titleIdx + 1]?.trim() === '' ? 2 : 1;
        bodyLines.splice(titleIdx, extra);
      }
      lines.push(bodyLines.join('\n').trim());
      lines.push('');
    } else if (messages.length > 0) {
      // Export format: explicit ### Role headings readable in external Markdown editors.
      messages.forEach((msg, mIdx) => {
        const role = msg.role === 'user' ? 'User'
          : msg.role === 'assistant' ? 'Assistant'
          : cap(msg.role || 'Unknown');
        lines.push(`### ${role}`);
        lines.push('');
        lines.push((msg.content || '').trim());
        lines.push('');
        if (mIdx < messages.length - 1) {
          lines.push('---');
          lines.push('');
        }
      });
    } else {
      const body = stripFrontmatter(chat.content || '');
      lines.push(body.trim());
      lines.push('');
    }

    if (idx < chats.length - 1) {
      lines.push('');
      lines.push('===');
      lines.push('');
    }
  });

  // ── Footer ─────────────────────────────────────────────────────────────────
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push(`*Digest exported from bAInder on ${formatDateHuman(Date.now())}*`);

  return lines.join('\n');
}
