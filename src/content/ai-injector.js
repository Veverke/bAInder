/**
 * ai-injector.js — Inject comparison prompt into AI chat sites and auto-submit.
 *
 * Exports a single self-contained async function `injectPrompt`.  It is designed
 * to be serialised and executed inside the target AI tab via
 * `chrome.scripting.executeScript({ func: injectPrompt, args: [promptText] })`.
 *
 * IMPORTANT: This function MUST remain self-contained.
 * It cannot close over any module-level imports or outer-scope variables —
 * only its parameter and locally defined helpers are available after serialisation.
 */

/**
 * Inject `promptText` into the AI chat site's input, submit it, hide the echoed
 * user bubble, then scroll to the loading / spinner indicator.
 *
 * Resilience strategy: each site declares multiple independent CSS selector
 * strategies tried in order.  A selector that throws or matches nothing is
 * silently skipped.  For shadow-DOM sites (Gemini) a recursive deep-shadow query
 * is used so no brittle `::shadow` pseudo-selectors are needed.
 *
 * @param {string} promptText
 * @returns {Promise<{success: boolean, reason?: string}>}
 */
export async function injectPrompt(promptText, tabTitle) {

  // ── Internal helpers (all defined locally — survive serialisation) ────────

  // 0a. Persist the tab title every 500 ms for 10 s — SPA routers reset it.
  if (tabTitle) {
    document.title = tabTitle;
    const titleInterval = setInterval(() => { document.title = tabTitle; }, 500);
    setTimeout(() => clearInterval(titleInterval), 10000);
  }

  // 0b. Show a full-screen curtain for 2 s to hide injection + bubble removal.
  try {
    const kf = document.createElement('style');
    kf.textContent = '@keyframes __bi_spin{to{transform:rotate(360deg)}}';
    document.head.appendChild(kf);
    const curtain = document.createElement('div');
    curtain.id = '__bainder_curtain__';
    curtain.style.cssText = [
      'position:fixed', 'inset:0', 'z-index:2147483647',
      'background:#fafafa', 'opacity:1',
      'display:flex', 'align-items:center', 'justify-content:center',
      'transition:opacity 0.5s',
    ].join(';');
    const spinner = document.createElement('div');
    spinner.style.cssText = [
      'width:40px', 'height:40px', 'border-radius:50%',
      'border:4px solid #e5e7eb', 'border-top-color:#818cf8',
      'animation:__bi_spin 0.75s linear infinite',
    ].join(';');
    curtain.appendChild(spinner);
    document.body.appendChild(curtain);
    setTimeout(() => {
      curtain.style.opacity = '0';
      setTimeout(() => { curtain.remove(); kf.remove(); }, 600);
    }, 2000);
  } catch { /* ignore — page may not have body yet */ }

  /** Resolve after `ms` milliseconds. */
  const delay = ms => new Promise(r => setTimeout(r, ms));

  /** Styled console logger — visible in the target tab's DevTools. */
  const log = (...a) => console.log('%c[bAInder]', 'color:#818cf8;font-weight:bold', ...a);
  const warn = (...a) => console.warn('%c[bAInder]', 'color:#f59e0b;font-weight:bold', ...a);

  /**
   * Try each CSS selector in `selectors` against `root`; return the first
   * element matched, or null if none match (invalid selectors are skipped).
   */
  function trySelectors(selectors, root = document) {
    for (const sel of selectors) {
      try {
        const el = root.querySelector(sel);
        if (el) return el;
      } catch { /* bad selector — skip */ }
    }
    return null;
  }

  /**
   * Deep shadow-root query: tries `selectors` on `root`, then recursively
   * on every shadow root found anywhere in the subtree.
   * Returns the first element found, or null.
   */
  function shadowQuery(selectors, root = document) {
    const direct = trySelectors(selectors, root);
    if (direct) return direct;
    const nodes = root.querySelectorAll('*');
    for (const node of nodes) {
      if (node.shadowRoot) {
        const found = shadowQuery(selectors, node.shadowRoot);
        if (found) return found;
      }
    }
    return null;
  }

  /**
   * Find the *last* element matching any selector (user bubbles appear at the
   * bottom of a conversation; we want the freshly added one).
   */
  function trySelectorsLast(selectors, root = document) {
    for (const sel of selectors) {
      try {
        const els = [...root.querySelectorAll(sel)];
        if (els.length) return els[els.length - 1];
      } catch { /* skip */ }
    }
    return null;
  }

  /**
   * Like shadowQuery but collects ALL matches across all shadow roots and
   * returns the last one found.  Used for user-bubble removal where we want
   * the most recently added bubble (bottom of conversation), not the first.
   */
  function shadowQueryLast(selectors, root = document) {
    let last = null;
    // Plain DOM first
    for (const sel of selectors) {
      try {
        const els = [...root.querySelectorAll(sel)];
        if (els.length) last = els[els.length - 1];
      } catch { /* bad selector */ }
    }
    // Recurse into shadow roots
    const nodes = root.querySelectorAll('*');
    for (const node of nodes) {
      if (node.shadowRoot) {
        const found = shadowQueryLast(selectors, node.shadowRoot);
        if (found) last = found;
      }
    }
    return last;
  }

  /**
   * Escape plain text for safe HTML insertion and convert `\n` → `<br>`.
   * Used so contenteditable editors receive proper HTML line-break nodes
   * instead of raw `\n` characters (which most rich-text frameworks ignore).
   */
  function textToHtml(text) {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '<br>');
  }

  /**
   * Insert text into a `contenteditable` element using a four-layer fallback.
   * Newlines are always preserved via HTML `<br>` conversion where possible.
   *
   *   1. `insertHTML` execCommand  — converts \n→<br>; framework-aware
   *   2. `insertText` execCommand  — fallback for editors that reject HTML
   *   3. DataTransfer paste        — sets BOTH text/plain AND text/html so
   *                                  Angular / React pick up <br> line breaks
   *   4. Direct `innerHTML`        — last resort; always preserves newlines
   */
  function insertIntoContentEditable(el, text) {
    el.focus();

    const html = textToHtml(text);

    // Clear existing content first (graceful — shadow-DOM focus may vary)
    try {
      if (document.execCommand('selectAll', false, null)) {
        document.execCommand('delete', false, null);
      }
    } catch { /* ignore */ }

    // Layer 1: insertHTML — preserves \n as <br> in all contenteditable implementations
    try {
      const ok = document.execCommand('insertHTML', false, html);
      if (ok && el.textContent.trim().length > 0) return true;
    } catch { /* fall through */ }

    // Layer 2: insertText (plain, no HTML)
    try {
      const ok = document.execCommand('insertText', false, text);
      if (ok && el.textContent.trim().length > 0) return true;
    } catch { /* fall through */ }

    // Layer 3: DataTransfer paste — include text/html so rich-text editors
    // use <br> line breaks rather than stripping raw \n characters
    try {
      const dt = new DataTransfer();
      dt.setData('text/plain', text);
      dt.setData('text/html', `<div>${html}</div>`);
      el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
      if (el.textContent.trim().length > 0) return true;
    } catch { /* fall through */ }

    // Layer 4: direct innerHTML mutation — always preserves line breaks
    try {
      el.innerHTML = html;
      el.dispatchEvent(new Event('input',  { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return el.textContent.trim().length > 0;
    } catch { return false; }
  }

  /**
   * Insert text into a Lexical-managed editor (e.g. Perplexity).
   * Lexical rejects execCommand and direct innerHTML — clipboard paste is the
   * only reliable channel.  Returns true immediately because Lexical processes
   * paste events asynchronously via its own event handlers.
   */
  function insertIntoLexical(el, text) {
    el.focus();
    // Ctrl+A to select any existing placeholder content Lexical may own
    try {
      el.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'a', code: 'KeyA', ctrlKey: true, bubbles: true, cancelable: true,
      }));
    } catch { /* ignore */ }
    try {
      const dt = new DataTransfer();
      dt.setData('text/plain', text);
      el.dispatchEvent(new ClipboardEvent('paste', {
        clipboardData: dt, bubbles: true, cancelable: true,
      }));
      log('Lexical paste event dispatched');
      return true; // Lexical handles paste asynchronously
    } catch (e) {
      warn('Lexical paste failed', e);
      return false;
    }
  }

  /**
   * Insert text into a `<textarea>` or `<input>` using the native value setter
   * (bypasses React's synthetic event system) followed by dispatched events.
   */
  function insertIntoTextarea(el, text) {
    el.focus();
    try {
      const proto = el instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
      const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
      if (nativeSetter) {
        nativeSetter.call(el, text);
      } else {
        el.value = text;
      }
    } catch {
      el.value = text;
    }
    el.dispatchEvent(new Event('input',  { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  /** Programmatic click with a MouseEvent fallback. */
  function clickElement(el) {
    try { el.click(); return true; } catch { /* fall through */ }
    try {
      el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      return true;
    } catch { return false; }
  }

  /** Dispatch a complete Enter key sequence on `el`. */
  function pressEnter(el) {
    const base = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13,
                   bubbles: true, cancelable: true };
    el.dispatchEvent(new KeyboardEvent('keydown',  base));
    el.dispatchEvent(new KeyboardEvent('keypress', base));
    el.dispatchEvent(new KeyboardEvent('keyup',    base));
  }

  /**
   * Remove or CSS-hide the element.
   * `mode = 'remove'` — hard DOM removal (safe for non-React sites)
   * `mode = 'css'`    — visibility:hidden (safe for React/Lit — no vDOM corruption)
   */
  function removeBubble(el, mode = 'remove') {
    if (mode === 'css') {
      try {
        el.style.setProperty('visibility', 'hidden', 'important');
        el.style.setProperty('opacity', '0', 'important');
        el.style.setProperty('pointer-events', 'none', 'important');
        el.style.setProperty('max-height', '0', 'important');
        el.style.setProperty('overflow', 'hidden', 'important');
        el.setAttribute('aria-hidden', 'true');
        log('bubble CSS-hidden', el);
      } catch (e) { warn('bubble CSS-hide failed', e); }
      return;
    }
    // mode === 'remove'
    try {
      el.remove();
      log('bubble removed from DOM', el);
      return;
    } catch { /* fall through */ }
    // Fallback: visibility:hidden (keeps layout stable)
    try {
      el.style.setProperty('visibility', 'hidden', 'important');
      el.style.setProperty('opacity',    '0',       'important');
      el.style.setProperty('pointer-events', 'none', 'important');
      el.setAttribute('aria-hidden', 'true');
      log('bubble visibility-hidden (remove fallback)', el);
    } catch (e) { warn('bubble hide fallback failed', e); }
  }

  /**
   * Poll every 200 ms for up to `maxMs` ms to find and permanently remove the
   * user-message bubble.  Once found, a MutationObserver re-removes it if the
   * page framework (Angular, React, Lit) re-inserts the node.  Fire-and-forget
   * — do NOT await this.
   */
  function persistentlyHideBubble(selectors, useShadow, removeMode, stopOnNavigation, maxMs = 5000) {
    let observer = null;
    const start = Date.now();
    const initialUrl = location.href;
    log('persistentlyHideBubble started, mode:', removeMode, 'stopOnNavigation:', stopOnNavigation, 'selectors:', selectors);

    function hide(el) {
      removeBubble(el, removeMode);
      // Observe the closest available root for re-insertion
      if (observer) observer.disconnect();
      const root = (el.getRootNode && el.getRootNode() instanceof ShadowRoot)
        ? el.getRootNode()
        : document;
      observer = new MutationObserver(() => {
        const fresh = useShadow
          ? shadowQueryLast(selectors)
          : trySelectorsLast(selectors);
        if (fresh) { log('bubble re-appeared, re-hiding'); removeBubble(fresh, removeMode); }
      });
      try { observer.observe(root, { childList: true, subtree: true }); } catch { /* ignore */ }
    }

    const pollId = setInterval(() => {
      if (Date.now() - start >= maxMs) {
        warn('persistentlyHideBubble timed out without finding bubble');
        clearInterval(pollId);
        observer?.disconnect();
        return;
      }
      if (location.href !== initialUrl) {
        if (stopOnNavigation) {
          log('URL changed to', location.href, '— stopping bubble removal (stopOnNavigation=true)');
          clearInterval(pollId);
          observer?.disconnect();
          return;
        }
        log('URL changed to', location.href, '— continuing (stopOnNavigation=false)');
      }
      const el = useShadow
        ? shadowQueryLast(selectors)
        : trySelectorsLast(selectors);
      if (el) {
        log('bubble found by poll:', el);
        clearInterval(pollId);
        hide(el);
      }
    }, 200);

    // Hard stop — disconnect observer after maxMs regardless
    setTimeout(() => { clearInterval(pollId); observer?.disconnect(); log('persistentlyHideBubble hard-stopped'); }, maxMs);
  }

  // ── Site configuration ────────────────────────────────────────────────────

  /**
   * Each entry:
   *   match(hostname)   → boolean
   *   inputSelectors    → tried by trySelectors / shadowQuery
   *   inputType         → 'contenteditable' | 'textarea'
   *   sendSelectors     → tried for the send button
   *   userBubbleSelectors → selectors for the echoed user message element
   *   spinnerSelectors  → selectors for the loading / spinner indicator
   *   useShadow         → whether to use recursive shadow-DOM traversal
   */
  const SITES = [
    {
      name: 'chatgpt',
      match: h => /chatgpt\.com|chat\.openai\.com/.test(h),
      removeMode: 'css',  // React vDOM — never hard-remove managed nodes
      inputSelectors: [
        '#prompt-textarea',
        '[data-testid="prompt-textarea"]',
        'div[contenteditable="true"][data-id]',
        'div[contenteditable="true"][aria-label]',
        'form div[contenteditable="true"]',
        '[role="textbox"][contenteditable="true"]',
      ],
      sendSelectors: [
        '[data-testid="send-button"]',
        'button[aria-label="Send prompt"]',
        'button[aria-label*="Send"]',
        'button[aria-label*="send"]',
        'form button[type="button"]:last-of-type',
        'button[class*="send"]',
      ],
      userBubbleSelectors: [
        '[data-message-author-role="user"]',
        '[data-testid*="conversation-turn"][data-testid*="user"]',
        'article[class*="group"][class*="user"]',
        // generic last-resort: the last "turn" element
        '[data-testid^="conversation-turn-"]',
      ],
      spinnerSelectors: [
        '[data-testid="stop-button"]',
        'button[aria-label*="Stop"]',
        '.result-streaming',
        '[class*="streaming"]',
        '[class*="thinking"]',
      ],
      useShadow: false,
    },
    {
      name: 'gemini',
      match: h => /gemini\.google\.com/.test(h),
      removeMode: 'remove',  // Angular/Lit — safe to hard-remove
      // Shadow DOM — handled by shadowQuery
      inputSelectors: [
        '[contenteditable="true"][aria-label]',
        '[contenteditable="true"]',
        'rich-textarea [contenteditable]',
        '[role="textbox"]',
      ],
      sendSelectors: [
        'button[aria-label*="Send"]',
        'button[aria-label*="send"]',
        '[data-testid*="send"]',
        'button.send-button',
        'button[class*="send"]',
      ],
      userBubbleSelectors: [
        // Outer wrapper — the element we want to remove entirely
        '.user-query-container',
        'user-query-container',
        '[class*="user-query-container"]',
        // Custom element itself
        'user-query',
        '[class*="user-query"]',
        '[class*="UserQuery"]',
      ],
      spinnerSelectors: [
        'mat-progress-spinner',
        '.loading-indicator',
        '[class*="generating"]',
        'model-response:last-child',
        '[class*="typing"]',
      ],
      useShadow: true,
    },
    {
      name: 'copilot',
      match: h => /copilot\.microsoft\.com|m365\.cloud\.microsoft/.test(h),
      removeMode: 'css',          // React vDOM — never hard-remove managed nodes
      stopOnNavigation: false,    // Copilot SPA-navigates on submit; keep watching
      inputSelectors: [
        '[data-testid="composer-input"]',
        'textarea[aria-label*="message" i]',
        'div[contenteditable="true"][aria-multiline="true"]',
        'div[contenteditable="true"][aria-label]',
        '[placeholder*="message" i][contenteditable]',
        '[role="textbox"][contenteditable="true"]',
        'div[contenteditable="true"]',
      ],
      sendSelectors: [
        'button[aria-label*="Submit"]',
        'button[aria-label*="Send"]',
        '[data-testid*="send"]',
        '[data-testid*="submit"]',
        'button[type="submit"]',
        'button[class*="send"]',
      ],
      userBubbleSelectors: [
        // Confirmed Copilot attribute (most reliable)
        '[data-content="user-message"]',
        '[data-testid="user-message"]',
        '[class*="UserMessage"]',
        '[class*="user-message"]',
        '.user-turn',
        '[class*="userTurn"]',
      ],
      spinnerSelectors: [
        // Stop button that Copilot renders while generating (most reliable)
        'button[aria-label="Stop responding"]',
        'button[aria-label*="Stop"]',
        '[data-testid="stop-responding-button"]',
        '[data-testid*="stop"]',
        // Streaming / thinking indicators
        '[class*="TypingIndicator"]',
        '[class*="typing-indicator"]',
        '[class*="typing"]',
        '[class*="generating"]',
        '[class*="streaming"]',
        // Last AI response tile appearing in the list
        '[data-testid*="response"]:last-child',
        '[class*="AIMessage"]:last-child',
        '[class*="ai-message"]:last-child',
      ],
      useShadow: false,
    },
    {
      name: 'perplexity',
      match: h => /perplexity\.ai/.test(h),
      removeMode: 'css',          // Next.js/React — never hard-remove managed nodes
      stopOnNavigation: false,    // Perplexity SPA-navigates to /search/[id] on submit
      inputSelectors: [
        // Confirmed selectors for current Perplexity interface
        '#ask-input',
        '#ask-input [contenteditable]',
        // Generic contenteditable fallbacks
        'div[contenteditable="true"][aria-multiline="true"]',
        '[contenteditable="true"][aria-label]',
        'div[contenteditable="true"]',
        '[role="textbox"][contenteditable="true"]',
        // Textarea fallbacks (legacy / search mode)
        'textarea[placeholder*="Ask"]',
        'textarea[placeholder*="ask" i]',
        '[data-testid*="search"] textarea',
        'form textarea',
        'textarea',
        '[role="textbox"]',
      ],
      sendSelectors: [
        'button[aria-label="Submit"]',
        'button[aria-label*="Submit"]',
        'button[aria-label*="submit"]',
        '[data-testid*="send"]',
        '[data-testid*="submit"]',
        'button[type="submit"]',
        'form button:last-of-type',
      ],
      userBubbleSelectors: [
        // Confirmed selector — catches only the user prompt container
        '[class*="query"]',
        '[class*="UserMessage"]',
        '[class*="user-message"]',
        '[class*="Question"]',
      ],
      spinnerSelectors: [
        '[class*="loading"]',
        '[class*="spinner"]',
        '[class*="generating"]',
        '[aria-label*="loading" i]',
        '[class*="thinking"]',
      ],
      useShadow: false,
    },
  ];

  // ── Dispatch ──────────────────────────────────────────────────────────────

  const hostname = window.location.hostname;
  const site = SITES.find(s => s.match(hostname));
  if (!site) {
    warn('unrecognised site:', hostname);
    return { success: false, reason: `unrecognised site: ${hostname}` };
  }
  log('matched site:', site.name, '| hostname:', hostname);

  // 1. Find input element
  const input = site.useShadow
    ? shadowQuery(site.inputSelectors)
    : trySelectors(site.inputSelectors);
  log('input element:', input ?? 'NOT FOUND', input ? `tag=${input.tagName} contentEditable=${input.isContentEditable}` : '');
  if (!input) {
    return { success: false, reason: 'input not found' };
  }

  // 2. Inject text — detect Lexical editors (Perplexity etc.) which reject
  //    execCommand and need clipboard paste; otherwise auto-detect by isContentEditable.
  const isLexical = input.hasAttribute('data-lexical-editor') ||
    !!input.closest('[data-lexical-editor]');
  const injected = isLexical
    ? insertIntoLexical(input, promptText)
    : input.isContentEditable
      ? insertIntoContentEditable(input, promptText)
      : insertIntoTextarea(input, promptText);
  log('inject result:', injected, isLexical ? '(Lexical path)' : '');
  if (!injected) {
    return { success: false, reason: 'inject failed' };
  }

  // Fire a React-compatible InputEvent so framework-managed send buttons
  // (e.g. ChatGPT) recognise the new content and become enabled.
  try {
    input.dispatchEvent(new InputEvent('input', {
      bubbles: true, cancelable: true, inputType: 'insertText',
    }));
    log('InputEvent dispatched');
  } catch { /* ignore */ }

  await delay(300);

  // 3. Submit: sites with preferEnter go straight to keyboard Enter (search-box
  //    UIs like Perplexity); otherwise click the send button and wait for it to
  //    become active, falling back to Enter if not found.
  const sendBtn = (!site.preferEnter && (site.useShadow
    ? shadowQuery(site.sendSelectors)
    : trySelectors(site.sendSelectors))) || null;
  log('sendBtn:', sendBtn ?? 'NOT FOUND', sendBtn ? `disabled=${sendBtn.disabled} aria-disabled=${sendBtn.getAttribute('aria-disabled')}` : '', 'preferEnter:', !!site.preferEnter);
  if (sendBtn) {
    // Some sites (e.g. ChatGPT) enable the send button asynchronously after
    // the input event is processed — wait up to 2 s for it to become active.
    for (let i = 0; i < 20 && (sendBtn.disabled || sendBtn.getAttribute('aria-disabled') === 'true'); i++) {
      await delay(100);
    }
    log('clicking sendBtn, disabled now:', sendBtn.disabled);
    clickElement(sendBtn);
  } else {
    // Enter key — primary for search-box UIs, fallback when button not found.
    log('pressing Enter on input');
    pressEnter(input);
  }

  // 4. Persistently remove the echoed user bubble for up to 5 s.
  log('starting persistentlyHideBubble, removeMode:', site.removeMode ?? 'remove', 'stopOnNavigation:', site.stopOnNavigation ?? true);
  persistentlyHideBubble(site.userBubbleSelectors, site.useShadow, site.removeMode ?? 'remove', site.stopOnNavigation ?? true, 5000);

  log('injectPrompt complete — returning success');
  return { success: true };
}
