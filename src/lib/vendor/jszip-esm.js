/**
 * ES module wrapper for the vendored JSZip UMD bundle.
 *
 * jszip.min.js is a UMD file. In a browser ES-module context `module` and
 * `exports` are both undefined, so its UMD wrapper falls through to the
 * else-branch and assigns the library to `window.JSZip` as a side-effect.
 * This shim triggers that side-effect and then re-exports the global, giving
 * consumers a proper `import JSZip from '…'` interface without a build step.
 *
 * The export is a Proxy that reads `globalThis.JSZip` at **call time** rather
 * than capturing the reference once at import time. This keeps test isolation
 * intact: test files can set `globalThis.JSZip = MockJSZip` after import and
 * the dialogs will see the mock, not the real library.
 */
import './jszip.min.js';
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
