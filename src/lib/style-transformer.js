/**
 * @file style-transformer.js
 * @description Transforms chat objects into styled document structures for export.
 * Pure ES module — no side effects, no DOM access.
 */

import { escapeHtml } from './search-utils.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Enumeration of available output styles.
 * @enum {string}
 */
export const STYLES = {
  RAW: 'raw',
  TECHNICAL: 'technical',
  ACADEMIC: 'academic',
  BLOG: 'blog',
  LINKEDIN: 'linkedin',
};

/**
 * Human-readable labels for each style.
 * @type {Record<string, string>}
 */
export const STYLE_LABELS = {
  raw: 'Raw Transcript',
  technical: 'Technical Article',
  academic: 'Academic Journal',
  blog: 'Blog Post',
  linkedin: 'LinkedIn Article',
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Capitalises the first letter of a string.
 * @param {string} str
 * @returns {string}
 */
function _capitalise(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Converts a string to Title Case.
 * @param {string} str
 * @returns {string}
 */
function _toTitleCase(str) {
  if (!str) return '';
  const minorWords = new Set([
    'a', 'an', 'the', 'and', 'but', 'or', 'nor', 'for', 'so', 'yet',
    'at', 'by', 'in', 'of', 'on', 'to', 'up', 'as', 'is', 'it',
  ]);
  return str
    .split(' ')
    .map((word, index) => {
      const lower = word.toLowerCase();
      return index === 0 || !minorWords.has(lower)
        ? _capitalise(lower)
        : lower;
    })
    .join(' ');
}

/**
 * Returns a safe messages array from a chat object.
 * Falls back to a synthetic single-message array using chat.content if needed.
 * @param {object} chat
 * @returns {Array<{role: string, content: string}>}
 */
function _getMessages(chat) {
  if (
    chat.messages &&
    Array.isArray(chat.messages) &&
    chat.messages.length > 0
  ) {
    return chat.messages;
  }
  // Fallback: wrap raw content as a single assistant message
  return [{ role: 'assistant', content: chat.content || '' }];
}

/**
 * Builds the shared meta object included in every styled result.
 * @param {object} chat
 * @param {string} style
 * @returns {object}
 */
function _buildMeta(chat, style) {
  return {
    style,
    originalTitle: chat.title || '',
    source: chat.source || '',
    url: chat.url || '',
    timestamp: chat.timestamp ?? null,
    messageCount: chat.messageCount ?? (chat.messages ? chat.messages.length : 0),
  };
}

/**
 * Creates the bare result skeleton.
 * @param {string} title
 * @param {string} introduction
 * @param {Array<{heading: string, content: string}>} sections
 * @param {string} conclusion
 * @param {object} meta
 * @returns {{ title: string, introduction: string, sections: Array, conclusion: string, meta: object }}
 */
function _result(title, introduction, sections, conclusion, meta) {
  return { title, introduction, sections, conclusion, meta };
}

// ---------------------------------------------------------------------------
// Style transformers (private)
// ---------------------------------------------------------------------------

/**
 * Raw transformer — returns messages as plain labelled sections.
 * @param {object} chat
 * @returns {{ title: string, introduction: string, sections: Array, conclusion: string, meta: object }}
 */
function _transformRaw(chat) {
  const messages = _getMessages(chat);
  const sections = messages.map((msg) => ({
    heading: _capitalise(msg.role || 'unknown'),
    content: msg.content || '',
  }));
  return _result(
    chat.title || 'Untitled',
    '',
    sections,
    '',
    _buildMeta(chat, STYLES.RAW)
  );
}

/**
 * Technical transformer — frames the chat as a technical document.
 * @param {object} chat
 * @returns {{ title: string, introduction: string, sections: Array, conclusion: string, meta: object }}
 */
function _transformTechnical(chat) {
  const originalTitle = chat.title || 'Untitled';
  const technicalSuffixPattern = /technical|overview|guide|reference|spec|architecture|implementation|api|protocol/i;
  const title = technicalSuffixPattern.test(originalTitle)
    ? originalTitle
    : `${originalTitle} — Technical Overview`;

  const topic = originalTitle.toLowerCase();
  const introduction =
    `This document presents a technical discussion on ${topic}. ` +
    `The conversation explores key concepts, implementation details, and practical insights.`;

  const messages = _getMessages(chat);

  // Alternate headings within each role group
  const userHeadings = ['Problem Statement', 'Follow-up Questions'];
  const assistantHeadings = ['Solution', 'Technical Details', 'Further Explanation'];
  const userCount = { n: 0 };
  const assistantCount = { n: 0 };

  const sections = messages.map((msg) => {
    if (msg.role === 'user') {
      const heading = userHeadings[userCount.n % userHeadings.length];
      userCount.n++;
      return { heading, content: msg.content || '' };
    } else {
      const heading = assistantHeadings[assistantCount.n % assistantHeadings.length];
      assistantCount.n++;
      return { heading, content: msg.content || '' };
    }
  });

  const conclusion =
    `This technical discussion covered ${originalTitle}. ` +
    `Key takeaways include insights from the conversation above.`;

  return _result(title, introduction, sections, conclusion, _buildMeta(chat, STYLES.TECHNICAL));
}

/**
 * Academic transformer — formats the chat as an academic-style paper.
 * @param {object} chat
 * @returns {{ title: string, introduction: string, sections: Array, conclusion: string, meta: object }}
 */
function _transformAcademic(chat) {
  const originalTitle = chat.title || 'Untitled';
  const title = _toTitleCase(originalTitle);

  const introduction =
    `Abstract — This transcript documents an interactive dialogue examining ${originalTitle}. ` +
    `The exchange demonstrates the application of AI-assisted research methodologies.`;

  const messages = _getMessages(chat);
  let queryN = 0;
  let responseN = 0;

  const sections = messages.map((msg) => {
    if (msg.role === 'user') {
      queryN++;
      return { heading: `Query ${queryN}`, content: msg.content || '' };
    } else {
      responseN++;
      return { heading: `Response ${responseN}`, content: msg.content || '' };
    }
  });

  const conclusion =
    `The foregoing dialogue illustrates the depth of analysis achievable through ` +
    `structured AI interaction on the subject of ${originalTitle}.`;

  return _result(title, introduction, sections, conclusion, _buildMeta(chat, STYLES.ACADEMIC));
}

/**
 * Blog transformer — makes the chat feel like a casual blog post.
 * @param {object} chat
 * @returns {{ title: string, introduction: string, sections: Array, conclusion: string, meta: object }}
 */
function _transformBlog(chat) {
  const originalTitle = chat.title || 'Untitled';
  const commonVerbs = /^(how|what|why|when|where|who|which|is|are|can|do|does|should|would|could|will)/i;
  const startsWithVerb = /^(get|make|build|create|use|learn|find|understand|fix|improve|add|remove|write|run|set|configure|install|deploy|implement)/i;
  const title =
    originalTitle.endsWith('?') || commonVerbs.test(originalTitle) || startsWithVerb.test(originalTitle)
      ? `How to: ${originalTitle}`
      : originalTitle;

  const introduction =
    `Here's a fascinating conversation I had with an AI assistant about ${originalTitle}. ` +
    `Read on for some great insights!`;

  const messages = _getMessages(chat);
  const sections = messages.map((msg) => {
    if (msg.role === 'user') {
      return {
        heading: 'My question:',
        content: `> ${(msg.content || '').replace(/\n/g, '\n> ')}`,
      };
    } else {
      return { heading: '', content: msg.content || '' };
    }
  });

  const conclusion =
    `What do you think? Let me know in the comments below! ` +
    `And if you found this useful, consider sharing it.`;

  return _result(title, introduction, sections, conclusion, _buildMeta(chat, STYLES.BLOG));
}

/**
 * LinkedIn transformer — professional framing with numbered insights.
 * @param {object} chat
 * @returns {{ title: string, introduction: string, sections: Array, conclusion: string, meta: object }}
 */
function _transformLinkedIn(chat) {
  const originalTitle = chat.title || 'Untitled';

  // Count assistant messages to decide title format
  const messages = _getMessages(chat);
  const assistantMessages = messages.filter((m) => m.role === 'assistant');
  const insightCount = assistantMessages.length;
  const title =
    insightCount >= 3
      ? `${insightCount} Key Insights on ${originalTitle}`
      : `${originalTitle}: A Deep Dive`;

  const introduction =
    `I had an interesting conversation with an AI assistant that generated some compelling ` +
    `insights on ${originalTitle}. Here are the highlights:`;

  // For each assistant message, attempt to extract bullet points or numbered items.
  // For user messages, present as a short contextual label.
  let insightIndex = 0;
  const sections = messages.map((msg) => {
    if (msg.role === 'user') {
      return { heading: 'Context', content: msg.content || '' };
    } else {
      insightIndex++;
      const content = _extractLinkedInBullets(msg.content || '', insightIndex);
      return { heading: `Insight ${insightIndex}`, content };
    }
  });

  const conclusion =
    `What are your thoughts on ${originalTitle}? ` +
    `I'd love to hear your perspective in the comments. #AI #Learning #Professional`;

  return _result(title, introduction, sections, conclusion, _buildMeta(chat, STYLES.LINKEDIN));
}

/**
 * Extracts numbered bullet points from a block of text for LinkedIn formatting.
 * If the text already contains markdown lists, they are preserved; otherwise
 * sentences are split and renumbered.
 * @param {string} text
 * @param {number} startIndex - Starting number for auto-generated bullets.
 * @returns {string}
 */
function _extractLinkedInBullets(text, startIndex) {
  if (!text) return '';

  // If the text already has markdown bullets or numbered lists, return as-is
  const hasBullets = /^(\s*[-*+]|\s*\d+\.)\s/m.test(text);
  if (hasBullets) return text;

  // Split into sentences and format as numbered list
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 10);

  if (sentences.length <= 1) return text;

  return sentences.map((s, i) => `${startIndex}.${i + 1}. ${s}`).join('\n');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Main entry point — applies the requested style to a chat object and returns
 * a structured document object.
 *
 * @param {object} chat - The chat object to transform.
 * @param {string} chat.id - Unique chat identifier.
 * @param {string} chat.title - Chat title.
 * @param {string} [chat.content] - Serialised markdown content (fallback).
 * @param {string} [chat.source] - Source site (chatgpt | claude | gemini | copilot).
 * @param {string} [chat.url] - Original URL.
 * @param {number} [chat.timestamp] - Unix timestamp in milliseconds.
 * @param {Array<{role: string, content: string}>} [chat.messages] - Message array.
 * @param {number} [chat.messageCount] - Message count.
 * @param {object} [chat.metadata] - Additional metadata.
 * @param {string[]} [chat.tags] - Tags.
 * @param {string} [style='raw'] - One of the STYLES constant values.
 * @returns {{ title: string, introduction: string, sections: Array<{heading: string, content: string}>, conclusion: string, meta: object }}
 */
export function applyStyle(chat, style) {
  if (!chat || typeof chat !== 'object') {
    const safeStyle = style && STYLES[style.toUpperCase()] ? style : STYLES.RAW;
    return _result('', '', [], '', _buildMeta({}, safeStyle));
  }

  const resolvedStyle =
    style && Object.values(STYLES).includes(style) ? style : STYLES.RAW;

  switch (resolvedStyle) {
    case STYLES.TECHNICAL:
      return _transformTechnical(chat);
    case STYLES.ACADEMIC:
      return _transformAcademic(chat);
    case STYLES.BLOG:
      return _transformBlog(chat);
    case STYLES.LINKEDIN:
      return _transformLinkedIn(chat);
    case STYLES.RAW:
    default:
      return _transformRaw(chat);
  }
}

/**
 * Converts a styled chat document (produced by {@link applyStyle}) into a
 * Markdown string suitable for file export.
 *
 * Output format:
 * ```markdown
 * # {title}
 *
 * {introduction}
 *
 * ## {section.heading}
 *
 * {section.content}
 *
 * ---
 *
 * {conclusion}
 * ```
 *
 * @param {{ title: string, introduction: string, sections: Array<{heading: string, content: string}>, conclusion: string }} styledChat
 * @returns {string} Markdown-formatted string.
 */
export function styledToMarkdown(styledChat) {
  if (!styledChat || typeof styledChat !== 'object') return '';

  const parts = [];

  if (styledChat.title) {
    parts.push(`# ${styledChat.title}`);
  }

  if (styledChat.introduction) {
    parts.push('');
    parts.push(styledChat.introduction);
  }

  const sections = Array.isArray(styledChat.sections) ? styledChat.sections : [];
  for (const section of sections) {
    parts.push('');
    if (section.heading) {
      parts.push(`## ${section.heading}`);
      parts.push('');
    }
    parts.push(section.content || '');
  }

  if (styledChat.conclusion) {
    parts.push('');
    parts.push('---');
    parts.push('');
    parts.push(styledChat.conclusion);
  }

  return parts.join('\n');
}

/**
 * Converts a styled chat document (produced by {@link applyStyle}) into an
 * HTML body fragment suitable for injection into an HTML template.
 *
 * Does **not** include `<html>`, `<head>`, or `<body>` tags.
 *
 * Structure:
 * ```html
 * <h1>{title}</h1>
 * <p class="intro">{introduction}</p>
 * <section>
 *   <h2>{section.heading}</h2>
 *   <p>{section.content}</p>
 * </section>
 * ...
 * <footer class="conclusion"><p>{conclusion}</p></footer>
 * ```
 *
 * @param {{ title: string, introduction: string, sections: Array<{heading: string, content: string}>, conclusion: string }} styledChat
 * @returns {string} HTML body fragment string.
 */
export function styledToHtmlBody(styledChat) {
  if (!styledChat || typeof styledChat !== 'object') return '';

  /**
   * Wraps newlines in content as <br> tags and escapes HTML.
   * @param {string} str
   * @returns {string}
   */
  function _contentToHtml(str) {
    return escapeHtml(str || '').replace(/\n/g, '<br>\n');
  }

  const htmlParts = [];

  if (styledChat.title) {
    htmlParts.push(`<h1>${escapeHtml(styledChat.title)}</h1>`);
  }

  if (styledChat.introduction) {
    htmlParts.push(`<p class="intro">${_contentToHtml(styledChat.introduction)}</p>`);
  }

  const sections = Array.isArray(styledChat.sections) ? styledChat.sections : [];
  for (const section of sections) {
    const headingHtml = section.heading
      ? `\n  <h2>${escapeHtml(section.heading)}</h2>`
      : '';
    const contentHtml = `\n  <p>${_contentToHtml(section.content)}</p>`;
    htmlParts.push(`<section>${headingHtml}${contentHtml}\n</section>`);
  }

  if (styledChat.conclusion) {
    htmlParts.push(`<footer class="conclusion"><p>${_contentToHtml(styledChat.conclusion)}</p></footer>`);
  }

  return htmlParts.join('\n');
}
