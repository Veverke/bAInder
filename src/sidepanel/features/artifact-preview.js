/**
 * artifact-preview.js — Sandboxed artifact preview panel (Task E.3).
 *
 * A slide-in panel that mounts on demand over the entity panel. Contains:
 * - A sandboxed <iframe id="artifactFrame"> (no allow-same-origin).
 * - Close button, source-copy button, download button.
 *
 * Depends on: #artifactPreviewPanel already in sidepanel.html.
 */

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

let _panel   = null;
let _frame   = null;
let _copyBtn = null;
let _dlBtn   = null;

/** @internal — override elements for unit tests */
export function _setElements(els) {
  _panel   = els.panel   ?? _panel;
  _frame   = els.frame   ?? _frame;
  _copyBtn = els.copyBtn ?? _copyBtn;
  _dlBtn   = els.dlBtn   ?? _dlBtn;

  // Wire close button if supplied
  if (els.closeBtn) {
    els.closeBtn.addEventListener('click', () => hideArtifactPreview());
  }
}

// ---------------------------------------------------------------------------
// Lazy DOM initialisation
// ---------------------------------------------------------------------------

function _ensureElements() {
  if (_panel) return; // already initialised
  _panel   = document.getElementById('artifactPreviewPanel');
  _frame   = document.getElementById('artifactFrame');
  _copyBtn = document.getElementById('artifactCopySourceBtn');
  _dlBtn   = document.getElementById('artifactDownloadBtn');

  const closeBtn = document.getElementById('artifactPreviewCloseBtn');
  if (closeBtn) closeBtn.addEventListener('click', () => hideArtifactPreview());
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Show the artifact preview panel and load `entity.source` into the iframe.
 *
 * @param {Object} entity  An artifact entity ({ source, mimeType, artifactType, title })
 */
export function showArtifactPreview(entity) {
  _ensureElements();
  if (!_panel || !_frame) return;

  const { source = '', mimeType = 'text/html', artifactType = 'html', title = '' } = entity;

  // Build srcdoc content
  let srcdoc;
  if (mimeType === 'image/svg+xml') {
    srcdoc = `<!DOCTYPE html><html><body style="margin:0;background:transparent;">${source}</body></html>`;
  } else if (mimeType === 'text/plain') {
    srcdoc = `<!DOCTYPE html><html><body><pre style="margin:0;white-space:pre-wrap;">${_escHtml(source)}</pre></body></html>`;
  } else {
    srcdoc = source || '<!DOCTYPE html><html><body></body></html>';
  }

  _frame.setAttribute('srcdoc', srcdoc);

  // Update panel title
  const titleEl = _panel.querySelector('.artifact-preview__title');
  if (titleEl) titleEl.textContent = title || `Artifact (${artifactType})`;

  // Wire Copy button
  if (_copyBtn) {
    _copyBtn.onclick = (e) => {
      e.stopPropagation();
      navigator.clipboard.writeText(source).catch(() => {});
    };
  }

  // Wire Download button
  if (_dlBtn) {
    _dlBtn.onclick = (e) => {
      e.stopPropagation();
      const ext  = _extForMime(mimeType, artifactType);
      const blob = new Blob([source], { type: mimeType });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `artifact.${ext}`;
      a.click();
      URL.revokeObjectURL(url);
    };
  }

  _panel.removeAttribute('hidden');
  _panel.setAttribute('aria-hidden', 'false');
}

/**
 * Hide the artifact preview panel and clear the iframe src.
 */
export function hideArtifactPreview() {
  _ensureElements();
  if (!_panel) return;
  if (_frame) _frame.removeAttribute('srcdoc');
  _panel.setAttribute('hidden', '');
  _panel.setAttribute('aria-hidden', 'true');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function _escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function _extForMime(mimeType, artifactType) {
  switch (mimeType) {
    case 'text/html':           return 'html';
    case 'image/svg+xml':       return 'svg';
    case 'text/jsx':            return 'jsx';
    case 'text/plain':          return 'txt';
    default:
      // Fallback: use the artifactType string if available
      if (artifactType && artifactType !== 'canvas') return artifactType;
      return 'txt';
  }
}
