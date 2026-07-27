/**
 * copilot-scroll.js
 *
 * Copilot / M365 BizChat conversation scroll-to-load utility.
 *
 * BizChat virtualises its message list — messages outside the viewport are
 * unmounted from the DOM.  This module provides a single function that scrolls
 * the conversation container from top to bottom, collecting every message's
 * innerHTML as it enters the DOM, with a visible progress overlay.
 *
 * Shared by:
 *   - extractors/copilot.js   (regular save via chat-extractor.js)
 *   - content.js              (inlined content-script copy)
 *   - bulk-fetcher.js         (bulk "fetch all chats" flow)
 */

// ─── Helpers ──────────────────────────────────────────────────────────────────

const _sleep = ms => new Promise(r => setTimeout(r, ms));

/**
 * Walk up from `child` to find the first ancestor with overflow-y: auto|scroll
 * that has actual scrollable content.
 * @param {Element} child
 * @param {number} [threshold=20]
 * @returns {Element|null}
 */
function _findScrollableAncestor(child, threshold = 20) {
  if (!child || typeof getComputedStyle === 'undefined') return null;
  let node = child.parentElement;
  while (node && node !== document.documentElement) {
    const oy = getComputedStyle(node).overflowY;
    if ((oy === 'auto' || oy === 'scroll') && node.scrollHeight > node.clientHeight + threshold) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}

/**
 * Create and append a progress overlay to the document.
 * Returns an object with methods to update and remove it.
 * @param {Document} doc
 * @param {number} totalExpected  Expected message count (0 = unknown)
 * @returns {{ update: Function, updateScroll: Function, done: Function, remove: Function, el: HTMLElement }}
 */
function _createProgressOverlay(doc, totalExpected) {
  const ov = doc.createElement('div');
  ov.id = 'bainder-scroll-overlay';
  ov.style.cssText = [
    'position:fixed', 'inset:0', 'z-index:2147483647',
    'background:rgba(0,0,0,0.35)',
    'display:flex', 'align-items:center', 'justify-content:center',
  ].join(';');

  const ovBox = doc.createElement('div');
  ovBox.style.cssText = [
    'background:#fff', 'border-radius:14px', 'padding:28px 32px',
    'width:340px', 'max-width:90vw',
    'box-shadow:0 8px 40px rgba(0,0,0,0.28)',
    'font-family:system-ui,-apple-system,sans-serif', 'color:#111827',
    'display:flex', 'flex-direction:column', 'gap:12px',
  ].join(';');

  const ovHdg = doc.createElement('div');
  ovHdg.style.cssText = 'font-size:15px;font-weight:700;display:flex;align-items:center;gap:8px;';
  ovHdg.innerHTML = '<span style="font-size:20px;line-height:1">📥</span> Loading full conversation\u2026';

  const ovPhase = doc.createElement('div');
  ovPhase.style.cssText = 'font-size:13px;color:#6b7280;min-height:18px;';
  ovPhase.textContent = 'Starting\u2026';

  const ovTrack = doc.createElement('div');
  ovTrack.style.cssText = 'height:8px;background:#e5e7eb;border-radius:99px;overflow:hidden;';
  const ovFill = doc.createElement('div');
  ovFill.style.cssText = [
    'height:100%', 'width:0%', 'background:#818cf8',
    'border-radius:99px', 'transition:width 0.35s ease',
  ].join(';');
  ovTrack.appendChild(ovFill);

  const ovCounter = doc.createElement('div');
  ovCounter.style.cssText = 'font-size:12px;color:#9ca3af;text-align:right;';
  ovCounter.textContent = totalExpected > 0
    ? '0\u202fof\u202f' + totalExpected + '\u202fmessages'
    : 'Starting\u2026';

  ovBox.appendChild(ovHdg);
  ovBox.appendChild(ovPhase);
  ovBox.appendChild(ovTrack);
  ovBox.appendChild(ovCounter);
  ov.appendChild(ovBox);
  doc.body.appendChild(ov);

  return {
    el: ov,
    /** Update progress by count (requires totalExpected). */
    update(count, phase) {
      const pct = totalExpected > 0
        ? Math.min(count / totalExpected * 100, 99)
        : null;
      if (pct !== null) ovFill.style.width = pct + '%';
      ovPhase.textContent = phase;
      ovCounter.textContent = totalExpected > 0
        ? count + '\u202fof\u202f' + totalExpected + '\u202fmessages'
        : count + '\u202fmessages loaded';
    },
    /** Update progress by scroll percentage (when totalExpected is unknown). */
    updateScroll(scrollPct, count, phase) {
      const current = parseFloat(ovFill.style.width) || 0;
      ovFill.style.width = Math.max(current, Math.min(scrollPct, 99)) + '%';
      ovPhase.textContent = phase;
      ovCounter.textContent = count + '\u202fmessages loaded';
    },
    /** Flash "done" state, then remove after a brief pause. */
    async done(count) {
      ovFill.style.width = '100%';
      ovHdg.innerHTML = '<span style="font-size:20px;line-height:1">✅</span> Conversation loaded';
      ovPhase.textContent = count + '\u202fmessages captured';
      ovCounter.style.display = 'none';
      await _sleep(600);
      ov.remove();
    },
    /** Remove immediately. */
    remove() {
      ov.remove();
    },
  };
}

// ─── Main scroll function ─────────────────────────────────────────────────────

/**
 * Scroll the Copilot / M365 BizChat conversation container to trigger loading
 * of all virtualised messages, collecting innerHTML snapshots along the way.
 *
 * Returns an array of `{ role, innerHTML }` in conversation order, or `null`
 * when the container fits on screen without scrolling (pre-pass not needed).
 *
 * @param {Document} doc
 * @param {object}   [options]
 * @param {boolean}  [options.showOverlay=true]   Show a progress overlay
 * @param {number}   [options.totalExpected=0]     Expected message count (0 = unknown)
 * @returns {Promise<Array<{role:string, innerHTML:string}>|null>}
 */
export async function scrollAndCollectCopilotMessages(doc, options = {}) {
  const { showOverlay = true, totalExpected = 0 } = options;

  // ── Step 1: find the real scrollable container ──────────────────────────
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

  // If the content fits on screen, no scrolling needed
  if (scrollEl.scrollHeight <= scrollEl.clientHeight + 100) return null;

  // ── Progress overlay ────────────────────────────────────────────────────
  let overlay = null;
  if (showOverlay) {
    overlay = _createProgressOverlay(doc, totalExpected);
  }

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

  try {
    // ── Phase 1: scroll UP to load older messages ──────────────────────────
    // BizChat prepends older messages when scrollTop approaches 0.
    const MAX_UP_PASSES = 30;
    for (let i = 0; i < MAX_UP_PASSES; i++) {
      const prevH = scrollEl.scrollHeight;
      scrollEl.scrollTo({ top: 0, behavior: 'instant' });
      await _sleep(600);
      harvest();
      if (overlay) overlay.update(collected.length, 'Fetching older messages\u2026');
      if (scrollEl.scrollHeight === prevH) break;
    }

    // ── Phase 2: scroll DOWN to collect all messages ───────────────────────
    const STEP_PX   = Math.max(300, Math.floor((scrollEl.clientHeight || 600) * 0.7));
    const MAX_STEPS = 200;
    let lastTop   = -1;
    let sameCount = 0;
    for (let step = 0; step < MAX_STEPS; step++) {
      scrollEl.scrollBy({ top: STEP_PX, behavior: 'instant' });
      await _sleep(350);
      harvest();
      const top = scrollEl.scrollTop;
      const maxScroll = scrollEl.scrollHeight - scrollEl.clientHeight;
      const scrollPct = maxScroll > 0 ? (top / maxScroll) * 100 : 100;
      if (overlay) {
        if (totalExpected > 0) {
          overlay.update(collected.length, 'Reading messages\u2026');
        } else {
          overlay.updateScroll(scrollPct, collected.length, 'Reading messages\u2026');
        }
      }
      if (top === lastTop) { if (++sameCount >= 3) break; }
      else                 { sameCount = 0; lastTop = top; }
    }

    // ── Phase 3: final bottom sweep ────────────────────────────────────────
    for (let extra = 0; extra < 5; extra++) {
      const prevCount = collected.length;
      const prevH     = scrollEl.scrollHeight;
      scrollEl.scrollTo({ top: scrollEl.scrollHeight, behavior: 'instant' });
      await _sleep(500);
      harvest();
      if (overlay) overlay.update(collected.length, 'Finishing\u2026');
      if (collected.length === prevCount && scrollEl.scrollHeight === prevH) break;
    }

    // ── Restore position ───────────────────────────────────────────────────
    scrollEl.scrollTo({ top: savedTop, behavior: 'instant' });
    const raf = typeof requestAnimationFrame !== 'undefined' ? requestAnimationFrame : fn => setTimeout(fn, 16);
    await new Promise(r => raf(() => raf(r)));

    // ── Done ───────────────────────────────────────────────────────────────
    if (overlay) await overlay.done(collected.length);

    console.log('[bAInder] [copilot-scroll] captured', collected.length, 'message(s)',
      '(scrollEl:', (scrollEl.tagName || 'document') + '#' + (scrollEl.id || ''),
      'scrollH=' + scrollEl.scrollHeight, 'clientH=' + scrollEl.clientHeight + ')');
    return collected;
  } catch (err) {
    console.warn('[bAInder] [copilot-scroll] error:', err.message);
    if (overlay) overlay.remove();
    scrollEl.scrollTo({ top: savedTop, behavior: 'instant' });
    return null;
  }
}