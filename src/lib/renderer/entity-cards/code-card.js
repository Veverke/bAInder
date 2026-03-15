/**
 * code-card.js — DOM card renderer for Code Snippet entities.
 *
 * Renders: language badge, first 3 lines of code in <pre>, line count badge,
 * Copy button, "Open in chat" link (via onOpen callback).
 */

/**
 * Build a card element for a Code Snippet entity.
 *
 * @param {Object}   entity
 * @param {Object}   [opts={}]
 * @param {Function} [opts.onOpen]  Called with the entity when the card is clicked
 * @returns {HTMLElement}
 */
export function codeCard(entity, { onOpen } = {}) {
  const { language = 'text', code = '', lineCount = 0 } = entity;

  const el = document.createElement('div');
  el.className = 'entity-card entity-card--code';
  if (onOpen) {
    el.addEventListener('click', () => onOpen(entity));
  }

  // ── Language badge ────────────────────────────────────────────────────────
  const badge = document.createElement('span');
  badge.className = 'entity-card__badge entity-card__badge--language';
  badge.textContent = language;
  el.appendChild(badge);

  // ── Code preview (first 3 lines) ──────────────────────────────────────────
  const lines   = code.split('\n');
  const preview = lines.slice(0, 3).join('\n');

  const pre = document.createElement('pre');
  pre.className = 'entity-card__code-preview';
  pre.textContent = preview;
  el.appendChild(pre);

  // ── Line count badge ──────────────────────────────────────────────────────
  const lineBadge = document.createElement('span');
  lineBadge.className = 'entity-card__badge entity-card__badge--lines';
  lineBadge.textContent = `${lineCount} lines`;
  el.appendChild(lineBadge);

  // ── Action buttons ────────────────────────────────────────────────────────
  const actions = document.createElement('div');
  actions.className = 'entity-card__actions';

  const copyBtn = document.createElement('button');
  copyBtn.className = 'entity-card__btn entity-card__btn--copy';
  copyBtn.textContent = 'Copy';
  copyBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(code);
  });
  actions.appendChild(copyBtn);

  el.appendChild(actions);
  return el;
}
