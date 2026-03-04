/**
 * export-engine.js
 *
 * Thin orchestrator — all export logic lives in ./export/.
 * Re-exports the complete public API so all callers and tests remain unchanged.
 *
 * Resolved issue 2.3: broken into 9 focused modules under src/lib/export/
 *   filename-utils.js   — sanitizeFilename, buildTopicPath, path helpers
 *   format-helpers.js   — esc, sourceLabel, formatDateHuman, and other text utils
 *   md-to-html.js       — Markdown → HTML converter
 *   html-styles.js      — CSS stylesheets (resolves issue 3.5)
 *   markdown-builder.js — buildExportMarkdown, buildDigestMarkdown
 *   html-builder.js     — buildExportHtml, buildDigestHtml
 *   zip-builder.js      — buildZipPayload
 *   metadata-builder.js — buildMetadataJson, buildReadme
 *   download.js         — triggerDownload
 */

export { sanitizeFilename, buildTopicPath }             from './export/filename-utils.js';
export { buildExportMarkdown, buildDigestMarkdown }     from './export/markdown-builder.js';
export { buildExportHtml, buildDigestHtml }             from './export/html-builder.js';
export { buildZipPayload }                              from './export/zip-builder.js';
export { buildMetadataJson, buildReadme }               from './export/metadata-builder.js';
export { triggerDownload }                              from './export/download.js';

// _mdToHtml is exported for tests (previously a "private" export from the monolith)
export { mdToHtml as _mdToHtml }                        from './export/md-to-html.js';
