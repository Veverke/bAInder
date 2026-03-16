# Work Plan — Audio Entity: Option C (Reliable Capture)

**Scope:** ChatGPT and Gemini only for this iteration.  
**Goal:** Achieve a capture success rate high enough to ship — audio entities visible in the Reader with a working `<audio>` player whenever the AI generates audio, without requiring the user to click a download button before saving.

---

## Decision context

Three options were considered before choosing this path:

| Option | Description | Verdict |
|---|---|---|
| **A — Strip audio** | Remove `audio-interceptor.js` from the manifest, delete related code in `content.js` / `reader.js` / `reader.css`. Zero user-visible regression since audio never reliably worked. Eliminates the MAIN-world script that attracts CWS reviewer scrutiny. | Viable for v1.0 if Option C is too risky |
| **B — Better error messages** | Keep everything, improve the "not captured" placeholder so it doesn't look like a bug. | Insufficient — users would still see broken cards |
| **C — Fix the race condition** | Make the capture proactive and reliable so audio actually works. | **Chosen — implemented now** |

**Why Option C is the right fix:**  
The fundamental design flaw is that `Patch 2` (`HTMLAnchorElement.prototype.click`) only fires when the *user* clicks the download chip. By then, the signed URL may already be in flight — and if the user saves the chat 10+ minutes later, the URL has expired and cannot be fetched. The MutationObserver (Patch 5) was added to fix this by proactively fetching CDN links as soon as they appear in the DOM, but it has the gaps listed below. Closing those gaps is what makes Option C viable.

**CWS reviewer note:**  
The `audio-interceptor.js` content script runs in the `MAIN` world at `document_start`, which patches native browser APIs (`URL.createObjectURL`, `HTMLAnchorElement.prototype.click`, `window.fetch`, `XMLHttpRequest`, `HTMLMediaElement.src`). CWS reviewers will scrutinise this. The justification is: all patches are purely observational (they call through to the original implementation), are scoped to audio content only, and serve the legitimate purpose of capturing ephemeral audio URLs before they expire. **Prepare a clear, written justification before submitting to CWS.**

---

## Current state (as of v1.0)

The pipeline is architecturally complete. What already exists:

| Component | Location | Status |
|---|---|---|
| `URL.createObjectURL` patch | `audio-interceptor.js` Patch 1 | ✅ Working for Gemini blob audio |
| `HTMLAnchorElement.click` patch | `audio-interceptor.js` Patch 2 | ⚠️ Requires user to click chip first |
| `window.fetch` interceptor | `audio-interceptor.js` Patch 3 | ✅ Catches same-origin audio fetches |
| `XMLHttpRequest` interceptor | `audio-interceptor.js` Patch 4 | ✅ Fallback for XHR-based fetches |
| `HTMLMediaElement.src` setter | `audio-interceptor.js` Patch 6 | ✅ Catches programmatic src assignment |
| MutationObserver DOM sweep | `audio-interceptor.js` Patch 5 | ⚠️ In place but has gaps (see below) |
| `collectAudioFromPage` | `content.js` | ⚠️ Single sweep, appended to last turn only |
| Reader audio card rendering | `reader.js` + `reader.css` | ✅ Handles all states |

### Root cause (one sentence)

The signed URLs ChatGPT uses for generated audio files are time-limited (typically minutes). The original Patch 2 only fires when the user *clicks* the download chip — but the user may save the chat much later, by which point the URL has expired and the fetch fails silently. The MutationObserver (Patch 5) was designed to fix this by fetching immediately on DOM insertion, but it has coverage gaps that leave many cases uncaptured.

### Known failure modes to fix

1. **ChatGPT — per-turn association is wrong.** `collectAudioFromPage()` runs once after all turns are extracted and appends audio to the *last* assistant message. If a multi-turn chat has audio in turn 3 and none in turn 7, the audio ends up in turn 7.

2. **ChatGPT — MutationObserver misses chips in closed shadow roots.** ChatGPT renders file-download chips inside React component shells that may not be directly in the document body — the `_scanAddedNode` only recurses through `querySelectorAll` which doesn't pierce open shadow roots, and misses closed ones entirely.

