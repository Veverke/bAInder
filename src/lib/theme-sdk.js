// Vendored from ThemeStudio SDK v1.1 — DO NOT EDIT
// Re-run ThemeStudioPlugin to update this file.

// @ts-nocheck — type-checked by the consumer's own tsconfig; this file is valid JS/TS as-is.
/**
 * theme-sdk.js — portable theme loader (shared spec)
 *
 * Spec: themes/spec.schema.json
 * Source of truth: bAInder extension.
 */

/** Semantic version of this SDK build — compared against theme.dependencies.requiredBaseVersion. */
const SDK_VERSION = '1.1';

const REQUIRED_FIELDS = ['name', 'version', 'variables'];
const REQUIRED_VARIABLES = ['--primary', '--bg-primary', '--text-primary'];

/** CSS variables skipped when a theme declares reducedMotion: true. */
const MOTION_VARS = new Set([
  '--transition-fast', '--transition-normal', '--transition-slow',
  '--easing-standard', '--easing-decelerate', '--easing-accelerate',
]);

/**
 * Validate a parsed theme object against the spec.
 * @param {object} json
 * @returns {string|null} error message or null if valid
 */
export function validateTheme(json) {
  if (!json || typeof json !== 'object') return 'Theme must be a JSON object.';

  for (const field of REQUIRED_FIELDS) {
    if (!(field in json)) return `Missing required field: "${field}".`;
  }

  if (typeof json.variables !== 'object' || Array.isArray(json.variables)) {
    return '"variables" must be an object.';
  }

  for (const v of REQUIRED_VARIABLES) {
    if (!(v in json.variables)) return `Missing required variable: "${v}".`;
  }

  for (const key of Object.keys(json.variables)) {
    if (!key.startsWith('--')) return `Variable key "${key}" must start with "--".`;
  }

  return null;
}

/**
 * Apply a validated theme object by injecting its CSS custom properties as
 * inline styles on the target element (defaults to <html>).
 * Sets data-theme="custom" so built-in CSS rules don't override injected variables.
 *
 * @param {object} json
 * @param {Element} element
 */
export function applyCustomTheme(json, element = document.documentElement) {
  element.setAttribute('data-theme', 'custom');

  // oled flag
  if (json.oled) {
    element.setAttribute('data-oled', '');
  } else {
    element.removeAttribute('data-oled');
  }

  // dark flag — lets the host sync prefers-color-scheme
  if (json.dark !== undefined) {
    element.setAttribute('data-color-scheme', json.dark ? 'dark' : 'light');
  } else {
    element.removeAttribute('data-color-scheme');
  }

  // forcedColors flag — opt-out of Windows High Contrast overrides
  if (json.forcedColors === false) {
    element.setAttribute('data-forced-colors', 'off');
  } else {
    element.removeAttribute('data-forced-colors');
  }

  const skipMotion = json.reducedMotion === true;

  for (const [key, value] of Object.entries(json.variables)) {
    if (skipMotion && MOTION_VARS.has(key)) continue;
    element.style.setProperty(key, value);
  }

  // accent-color is a real CSS property (not a custom property slot), so native
  // controls (checkbox, radio, range, progress) only respond to it when set
  // directly — var(--accent-color) inside consumer CSS would also work, but this
  // means zero consumer CSS changes are needed at all.
  const accentColor = json.variables['--accent-color'];
  if (accentColor) {
    element.style.setProperty('accent-color', accentColor);
  } else {
    element.style.removeProperty('accent-color');
  }

  // color-scheme — real CSS property that shifts native form controls,
  // scrollbars and browser chrome into dark or light mode automatically.
  // Derived from json.dark; complements the data-color-scheme attribute set above.
  if (json.dark !== undefined) {
    element.style.setProperty('color-scheme', json.dark ? 'dark' : 'light');
  } else {
    element.style.removeProperty('color-scheme');
  }

  // caret-color — text input cursor colour.  Derived from --primary so it
  // automatically matches the theme accent with zero consumer CSS required.
  const caretColor = json.variables['--primary'];
  if (caretColor) {
    element.style.setProperty('caret-color', caretColor);
  } else {
    element.style.removeProperty('caret-color');
  }
}

/**
 * Clear a custom theme and restore a built-in named theme.
 *
 * @param {string} themeName
 * @param {Element} element
 */
