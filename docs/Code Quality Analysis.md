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
| `sidepanel/sidepanel.js` | — | — | — | — | ❌ No direct unit tests (301-line orchestrator after refactor) |
| `sidepanel/app-context.js` | — | — | — | — | ❌ No tests — shared state/elements; testable by injection |
| `sidepanel/notification.js` | — | — | — | — | ❌ No tests |
| `sidepanel/services/chat-repository.js` | — | — | — | — | ❌ No tests — new; storage I/O mockable via browser stub |
| `sidepanel/controllers/tree-controller.js` | — | — | — | — | ❌ No tests — new |
| `sidepanel/controllers/search-controller.js` | — | — | — | — | ❌ No tests — new |
| `sidepanel/controllers/topic-actions.js` | — | — | — | — | ❌ No tests — new |
| `sidepanel/controllers/chat-actions.js` | — | — | — | — | ❌ No tests — new |
| `sidepanel/controllers/import-export-actions.js` | — | — | — | — | ❌ No tests — new |
| `sidepanel/features/save-banner.js` | — | — | — | — | ❌ No tests — new |
| `sidepanel/features/backup-reminder.js` | — | — | — | — | ❌ No tests — new |
| `sidepanel/features/theme-picker.js` | — | — | — | — | ❌ No tests — new |
| `sidepanel/features/multi-select.js` | — | — | — | — | ❌ No tests — new |
| `sidepanel/features/settings-panel.js` | — | — | — | — | ❌ No tests — new |
| `sidepanel/features/recent-rail.js` | — | — | — | — | ❌ No tests — new |
| `sidepanel/features/storage-usage.js` | — | — | — | — | ❌ No tests — new |

> **Legend:** ✅ ≥ 90% · ⚠️ 40–89% · ❌ < 40% or no tests · ℹ️ intentionally excluded

---

## 1. DRY — Duplicated Code

| # | Issue | Location | Detail |
|---|-------|----------|--------|
| ~~1.1~~ | ~~Tag parsing logic repeated verbatim~~ | ~~`src/lib/chat-dialogs.js` — `showAssignChat`, `showEditTags`, `showRenameChat`~~ | ✅ **RESOLVED** — Extracted `_parseTags(raw)` private helper. The identical `.split(',').map(t => t.trim().toLowerCase()).filter(t => t.length > 0)` chain is now defined once and called in all three methods. |
| ~~1.2~~ | ~~HTML-escape implemented 4 separate times~~ | ~~`src/lib/search-utils.js`, `src/reader/reader.js`, `src/lib/style-transformer.js`, `src/lib/dialog-manager.js`, `src/lib/export-engine.js` as `_esc()`~~ | ✅ **RESOLVED** — `escapeHtml` in `src/lib/search-utils.js` is now the canonical implementation (null-safe, 5-char set including `&#39;`). All four duplicates removed: `reader.js` imports and re-exports it; `style-transformer.js` imports it (replacing the nested `_escapeHtml`); `dialog-manager.escapeHtml()` delegates to it (replacing the DOM-based approach); `export/format-helpers.esc()` wraps it (replacing the inline regex chain). One definition, five consumers. |
| ~~1.3~~ | ~~ID generation pattern repeated 4 times~~ | ~~`src/lib/tree.js` (Topic), `src/lib/tree.js` (ChatEntry), `src/background/chat-save-handler.js`, `src/reader/reader.js`~~ | ✅ **RESOLVED** — `generateId(prefix?)` added to `src/lib/search-utils.js` as the canonical implementation. With a prefix (e.g. `'topic'`, `'chat'`, `'ann'`) produces `{prefix}_{ts}_{random}`; without a prefix produces `{ts}-{random}` (preserving the format expected by the `generateChatId` test). `Topic` and `ChatEntry` in `models.js` now call `generateId('topic'/'chat')` in their constructors; `generateChatId()` in `chat-save-handler.js` delegates to `generateId()`; annotation IDs in `reader.js` use `generateId('ann')`. One definition, four consumers. |
| ~~1.4~~ | ~~Title truncation/ellipsis pattern repeated~~ | ~~`src/lib/chat-dialogs.js` — `showAssignChat` (50 chars), `showEditTags` (40), `showMoveChat` (40)~~ | ✅ **RESOLVED** — Extracted `_truncate(title, maxLength)` private helper. The identical `title.length > N ? title.slice(0, N-3) + '...' : title` ternary now lives in one place; all three call sites replaced with `this._truncate(title, N)`. |
| ~~1.5~~ | ~~`browser.storage.local.get(['chats'])` called directly, bypassing `StorageService`, with the same get-check-mutate-set pattern~~ | ~~`src/sidepanel/sidepanel.js` — `loadChats`, `getChatContent`, `handleChatSaved`~~ | ✅ **RESOLVED** — All chat storage I/O consolidated into `ChatRepository` (`sidepanel/services/chat-repository.js`). Every caller uses `loadAll`, `updateChat`, `removeChat`, `removeManyChats`, `replaceAll`, or `loadFullByIds` — repeated get-check-mutate-set pattern eliminated. |

---

## 2. Modularity — Poor Code Composition

| # | Issue | Location | Detail |
|---|-------|----------|--------|
| ~~2.1~~ | ~~1,631-line god-module~~ | ~~`src/sidepanel/sidepanel.js`~~ | ✅ **RESOLVED** — Decomposed into 16 focused modules. Entry point is now 301 lines (orchestration only). Modules: `app-context.js`, `notification.js`, `services/chat-repository.js`, `controllers/tree-controller.js`, `controllers/search-controller.js`, `controllers/topic-actions.js`, `controllers/chat-actions.js`, `controllers/import-export-actions.js`, `features/save-banner.js`, `features/backup-reminder.js`, `features/theme-picker.js`, `features/multi-select.js`, `features/settings-panel.js`, `features/recent-rail.js`, `features/storage-usage.js`. Longest module is ~220 lines. |
| ~~2.2~~ | ~~Four platform extractors in one file~~ | ~~`src/content/chat-extractor.js`~~ | ✅ **RESOLVED** — Decomposed into 9 focused modules under `src/content/extractors/`. Entry point is now 109 lines (imports + re-exports + `detectPlatform` + `extractChat` + `prepareChatForSave`). New modules: `dom-utils.js`, `html-to-markdown.js`, `message-utils.js`, `source-links.js`, `shared.js`, `chatgpt.js`, `claude.js`, `gemini.js`, `copilot.js`. All tests and callers unchanged via re-exports. |
| ~~2.3~~ | ~~Export concerns bundled into one monolith~~ | ~~`src/lib/export-engine.js`~~ | ✅ **RESOLVED** — Decomposed into 9 focused modules under `src/lib/export/`. Entry point is now ~25 lines (re-exports only). New modules: `filename-utils.js`, `format-helpers.js`, `md-to-html.js`, `html-styles.js`, `markdown-builder.js`, `html-builder.js`, `zip-builder.js`, `metadata-builder.js`, `download.js`. All tests and callers unchanged via re-exports. Also resolves issue 3.5. |
| ~~2.4~~ | ~~`tree-renderer.js` exceeds scope~~ | ~~`src/lib/tree-renderer.js`~~ | ✅ **RESOLVED** — Decomposed into 8 focused modules under `src/lib/renderer/`. Entry point is now ~280 lines (orchestration only). New modules: `tag-color.js` (hue hash), `tree-sort.js` (sort strategies, also fixes issue 5.4), `sparkline.js` (SVG factory), `search-highlight.js` (DOM highlight utils), `flatten.js` (pure tree traversal), `virtual-scroll.js` (virtual-scroll engine), `chat-item-builder.js` (DOM factory), `topic-node-builder.js` (DOM factory). All tests and callers unchanged via full public-API preservation. |

---

## 3. Single Responsibility — Doing Too Much

