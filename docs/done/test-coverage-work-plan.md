# Unit Test Coverage Work Plan — Target: ≥ 90% per Component

Generated: 2026-03-04  
Baseline run: `npx vitest run --coverage` (excluding reader.test.js and export-import-integration.test.js)

---

## Current State Summary

| Status | File count |
|---|---|
| ≥ 90% statements AND branches AND functions | ~18 files |
| Exists in source but **never imported by any test** (0% implicit) | ~20 files |
| Imported but **< 10%** coverage | 4 files |
| **10–49%** coverage | 8 files |
| **50–89%** coverage | 14 files |
| **≥ 90% statements** but branch/function gaps | 9 files |

Overall project coverage: **66.48% stmts / 65.57% branch / 67.88% funcs**

---

## Files Requiring Work

### Tier 0 — Never Imported by Tests (0% implicit, no test file exists)

These files have **zero test coverage** because no test imports them. Each needs a new dedicated test file.

| File | Notes |
|---|---|
| `src/lib/dialogs/export-dialog.js` | UI dialog wiring for export |
| `src/lib/dialogs/import-dialog.js` | UI dialog wiring for import |
| `src/sidepanel/app-context.js` | Shared React/app context |
| `src/sidepanel/notification.js` | Toast/notification helper |
| `src/sidepanel/sidepanel.js` | Main sidepanel entry point |
| `src/sidepanel/controllers/chat-actions.js` | Chat action handlers |
| `src/sidepanel/controllers/import-export-actions.js` | Import/export controller |
| `src/sidepanel/controllers/search-controller.js` | Search controller |
| `src/sidepanel/controllers/topic-actions.js` | Topic CRUD controller |
| `src/sidepanel/controllers/tree-controller.js` | Tree state controller |
| `src/sidepanel/features/backup-reminder.js` | Backup reminder feature |
| `src/sidepanel/features/multi-select.js` | Multi-select feature |
| `src/sidepanel/features/recent-rail.js` | Recent chats rail |
| `src/sidepanel/features/save-banner.js` | Save status banner |
| `src/sidepanel/features/settings-panel.js` | Settings panel feature |
| `src/sidepanel/features/storage-usage.js` | Storage usage indicator |
| `src/sidepanel/features/theme-picker.js` | Theme picker feature |
| `src/sidepanel/services/reminder-prefs-repository.js` | Reminder prefs persistence |
| `src/sidepanel/services/storage-sync.js` | Storage sync service |
| `src/background/background.js` | Service worker entry (event wiring) |
| `src/content/content.js` | Content script entry (injection wiring) |
| `src/lib/vendor/browser.js` | Vendor wrapper — **exclude from coverage** |

> **Note on entry-point files** (`background.js`, `content.js`, `sidepanel.js`): these are thin wiring files that register event listeners and call into already-tested modules. Target for these is 80%+ with integration-style unit tests using mocks; a 90% target on pure logic is reasonable if side-effectful bootstrapping lines are excluded via `/* c8 ignore */`.

---

### Tier 1 — Imported but ≤ 10% Coverage (needs new test file)

| File | Stmts | Branch | Funcs | Existing test file? |
|---|---|---|---|---|
| `src/lib/chat/annotations.js` | 1.51% | 0% | 0% | ❌ None |
| `src/lib/export-engine.js` | 0% | 0% | 0% | ❌ None |
| `src/lib/renderer/virtual-scroll.js` | 3.61% | 0% | 0% | ❌ None |

**Action:** Create `tests/annotations.test.js`, `tests/export-engine.test.js`, and `tests/virtual-scroll.test.js`.

---

### Tier 2 — 10–49% Coverage (needs new test file or major expansion)

| File | Stmts | Branch | Funcs | Existing test file? |
|---|---|---|---|---|
| `src/reader/reader.js` | 30.99% | 26.84% | 33.33% | ⚠️ `tests/reader.test.js` (failing) |
| `src/lib/sticky-notes/sticky-notes-ui.js` | 31.45% | 29.33% | 20.93% | ⚠️ `tests/sticky-notes-ui.test.js` (partial) |
| `src/lib/utils/logger.js` | 35.29% | 19.23% | 29.41% | ❌ None |
| `src/lib/export/html-builder.js` | 41.37% | 30.30% | 33.33% | ⚠️ `tests/export-engine.test.js` (indirect) |
| `src/lib/export/format-helpers.js` | 40.74% | 22.22% | 62.5% | ⚠️ `tests/export-engine.test.js` (indirect) |
| `src/lib/export/markdown-builder.js` | 42.22% | 35.05% | 28.57% | ⚠️ `tests/export-engine.test.js` (indirect) |
| `src/lib/theme-sdk.js` | 46.42% | 43.47% | 66.66% | ⚠️ `tests/theme.test.js` (partial) |
| `src/lib/renderer/tree-sort.js` | 53.84% | 26.31% | 57.14% | ❌ None |

