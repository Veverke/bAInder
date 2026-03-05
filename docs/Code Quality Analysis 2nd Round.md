# Code Quality Analysis — bAInder (2nd Round)

> **Scope:** Fresh inspection of the post-refactor codebase (all 1st-round issues resolved).  
> **Date:** 2026-03-04  
> **Method:** Full static analysis — grep, manual review, vitest coverage — across all non-vendor, non-original source files.

---

## Summary by Severity

| Priority | Category | Open | Notes |
|----------|----------|-----:|-------|
| ✅ Done | Correctness Bug | 0 | `setupDefaults()` stale storage keys fixed (§4) — **resolved 2026-03-04** |
| ✅ Done | Testability | 0 | JSZip vendor import blocks test isolation (§9) — **resolved 2026-03-04** |
| ✅ Done | Logging consistency | 0 | Logger service bypassed application-wide (§1) — **resolved 2026-03-04** |
| ✅ Done | Debug residue | 0 | `[bAInder DEBUG]` log spam resolved (§2) — **resolved 2026-03-04** |
| ✅ Done | Cross-browser API | 0 | Direct `chrome.*` calls replaced with `browser.*` polyfill (§5) — **resolved 2026-03-04** |
| ✅ Done | DI violation | 0 | `settings-panel.js` bypasses `ReminderPrefsRepository` (§6) — **resolved 2026-03-04** |
| ✅ Done | Dead code | 0 | 5 × `.original.js` files deleted (§3) — **resolved 2026-03-04** |
| ✅ Done | Phantom dependency | 0 | `jszip` npm package removed from `dependencies` (§7) — **resolved 2026-03-04** |
| ✅ Done | Tooling gap | 0 | ESLint v10 + `eslint.config.js` + lint script wired up (§8) — **resolved 2026-03-04** |
| ✅ Done | Module side-effect | 0 | `useTheme.js` module-level `restoreTheme()` call removed (§10) — **resolved 2026-03-04** |
| ✅ Done | Magic constants | 0 | Named constants extracted to `src/lib/utils/constants.js` (§11) — **resolved 2026-03-04** |

---

## 1. Logging — Logger Service Bypassed Application-Wide ✅ RESOLVED

**Severity: 🟠 Medium** | **Status: Resolved 2026-03-04**

> All 40+ `console.*` call sites across 17 modules replaced with `logger.*`. `import { logger }` added to the 15 modules that lacked it. Tests updated to match the logger-prefixed output format. 1469/1469 tests pass.

The application ships a configurable leveled logger in `src/lib/utils/logger.js` with five levels (`TRACE`, `INFO`, `WARN`, `ERROR`, `OFF`) persisted in `localStorage`. The Settings panel exposes this control. However, ~20 production modules bypass the logger and call `console.*` directly, making the level setting ineffective for 95% of the application's log output.

### 1.1 ✅ — `notification.js` debug echo via `console.log`

