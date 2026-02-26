/**
 * Mock for webextension-polyfill used in Vitest tests.
 * The real polyfill throws "This script should only be loaded in a browser extension."
 * when running in Node/jsdom. This mock proxies to the global.chrome object that
 * tests/setup.js configures, so all browser.* API calls in source files resolve
 * to the same vi.fn() stubs as chrome.* calls did before the polyfill migration.
 *
 * A Proxy is used so that property access is deferred until call time, ensuring
 * global.chrome (set in setup.js) is always fully populated when accessed.
 */
export default new Proxy({}, {
  get(_, prop) {
    return global.chrome?.[prop];
  }
});
