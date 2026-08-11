/**
 * Gemini conversation extractor.
 * Targets: gemini.google.com
 *
 * Gemini DOM (as of 2025/2026):
 *   User queries:      .user-query-content,  .query-text,   [class*="user-query"]
 *   Model responses:   .model-response-text, .response-text,[class*="model-response"]
 */

import { htmlToMarkdown }        from './html-to-markdown.js';
import { resolveImageBlobs, appendShadowImages, appendShadowAudio } from './image-resolver.js';
import { extractSourceLinks, stripSourceContainers } from './source-links.js';
import { formatMessage, generateTitle }              from './message-utils.js';
import { removeDescendants }                         from './shared.js';

// ─── Private helpers ──────────────────────────────────────────────────────────
// Gemini injects a "Gemini said" heading before each model response and may
// include "You stopped this response" inside the element when generation is
// interrupted mid-stream.
const _GEMINI_LABEL_RE = /^#{0,6}\s*gemini said:?\s*$/i;
const _STOPPED_TEXT_RE = /^you stopped this response\.?\s*$/i;

// ─── Date parsing ────────────────────────────────────────────────────────────
// Gemini shows date dividers between conversations in the history sidebar and
// may include a <time> element or date-divider in the conversation view.
const _DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/**
 * Parse a Gemini date-divider text or <time> datetime attribute into an ISO string.
 * @param {string} text
 * @returns {string|null}
 */
function _parseGeminiDate(text) {
  if (!text) return null;
  const t = text.trim();
  if (!t) return null;
  const lower = t.toLowerCase();

  // "Today"
  if (lower === 'today') return new Date().toISOString();
  // "Yesterday"
  if (lower === 'yesterday') {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString();
  }
  // "Last Monday", "Monday", etc.
  const dayMatch = lower.match(/^(last\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)$/);
  if (dayMatch) {
    const targetDay = _DAYS.indexOf(dayMatch[2]);
    const now = new Date();
    const diff = (now.getDay() - targetDay + 7) % 7;
    const d = new Date(now);
    if (dayMatch[1]) {
      // "Last Monday" → go back 7 days + diff
      d.setDate(d.getDate() - diff - 7);
    } else {
      // "Monday" → most recent past Monday (not today)
      d.setDate(d.getDate() - (diff === 0 ? 7 : diff));
    }
    return d.toISOString();
  }
  // Absolute date: "July 27, 2026" or "2026-07-27"
  const parsed = new Date(t);
  if (!isNaN(parsed.getTime())) return parsed.toISOString();
  return null;
}

/**
 * Strip Gemini UI labels ("Gemini said") and interrupted-generation markers
 * ("You stopped this response") from extracted markdown content.
 * @param {string} content
 * @returns {string}
 */
function stripGeminiUILabels(content) {
  return content
    .split('\n')
    .filter(line => {
      const t = line.trim();
      return !_GEMINI_LABEL_RE.test(t) && !_STOPPED_TEXT_RE.test(t);
    })
    .join('\n')
    .replace(/^\s+/, '');
}

/**
 * Extract messages from a Gemini conversation page.
 * @param {Document} doc
 * @returns {{title: string, messages: Array, messageCount: number}}
 */