**Action:** Expand or create the test files listed; unit-test each exported function directly.

---

### Tier 3 — 50–89% Coverage (expand existing tests)

| File | Stmts | Branch | Funcs | Existing test file |
|---|---|---|---|---|
| `src/lib/renderer/item-builder.js` | 61.33% | 60% | 25% | ❌ None |
| `src/lib/renderer/node-builder.js` | 66.2% | 54.28% | 38.88% | ❌ None |
| `src/lib/theme/useTheme.js` | 63.63% | 66.66% | 66.66% | ❌ None |
| `src/lib/tree-renderer.js` | 56.37% | 45.78% | 50.72% | ⚠️ `tests/tree-renderer.test.js` (partial) |
| `src/lib/utils/search-utils.js` | 76.38% | 71.87% | 73.33% | ⚠️ `tests/search-utils.test.js` (partial) |
| `src/content/extractors/source-links.js` | 74.68% | 56.06% | 54.54% | ⚠️ `tests/chat-extractor.test.js` (partial) |
| `src/lib/export/html-styles.js` | 75% | 100% | 66.66% | ⚠️ indirect |
| `src/lib/export/md-to-html.js` | 91.17% | 82.35% | 75% | ⚠️ `tests/export-engine.test.js` (indirect) |
| `src/lib/export/markdown-builder.js` | 42.22% | 35.05% | 28.57% | ⚠️ indirect |
| `src/sidepanel/services/chat-repository.js` | 100% stmts | 61.11% branch | 100% | ⚠️ `tests/chat-repository.test.js` |

---

### Tier 4 — ≥ 90% Statements but Branch/Function Gaps

These files pass the statement threshold but fall short on branches or functions. Minor additions needed.

| File | Stmts | Branch | Funcs | Gap |
|---|---|---|---|---|
| `src/lib/dialogs/chat-dialogs.js` | 90.62% | **78.94%** | 93.33% | Branch coverage |
| `src/lib/import-parser.js` | 93.75% | **77.63%** | 100% | Branch coverage |
| `src/lib/storage.js` | 94.17% | **79.10%** | 96.87% | Branch coverage |
| `src/lib/export/zip-builder.js` | 95.91% | **81.63%** | 100% | Branch coverage |
| `src/lib/export/download.js` | 100% | **50%** | 100% | Branch coverage |
| `src/lib/export/filename-utils.js` | 96.07% | **85.29%** | 100% | Branch coverage |
| `src/lib/export/md-to-html.js` | 91.17% | **82.35%** | **75%** | Branch + function |
| `src/lib/tree/tree-traversal.js` | 95.34% | **83.33%** | 100% | Branch coverage |
| `src/lib/tree/models.js` | 96.87% | 91.42% | **88.88%** | Function coverage |
| `src/lib/style-transformer.js` | 97.87% | **89.23%** | 100% | Branch (very close) |
| `src/lib/dialogs/dialog-manager.js` | 99.21% | **93.50%** | 100% | Branch (close) |

---

## Recommended Work Order

Work should proceed lowest-coverage first, grouped by the test file that will address each group.

### Sprint 1 — Create New Test Files for Zero/Near-Zero Coverage

| Task | New test file | Target files covered |
|---|---|---|
| **T1-A** | `tests/annotations.test.js` | `src/lib/chat/annotations.js` |
| **T1-B** | `tests/export-engine.test.js` | `src/lib/export-engine.js`, `src/lib/export/html-builder.js`, `src/lib/export/format-helpers.js`, `src/lib/export/markdown-builder.js`, `src/lib/export/html-styles.js` |
| **T1-C** | `tests/virtual-scroll.test.js` | `src/lib/renderer/virtual-scroll.js` |
| **T1-D** | `tests/logger.test.js` | `src/lib/utils/logger.js` |
| **T1-E** | `tests/tree-sort.test.js` | `src/lib/renderer/tree-sort.js` |
| **T1-F** | `tests/item-builder.test.js` | `src/lib/renderer/item-builder.js`, `src/lib/renderer/node-builder.js` |
| **T1-G** | `tests/use-theme.test.js` | `src/lib/theme/useTheme.js` |

### Sprint 2 — Expand Existing Partial Test Files

| Task | Existing test file | Target files | Key gaps to add |
|---|---|---|---|
| **T2-A** | `tests/sticky-notes-ui.test.js` | `src/lib/sticky-notes/sticky-notes-ui.js` | Drag interactions, context menu callbacks, multi-note ops |
| **T2-B** | `tests/theme.test.js` | `src/lib/theme-sdk.js` | applyTheme, token overrides, CSS var map |
| **T2-C** | `tests/tree-renderer.test.js` | `src/lib/tree-renderer.js` | renderNode edge cases, collapse/expand state, event handlers |
| **T2-D** | `tests/search-utils.test.js` | `src/lib/utils/search-utils.js` | Highlight overlaps, empty queries, multi-term |
| **T2-E** | `tests/chat-extractor.test.js` | `src/content/extractors/source-links.js` | Source parsing edge cases, malformed URLs |
| **T2-F** | `tests/reader.test.js` (fix + expand) | `src/reader/reader.js` | Fix failing tests; add render, navigation, theme paths |

