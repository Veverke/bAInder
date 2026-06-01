/**
 * Copilot conversation extractor.
 * Targets: copilot.microsoft.com, m365.cloud.microsoft/chat
 *
 * Copilot DOM (as of March 2026):
 *   User messages:      [data-content="user-message"], [data-testid="user-message"],
 *                       [class*="user-message"], [class*="UserMessage"]
 *   Copilot responses:  [data-content="ai-message"], [data-testid="ai-message"],
 *                       [data-testid="copilot-message"], [class*="CopilotMessage"],
 *                       [data-testid="assistant-message"], [class*="AssistantMessage"]
 */

import { htmlToMarkdown }        from './html-to-markdown.js';
import { resolveImageBlobs }     from './image-resolver.js';
import { extractSourceLinks, stripSourceContainers } from './source-links.js';
import { formatMessage, generateTitle }              from './message-utils.js';
import { removeDescendants }                         from './shared.js';

// ─── Private helpers ──────────────────────────────────────────────────────────

const _LABEL_RE    = /^#{0,6}\s*(you said|i said|copilot said|copilot):?\s*$/i;
const _UI_NOISE_RE = /^(provide your feedback on (bizchat|copilot|m365|microsoft 365|bing)|was this (response|answer) helpful\??|helpful\s*not helpful|thumbs up|thumbs down|report a concern|give feedback|feedback on this response|like\s*dislike)\s*$/i;

/**
 * Strip Copilot UI role-label lines ("You said:", "Copilot said:") and
 * BizChat / M365 feedback UI noise from extracted markdown content.
 * @param {string} content
 * @returns {string}
 */
function stripRoleLabels(content) {
  return content
    .split('\n')
    .filter(line => {
      const t = line.trim();
      return !_LABEL_RE.test(t) && !_UI_NOISE_RE.test(t);
    })
    .join('\n')
    .replace(/^\s+/, '');
}

// ─── Virtual-scroll pre-pass ──────────────────────────────────────────────────

/**
 * Scroll the Copilot / M365 BizChat conversation container from top to bottom,
 * collecting the innerHTML of every message element as it enters the DOM.
 *
 * BizChat uses a virtualised list — messages outside the viewport are unmounted,
 * so a plain querySelectorAll only captures the currently-visible window.  This
 * pre-pass forces every message to load before it can be evicted.
 *
 * Returns an array of `{ role, innerHTML }` in conversation order, or `null`
 * when the container fits on screen without scrolling (pre-pass not needed).
 *
 * @param {Document} doc
 * @returns {Promise<Array<{role:string, innerHTML:string}>|null>}
 */