3. **ChatGPT — `_tryCaptureCDNHref` uses `AUDIO_CDN_RE` test** which is `files.oaiusercontent.com | storage.googleapis.com | …`. ChatGPT signed URLs always match `files.oaiusercontent.com` — this is fine. But `rsct=audio` hint detection (`AUDIO_URL_HINT_RE`) must match before a no-`download`-attr anchor is captured. Verify the regex covers current ChatGPT URL shape.

4. **Gemini — blob: URLs sometimes written after `DOMContentLoaded`** when the inline audio player is lazy-rendered. The `URL.createObjectURL` patch (Patch 1) is in place but the MutationObserver needs to also sweep `<audio src="blob:">` that appears after the player renders.

5. **CORS validation gap.** `_tryCaptureCDNHref` fetches from the MAIN world using `_origFetch` with `credentials: 'include'`. This relies on Azure Blob Storage / GCS signed URLs allowing the ChatGPT/Gemini origin. This needs a real-browser smoke test to confirm it works — the current code logs to console but there is no test instrumentation to verify the fetch succeeded vs fell back to HTTPS URL.

6. **Debug `console.log` statements** are in production paths (Patches 3, 4, 5). These must be gated or removed before shipping.

7. **Reader — no download button for captured audio.** When a `data:` URI is captured, the Reader shows a native `<audio controls>` player but there is no way to save the audio file. A download icon next to the player would complete the UX.

8. **No test coverage** for the capture pipeline end-to-end. The entity-controller and entity-extractor tests verify rendering but not capture.

9. **The 10 MB cap silently drops large files** — `_tryCaptureCDNHref` and `_captureAudioSrc` both bail at 10 MB with no user-visible feedback in all code paths. The Reader does emit a "file too large to capture" placeholder for the `collectAudioFromPage` path, but the interceptor-level bail is silent. Consistent placeholder emission is needed.

10. **Patch 2 (`HTMLAnchorElement.click`) is now redundant** if Patches 3/5 are working correctly — the fetch interceptor (Patch 3) will already capture the audio data when ChatGPT's own code fetches the file to serve it. Keep Patch 2 as a belt-and-suspenders fallback but do not rely on it as the primary path.

---

## Milestones

### M1 — Fix per-turn audio association (ChatGPT + Gemini)

**Problem:** Single `collectAudioFromPage()` sweep at end of extraction, result appended to last assistant turn.

**Fix:** Restructure `extractChatGPT` and `extractGemini` to associate audio with the turn that produced it.

**Implementation sketch:**

For ChatGPT, each `<article data-testid="conversation-turn-*">` is a turn. After extracting text for each turn, scan *that turn's DOM subtree* for CDN audio anchors and `<audio>` elements, and run `collectAudioFromPage` scoped to that turn element instead of the full document.

This requires:
- [ ] Add a `root` parameter to `collectShadowAudio(root, maxShadowDepth)` — already accepts a root, but `collectAudioFromPage(doc)` always passes `doc.documentElement`. Refactor to accept any element.
- [ ] Add a `collectAudioFromElement(el)` variant (or make `collectAudioFromPage` accept either Document or Element) that skips the meta-cache pass (keep meta-cache as a separate merge step) and only scans the given element's subtree.
- [ ] In `extractChatGPT`: after building `content` for each assistant turn, call `collectAudioFromElement(turn)` and append any audio markers to *that turn's content* before pushing to `messages`.
- [ ] In `extractGemini`: same — call `collectAudioFromElement(el)` for each model-response element.
- [ ] After all turns are extracted, do **one** residual `collectAudioFromPage(doc)` meta-cache read and distribute any unclaimed audio markers to the last assistant turn (catches audio captured by Patch 3/4 before the MutationObserver ran).
- [ ] Remove the existing post-loop audio sweep from both extractors and replace with the above.

**Tests:**
- [ ] Unit test: `collectAudioFromElement` with a mock turn element containing an audio `<a>` chip — returns correct marker.
- [ ] Unit test: audio in turn 3 is not appended to turn 7.

---

### M2 — Strengthen MutationObserver for ChatGPT shadow chips

**Problem:** `_scanAddedNode` recurses via `querySelectorAll` which doesn't pierce open shadow roots on subtrees added after the observer fires.

**Fix in `audio-interceptor.js`:**

- [ ] Add a recursive shadow-root walker inside `_scanAddedNode`. When `node.shadowRoot` exists (open shadow), walk it as well.
  ```js
  // After existing querySelectorAll sweeps:
  if (node.shadowRoot) _scanAddedNode(node.shadowRoot);
  for (const child of node.children) {
    if (child.shadowRoot) _scanAddedNode(child.shadowRoot);
  }
  ```
  Keep the recursion depth-bounded (max 5 levels) to avoid performance issues.

