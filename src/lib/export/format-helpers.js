/**
 * Formatting helper utilities for HTML and text output.
 * All functions are pure with no side effects.
 */

import { escapeHtml } from '../search-utils.js';

/** @param {string} s */
export function cap(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
}

/**
 * HTML-escape for attribute and text content use.
 * Delegates to the shared escapeHtml utility from search-utils.js.
 */
export function esc(s) {
  return escapeHtml(s);
}

/** Escape HTML but preserve newlines for code blocks */
export function escCode(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Human-readable source label.
 * @param {string} source
 * @returns {string}
 */
export function sourceLabel(source) {
  const map = {
    chatgpt:  'ChatGPT',
    claude:   'Claude',
    gemini:   'Gemini',
    copilot:  'Copilot',
    imported: 'Imported',
  };
  return map[source] || cap(source) || 'Unknown';
}

/**
 * Format a millisecond timestamp as a human-readable date string.
 * e.g. "March 15, 2024 at 10:30 AM"
 * @param {number} ts
 * @returns {string}
 */
export function formatDateHuman(ts) {
  if (!ts) return '';
  try {
    return new Date(ts).toLocaleString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric',
      hour: 'numeric', minute: '2-digit'
    });
  } catch (_) {
    return new Date(ts).toISOString();
  }
}

/**
 * Strip YAML frontmatter from a markdown string.
 * @param {string} md
 * @returns {string}
 */
export function stripFrontmatter(md) {
  if (!md || !md.startsWith('---')) return md || '';
  const end = md.indexOf('\n---', 3);
  if (end === -1) return md;
  return md.slice(end + 4).trimStart();
}

/**
 * Guess a MIME type from a filename.
 * @param {string} filename
 * @returns {string}
 */
export function guessMime(filename) {
  if (filename.endsWith('.html')) return 'text/html;charset=utf-8';
  if (filename.endsWith('.zip'))  return 'application/zip';
  if (filename.endsWith('.json')) return 'application/json';
  if (filename.endsWith('.pdf'))  return 'application/pdf';
  return 'text/markdown;charset=utf-8';
}

/**
 * Build a stable HTML anchor id for a chat in a digest document.
 * e.g. "My Chat Title" at index 2 → "my-chat-title-3"
 * @param {string} title
 * @param {number} idx  0-based position
 * @returns {string}
 */
export function digestAnchor(title, idx) {
  const base = String(title || 'untitled')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'chat';
  return `${base}-${idx + 1}`;
}
