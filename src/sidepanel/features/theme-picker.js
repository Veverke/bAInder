/**
 * theme-picker.js
 *
 * Responsibility: the floating theme-picker panel — building the chip grid,
 * applying a theme, and persisting the preference.
 *
 * NOT responsible for: CSS variable application (delegated to useTheme.js).
 */

import { loadTheme, persistTheme } from '../../lib/useTheme.js';
import { BUNDLED_THEMES, BUNDLED_THEME_IDS } from '../themes/index.js';
import { elements } from '../app-context.js';

let _activeThemeId = localStorage.getItem('themeId') ?? 'light';

export function toggleThemePicker() {
  const picker = document.getElementById('themePicker');
  if (!picker) return;
  picker.classList.contains('is-open') ? closeThemePicker() : openThemePicker();
}

export function openThemePicker() {
  const picker = document.getElementById('themePicker');
  if (!picker) return;
  _buildThemeChips();
  picker.classList.add('is-open');
  picker.removeAttribute('aria-hidden');
}

export function closeThemePicker() {
  const picker = document.getElementById('themePicker');
  picker?.classList.remove('is-open');
  picker?.setAttribute('aria-hidden', 'true');
}

function _buildThemeChips() {
  const grid = document.getElementById('themePickerGrid');
  if (!grid) return;
  grid.innerHTML = '';
  for (const id of BUNDLED_THEME_IDS) {
    const theme   = BUNDLED_THEMES[id];
    const primary = theme?.variables?.['--primary'] ?? '#6366f1';
    const btn     = document.createElement('button');
    btn.className       = 'theme-chip' + (id === _activeThemeId ? ' theme-chip--active' : '');
    btn.dataset.themeId = id;
    btn.innerHTML =
      `<span class="theme-chip__swatch" style="background:${primary}"></span>` +
      `<span class="theme-chip__name">${theme?.name ?? id}</span>`;
    btn.addEventListener('click', () => applyTheme(id));
    grid.appendChild(btn);
  }
}

export async function applyTheme(id) {
  _activeThemeId = id;
  await loadTheme(id);
  await persistTheme(id);
  _buildThemeChips();
}

/** Wire the theme button and outside-click close handler. */
export function setupThemePicker() {
  elements.themeBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleThemePicker();
  });

  document.addEventListener('click', (e) => {
    const picker = document.getElementById('themePicker');
    if (picker && !picker.contains(e.target) && !elements.themeBtn?.contains(e.target)) {
      closeThemePicker();
    }
  });
}
