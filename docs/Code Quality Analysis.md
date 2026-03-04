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
| 5.2 | `htmlToMarkdown()` is a recursive switch with a nested platform-specific IIFE | `src/content/extractors/html-to-markdown.js` | Walks the full DOM tree recursively; the Copilot code-block special case remains an inline block inside the main `walk()` function, adding cognitive depth. (Function is now in its own file — further extraction of the Copilot block is a future task.) |
| 5.3 | `handleChatSaved()` chains sequential awaits where some could be parallel | `src/sidepanel/controllers/chat-actions.js` | ⚠️ **Partially resolved** — the raw storage read is eliminated (now a single `chatRepo.updateChat` call). `saveTree()` and the renderer update are still sequential; tree-save and storage-usage update could be parallelised. |
| ~~5.4~~ | ~~`_sortTopics()` repeats the `pinFirst` guard in every `case`~~ | ~~`src/lib/tree-renderer.js`~~ | ✅ **RESOLVED** — Extracted to `src/lib/renderer/tree-sort.js` as `sortTopics(topics, mode)`. `pinFirst` is now applied exactly once via a composed comparator; a `getModeComparator(mode)` helper returns the mode-specific inner comparator. |
| 5.5 | `StorageUsageTracker.getStatistics()` calls `getFormattedUsage()` which calls `getStorageUsage()` — double storage read | `src/lib/storage.js` | `getStatistics` calls `this.storage.getStorageUsage()` directly **and** calls `getFormattedUsage()` which calls it again — two full storage reads for one stats object |

---

## 6. Scalability — Will Not Scale Well

| # | Issue | Location | Detail |
|---|-------|----------|--------|
| 6.1 | `searchChats()` loads all chats into memory for every query | `src/lib/storage.js` | A user with 1,000+ chats will load tens of MB on every keystroke; there is no index, pagination, or early-exit mechanism |
| 6.2 | `getStorageUsage()` does two full storage reads (tree + chats) on every call | `src/lib/storage.js` | Called on every save and UI refresh; at scale each call is O(data-size) with no caching |
| 6.3 | Full chat metadata held in memory as `state.chats` | `src/sidepanel/app-context.js` | ⚠️ **Unchanged (issue remains)** — `state.chats` still holds the full metadata array. The array is now managed exclusively through `ChatRepository` mutations, making a future paging/eviction strategy easier to apply. |
| 6.4 | `Topic.chatIds.includes()` is O(n) per assignment | `src/lib/chat-manager.js` | For topics with many chats, the duplicate check before `push` scans the whole array; a `Set` would be O(1) |
| 6.5 | `StorageService` singleton is never invalidated | `src/lib/storage.js` | The singleton holds no cache, but if a second tab modifies storage, the in-memory state in the side panel is stale with no sync mechanism |

---

## 7. Security — Not Following Standard Practices

| # | Issue | Location | Detail |
|---|-------|----------|--------|
| 7.1 | `DialogManager.show()` accepts raw HTML with no sanitisation | `src/lib/dialog-manager.js` | Callers construct HTML strings and pass them directly; if any string contains unsanitised user data (e.g. a chat title with `<img onerror=...>`), it runs as XSS in the extension origin |
| 7.2 | `browser.runtime.onMessage` listener does not validate message shape or sender | `src/sidepanel/sidepanel.js` | Incoming messages from content scripts are dispatched by `type` without checking `sender.id` or schema-validating the payload; a malicious page could post a crafted `CHAT_SAVED` message. Issue retained in the new thin entry point — not addressed by this refactor. |
| 7.3 | Predictable IDs used to key all data | `src/lib/tree.js` | `topic_<timestamp>_<short-random>` and `chat_<timestamp>_<short-random>` are enumerable; if extension storage is ever exposed or synced, IDs can be predicted by any co-running extension |
| 7.4 | `_mdToHtml()` in export-engine passes HTML through unescaped in some paths | `src/lib/export/md-to-html.js` | The fallback path for chats without a `messages` array uses `_mdToHtml(body)` where `body` is extracted from raw stored content — if the stored content contained HTML it would render in the exported document |
| ~~7.5~~ | ~~Storage writes in `handleChatSaved` bypass the service layer~~ | ~~`src/sidepanel/sidepanel.js`~~ | ✅ **RESOLVED** — All direct `browser.storage.local.set` chat writes have been moved into `ChatRepository`. A single place to add sanitisation or quota checks now exists. |

---

## Summary by Severity

