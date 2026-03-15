/**
 * citation-card.js — DOM card renderer for Citation entities.
 *
 * Renders: title link, domain pill, snippet preview, Open button.
 */

/**
 * Build a card element for a Citation entity.
 *
 * @param {Object} entity
 * @returns {HTMLElement}
 */
export function citationCard(entity) {
  const el = document.createElement('div');
  el.className = 'entity-card entity-card--citation';

  // ── Header: title link + domain pill ────────────────────────────────────
  const header = document.createElement('div');
  header.className = 'entity-card__header';

  const titleLink = document.createElement('a');
  titleLink.className = 'entity-card__title-link';
  titleLink.href = entity.url ?? '#';
  titleLink.textContent = entity.title || entity.url || 'Citation';
  titleLink.rel = 'noopener noreferrer';
  titleLink.target = '_blank';
  header.appendChild(titleLink);

  if (entity.url) {
    const domainPill = document.createElement('span');
    domainPill.className = 'entity-card__domain';
    try {
      domainPill.textContent = new URL(entity.url).hostname;
    } catch {
      domainPill.textContent = entity.url;
    }
    header.appendChild(domainPill);
  }

  el.appendChild(header);

  // ── Snippet ──────────────────────────────────────────────────────────────
  if (entity.snippet) {
    const snippetEl = document.createElement('p');
    snippetEl.className = 'entity-card__snippet';
    snippetEl.textContent = entity.snippet;
    el.appendChild(snippetEl);
  }

  // ── Action buttons ───────────────────────────────────────────────────────
  const actions = document.createElement('div');
  actions.className = 'entity-card__actions';

  const openBtn = document.createElement('button');
  openBtn.className = 'entity-card__btn entity-card__btn--open';
  openBtn.textContent = 'Open';
  openBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    window.open(entity.url, '_blank', 'noopener');
  });
  actions.appendChild(openBtn);

  el.appendChild(actions);
  return el;
}