- [ ] Add MutationObserver on each discovered open shadow root so that chip elements added asynchronously *inside* a shadow root are also observed:
  ```js
  function _observeShadowRoot(sr) {
    if (sr.__bAInderObserved) return;
    sr.__bAInderObserved = true;
    _domObserver.observe(sr, { childList: true, subtree: true, attributeFilter: ['src', 'href'] });
    _scanAddedNode(sr); // initial sweep
  }
  ```
  Call `_observeShadowRoot(node.shadowRoot)` whenever a shadow-root-hosting element is encountered.

**Tests:**
- [ ] Unit test (jsdom): MutationObserver fires for an `<a download href="...files.oaiusercontent.com/...rsct=audio...">` added inside a shadow root after page load.

---

### M3 — Validate and harden CORS fetch path (ChatGPT)

**Problem:** `_tryCaptureCDNHref` fetches `files.oaiusercontent.com` from the MAIN world. Success is logged but never surfaced to tests or telemetry.

- [ ] **Smoke test in-browser:** Add a temporary `data-bainder-capture-status` attribute to the meta element set by `_writeMeta`: value `"pending"` → `"data"` (resolved) or `"url"` (only HTTPS fallback). Read this from `content.js` at save time to distinguish a truly captured audio from a URL fallback.
- [ ] Gate on result: if status is still `"pending"` at collect time (fetch in-flight), add a short `await sleep(500)` retry before falling back.
- [ ] If fetch returns a non-audio content-type, clean up the meta element immediately (avoid false markers).
- [ ] If the CORS fetch consistently fails (status `"url"` fallback): route the fetch through the background service worker (`FETCH_IMAGE_AS_DATA_URL`) instead — the background has `host_permissions` and bypasses CORS.

**Tests:**
- [ ] Unit test: `_captureAudioSrc` with an HTTPS URL that returns `data:audio/wav`: resolves to data URI.
- [ ] Unit test: `_captureAudioSrc` with an HTTPS URL that returns non-audio content-type: resolves to `null`.
- [ ] Unit test: expired/404 HTTPS URL falls back gracefully (no crash, placeholder marker emitted).

---

### M4 — Gemini: lazy-rendered blob audio players

**Problem:** Gemini's audio player may render after `DOMContentLoaded`, meaning `URL.createObjectURL` fires when the page's AudioContext creates a blob, but the `<audio>` element itself is added to the shadow DOM of a custom element — potentially a closed shadow root.

- [ ] Verify whether Gemini audio custom elements use open or closed shadow roots (requires manual inspection in DevTools).
- [ ] If **open**: the shadow root walk added in M2 handles this.
- [ ] If **closed**: the `HTMLMediaElement.src` setter (Patch 6) is the fallback. Verify it fires correctly by checking: does Gemini set `audio.src = blobUrl` directly, or does it use `audio.srcObject`?
  - If `srcObject` is used, add a `srcObject` setter patch mirroring the `src` setter (Patch 6b):
    ```js
    const _origSrcObjectDesc = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'srcObject');
    if (_origSrcObjectDesc?.set) {
      Object.defineProperty(HTMLMediaElement.prototype, 'srcObject', {
        get() { return _origSrcObjectDesc.get.call(this); },
        set(value) {
          if (this instanceof HTMLAudioElement && value instanceof MediaStream) {
            // MediaStream source — cannot be captured as data: URI; emit placeholder.
            // Only flag if stream has audio tracks.
            if (value.getAudioTracks().length > 0) {
              _writeMeta('mediastream:' + Date.now(), '', 'audio/stream');
            }
          }
          return _origSrcObjectDesc.set.call(this, value);
        },
        configurable: true,
      });
    }
    ```
  - If `srcObject` is a `MediaStream`, the audio is real-time (TTS synthesis streaming) and can't be captured as a data URI. Emit a `[🔊 Generated audio (live stream – not capturable)]` placeholder.

- [ ] **Determine what Gemini actually does** by logging in the browser console during a Gemini TTS response before implementing the above.

