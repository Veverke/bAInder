/**
 * recent-rail.js
 *
 * Responsibility: populate the "Recently saved" horizontal chip rail (U4).
 *
 * Reads metadata from state.chats, sorts by save time, and builds DOM chips
 * that open the chat reader on click.
 *
 * NOT responsible for: chat storage or tree rendering.
 */

import { state } from '../app-context.js';

/**
 * Populate the "Recently saved" horizontal chip rail (U4).
 * @param {Function} [onChatClick]  Click handler; defaults to a no-op.
 */
export function updateRecentRail(onChatClick = () => {}) {
  const rail = document.getElementById('recentRail');
  if (!rail) return;

  const sorted = [...state.chats]
    .filter(c => c.savedAt || c.timestamp)
    .sort((a, b) => ((b.savedAt || b.timestamp) || 0) - ((a.savedAt || a.timestamp) || 0))
    .slice(0, 8);

  if (sorted.length < 3) {
    rail.style.display = 'none';
    return;
  }

  rail.innerHTML = '';
  rail.style.display = 'flex';

  const label = document.createElement('span');
  label.className = 'recent-rail__label';
  label.textContent = 'Recent';
  rail.appendChild(label);

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
    rail.appendChild(chip);

    if (rail.scrollWidth > rail.clientWidth) {
      rail.removeChild(chip);
      break;
    }
  }

  if (rail.children.length <= 1) rail.style.display = 'none';
}
