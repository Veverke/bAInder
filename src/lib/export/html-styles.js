/**
 * HTML export stylesheets.
 *
 * Resolves issue 3.5: CSS was previously inlined inside buildExportHtml()
 * and buildDigestHtml(). Extracting it here makes styling a separate concern
 * that can be adjusted independently of the rendering logic.
 *
 * Two variants:
 *   getExportCss(fontStack)  — single-chat HTML export
 *   getDigestCss(fontStack)  — multi-chat digest HTML export
 */

/**
 * CSS for a single-chat HTML export document.
 * @param {string} fontStack  CSS font-family value
 * @returns {string}
 */
export function getExportCss(fontStack) {
  return `
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: ${fontStack};
      font-size: 16px;
      line-height: 1.7;
      color: #1a1a1a;
      background: #fff;
      padding: 2rem 1rem;
    }
    .container { max-width: 800px; margin: 0 auto; }
    header.doc-header {
      border-bottom: 2px solid #e5e7eb;
      padding-bottom: 1.5rem;
      margin-bottom: 2rem;
    }
    h1 { font-size: 1.8rem; line-height: 1.3; margin-bottom: .5rem; }
    .meta { color: #6b7280; font-size: .875rem; margin-bottom: .25rem; }
    .source-badge {
      display: inline-block;
      background: #e0f2fe;
      color: #075985;
      border-radius: 9999px;
      padding: .15rem .65rem;
      font-size: .75rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: .05em;
    }
    .conversation { margin-top: 1.5rem; }
    .turn { margin-bottom: 1.5rem; }
    .turn-user {
      border-left: 4px solid #6366f1;
      padding-left: 1rem;
      background: #f8f7ff;
      border-radius: 0 .375rem .375rem 0;
      padding: .75rem 1rem;
    }
    .turn-assistant {
      border-left: 4px solid #10b981;
      padding-left: 1rem;
      background: #f0fdf4;
      border-radius: 0 .375rem .375rem 0;
      padding: .75rem 1rem;
    }
    .turn-label {
      font-size: .7rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: .08em;
      margin-bottom: .4rem;
      opacity: .6;
    }
    .turn-user .turn-label   { color: #4f46e5; }
    .turn-assistant .turn-label { color: #059669; }
    .turn-content { white-space: pre-wrap; word-break: break-word; }
    pre { background: #1e1e2e; color: #cdd6f4; padding: 1rem 1.25rem; border-radius: .5rem; overflow-x: auto; margin: .75rem 0; }
    code { font-family: "Cascadia Code", "Fira Code", monospace; font-size: .875em; }
    :not(pre) > code { background: #f3f4f6; padding: .1em .3em; border-radius: .25rem; }
    blockquote { border-left: 3px solid #d1d5db; padding-left: 1rem; color: #6b7280; margin: .75rem 0; }
    h2 { font-size: 1.25rem; margin: 1.25rem 0 .5rem; }
    h3 { font-size: 1.05rem; margin: 1rem 0 .4rem; }
    ul, ol { padding-left: 1.5rem; margin: .5rem 0; }
    li { margin-bottom: .2rem; }
    hr { border: none; border-top: 1px solid #e5e7eb; margin: 1.5rem 0; }
    footer.doc-footer {
      margin-top: 3rem;
      padding-top: 1rem;
      border-top: 1px solid #e5e7eb;
      color: #9ca3af;
      font-size: .8rem;
      font-style: italic;
    }
  `;
}

/**
 * CSS for a multi-chat digest HTML export document.
 * Includes TOC, chat-section, and chat-meta styles not present in the single-chat variant.
 * @param {string} fontStack  CSS font-family value
 * @returns {string}
 */
export function getDigestCss(fontStack) {
  return `
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: ${fontStack};
      font-size: 16px;
      line-height: 1.7;
      color: #1a1a1a;
      background: #fff;
      padding: 2rem 1rem;
    }
    .container { max-width: 800px; margin: 0 auto; }
    header.doc-header {
      border-bottom: 2px solid #e5e7eb;
      padding-bottom: 1.5rem;
      margin-bottom: 2rem;
    }
    h1 { font-size: 1.8rem; line-height: 1.3; margin-bottom: .5rem; }
    .meta { color: #6b7280; font-size: .875rem; margin-bottom: .25rem; }
    .toc { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: .5rem; padding: 1.25rem 1.5rem; margin-bottom: 2.5rem; }
    .toc h2 { font-size: 1rem; margin-bottom: .75rem; color: #374151; }
    .toc ol { padding-left: 1.25rem; }
    .toc li { margin-bottom: .3rem; font-size: .9rem; }
    .toc a { color: #4f46e5; text-decoration: none; }
    .toc a:hover { text-decoration: underline; }
    .chat-section { margin-bottom: 3rem; padding-top: 2rem; border-top: 2px solid #e5e7eb; }
    .chat-section:first-child { border-top: none; padding-top: 0; }
    .chat-title { font-size: 1.35rem; font-weight: 700; margin-bottom: .5rem; color: #111827; }
    .chat-meta { display: flex; flex-wrap: wrap; gap: .5rem .75rem; margin-bottom: 1.25rem; align-items: center; }
    .source-badge {
      display: inline-block;
      background: #e0f2fe;
      color: #075985;
      border-radius: 9999px;
      padding: .15rem .65rem;
      font-size: .75rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: .05em;
    }
    .conversation {}
    .turn { margin-bottom: 1.25rem; }
    .turn-user {
      border-left: 4px solid #6366f1;
      background: #f8f7ff;
      border-radius: 0 .375rem .375rem 0;
      padding: .65rem 1rem;
    }
    .turn-assistant {
      border-left: 4px solid #10b981;
      background: #f0fdf4;
      border-radius: 0 .375rem .375rem 0;
      padding: .65rem 1rem;
    }
    .turn-label {
      font-size: .7rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: .08em;
      margin-bottom: .3rem;
      opacity: .6;
    }
    .turn-user .turn-label   { color: #4f46e5; }
    .turn-assistant .turn-label { color: #059669; }
    .turn-content { white-space: pre-wrap; word-break: break-word; }
    pre { background: #1e1e2e; color: #cdd6f4; padding: 1rem 1.25rem; border-radius: .5rem; overflow-x: auto; margin: .75rem 0; }
    code { font-family: "Cascadia Code", "Fira Code", monospace; font-size: .875em; }
    :not(pre) > code { background: #f3f4f6; padding: .1em .3em; border-radius: .25rem; }
    blockquote { border-left: 3px solid #d1d5db; padding-left: 1rem; color: #6b7280; margin: .75rem 0; }
    h2 { font-size: 1.2rem; margin: 1.25rem 0 .5rem; }
    h3 { font-size: 1rem; margin: 1rem 0 .4rem; }
    ul, ol { padding-left: 1.5rem; margin: .5rem 0; }
    li { margin-bottom: .2rem; }
    hr { border: none; border-top: 1px solid #e5e7eb; margin: 1.5rem 0; }
    footer.doc-footer {
      margin-top: 3rem;
      padding-top: 1rem;
      border-top: 1px solid #e5e7eb;
      color: #9ca3af;
      font-size: .8rem;
      font-style: italic;
    }
  `;
}

/**
 * Resolve the font-family stack from an export style name.
 * @param {string} style  e.g. 'raw', 'academic', 'blog'
 * @returns {string}
 */
export function fontStackForStyle(style) {
  const isSerif = style === 'academic' || style === 'blog';
  return isSerif
    ? 'Georgia, "Times New Roman", serif'
    : 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
}
