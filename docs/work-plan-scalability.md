# bAInder — Scalability Work Plan

**Date:** 2026-03-15  
**Status:** Pre-release baseline  

This document lists scalability issues identified before the initial public release, sorted by priority.  Priority labels follow the pattern used in existing work plans:

- **P1** — Will impact typical users within months of launch; address before or immediately after public release.
- **P2** — Meaningful performance degradation for power users (500+ chats); address in first few minor releases.
- **P3** — Future-proofing; needed before the user base grows significantly.
- **P4** — Theoretical / edge-case; track but act only when reported.

---

## Summary: Is anything release-blocking?

**No hard blockers** for a typical user who saves dozens to ~200 chats, which is the realistic launch cohort.  The monolithic `chats` write (P1.1) becomes practically visible around 200+ image-heavy chats, and the search cold-read (P1.2) around the same threshold.  Ship with these documented; prioritise P1 items in the first sprint after launch.

---

## P1 — Address before or immediately after public release ✅ DONE

### P1.1 — Monolithic `chats` key: full-array read-modify-write on every mutation ✅ DONE

**File:** `src/sidepanel/services/chat-repository.js` — `updateChat()`, `addChat()`, `removeChat()`  
**File:** `src/background/stale-check.js`

Every single-chat mutation (rating change, tag edit, move, delete, stale flag) reads the entire `chats` array from storage, modifies one element, and writes the entire array back.  The array includes every chat's full `content` string — potentially megabytes of Markdown with embedded base64 images.  At ~200 image-heavy chats this roundtrip cost becomes visible; at ~1 000 it can cause perceptible UI freezes and occasional write failures.

**Current state:** `MAX_CHATS_IN_MEMORY = 5 000` limits the in-memory list but does **not** limit the storage read/write size.  The full on-disk array is always read and written regardless of the cap.

**Mitigation options (pick one or combine):**

1. **Per-chat storage key** — store each chat as `chat:<id>` with an index key (`chatIndex`) holding only `{id, topicId, title, timestamp, tags, …}`.  Reads/writes affect one key instead of the whole array.  Breaking change to storage format — requires a migration.
2. **IndexedDB adapter** — the `IStorageService` interface and `StorageService.getInstance('indexeddb')` stub already exist.  Implement `IndexedDBAdapter` so each chat is a row; queries and mutations are per-row.  Most impactful long-term fix.
3. **Patch-only writes** — use `chrome.storage.local.get` + atomic `set` for the single affected key; this is what option 1 achieves at the storage level.

**Recommended:** start with option 1 (per-chat key) as an incremental step; option 2 in a later release.

---

### P1.2 — Search triggers a full storage read (with content) on every debounced keystroke ✅ DONE

**File:** `src/sidepanel/controllers/search-controller.js` — `runSearch()`  
**File:** `src/lib/storage.js` — `ChromeStorageAdapter.searchChats()`

`runSearch` calls `_state.storage.searchChats(query)` **without** passing in the metadata-only `state.chats` array.  The storage adapter therefore falls back to reading the full `chats` array from disk (including all base64 `content`) on every search.  The intent is to search within chat content (not just titles), but the mechanism scales poorly: search latency grows linearly with total stored data.

**Impact:** 250 ms debounce reduces call frequency but a single cold read of a 50 MB `chats` array is still slow.

**Mitigation options:**

1. **Separate content-search index** — on every save, append a lightweight entry `{id, searchableText}` to a separate `chatSearchIndex` key (or per-chat key).  `searchChats` reads the index instead of full chats; full content is only fetched for result display.
2. **IndexedDB full-text** — store content in IndexedDB and use a lightweight inverted index or SQLite-like scan.
3. **Short-term workaround** — strip images from the searchable text at index build time (regex drop `data:[^)]+` tokens) so the payload is text-only; still a full read but faster to scan.

---

## P2 — Address in first few minor releases ✅ DONE

### P2.1 — Virtual-scroll topic row renders O(n × m) chat-count filter ✅ DONE

**File:** `src/lib/renderer/virtual-scroll.js` — `renderVirtualRow()` line `ctx.chats.filter(c => c.topicId === item.id)`

For each row rendered during a scroll event, the renderer filters the entire `ctx.chats` array to find chats belonging to that topic.  With 5 000 chats in memory and 20 rows redrawn per scroll event, this executes 100 000 array iterations per scroll tick.

**Fix:** build a `Map<topicId, chat[]>` (or `Map<topicId, chatCount>`) once when `state.chats` changes and pass it into the virtual-scroll context.  `renderVirtualRow` can then do a constant-time `chatCountByTopic.get(item.id) ?? 0` lookup.  Estimated effort: ~1 hour.

---

### P2.2 — Topic chat list renders all items at once (no virtual scroll for the chat list) ✅ DONE

**File:** `src/lib/renderer/tree-renderer.js` — topic-selected chat item rendering

When a topic is selected, all chat items for that topic are rendered as individual DOM nodes.  A topic with 500 chats creates 500+ full DOM elements simultaneously, which stresses layout and slows scroll.

**Fix:** apply the same virtual-scroll pattern used for the topic tree to the per-topic chat list.  Use `IntersectionObserver` or a fixed-height row approach.  Threshold around 100 chats per topic.

---

### P2.3 — Entity tree virtual scroll is a placeholder (not implemented) ✅ DONE

**File:** `src/lib/renderer/entity-tree.js` — `_renderVirtualPlaceholder()`