export function clearCustomTheme(themeName = 'light', element = document.documentElement) {
  element.setAttribute('data-theme', themeName);
  element.style.cssText = '';
}

/**
 * Resolve external dependencies declared in a theme object before applying it.
 *
 * Handles:
 *   - `dependencies.requiredBaseVersion` — logs a warning if the theme needs a
 *     newer SDK version than the one running.
 *   - `dependencies.fonts`              — injects Google Fonts <link> tags into
 *     <head> (de-duplicated) and awaits `document.fonts.ready` so the typeface
 *     is available before the caller renders.
 *
 * Pattern:
 *   await resolveThemeDependencies(theme);
 *   applyCustomTheme(theme, element);
 *
 * @param {object} theme  A validated theme object (must have a .variables map).
 * @returns {Promise<void>}
 */
export async function resolveThemeDependencies(theme) {
  if (!theme || typeof theme !== 'object') return;

  const deps = theme.dependencies;
  if (!deps) return;

  // ── Version guard ────────────────────────────────────────────────────────
  if (deps.requiredBaseVersion) {
    const [rMaj, rMin = 0] = String(deps.requiredBaseVersion).split('.').map(Number);
    const [cMaj, cMin = 0] = SDK_VERSION.split('.').map(Number);
    if (rMaj > cMaj || (rMaj === cMaj && rMin > cMin)) {
      console.warn(
        `[theme-sdk] Theme "${theme.name}" requires SDK ≥ ${deps.requiredBaseVersion}; ` +
        `current version is ${SDK_VERSION}. Some features may not work correctly.`
      );
    }
  }

  // ── Font loading ─────────────────────────────────────────────────────────
  const fonts = Array.isArray(deps.fonts) ? deps.fonts : [];
  if (fonts.length > 0 && typeof document !== 'undefined') {
    const PRECONNECT_HREF = 'https://fonts.googleapis.com';
    const GSTATIC_HREF    = 'https://fonts.gstatic.com';

    // Inject preconnects once
    if (!document.querySelector(`link[href="${PRECONNECT_HREF}"]`)) {
      const pc1 = document.createElement('link');
      pc1.rel  = 'preconnect';
      pc1.href = PRECONNECT_HREF;
      document.head.appendChild(pc1);
    }
    if (!document.querySelector(`link[href="${GSTATIC_HREF}"]`)) {
      const pc2 = document.createElement('link');
      pc2.rel         = 'preconnect';
      pc2.href        = GSTATIC_HREF;
      pc2.crossOrigin = 'anonymous';
      document.head.appendChild(pc2);
    }

    // Build Google Fonts URL and inject stylesheet, de-duplicated
    const familiesParam = fonts
      .map(f => encodeURIComponent(f).replace(/%20/g, '+') + ':wght@400;700')
      .join('&family=');
    const href = `${PRECONNECT_HREF}/css2?family=${familiesParam}&display=swap`;
    if (!document.querySelector(`link[href="${href}"]`)) {
      const link = document.createElement('link');
      link.rel  = 'stylesheet';
      link.href = href;
      document.head.appendChild(link);
    }

    // Wait for fonts to be parsed and available for rendering
    try {
      await document.fonts.ready;
    } catch {
      // Non-fatal — document.fonts may be unavailable in some environments
    }
  }
}

/**
 * Merge a loaded theme's variables on top of a consumer-supplied defaults map.
 * This ensures that when a theme file omits a variable (e.g. an older theme
 * predating a new capability), the consuming extension's own default value is
 * used instead of leaving the variable unset.
 *
 * Pattern:
 *   const merged = mergeWithDefaults(loadedTheme, MY_EXTENSION_DEFAULTS);
 *   applyCustomTheme(merged, element);
 *
 * @param {object} theme     A validated theme object (has .variables).
 * @param {object} defaults  A plain { '--var': 'value', … } map of fallback values.
 * @returns {object}         A new theme object whose variables = defaults ∪ theme.variables.
 */
export function mergeWithDefaults(theme, defaults = {}) {
  if (!theme || typeof theme.variables !== 'object') {
    throw new Error('mergeWithDefaults: theme must be a valid theme object with a variables map.');
  }
  return {
    ...theme,
    variables: { ...defaults, ...theme.variables },
  };
}

