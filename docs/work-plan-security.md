# Security Work Plan

_Audit date: 2025-07_
_Scope: full extension source (background, content scripts, sidepanel, reader, compare, lib/)_

---

## Release Verdict

**No hard blockers.** All P1 issues are self-XSS from already-saved (locally-stored) content — they cannot be triggered remotely without first compromising the user's local data. Two P1 issues should ideally be fixed before or immediately after launch; the rest follow in subsequent releases.

---

## Priority Levels

| Level | Meaning |
|-------|---------|
| P1    | Fix before or immediately after public launch |
| P2    | Fix in first minor releases (early post-launch sprint) |
| P3    | Future-proofing; fix before v1.0 milestone |
| P4    | Track; fix only if reported or if threat model changes |

---

## P1 — Fix before / immediately after launch ✅ DONE

### P1.1 — SVG innerHTML injection in `diagram-card.js`

**File:** `src/lib/renderer/entity-cards/diagram-card.js` line 35
**Code:**
```js
svgWrapper.innerHTML = thumbnailSvg;
```
**Risk:** `thumbnailSvg` is SVG source extracted from AI chat DOM content. SVG supports `<script>` tags, `onload` event handlers, and `<foreignObject>` XSS vectors. Rendering this with `innerHTML` in the extension sidepanel (`chrome-extension://` origin) means any injected script gains access to the full extension context including `chrome.*` APIs and all stored chat data.

**Exploit scenario:** A malicious AI assistant response contains a code block with an SVG payload. The user saves the chat and opens the Entities panel. The SVG entity card triggers script execution in the extension origin.

**Fix:** Sanitize the SVG before injection:
```js
// Option A — strip dangerous SVG elements with DOMParser
const doc = new DOMParser().parseFromString(thumbnailSvg, 'image/svg+xml');
['script', 'foreignObject'].forEach(tag =>
  doc.querySelectorAll(tag).forEach(el => el.remove())
);
doc.querySelectorAll('*').forEach(el => {
  [...el.attributes]
    .filter(a => /^on/i.test(a.name) || /javascript:/i.test(a.value))
    .forEach(a => el.removeAttribute(a.name));
});
svgWrapper.innerHTML = new XMLSerializer().serializeToString(doc);

// Option B (preferred long-term) — render inside a sandbox iframe without allow-scripts
```

---

### P1.2 — Markdown link href lacks URL scheme validation in `reader.js`

**File:** `src/reader/reader.js` — `applyInline()` (explicit markdown link branch)
**Code:**
```js
return protect(`<a href="${href}" target="_blank" rel="noopener noreferrer">${text}</a>`);
```
**Risk:** No URL scheme check is applied to explicit markdown links `[text](href)`. A saved chat that contains `[click me](javascript:alert(1))` renders a clickable XSS link in the reader. Compare with `src/lib/export/md-to-html.js` which already has a correct guard:
```js
const SAFE_HREF = /^(https?:|mailto:|\/|#|[^:]*$)/i;
```

**Fix:** Apply the same regex before emitting the `<a>` tag:
```js
const SAFE_HREF = /^(https?:|mailto:|\/|#|[^:]*$)/i;
// In applyInline, explicit link branch:
const safeHref = SAFE_HREF.test(href) ? href : '#';
return protect(`<a href="${safeHref}" target="_blank" rel="noopener noreferrer">${text}</a>`);
```

---

### P1.3 — Background `onMessage` lacks sender identity validation

**File:** `src/background/background.js` — `browser.runtime.onMessage.addListener`
**Code:** The handler switches on `message.type` (`FETCH_IMAGE_AS_DATA_URL`, `SAVE_CHAT`, `STORE_EXCERPT_CACHE`, `CAPTURE_DESIGNER_IMAGE`, etc.) with no `sender.id` check.

**Risk:** Web pages cannot send runtime messages (no `externally_connectable` declared) — but other browser extensions can. A malicious co-installed extension can:
- Invoke `FETCH_IMAGE_AS_DATA_URL` to make the extension act as an authenticated fetch proxy for any URL within the declared host permissions (including AI chat APIs).
- Invoke `SAVE_CHAT` to overwrite or corrupt stored chat data.
- Invoke `STORE_EXCERPT_CACHE` to poison the session excerpt cache.

The sidepanel already uses `message-validator.js` with a `sender.id !== extensionId` guard — this check is missing in the background.

**Note:** Messages from content scripts (injected by the extension itself) will have `sender.id === extensionId`; legitimate message flow is unaffected by adding the guard.

**Fix:**
```js
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Reject messages from any sender that is not this extension itself
  if (!sender.id || sender.id !== browser.runtime.id) return false;
  switch (message.type) { /* ... */ }
});
```

