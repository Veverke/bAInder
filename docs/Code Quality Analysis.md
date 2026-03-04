# Code Quality Analysis — bAInder

## Test Coverage

> **Run:** `npm run test:coverage` (vitest v8, passing test files only — `reader.test.js` and `export-import-integration.test.js` excluded due to pre-existing failures)
> **Suite:** 1,319 passed / 1,380 total (61 failures in 2 files)

### Global Coverage

| Metric | % |
|--------|---|
| Statements | **72.88%** |
| Branches | **70.91%** |
| Functions | **73.54%** |
| Lines | **74.75%** |

### Coverage per Component

| Component | Stmts | Branch | Funcs | Lines | Notes |
|-----------|------:|-------:|------:|------:|-------|
| `background/chat-save-handler.js` | 100% | 93.1% | 100% | 100% | ✅ Well covered |
| `background/background.js` | — | — | — | — | ❌ No tests at all |
| `content/chat-extractor.js` | 94.4% | 82.8% | 93.0% | 96.0% | ✅ Good coverage |
| `content/content.js` | — | — | — | — | ❌ No tests (1,631-line runtime script) |
| `lib/annotations.js` | 1.5% | 0% | 0% | 1.8% | ❌ Effectively untested |
| `lib/chat-dialogs.js` | 100% | 94.5% | 100% | 100% | ✅ Excellent |
| `lib/chat-manager.js` | 100% | 100% | 100% | 100% | ✅ Excellent |
| `lib/dialog-manager.js` | 100% | 97.2% | 100% | 100% | ✅ Excellent |
| `lib/export-dialog.js` | — | — | — | — | ⚠️ Test file failing (excluded) |
| `lib/export-engine.js` | 92.8% | 76.1% | 92.6% | 95.5% | ✅ Good; branch gaps in HTML/ZIP paths |
| `lib/import-dialog.js` | — | — | — | — | ⚠️ Test file failing (excluded) |
| `lib/import-parser.js` | 93.8% | 77.6% | 100% | 96.5% | ✅ Good |
| `lib/logger.js` | — | — | — | — | ❌ No tests |
| `lib/markdown-serialiser.js` | 97.9% | 97.3% | 100% | 98.8% | ✅ Excellent |
| `lib/search-utils.js` | 57.4% | 44.2% | 50.0% | 57.4% | ⚠️ Low — filter functions uncovered |
| `lib/sticky-notes-ui.js` | 30.4% | 36.9% | 22.2% | 30.5% | ❌ Low coverage |
| `lib/sticky-notes.js` | 100% | 91.7% | 100% | 100% | ✅ Excellent |
| `lib/storage.js` | 92.0% | 64.7% | 90.5% | 96.4% | ⚠️ Branch gaps in error paths |
| `lib/style-transformer.js` | 97.9% | 88.6% | 100% | 100% | ✅ Good |
| `lib/theme-defaults.js` | — | — | — | — | ❌ No tests |
| `lib/theme-sdk.js` | — | — | — | — | ❌ No tests |
| `lib/topic-dialogs.js` | 94.6% | 93.8% | 100% | 94.3% | ✅ Good |
| `lib/tree-renderer.js` | 61.3% | 46.6% | 54.0% | 64.5% | ⚠️ Low — virtual scroll & D&D untested |
| `lib/tree.js` | 99.2% | 94.2% | 100% | 100% | ✅ Excellent |
| `lib/url-utils.js` | 100% | 100% | 100% | 100% | ✅ Excellent |
| `lib/useTheme.js` | — | — | — | — | ❌ No tests |
| `lib/vendor/browser.js` | 0% | 0% | 0% | 0% | ℹ️ Polyfill stub — intentional |
| `reader/reader.js` | 37.5% | 29.1% | 36.8% | 40.0% | ⚠️ Low — 61 test failures reduce score |
| `sidepanel/sidepanel.js` | — | — | — | — | ❌ No direct unit tests (1,631 lines) |

> **Legend:** ✅ ≥ 90% · ⚠️ 40–89% · ❌ < 40% or no tests · ℹ️ intentionally excluded

---

## 1. DRY — Duplicated Code

