/**
 * ES module wrapper for the vendored JSZip UMD bundle.
 *
 * jszip.min.js is a UMD file. In a browser ES-module context `module` and
 * `exports` are both undefined, so its UMD wrapper falls through to the
 * else-branch and assigns the library to `window.JSZip` as a side-effect.
 * This shim triggers that side-effect and then re-exports the global, giving
 * consumers a proper `import JSZip from '…'` interface without a build step.
 */
import './jszip.min.js';
export default window.JSZip;
