/**
 * audio-interceptor.js — MAIN world content script.
 *
 * Patches two browser APIs to capture dynamically-created audio so that
 * bAInder can embed the audio permanently when the user saves a chat.
 *
 * ── Patch 1: URL.createObjectURL ──────────────────────────────────────────
 * When an audio Blob is converted to a blob: URL (e.g. Gemini rendering an
 * inline audio player), the blob is immediately read by FileReader and stored
 * as a base64 data: URI in a hidden <meta> element on document.head.
 *
 * ── Patch 2: HTMLAnchorElement.prototype.click ────────────────────────────
 * ChatGPT code-interpreter serves generated files from files.oaiusercontent.com
 * using time-limited signed URLs.  When the user clicks the download chip,
 * ChatGPT's JS creates a temporary <a href="signedUrl" download="audio.wav">
 * and programmatically calls .click().  We intercept that call, store the
 * signed URL immediately (so it is available even if the async fetch is still
 * in flight), then fetch the audio data in the background and upgrade the
 * stored URL to a permanent data: URI.
 *
 * Both strategies write to shared <meta name="bainder-audio-cache"> elements:
 *   <meta name="bainder-audio-cache"
 *         data-blob-url="<original blob: or https: URL — dedup key>"
 *         data-data-url="<data:audio/…;base64,… OR https: fallback>"
 *         data-mime="audio/wav">
 *
 * The ISOLATED content script reads these meta elements at save time.
 *
 * Blobs / files larger than 10 MB are skipped; the fallback placeholder path
 * in _collectDocAudio emits "[🔊 Generated audio (not captured)]" instead.
 *
 * Runs at document_start so the patches are in place before any page JS runs.
 */

