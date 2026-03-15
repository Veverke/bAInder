/**
 * thumbnail-service.js — Image thumbnail generation (Task D.2).
 *
 * Pure utility: takes an image URL or data URI and returns a resized data URI
 * (max `maxPx` on the longest dimension) using an OffscreenCanvas.
 *
 * Must be called from the content-script context (not the background script)
 * because it requires a loaded Image and OffscreenCanvas.
 */

/**
 * Generate a thumbnail for the given image src.
 *
 * @param {string} src     An image URL or data URI.
 * @param {number} [maxPx=400]  Maximum dimension (width or height) of the thumbnail.
 * @returns {Promise<string|null>}  A data URI (image/webp or image/jpeg) or null on failure.
 */
export async function generateThumbnail(src, maxPx = 400) {
  if (!src) return null;

  return new Promise((resolve) => {
    try {
      const img = new Image();

      img.onload = () => {
        try {
          const { naturalWidth: w, naturalHeight: h } = img;
          if (w === 0 || h === 0) { resolve(null); return; }

          // Already within limits — return null to signal "use original"
          if (w <= maxPx && h <= maxPx) { resolve(null); return; }

          const scale = maxPx / Math.max(w, h);
          const tw    = Math.round(w * scale);
          const th    = Math.round(h * scale);

          // Prefer OffscreenCanvas (available in workers + content scripts);
          // fall back to a regular <canvas> in environments that lack it.
          let canvas;
          let ctx;
          if (typeof OffscreenCanvas !== 'undefined') {
            canvas = new OffscreenCanvas(tw, th);
            ctx    = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, tw, th);
            canvas.convertToBlob({ type: 'image/webp', quality: 0.82 })
              .then(blob => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = () => resolve(null);
                reader.readAsDataURL(blob);
              })
              .catch(() => resolve(null));
          } else {
            // Fallback for jsdom / environments without OffscreenCanvas
            canvas = document.createElement('canvas');
            canvas.width  = tw;
            canvas.height = th;
            ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, tw, th);
            try {
              resolve(canvas.toDataURL('image/webp'));
            } catch {
              resolve(null);
            }
          }
        } catch {
          resolve(null);
        }
      };

      img.onerror = () => resolve(null);

      // CORS — set crossOrigin before setting src so the browser sends the
      // appropriate request header allowing canvas read-back.
      img.crossOrigin = 'anonymous';
      img.src = src;
    } catch {
      resolve(null);
    }
  });
}
