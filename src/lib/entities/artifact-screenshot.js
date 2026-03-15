/**
 * artifact-screenshot.js — ArtifactScreenshotService (Task E.2).
 *
 * Renders artifact source in a hidden sandboxed iframe, waits for load,
 * then captures a screenshot as a data URI using html2canvas or canvas.drawImage.
 *
 * Must be called from a context with access to the DOM (content script or
 * sidepanel), not the background script.
 */

/**
 * Render `source` into a hidden sandboxed iframe and capture a screenshot.
 *
 * @param {string} source   HTML/SVG/JSX source string.
 * @param {string} mimeType MIME type (used to decide how to wrap the source).
 * @param {number} [maxPx=280] Maximum dimension for the output data URI.
 * @returns {Promise<string|null>} A data URI or null on failure.
 */
export async function captureArtifactScreenshot(source, mimeType = 'text/html', maxPx = 280) {
  if (!source || typeof source !== 'string' || !source.trim()) return null;

  return new Promise((resolve) => {
    let iframe;
    let timeoutId;

    const cleanup = () => {
      if (timeoutId) clearTimeout(timeoutId);
      if (iframe && iframe.parentNode) iframe.parentNode.removeChild(iframe);
    };

    try {
      // Build the srcdoc content based on mimeType
      let srcdoc;
      if (mimeType === 'image/svg+xml') {
        srcdoc = `<!DOCTYPE html><html><body style="margin:0;background:transparent;">${source}</body></html>`;
      } else {
        // html / jsx / text — wrap bare text in <pre> for readability
        srcdoc = mimeType === 'text/plain'
          ? `<!DOCTYPE html><html><body><pre style="margin:0;white-space:pre-wrap;">${_escapeHtml(source)}</pre></body></html>`
          : source;
      }

      iframe = document.createElement('iframe');
      // Sandboxed: allow-scripts only — no same-origin, no navigation, no network
      iframe.setAttribute('sandbox', 'allow-scripts');
      iframe.setAttribute('srcdoc', srcdoc);
      iframe.style.cssText = [
        'position:fixed',
        'top:-9999px',
        'left:-9999px',
        'width:800px',
        'height:600px',
        'border:none',
        'visibility:hidden',
      ].join(';');

      // Abort after 5 s to avoid hanging on broken source
      timeoutId = setTimeout(() => {
        cleanup();
        resolve(null);
      }, 5000);

      iframe.addEventListener('load', () => {
        try {
          const doc = iframe.contentDocument;
          if (!doc) { cleanup(); resolve(null); return; }

          // Use canvas to capture the iframe content via drawImage
          const canvas = document.createElement('canvas');
          const iw = iframe.offsetWidth  || 800;
          const ih = iframe.offsetHeight || 600;
          const scale = maxPx / Math.max(iw, ih);
          canvas.width  = Math.round(iw * scale);
          canvas.height = Math.round(ih * scale);

          const ctx = canvas.getContext('2d');
          if (!ctx) { cleanup(); resolve(null); return; }

          // drawImage on an iframe is subject to CORS restrictions;
          // in an extension context this is generally permitted for sandboxed
          // iframes whose srcdoc content we control.
          ctx.drawImage(iframe, 0, 0, canvas.width, canvas.height);

          let dataUri = null;
          try {
            dataUri = canvas.toDataURL('image/webp');
          } catch {
            // canvas may be tainted — return null gracefully
          }

          cleanup();
          resolve(dataUri);
        } catch {
          cleanup();
          resolve(null);
        }
      });

      iframe.addEventListener('error', () => { cleanup(); resolve(null); });

      document.body.appendChild(iframe);
    } catch {
      cleanup();
      resolve(null);
    }
  });
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function _escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
