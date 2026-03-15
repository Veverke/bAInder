/**
 * diagram-card.js — DOM card renderer for Diagram entities.
 *
 * Renders: diagramType badge, inline <svg> (if thumbnailSvg is non-null) or
 * a placeholder icon, "Copy source" button, "Download SVG" button.
 */

/**
 * Build a card element for a Diagram entity.
 *
 * @param {Object}   entity
 * @param {Object}   [opts={}]
 * @param {Function} [opts.onOpen]  Called with the entity when the card is clicked
 * @returns {HTMLElement}
 */
export function diagramCard(entity, { onOpen } = {}) {
  const { diagramType = 'other', source = '', thumbnailSvg = null } = entity;

  const el = document.createElement('div');
  el.className = 'entity-card entity-card--diagram';
  if (onOpen) {
    el.addEventListener('click', () => onOpen(entity));
  }

  // ── Diagram type badge ─────────────────────────────────────────────────────
  const badge = document.createElement('span');
  badge.className = 'entity-card__badge entity-card__badge--diagram-type';
  badge.textContent = diagramType;
  el.appendChild(badge);

  // ── Thumbnail or source preview ─────────────────────────────────────────────
  if (thumbnailSvg) {
    const svgWrapper = document.createElement('div');
    svgWrapper.className = 'entity-card__svg-preview';
    const svgDoc = new DOMParser().parseFromString(thumbnailSvg, 'image/svg+xml');
    ['script', 'foreignObject'].forEach(tag =>
      svgDoc.querySelectorAll(tag).forEach(el => el.remove())
    );
    svgDoc.querySelectorAll('*').forEach(el => {
      [...el.attributes]
        .filter(a => /^on/i.test(a.name) || /javascript:/i.test(a.value))
        .forEach(a => el.removeAttribute(a.name));
    });
    svgWrapper.innerHTML = new XMLSerializer().serializeToString(svgDoc);
    el.appendChild(svgWrapper);
  } else if (source) {
    // Show first 4 lines as a code preview; full source is the hover tooltip.
    const lines   = source.split('\n');
    const preview = lines.slice(0, 4).join('\n');
    const pre = document.createElement('pre');
    pre.className = 'entity-card__code-preview';
    pre.textContent = preview;
    pre.title = source;   // full source on hover
    el.appendChild(pre);
  } else {
    const placeholder = document.createElement('div');
    placeholder.className = 'entity-card__svg-placeholder';
    placeholder.textContent = '[rendered SVG — no source]';
    el.appendChild(placeholder);
  }

  // ── Action buttons ─────────────────────────────────────────────────────────
  const actions = document.createElement('div');
  actions.className = 'entity-card__actions';

  // Copy source button
  const copyBtn = document.createElement('button');
  copyBtn.className = 'entity-card__btn entity-card__btn--copy-source';
  copyBtn.textContent = 'Copy source';
  copyBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(source);
  });
  actions.appendChild(copyBtn);

  // Download SVG button — only when a pre-rendered SVG thumbnail is available
  if (thumbnailSvg) {
    const downloadBtn = document.createElement('button');
    downloadBtn.className = 'entity-card__btn entity-card__btn--download-svg';
    downloadBtn.textContent = 'Download SVG';
    downloadBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const blob = new Blob([thumbnailSvg], { type: 'image/svg+xml' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `diagram-${diagramType}.svg`;
      a.click();
      URL.revokeObjectURL(url);
    });
    actions.appendChild(downloadBtn);
  }

  // "Open in Mermaid Live" — available whenever we have source text.
  // Mermaid Live accepts a base64-encoded JSON payload in the URL fragment so
  // the user can render, edit, and export SVG/PNG without any local rendering.
  if (source) {
    const liveBtn = document.createElement('button');
    liveBtn.className = 'entity-card__btn entity-card__btn--mermaid-live';
    liveBtn.textContent = 'Open in Mermaid Live ↗';
    liveBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const payload = JSON.stringify({ code: source, mermaid: { theme: 'default' } });
      const encoded = btoa(unescape(encodeURIComponent(payload)));
      window.open(`https://mermaid.live/edit#base64:${encoded}`, '_blank', 'noopener,noreferrer');
    });
    actions.appendChild(liveBtn);
  }

  el.appendChild(actions);
  return el;
}
