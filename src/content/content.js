/**
 * bAInder Content Script
 * Stage 6: Content Script - Chat Detection & Extraction
 *
 * Injected into ChatGPT, Claude, and Gemini pages.
 * Detects platform, extracts chat content, injects "Save to bAInder" button.
 *
 * NOTE: Chrome content scripts cannot use ES module imports.
 * The extraction logic is inlined from src/content/chat-extractor.js.
 * When Vite bundling is added in a future stage this file will be the entry
 * point and will use `import` instead of the inline copies below.
 */

(function bAInderContentScript() {
  'use strict';

  // Prevent double-injection (e.g. if content script runs twice)
  if (window.__bAInderInjected) return;
  window.__bAInderInjected = true;

  // ─── Microsoft Designer postMessage interceptor ───────────────────────────
  // Designer (cross-origin iframe) sends postMessages to M365 when image
  // generation completes.  We screenshot the tab on ImageGenerated and crop
  // to the iframe rect so the image survives as a real <img> when chat is saved.
  window.__bAInderDesignerImages = window.__bAInderDesignerImages || {};

  /**
   * Scroll a Designer iframe into the center of the viewport, wait for the
   * browser to repaint, capture a screenshot, crop to the iframe bounds, then
   * restore the original scroll position.  Returns a Promise that resolves
   * with the data URL (or null on failure).
   */
  async function captureDesignerIframe(iframeid, iframe) {
    if (!chrome?.runtime?.sendMessage) return null;
    if (!iframe || iframe.offsetWidth < 10) return null;

    // Remember where we were so we can scroll back afterwards
    const scrollEl  = document.scrollingElement || document.documentElement;
    const savedTop  = scrollEl.scrollTop;
    const savedLeft = scrollEl.scrollLeft;

    // Scroll the iframe to the center of the viewport instantly
    iframe.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'center' });

    // Wait two animation frames: one for the scroll to apply, one for the
    // browser to composite the WebGL frame at its new on-screen position
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

    const rect = iframe.getBoundingClientRect();
    if (rect.width < 10 || rect.height < 10) {
      scrollEl.scrollTo({ top: savedTop, left: savedLeft, behavior: 'instant' });
      return null;
    }

    return new Promise(resolve => {
      try {
        chrome.runtime.sendMessage({
          type: 'CAPTURE_DESIGNER_IMAGE',
          iframeid,
          rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
          dpr:  window.devicePixelRatio || 1
        }, (response) => {
          // Restore scroll position regardless of outcome
          scrollEl.scrollTo({ top: savedTop, left: savedLeft, behavior: 'instant' });
          if (chrome.runtime?.lastError || !response?.dataUrl) { resolve(null); return; }
          window.__bAInderDesignerImages[iframeid] = response.dataUrl;
          console.log('[bAInder] Captured Designer image for', iframeid,
            '(' + Math.round(rect.width) + 'x' + Math.round(rect.height) + ')');
          resolve(response.dataUrl);
        });
      } catch (_) {
        scrollEl.scrollTo({ top: savedTop, left: savedLeft, behavior: 'instant' });
        resolve(null);
      }
    });
  }

  window.addEventListener('message', function bAInderDesignerMsg(e) {
    if (!e.origin || !e.origin.includes('designer.svc.cloud.microsoft')) return;
    let data;
    try { data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data; } catch (_) { return; }
    if (!data || typeof data !== 'object') return;

    // Designer sends this once the image has finished rendering in its WebGL canvas.
    if (data.type === 'designer_telemetry_event' &&
        data.data && data.data.eventName === 'ImageGenerated' &&
        data.data.success) {
      const iframeid = data.iframeid;
      if (!iframeid) return;

      // Find the iframe by matching the iframeid in its src URL
      const iframes = document.querySelectorAll(
        'iframe[name="Microsoft Designer"], iframe[aria-label="Microsoft Designer"]'
      );
      let targetIframe = null;
      for (const iframe of iframes) {
        try {
          const u = new URL(iframe.src);
          if (u.searchParams.get('iframeid') === iframeid) { targetIframe = iframe; break; }
        } catch (_) {}
      }
      if (!targetIframe) return;

      // Scroll into view so the iframe is on-screen for the screenshot
      captureDesignerIframe(iframeid, targetIframe);
    }
  });

  // ─── Inlined extraction helpers (mirrors chat-extractor.js) ───────────────

  function detectPlatform(hostname) {
    if (!hostname || typeof hostname !== 'string') return null;
    const h = hostname.toLowerCase();
    if (h.includes('chat.openai.com'))    return 'chatgpt';
    if (h.includes('claude.ai'))          return 'claude';
    if (h.includes('gemini.google.com'))  return 'gemini';
    if (h.includes('copilot.microsoft.com') || h.includes('m365.cloud.microsoft')) return 'copilot';
    return null;
  }

  function sanitizeContent(input) {
    if (!input || typeof input !== 'string') return '';
    const stripped = input.replace(/<[^>]*>/g, ' ');
    const decoded = stripped
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ');
    return decoded.replace(/\s+/g, ' ').trim();
  }

  function getTextContent(el) {
    if (!el) return '';
    return sanitizeContent(el.innerHTML || el.textContent || '');
  }

  // Convert a DOM element to Markdown, preserving headings, lists, code, bold/italic.
  function htmlToMarkdown(el) {
    if (!el) return '';
    function walk(node) {
      if (node.nodeType === 3) return (node.textContent || '').replace(/\u00a0/g, ' ');
      if (node.nodeType !== 1) return '';
      if (node.getAttribute && node.getAttribute('aria-hidden') === 'true') return '';
      const tag = node.tagName.toLowerCase();
      if (['script','style','svg','noscript','button','template'].includes(tag)) return '';

      // ── M365 Copilot / Fluent UI code block ─────────────────────────────
      // These are rendered without <pre>/<code> — detected by ARIA label or
      // the well-known scriptor class.  Extract raw text, strip language
      // label from first line, return a fenced code block.
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

      const inner = Array.from(node.childNodes).map(walk).join('');
      switch (tag) {
        case 'h1': case 'h2': case 'h3': case 'h4': case 'h5': case 'h6': {
          const t = inner.trim();
          // Skip Copilot/M365 role-label headings ("You said:", "Copilot said:") — UI chrome.
          if (/^(you said|i said|copilot said|copilot):?\s*$/i.test(t)) return '';
          const level = parseInt(tag[1], 10);
          return `\n${'#'.repeat(level)} ${t}\n`;
        }
        case 'strong': case 'b': { const t = inner.trim(); return t ? `**${t}**` : ''; }
        case 'em':     case 'i': { const t = inner.trim(); return t ? `*${t}*` : ''; }
        case 'code': {
          if (node.parentElement && node.parentElement.tagName.toLowerCase() === 'pre') return node.textContent || '';
          // Multi-line standalone <code> (no <pre> wrapper) → fenced block
          const rawText = node.textContent || '';
          if (rawText.includes('\n')) {
            const lang = ((node.className || '').match(/language-(\S+)/) || [])[1] || '';
            return '\n```' + lang + '\n' + rawText.trimEnd() + '\n```\n';
          }
          const t = inner.trim(); return t ? '`' + t + '`' : '';
        }
        case 'pre': {
          const codeEl = node.querySelector('code');
          const langFromCode   = codeEl ? ((codeEl.className || '').match(/language-(\S+)/) || [])[1] || '' : '';
          const parentClass    = node.parentElement ? (node.parentElement.className || '') : '';
          const langFromParent = (parentClass.match(/(?:highlight-source|language)[- ](\w+)/i) || [])[1] || '';
          const lang = langFromCode || langFromParent;
          const code = (codeEl ? codeEl.textContent : node.textContent) || '';
          return '\n```' + lang + '\n' + code.trimEnd() + '\n```\n';
        }
        case 'ul': {
          const items = Array.from(node.childNodes)
            .filter(n => n.nodeType === 1 && n.tagName.toLowerCase() === 'li')
            .map(li => `- ${walk(li).trim()}`).join('\n');
          return items ? `\n${items}\n` : '';
        }
        case 'ol': {
          const lis = Array.from(node.childNodes).filter(n => n.nodeType === 1 && n.tagName.toLowerCase() === 'li');
          const items = lis.map((li, i) => `${i + 1}. ${walk(li).trim()}`).join('\n');
          return items ? `\n${items}\n` : '';
        }
        case 'li': return inner;
        case 'p':  { const t = inner.trim(); return t ? `\n${t}\n` : ''; }
        case 'br': return '\n';
        case 'hr': return '\n---\n';
        case 'blockquote': {
          const t = inner.trim().split('\n').map(l => `> ${l}`).join('\n');
          return `\n${t}\n`;
        }
        case 'a': {
          const href = node.getAttribute('href');
          const text = inner.trim();
          return href && text ? `[${text}](${href})` : text;
        }
        case 'img': {
          const src = node.getAttribute('src') || '';
          // Keep data: and https:// images; skip blob: (session-only) and empty.
          if (!src || src.startsWith('blob:')) return '';
          const alt = (node.getAttribute('alt') || '').trim().replace(/\n/g, ' ');
          return `\n![${alt}](${src})\n`;
        }
        case 'iframe': {
          // Microsoft Designer generated-image embeds (M365 Copilot)
          const ariaLbl = node.getAttribute('aria-label') || '';
          const iframeName = node.getAttribute('name') || '';
          if (ariaLbl === 'Microsoft Designer' || iframeName === 'Microsoft Designer') {
            const iSrc = node.getAttribute('src') || '';
            if (iSrc) {
              // If we captured a real image URL via postMessage, use that.
              try {
                const u = new URL(iSrc);
                const cachedId = u.searchParams.get('iframeid') || u.searchParams.get('correlationId');
                if (cachedId && window.__bAInderDesignerImages && window.__bAInderDesignerImages[cachedId]) {
    return `\n![AI Generated Image](${window.__bAInderDesignerImages[cachedId]})\n`;
                }
                // Fallback: try to find an image URL embedded in query params
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
        case 'div': case 'section': case 'article': case 'aside': case 'main': case 'header': case 'footer': {
          // If this div's only meaningful child is a <pre>, pass straight through
          // so we don't double-wrap or lose the code block.
          const significantChildren = Array.from(node.children)
            .filter(c => !['button','script','style','svg','template'].includes(c.tagName.toLowerCase()));
          if (significantChildren.length === 1 && significantChildren[0].tagName.toLowerCase() === 'pre') {
            return walk(significantChildren[0]);
          }
          // Skip code-block decoration elements (language label bars, copy-code toolbars).
          // A sibling has a <pre> directly OR nested inside it.
          if (node.parentElement) {
            const siblingHasPre = Array.from(node.parentElement.children)
              .some(c => c !== node && (
                c.tagName.toLowerCase() === 'pre' ||
                c.querySelector('pre')
              ));
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
    return walk(el).replace(/\n{3,}/g, '\n\n').trim();
  }

  function formatMessage(role, content) {
    return { role: role || 'unknown', content: (content || '').trim() };
  }

  function generateTitle(messages, url) {
    // Strategy 1: first complete sentence from the user's first message.
    const ROLE_LABEL_RE = /^(you said|i said|copilot said|copilot):?\s*$/i;
    const firstUser = messages.find(m => m.role === 'user');
    if (firstUser && firstUser.content) {
      const firstLine = firstUser.content
        .split('\n')
        .map(l => l
          .replace(/^#{1,6}\s+/, '')
          .replace(/\*\*(.+?)\*\*/g, '$1')
          .replace(/\*(.+?)\*/g, '$1')
          .replace(/`([^`]*)`/g, '$1')
          .trim()
        )
        .filter(l => l.length > 0 && !ROLE_LABEL_RE.test(l))
        [0] || '';
      if (firstLine) {
        const sentenceMatch = firstLine.match(/^(.+?[.?!])\s/);
        if (sentenceMatch && sentenceMatch[1].length >= 8) return sentenceMatch[1].trim();
        return firstLine;
      }
    }
    if (url) {
      try {
        const u = new URL(url);
        const parts = u.pathname.split('/').filter(Boolean);
        const last = parts[parts.length - 1];
        if (last && last !== 'c' && last.length > 3) return `Chat ${last.slice(0, 40)}`;
      } catch (_) { /* ignore */ }
    }
    return 'Untitled Chat';
  }

  function extractChatGPT(doc) {
    const messages = [];
    const turns = doc.querySelectorAll('article[data-testid^="conversation-turn"]');
    turns.forEach(turn => {
      const roleEl = turn.querySelector('[data-message-author-role]');
      if (!roleEl) return;
      const rawRole = roleEl.getAttribute('data-message-author-role') || '';
      const role = rawRole === 'user' ? 'user' : 'assistant';
      const contentEl =
        turn.querySelector('.markdown') ||
        turn.querySelector('[class*="prose"]') ||
        turn.querySelector('[class*="whitespace-pre"]') ||
        roleEl;
      const content = htmlToMarkdown(contentEl);
      if (content) messages.push(formatMessage(role, content));
    });
    if (messages.length === 0) {
      doc.querySelectorAll('[data-message-author-role]').forEach(el => {
        const role = el.getAttribute('data-message-author-role') === 'user' ? 'user' : 'assistant';
        const content = htmlToMarkdown(el);
        if (content) messages.push(formatMessage(role, content));
      });
    }
    return { title: generateTitle(messages, doc.location.href), messages, messageCount: messages.length };
  }

  function extractClaude(doc) {
    const messages = [];
    const humanTurns = Array.from(doc.querySelectorAll('[data-testid="human-turn"], .human-turn, .human-message'));
    const aiTurns    = Array.from(doc.querySelectorAll('[data-testid="ai-turn"], .ai-turn, .ai-message, .bot-turn'));
    const allTurns   = [
      ...humanTurns.map(el => ({ el, role: 'user' })),
      ...aiTurns.map(el => ({ el, role: 'assistant' }))
    ].sort((a, b) => (a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING) ? -1 : 1);
    allTurns.forEach(({ el, role }) => {
      const content = htmlToMarkdown(el);
      if (content) messages.push(formatMessage(role, content));
    });
    return { title: generateTitle(messages, doc.location.href), messages, messageCount: messages.length };
  }

  function extractGemini(doc) {
    const messages = [];
    const userEls  = Array.from(doc.querySelectorAll('.user-query-content, .query-text, [class*="user-query"]'));
    const modelEls = Array.from(doc.querySelectorAll('.model-response-text, .response-text, [class*="model-response"]'));
    const allEls   = [
      ...userEls.map(el => ({ el, role: 'user' })),
      ...modelEls.map(el => ({ el, role: 'assistant' }))
    ].sort((a, b) => (a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING) ? -1 : 1);
    allEls.forEach(({ el, role }) => {
      const content = htmlToMarkdown(el);
      if (content) messages.push(formatMessage(role, content));
    });
    return { title: generateTitle(messages, doc.location.href), messages, messageCount: messages.length };
  }

  // Strips Copilot UI role-label lines ("You said:", "Copilot said:") from markdown.
  // Defined at IIFE scope so it is available in the contextmenu handler and
  // EXTRACT_EXCERPT message handler, not just inside extractCopilot.
  const LABEL_RE = /^#{0,6}\s*(you said|i said|copilot said|copilot):?\s*$/i;
  function stripRoleLabels(content) {
    return content.split('\n').filter(line => !LABEL_RE.test(line.trim())).join('\n').replace(/^\s+/, '');
  }

  function extractCopilot(doc) {
    const messages = [];

    // Scope to the main conversation area so sidebar history items are excluded.
    const chatScope =
      doc.querySelector('main') ||
      doc.querySelector('[role="main"]') ||
      doc.querySelector('[class*="conversation"][class*="container"]') ||
      doc;

    // Helper: true when an element lives inside a history side-panel / nav drawer.
    const inHistoryPanel = el =>
      !!el.closest('aside, [role="complementary"], [role="navigation"], [class*="history"], [class*="sidebar"]');

    // Helper: keep only outermost elements (remove descendants of other matches).
    const removeDescendants = els =>
      els.filter(el => !els.some(other => other !== el && other.contains(el)));

    const userSelectors = [
      '[data-testid="user-message"]',
      '.UserMessage', '[class*="UserMessage"]', '[class*="user-message"]',
      '[class*="userMessage"]', '[class*="HumanMessage"]', '[class*="human-message"]',
      '[data-author-role="user"]', '[data-content-type="user"]',
      '[aria-label*="You said"]', '[aria-label*="you said"]',
    ];
    const assistantSelectors = [
      '[data-testid="copilot-message"]', '[data-testid="assistant-message"]',
      '[class*="CopilotMessage"]', '[class*="AssistantMessage"]', '[class*="copilot-message"]',
      '[class*="botMessage"]',   '[class*="BotMessage"]',   '[class*="bot-message"]',
      '[data-author-role="assistant"]', '[data-author-role="bot"]',
      '[aria-label*="Copilot said"]', '[aria-label*="Copilot:"]',
    ];

    const dedup = els => [...new Set(els)];
    const rawUserEls = dedup(userSelectors.flatMap(sel => {
      try { return Array.from(chatScope.querySelectorAll(sel)); } catch (_) { return []; }
    })).filter(el => !inHistoryPanel(el));
    const rawCopilotEls = dedup(assistantSelectors.flatMap(sel => {
      try { return Array.from(chatScope.querySelectorAll(sel)); } catch (_) { return []; }
    })).filter(el => !inHistoryPanel(el));

    const userEls    = removeDescendants(rawUserEls);
    const copilotEls = removeDescendants(rawCopilotEls);

    console.log(`bAInder: extractCopilot found ${userEls.length} user, ${copilotEls.length} assistant elements`);
    if (userEls.length === 0 && copilotEls.length === 0) {
      console.warn('bAInder: no messages found. Body classes:', doc.body && doc.body.className);
    }

    const allEls = [
      ...userEls.map(el => ({ el, role: 'user' })),
      ...copilotEls.map(el => ({ el, role: 'assistant' }))
    ].sort((a, b) => (a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING) ? -1 : 1);

    allEls.forEach(({ el, role }) => {
      const content = stripRoleLabels(htmlToMarkdown(el));
      if (content) messages.push(formatMessage(role, content));
    });
    return { title: generateTitle(messages, doc.location?.href || ''), messages, messageCount: messages.length };
  }

  function extractChat(platform, doc) {
    if (!platform) throw new Error('Platform is required');
    if (!doc)      throw new Error('Document is required');
    let result;
    switch (platform) {
      case 'chatgpt': result = extractChatGPT(doc); break;
      case 'claude':  result = extractClaude(doc);  break;
      case 'gemini':   result = extractGemini(doc);   break;
      case 'copilot':  result = extractCopilot(doc);  break;
      default: throw new Error(`Unsupported platform: ${platform}`);
    }
    return {
      platform,
      url:          doc.location?.href || '',
      title:        result.title,
      messages:     result.messages,
      messageCount: result.messageCount,
      extractedAt:  Date.now()
    };
  }

  function prepareChatForSave(chatData) {
    if (!chatData) throw new Error('Chat data is required');

    // Inline markdown-v1 formatter (mirrors markdown-serialiser.js, no import needed)
    function escYaml(v) { return String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"'); }
    function toISO(ts) { try { return new Date(ts).toISOString(); } catch (_) { return ''; } }
    // Prepend role emoji to first non-empty line (🙋 user, 🤖 assistant).
    // Non-standard roles keep a **Label** heading.
    function fmtTurn(content, role) {
      if (role === 'user' || role === 'assistant') {
        const emoji = role === 'user' ? '🙋 ' : '🤖 ';
        const ls = content.split('\n');
        const fi = ls.findIndex(l => l.trim() !== '');
        if (fi !== -1) ls[fi] = emoji + ls[fi];
        return ls.join('\n');
      }
      const cap = role ? role.charAt(0).toUpperCase() + role.slice(1) : 'Unknown';
      return `**${cap}**\n\n${content}`;
    }

    const title = chatData.title || 'Untitled Chat';
    const ts = chatData.extractedAt ? toISO(chatData.extractedAt) : '';
    const headerLines = ['---', `title: "${escYaml(title)}"`, `source: ${chatData.platform || ''}`];
    if (chatData.url) headerLines.push(`url: ${chatData.url}`);
    if (ts) headerLines.push(`date: ${ts}`);
    headerLines.push(`messageCount: ${chatData.messageCount || 0}`, 'contentFormat: markdown-v1', '---');

    const body = (chatData.messages || []).map((m, i) => {
      const sep = i > 0 ? '\n---\n\n' : '';
      return sep + fmtTurn(m.content || '', m.role);
    }).join('\n\n');

    const content = headerLines.join('\n') + '\n\n# ' + title + (body ? '\n\n' + body : '');

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

  // ─── Button Injection ──────────────────────────────────────────────────────

  const BUTTON_ID = 'bAInder-save-btn';

  /**
   * Create the "Save to bAInder" button element.
   * @param {string} platform
   * @returns {HTMLButtonElement}
   */
  function createSaveButton(platform) {
    const btn = document.createElement('button');
    btn.id              = BUTTON_ID;
    btn.textContent     = '💾 Save to bAInder';
    btn.title           = 'Save this chat to bAInder';
    btn.setAttribute('aria-label', 'Save chat to bAInder');
    btn.setAttribute('data-platform', platform);

    // Floating button styles (no inline event handlers – CSP safe)
    Object.assign(btn.style, {
      position:     'fixed',
      bottom:       '80px',
      right:        '20px',
      zIndex:       '2147483647',
      background:   '#4f46e5',
      color:        '#fff',
      border:       'none',
      borderRadius: '8px',
      padding:      '10px 16px',
      fontSize:     '13px',
      fontWeight:   '600',
      cursor:       'pointer',
      boxShadow:    '0 4px 12px rgba(0,0,0,0.25)',
      transition:   'background 0.2s, transform 0.1s',
      fontFamily:   'system-ui, -apple-system, sans-serif',
      lineHeight:   '1.4'
    });

    btn.addEventListener('mouseenter', () => {
      btn.style.background = '#4338ca';
      btn.style.transform  = 'scale(1.03)';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.background = '#4f46e5';
      btn.style.transform  = 'scale(1)';
    });

    btn.addEventListener('click', handleSaveClick);
    return btn;
  }

  /**
   * Inject the save button if not already present.
   * @param {string} platform
   */
  function injectSaveButton(platform) {
    if (document.getElementById(BUTTON_ID)) return; // already injected
    const btn = createSaveButton(platform);
    document.body.appendChild(btn);
    console.log(`bAInder: Save button injected for ${platform}`);
  }

  /** Remove the save button (called before reinject on SPA navigation). */
  function removeSaveButton() {
    const existing = document.getElementById(BUTTON_ID);
    if (existing) existing.remove();
  }

  // ─── Save Flow ─────────────────────────────────────────────────────────────

  /**
   * Temporarily change button text/style to give visual feedback.
   * @param {HTMLButtonElement} btn
   * @param {'loading'|'success'|'error'|'empty'|'default'} state
   */
  function setButtonState(btn, s, detail) {
    if (!btn) return;
    const errorText = detail ? `❌ ${String(detail).slice(0, 28)}` : '❌ Error';
    const states = {
      loading: { text: '⏳ Saving...',       bg: '#6366f1', disabled: true  },
      success: { text: '✅ Saved!',           bg: '#16a34a', disabled: true  },
      error:   { text: errorText,              bg: '#dc2626', disabled: false },
      empty:   { text: '⚠️ No chat yet',     bg: '#d97706', disabled: false },
      default: { text: '💾 Save to bAInder', bg: '#4f46e5', disabled: false }
    };
    const st = states[s] || states.default;
    btn.textContent      = st.text;
    btn.style.background = st.bg;
    btn.disabled         = st.disabled;

    if (s === 'success' || s === 'error' || s === 'empty') {
      setTimeout(() => setButtonState(btn, 'default'), 3500);
    }
  }

  /**
   * Handle button click: extract → send to background → show feedback.
   */
  async function handleSaveClick() {
    const btn      = document.getElementById(BUTTON_ID);
    const platform = detectPlatform(window.location.hostname);
    if (!platform) return;

    setButtonState(btn, 'loading');

    try {
      // ── On-demand Designer image pre-capture ────────────────────────────────
      // Capture any Designer iframes not yet in the cache before extracting the
      // full chat. Each capture scrolls the iframe into view first so the
      // screenshot is correct regardless of the current scroll position.
      const designerIframes = document.querySelectorAll(
        'iframe[name="Microsoft Designer"], iframe[aria-label="Microsoft Designer"]'
      );
      const capturePromises = [];
      for (const iframe of designerIframes) {
        try {
          const u = new URL(iframe.src);
          const iframeid = u.searchParams.get('iframeid') || u.searchParams.get('correlationId');
          if (!iframeid) continue;
          if (window.__bAInderDesignerImages?.[iframeid]) continue; // already cached
          console.log('[bAInder] On-demand capture for Designer iframe (save)', iframeid);
          capturePromises.push(captureDesignerIframe(iframeid, iframe));
        } catch (_) {}
      }
      if (capturePromises.length > 0) {
        // Wait up to 8 s (scroll + repaint + round-trip per image); continue regardless
        await Promise.race([
          Promise.all(capturePromises),
          new Promise(r => setTimeout(r, 8000))
        ]);
      }

      const chatData    = extractChat(platform, document);
      if (chatData.messageCount === 0) {
        setButtonState(btn, 'empty');
        return;
      }

      const savePayload = prepareChatForSave(chatData);
      const response    = await sendMessage({ type: 'SAVE_CHAT', data: savePayload });

      if (response && response.success) {
        setButtonState(btn, 'success');
        console.log('bAInder: Chat saved successfully', response.data);
      } else {
        throw new Error((response && response.error) || 'Unknown error');
      }
    } catch (err) {
      setButtonState(btn, 'error', err.message);
      console.error('bAInder: Failed to save chat', err);
    }
  }

  // ─── Selection pre-capture for excerpt saves ───────────────────────────────
  // Chrome clears the page selection by the time a context menu item is clicked.
  // On right-click we immediately push the rich markdown to the background script
  // so it's already cached there when the context menu item fires — no round-trip
  // timing issues, and works regardless of which frame received the event.
  document.addEventListener('contextmenu', async () => {
    try {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
        console.log('[bAInder DEBUG] contextmenu: no selection, skipping cache push');
        return;
      }
      const fragment = sel.getRangeAt(0).cloneContents();
      const wrapper  = document.createElement('div');
      wrapper.appendChild(fragment);
      // Log the wrapper element itself so it can be expanded in DevTools
      console.log('[bAInder DEBUG] contextmenu: captured DOM =', wrapper);
      console.log('[bAInder DEBUG] contextmenu: captured HTML (full) =', wrapper.innerHTML);
      const preEls  = wrapper.querySelectorAll('pre');
      const codeEls = wrapper.querySelectorAll('code');
      console.log('[bAInder DEBUG] contextmenu: pre count =', preEls.length, 'code count =', codeEls.length);
      preEls.forEach((p, i)  => console.log(`[bAInder DEBUG]   pre[${i}] outerHTML =`, p.outerHTML.slice(0, 300)));
      codeEls.forEach((c, i) => console.log(`[bAInder DEBUG]   code[${i}] parent.tag =`, c.parentElement?.tagName, 'class =', c.className, 'text =', c.textContent.slice(0, 100)));

      // ── On-demand Designer image capture ──────────────────────────────────
      // ImageGenerated telemetry may not have fired yet (images still rendering).
      // Proactively screenshot any uncached Designer iframes in the selection.
      // Each capture scrolls the iframe into view first so the screenshot is
      // correct regardless of the user's current scroll position.
      const designerIframesInSelection = wrapper.querySelectorAll(
        'iframe[name="Microsoft Designer"], iframe[aria-label="Microsoft Designer"]'
      );
      const capturePromises = [];
      for (const clonedIframe of designerIframesInSelection) {
        try {
          // clonedIframe is a detached clone — resolve the iframeid then find
          // the live DOM iframe so we can scroll it and get a real bounding rect
          const iSrc = clonedIframe.getAttribute('src') || '';
          const u = new URL(iSrc.replace(/&amp;/g, '&'));
          const iframeid = u.searchParams.get('iframeid') || u.searchParams.get('correlationId');
          if (!iframeid) continue;
          if (window.__bAInderDesignerImages?.[iframeid]) continue; // already cached
          const liveIframe = document.querySelector(`iframe[src*="iframeid=${iframeid}"]`);
          if (!liveIframe) continue;
          console.log('[bAInder] On-demand capture for Designer iframe (contextmenu)', iframeid);
          capturePromises.push(captureDesignerIframe(iframeid, liveIframe));
        } catch (_) {}
      }
      if (capturePromises.length > 0) {
        // Wait up to 5 s per image (scroll + repaint + round-trip); continue regardless
        await Promise.race([
          Promise.all(capturePromises),
          new Promise(r => setTimeout(r, 5000))
        ]);
      }

      const markdown = stripRoleLabels(htmlToMarkdown(wrapper)).trim();
      console.log('[bAInder DEBUG] contextmenu: htmlToMarkdown output =', JSON.stringify(markdown.slice(0, 1000)));

      if (!markdown) {
        console.log('[bAInder DEBUG] contextmenu: markdown empty, not caching');
        return;
      }

      // Guard: chrome.runtime becomes undefined when the extension context is
      // invalidated (e.g. after a reload). The page must be refreshed to reconnect.
      if (!chrome?.runtime?.sendMessage) {
        console.warn('[bAInder DEBUG] contextmenu: chrome.runtime unavailable — reload the page to reconnect the extension');
        return;
      }

      chrome.runtime.sendMessage({
        type: 'STORE_EXCERPT_CACHE',
        data: { markdown }
      }).then(r => console.log('[bAInder DEBUG] STORE_EXCERPT_CACHE response =', r))
        .catch(e => console.warn('[bAInder DEBUG] STORE_EXCERPT_CACHE send failed =', e?.message));
    } catch (err) {
      console.error('[bAInder DEBUG] contextmenu error:', err);
    }
  });

  // ─── Chrome Messaging ──────────────────────────────────────────────────────

  /**
   * Send a message to the background script and return the response promise.
   * @param {Object} msg
   * @returns {Promise<Object>}
   */
  function sendMessage(msg) {
    return new Promise((resolve, reject) => {
      if (!chrome?.runtime?.sendMessage) {
        reject(new Error('Extension context lost — please reload the page'));
        return;
      }
      try {
        chrome.runtime.sendMessage(msg, (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(response);
          }
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  // ─── Incoming Message Handler ──────────────────────────────────────────────

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    const platform = detectPlatform(window.location.hostname);

    switch (message.type) {


      case 'EXTRACT_CHAT': {
        if (!platform) {
          sendResponse({ success: false, error: 'Not on a supported AI chat platform' });
          break;
        }
        try {
          const chatData = extractChat(platform, document);
          sendResponse({ success: true, data: prepareChatForSave(chatData) });
        } catch (err) {
          sendResponse({ success: false, error: err.message });
        }
        break;
      }

      case 'EXTRACT_EXCERPT': {
        // Legacy fallback: attempt to get the current selection if the background
        // cache wasn't populated via STORE_EXCERPT_CACHE.
        try {
          const sel = window.getSelection();
          if (sel && !sel.isCollapsed && sel.rangeCount > 0) {
            const fragment = sel.getRangeAt(0).cloneContents();
            const wrapper  = document.createElement('div');
            wrapper.appendChild(fragment);
            const markdown = stripRoleLabels(htmlToMarkdown(wrapper)).trim();
            sendResponse({ success: !!markdown, data: { markdown } });
          } else {
            sendResponse({ success: false, error: 'No selection' });
          }
        } catch (err) {
          sendResponse({ success: false, error: err.message });
        }
        break;
      }

      case 'GET_PLATFORM': {
        sendResponse({ success: true, data: { platform } });
        break;
      }

      case 'PING': {
        sendResponse({ success: true, data: 'pong' });
        break;
      }

      default:
        sendResponse({ success: false, error: `Unknown message type: ${message.type}` });
    }
  });

  // ─── SPA Navigation Observer ───────────────────────────────────────────────

  let lastUrl = document.location.href;

  function onUrlChange() {
    const currentUrl = document.location.href;
    if (currentUrl === lastUrl) return;
    console.log('bAInder: URL change detected', { from: lastUrl, to: currentUrl });
    lastUrl = currentUrl;
    removeSaveButton();
    initContentScript();
  }

  const navObserver = new MutationObserver(onUrlChange);
  navObserver.observe(document.body || document.documentElement, {
    childList: true,
    subtree:   true
  });

  const _pushState    = history.pushState.bind(history);
  const _replaceState = history.replaceState.bind(history);
  history.pushState    = (...args) => { _pushState(...args);    onUrlChange(); };
  history.replaceState = (...args) => { _replaceState(...args); onUrlChange(); };
  window.addEventListener('popstate', onUrlChange);

  // ─── Initialisation ────────────────────────────────────────────────────────

  function initContentScript() {
    const platform = detectPlatform(window.location.hostname);
    if (!platform) {
      console.log('bAInder: Not on a supported AI chat platform');
      return;
    }
    console.log(`bAInder: Detected platform - ${platform}`);
    injectSaveButton(platform);
    console.log('bAInder: Content script ready');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initContentScript);
  } else {
    initContentScript();
  }

  console.log('bAInder content script loaded on:', window.location.hostname);

})(); // end IIFE
