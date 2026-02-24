/**
 * theme-sdk.js
 *
 * Portable theme loader. Any extension that follows the bAInder theme spec
 * can use these three functions to load and apply a .json theme file.
 *
 * Spec: themes/spec.schema.json
 *
 * Usage:
 *   import { loadThemeFile, validateTheme, applyCustomTheme } from '../lib/theme-sdk.js';
 *
 *   fileInput.addEventListener('change', async (e) => {
 *     const json = await loadThemeFile(e.target.files[0]);
 *     const error = validateTheme(json);
 *     if (error) return console.error(error);
 *     applyCustomTheme(json);
 *   });
 */

const REQUIRED_FIELDS = ['name', 'version', 'variables'];
const REQUIRED_VARIABLES = ['--primary', '--bg-primary', '--text-primary'];

/**
 * Validate a parsed theme object against the spec.
 * @param {object} json - A parsed theme JSON object.
 * @returns {string|null} An error message, or null if valid.
 */
export function validateTheme(json) {
  if (!json || typeof json !== 'object') {
    return 'Theme must be a JSON object.';
  }

  for (const field of REQUIRED_FIELDS) {
    if (!(field in json)) {
      return `Missing required field: "${field}".`;
    }
  }

  if (typeof json.variables !== 'object' || Array.isArray(json.variables)) {
    return '"variables" must be an object.';
  }

  for (const v of REQUIRED_VARIABLES) {
    if (!(v in json.variables)) {
      return `Missing required variable: "${v}".`;
    }
  }

  for (const key of Object.keys(json.variables)) {
    if (!key.startsWith('--')) {
      return `Variable key "${key}" must start with "--".`;
    }
  }

  return null;
}

/**
 * Apply a validated theme object by injecting its CSS custom properties as
 * inline styles on the target element (defaults to <html>).
 *
 * Sets data-theme="custom" to prevent built-in theme CSS rules from
 * overriding the injected variables.
 *
 * @param {object} json     - A validated theme object.
 * @param {Element} element - Target element (default: document.documentElement).
 */
export function applyCustomTheme(json, element = document.documentElement) {
  // Signal we are in custom-theme mode so extension-bundled CSS can respond
  element.setAttribute('data-theme', 'custom');
  element.removeAttribute('data-oled');

  for (const [key, value] of Object.entries(json.variables)) {
    element.style.setProperty(key, value);
  }
}

/**
 * Clear a previously applied custom theme, reverting to a named built-in.
 *
 * @param {string}  themeName - Built-in theme name to restore (default: 'light').
 * @param {Element} element   - Target element (default: document.documentElement).
 */
export function clearCustomTheme(themeName = 'light', element = document.documentElement) {
  element.setAttribute('data-theme', themeName);
  element.style.cssText = '';
}

/**
 * Read a File object and return the parsed theme JSON.
 *
 * @param {File} file - A File object from an <input type="file"> or drag-drop.
 * @returns {Promise<object>} The parsed theme JSON.
 * @throws If the file cannot be read or is not valid JSON.
 */
export async function loadThemeFile(file) {
  return new Promise((resolve, reject) => {
    if (!file || file.type !== 'application/json') {
      // Accept by extension too, since MIME type may be empty on some systems
      if (file && !file.name.endsWith('.json')) {
        return reject(new Error('File must be a .json file.'));
      }
    }

    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const json = JSON.parse(e.target.result);
        resolve(json);
      } catch {
        reject(new Error('File is not valid JSON.'));
      }
    };

    reader.onerror = () => reject(new Error('Could not read file.'));
    reader.readAsText(file, 'utf-8');
  });
}

/**
 * Wrap an HTML snippet in a self-contained preview file with all CSS variables
 * from the theme injected into :root.  The resulting file can be loaded in an
 * <iframe> by ThemesStudio (or any host) to show an extension-specific preview.
 *
 * @param {string}  htmlSnippet    Inner HTML shown inside the preview body.
 * @param {object}  theme          A validated theme object (must have .variables).
 * @param {string}  extensionName  Human-readable name shown in the <title>.
 * @returns {{ blob: Blob, filename: string }}
 */
export function exportPreview(htmlSnippet, theme, extensionName = 'extension') {
  if (!theme || typeof theme.variables !== 'object') {
    throw new Error('exportPreview: theme must be a valid theme object with a variables map.');
  }

  const varLines = Object.entries(theme.variables)
    .map(([k, v]) => `  ${k}: ${v};`)
    .join('\n');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${extensionName} Preview</title>
  <style>
    :root {
${varLines}
    }
  </style>
</head>
<body>
${htmlSnippet}
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html' });
  const filename = `${extensionName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.preview.html`;
  return { blob, filename, html };
}
