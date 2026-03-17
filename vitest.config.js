import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      // Redirect webextension-polyfill to a lightweight mock during tests.
      // The real polyfill throws when not running inside a browser extension.
      'webextension-polyfill': resolve(__dirname, 'tests/__mocks__/webextension-polyfill.js'),
      // Redirect jszip to a proxy mock that delegates to globalThis.JSZip.
      // Test files configure globalThis.JSZip = MockJSZip to control behaviour
      // per test (e.g. simulate errors), so this lets the import binding resolve
      // to whichever mock is active without changing the test files.
      'jszip': resolve(__dirname, 'tests/__mocks__/jszip.js'),
      // Also redirect the vendor path used by export-dialog.js and import-dialog.js.
      // Without this alias the UMD bundle executes at module-graph resolution time
      // and captures window.JSZip before any test setup can install its mock.
      '../vendor/jszip-esm.js': resolve(__dirname, 'tests/__mocks__/jszip.js'),
    }
  },
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: ['./tests/setup.js'],
    reporters: ['default', 'junit'],
    outputFile: { junit: './test-results/junit.xml' },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: [
        'node_modules/',
        'tests/',
        'dist/',
        '*.config.js',
        'src/**/*.original.js',
        'src/lib/vendor/**',
        'src/content/ai-injector.js',
      ]
    },
    include: ['tests/**/*.test.js'],
    exclude: ['node_modules', 'dist']
  }
});
