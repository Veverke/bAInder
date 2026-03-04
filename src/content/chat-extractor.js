/**
 * bAInder Chat Extractor
 * Stage 6: Content Script - Chat Detection & Extraction
 *
 * Pure functions for extracting chat content from AI platforms.
 * Designed as an ES module for testability; content.js inlines the same logic.
 *
 * Supported platforms:
 *   - ChatGPT (chat.openai.com)
 *   - Claude  (claude.ai)
 *   - Gemini  (gemini.google.com)
 *   - Copilot (copilot.microsoft.com → redirects to m365.cloud.microsoft/chat)
 */

import { messagesToMarkdown } from '../lib/markdown-serialiser.js';

// ─── Platform Detection ──────────────────────────────────────────────────────

/**
 * Detect the AI platform from a hostname.
 * @param {string} hostname
 * @returns {'chatgpt'|'claude'|'gemini'|'copilot'|null}
 */
export function detectPlatform(hostname) {
  if (!hostname || typeof hostname !== 'string') return null;
  const h = hostname.toLowerCase();
  if (h.includes('chat.openai.com') || h.includes('chatgpt.com')) return 'chatgpt';
  if (h.includes('claude.ai'))         return 'claude';
  if (h.includes('gemini.google.com')) return 'gemini';
  if (h.includes('copilot.microsoft.com') || h.includes('m365.cloud.microsoft')) return 'copilot';
  return null;
}

// ─── Content Sanitisation ────────────────────────────────────────────────────

/**
 * Strip HTML tags and normalise whitespace from a string.
 * @param {string} input
 * @returns {string}
 */
export function sanitizeContent(input) {
  if (!input || typeof input !== 'string') return '';
  // Remove HTML tags
  const stripped = input.replace(/<[^>]*>/g, ' ');
  // Decode HTML entities
  const decoded = stripped
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
  // Normalise whitespace
  return decoded.replace(/\s+/g, ' ').trim();
}

/**
 * Get text content from a DOM element, normalising whitespace.
 * Used only for plain-text contexts (title generation, fallbacks).
 * @param {Element|null} el
 * @returns {string}
 */
export function getTextContent(el) {
  if (!el) return '';
  return sanitizeContent(el.innerHTML || el.textContent || '');
}

/**
 * Convert a DOM element's content to Markdown, preserving structure.
 * Handles: headings, bold/italic, inline code, fenced code blocks,
 * ordered/unordered lists, blockquotes, paragraphs, line breaks, links.
 * Skips: script, style, svg, button, aria-hidden elements.
 *
 * @param {Element|null} el
 * @returns {string}  Markdown string
 */