async function _scrollAndCollectCopilot(doc) {
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  // ── Step 1: find the real scrollable container ──────────────────────────
  // Walk up from a real message element via getComputedStyle instead of
  // guessing by selector — avoids picking a wrapper with overflow:hidden.
  const anchorEl =
    doc.querySelector('[data-content="user-message"], [data-content="ai-message"]') ||
    doc.querySelector('[data-testid="user-message"], [data-testid="ai-message"]') ||
    doc.querySelector('[class*="user-message"], [class*="UserMessage"]');

  let scrollEl = null;
  if (anchorEl && typeof getComputedStyle !== 'undefined') {
    let node = anchorEl.parentElement;
    while (node && node !== doc.documentElement) {
      const oy = getComputedStyle(node).overflowY;
      if ((oy === 'auto' || oy === 'scroll') && node.scrollHeight > node.clientHeight + 20) {
        scrollEl = node;
        break;
      }
      node = node.parentElement;
    }
  }

  // Fallback: known BizChat / Copilot selectors
  if (!scrollEl) {
    for (const sel of [
      '[data-testid="chat-page"]',
      '[class*="conversation-list"]',
      '[class*="conversationList"]',
      'main',
      '[role="main"]',
    ]) {
      const el = doc.querySelector(sel);
      if (el && el.scrollHeight > el.clientHeight + 50) { scrollEl = el; break; }
    }
  }

  if (!scrollEl) scrollEl = doc.scrollingElement || doc.documentElement;

  if (scrollEl.scrollHeight <= scrollEl.clientHeight + 100) return null;

  const savedTop  = scrollEl.scrollTop;
  const collected = [];
  const seenFps   = new Set();

  function harvest() {
    // Primary: stable BizChat/M365 data-content attributes (not on sidebar items)
    let userEls   = Array.from(doc.querySelectorAll('[data-content="user-message"]'));
    let assistEls = Array.from(doc.querySelectorAll('[data-content="ai-message"]'));
    // Fallback: class/testid selectors used by copilot.microsoft.com variants
    if (userEls.length === 0 && assistEls.length === 0) {
      userEls = Array.from(doc.querySelectorAll(
        '[class~="group/user-message"], [data-testid="user-message"], ' +
        '.UserMessage, [class*="UserMessage"], [class*="user-message"]'
      ));
      assistEls = Array.from(doc.querySelectorAll(
        '[class~="group/ai-message-item"], [class~="group/ai-message"], ' +
        '[data-testid="ai-message"], [data-testid="copilot-message"], ' +
        '[data-testid="assistant-message"], [class*="CopilotMessage"], ' +
        '[class*="AssistantMessage"], [class*="ai-message"]'
      ));
    }
    // Keep only top-level containers — remove nested elements with the same class
    const deNested = els => els.filter(el => !els.some(o => o !== el && o.contains(el)));
    userEls   = deNested(userEls);
    assistEls = deNested(assistEls);
    const allEls = [
      ...userEls.map(el  => ({ el, role: 'user' })),
      ...assistEls.map(el => ({ el, role: 'assistant' })),
    ].sort((a, b) =>
      a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1
    );
    for (const { el, role } of allEls) {
      const fp = role + '::' + (el.textContent || '').trim().slice(0, 120);
      if (seenFps.has(fp)) continue;
      seenFps.add(fp);
      collected.push({ role, innerHTML: el.innerHTML });
    }
  }

  // ── Phase 1: scroll UP to load older messages ────────────────────────────
  // BizChat prepends older messages when scrollTop approaches 0.
  // Jump to top, wait for the network, check if scrollHeight grew.
  // Stop when height stabilises (no more old messages) or cap is reached.
  const MAX_UP_PASSES = 30;
  for (let i = 0; i < MAX_UP_PASSES; i++) {
    const prevH = scrollEl.scrollHeight;
    scrollEl.scrollTo({ top: 0, behavior: 'instant' });
    await sleep(600);
    harvest();
    if (scrollEl.scrollHeight === prevH) break;
  }

  // ── Phase 2: scroll DOWN to collect all messages ─────────────────────────
  const STEP_PX   = Math.max(300, Math.floor((scrollEl.clientHeight || 600) * 0.7));
  const MAX_STEPS = 200;
  let lastTop   = -1;
  let sameCount = 0;
  for (let step = 0; step < MAX_STEPS; step++) {
    scrollEl.scrollBy({ top: STEP_PX, behavior: 'instant' });
    await sleep(350);
    harvest();
    const top = scrollEl.scrollTop;
    if (top === lastTop) { if (++sameCount >= 3) break; }
    else                 { sameCount = 0; lastTop = top; }
  }

  // ── Phase 2.5: final bottom sweep ─────────────────────────────────────────
  // The virtualizer may render the very last batch only after scrollTop
  // stabilises. Push to the new bottom until count and height are both stable.
  for (let extra = 0; extra < 5; extra++) {
    const prevCount = collected.length;
    const prevH     = scrollEl.scrollHeight;
    scrollEl.scrollTo({ top: scrollEl.scrollHeight, behavior: 'instant' });
    await sleep(500);
    harvest();
    if (collected.length === prevCount && scrollEl.scrollHeight === prevH) break;
  }

  scrollEl.scrollTo({ top: savedTop, behavior: 'instant' });
  const raf = typeof requestAnimationFrame !== 'undefined' ? requestAnimationFrame : fn => setTimeout(fn, 16);
  await new Promise(r => raf(() => raf(r)));

  console.log('[bAInder] [copilot] scroll pre-pass captured', collected.length, 'message(s)',
    '(scrollEl:', (scrollEl.tagName || 'document') + '#' + (scrollEl.id || ''),
    'scrollH=' + scrollEl.scrollHeight, 'clientH=' + scrollEl.clientHeight + ')');
  return collected;
}

// ─── Extractor ────────────────────────────────────────────────────────────────

/**
 * Extract messages from a GitHub Copilot / M365 conversation page.
 * @param {Document} doc
 * @returns {{title: string, messages: Array, messageCount: number}}
 */