**Investigation task (do first):**
- [ ] Open `gemini.google.com`, start a conversation with TTS, open DevTools console, and observe which of the bAInder interceptor logs fire: `URL.createObjectURL`, `audio.src setter`, or nothing. Document findings here before writing code.

---

### M5 — Reader: add download button for captured audio

**Location:** `src/reader/reader.js` (audio card rendering block ~line 279) and `src/reader/reader.css`.

- [ ] When `src` is a `data:` URI, add a download `<a>` alongside the `<audio controls>` player:
  ```js
  const ext = mime.split('/')[1]?.replace('mpeg', 'mp3') || 'audio';
  const dlHtml = `<a class="audio-card__download" href="${srcEsc}" download="generated-audio.${ext}" title="Download audio">⬇</a>`;
  ```
- [ ] Add `.audio-card__download` CSS: a small icon button aligned right, matching the existing card's design language.
- [ ] The download link should **not** appear when `src` is an HTTPS URL (session-limited) or missing.

**Tests:**
- [ ] Unit test: audio card with `data:audio/wav;base64,...` src renders a download anchor.
- [ ] Unit test: audio card with `https://` src does NOT render a download anchor.

---

### M6 — Remove debug console.log, add gated logger

**Location:** `audio-interceptor.js` — Patches 3, 4, 5 all have bare `console.log` calls.

- [ ] Replace all `console.log('[bAInder main] ...')` calls with a conditional logger:
  ```js
  const _dbg = false; // flip to true during development
  function _log(...args) { if (_dbg) console.log(...args); }
  ```
- [ ] Or: check for a `window.__bAInderDebug` flag that the content script can set during testing.
- [ ] Ensure `console.log` is not called at all in the release build (verify by inspecting the compiled output in `dist/`).

---

### M7 — Integration smoke-test checklist

Before marking audio as shippable, run this checklist manually in a real browser with the packed extension:

#### ChatGPT
- [ ] Start a new chat, ask: *"Generate a short audio file containing a 440 Hz tone"* and wait for the code-interpreter to produce a `.wav` download chip.
- [ ] **Without clicking the download chip**, immediately hit Save in bAInder.
- [ ] Open the saved chat in the Reader — expect a working `<audio controls>` player.
- [ ] Repeat but wait 10 minutes between chip appearance and Save — expect either a working player or a clear "session expired" message (not a broken player).
- [ ] Multi-turn: generate audio in two separate turns, save — expect audio appended to the correct turns.

#### Gemini
- [ ] Start a Gemini chat with audio output (e.g. using Gemini's voice response feature or asking it to read something aloud).
- [ ] Save without interacting with the player.
- [ ] Open the Reader — expect a working player or an informative placeholder.
- [ ] Observe DevTools console for `[bAInder main]` logs to confirm which patch fired.

---

## Implementation order

| Priority | Milestone | Effort |
|---|---|---|
| 1 | **M6** — Remove debug logs | Small |
| 2 | **M1** — Per-turn association | Medium |
| 3 | **M4** — Gemini investigation | Investigation only |
| 4 | **M2** — Shadow root observer | Small-Medium |
| 5 | **M3** — CORS validation + status attribute | Medium |
| 6 | **M5** — Reader download button | Small |
| 7 | **M7** — Manual smoke test | Manual |

Start with M6 (no risk) and M4 investigation in parallel, since M4 findings determine whether M2's shadow walk is sufficient or whether a `srcObject` patch is also needed.

---

## Out of scope for this iteration

- Claude audio (Claude does not produce generated audio files via code-interpreter)
- Copilot audio (not investigated yet)
- Streaming / real-time audio capture (MediaStream cannot be serialised to a `data:` URI)
- Audio from user-uploaded files (user already has the file locally)
- Files > 10 MB (current limit is intentional; revisit if users report false truncation)

---

## Rollback plan

If the CORS validation (M3) reveals that ChatGPT CDN fetches consistently fail from the MAIN world and routing through the background service worker also fails (e.g. because signed URLs are single-use or tied to the original page origin), **fall back to Option A**:  
1. Remove the `content_scripts` entry for `audio-interceptor.js` from `manifest.json`  
2. Remove `collectAudioFromPage` and related helpers from `content.js`  
3. Remove the audio card rendering block from `reader.js` and `reader.css`  
4. Remove host_permissions that were only needed for audio CDN fetching (verify each against remaining image-capture needs first)

This is reversible — the code can be re-introduced when the capture reliability problem is solved.
