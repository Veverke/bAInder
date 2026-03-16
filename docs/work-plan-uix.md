# UIX Improvement Work Plan

Generated: 2026-03-16  
Sorted by: Impact ↓ / Complexity ↑

---

## Tier 1 — Quick Wins (High Impact, Trivial Effort)

### 1. Visible Settings Entry Point
**Status:** ✅ Complete

**Problem:** The settings trigger is buried — no icon in the header, accessed via a hidden `#settingsPanelOpenBtn` or context menu. Users can't discover backup, clipboard format, or log-level settings.

**Solution:** Add a `⚙` gear icon button to the side-panel header toolbar that directly opens the settings slide-in panel.

**Files:** `src/sidepanel/sidepanel.html`, `src/sidepanel/sidepanel.css`

**Effort:** ~30 min (one button element + CSS alignment)

---

### 2. Horizontal-Scrollable Recent Rail
**Status:** ✅ Complete

**Problem:**
- The chip rail hides itself entirely when fewer than 3 chats have been saved (new users see nothing).
- Chips silently truncate when the panel is narrow instead of scrolling.

**Solution:**
- Show the rail at ≥1 chat (lower the threshold from 3 to 1).
- Apply `overflow-x: auto; scroll-snap-type: x mandatory;` so narrow panels scroll horizontally rather than truncating.

**Files:** `src/sidepanel/features/recent-rail.js`, `src/sidepanel/sidepanel.css`

**Effort:** ~1 hour

---

### 3. Tag Autocomplete on Save / Edit
**Status:** ✅ Complete

**Problem:** Tags are free-text, comma-separated, with no suggestion of existing tags. Misspelled or inconsistent tags silently split the filter index.

**Solution:** Wire a `<datalist>` (or lightweight custom dropdown) to the tag input on the save dialog and any inline-edit fields. Populate with tags already present in storage at dialog-open time.

**Files:** `src/sidepanel/chat-dialogs.js` (save dialog), `src/sidepanel/sidepanel.css`

**Effort:** ~2 hours

---

## Tier 2 — High Impact, Low–Medium Effort

### 4. Undo Toast for Destructive Operations
**Status:** ✅ Complete

**Problem:** Deleting a topic or chat is permanent with no in-UI safety net. The only safety net is the periodic backup reminder. This is the most common panic scenario.

**Solution:** After a delete (topic or chat), show a dismissible 6-second toast — "Topic deleted. [Undo]". Keep the deleted payload in a transient in-memory buffer; if the user clicks Undo, re-insert it before the toast expires. No persistence required — in-memory rollback only.

**Files:** `src/sidepanel/features/topic-context-menu.js`, `src/sidepanel/features/chat-context-menu.js`, `src/lib/toast.js` (new or extend existing)

**Effort:** ~3 hours

---

### 5. Chat Hover Preview (Tooltip Snippet)
**Status:** Not started

**Problem:** Clicking a chat opens a new tab just to check its content. This causes tab thrash for users browsing their library.

**Solution:** On hover over a chat list item (after a short delay, e.g. 400 ms), show a popover/tooltip rendering the first 2–3 turns in plain text (no full markdown needed). The chat payload is already loaded in the tree — no extra storage read required.

**Files:** `src/sidepanel/features/chat-list-item.js`, `src/sidepanel/sidepanel.css`

**Effort:** ~3–4 hours

---

### 6. Keyboard Shortcuts
**Status:** ✅ Complete

**Problem:** Power users with hundreds of chats rely on the keyboard, but the panel has no shortcuts beyond what the browser provides natively.

**Solution:**

