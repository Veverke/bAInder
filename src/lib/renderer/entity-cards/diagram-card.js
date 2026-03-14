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
    svgWrapper.innerHTML = thumbnailSvg;
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

  // Download SVG button
  const downloadBtn = document.createElement('button');
  downloadBtn.className = 'entity-card__btn entity-card__btn--download-svg';
  downloadBtn.textContent = 'Download SVG';
  downloadBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!thumbnailSvg) return;
    const blob = new Blob([thumbnailSvg], { type: 'image/svg+xml' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `diagram-${diagramType}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  });
  actions.appendChild(downloadBtn);

  el.appendChild(actions);
  return el;
}