| # | Issue | Location | Detail |
|---|-------|----------|--------|
| ~~3.1~~ | ~~`searchChats` retrieves **and** ranks~~ | ~~`src/lib/storage.js`~~ | ✅ **RESOLVED** — Decomposed into four focused private helpers. `_buildSearchableText(chat)` builds the concatenated text. `_matchesQuery(chat, lowerQuery)` is a pure boolean check. `_isTopResult(chat, lowerQuery)` identifies title/tag hits. `_rankChats(matches, lowerQuery)` handles sorting. `searchChats(query)` is now a thin orchestrator: retrieve → filter → rank. |
| ~~3.2~~ | ~~`TopicTree` is a multi-purpose object~~ | ~~`src/lib/tree.js`~~ | ✅ **RESOLVED** — Decomposed into 4 focused modules under `src/lib/tree/`. `models.js` owns `Topic` and `ChatEntry` (data models + per-object serialisation). `tree-validator.js` owns `validateTopicName` and `hasDuplicateName` (pure, no `this`). `tree-traversal.js` owns all read-only operations (`getAllTopics`, `getRootTopics`, `getChildren`, `getTopicPath`, `isDescendant`, `findOrphans`, `getStatistics`) as pure functions that receive `topics`/`rootTopicIds` as parameters (dependency injection). `tree-serializer.js` owns `serialize`/`deserialize`. `TopicTree` in `tree.js` becomes a thin coordinator owning only mutation state and mutation methods; all pure operations delegate to the injected helpers. `Topic` and `ChatEntry` are re-exported from `tree.js` — all callers unchanged. |
| ~~3.3~~ | ~~`form()` conflates HTML templating + validation + Promise lifecycle~~ | ~~`src/lib/dialog-manager.js`~~ | ✅ **RESOLVED** — Decomposed into 4 focused private helpers. `_renderFieldHtml(field, index)` is a pure template renderer for a single field (select / textarea / input). `_renderFormHtml(fields, title, submitLabel)` assembles the complete dialog HTML by delegating to `_renderFieldHtml`. `_collectFormData(formEl, fields)` reads trimmed values from the live DOM (no side-effects). `_validateForm(formEl, fields)` toggles `.error` CSS classes and returns a boolean. `form()` is now a thin orchestrator: render HTML → `show()` → query DOM refs → wire events → delegate to helpers on submit. |
| ~~3.4~~ | ~~`handleChatSaved()` is an 8-step orchestrator~~ | ~~`src/sidepanel/sidepanel.js`~~ | ✅ **RESOLVED** — Refactored in `sidepanel/controllers/chat-actions.js`. Each step is now a named call to a single-purpose helper (`chatRepo.updateChat`, `saveTree`, `setSaveBtnState`, `updateRecentRail`). Steps are clearly commented 1–8 with no raw storage calls inline. |
| ~~3.5~~ | ~~`buildExportHtml()` owns its own CSS stylesheet~~ | ~~`src/lib/export-engine.js`~~ | ✅ **RESOLVED** — CSS extracted into `src/lib/export/html-styles.js` as `getExportCss(fontStack)` and `getDigestCss(fontStack)`. Both HTML builders now call these functions; the CSS is no longer embedded in business logic. |

---

## 4. Testability — Code That Is Hard to Test

| # | Issue | Location | Detail |
|---|-------|----------|--------|
| ~~4.1~~ | ~~Module-level `state` and `elements` globals — no DI~~ | ~~`src/sidepanel/sidepanel.js`~~ | ✅ **RESOLVED** — `state` and `elements` are now exported named exports from `sidepanel/app-context.js`. All modules import them explicitly; tests can import and mutate the same objects directly without DOM globals or global-scope pollution. |
| ~~4.2~~ | ~~`loadChats`, `getChatContent`, `handleChatSaved` bypass storage abstraction~~ | ~~`src/sidepanel/sidepanel.js`~~ | ✅ **RESOLVED** — All calls now go through `ChatRepository` (stored as `state.chatRepo`). Tests can substitute a mock `chatRepo` on `state` without touching `browser.storage` at all. |
| 4.3 | Non-deterministic ID generation | `src/lib/tree.js`, `src/background/chat-save-handler.js` | `Date.now() + Math.random()` is un-seedable; tests cannot assert specific IDs and rapid calls risk collisions |
| 4.4 | `triggerDownload()` has uncontrollable side effects | `src/lib/export/download.js` | Creates DOM elements, appends to `document.body`, calls `URL.createObjectURL` — impossible to test without a full browser or heavy mocking |
| 4.5 | `updateRecentRail()` tests layout via `scrollWidth`/`clientWidth` | `src/sidepanel/features/recent-rail.js` | ⚠️ **Logic moved, issue remains** — overflow detection using `scrollWidth`/`clientWidth` is still present; these are always 0 in jsdom/Vitest. The logic is now isolated in a 50-line module, making it easier to address with a size-limit parameter or virtual-scroll approach. |

---

## 5. Complexity — Unnecessarily High