export async function extractCopilot(doc) {
  if (!doc) throw new Error('Document is required');

  // ── Virtual-scroll pre-pass ─────────────────────────────────────────────────
  // M365 BizChat virtualises its message list: messages outside the viewport are
  // unmounted.  Scroll the full conversation so every message is harvested before
  // it can be evicted, then process the collected HTML snapshots.
  const messages = [];
  const _prePassMsgs = await _scrollAndCollectCopilot(doc);
  if (_prePassMsgs && _prePassMsgs.length > 0) {
    console.log('[bAInder] [copilot] processing', _prePassMsgs.length, 'pre-pass message(s)');
    const bgFetch = (typeof chrome !== 'undefined' && chrome?.runtime?.sendMessage)
      ? url => new Promise((resolve, reject) => {
          chrome.runtime.sendMessage({ type: 'FETCH_IMAGE_AS_DATA_URL', url }, resp => {
            if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
            const du = resp?.dataUrl || '';
            if (resp?.success && du.startsWith('data:')) resolve(du);
            else reject(new Error(resp?.error || 'invalid dataUrl from background'));
          });
        })
      : null;
    for (const { role, innerHTML } of _prePassMsgs) {
      const tempDiv = doc.createElement('div');
      tempDiv.innerHTML = innerHTML;
      const processEl  = role === 'assistant' ? stripSourceContainers(tempDiv) : tempDiv;
      const resolvedEl = await resolveImageBlobs(processEl, bgFetch);
      let content = stripRoleLabels(htmlToMarkdown(resolvedEl));
      if (role === 'assistant') content += extractSourceLinks(tempDiv);
      console.log('[bAInder] [copilot] pre-pass msg', messages.length, role,
        '| len:', content.length, '| preview:', JSON.stringify(content.slice(0, 300)));
      if (content) messages.push(formatMessage(role, content));
    }
    const title = generateTitle(messages, doc.location?.href || '');
    return { title, messages, messageCount: messages.length };
  }

  // Fall through to standard DOM extraction when pre-pass is not needed.

  // Scope to the main conversation area so sidebar history items
  // (which may share the same class patterns) are not included.
  const chatScope =
    doc.querySelector('[data-testid="chat-page"]') ||
    doc.querySelector('main') ||
    doc.querySelector('[role="main"]') ||
    doc.querySelector('[class*="conversation"][class*="container"]') ||
    doc;

  // Predicate: true when an element is inside a history side-panel / nav drawer.
  // Use specific data-testid anchors instead of [class*="sidebar"] which can match
  // layout wrappers that span both the sidebar and the conversation area.
  const inHistoryPanel = el =>
    !!el.closest(
      'aside, [role="complementary"], [role="navigation"], [class*="history"],' +
      '[data-testid="sidebar-container"], [data-testid="backstage-chats"],' +
      '[data-testid="highlighted-chats"]'
    );

  // Fast path: [data-content] is a stable, Copilot-assigned semantic attribute
  // that only appears on real conversation messages — sidebar history items do not
  // carry it.  Query the whole document (not chatScope) so nothing is missed.
  const trustedUserEls   = Array.from(doc.querySelectorAll('[data-content="user-message"]'));
  const trustedAssistEls = Array.from(doc.querySelectorAll('[data-content="ai-message"]'));

  let rawUserEls, rawCopilotEls;

  if (trustedUserEls.length > 0 || trustedAssistEls.length > 0) {
    rawUserEls    = trustedUserEls;
    rawCopilotEls = trustedAssistEls;
  } else {
    // Fallback: broad class/testid selectors scoped to chatScope + history-panel filter.
    rawUserEls = Array.from(
      chatScope.querySelectorAll(
        '[class~="group/user-message"], [data-testid="user-message"], .UserMessage, [class*="UserMessage"], [class*="user-message"]'
      )
    ).filter(el => !inHistoryPanel(el));

    rawCopilotEls = Array.from(
      chatScope.querySelectorAll(
        '[class~="group/ai-message-item"], [class~="group/ai-message"], ' +
        '[data-testid="ai-message"], [data-testid="copilot-message"], [data-testid="assistant-message"], ' +
        '[class*="ai-message"], [class*="CopilotMessage"], [class*="AssistantMessage"], [class*="copilot-message"]'
      )
    ).filter(el => !inHistoryPanel(el));
  }

  // Keep only the outermost matched element when nested elements all match a selector.
  const userEls    = removeDescendants(rawUserEls);
  const copilotEls = removeDescendants(rawCopilotEls);

  const allEls = [
    ...userEls.map(el => ({ el, role: 'user' })),
    ...copilotEls.map(el => ({ el, role: 'assistant' }))
  ].sort((a, b) => {
    const pos = a.el.compareDocumentPosition(b.el);
    return pos & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
  });

  for (const { el, role } of allEls) {
    // Strip any Copilot UI role-label headings ("You said:", "Copilot said:").
    const processEl = role === 'assistant' ? stripSourceContainers(el) : el;
    // Route https: image fetches through the background service worker to bypass
    // CORP: same-site on Bing image CDNs (th.bing.com, www.bing.com).
    const bgFetch = (typeof chrome !== 'undefined' && chrome?.runtime?.sendMessage)
      ? url => new Promise((resolve, reject) => {
          chrome.runtime.sendMessage({ type: 'FETCH_IMAGE_AS_DATA_URL', url }, resp => {
            if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
            const du = resp?.dataUrl || '';
            if (resp?.success && du.startsWith('data:')) resolve(du);
            else reject(new Error(resp?.error || 'invalid dataUrl from background'));
          });
        })
      : null;
    const resolvedEl = await resolveImageBlobs(processEl, bgFetch, el);
    let content = stripRoleLabels(htmlToMarkdown(resolvedEl));
    if (role === 'assistant') content += extractSourceLinks(el);
    console.log('[bAInder] [copilot] extracted msg', messages.length, role,
      '| len:', content.length, '| preview:', JSON.stringify(content.slice(0, 300)));
    if (content) messages.push(formatMessage(role, content));
  }

  const title = generateTitle(messages, doc.location?.href || '');
  return { title, messages, messageCount: messages.length };
}