| Field | Value |
|---|---|
| File | `src/sidepanel/notification.js` |
| Line | [L20](../src/sidepanel/notification.js#L20) |
| Pattern | `console.log(`[${type.toUpperCase()}] ${message}`)` |

`showNotification()` emits every toast message to the console unconditionally, regardless of log level. This should delegate to `logger.log()`.

### 1.2 ✅ — Inconsistent logger use in `sidepanel.js` error handlers

| File | Try block | Catch block |
|---|---|---|
| `src/sidepanel/sidepanel.js` | `logger.log('[StorageSync] External topicTree change detected')` | `console.error('[StorageSync] onTopicTreeChanged error:', err)` — [L167](../src/sidepanel/sidepanel.js#L167) |
| `src/sidepanel/sidepanel.js` | `logger.log('[StorageSync] External chats change detected')` | `console.error('[StorageSync] onChatsChanged error:', err)` — [L186](../src/sidepanel/sidepanel.js#L186) |

Happy-path branches use `logger.log`; error branches fall back to raw `console.error`. Both should use `logger.error`.

### 1.3 ✅ — Modules that never import the logger

The following non-original, non-vendor source files call `console.*` at 40+ call sites without importing the logger:

| File | Call count | Methods used |
|---|---|---|
| `src/sidepanel/controllers/tree-controller.js` | 5 | `log`, `error` |
| `src/sidepanel/controllers/topic-actions.js` | 3 | `log`, `warn` |
| `src/sidepanel/controllers/chat-actions.js` | 2 | `warn` |
| `src/sidepanel/controllers/search-controller.js` | 1 | `error` |
| `src/sidepanel/controllers/import-export-actions.js` | 3 | `error` |
| `src/sidepanel/features/multi-select.js` | 4 | `error` |
| `src/sidepanel/features/save-banner.js` | 2 | `warn`, `error` |
| `src/sidepanel/features/storage-usage.js` | 1 | `error` |
| `src/sidepanel/services/chat-repository.js` | 2 | `error` (imports logger for success path, forgets it in catch) |
| `src/sidepanel/services/reminder-prefs-repository.js` | 4 | `error` |
| `src/sidepanel/services/storage-sync.js` | 1 | `error` |
| `src/lib/storage.js` | 6 | `error` |
| `src/lib/theme/useTheme.js` | 2 | `warn`, `error` |
| `src/reader/reader.js` | 2 | `error` |
| `src/background/chat-save-handler.js` | 2 | `log` |

**Fix:** Add `import { logger } from '…/utils/logger.js'` to each module and replace every `console.log/warn/error` call with the corresponding `logger.log/warn/error`. Controllers and services that already exist in the sidepanel context can use the singleton exported by `logger.js` directly (no DI needed; the logger is process-global).

---

## 2. Debug Residue — `[bAInder DEBUG]` Log Spam in Production Bundles ✅ Resolved

**Severity: 🟠 Medium** → **✅ Fixed 2026-03-04**

> **Resolution:** All `[bAInder DEBUG]` calls gated behind `logger.trace()` in `background.js` (10 calls — added `logger` import and converted each `console.log/warn`). All 8 debug calls removed entirely from `content.js` (calls dumping raw DOM/markdown strings removed; the outer `catch` block retains a non-debug `console.error('[bAInder] contextmenu error:', err)` for genuine error visibility).

Two files contain development instrumentation left in place that will appear in every user's DevTools console in production.

### 2.1 ✅ — `background.js` (10 debug calls)

| Lines | Pattern |
|---|---|
| [L45](../src/background/background.js#L45), [L56](../src/background/background.js#L56), [L63](../src/background/background.js#L63), [L65](../src/background/background.js#L65), [L72](../src/background/background.js#L72), [L75](../src/background/background.js#L75), [L78](../src/background/background.js#L78), [L82](../src/background/background.js#L82), [L84](../src/background/background.js#L84), [L192–L195](../src/background/background.js#L192) | `console.log('[bAInder DEBUG] …')` / `console.warn('[bAInder DEBUG] …')` |

All ten calls include the `[bAInder DEBUG]` prefix, confirming they were temporary instrumentation. In addition to leaking sensitive data (full payloads trimmed to 200–500 chars, which is still substantial) to the DevTools console of any user who inspects the background service worker, they add perceptible noise for extension reviewers.

**Fix:** ~~Remove the 10 debug calls entirely, or gate them behind `logger.trace(…)` so they only appear when the user has opted into `TRACE` level.~~ **Done:** All 10 calls converted to `logger.trace()`; `logger` import added.

### 2.2 ✅ — `content.js` (8 debug calls)

| Lines | Pattern |
|---|---|
| [L715](../src/content/content.js#L715), [L722](../src/content/content.js#L722), [L723](../src/content/content.js#L723), [L726](../src/content/content.js#L726), [L727](../src/content/content.js#L727), [L728](../src/content/content.js#L728), [L763](../src/content/content.js#L763), [L766](../src/content/content.js#L766), [L780](../src/content/content.js#L780) | `console.log/warn('[bAInder DEBUG] …')` |

Same problem as §2.1, but in the content script — visible in the DevTools console of every supported AI chat page. Calls dump raw DOM `outerHTML` and markdown strings.

**Fix:** ~~Remove or gate behind the logger's `TRACE` level.~~ **Done:** All 8 debug calls removed entirely.

---

## 3. Dead Code — Five `.original.js` Files Still in Source Tree ✅ RESOLVED

**Severity: 🟡 Low** | **Status: Resolved 2026-03-04**

> **Resolution:** All five `.original.js` files deleted from the repository. ~4,192 lines of dead code removed. Git history preserves the originals if ever needed.

Following the Round 1 refactors, the original versions of the decomposed modules were left in place with `.original.js` suffixes. These files are excluded from the Vite build and Vitest coverage but they remain in the repository.

| File | Approx. lines | Replacement |
|---|---|---|
| `src/sidepanel/sidepanel.original.js` | ~1,842 | 16 modules under `src/sidepanel/` |
| `src/content/chat-extractor.original.js` | ~500 | 9 modules under `src/content/extractors/` |
| `src/lib/export-engine.original.js` | ~400 | 9 modules under `src/lib/export/` |
| `src/lib/tree-renderer.original.js` | ~1,100 | 8 modules under `src/lib/renderer/` |
| `src/lib/tree.original.js` | ~350 | 4 modules under `src/lib/tree/` |

**Total dead code:** ~4,192 lines.

**Impact:**
- Confuses new contributors who may think these files are active
- Pollutes `grep` / IDE search results with false positives
- Slightly inflates `git diff` for unrelated changes

**Fix:** ~~Delete all five files. Git history preserves the originals if they are ever needed.~~ **Done:** All five files deleted.

---

## 4. Correctness Bug — `setupDefaults()` Uses Stale Storage Keys ✅ RESOLVED

**Severity: 🔴 High** | **Status: Resolved 2026-03-04**

> **Resolution:** `setupDefaults()` updated to use the correct `'topicTree'` key (matching `ChromeStorageAdapter.KEYS.TOPIC_TREE`), guard changed to `existing.topicTree`, default value set to `{ rootTopicIds: [], topics: {} }`, existing chats preserved via `existing.chats ?? []`, and dead keys `expandedTopics` / `settings` removed entirely. `console.error` replaced with `logger.error`. 1508/1508 tests pass.

`src/background/background.js` `setupDefaults()` was written before the Round 1 storage refactor and has never been updated to match the new key names.

```javascript
// background.js — setupDefaults()
const existing = await browser.storage.local.get(['topics', 'chats', 'settings']); // ← reads 'topics'
if (!existing.topics) {                                                              // ← checks 'topics'
  await browser.storage.local.set({
    topics:         [],          // ← writes 'topics'   (dead key — never read)
    chats:          [],          // ← correct
    expandedTopics: [],          // ← writes 'expandedTopics' (never read)
    settings: { autoSave: true, showTimestamps: true, defaultExportFormat: 'markdown' },
    //            ↑ 'settings' key and all three sub-keys are never read by any module
  });
}
```

The real storage key for the topic tree is `'topicTree'` (per `ChromeStorageAdapter.KEYS.TOPIC_TREE`), not `'topics'`. On every fresh installation:

1. `existing.topics` is always `undefined`, so the guard fires every time.
2. `topics: []` is written to a key that `loadTopicTree()` never reads — wasted write.
3. `expandedTopics: []` was meaningful in the original architecture but is no longer read by any module in the refactored codebase.
4. The `settings` object and its three fields (`autoSave`, `showTimestamps`, `defaultExportFormat`) are written once on install but are never subsequently read by any module.
5. Because the guard checks `existing.topics` (the dead key), `setupDefaults` would also fire spuriously for users who upgrade from a version that has `topicTree` but not `topics`.

**Fix:** ~~Replace stale `'topics'` / `expandedTopics` / `settings` keys with correct `'topicTree'` guard, proper default shape, and `logger.error`.~~ **Done:** Applied as specified above.

---

## 5. Cross-Browser API — Direct `chrome.*` Calls Bypass the `browser` Polyfill ✅ RESOLVED

**Severity: 🟠 Medium** | **Status: Resolved 2026-03-04**

> **Resolution:** All three `chrome.sidePanel.open()` calls in `background.js` replaced with `browser.sidePanel.open()` (import was already present). In `useTheme.js`, added `import browser from '../vendor/browser.js'` and replaced both `chrome.storage.local` calls with `browser.storage.local`. Updated the JSDoc comment accordingly. 1518/1518 tests pass.

`src/background/background.js` imports `browser` from `src/lib/vendor/browser.js` for all API calls — except `chrome.sidePanel.open()`, which is called via the raw global in three places.

| Line | Call |
|---|---|
| ~~[L107](../src/background/background.js#L107)~~ | ~~`chrome.sidePanel.open({ tabId: tabs[0].id })`~~ → now `browser.sidePanel.open(…)` (inside `onInstalled`) |
| ~~[L143](../src/background/background.js#L143)~~ | ~~`chrome.sidePanel.open({ tabId: tab.id })`~~ → now `browser.sidePanel.open(…)` (inside `onClicked`) |
| ~~[L215](../src/background/background.js#L215)~~ | ~~`chrome.sidePanel.open({ tabId: sender.tab.id })`~~ → now `browser.sidePanel.open(…)` (inside `OPEN_SIDE_PANEL` message handler) |

The `browser.js` polyfill is already imported as `browser`; the vendored shim resolves to `chrome` in Chrome and `browser` in Firefox/Edge (if ever supported). Using `browser.sidePanel.open()` keeps the codebase consistent and ensures the polyfill path is exercised if the target browser set expands.

**Separate sub-issue — `useTheme.js`:**

~~`src/lib/theme/useTheme.js` calls `chrome.storage.local.set()` ([L43](../src/lib/theme/useTheme.js#L43)) and `chrome.storage.local.get()` ([L52](../src/lib/theme/useTheme.js#L52)) directly. This module does not import the `browser` polyfill, making it a `chrome`-only module.~~ **Fixed:** `browser` imported; both `chrome.storage.local` calls now use `browser.storage.local`. JSDoc comment updated.

~~**Fix (both):** Replace all three `chrome.sidePanel.open()` calls in `background.js` with `browser.sidePanel.open()` (the import is already present). In `useTheme.js`, add `import browser from '../vendor/browser.js'` and replace both `chrome.storage.local` calls with `browser.storage.local`.~~ **Done.**

---

## 6. DI Violation — `settings-panel.js` Bypasses `ReminderPrefsRepository` ✅ RESOLVED

**Severity: 🟠 Medium** | **Status: Resolved 2026-03-04**

> **Resolution:** Added `async setEnabled(enabled)` and `async setReminderInterval(days)` to `ReminderPrefsRepository`. Updated `settings-panel.js` to import `{ state }` from `app-context.js` and call `state.reminderPrefs.loadPrefs()`, `state.reminderPrefs.setEnabled(…)`, and `state.reminderPrefs.setReminderInterval(…)` instead of raw `browser.storage.local` calls. `ReminderPrefsRepository` is now the sole writer for all four reminder-pref keys. 1520/1520 tests pass.
>
> **Follow-up resolved 2026-03-05:** The remaining 2 raw `browser.storage.local` calls for `storageWarnThresholdMB` were also eliminated. Added `async getWarnThresholdMB()` and `async setWarnThresholdMB(mb)` to `StorageUsageTracker` (routing through `this.storage.get/set` for testability). Refactored `isApproachingQuota()` and `getStatistics()` to call `this.getWarnThresholdMB()` instead of inlining the raw `browser.storage.local.get(…)`. `settings-panel.js` now delegates to `state.storageTracker.getWarnThresholdMB()` / `setWarnThresholdMB(mb)` and the `browser` import was removed entirely. 4 new unit tests added (`getWarnThresholdMB` default, stored value, `setWarnThresholdMB` persists, `isApproachingQuota` routes through storage). 1624/1624 tests pass.

Round 1 issues 8.2 and 8.3 were resolved by creating `ReminderPrefsRepository`, which became the single owner of four preference keys: `lastExportTimestamp`, `nextReminderAt`, `backupReminderDisabled`, and `backupReminderIntervalDays`. `backup-reminder.js` and `import-export-actions.js` were updated to call the repository exclusively.

~~However, `src/sidepanel/features/settings-panel.js` still accesses three of those same keys directly:~~

| Lines | ~~Raw storage call~~ | Key |
|---|---|---|
| ~~[L43–L45]~~ | ~~`browser.storage.local.get(['backupReminderDisabled'])`~~ | `backupReminderDisabled` — now via `state.reminderPrefs.loadPrefs()` |
| ~~[L44]~~ | ~~`browser.storage.local.set({ backupReminderDisabled: … })`~~ | `backupReminderDisabled` — now via `state.reminderPrefs.setEnabled(…)` |
| ~~[L54–L56]~~ | ~~`browser.storage.local.get(['backupReminderIntervalDays'])`~~ | `backupReminderIntervalDays` — now via `state.reminderPrefs.loadPrefs()` |
| ~~[L57]~~ | ~~`browser.storage.local.set({ backupReminderIntervalDays: … })`~~ | `backupReminderIntervalDays` — now via `state.reminderPrefs.setReminderInterval(…)` |

~~Additionally, `ReminderPrefsRepository` has no method to set `backupReminderIntervalDays` — it reads the value in `loadPrefs()` but exposes no setter. `settings-panel.js` writes it directly to compensate.~~

**Consequences:**
- ~~Any future sanitisation or schema migration on reminder prefs must be applied in two places instead of one.~~
- ~~`ReminderPrefsRepository` is no longer the complete contract for its key group — it maintains a false advertised responsibility.~~

~~**Fix:**~~
~~1. Add `async setReminderInterval(days)` and `async setEnabled(enabled)` methods to `ReminderPrefsRepository`.~~
~~2. Update `settings-panel.js` to call `state.reminderPrefs.setEnabled(…)` and `state.reminderPrefs.setReminderInterval(…)` instead of the raw storage calls.~~
~~3. Remove the `browser` import from `settings-panel.js` (it will no longer need it for these operations).~~ **Note: `browser` retained for the unrelated `storageWarnThresholdMB` control.**

---

## 7. Phantom npm Dependency — `jszip` Package Never Imported ✅ RESOLVED

**Severity: 🟡 Low** | **Status: Resolved 2026-03-04**

> **Resolution:** `jszip` removed from `package.json` `dependencies`; `npm install` run to prune it from `node_modules` and update `package-lock.json`. The vendored `src/lib/vendor/jszip-esm.js` remains the authoritative source. 1582/1582 tests pass.

`package.json` listed `jszip@^3.10.1` as a **runtime dependency** (`dependencies`, not `devDependencies`). However, no source file imported from the bare `'jszip'` module specifier. Both the export and import dialogs used the vendored copy:

```javascript
// src/lib/dialogs/export-dialog.js
import JSZip from '../vendor/jszip-esm.js';   // ← vendor, not npm

// src/lib/dialogs/import-dialog.js  
import JSZip from '../vendor/jszip-esm.js';   // ← vendor, not npm
```

The `jszip` npm package was installed into `node_modules` and bundled into `package-lock.json`, but the Vite build never resolved it because there were no bare `'jszip'` imports.

**Consequences (resolved):**
- ~~Adds ~100 KB to `node_modules` unnecessarily.~~
- ~~Misleads contributors into thinking `import JSZip from 'jszip'` works in source.~~

~~**Fix:** Remove `jszip` from `package.json` `dependencies` and run `npm install` to update the lock file.~~ **Done.**

---

## 8. Tooling Gap — No ESLint ✅ RESOLVED

**Severity: 🟡 Low** | **Status: Resolved 2026-03-04**

> **Resolution:** `eslint@10` and `globals` installed as devDependencies. `eslint.config.js` created at the repo root using ESLint v9+ flat-config format with `globals.browser` + `globals.webextensions` + `no-undef: error`, `no-unused-vars: warn`, and `no-console: warn`. `"lint": "eslint src/**/*.js"` added to `package.json` scripts. Running `npm run lint` now reports 20 errors and 137 warnings across `src/`, confirming the gate is active.

~~The project has no linting toolchain:~~
~~- No `.eslintrc.*` or `eslint.config.js` file exists.~~
~~- `eslint` is absent from `package.json` `devDependencies`.~~
~~- No lint script in `package.json`.~~

### 8.1 ✅ — Install ESLint and `globals`

```bash
npm install --save-dev eslint globals
```

### 8.2 ✅ — Create `eslint.config.js` (flat config, ESLint v9+)

```js
import globals from 'globals';

export default [
  {
    files: ['src/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.webextensions,
      },
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': 'warn',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
];
```

### 8.3 ✅ — Add `lint` script to `package.json`

```json
"lint": "eslint src/**/*.js"
```

---

## 9. Testability — Vendored JSZip Import Blocks Test Isolation ✅ RESOLVED

**Severity: 🔴 High** | **Status: Resolved 2026-03-04**

> **Resolution:** Both parts applied. `src/lib/vendor/jszip-esm.js` now exports a `Proxy` that reads `globalThis.JSZip` at call time instead of capturing `window.JSZip` once at import time (Part A). `vitest.config.js` gained an alias mapping `'../vendor/jszip-esm.js'` to `tests/__mocks__/jszip.js` so the UMD bundle never executes during tests (Part B). All 1827 tests pass — `reader.test.js` (122 tests) and `export-import-integration.test.js` (119 tests) re-enabled and green.

This was the root cause of the 61 test failures in `export-import-integration.test.js` and `reader.test.js`.

**The chain (resolved):**
1. `vitest.config.js` mapped the bare `'jszip'` specifier to a proxy mock deferring to `globalThis.JSZip`.
2. ~~Neither `export-dialog.js` nor `import-dialog.js` imports `'jszip'`; they import `'../vendor/jszip-esm.js'`~~ — now also aliased.
3. ~~`jszip-esm.js` executed `import './jszip.min.js'` which set `window.JSZip = <real library>` at module-graph time~~ — now bypassed by alias in tests; in production the Proxy is used.
4. ~~When a test set `globalThis.JSZip = MockJSZip`, the captured reference was already pointing at the real library~~ — the Proxy reads at call time, so mock assignments now take effect.

~~**Fix (two-part):**~~

**Part A ✅** — `src/lib/vendor/jszip-esm.js` now exports a `Proxy` identical to `tests/__mocks__/jszip.js`:
```javascript
import './jszip.min.js';
export default new Proxy(function () {}, {
  get(_, prop)          { return globalThis.JSZip?.[prop]; },
  construct(_, args)    { return new globalThis.JSZip(...args); },
  apply(_, thisArg, args) { return globalThis.JSZip?.apply(thisArg, args); },
});
```

**Part B ✅** — `vitest.config.js` alias added:
```js
'../vendor/jszip-esm.js': resolve(__dirname, 'tests/__mocks__/jszip.js'),
```

---

## 10. Module-Level Side Effect — `useTheme.js` Runs Storage I/O at Import Time ✅ RESOLVED

**Severity: 🟡 Low** | **Status: Resolved 2026-03-04**

> **Resolution:** Removed the four-line module-level block (comment banner + `restoreTheme()` call) from the bottom of `useTheme.js`. Both entry points already call `loadTheme()` explicitly on startup — `sidepanel.js` (L102) and `reader.js` (L1302) — so no caller behaviour changes. 1586/1586 tests pass.

~~`src/lib/theme/useTheme.js` calls `restoreTheme()` unconditionally at module scope:~~

~~`restoreTheme()` calls `browser.storage.local.get(STORAGE_KEY)`. This runs the instant any module imports anything from `useTheme.js`, which causes three problems:~~

~~1. **Unit test breakage:** Importing `useTheme.js` in a test explodes unless `browser.storage.local` is mocked globally (even if the test doesn't touch themes).~~
~~2. **Double application:** `sidepanel.js` `init()` reads `localStorage.getItem('themeId')` and explicitly calls `await loadTheme(savedThemeId)`. The module-level `restoreTheme()` runs a redundant async read and re-applies the theme.~~
~~3. **Ordering risk:** The module-level async operation is fire-and-forget (no `await`). If the module loads before the DOM is ready, the CSS variable writes may happen before `<html>` is available, or lose a race with the explicit `loadTheme()` call.~~

**Fix:** ~~Remove the module-level `restoreTheme()` call. Every entry point that needs theme restoration already calls `loadTheme(id)` explicitly — `sidepanel.js` (L102), `reader.js` (L1301). Let callers opt in rather than having the module apply itself on import.~~ **Done.**

---

## 11. Magic Timeout Constants — Inline Numeric Literals ✅ RESOLVED

**Severity: 🟡 Low** | **Status: Resolved 2026-03-04**

> **Resolution:** Created `src/lib/utils/constants.js` exporting four named constants (`TOAST_DISMISS_MS`, `SAVE_BTN_RESET_MS`, `TREE_FLASH_MS`, `HOVER_OUT_DISMISS_MS`). All five inline literals replaced with the appropriate constant; each affected module imports from the shared file. The duplicated `150` ms hover-out delay is now unified in a single export. 1590/1590 tests pass.

Several UI timing values are hardcoded as inline literals with no named constant or centralized documentation.

| Value (ms) | Location | Meaning | Constant |
|---|---|---|---|
| `3000` | `src/sidepanel/notification.js` | Toast auto-dismiss duration | `TOAST_DISMISS_MS` |
| `3500` | `src/sidepanel/features/save-banner.js` | Save-button reset delay | `SAVE_BTN_RESET_MS` |
| `1500` | `src/sidepanel/sidepanel.js` | Tree item flash duration | `TREE_FLASH_MS` |
| `150` | `src/reader/reader.js` | Annotation panel hover-out delay | `HOVER_OUT_DISMISS_MS` |
| `150` | `src/lib/sticky-notes/sticky-notes-ui.js` | Sticky-note dropdown hover-out delay | `HOVER_OUT_DISMISS_MS` |

The `150` ms value appears in two separate modules for the same conceptual purpose (hover-out delay before hiding a floating panel), meaning a user-experience decision is duplicated rather than shared.

~~**Fix:** Extract named constants at the top of each module (or into a shared `src/lib/utils/constants.js`)~~

**Done:** All constants exported from `src/lib/utils/constants.js`:
```javascript
/** Milliseconds before a toast notification is auto-dismissed. */
export const TOAST_DISMISS_MS = 3000;

/** Milliseconds before the save button resets to its default state. */
export const SAVE_BTN_RESET_MS = 3500;

/** Milliseconds that the tree-item flash highlight remains visible. */
export const TREE_FLASH_MS = 1500;

/**
 * Milliseconds after the pointer leaves a floating panel before it is hidden.
 * Shared between reader.js (annotation dropdown) and sticky-notes-ui.js.
 */
export const HOVER_OUT_DISMISS_MS = 150;
```

---

## Open Items Carried Forward from Round 1

The following issues were identified in the first round but not yet resolved; they remain valid:

| # | Issue | Location | Notes |
|---|---|---|---|
| 4.3 | ~~Non-deterministic ID generation~~ | ✅ Resolved (issue 7.3 in Round 1) | |
| 4.4 | ~~`triggerDownload()` has uncontrollable side effects~~ | ~~`src/lib/export/download.js`~~ | ✅ **RESOLVED 2026-03-05** — DOM mutation (`createElement`/`appendChild`/`click`) extracted to a `domClickDriver` function and isolated behind a module-level `_driver` variable. `setDownloadDriver(fn)` exported (also re-exported from `export-engine.js`) so tests inject a spy with no DOM contact. `triggerDownload` itself now only constructs the Blob and calls `URL.createObjectURL`. Two new tests verify the driver is called with the correct URL + filename and that `document.createElement` is never touched. 1600/1600 tests pass. |
| 4.5 | ~~`updateRecentRail()` overflow detection via `scrollWidth`/`clientWidth`~~ | ~~`src/sidepanel/features/recent-rail.js`~~ | ✅ **RESOLVED 2026-03-05** — Overflow check extracted into an injectable `isOverflowing(rail)` parameter (defaults to `rail.scrollWidth > rail.clientWidth` in production). Tests pass a controlled predicate, bypassing jsdom's always-zero layout metrics. New test file `tests/recent-rail.test.js` — 20 tests covering: no-rail guard, fewer-than-3 hidden, chip count/cap, sort order, savedAt priority, title/source rendering, click handler, overflow truncation, overflow leaves only label → hidden, isOverflowing not called when rail is hidden early. 1861/1861 tests pass. |
| 6.3 | ~~Full chat metadata held in `state.chats` (unbounded array)~~ | ~~`src/sidepanel/app-context.js`~~ | ✅ **RESOLVED 2026-03-04** — `ChatRepository.loadAll()` now sorts by `timestamp` descending and caps the returned metadata at `MAX_CHATS_IN_MEMORY = 5000` entries. A `logger.warn` fires when the cap is applied. `MAX_CHATS_IN_MEMORY` exported from `chat-repository.js`. 6 new unit tests (sort order, missing-timestamp fallback, cap count, cap keeps most-recent, warning emitted, no warning under cap). 1841/1841 tests pass. |
| 8.5 | ~~Module-level service locator (`state`) instead of constructor injection~~ | ~~All sidepanel controllers & features~~ | ✅ **RESOLVED 2026-03-05** — `export function _setContext(ctx) { _state = ctx; }` added to all 10 state-consuming modules (5 controllers + 5 features). Each module now holds a local `let _state = state` reference that defaults to the real singleton; tests can pass a plain-object mock via `_setContext({...})` without touching the shared singleton. Existing tests continue to work unchanged (they mutate `state.*` properties, which `_state` still reflects). Import paths for restructured lib modules (`lib/tree/tree.js`, `lib/renderer/`, `lib/chat/`, `lib/utils/`) updated in the same pass. All `console.*` calls in the affected files converted to `logger.*`. 1734/1734 tests pass. |

---

## Appendix — Issue Counts by File

Files with the highest number of newly identified issues (excluding `.original.js`):

| File | Issues |
|---|---|
| `src/background/background.js` | ~~§2.1 (debug logs)~~, ~~§4 (stale keys)~~, ~~§5.1 (chrome.* calls)~~ — **✅ all 3 resolved** |
| ~~`src/lib/theme/useTheme.js`~~ | ✅ All 3 issues resolved — §1.3 (console → logger), §5.2 (chrome.* → browser.*), §10 (module-level restoreTheme() removed) |
| ~~`src/sidepanel/features/settings-panel.js`~~ | ✅ All raw storage calls resolved — ~~§6 (bypasses ReminderPrefsRepository)~~: 4 reminder-pref calls moved to `state.reminderPrefs.*`; remaining 2 `storageWarnThresholdMB` calls moved to `state.storageTracker.getWarnThresholdMB()/setWarnThresholdMB()`; `browser` import removed — **resolved 2026-03-05** |
| `src/sidepanel/notification.js` | ~~§1.1 (console.log)~~, ~~§11 (magic `3000`)~~ — **✅ both resolved** |
| `src/sidepanel/controllers/tree-controller.js` | §1.3 (5 console calls) — **1 issue** |
| `src/lib/vendor/jszip-esm.js` + `jszip-esm.js` | §9 (test isolation) — **1 issue, blocks 61 tests** |