export async function extractGemini(doc) {
  if (!doc) throw new Error('Document is required');

  const messages = [];

  // Gemini uses Angular custom elements with shadow DOM; images may live
  // inside those shadow roots and are invisible to querySelectorAll / cloneNode.
  // Selectors cover both the regular class-based structure and Angular custom
  // element names used by Gemini (including image-generation response cards).
  const USER_SEL = [
    '.user-query-content', '.query-text', '[class*="user-query"]',
    'user-query', '[data-chunk-id]',
  ].join(', ');
  const MODEL_SEL = [
    '.model-response-text', '.response-text', '[class*="model-response"]',
    'model-response', '[class*="image-gen"]', '[class*="generated-image"]',
    '[class*="image-response"]', '[class*="ResponseBody"]',
  ].join(', ');

  const userEls  = removeDescendants(Array.from(doc.querySelectorAll(USER_SEL)));
  // Filter out model-response elements that are part of a stopped/interrupted
  // generation. Gemini renders "You stopped this response" as a sibling in the
  // DOM right after or inside the stopped turn's container.
  const STOPPED_RE = /you stopped this response/i;
  const rawModelEls = Array.from(doc.querySelectorAll(MODEL_SEL));
  const modelEls = removeDescendants(rawModelEls.filter(el => {
    // Check the element itself and nearby siblings for the stopped marker.
    const next = el.nextElementSibling;
    if (next && STOPPED_RE.test(next.textContent || '')) return false;
    const parent = el.parentElement;
    if (parent) {
      const pNext = parent.nextElementSibling;
      if (pNext && STOPPED_RE.test(pNext.textContent || '')) return false;
      // Also check if the parent itself contains the marker as a direct child text node
      if ([...parent.children].some(c => c !== el && STOPPED_RE.test(c.textContent || '') && (c.textContent || '').trim().length < 200)) return false;
    }
    return true;
  }));

  console.debug('[bAInder] Gemini extraction: user elements=%d model elements=%d',
    userEls.length, modelEls.length);

  const allEls = [
    ...userEls.map(el => ({ el, role: 'user' })),
    ...modelEls.map(el => ({ el, role: 'assistant' }))
  ].sort((a, b) => {
    const pos = a.el.compareDocumentPosition(b.el);
    return pos & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
  });

  for (const { el, role } of allEls) {
    const processEl = role === 'assistant' ? stripSourceContainers(el) : el;
    // Route https: image fetches through the background service worker to bypass
    // CORP: same-site enforcement (lh3.google.com blocks extension-origin requests).
    const bgFetch = url => new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: 'FETCH_IMAGE_AS_DATA_URL', url }, resp => {
        if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
        const du = resp?.dataUrl || '';
        if (resp?.success && du.startsWith('data:')) resolve(du);
        else reject(new Error(resp?.error || 'invalid dataUrl from background'));
      });
    });
    const resolvedEl = await resolveImageBlobs(processEl, bgFetch, el);
    let content = htmlToMarkdown(resolvedEl);
    // ── Debug: confirm whether tables are being found ──────────────────────
    const tableCount = resolvedEl.querySelectorAll('table').length;
    if (tableCount > 0) {
      console.debug('[bAInder] Gemini', role, ': found', tableCount, '<table> element(s); markdown pipes:', (content.match(/\|/g) || []).length);
    } else {
      // Log the unique tags present so we can see what structure the content uses
      const tags = [...resolvedEl.querySelectorAll('*')]
        .map(e => e.tagName.toLowerCase())
        .filter((v, i, a) => a.indexOf(v) === i)
        .sort()
        .join(',');
      console.debug('[bAInder] Gemini', role, ': NO <table> elements. Tags in response el:', tags);
    }
    // Supplement with images inside shadow-DOM roots (Gemini custom elements).
    content = await appendShadowImages(el, content, bgFetch);
    // Supplement with audio players inside shadow-DOM roots (Gemini audio responses).
    if (role === 'assistant') content = await appendShadowAudio(el, content);
    // Strip "Gemini said" role-label headings and "You stopped this response"
    // markers that Gemini injects into the DOM as part of its response elements.
    if (role === 'assistant') content = stripGeminiUILabels(content);
    console.debug('[bAInder] Gemini turn:', role, el.tagName,
      '| light imgs:', el.querySelectorAll('img').length,
      '| markdown len:', content.length);
    if (role === 'assistant') content += extractSourceLinks(el);
    if (content) messages.push(formatMessage(role, content));
  }

  // Read audio blobs captured by the MAIN-world interceptor (audio-interceptor.js).
  // Gemini generates audio via URL.createObjectURL(); the interceptor records the data URI
  // in a hidden <meta> element accessible from this ISOLATED-world script via the DOM.
  const cachedAudioMeta = doc.querySelectorAll('meta[name="bainder-audio-cache"]');
  if (cachedAudioMeta.length > 0) {
    const audioMarkers = [];
    const seenBlobs = new Set();
    for (const meta of cachedAudioMeta) {
      const blobUrl = meta.getAttribute('data-blob-url') || '';
      const dataUrl = meta.getAttribute('data-data-url') || '';
      if (!dataUrl || seenBlobs.has(blobUrl)) continue;
      seenBlobs.add(blobUrl);
      console.log('[bAInder] Gemini: interceptor cache hit, blob:', blobUrl.slice(0, 60));
      audioMarkers.push(`[🔊 Generated audio](${dataUrl})`);
    }
    if (audioMarkers.length > 0) {
      const lastAsst = [...messages].reverse().find(m => m.role === 'assistant');
      const markerText = audioMarkers.join('\n');
      if (lastAsst) lastAsst.content += '\n\n' + markerText;
      else messages.push(formatMessage('assistant', markerText));
    }
  }

  const title = generateTitle(messages, doc.location?.href || '');

  // ── Date extraction ──────────────────────────────────────────────────
  // Try to get a meaningful date from the Gemini page. Sources in priority:
  //   1. <time datetime="..."> element in the conversation header
  //   2. Date-divider text ("Today", "Yesterday", "Monday", etc.)
  //   3. Timestamp embedded in the page head via <meta> or JSON-LD
  let chatDate = null;
  const timeEl = doc.querySelector('time[datetime]');
  if (timeEl) {
    const parsed = _parseGeminiDate(timeEl.getAttribute('datetime'));
    if (parsed) chatDate = parsed;
  }
  if (!chatDate) {
    const dividerEl = doc.querySelector(
      '[class*="date-divider"], [class*="DateDivider"], ' +
      '[class*="divider"], [class*="separator"], ' +
      '[data-testid*="date"], [data-testid*="Date"], ' +
      'h2, h3, [class*="timestamp"], [class*="time"]'
    );
    if (dividerEl) {
      // Filter out UI headings that aren't dates
      const text = (dividerEl.textContent || '').trim();
      if (text && text.length < 60 && !text.includes('Gemini') && !text.includes('said')) {
        const parsed = _parseGeminiDate(text);
        if (parsed) chatDate = parsed;
      }
    }
  }

  return { title, messages, messageCount: messages.length, chatDate };
}
