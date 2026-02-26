#!/usr/bin/env node
/**
 * scripts/package.js
 *
 * Zips the dist/<browser> directory into releases/bainder-<browser>-v<version>.zip,
 * ready for submission to the Chrome Web Store or Microsoft Edge Add-ons.
 *
 * Usage:
 *   node scripts/package.js chrome
 *   node scripts/package.js edge
 *
 * Called automatically by:
 *   npm run package:chrome
 *   npm run package:edge
 *   npm run package:all
 */

import JSZip from 'jszip';
import {
  readFileSync,
  writeFileSync,
  readdirSync,
  statSync,
  mkdirSync,
  existsSync,
} from 'fs';
import { join } from 'path';

// ─── Args ─────────────────────────────────────────────────────────────────────

const browser = process.argv[2] || 'chrome';

if (!['chrome', 'edge', 'firefox'].includes(browser)) {
  console.error(`✗ Unknown browser "${browser}". Supported: chrome, edge, firefox`);
  process.exit(1);
}

// ─── Paths ────────────────────────────────────────────────────────────────────

const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
const srcDir      = `dist/${browser}`;
const releasesDir = 'releases';
const outFile     = join(releasesDir, `bainder-${browser}-v${version}.zip`);

if (!existsSync(srcDir)) {
  console.error(`✗ ${srcDir}/ not found — run "npm run build:${browser}" first`);
  process.exit(1);
}

if (!existsSync(releasesDir)) {
  mkdirSync(releasesDir, { recursive: true });
}

// ─── Build zip ────────────────────────────────────────────────────────────────

const zip = new JSZip();

/**
 * Recursively add all files from `dirPath` into the zip at `zipPath`.
 * @param {string} dirPath   Filesystem path to the source directory
 * @param {string} zipPath   Path prefix inside the zip archive
 */
function addDirectory(dirPath, zipPath) {
  for (const entry of readdirSync(dirPath)) {
    const fullPath    = join(dirPath, entry);
    const archivePath = zipPath ? `${zipPath}/${entry}` : entry;

    if (statSync(fullPath).isDirectory()) {
      addDirectory(fullPath, archivePath);
    } else {
      zip.file(archivePath, readFileSync(fullPath));
    }
  }
}

addDirectory(srcDir, '');

zip
  .generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 },
  })
  .then(buffer => {
    writeFileSync(outFile, buffer);
    const kb = (buffer.length / 1024).toFixed(1);
    console.log(`✓ ${outFile}  (${kb} KB)`);
  })
  .catch(err => {
    console.error('✗ Packaging failed:', err.message);
    process.exit(1);
  });
