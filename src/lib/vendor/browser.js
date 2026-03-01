/**
 * Minimal browser-API shim for Chrome/Edge MV3.
 *
 * Replaces the bare `webextension-polyfill` npm import so the extension can
 * be loaded unpacked directly from the src/ folder without a build step.
 *
 * Chrome MV3 exposes the full `chrome.*` namespace globally, which is
 * identical in shape to the `browser.*` API that webextension-polyfill wraps
 * — so we simply re-export the global `chrome` object as the default export.
 *
 * During Vite builds, Vite resolves `webextension-polyfill` from node_modules
 * as usual, so this file is only used when loading the extension from source.
 */
export default typeof browser !== 'undefined' ? browser : chrome;
