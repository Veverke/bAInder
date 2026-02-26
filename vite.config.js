import { defineConfig } from 'vite';
import { resolve } from 'path';
import { readFileSync, writeFileSync, cpSync, existsSync } from 'fs';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Deep-merge `override` into `base`.
 * Plain objects are merged recursively; arrays and primitives in `override` win.
 */
function deepMerge(base, override) {
  const result = { ...base };
  for (const [key, val] of Object.entries(override)) {
    const baseVal = base[key];
    if (
      val !== null && typeof val === 'object' && !Array.isArray(val) &&
      baseVal !== null && typeof baseVal === 'object' && !Array.isArray(baseVal)
    ) {
      result[key] = deepMerge(baseVal, val);
    } else {
      result[key] = val;
    }
  }
  return result;
}

/**
 * Strip leading path segments, keeping only the basename.
 * e.g. "src/background/background.js" → "background.js"
 */
const flatten = p => (p ? p.replace(/^.*\/([^/]+)$/, '$1') : p);

// ─── Manifest + asset plugin ──────────────────────────────────────────────────

/**
 * After Vite writes the bundle, produce a complete, self-contained extension
 * package in outDir:
 *   • Merge manifest.json with a browser-specific override (if present)
 *   • Rewrite entry-point paths to match Vite's flat output structure
 *   • Copy the static assets/ directory
 */
function extensionManifestPlugin(browser, outDir) {
  return {
    name: 'extension-manifest',
    closeBundle() {
      // 1. Load and merge manifests
      const base = JSON.parse(readFileSync('manifest.json', 'utf8'));
      let override = {};
      const overridePath = `src/manifests/manifest.${browser}.json`;
      if (existsSync(overridePath)) {
        override = JSON.parse(readFileSync(overridePath, 'utf8'));
        console.log(`[bAInder] merging ${overridePath}`);
      }
      const merged = deepMerge(base, override);

      // 2. Rewrite entry-point paths to match Vite's actual output structure:
      //    - JS entries (background, content) are flattened to the outDir root.
      //    - HTML entries (sidepanel, reader) keep their src/ directory structure.
      //    So only JS paths need rewriting; HTML paths are left unchanged.
      if (merged.background?.service_worker) {
        merged.background.service_worker = flatten(merged.background.service_worker);
      }
      if (merged.content_scripts) {
        merged.content_scripts = merged.content_scripts.map(cs => ({
          ...cs,
          js: cs.js?.map(flatten),
        }));
      }
      // side_panel.default_path NOT flattened — Vite preserves the HTML path.

      // 3. Write the merged manifest into the dist directory
      writeFileSync(`${outDir}/manifest.json`, JSON.stringify(merged, null, 2));

      // 4. Copy the static assets (icons, etc.)
      if (existsSync('assets')) {
        cpSync('assets', `${outDir}/assets`, { recursive: true });
      }

      console.log(`[bAInder] ✓ ${browser} build ready → ${outDir}/`);
    },
  };
}

// ─── Config ───────────────────────────────────────────────────────────────────

export default defineConfig(({ mode }) => {
  // `vite build --mode edge`   → browser = 'edge'
  // `vite build --mode chrome` → browser = 'chrome'
  // `vite build`               → browser = 'chrome' (production default)
  const browser = ['chrome', 'edge', 'firefox'].includes(mode) ? mode : 'chrome';
  const outDir  = `dist/${browser}`;

  return {
  build: {
      rollupOptions: {
        input: {
          background: resolve(__dirname, 'src/background/background.js'),
          content:    resolve(__dirname, 'src/content/content.js'),
          sidepanel:  resolve(__dirname, 'src/sidepanel/sidepanel.html'),
          reader:     resolve(__dirname, 'src/reader/reader.html'),
        },
        output: {
          entryFileNames: '[name].js',
          chunkFileNames: '[name].js',
          assetFileNames: '[name].[ext]',
        },
      },
      outDir,
      emptyOutDir: true,
    },

    plugins: [extensionManifestPlugin(browser, outDir)],
  };
});