| Shortcut | Action |
|---|---|
| `Ctrl/Cmd + K` | Focus the search bar |
| `Escape` | Clear search / close active dialog / deselect |
| `↑ / ↓` | Navigate tree items |
| `Enter` | Open selected chat |
| `Delete` | Delete selected chat / topic (with undo toast, see #4) |

The search bar already auto-focuses; this is wiring a global `keydown` listener in the side-panel entry point.

**Files:** `src/sidepanel/sidepanel.js`, `src/sidepanel/features/search-controller.js`

**Effort:** ~3 hours

---

## Tier 3 — High Impact, Medium Effort

### 7. First-Run / Empty-State Onboarding
**Status:** Not started

**Problem:** A brand-new install shows an empty tree, no guidance, and no save button anywhere — until the user independently navigates to an AI platform. Activation rate is directly harmed.

**Solution:** On first launch (detect via `chrome.storage.local` flag `onboardingComplete`), show a one-shot 3-step modal overlay:

1. "Navigate to ChatGPT, Claude, or another supported AI" (link buttons to each)
2. "A Save button will appear on the page — click it"
3. "Your chat lands here, organised by topic"

Dismiss automatically once the first chat is saved. Include a "Skip" link.

**Files:** `src/sidepanel/sidepanel.html`, `src/sidepanel/sidepanel.js`, `src/sidepanel/sidepanel.css` (new modal component)

**Effort:** ~4–6 hours

---

### ~~8. Dark Mode Quick Toggle in Header~~
**Status:** ~~Not started~~ — ❌ Rejected

> **Policy:** All theming (including dark mode) is exclusively managed via ThemeStudioSDK. No custom theme-toggling code will be added to the extension.

~~**Problem:** The `ThemeStudioSDK` and `data-theme` attribute are already wired up, but toggling dark mode requires navigating into settings. Users who use AI tools at night have no fast path.~~

~~**Solution:** Add a `☀ / 🌙` icon toggle next to the settings gear in the header. On click, toggle `data-theme="dark" / "light"` on `<html>` and persist the preference to `localStorage` (or `chrome.storage.local`). The CSS tokens already support both modes via media query fallback — only the manual override toggle is missing.~~

~~**Files:** `src/sidepanel/sidepanel.html`, `src/sidepanel/sidepanel.js`, `src/sidepanel/sidepanel.css`~~

~~**Effort:** ~2 hours~~

---

### 9. Inline Chat Preview Drawer (Split View)
**Status:** Not started

**Problem:** Every chat click opens a new tab, breaking the side-panel context. For 80% of reading use-cases (glancing at a saved conversation, copying a snippet), a full new tab is overkill.

**Solution:** Add a resizable slide-up drawer at the bottom of the side panel that renders a lightweight preview of the selected chat (markdown rendered, read-only — no annotations). Include a prominent "Open full reader ↗" link for the cases that need it. The drawer should be collapsible and remember its height.

**Implementation notes:**
- Reuse the existing markdown rendering pipeline from `src/lib/markdown.js`.
- No annotation, sticky-note, or ordinal-label features needed in the preview — keep it read-only.
- Drawer height stored in `chrome.storage.local` per-user preference.

**Files:** `src/sidepanel/sidepanel.html`, `src/sidepanel/sidepanel.css`, new `src/sidepanel/features/chat-preview-drawer.js`

**Effort:** ~8–12 hours

---

## Tier 4 — Medium Impact, Medium–High Effort

### 10. Tag Management Panel
**Status:** Not started

**Problem:** Tags are immutable after saving — no rename, no merge, no bulk-retag. As collections grow, tag drift (misspellings, synonyms) silently degrades the filter experience.

**Solution:** A "Manage Tags" view accessible from the filter drawer header or settings panel. UI: list of all tags with usage counts; actions: Rename (updates all matching chats), Merge (pick two tags → consolidate), Delete (strips tag from all chats). Confirmation dialog before bulk operations.

**Files:** New `src/sidepanel/features/tag-manager.js`, `src/sidepanel/sidepanel.html`, `src/sidepanel/sidepanel.css`

**Effort:** ~8–10 hours

---

### 11. Compare Result Persistence
**Status:** Not started

**Problem:** Closing the compare tab loses the GloVe semantic analysis. For recurring research workflows, this makes compare a one-shot throwaway rather than a reference tool.

**Solution:** When the compare page finishes analysis, serialise the result (unique-terms diff per chat, structural analysis summary, chat IDs, timestamp) into `chrome.storage.local`. Surface saved compare results in the side panel as a new "Comparisons" section or under a dedicated icon, viewable without re-running GloVe.

**Files:** `src/compare/compare.js`, `src/sidepanel/sidepanel.js`, `src/lib/storage.js`

**Effort:** ~6–8 hours

---

### 12. Floating Save Button — Drag to Reposition
**Status:** Not started

**Problem:** The injected Save button on AI pages has a fixed position that may overlap native platform UI (Claude's side panel, Gemini's input bar, Copilot's toolbar).

**Solution:** Make the button draggable. Persist the final `{x, y}` position per hostname in `chrome.storage.local` so each AI site remembers the user's preferred position independently.

**Files:** `src/content/content.js` (button injection), `src/content/content.css`

**Effort:** ~4–5 hours

---

## Tier 5 — Lower Priority / Architecture-Bound

### 13. Entity Panel Virtual Scrolling
**Status:** Not started

**Problem:** The tree view already applies virtual scrolling at 150 nodes. The Chat Entities panel has no equivalent. Users with 500+ chats and thousands of extracted entities will hit a performance cliff.

**Solution:** Mirror the tree's existing virtual-scroll implementation into the entity panel renderer.

**Files:** `src/sidepanel/features/entity-controller.js`, `src/sidepanel/features/entity-tree.js`

**Effort:** ~6–8 hours

---

### 14. Inline Reader in Side Panel (Full)
**Status:** Not started

**Problem:** The natural conclusion of #9 — eliminate the new-tab friction entirely by hosting the full reader (annotations, sticky notes, ordinal labels, scroll persistence) inside the side panel.

**Constraint:** Architecturally blocked by MV3 side-panel restrictions. Extension pages can't be hosted in cross-origin iframes easily; the reader module has deep DOM dependencies that assume a full top-level document.

**Possible path:** Expose reader content via `web_accessible_resources`, load in a sandboxed `<iframe>` inside the panel with `allow="same-origin"`, and post-message to bridge annotation events. Significant rearchitecting of reader module dependencies required.

**Files:** Most of `src/reader/`, `src/sidepanel/`, `manifest.json` (`web_accessible_resources`)

**Effort:** ~20–40 hours (exploratory spike recommended first)

---

## Summary Table

| # | Feature | Impact | Effort | Tier |
|---|---|---|---|---|
| 1 | Settings entry point (gear icon) | High | Trivial | 1 |
| 2 | Scrollable recent rail | High | Trivial | 1 |
| 3 | Tag autocomplete | High | Low | 1 |
| 4 | Undo toast (delete) | High | Low | 2 |
| 5 | Chat hover preview | High | Low | 2 |
| 6 | Keyboard shortcuts | High | Low | 2 |
| 7 | First-run onboarding | High | Medium | 3 |
| ~~8~~ | ~~Dark mode toggle~~ | ~~High~~ | ~~Low~~ | ~~3~~ — ❌ Rejected (ThemeStudioSDK only) |
| 9 | Inline preview drawer | High | Medium | 3 |
| 10 | Tag management panel | Medium | Medium | 4 |
| 11 | Compare result persistence | Medium | Medium | 4 |
| 12 | Drag-to-reposition save button | Medium | Medium | 4 |
| 13 | Entity panel virtual scrolling | Medium | Medium | 5 |
| 14 | Full inline reader in panel | High | Very High | 5 |