| # | Issue | Location | Detail |
|---|-------|----------|--------|
| 1.1 | Tag parsing logic repeated verbatim | `src/lib/chat-dialogs.js` — `showAssignChat`, `showEditTags`, `showRenameChat` | `.split(',').map(t => t.trim().toLowerCase()).filter(t => t.length > 0)` copy-pasted in all three methods |
| 1.2 | HTML-escape implemented 4 separate times | `src/lib/search-utils.js`, `src/reader/reader.js`, `src/lib/style-transformer.js`, `src/lib/dialog-manager.js`, `src/lib/export-engine.js` as `_esc()` | Five independent `&amp;`/`&lt;`/`&gt;`/`&quot;` replacement functions spread across modules |
| 1.3 | ID generation pattern repeated 4 times | `src/lib/tree.js` (Topic), `src/lib/tree.js` (ChatEntry), `src/background/chat-save-handler.js`, `src/reader/reader.js` | `Date.now() + Math.random().toString(36)` inline in each; no shared `generateId()` utility |
| 1.4 | Title truncation/ellipsis pattern repeated | `src/lib/chat-dialogs.js` — `showAssignChat` (50 chars), `showEditTags` (40), `showMoveChat` (40) | Identical `title.length > N ? title.slice(0, N-3) + '...' : title` on every dialog |
| 1.5 | `browser.storage.local.get(['chats'])` called directly, bypassing `StorageService`, with the same get-check-mutate-set pattern | `src/sidepanel/sidepanel.js` — `loadChats`, `getChatContent`, `handleChatSaved` | Three separate reads of the full chats array with duplicate boilerplate around each |

---

## 2. Modularity — Poor Code Composition

| # | Issue | Location | Detail |
|---|-------|----------|--------|
| 2.1 | 1,631-line god-module | `src/sidepanel/sidepanel.js` | Mixes: app initialisation, DOM event binding, state management, business logic, storage I/O, animation, UI rendering, and backup/save-banner features — all in a single flat script |
| 2.2 | Four platform extractors in one file | `src/content/chat-extractor.js` (791 lines) | ChatGPT, Claude, Gemini, and Copilot extraction logic all inlined; Copilot's special code-block parser is a self-contained IIFE nested inside `htmlToMarkdown()` |
| 2.3 | Export concerns bundled into one monolith | `src/lib/export-engine.js` (832 lines) | Markdown export, HTML export (including 60-line embedded CSS string), ZIP payload builder, metadata builder, README generator, and download trigger are all one file |
| 2.4 | `tree-renderer.js` exceeds scope | `src/lib/tree-renderer.js` (982 lines) | Combines rendering, sort logic, virtual scrolling, drag-and-drop event handling, search highlighting, and expand/collapse state — these are separable concerns |

---

## 3. Single Responsibility — Doing Too Much

| # | Issue | Location | Detail |
|---|-------|----------|--------|
| 3.1 | `searchChats` retrieves **and** ranks | `src/lib/storage.js` | Fetches chats from storage, concatenates searchable text, applies relevance ranking, and sorts results — three responsibilities in one method |
| 3.2 | `TopicTree` is a multi-purpose object | `src/lib/tree.js` | Responsible for: data storage, hierarchy traversal, automatic sorting, date-range tracking, duplicate-name checking, serialisation, and deserialisation |
| 3.3 | `form()` conflates HTML templating + validation + Promise lifecycle | `src/lib/dialog-manager.js` | Generates field HTML, wires DOM events, validates required fields, manages error state, and resolves the Promise — all in one method |
| 3.4 | `handleChatSaved()` is an 8-step orchestrator | `src/sidepanel/sidepanel.js` | Performs: in-memory update, dialog prompt, chat assignment, title/tag mutation, full storage read for chats, storage write, tree save, UI re-render, expand, pop-animation, and rail refresh |
| 3.5 | `buildExportHtml()` owns its own CSS stylesheet | `src/lib/export-engine.js` | A 60+ line CSS string lives inside a business logic function; styling is a separate concern and makes the function hard to test/adjust |

---

## 4. Testability — Code That Is Hard to Test

| # | Issue | Location | Detail |
|---|-------|----------|--------|
| 4.1 | Module-level `state` and `elements` globals — no DI | `src/sidepanel/sidepanel.js` | Every function closes over `state` and `elements` directly; none accept them as parameters, so unit testing requires full DOM setup and global mutation |
| 4.2 | `loadChats`, `getChatContent`, `handleChatSaved` bypass storage abstraction | `src/sidepanel/sidepanel.js` | Call `browser.storage.local.get` directly rather than through `StorageService`, so they cannot be tested with the mock-friendly adapter |
| 4.3 | Non-deterministic ID generation | `src/lib/tree.js`, `src/background/chat-save-handler.js` | `Date.now() + Math.random()` is un-seedable; tests cannot assert specific IDs and rapid calls risk collisions |
| 4.4 | `triggerDownload()` has uncontrollable side effects | `src/lib/export-engine.js` | Creates DOM elements, appends to `document.body`, calls `URL.createObjectURL` — impossible to test without a full browser or heavy mocking |
| 4.5 | `updateRecentRail()` tests layout via `scrollWidth`/`clientWidth` | `src/sidepanel/sidepanel.js` | Overflow detection uses live DOM measurement — these are always 0 in jsdom/Vitest, making the overflow-trim logic untestable |

---

## 5. Complexity — Unnecessarily High

