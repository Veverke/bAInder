/**
 * artifact-card.js — DOM card renderer for Artifact entities (Task E.4).
 *
 * Renders: title, artifactType badge (HTML / React / SVG / Text),
 * screenshot thumbnail (or placeholder), "Preview" button, "Copy source" button,
 * "Download" button.
 */

/**
 * Build a card element for an Artifact entity.
 *
 * @param {Object}   entity
 * @param {Object}   [opts={}]
 * @param {Function} [opts.onPreview]  Called with the entity when "Preview" is clicked
 * @param {Function} [opts.onOpen]    Called with the entity when the card body is clicked
 * @returns {HTMLElement}
 */
export function artifactCard(entity, { onPreview, onOpen } = {}) {
  const {
    artifactType     = 'text',
    title            = '',
    source           = '',
    mimeType         = 'text/plain',
    screenshotDataUri = null,
  } = entity;

  const el = document.createElement('div');
  el.className = 'entity-card entity-card--artifact';
  if (onOpen) {
    el.addEventListener('click', () => onOpen(entity));
  }

  // ── Title ──────────────────────────────────────────────────────────────────
  if (title) {
    const titleEl = document.createElement('div');
    titleEl.className = 'entity-card__title';
    titleEl.textContent = title;
    el.appendChild(titleEl);
  }

  // ── ArtifactType badge ─────────────────────────────────────────────────────
  const badge = document.createElement('span');
  badge.className = 'entity-card__badge entity-card__badge--artifact-type';
  badge.textContent = _labelForType(artifactType);
  el.appendChild(badge);

  // ── Thumbnail or placeholder ───────────────────────────────────────────────
  if (screenshotDataUri) {
    const img = document.createElement('img');
    img.className = 'entity-card__screenshot';
    img.src = screenshotDataUri;
    img.alt = `Artifact screenshot: ${title || artifactType}`;
    el.appendChild(img);
  } else {
    const placeholder = document.createElement('div');
    placeholder.className = 'entity-card__screenshot-placeholder';
    placeholder.textContent = _labelForType(artifactType);
    el.appendChild(placeholder);
  }

  // ── Action buttons ─────────────────────────────────────────────────────────
  const actions = document.createElement('div');
  actions.className = 'entity-card__actions';

  // Preview button
  const previewBtn = document.createElement('button');
  previewBtn.className = 'entity-card__btn entity-card__btn--preview';
  previewBtn.textContent = 'Preview';
  previewBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (onPreview) onPreview(entity);
  });
  actions.appendChild(previewBtn);

  // Copy source button
  const copyBtn = document.createElement('button');
  copyBtn.className = 'entity-card__btn entity-card__btn--copy-source';
  copyBtn.textContent = 'Copy source';
  copyBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(source).catch(() => {});
  });
  actions.appendChild(copyBtn);

  // Download button
  const dlBtn = document.createElement('button');
  dlBtn.className = 'entity-card__btn entity-card__btn--download';
  dlBtn.textContent = 'Download';
  dlBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const ext  = _extForMime(mimeType, artifactType);
    const blob = new Blob([source], { type: mimeType });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `artifact.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  });
  actions.appendChild(dlBtn);

  el.appendChild(actions);
  return el;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function _labelForType(artifactType) {
  switch ((artifactType ?? '').toLowerCase()) {
    case 'html':   return 'HTML';
    case 'react':  return 'React';
    case 'svg':    return 'SVG';
    case 'text':   return 'Text';
    case 'code':   return 'Code';
    case 'canvas': return 'Canvas';
    default:       return artifactType || 'Artifact';
  }
}

function _extForMime(mimeType, artifactType) {
  switch (mimeType) {
    case 'text/html':      return 'html';
    case 'image/svg+xml':  return 'svg';
    case 'text/jsx':       return 'jsx';
    case 'text/plain':     return 'txt';
    default:
      if (artifactType && artifactType !== 'canvas') return artifactType;
      return 'txt';
  }
}
