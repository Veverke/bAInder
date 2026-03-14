/**
 * prompt-card.js — DOM card renderer for Prompt entities.
 *
 * Renders: truncated prompt text (≤120 chars), word-count badge,
 * Copy button, optional Re-fire button.
 */

/**
 * Build a card element for a Prompt entity.
 *
 * @param {Object}   entity
 * @param {Object}   [opts={}]
 * @param {Function} [opts.onRefire]  Called with the entity when Re-fire is clicked
 * @returns {HTMLElement}
 */
export function promptCard(entity, { onRefire } = {}) {
  const el = document.createElement('div');
  el.className = 'entity-card entity-card--prompt';

  // ── Text (truncated) ─────────────────────────────────────────────────────
  const text      = entity.text ?? '';
  const truncated = text.length > 120 ? text.slice(0, 120) + '\u2026' : text;

  const textEl = document.createElement('p');
  textEl.className = 'entity-card__text';
  textEl.textContent = truncated;
  el.appendChild(textEl);

  // ── Meta row (word count badge) ──────────────────────────────────────────
  const meta = document.createElement('div');
  meta.className = 'entity-card__meta';

  const wordBadge = document.createElement('span');
  wordBadge.className = 'entity-card__badge entity-card__badge--words';
  wordBadge.textContent = `${entity.wordCount ?? 0} words`;
  meta.appendChild(wordBadge);
  el.appendChild(meta);

  // ── Action buttons ───────────────────────────────────────────────────────
  const actions = document.createElement('div');
  actions.className = 'entity-card__actions';

  const copyBtn = document.createElement('button');
  copyBtn.className = 'entity-card__btn entity-card__btn--copy';
  copyBtn.textContent = 'Copy';
  copyBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text);
  });
  actions.appendChild(copyBtn);

  if (onRefire) {
    const refireBtn = document.createElement('button');
    refireBtn.className = 'entity-card__btn entity-card__btn--refire';
    refireBtn.textContent = 'Re-fire';
    refireBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      onRefire(entity);
    });
    actions.appendChild(refireBtn);
  }

  el.appendChild(actions);
  return el;
}