---

## P2 — Fix in first minor releases ✅ DONE

### P2.1 — Artifact preview srcdoc renders SVG without stripping scripts

**Files:** `src/sidepanel/features/artifact-preview.js` (line 66), `src/lib/entities/artifact-screenshot.js` (line 35)
**Code:**
```js
srcdoc = `<!DOCTYPE html><html><body style="margin:0;background:transparent;">${source}</body></html>`;
```
**Risk:** Both iframes use `sandbox="allow-scripts"` (without `allow-same-origin`), so scripts run in a null origin and cannot directly access extension storage. However, scripts can still execute and may exfiltrate data via `fetch()` to attacker-controlled endpoints, or probe extension APIs in ways that depend on sandbox context.

**Fix:** For SVG artifacts specifically, strip `<script>` tags and `on*` attributes (same approach as P1.1) before injecting into srcdoc. Alternatively, remove `allow-scripts` from the sandbox entirely for SVG/text artifact types when script execution adds no value.

---

### P2.2 — `DialogManager._sanitiseHtml` is an incomplete sanitizer

**File:** `src/lib/dialogs/dialog-manager.js` — `_sanitiseHtml()`
**Current state:** Uses `DOMParser` to remove `<script>` tags (and their content), strip `on*` event attributes, and clear `javascript:` from `href`/`src`/`action` attributes. This covers the obvious injection vectors.
**Missing coverage:**
- `<style>` tags (CSS-based attacks: `expression()`, external font exfiltration via `@font-face`)
- `data:text/html` URIs in `href`/`src` (load arbitrary HTML pages)
- `vbscript:` URL scheme
- `<base href>` tags (base URL manipulation)
- SVG-specific vectors (`<animate>`, `<use xlink:href="data:...">`)

**Fix (option A — expand allowlist):** Switch from a denylist (remove bad) to an allowlist (keep only known-safe tags: `p`, `strong`, `em`, `ul`, `li`, `ol`, `br`, `a`, `code`, `pre`). Reject everything else.