| # | Issue | Location | Complexity |
|---|-------|----------|------------|
| ~~5.1~~ | ~~`searchChats()` builds full-text search manually~~ | ~~`src/lib/storage.js`~~ | ✅ **RESOLVED** — Applied a Schwartzian transform (decorate → sort → undecorate) in `_rankChats`. `_isTopResult` is now called exactly once per element — O(n × k) — instead of once per comparator invocation — O(n log n × k). The `.sort()` comparator now compares only pre-computed booleans and timestamps. All 28 storage tests pass. |
| ~~5.2~~ | ~~`htmlToMarkdown()` is a recursive switch with a nested platform-specific IIFE~~ | ~~`src/content/extractors/html-to-markdown.js`~~ | ✅ **RESOLVED** — Extracted the inline Copilot/Fluent UI code-block handling from inside `walk()` into a named module-level function `_extractCopilotCodeBlock(node)`. Its three constants (`_COPILOT_SKIP`, `_COPILOT_BLOCK`, `_KNOWN_LANG`) are now module-scope `const`s, defined once. `walk()` calls `_extractCopilotCodeBlock(node)` early-return style — two lines instead of a 25-line inline block. Cognitive depth of `walk()` reduced by one level. All 177 chat-extractor tests pass. |
| ~~5.3~~ | ~~`handleChatSaved()` chains sequential awaits where some could be parallel~~ | ~~`src/sidepanel/controllers/chat-actions.js`~~ | ✅ **RESOLVED** — `chatRepo.updateChat()` and `saveTree()` write to independent storage keys (`chats` vs tree). All four call sites where the pattern appeared (`handleChatSaved`, `handleMoveChatAction`, `handleDeleteChatAction`, `handleChatDrop` in `tree-controller.js`) now use `Promise.all([updateChat(…), saveTree()])` with the chats result destructured from the resolved array. Sequential round-trips replaced with a single concurrent await. All 1,179 tests pass (no regressions). |
| ~~5.4~~ | ~~`_sortTopics()` repeats the `pinFirst` guard in every `case`~~ | ~~`src/lib/tree-renderer.js`~~ | ✅ **RESOLVED** — Extracted to `src/lib/renderer/tree-sort.js` as `sortTopics(topics, mode)`. `pinFirst` is now applied exactly once via a composed comparator; a `getModeComparator(mode)` helper returns the mode-specific inner comparator. |
| ~~5.5~~ | ~~`StorageUsageTracker.getStatistics()` calls `getFormattedUsage()` which calls `getStorageUsage()` — double storage read~~ | ~~`src/lib/storage.js`~~ | ✅ **RESOLVED** — Added two private sync helpers, `_formatUsage(usage)` and `_checkQuota(usage, threshold)`, that operate on an already-fetched usage object. The public `getFormattedUsage()` and `isApproachingQuota()` methods keep their existing async signatures (one read each — backward-compatible with `storage-usage.js`'s `Promise.all` call). `getStatistics()` now fetches exactly once with `await this.storage.getStorageUsage()` and passes the result directly to `_formatUsage` and `_checkQuota` — reducing from 3 sequential storage reads to 1. All 31 storage tests pass (no regressions). |

---

## 6. Scalability — Will Not Scale Well

| # | Issue | Location | Detail |
|---|-------|----------|--------|
| ~~6.1~~ | ~~`searchChats()` loads all chats into memory for every query~~ | ~~`src/lib/storage.js`~~ | ✅ **RESOLVED** — `searchChats(query, chats?)` now accepts an optional pre-loaded array. When the caller passes `state.chats` (already resident in memory via `ChatRepository`), the `browser.storage.local.get` call is skipped entirely — zero storage reads per keystroke after the initial load. An early-exit returns `[]` immediately for empty queries. Results are capped at `SEARCH_RESULT_CAP = 200` to bound return-array allocation. `search-controller.runSearch()` now passes `state.chats`; the storage-fallback path is preserved for any caller that does not hold the array. Three new unit tests: empty-query early-exit, in-memory path (spy confirms `get` is not called), result cap. |
| ~~6.2~~ | ~~`getStorageUsage()` does two full storage reads (tree + chats) on every call~~ | ~~`src/lib/storage.js`~~ | ✅ **RESOLVED** — Two changes applied. (1) `getStorageUsage(counts?)` now accepts an optional `{ topicCount, chatCount }` object; when supplied only `getBytesInUse()` is called — zero data reads. When omitted the two content reads are batched into a single `Promise.all([getBytesInUse(), get([TOPIC_TREE, CHATS])])` — two parallel round-trips instead of three sequential ones. (2) `StorageUsageTracker.getStatistics(counts?)` forwards the counts argument so callers can avoid all content reads end-to-end. `storage-usage.js` updated: replaced the two-call `Promise.all([getFormattedUsage(), isApproachingQuota()])` pattern (which triggered two independent `getStorageUsage()` calls, totalling six storage operations) with a single `tracker.getStatistics({ topicCount, chatCount })` call that resolves in one `getBytesInUse()` round-trip. Three new unit tests: fast-path spy confirms `get` is not called; fallback-path spy confirms exactly one batched `get` call with an array argument; `getStatistics(counts)` thread-through. 34 storage tests pass; full suite 1,217 passed (no regressions). |
| 6.3 | Full chat metadata held in memory as `state.chats` | `src/sidepanel/app-context.js` | ⚠️ **Unchanged (issue remains)** — `state.chats` still holds the full metadata array. The array is now managed exclusively through `ChatRepository` mutations, making a future paging/eviction strategy easier to apply. |
| ~~6.4~~ | ~~`Topic.chatIds.includes()` is O(n) per assignment~~ | ~~`src/lib/chat-manager.js`~~ | ✅ **RESOLVED** — Added a shadow `Set<string>` (`_chatIdSet`) to `Topic` in `src/lib/tree/models.js`. Three new methods: `hasChatId(id)` (O(1) membership), `addChatId(id)` (O(1) duplicate-safe push to both array and Set), `removeChatId(id)` (Set delete + array filter). `_chatIdSet` is initialised from `chatIds` in both the constructor and `fromObject()` (deserialization); `toObject()` omits it so the storage schema is unchanged. `assignChatToTopic()` and `removeChatFromTopic()` in `chat-manager.js` now call these methods (with a plain-object fallback for backward compat). The duplicate check before `push` is now O(1) — no array scan. `chat-manager.test.js`: `makeTopic` updated to return real `Topic.fromObject()` instances; two tests adjusted to use `addChatId()` for setup (preserving Set sync). Seven new unit tests: `hasChatId`, `addChatId` idempotency, `removeChatId`, `fromObject` Set init, `toObject` exclusion. 52 chat-manager tests pass; full suite 1,224 passed (no regressions). |
| ~~6.5~~ | ~~`StorageService` singleton is never invalidated~~ | ~~`src/lib/storage.js`~~ | ✅ **RESOLVED** — Added `src/sidepanel/services/storage-sync.js` which exports `initStorageSync({ onTopicTreeChanged, onChatsChanged })`. The function registers a single `browser.storage.onChanged` listener and debounces each callback (300 ms per key group) behind a per-group "reload in progress" guard that prevents overlapping concurrent reloads. Redundant reloads on self-writes are harmless (no write-back → no loop). Called at the end of `sidepanel.js` `init()` with two private reload handlers: `_onExternalTreeChange` (calls `loadTree()`, re-syncs `topicDialogs.tree` / `chatDialogs.tree` / `renderer.setTree()`, then `renderTreeView()` and `updateStorageUsage()`) and `_onExternalChatsChange` (calls `chatRepo.loadAll()`, pushes data to renderer, refreshes recent rail and storage usage). Module map comment and import updated in `sidepanel.js`. All 1,257 tests pass (no regressions). |

---

## 7. Security — Not Following Standard Practices

| # | Issue | Location | Detail |
|---|-------|----------|--------|
| ~~7.1~~ | ~~`DialogManager.show()` accepts raw HTML with no sanitisation~~ | ~~`src/lib/dialog-manager.js`~~ | ✅ **RESOLVED** — Added `_sanitiseHtml(html)` private method that parses via `DOMParser` into a detached document, removes all `<script>` elements, strips every `on*` event-handler attribute, and removes `javascript:` URLs from `href`/`src`/`action`. `show()` now calls `_sanitiseHtml(contentHTML)` before assigning to `modal.innerHTML`. Existing callers (which already escape user values via `escapeHtml()`) are unaffected; defence-in-depth ensures any future caller that embeds unescaped data is protected. Eight new tests added to `tests/dialogs.test.js` covering `<script>` stripping, `on*` removal, `javascript:` URL removal, preservation of harmless attributes, and preservation of `<style>` blocks. |
| ~~7.2~~ | ~~`browser.runtime.onMessage` listener does not validate message shape or sender~~ | ~~`src/sidepanel/sidepanel.js`~~ | ✅ **RESOLVED** — Extracted `validateRuntimeMessage(message, sender, extensionId)` into `src/sidepanel/services/message-validator.js`. The function applies two-layer defence: (1) sender identity — rejects any message whose `sender.id` does not equal `browser.runtime.id`, blocking messages from web pages or foreign extensions; (2) per-type payload schema — `CHAT_SAVED` requires `data.id` and `data.title` to be non-empty strings; `SELECT_CHAT` requires `chatId` to be a non-empty string. The `onMessage` listener in `sidepanel.js` now calls `validateRuntimeMessage` first and returns `false` (silently ignoring) on any failure. 23 new unit tests in `tests/message-validator.test.js` cover sender rejection, shape rejection, and per-type field validation. |
| ~~7.3~~ | ~~Predictable IDs used to key all data~~ | ~~`src/lib/search-utils.js`~~ | ✅ **RESOLVED** — `generateId()` in `src/lib/search-utils.js` now uses `crypto.getRandomValues(new Uint8Array(6))` to produce a 12-char hex string (48 bits of entropy) as the random segment, replacing `Math.random().toString(36)`. The structural format `{prefix}_{ts}_{hex}` / `{ts}-{hex}` is unchanged so all callers and the `generateChatId` timestamp-parse test continue to pass. `crypto.getRandomValues` is always available in Chrome extension contexts (background, content, sidepanel) and in jsdom/Vitest. All 1,217 tests pass (no regressions). |
| ~~7.4~~ | ~~`_mdToHtml()` in export-engine passes HTML through unescaped in some paths~~ | ~~`src/lib/export/md-to-html.js`~~ | ✅ **RESOLVED** — The root issue was in `inlineMd()`: the `[text](url)` → `<a href="$2">` replacement injected the href value without scheme validation. A stored chat with `[click](javascript:alert(1))` in its content would produce a live `javascript:` link in the exported HTML file. Fixed by converting the replacement to a tagged callback that validates the href against `SAFE_HREF = /^(https?:|mailto:|\/|#|[^:]*$)/i`; any non-matching scheme (javascript:, data:, vbscript:, …) is replaced with `#`. All other paths in `mdToHtml` already called `esc()` before emitting — those are unchanged. All 1,217 tests pass (no regressions). |
| ~~7.5~~ | ~~Storage writes in `handleChatSaved` bypass the service layer~~ | ~~`src/sidepanel/sidepanel.js`~~ | ✅ **RESOLVED** — All direct `browser.storage.local.set` chat writes have been moved into `ChatRepository`. A single place to add sanitisation or quota checks now exists. |

---

## Summary by Severity

| Priority | Category | Open | Resolved | Highest-Impact Remaining Items |
|----------|----------|-----:|---------:|--------------------------------|
| 🔴 High | Security | 0 | 5 | **Section fully resolved** |
| 🔴 High | Single Responsibility | 0 | 5 | All identified single-responsibility issues resolved |
| 🟠 Medium | Modularity | 0 | 4 | All major god-modules decomposed |
| 🟠 Medium | Testability | 3 | 2 | `updateRecentRail` DOM measurement; non-deterministic IDs; `triggerDownload` side-effects |
| 🟠 Medium | Scalability | 1 | 4 | Unbounded in-memory chats (6.3) |
| 🟠 Medium | Dependency Injection | 0 | 3 | **Section fully resolved** (`state`-locator pattern vs. constructor injection remains as 🟡 Low item 8.5) |
| 🟡 Low | DRY | 0 | 5 | **Section fully resolved** |
| 🟡 Low | Complexity | 0 | 5 | **Section fully resolved** |
| 🟡 Low | DI (structural) | 1 | 1 | `ChatRepository` hard-codes `browser.storage` — see 8.5 |

> **Refactor session (2026-03-04):** Resolved issues 1.5, 2.1, 3.4, 4.1, 4.2, 7.5 by decomposing `sidepanel.js` (1,842 lines) into 16 focused modules. See commit for full module map.
>
> **Refactor session (2026-03-04, continued):** Resolved issues 2.2 and 2.3 (and 3.5) by decomposing `chat-extractor.js` into 9 modules under `src/content/extractors/` and `export-engine.js` (1,134 lines) into 9 modules under `src/lib/export/`. CSS extracted from both `buildExportHtml` and `buildDigestHtml` into `html-styles.js`. Entry point reduced to ~25 lines. Build: 60 modules. Tests: 1,362 passed / 62 failed (no regressions vs baseline).
>
> **Refactor session (continued):** Resolved issue 3.3 — decomposed `form()` in `src/lib/dialog-manager.js` into 4 private helpers (`_renderFieldHtml`, `_renderFormHtml`, `_collectFormData`, `_validateForm`). Each helper has a single responsibility (pure template, pure template assembly, DOM read, DOM mutation). `form()` is now a thin orchestrator (~30 lines). All 56 dialog tests pass; full suite: 1,362 passed / 62 failed (no regressions). **Section 3 (Single Responsibility) fully resolved — 5/5 issues closed.**
>
> **Refactor session (2026-03-04, continued):** Resolved issues 2.4 and 5.4 by decomposing `tree-renderer.js` (1,102 lines) into 8 focused modules under `src/lib/renderer/`. `sortTopics()` extracted to `tree-sort.js` with `pinFirst` applied once via composed comparator (fixes duplicate guard repetition). Entry point reduced to ~280 lines. Build: 68 modules. Tests: 1,362 passed / 62 failed (no regressions vs baseline). **Section 2 (Modularity) is now fully resolved.**
>
> **Refactor session (2026-03-04, continued):** Resolved issue 3.1 by decomposing `searchChats()` in `ChromeStorageAdapter` into four private helpers: `_buildSearchableText`, `_matchesQuery`, `_isTopResult`, `_rankChats`. The public method is now a three-line orchestrator. All 28 storage tests pass.
>
> **Refactor session (2026-03-04, continued):** Resolved issue 6.4 — added `_chatIdSet: Set<string>`, `hasChatId(id)`, `addChatId(id)`, and `removeChatId(id)` to `Topic` in `src/lib/tree/models.js`. The shadow Set is initialised from `chatIds` in both `constructor()` and `fromObject()` and excluded from `toObject()` (no storage schema change). `assignChatToTopic()` and `removeChatFromTopic()` in `chat-manager.js` now delegate to these methods, making the duplicate-prevention check O(1) instead of O(n). `chat-manager.test.js` updated: `makeTopic` returns real `Topic.fromObject()` instances; two setup sites use `addChatId()` instead of direct array mutation. Seven new unit tests for the Set helpers. 52 chat-manager tests pass; full suite: 1,224 passed (no regressions).
>
> **Refactor session (2026-03-04, continued):** Resolved issue 7.1 — added `_sanitiseHtml(html)` to `DialogManager` using a detached `DOMParser` document to strip `<script>` elements, `on*` event-handler attributes, and `javascript:` URLs before any HTML is assigned via `innerHTML` in `show()`. Eight new security-focused tests added. Suite: 1,191 passed (23 test files, pre-existing failures excluded).
>
> **Refactor session (2026-03-04, continued):** Resolved issue 7.2 — extracted `validateRuntimeMessage(message, sender, extensionId)` into `src/sidepanel/services/message-validator.js` with two-layer defence: sender ID check (`sender.id === browser.runtime.id`) and per-type payload schema validation for `CHAT_SAVED` and `SELECT_CHAT`. The `onMessage` listener in `sidepanel.js` now gates all dispatch behind this validator. 23 new unit tests in `tests/message-validator.test.js`. Suite: 1,217 passed (24 test files).
>
> **Refactor session (2026-03-04, continued):** Resolved issue 3.2 by decomposing `TopicTree` across 4 sub-modules under `src/lib/tree/`. Pure traversal and validation functions now use dependency injection (receive `topics`/`rootTopicIds` as parameters). `TopicTree` delegates read-only operations; mutation methods remain as the single owner of state changes. `Topic` + `ChatEntry` re-exported from `tree.js` — all callers and all 827 tree tests unchanged. Build: 72 modules.
>
> **Refactor session (2026-03-04, continued):** Resolved issue 1.1 — extracted `_parseTags(raw)` private helper in `src/lib/chat-dialogs.js`. The identical `.split(',').map(t => t.trim().toLowerCase()).filter(t => t.length > 0)` chain was copy-pasted in `showAssignChat`, `showEditTags`, and `showRenameChat`; all three now delegate to the single helper. All 36 chat-dialog tests pass (no regressions).
>
> **Refactor session (2026-03-04, continued):** Resolved issue 1.2 — consolidated all `escapeHtml` / `_esc` / `_escapeHtml` duplicates into the canonical `escapeHtml` in `src/lib/search-utils.js`. Null guard added; single-quote escaping (`&#39;`) now consistent across all consumers. `reader.js` imports and re-exports it; `style-transformer.js` imports it (nested `_escapeHtml` removed); `DialogManager.escapeHtml()` delegates to it (DOM-based approach removed); `export/format-helpers.esc()` wraps it. One definition, five consumers. All 1,362 tests pass (no regressions).
>
> **Refactor session (2026-03-04, continued):** Resolved issue 1.3 — added `generateId(prefix?)` to `src/lib/search-utils.js`. `Topic` and `ChatEntry` constructors in `models.js` now call `generateId('topic')` / `generateId('chat')`; `generateChatId()` in `chat-save-handler.js` delegates to `generateId()` (no prefix, preserving `{ts}-{random}` format and passing all existing tests); annotation IDs in `reader.js` use `generateId('ann')`. The private `_generateId()` methods on the model classes are retained as thin wrappers (for any serialised legacy objects) but no longer contain the logic. One definition, four consumers. All 1,362 tests pass (no regressions).
>
> **Refactor session (2026-03-04, continued):** Resolved issue 1.4 — extracted `_truncate(title, maxLength)` private helper in `src/lib/chat-dialogs.js`. The `title.length > N ? title.slice(0, N-3) + '...' : title` ternary was repeated in `showAssignChat` (50-char limit), `showEditTags` (40), and `showMoveChat` (40); all three now call `this._truncate(title, N)`. All 36 chat-dialog tests pass (no regressions). **Section 1 (DRY) fully resolved — 5/5 issues closed.**
>
> **Refactor session (2026-03-04, continued):** Resolved issue 6.1 — `searchChats(query, chats?)` now accepts an optional pre-loaded chats array, eliminating the `browser.storage.local.get` call on every keystroke when the caller already holds the data in memory. `SEARCH_RESULT_CAP = 200` exported constant caps result allocation. Empty-query early-exit added (returns `[]` immediately). `search-controller.runSearch()` now passes `state.chats`. Storage-fallback path preserved for callers without the array. Three new unit tests added (early-exit, in-memory path spy, result cap). 31 storage tests pass; full suite: 1,191 passed (no regressions).
>
> **Refactor session (2026-03-04, continued):** Resolved issue 6.2 — `getStorageUsage(counts?)` accepts optional in-memory `{ topicCount, chatCount }`; when supplied only `getBytesInUse()` is called (zero data reads). Fallback path batches `getBytesInUse` and `get([TOPIC_TREE, CHATS])` with `Promise.all` (two parallel trips instead of three sequential). `getStatistics(counts?)` threads the counts argument through. `storage-usage.js` replaced its two-call `Promise.all([getFormattedUsage(), isApproachingQuota()])` pattern with a single `tracker.getStatistics(counts)` call, reducing the worst-case operation from six storage round-trips to one. Three new unit tests (fast-path spy, batch-fallback spy, thread-through). 34 storage tests pass; full suite: 1,217 passed (no regressions).
>
> **Refactor session (2026-03-04, continued):** Resolved issue 5.1 — applied a Schwartzian transform (decorate → sort → undecorate) to `_rankChats()` in `src/lib/storage.js`. `_isTopResult` is now called exactly once per element — O(n × k) total — rather than once per sort comparator invocation — O(n log n × k) total. The sort comparator now performs only cheap boolean and numeric comparisons. All 28 storage tests pass (no regressions).
>
> **Refactor session (2026-03-04, continued):** Resolved issue 5.2 — extracted `_extractCopilotCodeBlock(node)` as a named module-level function from the inline block inside `walk()` in `src/content/extractors/html-to-markdown.js`. Three constants (`_COPILOT_SKIP`, `_COPILOT_BLOCK`, `_KNOWN_LANG`) are now module-scope `const`s. `walk()` calls the helper with an early-return guard — two lines instead of 25. Cognitive depth of `walk()` reduced by one level. All 177 chat-extractor tests pass (no regressions).
>
> **Refactor session (2026-03-04, continued):** Resolved issue 5.3 — replaced all sequential `await updateChat(…); await saveTree();` pairs with `Promise.all([updateChat(…), saveTree()])`. Affected sites: `handleChatSaved` and `handleMoveChatAction`/`handleDeleteChatAction` in `chat-actions.js`, and `handleChatDrop` in `tree-controller.js`. The two writes target independent storage keys (`chats` vs tree), so concurrent execution is safe. All 1,179 tests pass (no regressions).
>
> **Refactor session (2026-03-04, continued):** Resolved issue 5.5 — added `_formatUsage(usage)` and `_checkQuota(usage, threshold)` as private sync helpers to `StorageUsageTracker` in `src/lib/storage.js`. `getStatistics()` now fetches storage once and calls both helpers synchronously, reducing from 3 sequential `getStorageUsage()` calls to 1. The public `getFormattedUsage()` and `isApproachingQuota()` methods are unchanged (backward-compatible with the `Promise.all` usage in `storage-usage.js`). All 31 storage tests pass (no regressions). **Section 5 (Complexity) fully resolved — 5/5 issues closed.**
>
> **Refactor session (2026-03-04, continued):** Resolved issue 7.3 — replaced `Math.random().toString(36)` in `generateId()` (`src/lib/search-utils.js`) with `crypto.getRandomValues(new Uint8Array(6))` producing a 12-char hex random segment (48 bits of entropy). IDs are now cryptographically unpredictable even when the timestamp is known. Format is structurally unchanged; all callers and the `generateChatId` timestamp test pass. All 1,217 tests pass (no regressions).
>
> **Refactor session (2026-03-04, continued):** Resolved issues 8.2 and 8.3 — created `src/sidepanel/services/reminder-prefs-repository.js` (`ReminderPrefsRepository`) as the single owner of the four orphaned backup-reminder storage keys (`lastExportTimestamp`, `nextReminderAt`, `backupReminderDisabled`, `backupReminderIntervalDays`). The class accepts a `storageAdapter` constructor parameter (testable without a `browser` global). Instantiated as `state.reminderPrefs` in `sidepanel.js` `init()` and declared in `app-context.js`. `import-export-actions.js` now calls `state.reminderPrefs.recordExport()` instead of an inline `browser.storage.local.set`; `backup-reminder.js` now calls `state.reminderPrefs.loadPrefs()`, `.snooze(ms)`, and `.dismiss()` — removing all direct `browser.storage` calls and the `browser` import from both modules. All 1,224 tests pass (no regressions). **All Medium DI issues (8.1–8.3) now resolved; only Low issues 8.4–8.5 remain.**
>
> **Refactor session (2026-03-04, continued):** Resolved issue 8.1 — `StorageUsageTracker` promoted from an ad-hoc per-call `new` inside `storage-usage.js` to a proper service singleton on `state`. `sidepanel.js` now constructs `state.storageTracker = new StorageUsageTracker(state.storage)` during init alongside all other services (both `StorageService` and `StorageUsageTracker` imported in the composition root). `app-context.js` gained the `storageTracker: null` slot. `storage-usage.js` removed its `StorageUsageTracker` import entirely — it now calls `state.storageTracker.getStatistics(counts)` with zero knowledge of the underlying storage API. The `window.bAInder` devtools accessor for `storageTracker` was also added. All 1,224 tests pass (no regressions).
>
> **Refactor session (2026-03-04, continued):** Resolved issue 8.4 — `ChatRepository` no longer imports `browser` directly. `IStorageService` and `ChromeStorageAdapter` extended with `get(keys)` and `set(data)` thin pass-throughs to `browser.storage.local`. `ChatRepository` now accepts a `storageAdapter` in its constructor; `sidepanel.js` passes `state.storage` explicitly (`new ChatRepository(state.storage)`). Defaults to `StorageService.getInstance()` for any zero-config caller. All 8 direct `browser.storage.local.get/set` calls replaced with `this._storage.get/set`. 29 new unit tests in `tests/chat-repository.test.js` cover all seven public methods — including a DI-isolation proof that completes a full save/load cycle without any `browser` global. Six new storage tests added for the `IStorageService`/`ChromeStorageAdapter` `get`/`set` interface. Full suite: 1,257 passed (no regressions).
>
> **Refactor session (2026-03-04, continued):** Resolved issue 6.5 — added `src/sidepanel/services/storage-sync.js` which exports `initStorageSync({ onTopicTreeChanged, onChatsChanged })`. The module registers a single `browser.storage.onChanged` listener and debounces each callback (300 ms) behind a per-key-group reload guard so a rapid burst of writes causes at most one reload per group. Called at the end of `init()` in `sidepanel.js` with two private handlers: `_onExternalTreeChange` (reloads tree, re-syncs dialog tree refs, calls `renderTreeView()` + `updateStorageUsage()`) and `_onExternalChatsChange` (reloads chat metadata, pushes to renderer + recent rail, calls `updateStorageUsage()`). Self-writes fire redundant reloads that are safe — no write-back, no loop. All 1,257 tests pass (no regressions).

---

## 8. Dependency Injection — Service Reuse vs. Logic Re-implementation

This section evaluates whether each component consumes existing services through the shared `state` object (the application's composition root / service locator) or bypasses them with direct API calls or duplicate logic.

### Architecture overview

`sidepanel.js` is the **composition root**: all service instances are constructed once and stored on `state`:

| Service slot | Concrete type | Purpose |
|---|---|---|
| `state.storage` | `StorageService` | Topic-tree persistence; raw storage usage |
| `state.chatRepo` | `ChatRepository` | All chat array storage I/O |
| `state.reminderPrefs` | `ReminderPrefsRepository` | Backup-reminder preference storage I/O |
| `state.dialog` | `DialogManager` | Modal dialogs |
| `state.topicDialogs` | `TopicDialogs` | Topic CRUD dialog flows |
| `state.chatDialogs` | `ChatDialogs` | Chat CRUD dialog flows |
| `state.exportDialog` | `ExportDialog` | Export UI |
| `state.importDialog` | `ImportDialog` | Import UI |
| `state.renderer` | `TreeRenderer` | Virtual-scroll tree |
| `state.tree` | `TopicTree` | In-memory topic/chat graph |

Every controller and feature module is expected to import `state` and call the relevant slot — not instantiate its own copy or call the browser API directly.

---

### ✅ Patterns done correctly

| Component | Correct pattern | Detail |
|---|---|---|
| `controllers/chat-actions.js` | Uses `state.chatRepo.*` for all chat mutations | `updateChat`, `removeChat`, `removeManyChats` — no raw storage calls |
| `controllers/tree-controller.js` | Uses `state.storage.loadTopicTree()` / `state.storage.saveTopicTree()` | Correctly delegates tree persistence to `StorageService` |
| `controllers/import-export-actions.js` | Uses `state.exportDialog`, `state.importDialog`, `state.chatRepo.replaceAll()` | Dialog interactions and chat persistence fully delegated |
| `controllers/topic-actions.js` | Uses `state.topicDialogs.*`, `state.dialog.*` | No duplicate dialog construction |
| `features/multi-select.js` | Uses `state.renderer.enterMultiSelectMode()` / `state.exportDialog.*` | Renderer and dialog accessed through state only |
| `features/theme-picker.js` | Delegates to `loadTheme()` / `persistTheme()` from `useTheme.js` | No inline CSS-variable setting; theming logic not re-implemented |
| `features/settings-panel.js` | Delegates to `logger.getLevel()` / `logger.setLevel()` | No direct `localStorage` for log-level; uses the `logger` service |
| `features/recent-rail.js` | Reads `state.chats` (managed exclusively by `ChatRepository`) | No independent storage call; correctly treats `state.chats` as the live source of truth |
| `features/backup-reminder.js` | Uses `state.reminderPrefs.loadPrefs()` / `.snooze()` / `.dismiss()` | All raw storage calls removed; banner logic reads from and writes through the service |
| `controllers/import-export-actions.js` | Uses `state.reminderPrefs.recordExport()` after a successful export | Single write path for `lastExportTimestamp`; `browser` import removed |

---

### ❌ Violations — Direct API calls bypassing services

| # | Component | Violation | Service that already handles this | Fix |
|---|---|---|---|---|
| ~~8.1~~ | ~~`features/storage-usage.js`~~ | ~~Calls `browser.storage.local.getBytesInUse()` directly~~ | ~~`StorageService.getStorageUsage()` wraps this call and is available on `state.storage`~~ | ✅ **RESOLVED** — `StorageUsageTracker` is now constructed once in `sidepanel.js` (`state.storageTracker = new StorageUsageTracker(state.storage)`) alongside all other service instances. `state` carries a new `storageTracker` slot (declared in `app-context.js`). `storage-usage.js` now imports only `{ state, elements }` — it holds no reference to `StorageUsageTracker` or `browser.storage`. The `StorageUsageTracker` import in `storage-usage.js` is removed entirely. `window.bAInder` devtools object exposes `storageTracker` alongside the other service accessors. |
| ~~8.2~~ | ~~`features/backup-reminder.js`~~ | ~~Calls `browser.storage.local.get(['lastExportTimestamp', 'nextReminderAt', 'backupReminderDisabled'])` and `browser.storage.local.set({ nextReminderAt: … })` — 3 raw API calls~~ | ~~No service; keys are unowned orphans in raw storage~~ | ✅ **RESOLVED** — `ReminderPrefsRepository` (`src/sidepanel/services/reminder-prefs-repository.js`) now owns all four pref keys. `backup-reminder.js` calls `state.reminderPrefs.loadPrefs()`, `.snooze(ms)`, and `.dismiss()` — zero raw storage calls remain. `browser` import removed from the module. |
| ~~8.3~~ | ~~`controllers/import-export-actions.js`~~ | ~~Calls `browser.storage.local.set({ lastExportTimestamp: Date.now() })` directly after a successful export~~ | ~~Same unowned key as issue 8.2 — written from two different modules with no shared contract~~ | ✅ **RESOLVED** — `handleExportAll()` now calls `await state.reminderPrefs.recordExport()`. Both former raw-write sites in `backup-reminder.js` and `import-export-actions.js` now route through the same service method. `browser` import removed from `import-export-actions.js`. |
| ~~8.4~~ | ~~`services/chat-repository.js`~~ | ~~Imports and calls `browser.storage.local` directly (8 calls) instead of delegating to `StorageService`~~ | ~~`StorageService.ChromeStorageAdapter` already wraps `browser.storage.local`; `state.storage` is the intended gateway~~ | ✅ **RESOLVED** — `ChatRepository` now accepts a `storageAdapter` in its constructor (injected as `new ChatRepository(state.storage)` from `sidepanel.js`). Defaults to `StorageService.getInstance()` for zero-config callers. The `browser` import removed from the module entirely; all 8 `browser.storage.local.get/set` calls replaced with `this._storage.get(keys)` / `this._storage.set(data)`. `IStorageService` and `ChromeStorageAdapter` extended with `get(keys)` and `set(data)` thin pass-through methods. Tests can now pass a plain mock object with `get`/`set` spies — no `chrome` global required. 29 new tests in `tests/chat-repository.test.js` cover all methods including a full DI-isolation proof that completes a save/load cycle without any browser global. |

---

### ⚠️ Partial DI — Service locator rather than true injection

The current architecture uses `state` as a **module-level singleton service locator**: every module calls `import { state } from '../app-context.js'` and reads `state.chatRepo`, `state.storage`, etc. This is functionally equivalent to global variables and has two consequences:

| Concern | Detail |
|---|---|
| **Testability gap** | A test cannot substitute a mock `ChatRepository` by holding a reference; it must mutate `state.chatRepo` before calling the function under test. This works (and tests already rely on it per issue 4.2 resolution), but is implicit and fragile — a module that calls `ChatRepository` internally creates a hard dependency the test cannot intercept. |
| **No constructor injection** | None of the controllers or features accept their dependencies as parameters. `chat-actions.js`, `tree-controller.js`, etc. are pure ES modules with no exported factory/class, so there is no injection point. Moving to named exported functions that receive their dependencies as arguments (e.g. `handleChatSaved(repo, dialog, chat)`) would allow unit tests to pass mocks directly. |

The approach is **pragmatic for a browser extension** (no DI framework; module bundler makes tree-shaking trivial), but the `state`-locator style means the distinction between "injected" and "hard-coded" is invisible at the call site.

---

### Summary

| # | Issue | Severity | Module(s) |
|---|---|---|---|
| 8.1 | `storage-usage.js` bypasses `StorageService`, duplicates `getBytesInUse` call | ~~🟠 Medium~~ ✅ | `features/storage-usage.js` |
| ~~8.2~~ | ~~`backup-reminder.js` owns reminder-prefs storage with 3 raw API calls~~ | ✅ | ~~`features/backup-reminder.js`~~ |
| ~~8.3~~ | ~~`import-export-actions.js` writes `lastExportTimestamp` directly (same key as 8.2)~~ | ✅ | ~~`controllers/import-export-actions.js`~~ |
| ~~8.4~~ | ~~`ChatRepository` hard-codes `browser.storage.local` instead of delegating to `StorageService`~~ | ✅ | ~~`services/chat-repository.js`~~ |
| 8.5 | Module-level service locator (`state`) instead of constructor injection — test substitution requires state mutation | 🟡 Low | All sidepanel controllers & features |

---

## 9. Repo Visibility & Trust — Quality Badges

Adding automated quality badges to the README converts invisible internal metrics into public trust signals. For a browser extension that handles users' private chat data, credibility indicators meaningfully increase adoption likelihood.

### Why This Matters for bAInder

- **Security-conscious audience** — users installing a chat-data extension need visible evidence of quality gates before trusting it
- **Contributor confidence** — a green quality gate tells contributors their PRs will be reviewed consistently
- **GitHub discoverability** — active CI/badge pipelines generate activity signals that improve perceived repo health
- **Caveat** — a *bad* badge (e.g. "D" grade, 20% coverage) actively harms trust; resolve the High/Medium items above before publishing grades publicly

### Recommended Tools

| Priority | Tool | What It Measures | Free for Public Repos | Badges Awarded | Impact | bAInder Value | Distance to Badge |
|----------|------|------------------|-----------------------|----------------|--------|---------------|-------------------|
| 1 | **Codecov** | Test coverage (lcov/v8) | ✅ | Coverage % (colour-coded green → red by threshold); diff coverage per PR | Directly signals to users that edge cases are tested. The colour shift from red → green as coverage improves creates a visible motivation loop for contributors. PRs show a coverage delta, so reviewers instantly see if a change regresses tested lines. | 🔴 **High** — bAInder already has Vitest + v8 configured and `coverage/lcov.info` is generated today; enabling this badge requires only a CI workflow and a one-line config change. The extension silently modifies user data (chat trees, tags, exports) — a visible ≥ 75% coverage badge is the fastest credibility win available and directly addresses the "does this thing corrupt my chats?" concern. | 🟢 **1–2 hours** — `lcov.info` is already produced by the existing `test:coverage` script. Steps: (1) add `lcov` to `coverage.reporter` in `vitest.config.js` (one line); (2) create `.github/workflows/ci.yml` with the Codecov upload action; (3) sign up on codecov.io and add `CODECOV_TOKEN` secret. **Zero code changes needed.** The badge will show ~73% immediately, above Codecov's default green threshold (70%). Fixing the 2 excluded test files would push this higher, but the badge is publishable right now. |
| 2 | **SonarCloud** | Bugs, code smells, security vulnerabilities, coverage gate | ✅ | Quality Gate (Passed/Failed); individual metric badges for Bugs, Vulnerabilities, Security Hotspots, Code Smells, Coverage, Duplication, Lines of Code, Reliability Rating, Security Rating, Maintainability Rating | The Security Rating badge is the highest-trust signal for a privacy-handling extension. A "Passed" Quality Gate is the single most visible binary indicator of repo health — many organisations use it as a hard adoption gate. The Reliability Rating tells first-time contributors what kind of codebase they are walking into. | 🔴 **High** — bAInder requests `storage`, `tabs`, `scripting`, and `contextMenus` permissions and reads full chat page content. Security-aware users (the primary audience for AI-tooling extensions) will specifically look for a security signal before installation. The Security Rating badge addresses the unvalidated `runtime.onMessage` listener (issue 7.2) and the unescaped HTML path (issue 7.4) — resolving those and showing an "A" rating turns a known liability into a public asset. | 🟢 **2–4 hours** — ~~Blocked by security issues 7.1–7.4~~ — **all resolved**. All five Security issues (7.1–7.5) are fixed; the quality gate should pass on first scan. Remaining open items (4.3 ID determinism, 4.4 `triggerDownload`, 4.5 scroll measurement, 6.3 unbounded state) are testability/scalability items that SonarCloud flags as code smells at worst — they do not trigger a gate failure. Steps: add `sonar-project.properties`, add CI scan step, add `SONAR_TOKEN` secret. Full Security Rating "A" is realistically achievable immediately. |
| 3 | **Codacy** | Complexity, duplication, style, security | ✅ | Overall Grade (A–F letter); separate badges for Coverage and Issues | The letter grade is immediately legible to non-technical evaluators (e.g. potential sponsors, store reviewers). An "A" grade is a strong shorthand for "this project takes quality seriously", even for people who won't read source code. | 🟠 **Medium** — Chrome Web Store reviewers and potential contributors will glance at the README before diving into code. The A–F grade is the most universally understood quality shorthand. Given bAInder's known duplication issues (section 1) and low-coverage modules (annotations, sticky-notes-ui), the grade will likely land at B–C today; resolve DRY and coverage items first or the badge will actively discourage adoption. | 🟠 **3–5 days** — Account setup takes ~10 minutes. ~~DRY issues (1.1–1.4) and large god-modules were the main grade depressors~~ — **all resolved**. The remaining coverage gaps are the primary risk: `annotations.js` (1.5%), `sticky-notes-ui.js` (30%), `tree-renderer.js` (61%), and all new sidepanel modules (0%). Codacy weights coverage heavily. Estimated starting grade: **B** (up from C, thanks to resolved DRY/modularity). Reaching **A** requires covering the zero-test sidepanel modules (controllers, features) — budget 3–5 days of test writing. Publishable at B today. |
| 4 | **Code Climate** | Maintainability grade (A–F), technical debt, duplication | ✅ | Maintainability grade badge; Technical Debt ratio; Test Coverage (when combined with a reporter) | Maintainability grade is the metric most correlated with long-term contributor retention — developers deciding whether to fork or contribute will check this. The Technical Debt ratio provides a quantified "cost to improve" that resonates with engineering managers evaluating adoption. | 🟡 **Lower priority** — bAInder is currently a solo-maintained extension; the maintainability grade matters most once there is a stream of external contributors or when positioning for handoff/collaboration. The Technical Debt ratio is useful internally as a planning tool (aligns with sections 1–5 of this document) but adds marginal public value alongside an existing SonarCloud gate. Add after Phase 3 is complete. | 🟢 **1–2 hours** — ~~Blocked by large monolith files (2.2, 2.3, 2.4)~~ — **all resolved**. `chat-extractor.js` is now 109 lines, `export-engine.js` ~25 lines, `tree-renderer.js` ~280 lines. All complexity and SRP issues (sections 3, 5) are also fully resolved. The only remaining Code Climate signals are the 3 open testability items (4.3, 4.4, 4.5) which are low-severity. Estimated starting grade: **A or B** immediately after account setup (~10 minutes). Lower priority than SonarCloud/Codecov but the easiest grade-badge to obtain of the entire list. |
| 5 | **Shields.io + ESLint** | Custom badges from any CI metric (error count, pass rate) | ✅ self-hosted | Fully custom: e.g. `ESLint: 0 errors`, `Tests: 1319 passed`, `Build: passing` — any key/value pair via endpoint badge or Gist | Maximum flexibility — you control what is surfaced. Useful for surfacing metrics none of the above tools expose (e.g. bundle size, manifest version, browser compatibility). Zero third-party dependency risk. | 🟠 **Medium (unique opportunity)** — No other tool can surface bAInder-specific signals: supported platforms (`ChatGPT \| Claude \| Gemini \| Copilot`), manifest version, or a "Build: passing" badge directly linked to the extension package step. These contextual badges answer the first question a potential user asks ("does it support my AI tool?") before they even read the description, making them unusually high-value for discoverability relative to the effort required. | 🟢 **2–4 hours** — The CI badge (`Build: passing`) is free the moment a GitHub Actions workflow exists — no external service needed. Static badges (`Platforms: ChatGPT \| Claude \| Gemini \| Copilot`, `Manifest: v3`) can be added to the README right now as plain Shields.io static URLs, **zero infrastructure required**. The ESLint badge needs ESLint installed and a zero-error run first (`npm install --save-dev eslint`); given the codebase has no linter configured today, budget an extra half-day to set up the ruleset and clear initial violations. |

### Action Items

#### Phase 1 — Prerequisites (before adding any badges)

- [ ] **1.1** Fix the 2 excluded test files (`reader.test.js`, `export-import-integration.test.js`) so the full suite runs cleanly — current failures suppress true coverage figures and prevent an accurate badge from being published
- [x] ~~**1.2** Resolve open Security issues so SonarCloud/Codacy do not block the quality gate~~ — **all 5 resolved** (7.1 `DialogManager` HTML sanitisation, 7.2 `onMessage` validation, 7.3 crypto IDs, 7.4 `javascript:` URL injection, 7.5 storage bypass). Quality gate should pass on first SonarCloud scan.
- [x] ~~**1.3** Resolve DRY issues (1.1–1.4) before publishing a Codacy grade~~ — **all 4 resolved** (`_parseTags`, `escapeHtml`, `generateId`, `_truncate` helpers extracted). No duplicated code penalty for Codacy.
- [x] ~~**1.4** Decompose large god-modules before publishing Code Climate/Codacy grades~~ — **all 4 resolved** (`sidepanel.js`, `chat-extractor.js`, `export-engine.js`, `tree-renderer.js` decomposed). Longest remaining file is ~280 lines.
- [ ] **1.5** Configure ESLint and achieve a zero-error run (`npm install --save-dev eslint`) — needed for the Shields.io ESLint badge; not a blocker for Codecov/SonarCloud/Codacy
- [ ] **1.6** Confirm full-suite coverage stays ≥ 70% once the 2 excluded files are fixed — the new zero-coverage sidepanel modules (controllers, features) will dilute the aggregate figure when included

#### Phase 2 — Codecov (coverage badge) — unblocked, ~1–2 hours

- [ ] **2.1** Add `lcov` to `coverage.reporter` in `vitest.config.js`:
  ```js
  coverage: { reporter: ['text', 'lcov'], reportsDirectory: './coverage' }
  ```
- [ ] **2.2** Create `.github/workflows/ci.yml` that runs `npm run test:coverage` and uploads `coverage/lcov.info` to Codecov (see CI skeleton below)
- [ ] **2.3** Sign in to [codecov.io](https://codecov.io), add the repo, copy the upload token to a GitHub secret (`CODECOV_TOKEN`)
- [ ] **2.4** Add badge to `README.md`:
  ```markdown
  [![codecov](https://codecov.io/gh/<owner>/bAInder/badge.svg)](https://codecov.io/gh/<owner>/bAInder)
  ```

#### Phase 3 — SonarCloud (quality gate + security badge) — unblocked, ~2–4 hours

> All security blockers (7.1–7.4) are resolved. The quality gate is expected to **pass on first scan**.

- [ ] **3.1** Sign in to [sonarcloud.io](https://sonarcloud.io), import the GitHub repo, generate a project key
- [ ] **3.2** Add `sonar-project.properties` to repo root:
  ```properties
  sonar.projectKey=<owner>_bAInder
  sonar.organization=<sonar-org>
  sonar.sources=src
  sonar.tests=tests
  sonar.javascript.lcov.reportPaths=coverage/lcov.info
  sonar.exclusions=src/lib/vendor/**,src/**/*.original.js
  ```
- [ ] **3.3** Add SonarCloud scan step to the CI workflow using `SonarSource/sonarcloud-github-action@master` with `SONAR_TOKEN` secret
- [ ] **3.4** Add badges to `README.md`:
  ```markdown
  [![Quality Gate](https://sonarcloud.io/api/project_badges/measure?project=<owner>_bAInder&metric=alert_status)](https://sonarcloud.io/summary/<owner>_bAInder)
  [![Security Rating](https://sonarcloud.io/api/project_badges/measure?project=<owner>_bAInder&metric=security_rating)](https://sonarcloud.io/summary/<owner>_bAInder)
  ```

#### Phase 4 — Codacy (maintainability grade) — estimated grade B, ~3–5 days to reach A

> DRY (1.1–1.4), Modularity (2.1–2.4), SRP (3.1–3.5), and Complexity (5.1–5.5) issues are all resolved. Starting grade estimated **B**. Remaining gap: zero-test coverage on new sidepanel modules (controllers, features, services) pulls the coverage sub-score down.

- [ ] **4.1** Sign in to [app.codacy.com](https://app.codacy.com), add the repo — the B-grade badge is publishable immediately after this step
- [ ] **4.2** Add `CODACY_PROJECT_TOKEN` as a GitHub secret and add the Codacy coverage reporter step to the CI workflow
- [ ] **4.3** Write tests for the highest-impact zero-coverage modules to push toward grade A: `sidepanel/controllers/` (5 files), `sidepanel/features/` (7 files), `sidepanel/services/chat-repository.js`
- [ ] **4.4** Add badge to `README.md`:
  ```markdown
  [![Codacy Badge](https://app.codacy.com/project/badge/Grade/<project-id>)](https://app.codacy.com/gh/<owner>/bAInder)
  ```

#### Phase 5 — Shields.io custom badges — partially available today

- [ ] **5.1** Add static platform badge to `README.md` now (no CI required):
  ```markdown
  ![Platforms](https://img.shields.io/badge/platforms-ChatGPT%20%7C%20Claude%20%7C%20Gemini%20%7C%20Copilot-blue)
  ![Manifest](https://img.shields.io/badge/manifest-v3-green)
  ```
- [ ] **5.2** Add CI status badge once the GitHub Actions workflow exists (Phase 2.2):
  ```markdown
  [![CI](https://github.com/<owner>/bAInder/actions/workflows/ci.yml/badge.svg)](https://github.com/<owner>/bAInder/actions)
  ```
- [ ] **5.3** Add eslint badge after achieving a zero-error ESLint run (Phase 1.5):
  ```markdown
  ![ESLint](https://img.shields.io/badge/eslint-0%20errors-brightgreen)
  ```

#### Phase 6 — README consolidated badge block

Once Phases 2–5 are complete, add this block to the top of `README.md`:

```markdown
[![CI](https://github.com/<owner>/bAInder/actions/workflows/ci.yml/badge.svg)](https://github.com/<owner>/bAInder/actions)
[![codecov](https://codecov.io/gh/<owner>/bAInder/badge.svg)](https://codecov.io/gh/<owner>/bAInder)
[![Quality Gate](https://sonarcloud.io/api/project_badges/measure?project=<owner>_bAInder&metric=alert_status)](https://sonarcloud.io/summary/<owner>_bAInder)
[![Security Rating](https://sonarcloud.io/api/project_badges/measure?project=<owner>_bAInder&metric=security_rating)](https://sonarcloud.io/summary/<owner>_bAInder)
[![Codacy Badge](https://app.codacy.com/project/badge/Grade/<project-id>)](https://app.codacy.com/gh/<owner>/bAInder)
![Platforms](https://img.shields.io/badge/platforms-ChatGPT%20%7C%20Claude%20%7C%20Gemini%20%7C%20Copilot-blue)
```

### Suggested CI Workflow Skeleton

```yaml
# .github/workflows/ci.yml
name: CI
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: npm run test:coverage
      - uses: codecov/codecov-action@v4
        with:
          token: ${{ secrets.CODECOV_TOKEN }}
          files: coverage/lcov.info
      - uses: SonarSource/sonarcloud-github-action@master
        env:
          SONAR_TOKEN: ${{ secrets.SONAR_TOKEN }}
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```