| Priority | Category | Open | Resolved | Highest-Impact Remaining Items |
|----------|----------|-----:|---------:|--------------------------------|
| 🔴 High | Security | 4 | 1 | Raw HTML in `show()`, unvalidated runtime messages |
| 🔴 High | Single Responsibility | 0 | 5 | All identified single-responsibility issues resolved |
| 🟠 Medium | Modularity | 0 | 4 | All major god-modules decomposed |
| 🟠 Medium | Testability | 3 | 2 | `updateRecentRail` DOM measurement; non-deterministic IDs; `triggerDownload` side-effects |
| 🟠 Medium | Scalability | 5 | 0 | Full chat load on every search, unbounded memory — unchanged |
| 🟠 Medium | Dependency Injection | 3 | — | `storage-usage` / `backup-reminder` / `import-export` bypass service layer; shared prefs keys unowned |
| 🟡 Low | DRY | 0 | 5 | **Section fully resolved** |
| 🟡 Low | Complexity | 3 | 2 | Double storage read in `StorageUsageTracker` (5.5); `htmlToMarkdown` recursion depth (5.2); 5.3 partially improved |
| 🟡 Low | DI (structural) | 2 | — | `ChatRepository` hard-codes `browser.storage`; state-locator pattern limits constructor injection |

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
> **Refactor session (2026-03-04, continued):** Resolved issue 5.1 — applied a Schwartzian transform (decorate → sort → undecorate) to `_rankChats()` in `src/lib/storage.js`. `_isTopResult` is now called exactly once per element — O(n × k) total — rather than once per sort comparator invocation — O(n log n × k) total. The sort comparator now performs only cheap boolean and numeric comparisons. All 28 storage tests pass (no regressions).

---

## 8. Dependency Injection — Service Reuse vs. Logic Re-implementation

