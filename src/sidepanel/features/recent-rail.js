/**
 * recent-rail.js
 *
 * Responsibility: populate the "Recently saved" horizontal chip rail (U4).
 *
 * Reads metadata from _state.chats, sorts by save time, and builds DOM chips
 * that open the chat reader on click.
 *
 * NOT responsible for: chat storage or tree rendering.
 */

import { state } from '../app-context.js';
let _state = state;
// ---------------------------------------------------------------------------
// Test injection hook - lets unit tests provide a mock app context instead of
// mutating the real singleton.  Never call from production code.
// ---------------------------------------------------------------------------
/** @internal */
export function _setContext(ctx) { _state = ctx; }

/**
 * Populate the "Recently saved" horizontal chip rail (U4).
 * Shows the 8 most-recently saved chats as scrollable chips.
 * Visible as soon as there is at least 1 chat (threshold lowered from 3 → 1).
 * @param {Function} [onChatClick]  Click handler; defaults to a no-op.
 */
export function updateRecentRail(onChatClick = () => {}) {
  const rail = document.getElementById('recentRail');
  if (!rail) return;

  const sorted = [..._state.chats]
    .filter(c => c.savedAt || c.timestamp)
    .sort((a, b) => (b.savedAt || b.timestamp) - (a.savedAt || a.timestamp))
    .slice(0, 8);

  if (sorted.length < 1) {
    rail.style.display = 'none';
    return;
  }

  rail.innerHTML = '';
  rail.style.display = 'flex';

  const label = document.createElement('span');
  label.className = 'recent-rail__label';
  label.textContent = 'Recent';
  rail.appendChild(label);

  const chipsEl = document.createElement('div');
  chipsEl.className = 'recent-rail__chips';

  for (const c of sorted) {
    const src  = c.source || 'unknown';
    const chip = document.createElement('button');
    chip.className = 'recent-chip';
    chip.title = c.title || 'Untitled';

    const dot = document.createElement('span');
    dot.className = `recent-chip__dot recent-chip__dot--${src}`;

    const titleEl = document.createElement('span');
    titleEl.className = 'recent-chip__title';
    titleEl.textContent = c.title || 'Untitled';

    chip.appendChild(dot);
    chip.appendChild(titleEl);

    chip.addEventListener('click', () => onChatClick(c));
    chipsEl.appendChild(chip);
  }

  rail.appendChild(chipsEl);
}
