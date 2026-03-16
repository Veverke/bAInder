/**
 * bAInder Content Script
 * Stage 6: Content Script - Chat Detection & Extraction
 *
 * Injected into ChatGPT, Claude, and Gemini pages.
 * Detects platform, extracts chat content, injects "Save to bAInder" button.
 *
 * Bundled by Vite as a classic content script. Keep this file dependency-light
 * so the output remains self-contained and avoids top-level `import` in dist.
 * The extraction logic is inlined from src/content/chat-extractor.js.
 */

// Content scripts always have `chrome` available as a global — no polyfill import needed.
// Using it directly avoids ES module output (import statements) which can fail on some sites.
const browser = chrome;

// Local logger shim: keeps this bundle standalone (no cross-file imports).
// info/warn/error are also forwarded to the background service worker so they
// appear in the extension's background console, not just the tab console.
const logger = {
  debug: (...args) => console.debug(...args),
  info: (...args) => {
    console.info(...args);
    try { browser.runtime.sendMessage({ type: 'CONTENT_LOG', level: 'info', msg: args.map(String).join(' ') }); } catch (_) {}
  },
  warn: (...args) => {
    console.warn(...args);
    try { browser.runtime.sendMessage({ type: 'CONTENT_LOG', level: 'warn', msg: args.map(String).join(' ') }); } catch (_) {}
  },
  error: (...args) => {
    console.error(...args);
    try { browser.runtime.sendMessage({ type: 'CONTENT_LOG', level: 'error', msg: args.map(String).join(' ') }); } catch (_) {}
  },
};