(function () {
  'use strict';

  if (window.__bAInderAudioInterceptorActive) return;
  window.__bAInderAudioInterceptorActive = true;

  const MAX_BYTES    = 10 * 1024 * 1024; // 10 MB
  const CACHE_NAME   = 'bainder-audio-cache';
  // Audio file extension anywhere in URL (path, query param like ?name=audio.wav).
  const AUDIO_EXT_RE = /\.(wav|mp3|ogg|webm|m4a|aac|flac|opus)(?:[^a-zA-Z]|$)/i;
  // Known AI audio CDN domains.
  const AUDIO_CDN_RE = /files\.oaiusercontent\.com|storage\.googleapis\.com|storage\.cloud\.google\.com/i;
  // Patterns in a URL that hint at audio content:
  //   - audio file extension
  //   - rsct=audio%2F... (Azure Blob signed URL response-content-type param used by ChatGPT)
  //   - rscd=...filename.wav (response-content-disposition with audio filename)
  const AUDIO_URL_HINT_RE = /\.(wav|mp3|ogg|webm|m4a|aac|flac|opus)(?:[^a-zA-Z]|$)|rsct=audio|rscd=[^&]*\.(wav|mp3|ogg|webm|m4a|aac|flac|opus)/i;

  // ── Helpers ────────────────────────────────────────────────────────────

  function _findMeta(key) {
    const metas = document.querySelectorAll(`meta[name="${CACHE_NAME}"]`);
    for (const m of metas) {
      if (m.getAttribute('data-blob-url') === key) return m;
    }
    return null;
  }

  // Infer MIME type from URL file extension (for octet-stream CDN responses).
  function _mimeFromUrl(u) {
    const m = u.match(/\.(wav|mp3|ogg|webm|m4a|aac|flac|opus)/i);
    const ext = m ? m[1].toLowerCase() : '';
    return { wav:'audio/wav', mp3:'audio/mpeg', ogg:'audio/ogg', webm:'audio/webm',
             m4a:'audio/mp4', aac:'audio/aac', flac:'audio/flac', opus:'audio/ogg' }[ext] || '';
  }

  function _writeMeta(key, dataUrl, mime) {
    try {
      const existing = _findMeta(key);
      if (existing) {
        if (dataUrl) existing.setAttribute('data-data-url', dataUrl);
        return;
      }
      const meta = document.createElement('meta');
      meta.setAttribute('name',          CACHE_NAME);
      meta.setAttribute('data-blob-url', key);
      meta.setAttribute('data-data-url', dataUrl || key);
      meta.setAttribute('data-mime',     mime || '');
      (document.head || document.documentElement).appendChild(meta);
    } catch (_) { /* DOM not ready — non-fatal */ }
  }

  // ── Patch 1: URL.createObjectURL ───────────────────────────────────────

  const _origCreate = URL.createObjectURL.bind(URL);

  URL.createObjectURL = function (blob) {
    const url = _origCreate(blob);

    if (
      blob instanceof Blob &&
      typeof blob.type === 'string' &&
      blob.type.startsWith('audio/') &&
      blob.size > 0 &&
      blob.size <= MAX_BYTES
    ) {
      const mime    = blob.type;
      const blobUrl = url;
      const reader  = new FileReader();
      reader.onload = function () {
        _writeMeta(blobUrl, /** @type {string} */ (reader.result), mime);
      };
      reader.readAsDataURL(blob);
    }

    return url;
  };

  // ── Patch 2: HTMLAnchorElement.prototype.click ─────────────────────────
  // Catches: create <a href="signedUrl" download="file.wav">, .click(), remove.
  // ChatGPT code-interpreter uses this pattern to trigger audio file downloads.

  const _origAnchorClick = HTMLAnchorElement.prototype.click;

  HTMLAnchorElement.prototype.click = function () {
    try {
      const href = this.href || '';
      const dl   = (this.getAttribute('download') ?? '').trim();
      if (
        href &&
        !href.startsWith('blob:') &&
        (href.startsWith('https:') || href.startsWith('http:')) &&
        (AUDIO_EXT_RE.test(href) || AUDIO_EXT_RE.test(dl) ||
         (AUDIO_CDN_RE.test(href) && (dl !== '' || AUDIO_URL_HINT_RE.test(href))))
      ) {
        // Store the HTTPS URL immediately so the content script sees it even
        // if the async fetch below has not finished yet.
        _writeMeta(href, href, '');

        // Async: fetch the audio bytes and upgrade to a permanent data: URI.
        (async function () {
          try {
            const resp = await fetch(href);
            if (!resp.ok) return;
            const ct = (resp.headers.get('content-type') || '').split(';')[0].trim();
            if (!ct.startsWith('audio/') && !AUDIO_EXT_RE.test(dl || href)) return;
            const buf = await resp.arrayBuffer();
            if (buf.byteLength > MAX_BYTES) return; // keep the HTTPS URL as fallback
            const mime  = ct || 'audio/mpeg';
            const bytes = new Uint8Array(buf);
            let b = '';
            for (let i = 0; i < bytes.length; i++) b += String.fromCharCode(bytes[i]);
            _writeMeta(href, `data:${mime};base64,${btoa(b)}`, mime);
          } catch (_) { /* CORS / network — the HTTPS URL fallback survives */ }
        })();
      }
    } catch (_) { /* never prevent the original click */ }

    return _origAnchorClick.apply(this, arguments);
  };

  // ── Patch 3: window.fetch interceptor ──────────────────────────────────────
  // When ChatGPT's own code fetches audio from files.oaiusercontent.com (runs
  // in the page's JS context so same-origin CORS is allowed), we clone the
  // response, convert to a data: URI, and store in the meta cache.
  // The original response is returned immediately — no page delay.

  const _origFetch = window.fetch.bind(window);

  window.fetch = async function (input, init) {
    const url = typeof input === 'string' ? input
              : (input instanceof URL     ? input.href
              : (input instanceof Request ? input.url : ''));

    let resp;
    try { resp = await _origFetch(input, init); }
    catch (e) { throw e; }

    try {
      if (url && !url.startsWith('data:') && !url.startsWith('blob:')) {
        const ct    = resp.headers.get('content-type') || '';
        // Detect audio by content-type; also handle application/octet-stream from
        // CDN URLs where audio type is encoded in the URL (rsct=audio%2Fwav etc.).
        let mime = (ct.match(/^(audio\/[^;,\s]+)/) || [])[1] || '';
        if (!mime && (ct.startsWith('application/octet-stream') || !ct) &&
            AUDIO_CDN_RE.test(url) && AUDIO_URL_HINT_RE.test(url)) {
          mime = _mimeFromUrl(url) || 'audio/wav';
        }
        if (mime) {
          const existing = _findMeta(url);
          if (!existing || !existing.getAttribute('data-data-url').startsWith('data:')) {
            const clone = resp.clone();
            (async () => {
              try {
                const buf = await clone.arrayBuffer();
                if (buf.byteLength === 0 || buf.byteLength > MAX_BYTES) return;
                const bytes = new Uint8Array(buf);
                let b = '';
                for (let i = 0; i < bytes.length; i++) b += String.fromCharCode(bytes[i]);
                console.log('[bAInder main] fetch interceptor: audio', url.slice(0, 80), 'size:', buf.byteLength);
                _writeMeta(url, `data:${mime};base64,${btoa(b)}`, mime);
              } catch (_) {}
            })();
          }
        }
      }
    } catch (_) {}

    return resp;
  };

  // ── Patch 4: XMLHttpRequest interceptor ────────────────────────────────────
  // Some page scripts use XHR instead of fetch.  Intercept XHR responses that
  // deliver audio blobs (arraybuffer or blob response-type).

  const _origOpen = XMLHttpRequest.prototype.open;
  const _origSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url) {
    this.__bainder_url = typeof url === 'string' ? url : (url ? String(url) : '');
    return _origOpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function () {
    const url = this.__bainder_url || '';
    if (url && !url.startsWith('data:') && !url.startsWith('blob:')) {
      this.addEventListener('load', function () {
        try {
          const ct    = this.getResponseHeader('content-type') || '';
          // Detect audio by content-type; also handle application/octet-stream from CDN.
          let mime = (ct.match(/^(audio\/[^;,\s]+)/) || [])[1] || '';
          if (!mime && (ct.startsWith('application/octet-stream') || !ct) &&
              AUDIO_CDN_RE.test(url) && AUDIO_URL_HINT_RE.test(url)) {
            mime = _mimeFromUrl(url) || 'audio/wav';
          }
          if (!mime) return;
          const existing = _findMeta(url);
          if (existing && existing.getAttribute('data-data-url').startsWith('data:')) return;
          let blob;
          if (this.responseType === 'blob' && this.response instanceof Blob) {
            blob = this.response;
          } else if ((this.responseType === 'arraybuffer' || this.responseType === '') && this.response) {
            blob = new Blob([this.response], { type: mime });
          }
          if (!blob || blob.size === 0 || blob.size > MAX_BYTES) return;
          const reader = new FileReader();
          reader.onload = function () {
            console.log('[bAInder main] XHR interceptor: audio', url.slice(0, 80));
            _writeMeta(url, /** @type {string} */ (reader.result), mime);
          };
          reader.readAsDataURL(blob);
        } catch (_) {}
      });
    }
    return _origSend.apply(this, arguments);
  };

  // ── Patch 6: HTMLMediaElement.src property setter ───────────────────────
  // Complements the MutationObserver: catches audio.src = url via property
  // assignment (e.g. inside closed shadow roots, or before DOM attachment).
  // Fires the moment the page JS assigns the src — before readyState advances.

  const _mediaElSrcDesc = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'src');
  if (_mediaElSrcDesc && _mediaElSrcDesc.set) {
    Object.defineProperty(HTMLMediaElement.prototype, 'src', {
      get() { return _mediaElSrcDesc.get.call(this); },
      set(value) {
        const v = String(value || '');
        if (this instanceof HTMLAudioElement && v && !v.startsWith('data:')) {
          console.log('[bAInder main] audio.src setter:', v.slice(0, 100));
          if (v.startsWith('blob:')) {
            _tryCaptureBlobSrc(v);
          } else if ((v.startsWith('https:') || v.startsWith('http:')) &&
                     (AUDIO_CDN_RE.test(v) || AUDIO_URL_HINT_RE.test(v))) {
            _tryCaptureCDNHref(v, false);
          }
        }
        return _mediaElSrcDesc.set.call(this, value);
      },
      configurable: true,
      enumerable:   true,
    });
  }

  // ── Patch 5: MutationObserver — proactive DOM sweep ────────────────────────
  // Watches the live DOM for <audio> elements and CDN download anchors added
  // after page load (e.g. ChatGPT code-interpreter file chips rendered after a
  // response, Gemini audio players).  Pre-fetches and caches so that
  // collectAudioFromPage() finds them in the meta cache at save time — even if
  // the user never clicks the download button.

  function _tryCaptureCDNHref(href, hasDownload) {
    if (!href || href.startsWith('data:') || href.startsWith('blob:')) return;
    if (!AUDIO_CDN_RE.test(href)) return;
    // If the anchor has a download attribute, capture regardless of URL hints
    // (the content-type header is checked when fetching, so non-audio files are
    // discarded safely).  Without download attr, require audio URL hints to
    // avoid proactively fetching unrelated CDN assets (images, documents, etc.).
    if (!hasDownload && !AUDIO_URL_HINT_RE.test(href)) return;
    if (_findMeta(href)) return; // already cached
    // Store the HTTPS URL immediately as a recoverable fallback.
    _writeMeta(href, href, '');
    console.log('[bAInder main] MutationObserver: CDN audio link queued:', href.slice(0, 100));
    // Async: fetch bytes and upgrade to a permanent data: URI.
    ;(async () => {
      try {
        const resp = await _origFetch(href, { credentials: 'include' });
        if (!resp.ok) { _findMeta(href) && _findMeta(href).remove(); return; }
        const ct = (resp.headers.get('content-type') || '').split(';')[0].trim();
        if (!ct.startsWith('audio/')) { const m = _findMeta(href); if (m) m.remove(); return; }
        const buf = await resp.arrayBuffer();
        if (!buf.byteLength || buf.byteLength > MAX_BYTES) return;
        const bytes = new Uint8Array(buf);
        let b = '';
        for (let i = 0; i < bytes.length; i++) b += String.fromCharCode(bytes[i]);
        console.log('[bAInder main] MutationObserver: cached audio', href.slice(0, 80), 'bytes:', buf.byteLength);
        _writeMeta(href, `data:${ct};base64,${btoa(b)}`, ct);
      } catch (err) {
        console.log('[bAInder main] MutationObserver: fetch failed', href.slice(0, 80), String(err));
      }
    })();
  }

  function _tryCaptureBlobSrc(src) {
    if (!src || !src.startsWith('blob:') || _findMeta(src)) return;
    ;(async () => {
      try {
        const resp = await fetch(src);
        if (!resp.ok) return;
        const blob = await resp.blob();
        if (!blob.type.startsWith('audio/') || !blob.size || blob.size > MAX_BYTES) return;
        const reader = new FileReader();
        reader.onload = function () {
          console.log('[bAInder main] MutationObserver: blob audio captured:', src.slice(0, 80));
          _writeMeta(src, /** @type {string} */ (reader.result), blob.type);
        };
        reader.readAsDataURL(blob);
      } catch (_) {}
    })();
  }

  function _scanAddedNode(node) {
    if (!node || node.nodeType !== 1) return;
    const tag = node.tagName.toLowerCase();
    if (tag === 'audio') {
      const s = node.src || node.getAttribute('src') || '';
      if (s.startsWith('blob:'))  _tryCaptureBlobSrc(s);
      else                        _tryCaptureCDNHref(s);
      for (const src of node.querySelectorAll('source[src]')) {
        const ss = src.src || src.getAttribute('src') || '';
        if (ss.startsWith('blob:')) _tryCaptureBlobSrc(ss);
        else                        _tryCaptureCDNHref(ss);
      }
    } else if (tag === 'a') {
      const hasDL = node.hasAttribute('download');
      _tryCaptureCDNHref(node.href || node.getAttribute('href') || '', hasDL);
    } else {
      for (const audio of node.querySelectorAll('audio')) _scanAddedNode(audio);
      for (const a of node.querySelectorAll('a[href]')) {
        const hasDL = a.hasAttribute('download');
        _tryCaptureCDNHref(a.href || a.getAttribute('href') || '', hasDL);
      }
    }
  }

  const _domObserver = new MutationObserver(mutations => {
    for (const m of mutations) {
      if (m.type === 'childList')  for (const n of m.addedNodes) _scanAddedNode(n);
      if (m.type === 'attributes') _scanAddedNode(/** @type {Element} */ (m.target));
    }
  });

  function _startDOMObserver() {
    const root = document.body || document.documentElement;
    if (root) {
      _domObserver.observe(root, { childList: true, subtree: true, attributeFilter: ['src', 'href'] });
      // Initial scan: catch elements already present when the interceptor loads.
      _scanAddedNode(document.documentElement);
    } else {
      // Body not ready yet (document_start on slow pages).
      new MutationObserver(function (_, obs) {
        if (document.body) { obs.disconnect(); _startDOMObserver(); }
      }).observe(document.documentElement, { childList: true });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _startDOMObserver, { once: true });
  } else {
    _startDOMObserver();
  }

})();
