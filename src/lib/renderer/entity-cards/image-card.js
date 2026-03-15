/**
 * image-card.js — DOM card renderer for Image entities (Task D.4).
 *
 * Renders: thumbnail <img> (from thumbnailDataUri or a placeholder icon),
 * altText label, mimeType badge, "Open in chat" link (via onOpen callback).
 */

/**
 * Build a card element for an Image entity.
 *
 * @param {Object}   entity
 * @param {Object}   [opts={}]
 * @param {Function} [opts.onOpen]  Called with the entity when the card is clicked
 * @returns {HTMLElement}
 */
export function imageCard(entity, { onOpen } = {}) {
  const {
    thumbnailDataUri = null,
    altText          = null,
    mimeType         = null,
    src              = null,
  } = entity;

  const el = document.createElement('div');
  el.className = 'entity-card entity-card--image';
  if (onOpen) {
    el.addEventListener('click', () => onOpen(entity));
  }

  // ── Thumbnail ─────────────────────────────────────────────────────────────
  if (thumbnailDataUri) {
    const img = document.createElement('img');
    img.className = 'entity-card__thumbnail';
    img.src       = thumbnailDataUri;
    img.alt       = altText ?? '';
    el.appendChild(img);
  } else {
    const placeholder = document.createElement('div');
    placeholder.className = 'entity-card__image-placeholder';
    placeholder.setAttribute('role', 'img');
    placeholder.setAttribute('aria-label', altText ?? 'Image');
    placeholder.textContent = '🖼️';
    el.appendChild(placeholder);
  }

  // ── Alt text caption ──────────────────────────────────────────────────────
  if (altText) {
    const caption = document.createElement('p');
    caption.className = 'entity-card__caption';
    caption.textContent = altText;
    el.appendChild(caption);
  }

  // ── MIME type badge ───────────────────────────────────────────────────────
  if (mimeType) {
    const badge = document.createElement('span');
    badge.className = 'entity-card__badge entity-card__badge--mime';
    badge.textContent = mimeType;
    el.appendChild(badge);
  }

  // ── Actions ───────────────────────────────────────────────────────────────
  const actions = document.createElement('div');
  actions.className = 'entity-card__actions';

  if (src) {
    const openBtn = document.createElement('button');
    openBtn.className   = 'entity-card__btn entity-card__btn--open';
    openBtn.textContent = 'Open image ↗';
    openBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (src.startsWith('data:')) {
        // Chrome blocks navigation to data: URIs in new tabs.
        // Convert to a short-lived blob URL instead.
        const [header, b64] = src.split(',');
        const mime   = (header.match(/:(.*?);/) ?? [])[1] ?? 'image/png';
        const bytes  = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
        const blob   = new Blob([bytes], { type: mime });
        const url    = URL.createObjectURL(blob);
        window.open(url, '_blank', 'noopener');
        // Revoke after 60 s — enough time for the browser to begin loading.
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      } else {
        window.open(src, '_blank', 'noopener');
      }
    });
    actions.appendChild(openBtn);
  }

  el.appendChild(actions);
  return el;
}
