/**
 * Mock for the 'jszip' npm module used in Vitest tests.
 *
 * The real JSZip works fine in Node, but test files in this project configure
 * their own MockJSZip via `globalThis.JSZip = MockJSZip` so they can control
 * behaviour per test (e.g. simulate corrupt-zip errors with mockRejectedValueOnce).
 *
 * This proxy defers all lookups to whatever `globalThis.JSZip` holds at call
 * time, so the existing test setup continues to work without modification after
 * the dialogs switched from `globalThis.JSZip` to `import JSZip from 'jszip'`.
 *
 * Traps:
 *  - `get`       → property / method access (e.g. JSZip.loadAsync)
 *  - `construct` → `new JSZip()` calls
 *  - `apply`     → bare function calls (fallback)
 */
export default new Proxy(function () {}, {
  get(_, prop) {
    return globalThis.JSZip?.[prop];
  },
  construct(_, args) {
    return new globalThis.JSZip(...args);
  },
  apply(_, thisArg, args) {
    return globalThis.JSZip?.apply(thisArg, args);
  },
});