export function htmlToMarkdown(el) {
  if (!el) return '';

  function walk(node) {
    // Text node — return its content, normalising non-breaking spaces
    if (node.nodeType === 3 /* TEXT_NODE */) {
      return (node.textContent || '').replace(/\u00a0/g, ' ');
    }
    if (node.nodeType !== 1 /* ELEMENT_NODE */) return '';

    // Skip decorative / hidden nodes
    if (node.getAttribute('aria-hidden') === 'true') return '';

    const tag = node.tagName.toLowerCase();
    if (['script', 'style', 'svg', 'noscript', 'button', 'template'].includes(tag)) return '';

    // ── M365 Copilot / Fluent UI code block ──────────────────────────────────
    // Rendered without <pre>/<code> — detected by ARIA label or scriptor class.
    {
      const ariaLabel = node.getAttribute('aria-label') || '';
      const nodeClass = typeof node.className === 'string' ? node.className : '';
      if (ariaLabel === 'Code Preview' || nodeClass.includes('scriptor-component-code-block')) {
        const SKIP = new Set(['button','script','style','svg','path','noscript','template','img']);
        const BLOCK = new Set(['div','p','li','tr','section','article','header','footer','pre']);
        const KNOWN_LANG = /^(javascript|typescript|python|java|c#|csharp|c\+\+|cpp|ruby|go|rust|css|scss|html|xml|json|bash|shell|sh|sql|php|swift|kotlin|scala|r|matlab|yaml|toml|markdown)$/i;
        const extractRaw = n => {
          if (n.nodeType === 3) return n.textContent || '';
          if (n.nodeType !== 1) return '';
          if (SKIP.has(n.tagName.toLowerCase())) return '';
          if (n.getAttribute && n.getAttribute('aria-hidden') === 'true') return '';
          const t = BLOCK.has(n.tagName.toLowerCase());
          const inner = Array.from(n.childNodes).map(extractRaw).join('');
          return t ? inner + '\n' : inner;
        };
        const raw = extractRaw(node).replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n').trim();
        const lines = raw.split('\n');
        let lang = '', start = 0;
        if (lines.length > 0 && KNOWN_LANG.test(lines[0].trim())) {
          lang = lines[0].trim().toLowerCase().replace('c#', 'csharp').replace('c++', 'cpp');
          start = 1;
        }
        const code = lines.slice(start).join('\n').trim();
        return code ? `\n\`\`\`${lang}\n${code}\n\`\`\`\n` : '';
      }
    }

    // Build inner content first (needed by most cases)
    const inner = Array.from(node.childNodes).map(walk).join('');

    switch (tag) {
      // ── Headings ─────────────────────────────────────────────────────────
      // Skip headings that are purely Copilot/M365 role labels ("You said:", "Copilot said:").
      // These are UI chrome injected into the message DOM element, not actual content.
      case 'h1': case 'h2': case 'h3': case 'h4': case 'h5': case 'h6': {
        const t = inner.trim();
        if (/^(you said|i said|copilot said|copilot):?\s*$/i.test(t)) return '';
        const level = parseInt(tag[1], 10);
        return `\n${'#'.repeat(level)} ${t}\n`;
      }

      // ── Inline formatting ─────────────────────────────────────────────────
      case 'strong': case 'b': {
        const t = inner.trim();
        return t ? `**${t}**` : '';
      }
      case 'em': case 'i': {
        const t = inner.trim();
        return t ? `*${t}*` : '';
      }

      // ── Code ──────────────────────────────────────────────────────────────
      case 'code': {
        // Inside <pre> — let pre handler wrap in fences
        if (node.parentElement && node.parentElement.tagName.toLowerCase() === 'pre') {
          return node.textContent || '';
        }
        // Multi-line standalone <code> (no <pre> wrapper) → fenced block
        const rawText = node.textContent || '';
        if (rawText.includes('\n')) {
          const lang = ((node.className || '').match(/language-(\S+)/) || [])[1] || '';
          return `\n\`\`\`${lang}\n${rawText.trimEnd()}\n\`\`\`\n`;
        }
        const t = inner.trim();
        return t ? `\`${t}\`` : '';
      }
      case 'pre': {
        const codeEl = node.querySelector('code');
        // Language: check <code class="language-*"> first, then parent class
        // (e.g., GitHub-style <div class="highlight-source-python"><pre>…</pre></div>)
        const langFromCode   = codeEl ? ((codeEl.className || '').match(/language-(\S+)/) || [])[1] || '' : '';
        const parentClass    = node.parentElement ? (node.parentElement.className || '') : '';
        const langFromParent = (parentClass.match(/(?:highlight-source|language)[- ](\w+)/i) || [])[1] || '';
        const lang = langFromCode || langFromParent;
        const code = (codeEl ? codeEl.textContent : node.textContent) || '';
        return `\n\`\`\`${lang}\n${code.trimEnd()}\n\`\`\`\n`;
      }

      // ── Lists ─────────────────────────────────────────────────────────────
      case 'ul': {
        const items = Array.from(node.childNodes)
          .filter(n => n.nodeType === 1 && n.tagName.toLowerCase() === 'li')
          .map(li => `- ${walk(li).trim()}`)
          .join('\n');
        return items ? `\n${items}\n` : '';
      }
      case 'ol': {
        const lis = Array.from(node.childNodes)
          .filter(n => n.nodeType === 1 && n.tagName.toLowerCase() === 'li');
        const items = lis.map((li, i) => `${i + 1}. ${walk(li).trim()}`).join('\n');
        return items ? `\n${items}\n` : '';
      }
      case 'li': return inner;

      // ── Block elements ────────────────────────────────────────────────────
      case 'p': {
        const t = inner.trim();
        return t ? `\n${t}\n` : '';
      }
      case 'br': return '\n';
      case 'hr': return '\n---\n';
      case 'blockquote': {
        const t = inner.trim().split('\n').map(l => `> ${l}`).join('\n');
        return `\n${t}\n`;
      }

      // ── Anchor ────────────────────────────────────────────────────────────
      case 'a': {
        const href = node.getAttribute('href');
        const text = inner.trim();
        return href && text ? `[${text}](${href})` : text;
      }      // ── Image ─────────────────────────────────────────────────
      case 'img': {
        const src = node.getAttribute('src') || '';
        // Keep data: and https:// images; skip blob: (session-only) and empty.
        if (!src || src.startsWith('blob:')) return '';
        const alt = (node.getAttribute('alt') || '').trim().replace(/\n/g, ' ');
        return `\n![${alt}](${src})\n`;
      }
      // ── Microsoft Designer iframe (M365 Copilot generated images) ─────────
      case 'iframe': {
        const ariaLbl = node.getAttribute('aria-label') || '';
        const iframeName = node.getAttribute('name') || '';
        if (ariaLbl === 'Microsoft Designer' || iframeName === 'Microsoft Designer') {
          const iSrc = node.getAttribute('src') || '';
          if (iSrc) {
            try {
              const u = new URL(iSrc);
              for (const [k, v] of u.searchParams) {
                if (/image|asset|media|url/i.test(k) && /^https?:\/\//.test(v)) {
                  return `\n![Generated image](${v})\n`;
                }
              }
            } catch (_) {}
            return `\n[Microsoft Designer generated image](${iSrc})\n`;
          }
          return '\n[Microsoft Designer generated image]\n';
        }
        return inner;
      }
      // ── Everything else (div, span, section, article, …) ─────────────────
      case 'div': case 'section': case 'article': case 'aside': case 'main': case 'header': case 'footer': {
        // If this div's only meaningful child is a <pre>, pass straight through
        // so the code block isn't lost inside a wrapper div.
        const significantChildren = Array.from(node.children)
          .filter(c => !['button','script','style','svg','template'].includes(c.tagName.toLowerCase()));
        if (significantChildren.length === 1 && significantChildren[0].tagName.toLowerCase() === 'pre') {
          return walk(significantChildren[0]);
        }
        // Skip code-block decoration elements (language label bars, copy-code toolbars).
        // Heuristic: a <div> whose parent also has a <pre> sibling, but which
        // itself has no <pre>/<code> descendants, is header/toolbar chrome.
        if (node.parentElement) {
          const siblingHasPre = Array.from(node.parentElement.children)
            .some(c => c !== node && c.tagName.toLowerCase() === 'pre');
          if (siblingHasPre && !node.querySelector('pre, code')) return '';
        }
        // Treat as block: wrap in newlines so lines don't concatenate.
        const bt = inner.trim();
        return bt ? `\n${bt}\n` : '';
      }
      default: {
        // Inline elements (span, etc.) — skip code-block toolbar spans.
        if (tag === 'span' && node.parentElement) {
          const siblingHasPre = Array.from(node.parentElement.children)
            .some(c => c !== node && c.tagName.toLowerCase() === 'pre');
          if (siblingHasPre && !node.querySelector('pre, code')) return '';
        }
        return inner;
      }
    }
  }

  return walk(el)
    .replace(/\n{3,}/g, '\n\n')   // collapse runs of 3+ newlines → 2
    .trim();
}

// ─── Title Generation ────────────────────────────────────────────────────────

/**
 * Generate a chat title from the message array or fall back to URL / default.
 * @param {Array<{role:string, content:string}>} messages
 * @param {string} [url]
 * @returns {string}
 */
export function generateTitle(messages, url) {
  // Strategy 1: first complete sentence (ending with . ? !) from the user's first message.
  // Strip markdown artefacts since content is stored as markdown after htmlToMarkdown.
  const firstUser = messages.find(m => m.role === 'user');
  if (firstUser && firstUser.content) {
    // Role labels (e.g. "You said:") that survive extraction are meaningless as titles.
    const ROLE_LABEL_RE = /^(you said|i said|copilot said|copilot):?\s*$/i;
    const firstLine = firstUser.content
      .split('\n')
      .map(l => l
        .replace(/^#{1,6}\s+/, '')          // strip ATX heading markers
        .replace(/\*\*(.+?)\*\*/g, '$1')    // strip bold
        .replace(/\*(.+?)\*/g, '$1')        // strip italic
        .replace(/`([^`]*)`/g, '$1')        // strip inline code
        .trim()
      )
      .filter(l => l.length > 0 && !ROLE_LABEL_RE.test(l))
      [0] || '';
    if (firstLine) {
      // Try to extract the first complete sentence
      const sentenceMatch = firstLine.match(/^(.+?[.?!])\s/);
      if (sentenceMatch && sentenceMatch[1].length >= 8) return sentenceMatch[1].trim();
      // Otherwise return the full cleaned first line
      return firstLine;
    }
  }

  // Strategy 3: URL-derived name
  if (url) {
    try {
      const u = new URL(url);
      const parts = u.pathname.split('/').filter(Boolean);
      if (parts.length > 0) {
        const last = parts[parts.length - 1];
        if (last && last !== 'c' && last.length > 3) {
          return `Chat ${last.slice(0, 40)}`;
        }
      }
    } catch (_) { /* ignore invalid URLs */ }
  }

  return 'Untitled Chat';
}

// ─── Message Formatting ──────────────────────────────────────────────────────

/**
 * Create a normalised message object.
 * @param {'user'|'assistant'|'system'} role
 * @param {string} content
 * @returns {{role: string, content: string}}
 */
export function formatMessage(role, content) {
  return {
    role: role || 'unknown',
    content: (content || '').trim()
  };
}

// ─── Source Link Extraction ──────────────────────────────────────────────────

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

/**
 * Clone `el` and remove source/citation containers (and source-labelled buttons)
 * so that htmlToMarkdown does not render them as content.
 * Links are extracted separately by extractSourceLinks on the ORIGINAL element.
 * @param {Element} el
 * @returns {Element}
 */
function stripSourceContainers(el) {
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

// ─── Platform Extractors ─────────────────────────────────────────────────────

/**
 * Extract messages from a ChatGPT conversation page.
 *
 * ChatGPT DOM (as of 2025/2026):
 *   Each turn:  article[data-testid^="conversation-turn"]
 *   Role attr:  [data-message-author-role]
 *   Content:    .markdown, .text-base, or direct text nodes
 *
 * @param {Document} doc
 * @returns {{title: string, messages: Array, messageCount: number}}
 */
export function extractChatGPT(doc) {
  if (!doc) throw new Error('Document is required');

  const messages = [];

  // Primary selector – role is stored on a child element inside the article
  const turns = doc.querySelectorAll('article[data-testid^="conversation-turn"]');

  turns.forEach(turn => {
    const roleEl = turn.querySelector('[data-message-author-role]');
    if (!roleEl) return;

    const rawRole = roleEl.getAttribute('data-message-author-role') || '';
    const role = rawRole === 'user' ? 'user' : 'assistant';

    // Try .markdown first (richer content), fall back to innerText
    const contentEl =
      turn.querySelector('.markdown') ||
      turn.querySelector('[class*="prose"]') ||
      turn.querySelector('[class*="whitespace-pre"]') ||
      roleEl;

    const processEl = role === 'assistant' ? stripSourceContainers(contentEl) : contentEl;
    let content = htmlToMarkdown(processEl);
    if (role === 'assistant') content += extractSourceLinks(turn, contentEl);
    if (content) messages.push(formatMessage(role, content));
  });

  // Fallback: role attribute on the turn article itself
  if (messages.length === 0) {
    const fallbackTurns = doc.querySelectorAll('[data-message-author-role]');
    fallbackTurns.forEach(el => {
      const role = el.getAttribute('data-message-author-role') === 'user' ? 'user' : 'assistant';
      const processEl = role === 'assistant' ? stripSourceContainers(el) : el;
      const content = htmlToMarkdown(processEl);
      if (content) messages.push(formatMessage(role, content));
    });
  }

  const title = generateTitle(messages, doc.location?.href || '');
  return { title, messages, messageCount: messages.length };
}

/**
 * Extract messages from a Claude conversation page.
 *
 * Claude DOM (as of 2025/2026):
 *   Human turns:   [data-testid="human-turn"]    or .human-turn
 *   AI turns:      [data-testid="ai-turn"]        or .ai-turn
 *   Content lives inside those containers.
 *
 * @param {Document} doc
 * @returns {{title: string, messages: Array, messageCount: number}}
 */
export function extractClaude(doc) {
  if (!doc) throw new Error('Document is required');

  const messages = [];

  // Collect all turn elements in document order
  const humanTurns = Array.from(
    doc.querySelectorAll('[data-testid="human-turn"], .human-turn, .human-message')
  );
  const aiTurns = Array.from(
    doc.querySelectorAll('[data-testid="ai-turn"], .ai-turn, .ai-message, .bot-turn')
  );

  // Build a combined list ordered by DOM position
  const allTurns = [
    ...humanTurns.map(el => ({ el, role: 'user' })),
    ...aiTurns.map(el => ({ el, role: 'assistant' }))
  ].sort((a, b) => {
    const pos = a.el.compareDocumentPosition(b.el);
    return pos & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
  });

  allTurns.forEach(({ el, role }) => {
    const processEl = role === 'assistant' ? stripSourceContainers(el) : el;
    let content = htmlToMarkdown(processEl);
    if (role === 'assistant') content += extractSourceLinks(el);
    if (content) messages.push(formatMessage(role, content));
  });

  const title = generateTitle(messages, doc.location?.href || '');
  return { title, messages, messageCount: messages.length };
}

/**
 * Extract messages from a Gemini conversation page.
 *
 * Gemini DOM (as of 2025/2026):
 *   User queries:      .user-query-content,  .query-text,   [class*="user-query"]
 *   Model responses:   .model-response-text, .response-text,[class*="model-response"]
 *
 * @param {Document} doc
 * @returns {{title: string, messages: Array, messageCount: number}}
 */
export function extractGemini(doc) {
  if (!doc) throw new Error('Document is required');

  const messages = [];

  // Collect all elements in document order.
  // removeDescendants filters out any element whose ancestor also matched the
  // selector — e.g. an outer "user-query-container" wrapper that is caught by
  // [class*="user-query"] in addition to the inner "user-query-content" child.
  // Without this, Gemini pages produce duplicate user messages.
  const userEls = removeDescendants(Array.from(
    doc.querySelectorAll('.user-query-content, .query-text, [class*="user-query"]')
  ));
  const modelEls = removeDescendants(Array.from(
    doc.querySelectorAll('.model-response-text, .response-text, [class*="model-response"]')
  ));

  const allEls = [
    ...userEls.map(el => ({ el, role: 'user' })),
    ...modelEls.map(el => ({ el, role: 'assistant' }))
  ].sort((a, b) => {
    const pos = a.el.compareDocumentPosition(b.el);
    return pos & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
  });

  allEls.forEach(({ el, role }) => {
    const processEl = role === 'assistant' ? stripSourceContainers(el) : el;
    let content = htmlToMarkdown(processEl);
    if (role === 'assistant') content += extractSourceLinks(el);
    if (content) messages.push(formatMessage(role, content));
  });

  const title = generateTitle(messages, doc.location?.href || '');
  return { title, messages, messageCount: messages.length };
}

// ─── Copilot Extraction Helpers ─────────────────────────────────────────────────────

/**
 * Remove elements that are descendants of another element in the same list.
 * Prevents nested DOM nodes (all matching a selector) from producing duplicate turns.
 * @param {Element[]} els
 * @returns {Element[]}
 */
function removeDescendants(els) {
  return els.filter(el => !els.some(other => other !== el && other.contains(el)));
}

/**
 * Strip Copilot UI role-label lines ("You said:", "Copilot said:") and
 * BizChat / M365 feedback UI noise from extracted markdown content.
 * @param {string} content
 * @returns {string}
 */
const _LABEL_RE    = /^#{0,6}\s*(you said|i said|copilot said|copilot):?\s*$/i;
const _UI_NOISE_RE = /^(provide your feedback on (bizchat|copilot|m365|microsoft 365|bing)|was this (response|answer) helpful\??|helpful\s*not helpful|thumbs up|thumbs down|report a concern|give feedback|feedback on this response|like\s*dislike)\s*$/i;
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

/**
 * Extract messages from a GitHub Copilot conversation page.
 *
 * Copilot DOM (copilot.microsoft.com / m365.cloud.microsoft/chat, as of 2025/2026):
 *   User messages:      [data-testid="user-message"],  .UserMessage,  [class*="UserMessage"]
 *   Copilot responses:  [data-testid="copilot-message"],[class*="CopilotMessage"],
 *                       [data-testid="assistant-message"],[class*="AssistantMessage"],
 *                       .markdown-body (inside a copilot turn container)
 *
 * @param {Document} doc
 * @returns {{title: string, messages: Array, messageCount: number}}
 */
export function extractCopilot(doc) {
  if (!doc) throw new Error('Document is required');

  const messages = [];

  // Scope to the main conversation area so sidebar history items
  // (which may share the same class patterns) are not included.
  const chatScope =
    doc.querySelector('main') ||
    doc.querySelector('[role="main"]') ||
    doc.querySelector('[class*="conversation"][class*="container"]') ||
    doc;

  // Predicate: true when an element is inside a history side-panel / nav drawer.
  // On Copilot these are typically <aside> or [role="complementary"] elements.
  const inHistoryPanel = el =>
    !!el.closest('aside, [role="complementary"], [role="navigation"], [class*="history"], [class*="sidebar"]');

  const rawUserEls = Array.from(
    chatScope.querySelectorAll(
      '[data-testid="user-message"], .UserMessage, [class*="UserMessage"], [class*="user-message"]'
    )
  ).filter(el => !inHistoryPanel(el));

  const rawCopilotEls = Array.from(
    chatScope.querySelectorAll(
      '[data-testid="copilot-message"], [data-testid="assistant-message"], ' +
      '[class*="CopilotMessage"], [class*="AssistantMessage"], [class*="copilot-message"]'
    )
  ).filter(el => !inHistoryPanel(el));

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

  allEls.forEach(({ el, role }) => {
    // Strip any Copilot UI role-label headings (“You said:”, “Copilot said:”).
    const processEl = role === 'assistant' ? stripSourceContainers(el) : el;
    let content = stripRoleLabels(htmlToMarkdown(processEl));
    if (role === 'assistant') content += extractSourceLinks(el);
    if (content) messages.push(formatMessage(role, content));
  });

  const title = generateTitle(messages, doc.location?.href || '');
  return { title, messages, messageCount: messages.length };
}

export function extractChat(platform, doc, url) {
  if (!platform) throw new Error('Platform is required');
  if (!doc)      throw new Error('Document is required');

  let result;

  switch (platform) {
    case 'chatgpt':
      result = extractChatGPT(doc);
      break;
    case 'claude':
      result = extractClaude(doc);
      break;
    case 'gemini':
      result = extractGemini(doc);
      break;
    case 'copilot':
      result = extractCopilot(doc);
      break;
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }

  const finalUrl = url || (doc.location && doc.location.href) || '';

  return {
    platform,
    url: finalUrl,
    title: result.title,
    messages: result.messages,
    messageCount: result.messageCount,
    extractedAt: Date.now()
  };
}

/**
 * Format extracted chat data for saving (adds content summary).
 * @param {{platform:string, url:string, title:string, messages:Array, messageCount:number, extractedAt:number}} chatData
 * @returns {Object}  Ready to send to background.js / storage
 */
export function prepareChatForSave(chatData) {
  if (!chatData) throw new Error('Chat data is required');

  const content = messagesToMarkdown(chatData.messages, {
    title:        chatData.title,
    source:       chatData.platform,
    url:          chatData.url,
    timestamp:    chatData.extractedAt,
    messageCount: chatData.messageCount,
  });

  return {
    title:        chatData.title,
    content,
    url:          chatData.url,
    source:       chatData.platform,
    messageCount: chatData.messageCount,
    messages:     chatData.messages,
    metadata: {
      extractedAt:   chatData.extractedAt,
      messageCount:  chatData.messageCount,
      contentFormat: 'markdown-v1',
    }
  };
}