| # | Issue | Location | Complexity |
|---|-------|----------|------------|
| 5.1 | `searchChats()` builds full-text search manually | `src/lib/storage.js` | O(n) search pass on a full storage read; the `.sort()` comparator calls `.includes()` and `.some()` per comparison — O(n log n) with O(k) inner work per pair |
| 5.2 | `htmlToMarkdown()` is a recursive switch with a nested platform-specific IIFE | `src/content/chat-extractor.js` | Walks the full DOM tree recursively; the Copilot code-block special case is an IIFE defined inline inside the main `walk()` function, adding cognitive depth |
| 5.3 | `handleChatSaved()` chains sequential awaits where some could be parallel | `src/sidepanel/sidepanel.js` | Full chats read → storage write → `saveTree()` → `updateStorageUsage()` all run serially; the read and the tree-save are independent |
| 5.4 | `_sortTopics()` repeats the `pinFirst` guard in every `case` | `src/lib/tree-renderer.js` | The pin-first comparator is re-executed redundantly in each branch instead of being applied once as a pre-sort or comparator chain |
| 5.5 | `StorageUsageTracker.getStatistics()` calls `getFormattedUsage()` which calls `getStorageUsage()` — double storage read | `src/lib/storage.js` | `getStatistics` calls `this.storage.getStorageUsage()` directly **and** calls `getFormattedUsage()` which calls it again — two full storage reads for one stats object |

---

## 6. Scalability — Will Not Scale Well

| # | Issue | Location | Detail |
|---|-------|----------|--------|
| 6.1 | `searchChats()` loads all chats into memory for every query | `src/lib/storage.js` | A user with 1,000+ chats will load tens of MB on every keystroke; there is no index, pagination, or early-exit mechanism |
| 6.2 | `getStorageUsage()` does two full storage reads (tree + chats) on every call | `src/lib/storage.js` | Called on every save and UI refresh; at scale each call is O(data-size) with no caching |
| 6.3 | Full chat metadata held in memory as `state.chats` | `src/sidepanel/sidepanel.js` | Every `loadChats` plus every mutation re-maps the full array; grows without bound as saves accumulate |
| 6.4 | `Topic.chatIds.includes()` is O(n) per assignment | `src/lib/chat-manager.js` | For topics with many chats, the duplicate check before `push` scans the whole array; a `Set` would be O(1) |
| 6.5 | `StorageService` singleton is never invalidated | `src/lib/storage.js` | The singleton holds no cache, but if a second tab modifies storage, the in-memory state in the side panel is stale with no sync mechanism |

---

## 7. Security — Not Following Standard Practices

| # | Issue | Location | Detail |
|---|-------|----------|--------|
| 7.1 | `DialogManager.show()` accepts raw HTML with no sanitisation | `src/lib/dialog-manager.js` | Callers construct HTML strings and pass them directly; if any string contains unsanitised user data (e.g. a chat title with `<img onerror=...>`), it runs as XSS in the extension origin |
| 7.2 | `browser.runtime.onMessage` listener does not validate message shape or sender | `src/sidepanel/sidepanel.js` | Incoming messages from content scripts are dispatched by `type` without checking `sender.id` or schema-validating the payload; a malicious page could post a crafted `CHAT_SAVED` message |
| 7.3 | Predictable IDs used to key all data | `src/lib/tree.js` | `topic_<timestamp>_<short-random>` and `chat_<timestamp>_<short-random>` are enumerable; if extension storage is ever exposed or synced, IDs can be predicted by any co-running extension |
| 7.4 | `_mdToHtml()` in export-engine passes HTML through unescaped in some paths | `src/lib/export-engine.js` | The fallback path for chats without a `messages` array uses `_mdToHtml(body)` where `body` is extracted from raw stored content — if the stored content contained HTML it would render in the exported document |
| 7.5 | Storage writes in `handleChatSaved` bypass the service layer | `src/sidepanel/sidepanel.js` | Direct `browser.storage.local.set({ chats: ... })` calls skip any future sanitisation or quota-check logic that might be added to `StorageService`, and they set data without size checks |

---

## Summary by Severity

| Priority | Category | Count | Highest-Impact Items |
|----------|----------|-------|----------------------|
| 🔴 High | Security | 5 | Raw HTML in `show()`, unvalidated runtime messages |
| 🔴 High | Single Responsibility | 5 | `sidepanel.js` god-object, `handleChatSaved` orchestrator |
| 🟠 Medium | Modularity | 4 | `sidepanel.js` 1,631 lines, platform extractors bundled |
| 🟠 Medium | Testability | 5 | Closed-over globals, no DI pattern throughout sidepanel |
| 🟠 Medium | Scalability | 5 | Full chat load on every search, unbounded memory |
| 🟡 Low | DRY | 5 | 4× `escapeHtml`, 4× ID generation, 3× tag parsing |
| 🟡 Low | Complexity | 5 | `searchChats` O(n × comparator), double storage read |