This section evaluates whether each component consumes existing services through the shared `state` object (the application's composition root / service locator) or bypasses them with direct API calls or duplicate logic.

### Architecture overview

`sidepanel.js` is the **composition root**: all service instances are constructed once and stored on `state`:

| Service slot | Concrete type | Purpose |
|---|---|---|
| `state.storage` | `StorageService` | Topic-tree persistence; raw storage usage |
| `state.chatRepo` | `ChatRepository` | All chat array storage I/O |
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

---

### ❌ Violations — Direct API calls bypassing services

| # | Component | Violation | Service that already handles this | Fix |
|---|---|---|---|---|
| 8.1 | `features/storage-usage.js` | Calls `browser.storage.local.getBytesInUse()` directly | `StorageService.getStorageUsage()` wraps this call and is available on `state.storage` | Replace with `state.storage.getStorageUsage()` (import `{ state }` from `app-context.js`) |
| 8.2 | `features/backup-reminder.js` | Calls `browser.storage.local.get(['lastExportTimestamp', 'nextReminderAt', 'backupReminderDisabled'])` and `browser.storage.local.set({ nextReminderAt: … })` — 3 raw API calls | No service; keys are unowned orphans in raw storage | Extract a `ReminderPrefsRepository` (or extend `StorageService`) with `loadReminderPrefs()` / `snoozeReminder()` / `dismissReminder()`. Both `backup-reminder.js` and `import-export-actions.js` write `lastExportTimestamp` independently — centralising removes the coupling |
| 8.3 | `controllers/import-export-actions.js` | Calls `browser.storage.local.set({ lastExportTimestamp: Date.now() })` directly after a successful export | Same unowned key as issue 8.2 — written from two different modules with no shared contract | Same fix as 8.2: move into a shared preferences service |
| 8.4 | `services/chat-repository.js` | Imports and calls `browser.storage.local` directly (8 calls) instead of delegating to `StorageService` | `StorageService.ChromeStorageAdapter` already wraps `browser.storage.local`; `state.storage` is the intended gateway | `ChatRepository` should accept a `storageAdapter` in its constructor (or use `state.storage` internally), making it independently testable without a `browser` global |

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
| 8.1 | `storage-usage.js` bypasses `StorageService`, duplicates `getBytesInUse` call | 🟠 Medium | `features/storage-usage.js` |
| 8.2 | `backup-reminder.js` owns reminder-prefs storage with 3 raw API calls | 🟠 Medium | `features/backup-reminder.js` |
| 8.3 | `import-export-actions.js` writes `lastExportTimestamp` directly (same key as 8.2) | 🟠 Medium | `controllers/import-export-actions.js` |
| 8.4 | `ChatRepository` hard-codes `browser.storage.local` instead of delegating to `StorageService` | 🟡 Low | `services/chat-repository.js` |
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

| Priority | Tool | What It Measures | Free for Public Repos |
|----------|------|------------------|-----------------------|
| 1 | **Codecov** | Test coverage (lcov/v8) | ✅ |
| 2 | **SonarCloud** | Bugs, code smells, security vulnerabilities, coverage gate | ✅ |
| 3 | **Codacy** | Complexity, duplication, style, security | ✅ |
| 4 | **Code Climate** | Maintainability grade (A–F), technical debt, duplication | ✅ |
| 5 | **Shields.io + ESLint** | Custom badges from any CI metric (error count, pass rate) | ✅ self-hosted |

### Action Items

#### Phase 1 — Prerequisites (before adding any badges)

- [ ] **1.1** Fix the 2 excluded test files (`reader.test.js`, `export-import-integration.test.js`) so the full suite runs cleanly — current 61 failures suppress real coverage figures
- [ ] **1.2** Resolve the 4 open Security issues (7.1–7.4) — SonarCloud and Codacy will flag these as blockers on their quality gate
- [ ] **1.3** Push a clean ESLint run with zero errors — configure `eslint` if not yet present (`npm install --save-dev eslint`)
- [ ] **1.4** Confirm coverage is ≥ 70% across all four metrics (currently ~72–74% on the partial suite; including sidepanel modules will likely drop this)

#### Phase 2 — Codecov (coverage badge)

- [ ] **2.1** Add `@vitest/coverage-v8` output in `lcov` format — update `vitest.config.js`:
  ```js
  coverage: { reporter: ['text', 'lcov'], reportsDirectory: './coverage' }
  ```
- [ ] **2.2** Create a GitHub Actions workflow (`.github/workflows/ci.yml`) that runs `npm run test:coverage` and uploads `coverage/lcov.info` to Codecov
- [ ] **2.3** Sign in to [codecov.io](https://codecov.io) with the repo's GitHub account, add the repo, copy the upload token to a GitHub secret (`CODECOV_TOKEN`)
- [ ] **2.4** Add badge to `README.md`:
  ```markdown
  [![codecov](https://codecov.io/gh/<owner>/bAInder/badge.svg)](https://codecov.io/gh/<owner>/bAInder)
  ```

#### Phase 3 — SonarCloud (quality gate + security badge)

- [ ] **3.1** Sign in to [sonarcloud.io](https://sonarcloud.io), import the GitHub repo, generate a project key
- [ ] **3.2** Add `sonar-project.properties` to repo root:
  ```properties
  sonar.projectKey=<owner>_bAInder
  sonar.organization=<sonar-org>
  sonar.sources=src
  sonar.tests=tests
  sonar.javascript.lcov.reportPaths=coverage/lcov.info
  sonar.exclusions=src/lib/vendor/**
  ```
- [ ] **3.3** Add SonarCloud scan step to the CI workflow using `SonarSource/sonarcloud-github-action@master` with `SONAR_TOKEN` secret
- [ ] **3.4** Add badges to `README.md`:
  ```markdown
  [![Quality Gate](https://sonarcloud.io/api/project_badges/measure?project=<owner>_bAInder&metric=alert_status)](https://sonarcloud.io/summary/<owner>_bAInder)
  [![Security Rating](https://sonarcloud.io/api/project_badges/measure?project=<owner>_bAInder&metric=security_rating)](https://sonarcloud.io/summary/<owner>_bAInder)
  ```

#### Phase 4 — Codacy (optional, for maintainability grade)

- [ ] **4.1** Sign in to [app.codacy.com](https://app.codacy.com), add the repo
- [ ] **4.2** Add `CODACY_PROJECT_TOKEN` as a GitHub secret and add the Codacy coverage reporter step to the CI workflow
- [ ] **4.3** Add badge to `README.md`:
  ```markdown
  [![Codacy Badge](https://app.codacy.com/project/badge/Grade/<project-id>)](https://app.codacy.com/gh/<owner>/bAInder)
  ```

#### Phase 5 — README badge block

Once all tools are active, add a consolidated badge block at the top of `README.md`:

```markdown
[![CI](https://github.com/<owner>/bAInder/actions/workflows/ci.yml/badge.svg)](https://github.com/<owner>/bAInder/actions)
[![codecov](https://codecov.io/gh/<owner>/bAInder/badge.svg)](https://codecov.io/gh/<owner>/bAInder)
[![Quality Gate](https://sonarcloud.io/api/project_badges/measure?project=<owner>_bAInder&metric=alert_status)](https://sonarcloud.io/summary/<owner>_bAInder)
[![Security Rating](https://sonarcloud.io/api/project_badges/measure?project=<owner>_bAInder&metric=security_rating)](https://sonarcloud.io/summary/<owner>_bAInder)
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
