/**
 * DOM-to-Markdown converter.
 * Walks a DOM element tree and produces a Markdown string.
 *
 * Handles: headings, bold/italic, inline code, fenced code blocks,
 * ordered/unordered lists, blockquotes, paragraphs, line breaks, links,
 * images, Microsoft Designer iframes, M365 Copilot Fluent UI code blocks.
 * Skips: script, style, svg, button, aria-hidden elements.
 */

// ── M365 Copilot / Fluent UI code-block constants ────────────────────────────
const _COPILOT_SKIP  = new Set(['button','script','style','svg','path','noscript','template','img']);
const _COPILOT_BLOCK = new Set(['div','p','li','tr','section','article','header','footer','pre']);
const _KNOWN_LANG    = /^(javascript|typescript|python|java|c#|csharp|c\+\+|cpp|ruby|go|rust|css|scss|html|xml|json|bash|shell|sh|sql|php|swift|kotlin|scala|r|matlab|yaml|toml|markdown)$/i;

/**
 * Handle M365 Copilot / Fluent UI code blocks.
 * These are rendered without <pre>/<code> — detected by ARIA label or scriptor class.
 * @param {Element} node
 * @returns {string|null}  Fenced Markdown code block, or null if node is not a Copilot block.
 */
function _extractCopilotCodeBlock(node) {
  const ariaLabel = node.getAttribute('aria-label') || '';
  const nodeClass  = typeof node.className === 'string' ? node.className : '';
  if (ariaLabel !== 'Code Preview' && !nodeClass.includes('scriptor-component-code-block')) {
    return null;
  }

  const extractRaw = n => {
    if (n.nodeType === 3) return n.textContent || '';
    if (n.nodeType !== 1) return '';
    if (_COPILOT_SKIP.has(n.tagName.toLowerCase())) return '';
    if (n.getAttribute && n.getAttribute('aria-hidden') === 'true') return '';
    const isBlock = _COPILOT_BLOCK.has(n.tagName.toLowerCase());
    const inner   = Array.from(n.childNodes).map(extractRaw).join('');
    return isBlock ? inner + '\n' : inner;
  };

  const raw   = extractRaw(node).replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n').trim();
  const lines = raw.split('\n');
  let lang = '', start = 0;
  if (lines.length > 0 && _KNOWN_LANG.test(lines[0].trim())) {
    lang  = lines[0].trim().toLowerCase().replace('c#', 'csharp').replace('c++', 'cpp');
    start = 1;
  }
  const code = lines.slice(start).join('\n').trim();
  return code ? `\n\`\`\`${lang}\n${code}\n\`\`\`\n` : '';
}

/**
 * Convert a DOM element's content to Markdown, preserving structure.
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
    const copilotBlock = _extractCopilotCodeBlock(node);
    if (copilotBlock !== null) return copilotBlock;

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
      }

      // ── Image ─────────────────────────────────────────────────────────────
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
