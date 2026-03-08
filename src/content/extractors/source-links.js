/**
 * Source link extraction for chat content.
 * Extracts and strips citation/source containers across all supported AI platforms.
 */

// ─── Source Container Selectors ──────────────────────────────────────────────

/**
 * CSS selectors that identify source / citation container elements used by the
 * supported AI platforms.  Kept as a single joined string for querySelectorAll.
 */
const SOURCE_CONTAINER_SELECTORS = [
  // ── ChatGPT (web-search / browse) ──────────────────────────────────────
  '[data-testid*="citation"]',
  '[class*="CitationBubble"]',
  '[class*="SearchResult"]',
  '[class*="citation-list"]',
  // ── Gemini ─────────────────────────────────────────────────────────────
  '[class*="attribution"]',
  'source-citation',           // Gemini custom element
  '[class*="source-chip"]',
  // ── Copilot / M365 ─────────────────────────────────────────────────────
  '[class*="SourceCard"]',
  '[class*="sourceCard"]',
  '[class*="ReferenceCard"]',
  '[class*="referenceCard"]',
  '[class*="CitationCard"]',
  '[class*="citationCard"]',
  '[data-testid*="source-card"]',
  '[data-testid*="sources"]',
  '[data-testid^="sources-button"]',   // data-testid (no hyphen)
  '[data-test-id*="sources"]',         // data-test-id (hyphenated — Copilot variant)
  '[data-test-id^="sources-button"]',  // data-test-id hyphenated + prefix match
  '[data-testid="foot-note-div"]',     // Copilot footnote bar (shows "Sources" text)
  // ── Generic (aria-label based) ─────────────────────────────────────────
  '[aria-label="Sources"]',
  '[aria-label="References"]',
  '[aria-label="Citations"]',
].join(', ');

// ─── extractSourceLinks ───────────────────────────────────────────────────────

/**
 * Extract external source / citation links from an assistant-turn container.
 *
 * Two strategies are combined:
 *
 * Part A – sibling source containers:
 *   When `contentEl` is a specific sub-element of `turnEl` (e.g. ChatGPT's
 *   `.markdown` inside its `article`), any source-card divs that live
 *   OUTSIDE `contentEl` but inside `turnEl` are targeted by
 *   SOURCE_CONTAINER_SELECTORS and their links collected.
 *
 * Part B – button-hidden links:
 *   `htmlToMarkdown` skips all `<button>` content.  On Copilot / M365 the
 *   "N sources" disclosure is a `<button>` that wraps the actual link list.
 *   This part scans every `<button>` inside the processed element whose
 *   text / aria-label mentions "sources", "references", or "citations".
 *
 * @param {Element}      turnEl     Outer turn / article element
 * @param {Element|null} contentEl  Inner element already processed by
 *                                  htmlToMarkdown (pass null when the full
 *                                  turn element was processed directly)
 * @returns {string}  Markdown "**Sources:**\n- [title](url)…" block, or ''
 */
