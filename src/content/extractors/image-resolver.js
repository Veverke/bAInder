/**
 * Image blob resolver.
 *
 * Before a DOM element is passed to the synchronous htmlToMarkdown(), this
 * utility resolves every `blob:` img src to a persistent `data:` URL.
 * Images whose blob URL can no longer be fetched are marked with a
 * `data-binder-img-lost` attribute so htmlToMarkdown() can emit a
 * human-readable placeholder instead of silently dropping the image.
 *
 * The live page DOM is never mutated — the function always clones first.
 */

/**
 * Attribute added to <img> elements whose blob fetch failed.
 * Value is the alt text (or 'Image') so htmlToMarkdown can use it in the placeholder.
 */
export const BLOB_LOST_ATTR = 'data-binder-img-lost';

/**
 * Convert a Blob to a data: URL.
 * @param {Blob} blob
 * @returns {Promise<string>}
 */
export function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(/** @type {string} */ (reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/**
 * Clone `el` and resolve all `<img>` elements that need embedding:
 *   - `blob:` URLs → fetched directly from the content script (same renderer).
 *   - `https:`/`http:` URLs → fetched via `fetchViaBackground` when provided
 *     (required for hosts that send CORP: same-site; background workers are exempt).
 *
 * Also resolves srcset-only images (no src attribute) using `currentSrc` from
 * the live element before cloning, since clones don't have a resolved `currentSrc`.
 *
 * Images whose fetch fails are marked with `data-binder-img-lost` so that
 * `htmlToMarkdown` can emit a human-readable placeholder instead of a broken URL.
 *
 * If nothing needs processing the original element is returned as-is (fast path).
 *
 * @param {Element} el
 * @param {((url: string) => Promise<string>) | null} [fetchViaBackground]
 *   Optional callback that resolves an https: URL to a data: URL by routing
 *   the fetch through the extension background service worker.
 * @param {Element|null} [dimsEl]
 *   Optional live DOM element to read BCR dimensions from. Use when `el` is a
 *   detached clone (e.g. after stripSourceContainers). Must have the same img
 *   count/order as `el`.
 * @returns {Promise<Element>}
 */
export async function resolveImageBlobs(el, fetchViaBackground = null, dimsEl = null) {
  const liveImgs = Array.from(el.querySelectorAll('img'));
  if (liveImgs.length === 0) return el;

  // Use dimsEl (the original live element) for BCR reads when el is a detached clone.
  const dimImgs = dimsEl ? Array.from(dimsEl.querySelectorAll('img')) : liveImgs;

  // Collect the effective URL AND rendered dimensions from the LIVE element.
  // currentSrc is the browser-resolved URL (from srcset + sizes); it's lost on cloneNode.
  const liveData = liveImgs.map((img, i) => {
    let src = img.currentSrc || img.getAttribute('src') || img.getAttribute('data-src') || '';
    if (!src) {
      const srcset = img.getAttribute('srcset') || '';
      if (srcset) src = srcset.trim().split(/[,\s]+/)[0];
    }
    // Use rendered (displayed) size so reader shows the image at the same size
    // the user saw in the source chat. Read from the live dimImg (not the clone).
    // If the img has no layout box of its own (e.g. inside a <button> wrapper),
    // walk up to the nearest parent that has a non-zero rect.
    const dimImg = dimImgs[i] || img;
    const rect = dimImg.getBoundingClientRect ? dimImg.getBoundingClientRect() : {};
    let w = Math.round(rect.width  || 0);
    let h = Math.round(rect.height || 0);
    if (w === 0) {
      const wrapper = dimImg.closest ? dimImg.closest('button, figure, [role="img"], a') : null;
      if (wrapper) {
        const wr = wrapper.getBoundingClientRect();
        w = Math.round(wr.width  || 0);
        h = Math.round(wr.height || 0);
      }
    }
    const naturalWidth  = w || dimImg.naturalWidth  || 0;
    const naturalHeight = h || dimImg.naturalHeight || 0;
    return { src, naturalWidth, naturalHeight };
  });
  const liveUrls = liveData.map(d => d.src);

  const needsProcessing = liveUrls.some(src =>
    src.startsWith('blob:') ||
    (fetchViaBackground && (src.startsWith('http:') || src.startsWith('https:')))
  );
  if (!needsProcessing) return el;

  const clone = el.cloneNode(true);
  const cloneImgs = Array.from(clone.querySelectorAll('img'));

  await Promise.all(cloneImgs.map(async (img, i) => {
    const src = liveUrls[i];
    const { naturalWidth, naturalHeight } = liveData[i];
    if (!src) return;

    try {
      let dataUrl;
      if (src.startsWith('blob:')) {
        const r = await fetch(src);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        dataUrl = await blobToDataUrl(await r.blob());
      } else if (fetchViaBackground && (src.startsWith('http:') || src.startsWith('https:'))) {
        dataUrl = await fetchViaBackground(src);
        if (!dataUrl || !dataUrl.startsWith('data:')) throw new Error('Invalid dataUrl from background');
      } else {
        return; // not blob and no background fetch provided — leave unchanged
      }
      img.setAttribute('src', dataUrl);
      img.removeAttribute('data-src');
      img.removeAttribute('srcset'); // htmlToMarkdown should use the resolved data: src
      if (naturalWidth > 0) img.setAttribute('data-natural-width', String(naturalWidth));
      if (naturalHeight > 0) img.setAttribute('data-natural-height', String(naturalHeight));
    } catch (_) {
      const altText = (img.getAttribute('alt') || '').trim() || 'Image';
      img.removeAttribute('src');
      img.removeAttribute('data-src');
      img.removeAttribute('srcset');
      img.setAttribute(BLOB_LOST_ATTR, altText);
    }
  }));

  return clone;
}

/**
 * Walk `root` recursively — including open shadow roots — and collect every
 * <img> element's src and alt.  Standard querySelectorAll() cannot pierce
 * shadow roots, so this covers images in Gemini's Angular custom elements.
 *
 * @param {Element|ShadowRoot|Document} root
 * @param {number} [maxShadowDepth=6]  How many shadow-root levels to descend
 * @returns {Array<{src: string, alt: string}>}
 */
export function collectShadowImages(root, maxShadowDepth = 6) {
  const results = [];

  // inShadow: only collect <img> nodes that are actually inside a shadow root.
  // Light-DOM images are already handled by resolveImageBlobs; collecting them
  // here too would cause duplicates (the original URL is gone from the markdown
  // after resolveImageBlobs replaces it with a data: URL, so the duplicate-check
  // in appendShadowImages would fail to catch it).
  function walk(node, shadowDepth, inShadow) {
    if (!node) return;
    const type = node.nodeType;
    // Only process element nodes and document fragments (shadow roots)
    if (type !== 1 /* ELEMENT_NODE */ && type !== 11 /* DOCUMENT_FRAGMENT_NODE */) return;

    if (type === 1) {
      const tag = node.tagName.toLowerCase();
      if (inShadow && tag === 'img') {
        // currentSrc reflects the actually-loaded URL (resolved from srcset).
        // Fall back to src, data-src, or the first srcset entry in that order.
        let src = node.currentSrc || node.getAttribute('src') || node.getAttribute('data-src') || '';
        if (!src) {
          const srcset = node.getAttribute('srcset') || '';
          if (srcset) {
            // "url 1x, url2 2x" → first token
            src = srcset.trim().split(/[,\s]+/)[0];
          }
        }
        const alt = (node.getAttribute('alt') || '').trim();
        if (src && !src.startsWith('data:')) {
          const rect = node.getBoundingClientRect ? node.getBoundingClientRect() : {};
          let w = Math.round(rect.width  || 0);
          let h = Math.round(rect.height || 0);
          if (w === 0) {
            const wrapper = node.closest ? node.closest('button, figure, [role="img"], a') : null;
            if (wrapper) {
              const wr = wrapper.getBoundingClientRect();
              w = Math.round(wr.width  || 0);
              h = Math.round(wr.height || 0);
            }
          }
          results.push({
            src, alt,
            naturalWidth:  w || node.naturalWidth  || 0,
            naturalHeight: h || node.naturalHeight || 0,
          });
        }
      }
      // Descend into open shadow root (counts against depth budget)
      if (shadowDepth > 0 && node.shadowRoot) {
        walk(node.shadowRoot, shadowDepth - 1, true);
      }
    }

    // Walk light-DOM / fragment children
    for (const child of node.childNodes) {
      walk(child, shadowDepth, inShadow);
    }
  }

  walk(root, maxShadowDepth, false);
  return results;
}

/**
 * Resolve, convert and append any images found via shadow-DOM traversal that
 * are not already represented in `existingMarkdown`.
 * Blob: URLs are fetched and converted to data: URLs.
 * If a fetch fails the image is represented by a placeholder string.
 *
 * @param {Element}  liveEl              The original (non-cloned) live DOM element
 * @param {string}   existingMarkdown    Already-extracted markdown for this turn
 * @param {((url: string) => Promise<string>) | null} [fetchViaBackground]
 *   Optional callback that resolves a URL to a data: URL by routing the fetch
 *   through the extension background service worker, bypassing CORP restrictions.
 *   Required for https: images on sites that send Cross-Origin-Resource-Policy:
 *   same-site (e.g. lh3.google.com).  When omitted, a direct fetch() is tried.
 * @returns {Promise<string>}            existingMarkdown, possibly with images appended
 */
export async function appendShadowImages(liveEl, existingMarkdown, fetchViaBackground = null) {
  const shadowImgs = collectShadowImages(liveEl);
  if (shadowImgs.length === 0) return existingMarkdown;

  const parts = [];
  for (const { src, alt, naturalWidth, naturalHeight } of shadowImgs) {
    // Skip images whose URL is already in the markdown (already captured)
    if (existingMarkdown.includes(src)) continue;

    if (src.startsWith('blob:') || src.startsWith('http:') || src.startsWith('https:')) {
      try {
        let dataUrl;
        if (src.startsWith('blob:')) {
          // Blob URLs are accessible directly from the content script's isolated world.
          const r = await fetch(src);
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          dataUrl = await blobToDataUrl(await r.blob());
        } else if (fetchViaBackground) {
          // Route https: URLs through the background service worker which is exempt
          // from CORP enforcement when host_permissions are declared for the domain.
          dataUrl = await fetchViaBackground(src);
          if (!dataUrl || !dataUrl.startsWith('data:')) throw new Error('Invalid dataUrl from background');
        } else {
          // Fallback: direct fetch (works when CORP allows it).
          const r = await fetch(src, { credentials: 'include' });
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          dataUrl = await blobToDataUrl(await r.blob());
        }
        const suffix = (naturalWidth && naturalHeight)
          ? `{width=${naturalWidth} height=${naturalHeight}}` : '';
        parts.push(`\n![${alt}](${dataUrl})${suffix}\n`);
      } catch (_) {
        // Fetch failed — emit a placeholder instead of an unreachable URL.
        const desc = alt || 'Image';
        parts.push(`\n[🖼️ Image not captured: ${desc}]\n`);
      }
    }
  }

  return parts.length ? existingMarkdown + parts.join('') : existingMarkdown;
}
