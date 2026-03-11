/**
 * ES module wrapper for JSZip with test-isolation proxy.
 *
 * In production (Vite/Rollup build) we import from the 'jszip' npm package.
 * Vite pre-bundles it with esbuild's CJS→ESM conversion, which synthesises a
 * proper default export — so `_JSZip` is the real JSZip constructor.
 *
 * The Proxy reads `globalThis.JSZip` at **call time** for test isolation:
 * test files set `globalThis.JSZip = MockJSZip` after import, and those mocks
 * take priority via the `??` fallback.  When no override is present (normal
 * runtime), `_JSZip` from the npm package is used instead.
 *
 * Note: the old vendored `jszip.min.js` side-effect import does NOT work with
 * Rollup's CJS interop — the UMD factory runs inside a synthetic module scope
 * where `exports` is defined, so it takes the CJS branch and never sets
 * `window.JSZip`, causing `loadAsync is not a function` at runtime.
 */
import _JSZip from 'jszip';
export default new Proxy(function () {}, {
  get(_, prop) {
    return (globalThis.JSZip ?? _JSZip)?.[prop];
  },
  construct(_, args) {
    return new (globalThis.JSZip ?? _JSZip)(...args);
  },
  apply(_, thisArg, args) {
    return (globalThis.JSZip ?? _JSZip)?.apply(thisArg, args);
  },
});