### Sprint 3 — Fix Branch Coverage Gaps (Tier 4)

| Task | Test file | File(s) | Specific uncovered branches |
|---|---|---|---|
| **T3-A** | `tests/chat-dialogs.test.js` | `chat-dialogs.js` | Lines 183–199: error/cancel paths |
| **T3-B** | `tests/import-parser.test.js` | `import-parser.js` | Lines 581, 678, 729, 762: edge/error branches |
| **T3-C** | `tests/storage.test.js` | `storage.js` | Lines 171–172, 403–404: storage quota/error paths |
| **T3-D** | `tests/export-engine.test.js` | `zip-builder.js`, `download.js` | Error paths, blob creation fallback (line 16–17) |
| **T3-E** | `tests/export-engine.test.js` | `filename-utils.js` | Lines 59–78, 96–100: special char/long-name truncation |
| **T3-F** | `tests/tree.test.js` | `tree-traversal.js`, `models.js` | Lines 76, 104; line 145, 207 |

### Sprint 4 — Sidepanel Controllers & Features

These require DOM/event mocking with happy-dom; each is a thin controller so tests will focus on method contracts.

| Task | New test file | Target |
|---|---|---|
| **T4-A** | `tests/chat-actions.test.js` | `sidepanel/controllers/chat-actions.js` |
| **T4-B** | `tests/topic-actions.test.js` | `sidepanel/controllers/topic-actions.js` |
| **T4-C** | `tests/search-controller.test.js` | `sidepanel/controllers/search-controller.js` |
| **T4-D** | `tests/tree-controller.test.js` | `sidepanel/controllers/tree-controller.js` |
| **T4-E** | `tests/import-export-actions.test.js` | `sidepanel/controllers/import-export-actions.js` |
| **T4-F** | `tests/sidepanel-features.test.js` | `backup-reminder.js`, `save-banner.js`, `storage-usage.js`, `multi-select.js`, `recent-rail.js` |
| **T4-G** | `tests/settings-panel.test.js` | `sidepanel/features/settings-panel.js`, `theme-picker.js` |
| **T4-H** | `tests/reminder-prefs.test.js` | `services/reminder-prefs-repository.js`, `services/storage-sync.js` |

### Sprint 5 — Entry-Point / Wiring Coverage

| Task | New test file | Target | Approach |
|---|---|---|---|
| **T5-A** | `tests/export-dialog.test.js` | `lib/dialogs/export-dialog.js`, `lib/dialogs/import-dialog.js` | Mock dialog APIs, verify open/close/submit flows |
| **T5-B** | `tests/background.test.js` | `background/background.js` | Mock chrome events, verify handler registration |
| **T5-C** | `tests/app-context.test.js` | `sidepanel/app-context.js`, `notification.js` | Context provider, notification dispatch |

---

## Exclusions / Won'T Fix

| File | Reason |
|---|---|
| `src/lib/vendor/browser.js` | Third-party vendor shim; add to `coverage.exclude` in `vitest.config.js` |
| `src/lib/export-engine.original.js` | Legacy backup file; add `*.original.js` pattern to `coverage.exclude` |
| `src/lib/tree.original.js` | Same reason |
| `src/lib/tree-renderer.original.js` | Same reason |
| `src/sidepanel/sidepanel.original.js` | Same reason |
| `src/content/chat-extractor.original.js` | Same reason |

**Recommended `coverage.exclude` addition in `vitest.config.js`:**
```js
'src/**/*.original.js',
'src/lib/vendor/**',
```

---

## Effort Estimates

| Sprint | Tasks | Estimated effort |
|---|---|---|
| Sprint 1 | T1-A → T1-G (7 new test files) | ~3–4 days |
| Sprint 2 | T2-A → T2-F (expand 6 files) | ~2–3 days |
| Sprint 3 | T3-A → T3-F (branch gap fills) | ~1–2 days |
| Sprint 4 | T4-A → T4-H (8 new controller/feature test files) | ~4–5 days |
| Sprint 5 | T5-A → T5-C (entry-point wiring) | ~1–2 days |
| **Total** | | **~11–16 days** |

---

## Definition of Done

A component is considered "done" when **all three** metrics are ≥ 90%:
- Statement coverage ≥ 90%
- Branch coverage ≥ 90%
- Function coverage ≥ 90%

The coverage gate should be enforced by adding thresholds to `vitest.config.js`:
```js
coverage: {
  thresholds: {
    statements: 90,
    branches: 90,
    functions: 90,
    lines: 90,
    perFile: true   // fail the build if any single file drops below 90%
  }
}
```