(function bAInderContentScript() {
  'use strict';

  // Prevent double-injection (e.g. if content script runs twice)
  if (window.__bAInderInjected) return;
  window.__bAInderInjected = true;

  // Emit version stamp so it appears in the background SW console immediately.
  // If you don't see this after reloading the extension + refreshing the tab,
  // the content script is not running.
  logger.info('content script v2 active on', window.location.hostname);

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
    if (!browser?.runtime?.sendMessage) return null;
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
      browser.runtime.sendMessage({
        type: 'CAPTURE_DESIGNER_IMAGE',
        iframeid,
        rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
        dpr:  window.devicePixelRatio || 1
      }).then(response => {
        // Restore scroll position regardless of outcome
        scrollEl.scrollTo({ top: savedTop, left: savedLeft, behavior: 'instant' });
        if (!response?.dataUrl) { resolve(null); return; }
        window.__bAInderDesignerImages[iframeid] = response.dataUrl;
        logger.debug('[bAInder] Captured Designer image for', iframeid,
          '(' + Math.round(rect.width) + 'x' + Math.round(rect.height) + ')');
        resolve(response.dataUrl);
      }).catch(() => {
        scrollEl.scrollTo({ top: savedTop, left: savedLeft, behavior: 'instant' });
        resolve(null);
      });
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
    if (h.includes('chat.openai.com') || h.includes('chatgpt.com')) return 'chatgpt';
    if (h.includes('claude.ai'))          return 'claude';
    if (h.includes('gemini.google.com'))  return 'gemini';
    if (h.includes('copilot.microsoft.com') || h.includes('m365.cloud.microsoft')) return 'copilot';
    if (h.includes('perplexity.ai'))      return 'perplexity';
    if (h.includes('chat.deepseek.com'))  return 'deepseek';
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
      // Skip decorative / hidden nodes — BUT preserve short text-only separator
      // nodes (e.g. "•", " · ", "|") that ChatGPT marks aria-hidden for
      // screen-readers yet which form visible punctuation between text spans.
      if (node.getAttribute && node.getAttribute('aria-hidden') === 'true') {
        if (node.childElementCount === 0) {
          const txt = node.textContent || '';
          if (/^\s*[\u2022\u00b7\u2019\u2013\u2014|\-\.]+\s*$/.test(txt)) return txt;
        }
        return '';
      }
      const tag = node.tagName.toLowerCase();
      if (['script','style','svg','noscript','template'].includes(tag)) return '';
      // Buttons are skipped to avoid UI text (Copy, Send, Thumbs Up, etc.).
      // Exception: buttons used as image wrappers (Copilot wraps AI-generated images
      // in clickable <button> elements). Emit any resolved data: images inside them.
      if (tag === 'button') {
        const parts = [];
        for (const img of node.querySelectorAll('img')) {
          const r = walk(img);
          if (r.trim()) parts.push(r);
        }
        return parts.join('');
      }

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
          // Skip Copilot/M365 role-label headings ("You said:", "Copilot said:") — UI browser.
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
          // Placeholder emitted when resolveImageBlobs() failed to fetch a blob: URL.
          if (node.hasAttribute('data-binder-img-lost')) {
            const desc = node.getAttribute('data-binder-img-lost') || 'Image';
            return `\n[🖼️ Image not captured: ${desc}]\n`;
          }
          const src = node.getAttribute('src') || '';
          if (!src) return '';
          // blob: that wasn't pre-processed (synchronous excerpt path) → placeholder.
          if (src.startsWith('blob:')) {
            const alt = (node.getAttribute('alt') || '').trim().replace(/\n/g, ' ');
            return alt ? `\n[🖼️ Image: ${alt}]\n` : '\n[🖼️ Image]\n';
          }
          const alt = (node.getAttribute('alt') || '').trim().replace(/\n/g, ' ');
          const w = node.getAttribute('data-natural-width');
          const h = node.getAttribute('data-natural-height');
          const suffix = (w && h) ? `{width=${w} height=${h}}` : w ? `{width=${w}}` : '';
          return `\n![${alt}](${src})${suffix}\n`;
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
        case 'table': {
          const rows = Array.from(node.querySelectorAll('tr'));
          if (!rows.length) return inner;
          const tableData = rows.map(tr => {
            const cells = Array.from(tr.querySelectorAll('th, td'));
            return cells.map(c => walk(c).replace(/\n+/g, ' ').trim().replace(/\|/g, '\\|'));
          }).filter(r => r.length);
          if (!tableData.length) return inner;
          const colCount = tableData[0].length;
          const mdRows = tableData.map(cells => '| ' + cells.join(' | ') + ' |');
          const sep = '| ' + Array(colCount).fill('---').join(' | ') + ' |';
          mdRows.splice(1, 0, sep);
          return '\n' + mdRows.join('\n') + '\n';
        }
        case 'thead': case 'tbody': case 'tfoot': case 'tr': case 'th': case 'td':
          return inner;
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

  // ─── Image blob resolver ────────────────────────────────────────────
  // Resolves blob: img srcs to persistent data: URLs before markdown conversion.
  // Clones the element to avoid mutating the live page DOM.
  // On fetch failure, marks the img with data-binder-img-lost so the placeholder
  // branch in htmlToMarkdown() fires.
  function _blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.onerror = () => reject(fr.error);
      fr.readAsDataURL(blob);
    });
  }
  async function resolveImageBlobs(el, fetchViaBackground, dimsEl) {
    if (fetchViaBackground === undefined) fetchViaBackground = null;
    if (dimsEl === undefined) dimsEl = null;
    const liveImgs = Array.from(el.querySelectorAll('img'));
    if (liveImgs.length === 0) return el;
    // Use dimsEl (original live element) for BCR reads when el is a detached clone.
    const dimImgs = dimsEl ? Array.from(dimsEl.querySelectorAll('img')) : liveImgs;
    // Collect effective URL AND rendered dimensions.
    const liveData = liveImgs.map(function(img, i) {
      let src = img.currentSrc || img.getAttribute('src') || img.getAttribute('data-src') || '';
      if (!src) {
        const srcset = img.getAttribute('srcset') || '';
        if (srcset) src = srcset.trim().split(/[,\s]+/)[0];
      }
      return (function() {
        const dimImg = dimImgs[i] || img;
        const rect = dimImg.getBoundingClientRect ? dimImg.getBoundingClientRect() : {};
        let w = Math.round(rect.width  || 0);
        let h = Math.round(rect.height || 0);
        if (w === 0) {
          const wrapper = dimImg.closest ? dimImg.closest('button, figure, [role="img"], a') : null;
          if (wrapper) {
            const wr = wrapper.getBoundingClientRect();
            w = Math.round(wr.width  || 0);
            h = Math.round(wr.height || 0);
          }
        }
        const naturalWidth  = w || dimImg.naturalWidth  || 0;
        const naturalHeight = h || dimImg.naturalHeight || 0;
        logger.info('[bAInder] resolveImg dims:', src.slice(0, 60),
          'rect:', Math.round(rect.width||0), 'x', Math.round(rect.height||0),
          'wrapper:', w, 'x', h,
          'natural:', dimImg.naturalWidth, 'x', dimImg.naturalHeight,
          '→ captured:', naturalWidth, 'x', naturalHeight);
        return { src, naturalWidth, naturalHeight };
      })();
    });
    const liveUrls = liveData.map(function(d) { return d.src; });
    const needsProcessing = liveUrls.some(function(src) {
      return src.startsWith('blob:') ||
        (fetchViaBackground && (src.startsWith('http:') || src.startsWith('https:')));
    });
    if (!needsProcessing) return el;
    const clone = el.cloneNode(true);
    const cloneImgs = Array.from(clone.querySelectorAll('img'));
    await Promise.all(cloneImgs.map(async function(img, i) {
      const src = liveUrls[i];
      const d = liveData[i];
      const naturalWidth = d ? d.naturalWidth : 0;
      const naturalHeight = d ? d.naturalHeight : 0;
      if (!src) return;
      try {
        let dataUrl;
        if (src.startsWith('blob:')) {
          const r = await fetch(src);
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          dataUrl = await _blobToDataUrl(await r.blob());
        } else if (fetchViaBackground && (src.startsWith('http:') || src.startsWith('https:'))) {
          dataUrl = await fetchViaBackground(src);
          if (!dataUrl || !dataUrl.startsWith('data:')) throw new Error('Invalid dataUrl: ' + String(dataUrl).slice(0, 20));
        } else {
          return;
        }
        img.setAttribute('src', dataUrl);
        img.removeAttribute('data-src');
        img.removeAttribute('srcset');
        if (naturalWidth > 0) img.setAttribute('data-natural-width', String(naturalWidth));
        if (naturalHeight > 0) img.setAttribute('data-natural-height', String(naturalHeight));
      } catch (_) {
        const altText = (img.getAttribute('alt') || '').trim() || 'Image';
        img.removeAttribute('src');
        img.removeAttribute('data-src');
        img.removeAttribute('srcset');
        img.setAttribute('data-binder-img-lost', altText);
      }
    }));
    return clone;
  }

  // ─── Shadow-DOM image collector ───────────────────────────────────────
  // querySelectorAll() cannot pierce shadow roots, so images inside
  // Gemini/Copilot Angular custom elements are invisible to the regular flow.
  // This walks the live DOM including open shadow roots to find them.
  function collectShadowImages(root, maxShadowDepth) {
    if (maxShadowDepth === undefined) maxShadowDepth = 6;
    const results = [];
    function walk(node, depth, inShadow) {
      if (!node) return;
      const type = node.nodeType;
      if (type !== 1 && type !== 11) return;
      if (type === 1) {
        const tag = node.tagName.toLowerCase();
        if (inShadow && tag === 'img') {
          // currentSrc reflects the actually-loaded URL (resolved from srcset).
          // Fall back to src, data-src, or the first srcset entry.
          let src = node.currentSrc || node.getAttribute('src') || node.getAttribute('data-src') || '';
          if (!src) {
            const srcset = node.getAttribute('srcset') || '';
            if (srcset) src = srcset.trim().split(/[,\s]+/)[0];
          }
          const alt = (node.getAttribute('alt') || '').trim();
          if (src && !src.startsWith('data:')) {
            const rect = node.getBoundingClientRect ? node.getBoundingClientRect() : {};
            let w = Math.round(rect.width  || 0);
            let h = Math.round(rect.height || 0);
            if (w === 0) {
              const wrapper = node.closest ? node.closest('button, figure, [role="img"], a') : null;
              if (wrapper) {
                const wr = wrapper.getBoundingClientRect();
                w = Math.round(wr.width  || 0);
                h = Math.round(wr.height || 0);
              }
            }
            const nw = w || node.naturalWidth  || 0;
            const nh = h || node.naturalHeight || 0;
            logger.info('[bAInder] shadowImg dims:', src.slice(0, 60),
              'rect:', Math.round(rect.width||0), 'x', Math.round(rect.height||0),
              'wrapper:', w, 'x', h,
              'natural:', node.naturalWidth, 'x', node.naturalHeight,
              '→ captured:', nw, 'x', nh);
            results.push({
              src, alt,
              naturalWidth:  nw,
              naturalHeight: nh,
            });
          }
        }
        if (depth > 0 && node.shadowRoot) walk(node.shadowRoot, depth - 1, true);
      }
      for (const child of node.childNodes) walk(child, depth, inShadow);
    }
    walk(root, maxShadowDepth, false);
    return results;
  }

  async function appendShadowImages(liveEl, existingContent, fetchViaBackground = null) {
    const shadowImgs = collectShadowImages(liveEl);
    if (shadowImgs.length === 0) return existingContent;
    const parts = [];
    for (const { src, alt, naturalWidth, naturalHeight } of shadowImgs) {
      if (existingContent.includes(src)) continue; // already captured
      if (src.startsWith('blob:') || src.startsWith('http:') || src.startsWith('https:')) {
        try {
          let dataUrl;
          if (src.startsWith('blob:')) {
            const r = await fetch(src);
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            dataUrl = await _blobToDataUrl(await r.blob());
          } else if (fetchViaBackground) {
            // Route https: URLs through the background service worker to bypass CORP.
            dataUrl = await fetchViaBackground(src);
            if (!dataUrl || !dataUrl.startsWith('data:')) throw new Error('Invalid dataUrl from background');
          } else {
            const r = await fetch(src, { credentials: 'include' });
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            dataUrl = await _blobToDataUrl(await r.blob());
          }
          const suffix = (naturalWidth && naturalHeight)
            ? `{width=${naturalWidth} height=${naturalHeight}}` : '';
          parts.push(`\n![${alt}](${dataUrl})${suffix}\n`);
        } catch (_) {
          const desc = alt || 'Image';
          parts.push(`\n[🖼️ Image not captured: ${desc}]\n`);
        }
      }
    }
    return parts.length ? existingContent + parts.join('') : existingContent;
  }

  // ─── Audio capture helpers ──────────────────────────────────────────────────
  // collectAudioFromPage() reads meta elements written by the MAIN-world
  // audio-interceptor.js (which patches URL.createObjectURL, HTMLAnchorElement
  // .click, and window.fetch) AND sweeps the live DOM (including shadow roots)
  // for any <audio> elements the extractors might have missed.

  const _MAX_AUDIO_BYTES_CS = 10 * 1024 * 1024; // 10 MB

  // Return a persistent src for an audio URL: data: URI (preferred) or the URL.
  async function _captureAudioSrc(src) {
    if (!src) return null;
    if (src.startsWith('data:')) return src.startsWith('data:audio/') ? src : null;
    if (src.startsWith('blob:')) {
      try {
        const resp = await fetch(src);
        if (!resp.ok) return null;
        const buf = await resp.arrayBuffer();
        if (buf.byteLength > _MAX_AUDIO_BYTES_CS) return 'too_large';
        const mime = (resp.headers.get('content-type') || 'audio/mpeg').split(';')[0].trim();
        return await _blobToDataUrl(new Blob([buf], { type: mime }));
      } catch (_) { return null; }
    }
    if (src.startsWith('http:') || src.startsWith('https:')) {
      // Route through background service worker which has host_permissions.
      return new Promise((resolve) => {
        browser.runtime.sendMessage({ type: 'FETCH_IMAGE_AS_DATA_URL', url: src }, resp => {
          if (browser.runtime.lastError) { resolve(src); return; }
          const du = resp?.dataUrl || '';
          // Only return a data: URI if it is actually audio content.
          // Falls back to the original src URL on fetch failure (expired link etc.).
          if (resp?.success && du.startsWith('data:audio/')) { resolve(du); return; }
          if (!resp?.success) { resolve(src); return; } // fetch error — keep URL as fallback
          resolve(null); // fetched fine but wrong content-type (image, PDF, …)
        });
      });
    }
    return null;
  }

  // Walk root recursively including open shadow roots, collect all <audio> srcs
  // AND all <a> hrefs that look like audio file downloads.
  function collectShadowAudio(root, maxShadowDepth) {
    if (maxShadowDepth === undefined) maxShadowDepth = 8;
    // Match audio extension anywhere in URL (e.g. ?name=audio.wav& or path/audio.mp3?token).
    // mp4 included because Gemini wraps generated music in <video> with an .mp4 container.
    const AUDIO_EXT_RE_CS = /\.(wav|mp3|ogg|webm|m4a|aac|flac|opus|mp4)(?:[^a-zA-Z]|$)/i;
    // ChatGPT code-interpreter stores generated files here; Gemini on GCS and contribution CDN.
    const AUDIO_CDN_RE_CS = /files\.oaiusercontent\.com|storage\.googleapis\.com|storage\.cloud\.google\.com|contribution\.usercontent\.google\.com/i;
    // URL contains audio content-type hint:
    //   content_type=audio  — generic pattern
    //   type=audio%2F       — URL-encoded mime
    //   rsct=audio          — Azure Blob signed URL response-content-type (ChatGPT)
    //   rscd=...filename.ext — response-content-disposition with audio filename
    const AUDIO_CT_RE_CS  = /content[_-]?type=audio|type=audio%2F|rsct=audio|rscd=[^&]*\.(wav|mp3|ogg|webm|m4a|aac|flac|opus)/i;
    const audioSrcs = [];
    const anchorHrefs = [];
    let hasUnresolvableAudio = false;
    function walkAudio(node, depth) {
      if (!node) return;
      const type = node.nodeType;
      if (type !== 1 && type !== 11) return;
      if (type === 1) {
        const tag = node.tagName.toLowerCase();
        if (tag === 'audio' || tag === 'video') {
          let src = '';
          try { src = node.src || ''; } catch (_) {}
          if (!src) src = node.getAttribute('src') || '';
          if (!src) {
            const srcEl = node.querySelector('source');
            if (srcEl) {
              try { src = srcEl.src || ''; } catch (_) {}
              if (!src) src = srcEl.getAttribute('src') || '';
            }
          }
          // For <video>, only capture if wrapped in a Gemini music/audio custom element.
          if (tag === 'video' && src) {
            let isAudioCtx = false;
            let p = node.parentElement;
            while (p) { if (/generated.music|video.player|audio.chip/i.test(p.tagName)) { isAudioCtx = true; break; } p = p.parentElement; }
            if (!isAudioCtx && !AUDIO_CDN_RE_CS.test(src)) { src = ''; } // skip unrelated videos
          }
          // Diagnostic: log every audio/video element so we can see what its src is.
          let hasSrcObject = false;
          try { hasSrcObject = !!node.srcObject; } catch (_) {}
          logger.info('[bAInder] ' + tag + ' el found: src=' + (src || '(empty)').slice(0, 100) +
            ' srcObject=' + hasSrcObject + ' paused=' + node.paused + ' readyState=' + node.readyState);
          if (src && !src.startsWith('data:') && src.includes(':')) audioSrcs.push(src);
          // Empty src means the player exists but audio wasn't preloaded (lazy / closed shadow).
          else if (tag === 'audio' && (!src || src === (window.location && window.location.href))) hasUnresolvableAudio = true;
        } else if (tag === 'a') {
          const href = node.getAttribute('href') || '';
          const dl   = node.getAttribute('download');
          // A download link with an audio extension, OR a CDN link that has audio ext / content-type / download attr.
          const hasAudioExt = AUDIO_EXT_RE_CS.test(href);
          // Capture any CDN anchor that: has audio extension, OR audio content-type hint,
          // OR has a download attribute (content-type will be verified on fetch).
          const isCDNAudio  = AUDIO_CDN_RE_CS.test(href) && (dl !== null || hasAudioExt || AUDIO_CT_RE_CS.test(href));
          if (href && (hasAudioExt || isCDNAudio)) {
            anchorHrefs.push(href);
          }
        }
        if (depth > 0 && node.shadowRoot) walkAudio(node.shadowRoot, depth - 1);
      }
      for (const child of node.childNodes) walkAudio(child, depth);
    }
    walkAudio(root, maxShadowDepth);
    return { audioSrcs, anchorHrefs, hasUnresolvableAudio };
  }

  // Main entry: reads meta cache + shadow DOM + light DOM <audio>/<a> elements.
  // Returns array of [🔊 Generated audio](...) marker strings.
  // Pass `seenSrcs` (a shared Set) to skip URLs already captured per-turn.
  async function collectAudioFromPage(doc, seenSrcs) {
    const markers  = [];
    if (!seenSrcs) seenSrcs = new Set();
    // Match audio extension anywhere in URL.
    // mp4 included because Gemini wraps generated music in <video> with an .mp4 container.
    const AUDIO_EXT_RE_CS = /\.(wav|mp3|ogg|webm|m4a|aac|flac|opus|mp4)(?:[^a-zA-Z]|$)/i;
    const AUDIO_CDN_RE_CS = /files\.oaiusercontent\.com|storage\.googleapis\.com|storage\.cloud\.google\.com|contribution\.usercontent\.google\.com/i;
    const AUDIO_CT_RE_CS  = /content[_-]?type=audio|type=audio%2F|rsct=audio|rscd=[^&]*\.(wav|mp3|ogg|webm|m4a|aac|flac|opus)/i;

    // 1. Meta cache written by the MAIN-world audio-interceptor.js.
    const metaEls = doc.querySelectorAll('meta[name="bainder-audio-cache"]');
    logger.info('[bAInder] collectAudioFromPage: meta cache entries=' + metaEls.length +
      ' lightAudio=' + doc.querySelectorAll('audio').length +
      ' lightAnchors=' + doc.querySelectorAll('a[href]').length);
    // Diagnostic: log every CDN anchor even if it doesn't match audio criteria.
    const _allCDNAnchors = doc.querySelectorAll(
      'a[href*="files.oaiusercontent.com"], a[href*="storage.googleapis.com"], a[href*="storage.cloud.google.com"]');
    if (_allCDNAnchors.length > 0) {
      logger.info('[bAInder] CDN anchors in DOM: ' + _allCDNAnchors.length + ' — ' +
        [..._allCDNAnchors].slice(0, 3).map(a => (a.getAttribute('href') || '').slice(0, 100)).join(' | '));
    }
    for (const meta of metaEls) {
      const key     = meta.getAttribute('data-blob-url') || '';
      const dataUrl = meta.getAttribute('data-data-url') || '';
      if (!dataUrl || seenSrcs.has(key)) continue;
      seenSrcs.add(key);
      logger.info('[bAInder] audio meta cache hit:', key.slice(0, 80));
      const persistent = await _captureAudioSrc(dataUrl);
      if (persistent && persistent !== 'too_large') {
        markers.push(`[\uD83D\uDD0A Generated audio](${persistent})`);
      } else if (persistent === 'too_large') {
        markers.push('[\uD83D\uDD0A Generated audio (file too large to capture)]');
      }
    }

    // 2. Full shadow+light DOM walk — <audio> srcs and <a> download hrefs.
    const { audioSrcs, anchorHrefs } = collectShadowAudio(doc.documentElement || doc.body);

    // 2a. <audio> elements (shadow + light DOM)
    for (const src of audioSrcs) {
      if (seenSrcs.has(src)) continue;
      seenSrcs.add(src);
      logger.info('[bAInder] audio element src:', src.slice(0, 80));
      const resolved = await _captureAudioSrc(src);
      if (resolved === 'too_large')   markers.push('[\uD83D\uDD0A Generated audio (file too large to capture)]');
      else if (resolved)              markers.push(`[\uD83D\uDD0A Generated audio](${resolved})`);
      else                            markers.push(`[\uD83D\uDD0A Generated audio (not captured)](${(typeof location !== 'undefined' && location.href) || ''})`);
    }

    // 2b. <a download> links pointing to audio file URLs
    for (const href of anchorHrefs) {
      if (seenSrcs.has(href)) continue;
      seenSrcs.add(href);
      logger.info('[bAInder] audio anchor href (shadow):', href.slice(0, 100));
      const resolved = await _captureAudioSrc(href);
      if (resolved === 'too_large')   markers.push('[\uD83D\uDD0A Generated audio (file too large to capture)]');
      else if (resolved === href)     markers.push(`[\uD83D\uDD0A Generated audio](${resolved})`); // HTTPS URL as fallback
      else if (resolved)              markers.push(`[\uD83D\uDD0A Generated audio](${resolved})`);
    }

    // 2c. Also scan light-DOM <a> elements (some may not be in shadow roots).
    for (const a of doc.querySelectorAll('a[href]')) {
      const href = a.getAttribute('href') || '';
      const dl   = a.getAttribute('download');
      if (!href || seenSrcs.has(href)) continue;
      const isAudio    = AUDIO_EXT_RE_CS.test(href);
      const isCDNAudio  = AUDIO_CDN_RE_CS.test(href) && (dl !== null || isAudio || AUDIO_CT_RE_CS.test(href));
      if (!isAudio && !isCDNAudio) continue;
      seenSrcs.add(href);
      logger.info('[bAInder] audio anchor (light DOM):', href.slice(0, 100));
      const resolved = await _captureAudioSrc(href);
      if (resolved === 'too_large')   markers.push('[\uD83D\uDD0A Generated audio (file too large to capture)]');
      else if (resolved)              markers.push(`[\uD83D\uDD0A Generated audio](${resolved})`);
    }

    // 2d. Brute-force: scan the page HTML for CDN URLs.
    //     Catches file URLs embedded in React data props, inline scripts, JSON blobs, etc.
    //     that are invisible to DOM anchor/audio element scanning.
    //     For <a download> CDN links we already captured them in 2b/2c above.
    //     Here we also scan innerHTML to catch hidden/deferred URLs.
    try {
      const htmlContent = doc.documentElement ? doc.documentElement.innerHTML : '';
      let _htmlCDNCount = 0;
      for (const re of [
        /https:\/\/files\.oaiusercontent\.com\/[^\s"'<>)]+/g,
        /https:\/\/storage\.googleapis\.com\/[^\s"'<>)]+/g,
        /https:\/\/contribution\.usercontent\.google\.com\/[^\s"'<>)]+/g,
      ]) {
        let _m;
        while ((_m = re.exec(htmlContent)) !== null) {
          const url = _m[0].replace(/&amp;/g, '&').replace(/[)"'\\,]+$/, '');
          _htmlCDNCount++;
          if (seenSrcs.has(url)) continue;
          // Log every CDN URL found in HTML for diagnosis.
          logger.info('[bAInder] HTML-scan CDN URL (audio-hint=' +
            (AUDIO_EXT_RE_CS.test(url) || AUDIO_CT_RE_CS.test(url)) + '):', url.slice(0, 120));
          // Only fetch URLs that have an audio hint in them.
          if (!AUDIO_EXT_RE_CS.test(url) && !AUDIO_CT_RE_CS.test(url)) continue;
          seenSrcs.add(url);
          const resolved = await _captureAudioSrc(url);
          if (resolved === 'too_large') markers.push('[\uD83D\uDD0A Generated audio (file too large to capture)]');
          else if (resolved)            markers.push(`[\uD83D\uDD0A Generated audio](${resolved})`);
        }
      }
      if (_htmlCDNCount === 0) logger.info('[bAInder] HTML-scan: no CDN URLs found in page HTML');
    } catch (_) {}

    // 2e. Direct query for CDN download anchors — broadest net, content-type verified on fetch.
    //     This catches <a download href="https://files.oaiusercontent.com/..."> without audio hints.
    try {
      const _cdnDLAnchors = doc.querySelectorAll(
        'a[download][href*="files.oaiusercontent.com"],' +
        'a[download][href*="storage.googleapis.com"],' +
        'a[download][href*="storage.cloud.google.com"]');
      for (const a of _cdnDLAnchors) {
        const href = a.href || a.getAttribute('href') || '';
        if (!href || seenSrcs.has(href)) continue;
        seenSrcs.add(href);
        logger.info('[bAInder] CDN download anchor (no-hint capture):', href.slice(0, 100));
        const resolved = await _captureAudioSrc(href);
        if (resolved === 'too_large') markers.push('[\uD83D\uDD0A Generated audio (file too large to capture)]');
        else if (resolved)            markers.push(`[\uD83D\uDD0A Generated audio](${resolved})`);
      }
    } catch (_) {}

    logger.info('[bAInder] collectAudioFromPage done: ' + markers.length + ' marker(s)');
    return markers;
  }

  // Scoped variant: walk just `el`'s subtree (no meta-cache read).
  // `seenSrcs` is a shared Set — pass the same instance across all turns so
  // URLs captured in one turn are not double-counted in the residual page sweep.
  async function collectAudioFromElement(el, seenSrcs) {
    const markers = [];
    const { audioSrcs, anchorHrefs, hasUnresolvableAudio } = collectShadowAudio(el, 8);
    for (const src of audioSrcs) {
      if (seenSrcs.has(src)) continue;
      seenSrcs.add(src);
      logger.info('[bAInder] per-turn audio el:', src.slice(0, 80));
      const resolved = await _captureAudioSrc(src);
      if (resolved === 'too_large')  markers.push('[\uD83D\uDD0A Generated audio (file too large to capture)]');
      else if (resolved)             markers.push(`[\uD83D\uDD0A Generated audio](${resolved})`);
      else                           markers.push(`[\uD83D\uDD0A Generated audio (not captured)](${(typeof location !== 'undefined' && location.href) || ''})`);
    }
    for (const href of anchorHrefs) {
      if (seenSrcs.has(href)) continue;
      seenSrcs.add(href);
      logger.info('[bAInder] per-turn audio anchor:', href.slice(0, 100));
      const resolved = await _captureAudioSrc(href);
      if (resolved === 'too_large')  markers.push('[\uD83D\uDD0A Generated audio (file too large to capture)]');
      else if (resolved)             markers.push(`[\uD83D\uDD0A Generated audio](${resolved})`);
    }
    // If nothing was captured, check for audio UI elements that signal generated audio
    // but whose src/URL we couldn’t resolve (empty-src <audio> or ChatGPT behavior-btn).
    if (markers.length === 0) {
      let detected = hasUnresolvableAudio;
      if (!detected) {
        try {
          detected = [...el.querySelectorAll('button.behavior-btn')]
            .some(b => /download|wav|mp3|ogg|webm|aac|audio/i.test(b.textContent || ''));
        } catch (_) {}
      }
      if (detected) {
        const originalUrl = (typeof location !== 'undefined' && location.href) || '';
        logger.info('[bAInder] per-turn: audio UI detected but not capturable; emitting placeholder');
        markers.push(`[\uD83D\uDD0A Generated audio (not captured)](${originalUrl})`);
      }
    }
    return markers;
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

  async function extractChatGPT(doc) {
    const messages = [];
    const turns = doc.querySelectorAll('article[data-testid^="conversation-turn"]');
    // Shared dedup set: URLs captured per-turn are excluded from the residual sweep.
    const audioSeenSrcs = new Set();

    logger.info('[bAInder] ChatGPT extraction: turns=' + turns.length);

    // Route https: image fetches through the background service worker to bypass
    // CORP: same-site on OpenAI image CDNs (files.oaiusercontent.com, *.blob.core.windows.net).
    const bgFetch = url => new Promise((resolve, reject) => {
      logger.info('[bAInder] ChatGPT bgFetch → background:', url.slice(0, 80));
      browser.runtime.sendMessage({ type: 'FETCH_IMAGE_AS_DATA_URL', url }, resp => {
        if (browser.runtime.lastError) return reject(new Error(browser.runtime.lastError.message));
        const du = resp?.dataUrl || '';
        logger.info('[bAInder] ChatGPT bgFetch ← background: success=' + resp?.success +
          ' dataUrl.length=' + du.length + ' prefix=' + du.slice(0, 30));
        if (resp?.success && du.startsWith('data:')) resolve(du);
        else reject(new Error(resp?.error || 'invalid dataUrl from background'));
      });
    });

    for (const turn of turns) {
      const testId  = turn.getAttribute('data-testid') || '?';

      // Step 1: Determine role.
      // Newer ChatGPT (2026): assistant articles no longer carry [data-message-author-role];
      // role is signalled by a screen-reader-only h6 heading instead.
      const roleEl = turn.querySelector('[data-message-author-role]');
      let role;
      if (roleEl) {
        const rawRole = roleEl.getAttribute('data-message-author-role') || '';
        role = rawRole === 'user' ? 'user' : 'assistant';
      } else {
        const heading    = turn.querySelector('h6');
        const headingTxt = (heading?.textContent || '').trim();
        if (/chatgpt said|assistant said/i.test(headingTxt)) {
          role = 'assistant';
        } else if (/you said|i said|user said/i.test(headingTxt)) {
          role = 'user';
        } else {
          logger.info('[bAInder] ChatGPT skip turn ' + testId +
            ' | cannot determine role | h6: "' + headingTxt + '"');
          continue;
        }
      }

      // Step 2: Find content element.
      // For assistant turns, prefer the broader text-base wrapper so that generated
      // images (DALL-E) that are siblings of .markdown are included in the scope.
      // For user turns keep the existing narrow chain.
      let contentEl, contentElDesc;
      if (role === 'assistant') {
        const textBase = turn.querySelector('[class*="text-base"]');
        const markdown = turn.querySelector('.markdown');
        const prose    = turn.querySelector('[class*="prose"]');
        contentEl     = textBase || markdown || prose || roleEl || turn;
        contentElDesc = textBase ? '[class*=text-base]' : markdown ? '.markdown' : prose ? '[class*=prose]' : roleEl ? 'roleEl' : 'turn';
      } else {
        const markdown = turn.querySelector('.markdown');
        const prose    = turn.querySelector('[class*="prose"]');
        const whitePre = turn.querySelector('[class*="whitespace-pre"]');
        contentEl     = markdown || prose || whitePre || roleEl || turn;
        contentElDesc = markdown ? '.markdown' : prose ? '[class*=prose]' : whitePre ? '[class*=whitespace-pre]' : roleEl ? 'roleEl' : 'turn';
      }

      const imgsInContentEl = contentEl.querySelectorAll('img').length;
      const imgsInTurn      = turn.querySelectorAll('img').length;
      logger.info('[bAInder] ChatGPT turn ' + testId + ' ' + role +
        ' | contentEl: ' + contentElDesc +
        ' | imgs contentEl/turn: ' + imgsInContentEl + '/' + imgsInTurn);
      // stripSourceContainers returns a detached clone; pass live contentEl as dimsEl
      // so resolveImageBlobs can read getBoundingClientRect() for image dimensions.
      const processEl = role === 'assistant' ? stripSourceContainers(contentEl) : contentEl;
      const dimsEl   = role === 'assistant' ? contentEl : null;
      const resolvedEl = await resolveImageBlobs(processEl, bgFetch, dimsEl);
      let content = htmlToMarkdown(resolvedEl);
      logger.info('[bAInder] ChatGPT turn result ' + testId + ' ' + role +
        ' len=' + content.length +
        ' hasImg=' + content.includes('![') +
        ' hasPlaceholder=' + content.includes('🖼️'));
      if (role === 'assistant') content += extractSourceLinks(turn, contentEl);
      // Per-turn audio: associate audio from this turn's DOM subtree with this turn.
      if (role === 'assistant') {
        const turnAudio = await collectAudioFromElement(turn, audioSeenSrcs);
        if (turnAudio.length > 0) content = (content ? content + '\n\n' : '') + turnAudio.join('\n');
      }
      if (content) messages.push(formatMessage(role, content));
    }
    if (messages.length === 0) {
      logger.info('[bAInder] ChatGPT: primary selector found no turns, trying fallback');
      for (const el of doc.querySelectorAll('[data-message-author-role]')) {
        const role = el.getAttribute('data-message-author-role') === 'user' ? 'user' : 'assistant';
        const processEl = role === 'assistant' ? stripSourceContainers(el) : el;
        const dimsEl   = role === 'assistant' ? el : null;
        const resolvedEl = await resolveImageBlobs(processEl, bgFetch, dimsEl);
        const content = htmlToMarkdown(resolvedEl);
        logger.info('[bAInder] ChatGPT fallback turn role=' + role + ' len=' + content.length);
        if (content) messages.push(formatMessage(role, content));
      }
    }
    // ── Residual audio sweep ──────────────────────────────────────────────────
    // Reads meta-cache written by Patches 3/4 (fetch/XHR interceptors) for audio
    // captured asynchronously and not tied to a specific turn's DOM subtree.
    // audioSeenSrcs excludes URLs already collected per-turn above.
    const audioMarkers = await collectAudioFromPage(doc, audioSeenSrcs);
    if (audioMarkers.length > 0) {
      const lastAsst = [...messages].reverse().find(m => m.role === 'assistant');
      if (lastAsst) {
        if (!lastAsst.content.includes('\uD83D\uDD0A')) {
          lastAsst.content += '\n\n' + audioMarkers.join('\n');
        } else if (audioMarkers.some(m => m.includes('](data:') || m.includes('](http'))) {
          // Have real audio — replace any existing "not captured" placeholder.
          lastAsst.content = lastAsst.content.replace(/\[\uD83D\uDD0A Generated audio[^\]]*\](?!\()/g, '').trimEnd();
          lastAsst.content += '\n\n' + audioMarkers.join('\n');
        }
      } else {
        messages.push(formatMessage('assistant', audioMarkers.join('\n')));
      }
    }
    return { title: generateTitle(messages, doc.location.href), messages, messageCount: messages.length };
  }

  async function extractClaudeViaApi() {
    const pathMatch = window.location.pathname.match(/\/chat\/([a-f0-9-]+)/i);
    if (!pathMatch) throw new Error('No conversation ID in URL');
    const conversationId = pathMatch[1];

    const API_HEADERS = {
      'Accept': 'application/json',
      'anthropic-client-type': 'web',
    };

    const orgsResp = await fetch('https://claude.ai/api/organizations', {
      credentials: 'include',
      headers: API_HEADERS,
    });
    if (!orgsResp.ok) throw new Error('Failed to fetch organizations');
    const orgs = await orgsResp.json();
    if (!orgs?.length) throw new Error('No organizations found');

    // Try each org until one returns the conversation (handles multi-org accounts)
    let convResp, data;
    let lastStatus = 0;
    for (const org of orgs) {
      convResp = await fetch(
        `https://claude.ai/api/organizations/${org.uuid}/chat_conversations/${conversationId}?tree=True&rendering_mode=messages&render_all_tools=true`,
        { credentials: 'include', headers: API_HEADERS }
      );
      if (convResp.ok) { data = await convResp.json(); break; }
      lastStatus = convResp.status;
    }
    if (!data) throw new Error(`Failed to fetch conversation (${lastStatus})`);
    if (!data?.chat_messages) throw new Error('Invalid conversation data');

    // Build a UUID → message map for branch traversal
    const msgMap = {};
    for (const msg of data.chat_messages) msgMap[msg.uuid] = msg;

    // Walk from current leaf back to root to get the active branch in order
    let ordered = [];
    let cur = msgMap[data.current_leaf_message_uuid];
    while (cur) {
      ordered.unshift(cur);
      cur = msgMap[cur.parent_message_uuid];
    }
    if (!ordered.length) ordered = data.chat_messages;

    const messages = [];
    for (const msg of ordered) {
      const role = msg.sender === 'human' ? 'user' : 'assistant';
      let content = '';
      if (Array.isArray(msg.content)) {
        content = msg.content.map(b => {
        if (b.type === 'text') return b.text;
        if (b.type === 'image') {
          if (b.source?.type === 'base64' && b.source.data && b.source.media_type) {
            return `![Image](data:${b.source.media_type};base64,${b.source.data})`;
          }
          if (b.source?.type === 'url' && b.source.url) {
            return `![Image](${b.source.url})`;
          }
        }
        return null;
      }).filter(Boolean).join('\n\n');
      } else if (typeof msg.text === 'string') {
        content = msg.text;
      }
      if (content.trim()) messages.push(formatMessage(role, content.trim()));
    }

    const title = data.name || generateTitle(messages, window.location.href);
    return { title, messages, messageCount: messages.length };
  }

  async function extractGemini(doc) {
    const messages = [];
    // Gemini uses Angular custom elements with shadow DOM; images may live
    // inside those shadow roots and are invisible to querySelectorAll / cloneNode.
    // Selectors cover class-based structure AND Angular custom element names
    // (including image-generation response cards).
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
    const modelEls = removeDescendants(rawModelEls.filter(function(el) {
      const next = el.nextElementSibling;
      if (next && STOPPED_RE.test(next.textContent || '')) return false;
      const parent = el.parentElement;
      if (parent) {
        const pNext = parent.nextElementSibling;
        if (pNext && STOPPED_RE.test(pNext.textContent || '')) return false;
        if ([...parent.children].some(function(c) {
          return c !== el && STOPPED_RE.test(c.textContent || '') && (c.textContent || '').trim().length < 200;
        })) return false;
      }
      return true;
    }));
    logger.debug('[bAInder] Gemini extraction: user=%d model=%d', userEls.length, modelEls.length);
    const allEls   = [
      ...userEls.map(el => ({ el, role: 'user' })),
      ...modelEls.map(el => ({ el, role: 'assistant' }))
    ].sort((a, b) => (a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING) ? -1 : 1);
    // Shared dedup set: URLs captured per-turn are excluded from the residual sweep.
    const audioSeenSrcs = new Set();
    for (const { el, role } of allEls) {
      const processEl = role === 'assistant' ? stripSourceContainers(el) : el;
      // Route https: fetches through the background service worker to bypass CORP:
      // same-site enforcement on lh3.google.com (extension origin is not same-site).
      const bgFetch = url => new Promise((resolve, reject) => {
        logger.info('[bAInder] bgFetch → background:', url.slice(0, 80));
        browser.runtime.sendMessage({ type: 'FETCH_IMAGE_AS_DATA_URL', url }, resp => {
          if (browser.runtime.lastError) return reject(new Error(browser.runtime.lastError.message));
          const du = resp?.dataUrl || '';
          logger.info('[bAInder] bgFetch ← background: success=' + resp?.success +
            ' dataUrl.length=' + du.length + ' prefix=' + du.slice(0, 30));
          if (resp?.success && du.startsWith('data:')) resolve(du);
          else reject(new Error(resp?.error || 'invalid dataUrl from background'));
        });
      });
      const resolvedEl = await resolveImageBlobs(processEl, bgFetch, el);
      let content = htmlToMarkdown(resolvedEl);
      // Supplement with images inside shadow-DOM roots (Gemini custom elements).
      content = await appendShadowImages(el, content, bgFetch);
      // Strip "Gemini said" role-label headings and "You stopped this response"
      // markers that Gemini injects into the DOM as part of its response elements.
      if (role === 'assistant') content = content.split('\n').filter(function(l) {
        const t = l.trim();
        return !/^#{0,6}\s*gemini said:?\s*$/i.test(t) && !/^you stopped this response\.?\s*$/i.test(t);
      }).join('\n').replace(/^\s+/, '');
      logger.debug('[bAInder] Gemini turn:', role, el.tagName,
        '| light imgs:', el.querySelectorAll('img').length,
        '| markdown len:', content.length);
      if (role === 'assistant') content += extractSourceLinks(el);
      // Per-turn audio: associate audio from this turn's DOM subtree with this turn.
      if (role === 'assistant') {
        const turnAudio = await collectAudioFromElement(el, audioSeenSrcs);
        if (turnAudio.length > 0) content = (content ? content + '\n\n' : '') + turnAudio.join('\n');
      }
      if (content) messages.push(formatMessage(role, content));
    }
    // ── Residual audio sweep (Gemini) ────────────────────────────────────────
    // audioSeenSrcs excludes URLs already collected per-turn above.
    const audioMarkersG = await collectAudioFromPage(doc, audioSeenSrcs);
    if (audioMarkersG.length > 0) {
      const lastAsstG = [...messages].reverse().find(m => m.role === 'assistant');
      if (lastAsstG) {
        if (!lastAsstG.content.includes('\uD83D\uDD0A')) {
          lastAsstG.content += '\n\n' + audioMarkersG.join('\n');
        } else if (audioMarkersG.some(m => m.includes('](data:') || m.includes('](http'))) {
          lastAsstG.content = lastAsstG.content.replace(/\[\uD83D\uDD0A Generated audio[^\]]*\](?!\()/g, '').trimEnd();
          lastAsstG.content += '\n\n' + audioMarkersG.join('\n');
        }
      } else {
        messages.push(formatMessage('assistant', audioMarkersG.join('\n')));
      }
    }
    return { title: generateTitle(messages, doc.location.href), messages, messageCount: messages.length };
  }

  // Removes elements that are descendants of another element in the same list.
  // Prevents wildcard selectors (e.g. [class*="user-query"]) from matching both
  // an outer wrapper and its inner content child, which would duplicate messages.
  // Used by extractGemini and extractCopilot.
  function removeDescendants(els) {
    return els.filter(el => !els.some(other => other !== el && other.contains(el)));
  }

  // Strips Copilot UI role-label lines ("You said:", "Copilot said:") and
  // BizChat / M365 feedback UI noise from markdown content.
  // Defined at IIFE scope so it is available in the contextmenu handler and
  // EXTRACT_EXCERPT message handler, not just inside extractCopilot.
  const LABEL_RE = /^#{0,6}\s*(you said|i said|copilot said|copilot):?\s*$/i;
  const UI_NOISE_RE = /^(provide your feedback on (bizchat|copilot|m365|microsoft 365|bing)|was this (response|answer) helpful\??|helpful\s*not helpful|thumbs up|thumbs down|report a concern|give feedback|feedback on this response|like\s*dislike)\s*$/i;
  function stripRoleLabels(content) {
    return content
      .split('\n')
      .filter(line => {
        const t = line.trim();
        return !LABEL_RE.test(t) && !UI_NOISE_RE.test(t);
      })
      .join('\n')
      .replace(/^\s+/, '');
  }

  // CSS selectors for source / citation containers across all supported platforms.
  const SOURCE_CONTAINER_SELECTORS = [
    '[data-testid*="citation"]', '[class*="CitationBubble"]',
    '[class*="SearchResult"]',   '[class*="citation-list"]',
    '[class*="attribution"]',    'source-citation',
    '[class*="source-chip"]',    '[class*="SourceCard"]',
    '[class*="sourceCard"]',     '[class*="ReferenceCard"]',
    '[class*="referenceCard"]',  '[class*="CitationCard"]',
    '[class*="citationCard"]',   '[data-testid*="source-card"]',
    '[data-testid*="sources"]',  '[data-testid^="sources-button"]',
    '[data-test-id*="sources"]', '[data-test-id^="sources-button"]', // hyphenated variant
    '[data-testid="foot-note-div"]',  // Copilot footnote bar that shows "Sources" text
    '[aria-label="Sources"]',    '[aria-label="References"]', '[aria-label="Citations"]',
  ].join(', ');

  // Clone `el` and remove source/citation containers and source-labelled buttons
  // so htmlToMarkdown does not render them as part of the message content.
  // Links are extracted separately by extractSourceLinks on the ORIGINAL element.
  function stripSourceContainers(el) {
    const clone = el.cloneNode(true);
    try { clone.querySelectorAll(SOURCE_CONTAINER_SELECTORS).forEach(n => n.remove()); } catch (_) {}
    // Also strip any descendant whose data-testid OR data-test-id contains "source"
    try {
      clone.querySelectorAll('[data-testid],[data-test-id]').forEach(n => {
        const id = (n.getAttribute('data-testid') || n.getAttribute('data-test-id') || '').toLowerCase();
        if (id.includes('source')) n.remove();
      });
    } catch (_) {}
    try {
      const SOURCES_RE = /\b(source|sources|reference|references|citation|citations)\b/i;
      clone.querySelectorAll('button,[role="button"]').forEach(btn => {
        if (SOURCES_RE.test((btn.getAttribute('aria-label') || btn.textContent || '').trim())) btn.remove();
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
      // Also catch any remaining element whose sole visible text is the feedback prompt
      clone.querySelectorAll('*').forEach(n => {
        if (n.children.length === 0 && FEEDBACK_RE.test(n.textContent || '')) n.remove();
      });
    } catch (_) {}
    // Strip Copilot M365 UI chrome: role-label headings, logo, action bar containers
    // These are accessibility/UI scaffolding, not message content.
    try {
      clone.querySelectorAll([
        '[class*="accessibleHeading"]',      // h5/h6 "Copilot said:" / "You said:"
        '[data-testid="messageAttributionIcon"]', // Copilot logo
        '[data-testid="CopyButtonContainerTestId"]', // "Provide your feedback on BizChat"
        '[data-testid="FeedbackContainerTestId"]',   // feedback thumbs up/down
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

  /**
   * Append external source / citation links found in `turnEl` that are not
   * already present in the extracted `content` string.
   *
   * Part A – sibling source containers: when `contentEl` is a specific child of
   *   `turnEl`, source cards living outside `contentEl` are harvested.
   * Part B – button-hidden links: htmlToMarkdown skips <button> content; any
   *   <button> whose label/text mentions "sources/references/citations" is
   *   scanned for <a href> links.
   *
   * @param {Element}      turnEl     Outer turn / article element
   * @param {Element|null} contentEl  Sub-element already processed (or null)
   * @returns {string}
   */
  function extractSourceLinks(turnEl, contentEl) {
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
    // Part A
    if (contentEl && contentEl !== turnEl) {
      // Sibling path (ChatGPT): look for containers OUTSIDE the already-processed contentEl.
      try {
        for (const c of Array.from(turnEl.querySelectorAll(SOURCE_CONTAINER_SELECTORS))) {
          if (contentEl.contains(c)) continue;
          Array.from(c.querySelectorAll('a[href]')).forEach(recordLink);
        }
      } catch (_) {}
    } else {
      // Full-element path (Claude/Gemini/Copilot): source containers are inside
      // turnEl — stripped from the clone before htmlToMarkdown, extracted here.
      try {
        for (const c of Array.from(turnEl.querySelectorAll(SOURCE_CONTAINER_SELECTORS))) {
          Array.from(c.querySelectorAll('a[href]')).forEach(recordLink);
        }
      } catch (_) {}
    }
    // Part B
    try {
      const SOURCES_RE = /\b(source|sources|reference|references|citation|citations)\b/i;
      const scope = contentEl || turnEl;
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
    } catch (_) {}

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

  async function extractCopilot(doc) {
    const messages = [];
    const DBG = '[extractCopilot]';

    // Scope to the main conversation area so sidebar history items are excluded.
    const scopeCandidates = [
      { sel: '[data-testid="chat-page"]',                   label: '[data-testid="chat-page"]' },
      { sel: 'main',                                        label: 'main' },
      { sel: '[role="main"]',                               label: '[role="main"]' },
      { sel: '[class*="conversation"][class*="container"]', label: '[class*="conversation"][class*="container"]' },
    ];
    let chatScope = doc;
    let chatScopeLabel = 'document (fallback)';
    for (const { sel, label } of scopeCandidates) {
      const el = doc.querySelector(sel);
      if (el) { chatScope = el; chatScopeLabel = label; break; }
    }
    logger.debug(`${DBG} chatScope: ${chatScopeLabel}`, {
      tag:        chatScope === doc ? 'document' : chatScope.tagName,
      id:         chatScope.id || '',
      class:      (typeof chatScope.className === 'string' ? chatScope.className : '').slice(0, 120),
      role:       chatScope.getAttribute ? (chatScope.getAttribute('role') || '') : '',
      childCount: chatScope.children ? chatScope.children.length : 0,
    });

    // Returns the specific predicate selector that matches, or null if the element
    // is NOT inside a history/sidebar panel. Returning the string (not just bool)
    // lets the debug logging show exactly which predicate fires.
    const HISTORY_PANEL_PREDICATES = [
      'aside',
      '[role="complementary"]',
      '[role="navigation"]',
      '[class*="history"]',
      '[data-testid="sidebar-container"]',
      '[data-testid="backstage-chats"]',
      '[data-testid="highlighted-chats"]',
      '[data-testid="sidebar-expanded-content"]',
    ];
    const inHistoryPanel = el => {
      for (const sel of HISTORY_PANEL_PREDICATES) {
        if (el.closest(sel)) return sel;
      }
      return null;
    };
    const inHistoryPanelBool = el => !!inHistoryPanel(el);

    // ── Fast path: data-content attributes are stable, Copilot-assigned semantic
    // markers that only appear on real conversation messages (confirmed: sidebar
    // history items do NOT carry these attributes).  Skip inHistoryPanel entirely.
    const trustedUserEls   = Array.from(doc.querySelectorAll('[data-content="user-message"]'));
    const trustedAssistEls = Array.from(doc.querySelectorAll('[data-content="ai-message"]'));

    let rawUserEls, rawCopilotEls;

    if (trustedUserEls.length > 0 || trustedAssistEls.length > 0) {
      rawUserEls    = trustedUserEls;
      rawCopilotEls = trustedAssistEls;
      logger.debug(`${DBG} Fast path via data-content: ${rawUserEls.length} user, ${rawCopilotEls.length} assistant`);
    } else {
      // ── Fallback: broad class/testid selectors + history-panel filtering ──
      logger.debug(`${DBG} data-content not found — falling back to broad selectors`);

      // Returns the specific predicate selector that matched, or null.
      const HISTORY_PANEL_PREDICATES = [
        'aside',
        '[role="complementary"]',
        '[role="navigation"]',
        '[class*="history"]',
        '[data-testid="sidebar-container"]',
        '[data-testid="backstage-chats"]',
        '[data-testid="highlighted-chats"]',
        '[data-testid="sidebar-expanded-content"]',
      ];
      const inHistoryPanel     = el => { for (const s of HISTORY_PANEL_PREDICATES) { if (el.closest(s)) return s; } return null; };
      const inHistoryPanelBool = el => !!inHistoryPanel(el);

      const userSelectors = [
        '[class~="group/user-message"]',
        '[data-testid="user-message"]',
        '.UserMessage', '[class*="UserMessage"]', '[class*="user-message"]',
        '[class*="userMessage"]', '[class*="HumanMessage"]', '[class*="human-message"]',
        '[data-author-role="user"]', '[data-content-type="user"]',
        '[aria-label*="You said"]', '[aria-label*="you said"]',
      ];
      const assistantSelectors = [
        '[class~="group/ai-message-item"]',
        '[class~="group/ai-message"]',
        '[data-testid="ai-message"]', '[data-testid="copilot-message"]', '[data-testid="assistant-message"]',
        '[class*="ai-message"]', '[class*="CopilotMessage"]', '[class*="AssistantMessage"]', '[class*="copilot-message"]',
        '[class*="botMessage"]',   '[class*="BotMessage"]',   '[class*="bot-message"]',
        '[data-author-role="assistant"]', '[data-author-role="bot"]',
        '[aria-label*="Copilot said"]', '[aria-label*="Copilot:"]',
      ];

      // Log per-selector hits.
      const userSelectorHits = [];
      userSelectors.forEach(sel => {
        try {
          const inScope = chatScope.querySelectorAll(sel).length;
          const inDoc   = doc.querySelectorAll(sel).length;
          if (inScope > 0 || inDoc > 0) userSelectorHits.push({ sel, inScope, inDoc });
        } catch (e) { userSelectorHits.push({ sel, error: e.message }); }
      });
      logger.debug(userSelectorHits.length > 0
        ? `${DBG} User selectors with hits:` : `${DBG} User selectors: NO HITS`,
        userSelectorHits);

      const assistSelectorHits = [];
      assistantSelectors.forEach(sel => {
        try {
          const inScope = chatScope.querySelectorAll(sel).length;
          const inDoc   = doc.querySelectorAll(sel).length;
          if (inScope > 0 || inDoc > 0) assistSelectorHits.push({ sel, inScope, inDoc });
        } catch (e) { assistSelectorHits.push({ sel, error: e.message }); }
      });
      logger.debug(assistSelectorHits.length > 0
        ? `${DBG} Assistant selectors with hits:` : `${DBG} Assistant selectors: NO HITS`,
        assistSelectorHits);

      const dedup = els => [...new Set(els)];
      const rawUserElsAll = dedup(userSelectors.flatMap(sel => {
        try { return Array.from(chatScope.querySelectorAll(sel)); } catch (_) { return []; }
      }));
      const rawCopilotElsAll = dedup(assistantSelectors.flatMap(sel => {
        try { return Array.from(chatScope.querySelectorAll(sel)); } catch (_) { return []; }
      }));

      const ancestorChain = el => {
        const chain = [];
        let cur = el.parentElement;
        for (let i = 0; i < 6 && cur && cur !== doc.documentElement; i++, cur = cur.parentElement) {
          chain.push({ tag: cur.tagName, testid: cur.getAttribute('data-testid') || '', role: cur.getAttribute('role') || '', class: (typeof cur.className === 'string' ? cur.className : '').split(' ').slice(0, 4).join(' ') });
        }
        return chain;
      };

      const userFilteredOut   = rawUserElsAll.filter(el => inHistoryPanelBool(el));
      const assistFilteredOut = rawCopilotElsAll.filter(el => inHistoryPanelBool(el));
      if (userFilteredOut.length > 0) {
        logger.debug(`${DBG} ${userFilteredOut.length} user element(s) removed by inHistoryPanel:`,
          userFilteredOut.slice(0, 5).map(el => ({ tag: el.tagName, testid: el.getAttribute('data-testid') || '', class: (el.className || '').slice(0, 80), triggeringPred: inHistoryPanel(el), ancestors: ancestorChain(el) })));
      }
      if (assistFilteredOut.length > 0) {
        logger.debug(`${DBG} ${assistFilteredOut.length} assistant element(s) removed by inHistoryPanel:`,
          assistFilteredOut.slice(0, 5).map(el => ({ tag: el.tagName, testid: el.getAttribute('data-testid') || '', class: (el.className || '').slice(0, 80), triggeringPred: inHistoryPanel(el), ancestors: ancestorChain(el) })));
      }

      rawUserEls    = rawUserElsAll.filter(el => !inHistoryPanelBool(el));
      rawCopilotEls = rawCopilotElsAll.filter(el => !inHistoryPanelBool(el));
    }

    logger.debug(`${DBG} Found ${rawUserEls.length} user messages, ${rawCopilotEls.length} assistant messages`);

    // ── DOM fingerprint: runs when no messages are found ──────────────────
    // This dumps actionable clues about what the current Copilot DOM looks like
    // so the selectors can be updated to match the new structure.
    if (rawUserEls.length === 0 && rawCopilotEls.length === 0) {
      logger.debug(`${DBG} ⚠ No messages matched — dumping DOM fingerprint to help fix selectors:`);

      // 1. All data-testid values that are message/chat related
      const testIdEls = Array.from(doc.querySelectorAll('[data-testid]'))
        .filter(el => /message|user|bot|ai|assistant|copilot|human|turn|chat|query|response|thread|bubble/i
          .test(el.getAttribute('data-testid') || ''));
      logger.debug(`${DBG} [data-testid] message-related (${testIdEls.length}):`,
        testIdEls.slice(0, 15).map(el => ({
          testid: el.getAttribute('data-testid'),
          tag:    el.tagName,
          class:  (el.className || '').slice(0, 80),
        })));

      // 2. All data-testid values seen on the page (top 40, sorted)
      const allTestIds = [...new Set(
        Array.from(doc.querySelectorAll('[data-testid]'))
          .map(el => el.getAttribute('data-testid') || '')
          .filter(Boolean)
      )].sort();
      logger.debug(`${DBG} All data-testid values on page (${allTestIds.length}):`, allTestIds.slice(0, 40));

      // 3. Class-name tokens that look like message containers
      const msgClassTokens = [...new Set(
        Array.from(doc.querySelectorAll('*'))
          .flatMap(el => {
            const c = typeof el.className === 'string' ? el.className : '';
            return c.split(/\s+/).filter(t =>
              /message|usermsg|botmsg|humanmsg|copilot|assistant|ai-|bubble|turn|chat[-_]?item|query|response/i.test(t)
            );
          })
      )].sort();
      logger.debug(`${DBG} Message-related class tokens in DOM (${msgClassTokens.length}):`, msgClassTokens.slice(0, 40));

      // 4. Elements with ARIA roles that typically wrap conversation content
      ['feed', 'log', 'list', 'listitem', 'article', 'region'].forEach(role => {
        const els = Array.from(doc.querySelectorAll(`[role="${role}"]`));
        if (els.length > 0) {
          logger.debug(`${DBG} [role="${role}"] (${els.length}):`,
            els.slice(0, 5).map(el => ({
              tag:       el.tagName,
              class:     (el.className || '').slice(0, 80),
              ariaLabel: el.getAttribute('aria-label') || '',
              testid:    el.getAttribute('data-testid') || '',
              childCount: el.children.length,
            })));
        }
      });

      // 5. Elements with data-author-role / data-message-* / data-content-type
      ['[data-author-role]', '[data-message-author-role]', '[data-content-type]', '[data-message-id]'].forEach(attrSel => {
        const els = Array.from(doc.querySelectorAll(attrSel));
        if (els.length > 0) {
          const attrName = attrSel.replace(/[\[\]]/g, '').split('=')[0];
          logger.debug(`${DBG} ${attrSel} (${els.length}):`,
            els.slice(0, 8).map(el => ({
              value: el.getAttribute(attrName),
              tag:   el.tagName,
              class: (el.className || '').slice(0, 80),
            })));
        }
      });

      // 6. aria-label elements mentioning "said", "message", "Copilot", "You"
      const ariaLabelEls = Array.from(doc.querySelectorAll('[aria-label]'))
        .filter(el => /said|message|copilot|you said|assistant/i.test(el.getAttribute('aria-label') || ''));
      if (ariaLabelEls.length > 0) {
        logger.debug(`${DBG} aria-label conversation elements (${ariaLabelEls.length}):`,
          ariaLabelEls.slice(0, 10).map(el => ({
            ariaLabel: el.getAttribute('aria-label'),
            tag:       el.tagName,
            class:     (el.className || '').slice(0, 80),
          })));
      }

      // 7. Direct children of chatScope — structural overview of the conversation area
      const scopeChildren = Array.from(chatScope.children || []).slice(0, 20);
      logger.debug(`${DBG} chatScope direct children (${chatScope.children?.length || 0}):`,
        scopeChildren.map(el => ({
          tag:        el.tagName,
          id:         el.id || '',
          class:      (el.className || '').slice(0, 100),
          role:       el.getAttribute('role') || '',
          testid:     el.getAttribute('data-testid') || '',
          ariaLabel:  el.getAttribute('aria-label') || '',
          childCount: el.children.length,
        })));

      // 8. Second-level children of chatScope (the first few in each direct child)
      logger.debug(`${DBG} chatScope grandchildren (first 3 per child, first 5 children):`);
      Array.from(chatScope.children || []).slice(0, 5).forEach((child, ci) => {
        const grandkids = Array.from(child.children).slice(0, 3);
        if (grandkids.length > 0) {
          logger.debug(`  child[${ci}] ${child.tagName}.${(child.className||'').split(' ')[0]} grandchildren:`,
            grandkids.map(el => ({
              tag:       el.tagName,
              class:     (el.className || '').slice(0, 100),
              role:      el.getAttribute('role') || '',
              testid:    el.getAttribute('data-testid') || '',
              ariaLabel: el.getAttribute('aria-label') || '',
              childCount: el.children.length,
            })));
        }
      });
    }

    const userEls    = removeDescendants(rawUserEls);
    const copilotEls = removeDescendants(rawCopilotEls);

    const allEls = [
      ...userEls.map(el => ({ el, role: 'user' })),
      ...copilotEls.map(el => ({ el, role: 'assistant' }))
    ].sort((a, b) => (a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING) ? -1 : 1);

    for (const { el, role } of allEls) {
      const processEl = role === 'assistant' ? stripSourceContainers(el) : el;
      // Route https: image fetches through the background service worker to bypass
      // CORP: same-site on Bing image CDNs (th.bing.com, www.bing.com).
      const bgFetch = url => new Promise((resolve, reject) => {
        logger.info('[bAInder] Copilot bgFetch → background:', url.slice(0, 80));
        browser.runtime.sendMessage({ type: 'FETCH_IMAGE_AS_DATA_URL', url }, resp => {
          if (browser.runtime.lastError) return reject(new Error(browser.runtime.lastError.message));
          const du = resp?.dataUrl || '';
          logger.info('[bAInder] Copilot bgFetch ← background: success=' + resp?.success +
            ' dataUrl.length=' + du.length + ' prefix=' + du.slice(0, 30));
          if (resp?.success && du.startsWith('data:')) resolve(du);
          else reject(new Error(resp?.error || 'invalid dataUrl from background'));
        });
      });
      const resolvedEl = await resolveImageBlobs(processEl, bgFetch, el);
      let content = stripRoleLabels(htmlToMarkdown(resolvedEl));
      logger.info('[bAInder] Copilot turn content length=' + content.length +
        ' hasImg=' + content.includes('![') + ' hasPlaceholder=' + content.includes('🖼️'));
      if (role === 'assistant') content += extractSourceLinks(el);
      if (content) messages.push(formatMessage(role, content));
    }

    return { title: generateTitle(messages, doc.location?.href || ''), messages, messageCount: messages.length };
  }

  async function extractPerplexity(doc) {
    const messages = [];

    const chatScope =
      doc.querySelector('main') ||
      doc.querySelector('[role="main"]') ||
      doc;

    const USER_SEL = [
      '[class*="query"]',
      '[class*="UserMessage"]',
      '[class*="user-message"]',
      '[class*="Question"]',
    ].join(', ');

    const ANSWER_SEL = [
      '.prose',
      '.relative.default > div > div',
    ].join(', ');

    const rawUserEls   = removeDescendants(Array.from(chatScope.querySelectorAll(USER_SEL)));
    const rawAnswerEls = removeDescendants(Array.from(chatScope.querySelectorAll(ANSWER_SEL)));

    logger.debug('[bAInder] Perplexity extraction: user=%d answer=%d',
      rawUserEls.length, rawAnswerEls.length);

    const allEls = [
      ...rawUserEls.map(el => ({ el, role: 'user' })),
      ...rawAnswerEls.map(el => ({ el, role: 'assistant' })),
    ].sort((a, b) => {
      const pos = a.el.compareDocumentPosition(b.el);
      return pos & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
    });

    const _SOURCES_HEADER_RE = /^#{0,6}\s*sources?\s*$/i;
    const _SOURCE_COUNT_RE   = /^\d+\s+sources?\s*$/i;
    const _FOOTNOTE_ONLY_RE  = /^(\s*\[\d+\]\s*)+$/;

    for (const { el, role } of allEls) {
      const processEl = role === 'assistant' ? stripSourceContainers(el) : el;
      let content = htmlToMarkdown(processEl);
      if (role === 'assistant') {
        content = content
          .split('\n')
          .filter(line => {
            const t = line.trim();
            return !_SOURCES_HEADER_RE.test(t) &&
                   !_SOURCE_COUNT_RE.test(t) &&
                   !_FOOTNOTE_ONLY_RE.test(t);
          })
          .join('\n')
          .replace(/^\s+/, '');
      }
      const msg = formatMessage(role, content);
      if (msg) messages.push(msg);
    }

    let title = '';
    const h1 = doc.querySelector('h1');
    if (h1 && h1.textContent?.trim()) {
      title = h1.textContent.trim();
    } else {
      const rawTitle = doc.title || '';
      title = rawTitle.replace(/\s*[-|\u2013]\s*perplexity\s*$/i, '').trim();
    }
    if (!title) title = generateTitle(messages, doc.location?.href || '');

    return { title, messages, messageCount: messages.length };
  }

  async function extractDeepSeek(doc) {
    const messages = [];
    const _UI_NOISE_RE     = /^(retry|copy|share|edit|regenerate)$/i;
    const _TITLE_SUFFIX_RE = /\s*[-|\u2013]\s*deepseek\s*$/i;

    const nodes = removeDescendants(Array.from(doc.querySelectorAll('.ds-message')));
    for (const el of nodes) {
      const style = (el.getAttribute('style') || '').toLowerCase();
      const role  = style.includes('--assistant') ? 'assistant' : 'user';
      const content = htmlToMarkdown(el)
        .split('\n')
        .filter(line => !_UI_NOISE_RE.test(line.trim()))
        .join('\n')
        .trim();
      if (!content) continue;
      messages.push(formatMessage(role, content));
    }

    const pageTitle = (doc.title || '').replace(_TITLE_SUFFIX_RE, '').trim();
    const firstUser = messages.find(m => m.role === 'user')?.content || '';
    const title = pageTitle || firstUser || generateTitle(messages, doc.location?.href || '');
    return { title, messages, messageCount: messages.length };
  }

  async function extractChat(platform, doc) {
    if (!platform) throw new Error('Platform is required');
    if (!doc)      throw new Error('Document is required');
    let result;
    switch (platform) {
      case 'chatgpt': result = await extractChatGPT(doc); break;
      case 'claude':  result = extractClaude(doc);  break;
      case 'gemini':   result = await extractGemini(doc);   break;
      case 'copilot':     result = await extractCopilot(doc);     break;
      case 'perplexity':  result = await extractPerplexity(doc);  break;
      case 'deepseek':    result = await extractDeepSeek(doc);    break;
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

  // ─── Selection pre-capture for excerpt saves ───────────────────────────────
  // Chrome clears the page selection by the time a context menu item is clicked.
  // On right-click we immediately push the rich markdown to the background script
  // so it's already cached there when the context menu item fires — no round-trip
  // timing issues, and works regardless of which frame received the event.
  document.addEventListener('contextmenu', async () => {
    try {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
        return;
      }
      const fragment = sel.getRangeAt(0).cloneContents();
      const wrapper  = document.createElement('div');
      wrapper.appendChild(fragment);

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
          logger.debug('[bAInder] On-demand capture for Designer iframe (contextmenu)', iframeid);
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

      if (!markdown) {
        return;
      }

      // Guard: browser.runtime.id becomes undefined when the extension context is
      // invalidated (e.g. after a reload). The page must be refreshed to reconnect.
      if (!browser?.runtime?.id) {
        return;
      }

      browser.runtime.sendMessage({
        type: 'STORE_EXCERPT_CACHE',
        data: { markdown }
      }).catch(() => {});
    } catch (err) {
      logger.error('[bAInder] contextmenu error:', err);
    }
  });

  // ─── Chrome Messaging ──────────────────────────────────────────────────────

  /**
   * Send a message to the background script and return the response promise.
   * @param {Object} msg
   * @returns {Promise<Object>}
   */
  function sendMessage(msg) {
    if (!browser?.runtime?.id) {
      return Promise.reject(new Error('Extension context invalidated — please reload the page'));
    }
    return browser.runtime.sendMessage(msg);
  }

  // ─── Incoming Message Handler ──────────────────────────────────────────────

  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    const platform = detectPlatform(window.location.hostname);

    switch (message.type) {


      case 'EXTRACT_CHAT': {
        if (!platform) {
          sendResponse({ success: false, error: 'Not on a supported AI chat platform' });
          return false;
        }
        (async () => {
          try {
            let chatData;
            if (platform === 'claude') {
              const result = await extractClaudeViaApi();
              chatData = {
                platform,
                url: window.location.href,
                title: result.title,
                messages: result.messages,
                messageCount: result.messageCount,
                extractedAt: Date.now(),
              };
            } else {
              chatData = await extractChat(platform, document);
            }
            sendResponse({ success: true, data: prepareChatForSave(chatData) });
          } catch (err) {
            sendResponse({ success: false, error: err.message });
          }
        })();
        return true; // keep message channel open for async sendResponse
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
    logger.debug('[bAInder] URL change detected', { from: lastUrl, to: currentUrl });
    lastUrl = currentUrl;
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
      logger.debug('[bAInder] Not on a supported AI chat platform');
      return;
    }
    logger.info('[bAInder] Platform detected:', platform);
    logger.info('[bAInder] Content script ready');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initContentScript);
  } else {
    initContentScript();
  }

  logger.info('[bAInder] Content script loaded on:', window.location.hostname);

})(); // end IIFE
