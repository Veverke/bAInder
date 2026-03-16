# Chat Images — Problem Analysis & Decisions

**Date:** 2026-03-11  
**Status:** Implemented (A + B + E); IndexedDB deferred  

---

## Problem Statement

Saved chats that contained images (AI-generated or user-uploaded) were silently losing those images — the persisted chat record contained no trace of them.

---

## Root Cause Analysis

Two distinct failure modes were identified:

### Failure Mode 1 — `blob:` URL drops (ChatGPT, Gemini, Copilot user uploads)

In `src/content/extractors/html-to-markdown.js` (and its inline copy in `content.js`), the `<img>` handler intentionally drops blob URLs:

```js
if (!src || src.startsWith('blob:')) return '';  // silently dropped
```

Blob URLs are browser-session-scoped — they become unreachable after the tab closes — so saving them raw is useless. However, no fallback was attempted: the image simply vanished with no record it ever existed.

Affected: ChatGPT DALL-E outputs, ChatGPT user-attached images, Gemini images, Copilot user uploads.

### Failure Mode 2 — Claude API image blocks filtered out

In `src/content/extractors/claude.js` (and its inline copy in `content.js`), the Claude API response was filtered to text-only:

```js
content = msg.content.filter(b => b.type === 'text').map(b => b.text).join('\n\n');
```

Claude's internal API returns `{ type: 'image', source: { type: 'base64', media_type, data } }` blocks — the base64 image data was already available and being silently discarded.

### M365 / Microsoft Designer (pre-existing working pipeline)

The **only** platform that already worked was M365 Copilot's Designer iframe:  
`postMessage` → `captureVisibleTab()` → crop → `data:` URL → stored in `__bAInderDesignerImages` → picked up by `htmlToMarkdown`. This documented the viable pattern for other platforms.

---

## Options Considered

| Option | Description | Effort | Coverage |
|--------|-------------|--------|----------|
| **A** | Claude: convert API image blocks to `data:` inline markdown | Low | Claude only |
| **B** | DOM extractors: async pre-processing — fetch `blob:` → `data:` before markdown conversion | Medium | ChatGPT, Gemini, Copilot |
| **C** | Generalise the M365 screenshot/crop pipeline to all platforms | High | All, but fragile timing |
| **D** | IndexedDB image store; reference images by ID in markdown | Very high | All; cleanest long-term |
| **E** | Placeholder text when image cannot be captured | Trivial | Partial (fallback only) |

---

## Decisions

### Implemented: A + B + E

**Option A — Claude base64 blocks** ✅  
The Claude API already provides base64 image data. Handle `type: 'image'` content blocks and emit `![Image](data:{media_type};base64,{data})` markdown.  
Files changed: `src/content/extractors/claude.js`, inline copy in `src/content/content.js`.

**Option B — Async blob→data resolution** ✅  
New utility `src/content/extractors/image-resolver.js` provides `resolveImageBlobs(el)`:
- Clones the DOM element (never mutates the live page)
- `fetch()`es each `img[src^="blob:"]` from within the content-script context (same renderer, so blob URLs are accessible)
- Converts successful fetches to `data:` URLs via `FileReader.readAsDataURL`
- Marks failed fetches with `data-binder-img-lost` attribute (feeds into Option E)
- Returns the resolved clone for `htmlToMarkdown()` to consume synchronously

DOM-based extractors (ChatGPT, Gemini, Copilot) were made `async` to call `resolveImageBlobs` per turn element. Both the module files in `src/content/extractors/` and the inlined copy in `src/content/content.js` were updated consistently.  
Files changed: `src/content/extractors/image-resolver.js` (new), `chatgpt.js`, `gemini.js`, `copilot.js`, `chat-extractor.js`, `content.js`.

**Option E — Placeholder fallback** ✅  
Rather than silently dropping images that fail blob resolution (or any `blob:` URL that reaches `htmlToMarkdown` via a synchronous code path), a human-readable placeholder is emitted:  
`[🖼️ Image not captured: {alt}]`  
This allows users to know an image existed even when it could not be persisted.  
Files changed: `src/content/extractors/html-to-markdown.js`, inline copy in `src/content/content.js`.

### Deferred: Option C (screenshot generalisation)

Ruled out for now — scroll-into-view + `captureVisibleTab` + crop is already complex for the one-iframe Designer case; generalising it to arbitrary `<img>` elements across all platforms introduces fragile timing, scrolling, and visibility assumptions.

### Deferred: Option D (IndexedDB image store)

This is the **right long-term architecture** but requires:

1. Implementing the IndexedDB adapter that is currently stubbed with `throw new Error('IndexedDB adapter not yet implemented')` in `src/lib/storage.js` (~line 349–351).
2. Assigning stable image IDs and embedding `binder:img:{id}` tokens in the markdown content field instead of raw `data:` URLs.
3. Updating the reader (`src/reader/reader.js`) to resolve these tokens at render time.
4. Updating the export engine (`src/lib/export/`) to resolve tokens to `data:` URLs or package images as separate files (e.g. a ZIP with an `images/` folder).
5. Updating the import parser (`src/lib/io/import-parser.js`) to re-ingest image attachments.
6. Handling orphan cleanup (images whose parent chat is deleted).

**Migration path when ready:**  
- Keep the `data:` inline approach (A + B) as a compatibility fallback for chats saved before the IndexedDB store exists.  
- On first load after the IndexedDB migration, optionally scan existing `chats` storage and extract `data:` URLs inline → move them to IndexedDB, rewriting the token in the content string.

---

## Storage Impact (current A+B approach)

Storing images inline as `data:` URLs in `chrome.storage.local` works because the `unlimitedStorage` permission is declared in `manifest.json`. Quota is reported as `null` (unlimited). However, base64 encoding adds ~33% overhead vs binary, and a single ChatGPT DALL-E image can add 150–600 KB to storage. This is acceptable for moderate usage but motivates the eventual IndexedDB move.

---

## Files Changed (Implementation Summary)

| File | Change |
|------|--------|
| `src/content/extractors/image-resolver.js` | **New** — async `resolveImageBlobs(el)` utility |
| `src/content/extractors/html-to-markdown.js` | `img` handler: `data-binder-img-lost` → placeholder; `blob:` → placeholder |
| `src/content/extractors/claude.js` | Handle `type:'image'` content blocks (Option A) |
| `src/content/extractors/chatgpt.js` | Made async; calls `resolveImageBlobs` per turn |
| `src/content/extractors/gemini.js` | Made async; calls `resolveImageBlobs` per turn |
| `src/content/extractors/copilot.js` | Made async; calls `resolveImageBlobs` per turn |
| `src/content/chat-extractor.js` | `await` on now-async DOM extractors |
| `src/content/content.js` | All of the above mirrored in the self-contained inline copy |