**Fix (option B — add DOMPurify):** Introduce [DOMPurify](https://github.com/cure53/DOMPurify) as a dev dependency and replace `_sanitiseHtml` with `DOMPurify.sanitize(html)`. DOMPurify is battle-tested and actively maintained.

---

### P2.3 — Sticky note markdown preview has the same `javascript:` link issue

**File:** `src/lib/sticky-notes/sticky-notes-ui.js` (line 369)
**Code:**
```js
preview.innerHTML = note.content ? renderFn(note.content) : plainTextRender(note.content);
```
`renderFn` calls `renderMarkdown`, which uses the same `applyInline()` path as P1.2. Notes are user-authored and stored locally (self-XSS only in the current single-user model), but the fix from P1.2 propagates here automatically since `renderMarkdown` calls `applyInline()`.

**Fix:** Resolve automatically by fixing P1.2. No separate action needed if `applyInline` is patched.

---

## P3 — Future-proofing

### P3.1 — `FETCH_IMAGE_AS_DATA_URL` fetches with credentials and no URL allow-list

**File:** `src/background/background.js` — `FETCH_IMAGE_AS_DATA_URL` handler
**Code:**
```js
const resp = await fetch(imgUrl, { credentials: 'include' });
```
**Risk:** Chrome enforces host permissions on extension fetches, so arbitrary SSRF is already constrained. However, if the content script were compromised (e.g., via a supply-chain attack on the content script itself, or a future prototype pollution bug), an attacker-supplied URL within the declared host permission set could be fetched with the user's session cookies.

**Fix:** Add an explicit URL allow-list that mirrors the `host_permissions` before fetching:
```js
const ALLOWED_IMAGE_ORIGINS = [
  'https://chat.openai.com', 'https://chatgpt.com',
  'https://claude.ai', 'https://gemini.google.com',
  // ... (match manifest host_permissions)
];
const parsed = new URL(imgUrl);
if (!ALLOWED_IMAGE_ORIGINS.some(o => parsed.origin === new URL(o).origin)) {
  sendResponse({ error: 'URL not in allow-list' });
  return;
}
```

---

### P3.2 — ZIP import has no per-entry decompression cap (zip bomb)

**File:** `src/lib/io/import-parser.js` — `_prepareImport()` / `validateZipFile()`
**Code:** All entries are decompressed concurrently with `Promise.all(entryPromises)`. The file-level cap is 500 MB (on the compressed archive), but individual entries are not capped individually before in-memory decompression.

**Risk:** A crafted archive (zip bomb) with many small-looking entries that each decompress to hundreds of MB could exhaust the extension's memory budget.

**Fix:** Add a per-entry decompression size limit:
```js
// In _prepareImport, inside the zip.forEach callback:
const MAX_ENTRY_BYTES = 50 * 1024 * 1024; // 50 MB per entry
entryPromises.push(
  zipEntry.async('string').then((content) => {
    if (content.length > MAX_ENTRY_BYTES) {
      throw new Error(`Entry "${relativePath}" exceeds the 50 MB size limit.`);
    }
    return { path: relativePath, content, _entry: zipEntry };
  })
);
```
Also consider adding a total-decompressed-bytes counter across all simultaneous entries.

---

### P3.3 — DEBUG log level leaks partial chat content to the DevTools console

**File:** `src/lib/utils/logger.js`
**Risk:** At the DEBUG log level, the logger prints substrings of chat messages (200–500 chars) to the browser console. On a shared workstation, any user who opens DevTools can read these extracts. The risk is operational (privacy leakage) rather than an attack surface.

**Fix:** Document that `LOG_LEVEL=DEBUG` must not be used in production builds. Consider stripping `logger.debug(...)` calls at build time (e.g., via a Vite `define` + dead-code elimination or a custom plugin) so DEBUG output is zero-cost and zero-leakage in distributed builds.

---

## P4 — Track; act only if reported

### P4.1 — `ai-injector.js` uses `innerHTML` for text injection fallback

**File:** `src/content/ai-injector.js` — layer-4 text injection fallback
**Code:** `el.innerHTML = html` where `html` is content built from user-selected clipboard text being pasted back into an AI chat input box.
**Risk:** The content originates from user clipboard input (not remote storage) and targets a tab the user is actively using. This is the lowest-risk innerHTML usage in the codebase. Not actionable unless a workflow is added that loads external content into the clipboard buffer.

### P4.2 — Logger log level persisted in `localStorage`

**Risk:** `localStorage` is shared across profiles on some browsers. If multiple browser profiles share a data directory on a single machine, DEBUG log level set in one profile would apply in another. Very low real-world risk; document as a known limitation.

---

## Existing Security Strengths

The following practices are already in place and should be preserved:

- **`message-validator.js`** validates `sender.id === extensionId` in the sidepanel `onMessage` handler.
- **No `externally_connectable`** declared — web pages cannot send runtime messages to the extension.
- **`rel="noopener noreferrer"`** applied to all external links throughout the codebase.
- **`escapeHtml()`** consistently applied at all user-visible text injection points.
- **Artifact iframes** sandboxed without `allow-same-origin` — scripts run in null origin, can't access extension storage.
- **`md-to-html.js`** export renderer uses `SAFE_HREF` scheme check for markdown links.
- **`DialogManager._sanitiseHtml()`** strips `<script>` tags and `on*` event handlers via DOMParser (partial coverage; see P2.2).
- **Content scripts** run in `ISOLATED` world (only `audio-interceptor.js` is in `MAIN` world for legitimate XHR interception).
- **ZIP import** validates file type and total compressed size (500 MB cap).
- **No third-party analytics, telemetry, or remote code execution** of any kind.
- **No `eval()`, `new Function()`, or `setTimeout(string)`** anywhere in the codebase.

---

## Fix Roadmap Summary

| ID   | Issue                                          | File(s)                        | Effort |
|------|------------------------------------------------|--------------------------------|--------|
| P1.1 | SVG innerHTML in diagram card                  | `diagram-card.js`              | S      |
| P1.2 | `javascript:` links in reader markdown         | `reader.js` (`applyInline`)    | XS     |
| P1.3 | Background `onMessage` sender validation       | `background.js`                | XS     |
| P2.1 | SVG srcdoc without script stripping            | `artifact-preview.js`, `artifact-screenshot.js` | S |
| P2.2 | Incomplete HTML sanitizer in dialogs           | `dialog-manager.js`            | M      |
| P2.3 | Sticky note `javascript:` links _(auto-fixed by P1.2)_ | `sticky-notes-ui.js` | 0     |
| P3.1 | FETCH_IMAGE URL allow-list                     | `background.js`                | S      |
| P3.2 | ZIP per-entry decompression cap                | `import-parser.js`             | XS     |
| P3.3 | DEBUG log level strips at build time           | `logger.js` + `vite.config.js` | S      |
| P4.1 | `ai-injector.js` innerHTML fallback            | `ai-injector.js`               | —      |
| P4.2 | Logger level in `localStorage`                 | `logger.js`                    | —      |

_Effort key: XS = <1 h, S = 1–2 h, M = 2–4 h, — = track only_