The entity-tree renderer detects when `totalCount > 150` and calls `_renderVirtualPlaceholder`, but the method comment reads *"Virtual scroll not yet implemented — render a simple list until Phase A+"*.  A user with many saved artifacts (e.g. >150 code artifacts across chats) will get a non-virtual DOM list that blocks the main thread during render.

**Fix:** implement `startVirtualScroll` / `renderVirtualRow` for the entity tree analogously to the topic tree (Stage 10 pattern).

---

### P2.4 — Multi-chat export loads all selected chats into memory simultaneously ✅ DONE

**File:** `src/sidepanel/features/multi-select.js` — `loadFullByIds()`

Exporting a large topic calls `loadFullByIds(selectedIds)` which reads and holds the full content of every selected chat in the extension heap before building the ZIP.  A topic with 100 image-heavy chats (e.g. 10 MB each) could allocate ~1 GB — likely crashing the service worker.

**Fix:** stream chats into the ZIP one at a time (read → write → discard) using a streaming ZIP library, or impose a per-export cap with a user warning.

---

## P3 — Future-proofing

### P3.1 — IndexedDB adapter not implemented

**File:** `src/lib/storage.js` — `StorageService.getInstance('indexeddb')` throws

The `IStorageService` interface, the factory, and the documentation all anticipate an IndexedDB adapter.  `chrome.storage.local` is limited to synchronous-ish JSON serialisation of the entire key in one shot; IndexedDB supports proper transactional per-record I/O.  Implementing this adapter resolves P1.1 and P1.2 at their root and is the intended long-term fix per the existing `docs/chat-images-decisions.md`.

**Effort:** high (requires storage migration, adapter code, rigorous testing).  Plan for a 1.x minor release.

---

### P3.2 — Stale-check reads + rewrites the full chats array even when nothing changed

**File:** `src/background/stale-check.js`

`checkStaleChats` always reads the whole `chats` array.  It only writes if `flaggedCount > 0`, which is good.  But the read cost remains, and it runs on every extension startup and daily alarm.  With a large array this stall is invisible to users (background SW) but consumes memory and slows startup.

**Fix:** store a lightweight `reviewDateIndex` (`{chatId, reviewDate}[]`) as a separate key; `checkStaleChats` reads only that index.

---

### P3.3 — Perplexity in `host_permissions` but not in content scripts or README

**File:** `manifest.json`

`https://www.perplexity.ai/*` and `https://perplexity.ai/*` appear in `host_permissions` but Perplexity is not listed as a supported platform in the README and has no extractor in `src/content/extractors/`.  This inflates the declared permission surface reviewed by Chrome Web Store.

**Fix:** either remove the Perplexity host permissions until an extractor is implemented, or add Perplexity to the README under an *"experimental / coming soon"* label with a matching extractor.

---

### P3.4 — Base64 image data URIs inflate the `chats` array unboundedly

**File:** `src/content/extractors/claude.js`, `src/content/extractors/copilot.js`, `src/lib/entities/artifact-screenshot.js`

Images are persisted as inline `data:` URIs inside `chat.content` (Claude) or inside artifact entity fields (`screenshotDataUri`).  A single image-heavy chat can be 2–5 MB; a chat with a Claude vision conversation can easily reach 20 MB.  These are stored inside the monolithic `chats` array, compounding P1.1.

This was explicitly diagnosed in `docs/chat-images-decisions.md` (Option D: IndexedDB image store with token references) and deferred.  Until IndexedDB is available:

- **Short-term:** cap image capture at a configurable `MAX_IMAGE_BYTES` per chat (e.g. 500 KB) with a user-visible warning when truncated.
- **Long-term:** implement the `binder:img:{id}` token scheme documented in `chat-images-decisions.md`.

---

## P4 — Track, act only when reported

### P4.1 — Non-atomic `storage.set` for the chats array

Chrome's `storage.local.set` is not transactional.  A browser crash mid-write can corrupt the `chats` array (truncated JSON).  There is no recovery path today.  This is rare in practice but devastating when it occurs.

**Mitigation:** periodic backup (already partially implemented via the backup-reminder feature) plus a "repaired from last backup" recovery flow.

---

### P4.2 — Topic tree serialisation grows with depth and breadth

**File:** `src/lib/storage.js` — `TOPIC_TREE` key

The entire topic tree is serialised to a single JSON key.  For extreme power users (1 000+ topics, deep nesting), this could reach several MB.  Far less likely to be a practical problem than the `chats` array, but worth monitoring.

---

## Existing mitigations already in place

These are positive design decisions that already limit the damage from the issues above:

| Mitigation | Where |
|---|---|
| `content` field stripped from in-memory `state.chats` (`toMeta`) | `chat-repository.js` |
| `MAX_CHATS_IN_MEMORY = 5 000` cap on `loadAll()` | `chat-repository.js` |
| `SEARCH_RESULT_CAP = 200` | `storage.js` |
| Virtual scrolling for topic tree (threshold 150 nodes) | `virtual-scroll.js`, `tree-renderer.js` |
| `loadFullByIds` lazy-loads content only on demand (reader, export) | `chat-repository.js` |
| `unlimitedStorage` manifest permission removes the 5 MB total quota | `manifest.json` |
| Debounced search (250 ms) | `search-controller.js` |
| Schwartzian-transform ranking (O(n) instead of O(n log n × k)) | `storage.js` |
| `IStorageService` interface isolates storage from UI code | `storage.js` |