export function extractSourceLinks(turnEl, contentEl = null) {
  if (!turnEl) return '';

  const seen  = new Set();
  const lines = [];

  const recordLink = (a) => {
    const href = (a.getAttribute('href') || '').trim();
    if (!href || seen.has(href)) return;
    if (!/^https?:\/\//i.test(href) && !href.startsWith('//')) return;
    seen.add(href);
    const text = (a.textContent || '').replace(/\s+/g, ' ').trim() || href;
    lines.push(`- [${text}](${href})`);
  };

  // ── Part A: source containers ───────────────────────────────────────────────
  if (contentEl && contentEl !== turnEl) {
    // Sibling path (ChatGPT): look for containers OUTSIDE the already-processed contentEl.
    try {
      for (const c of Array.from(turnEl.querySelectorAll(SOURCE_CONTAINER_SELECTORS))) {
        if (contentEl.contains(c)) continue; // already included by htmlToMarkdown
        Array.from(c.querySelectorAll('a[href]')).forEach(recordLink);
      }
    } catch (_) { /* ignore selector errors */ }
  } else {
    // Full-element path (Claude/Gemini/Copilot): source containers are INSIDE
    // turnEl — they were stripped from the processEl clone before htmlToMarkdown
    // was called, so we need to pull their links from the original here.
    try {
      for (const c of Array.from(turnEl.querySelectorAll(SOURCE_CONTAINER_SELECTORS))) {
        Array.from(c.querySelectorAll('a[href]')).forEach(recordLink);
      }
    } catch (_) { /* ignore selector errors */ }
  }

  // ── Part B: links hidden inside <button> wrappers ────────────────────────
  // Applies to both sibling-content and full-element extraction paths.
  try {
    const SOURCES_RE = /\b(source|sources|reference|references|citation|citations)\b/i;
    const scope      = contentEl || turnEl;
    for (const btn of Array.from(scope.querySelectorAll('button'))) {
      const lbl = (btn.getAttribute('aria-label') || btn.textContent || '').trim();
      if (!SOURCES_RE.test(lbl)) continue;
      Array.from(btn.querySelectorAll('a[href]')).forEach(recordLink);
    }
    // Directly match by data-testid OR data-test-id containing "source"
    for (const container of Array.from(turnEl.querySelectorAll('[data-testid],[data-test-id]'))) {
      const id = (container.getAttribute('data-testid') || container.getAttribute('data-test-id') || '').toLowerCase();
      if (id.includes('source')) Array.from(container.querySelectorAll('a[href]')).forEach(recordLink);
    }
  } catch (_) { /* ignore */ }

  // ── Part C: Copilot favicon-based source URLs ─────────────────────────────
  // Copilot's sources panel is collapsed at save time — no <a href> links exist.
  // The collapsed button contains <img src="https://services.bingapis.com/favicon?url=DOMAIN">
  // for each source.  Extract the domain from each favicon URL to build a real link.
  if (lines.length === 0) {
    try {
      turnEl.querySelectorAll('[data-testid="sources-button-testid"]').forEach(btn => {
        btn.querySelectorAll('img[src*="bingapis.com/favicon"]').forEach(img => {
          const src = img.getAttribute('src') || '';
          const m = src.match(/[?&]url=([^&]+)/);
          if (!m) return;
          const domain = decodeURIComponent(m[1]).replace(/^https?:\/\//, '').replace(/\/$/, '');
          const url = 'https://' + domain;
          if (!seen.has(url)) {
            seen.add(url);
            lines.push(`- [${domain}](${url})`);
          }
        });
      });
    } catch (_) {}
  }

  if (lines.length === 0) return '';
  return '\n\n**Sources:**\n\n' + lines.join('\n');
}

// ─── stripSourceContainers ────────────────────────────────────────────────────

/**
 * Clone `el` and remove source/citation containers (and source-labelled buttons)
 * so that htmlToMarkdown does not render them as content.
 * Links are extracted separately by extractSourceLinks on the ORIGINAL element.
 * @param {Element} el
 * @returns {Element}
 */
export function stripSourceContainers(el) {
  const clone = el.cloneNode(true);
  try {
    clone.querySelectorAll(SOURCE_CONTAINER_SELECTORS).forEach(n => n.remove());
  } catch (_) {}
  // Also strip any descendant whose data-testid OR data-test-id contains "source"
  // (catches runtime-generated testid names like "sources-button-testid-abc123")
  try {
    clone.querySelectorAll('[data-testid],[data-test-id]').forEach(n => {
      const id = (n.getAttribute('data-testid') || n.getAttribute('data-test-id') || '').toLowerCase();
      if (id.includes('source')) n.remove();
    });
  } catch (_) {}
  try {
    const SOURCES_RE = /\b(source|sources|reference|references|citation|citations)\b/i;
    clone.querySelectorAll('button,[role="button"]').forEach(btn => {
      const lbl = (btn.getAttribute('aria-label') || btn.textContent || '').trim();
      if (SOURCES_RE.test(lbl)) btn.remove();
    });
  } catch (_) {}
  // Strip Copilot M365 feedback / rating banners ("Provide your feedback on BizChat")
  try {
    const FEEDBACK_RE = /provide\s+your\s+feedback|bizchat/i;
    clone.querySelectorAll(
      '[class*="feedback" i],[class*="Feedback"],[aria-label*="feedback" i],' +
      'button,[role="button"],[role="complementary"]'
    ).forEach(n => {
      const text = (n.getAttribute('aria-label') || n.textContent || '').trim();
      if (FEEDBACK_RE.test(text)) n.remove();
    });
    // Also catch any leaf element whose sole text is the feedback prompt
    clone.querySelectorAll('*').forEach(n => {
      if (n.children.length === 0 && FEEDBACK_RE.test(n.textContent || '')) n.remove();
    });
  } catch (_) {}
  // Strip Copilot M365 UI chrome: role-label headings, logo, action bar containers
  try {
    clone.querySelectorAll([
      '[class*="accessibleHeading"]',           // h5/h6 "Copilot said:" / "You said:"
      '[data-testid="messageAttributionIcon"]', // Copilot logo
      '[data-testid="CopyButtonContainerTestId"]',  // "Provide your feedback on BizChat"
      '[data-testid="FeedbackContainerTestId"]',    // thumbs up/down container
      '[data-testid="feedback-button-testid"]',
      '[data-testid="CopyButtonTestId"]',
      '[data-testid="pages-split-button-primary"]',
      '[data-testid="pages-split-button-menu"]',
      '[data-testid="overflow-menu-button"]',
      '[data-testid="chat-response-message-disclaimer"]',
      // NOTE: do NOT strip loading-message — it contains the actual reply text
    ].join(', ')).forEach(n => n.remove());
  } catch (_) {}
  return clone;
}
