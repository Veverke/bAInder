/**
 * audio-card.js — DOM card renderer for Audio entities (Task D.5).
 *
 * Renders: duration badge, inline <audio controls> (if src is non-null),
 * "Audio not saved" notice (if captureError is set),
 * collapsible transcript section (if transcript is non-null).
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Format a duration in seconds as m:ss.
 * @param {number|null} seconds
 * @returns {string|null}
 */
function _formatDuration(seconds) {
  if (seconds == null || typeof seconds !== 'number' || !isFinite(seconds)) return null;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Human-readable label for a captureError code.
 * @param {string} captureError
 * @returns {string}
 */
function _captureErrorLabel(captureError) {
  if (captureError === 'too_large')    return 'Audio not saved — file too large (> 10 MB)';
  if (captureError === 'expired')      return 'Audio not saved — blob URL expired';
  if (captureError === 'not_captured') return 'Audio not captured — open original chat to play';
  return 'Audio not saved';
}

// ---------------------------------------------------------------------------
// Public renderer
// ---------------------------------------------------------------------------

/**
 * Build a card element for an Audio entity.
 *
 * @param {Object}   entity
 * @param {Object}   [opts={}]
 * @param {Function} [opts.onOpen]  Called with the entity when the card is clicked
 * @returns {HTMLElement}
 */
export function audioCard(entity, { onOpen } = {}) {
  const {
    src             = null,
    mimeType        = null,
    durationSeconds = null,
    transcript      = null,
    captureError    = null,
  } = entity;

  const el = document.createElement('div');
  el.className = 'entity-card entity-card--audio';
  if (onOpen) {
    el.addEventListener('click', () => onOpen(entity));
  }

  // ── Duration badge ─────────────────────────────────────────────────────────
  const durationLabel = _formatDuration(durationSeconds);
  if (durationLabel) {
    const badge = document.createElement('span');
    badge.className = 'entity-card__badge entity-card__badge--duration';
    badge.textContent = durationLabel;
    el.appendChild(badge);
  }

  // ── Audio player or error notice ───────────────────────────────────────────
  if (captureError) {
    const notice = document.createElement('p');
    notice.className = 'entity-card__audio-notice entity-card__audio-notice--error';
    notice.textContent = _captureErrorLabel(captureError);
    el.appendChild(notice);
  } else if (src) {
    const audio = document.createElement('audio');
    audio.className = 'entity-card__audio-player';
    audio.controls  = true;
    audio.src       = src;
    if (mimeType) {
      const source = document.createElement('source');
      source.src  = src;
      source.type = mimeType;
      audio.appendChild(source);
    }
    audio.addEventListener('click', (e) => e.stopPropagation());
    el.appendChild(audio);
  } else {
    // No src, no captureError — show a neutral notice
    const notice = document.createElement('p');
    notice.className = 'entity-card__audio-notice';
    notice.textContent = 'Audio not available';
    el.appendChild(notice);
  }

  // ── Transcript (collapsible) ───────────────────────────────────────────────
  if (transcript) {
    const details  = document.createElement('details');
    details.className = 'entity-card__transcript';

    const summary  = document.createElement('summary');
    summary.textContent = 'Transcript';
    details.appendChild(summary);

    const content = document.createElement('p');
    content.className = 'entity-card__transcript-text';
    content.textContent = transcript;
    details.appendChild(content);

    details.addEventListener('click', (e) => e.stopPropagation());
    el.appendChild(details);
  }

  return el;
}
