# bAInder — Additional Feature Recommendations

> Generated: March 3, 2026  
> Source: AI-assisted brainstorming session — features not already covered by the roadmap or design specs.  
> These are catalogued as **C.13 – C.22** in Appendix C of `DESIGN_SPECS.md` and `roadmap.html`.

---

## Summary Table

| Ref | Feature | Effort | Differentiator | Status |
|-----|---------|--------|----------------|--------|
| C.13 | Prompt Library | Medium | High | Candidate |
| C.14 | Per-message / Q&A clipping | Low | High | ✅ Completed (context-menu save selection) |
| C.15 | Chat star rating (1–5) | Low | Moderate | ✅ Completed (March 4, 2026) |
| C.16 | Cross-platform prompt launch | Medium | Very High | Candidate |
| C.17 | Multi-chat assembly / digest export | Medium | High | ✅ Completed |
| C.18 | Model comparison (side-by-side diff view) | Medium | High | Candidate |
| C.19 | Review-by date / expiry flag | Low | Moderate | ✅ Completed (March 4, 2026) |
| C.20 | JSONL fine-tuning export | Low–Medium | Very High (unique) | Candidate |
| C.21 | Direct Obsidian push (Local REST API) | Medium | High | Candidate |
| C.22 | Reading progress persistence | Low | Moderate | Candidate |

---

## C.13 — Prompt Library

**Idea:** Automatically extract the user-turn prompts from every saved chat and surface them in a dedicated "Prompt Library" panel. One-click to copy or re-fire any saved prompt on any supported AI platform.

**Value:** Power users re-use prompts constantly. This elevates bAInder from a passive archive into an active productivity tool — the closest analogy is a personal snippet manager, but for AI prompts.

**Implementation sketch:**
- On save, extract all user-turn messages into a `prompts[]` array stored alongside the `ChatEntry`.
- Add a "Prompt Library" view (or collapsible section) in the side panel, listing prompts with their source topic, date, and platform badge.
- "Copy" button copies the raw text; "Re-fire" opens the appropriate platform URL with the prompt pre-filled in the URL query param (where supported — ChatGPT and Claude both accept `?q=` or similar deep links).

**Effort:** Medium. **Differentiator:** High — no mainstream extension does this today.

---

## C.14 — Per-message / Q&A Clipping ✅ Completed

**Idea:** Save just a specific user + assistant exchange from a long chat as a standalone entry, rather than the full conversation.

**Status:** Already implemented via the context-menu **"Save selection to bAInder"** option (Stage 6, C context-menu). Users can manually select any text on the page and save it as a clipping.

---

## C.15 — Chat Star Rating (1–5) ✅ Completed

**Idea:** A simple 1–5 star rating on any saved chat. Filter and sort by rating in search results and tree view.

**Value:** Lets users surface gold-standard responses without digging through topics. Particularly useful for chats containing an unusually good explanation, a reusable code snippet, or a solved debugging session.

**Implementation sketch:**
- Add `rating: number | null` (1–5) to the `ChatEntry` model.
- Render a compact star widget (5 × `★` / `☆`) in the chat context menu and in the reader header.
- In search, add a "min rating" filter chip; in tree view, show a small star badge on rated chats.
- Sort option: "Best rated" — sort own-topic chats by descending rating.

**Status:** Completed March 4, 2026. Implemented: `rating` field on `ChatEntry`; star widget in chat context menu (inline, no dialog, toggle-to-clear); 5-star interactive widget in reader header; amber `★★★` badge on tree items; min-rating filter pills in search filter bar; rating display in search result cards; 14 new tests (7 search-utils + 7 reader).

**Effort:** Low. **Differentiator:** Moderate.

---

## C.16 — Cross-Platform Prompt Launch

**Idea:** From any saved chat, a button to open the **same first user prompt** on a *different* AI platform (e.g. a saved ChatGPT chat → one-click opens Claude with the same question pre-filled).

**Value:** Extremely useful for model comparison workflows without manually copying and pasting. Positions bAInder as the hub for multi-model usage rather than just single-platform archiving.

**Implementation sketch:**
- Extract `firstUserPrompt` from `ChatEntry` at save time (already available in the extracted messages array).
- In the reader view header and/or chat context menu, render a "Launch on…" dropdown with available platforms.
- Encode the prompt into platform-specific deep-link URLs:
  - ChatGPT: `https://chat.openai.com/?q=<encoded>`
  - Claude: `https://claude.ai/new?q=<encoded>`
  - Gemini: `https://gemini.google.com/app?hl=en` (no direct query param yet — open tab + inject via content script)
  - Copilot: `https://copilot.microsoft.com/?q=<encoded>`
- Fall back to clipboard copy + open tab for platforms without query-param support.

**Effort:** Medium. **Differentiator:** Very High — genuinely unique feature in the space.

---

## C.17 — Multi-Chat Assembly / Digest Export ✅ Completed

**Idea:** Select multiple chats (across different topics) and merge them into a single exported document, with a heading per chat, for research summaries or handoff documents.

**Status:** Implemented. A **☑ Select chats** toolbar button activates multi-select mode; checkboxes appear on every chat item in the tree. A sticky **selection action bar** at the bottom shows the count and enables **Export Digest** once ≥ 2 chats are selected.

**What was built:**
- `TreeRenderer` gains `multiSelectMode`, `selectedChatIds`, `enterMultiSelectMode()`, `exitMultiSelectMode()`, `toggleChatSelection()`, `getSelectedChats()`, `clearSelection()`, and `onSelectionChange` callback. Virtual scrolling is bypassed while multi-select is active.
- `buildDigestMarkdown()` and `buildDigestHtml()` in `export-engine.js` assemble all selected chats under `## <title>` headings with an optional table of contents.
- `ExportDialog.showExportDigest()` presents Format (Markdown / HTML / PDF), Style, and "Include table of contents" options.
- `sidepanel.html` — new `#multiSelectToggleBtn` in the header toolbar and a `#selectionBar` sticky action bar.
- `sidepanel.js` — `handleMultiSelectToggle`, `exitMultiSelectMode`, `handleSelectionChange`, `updateSelectionBar`, `handleExportDigest` functions wire all the pieces together; full chat content is loaded on demand at export time.
- `sidepanel.css` — styles for `.tree-chat-checkbox`, `.tree-chat-item--selected`, `.selection-bar` and related elements.

---

## C.18 — Model Comparison View (Side-by-Side Diff)

**Idea:** Side-by-side reader view for two saved chats answering the same (or similar) question, with structural diff highlighting to compare how different models responded.

**Value:** Researchers and power users who query multiple models need to compare outputs. A visual diff view without leaving the extension is a compelling capability.

**Implementation sketch:**
- "Compare with…" option in the chat context menu → opens a topic/chat picker → opens a split-pane reader with both chats rendered side by side.
- Use a lightweight diff library (e.g. `diff-match-patch`, ~50 KB) to highlight added/removed words between the two assistant responses.
- No NLP required — pure string diff is sufficient for the MVP version.
- Keyboard: `Tab` / `Shift+Tab` to jump between highlighted delta regions.

**Effort:** Medium. **Differentiator:** High — unique in the extension market.

---

## C.19 — Review-by Date / Expiry Flag ✅ Completed

**Idea:** Mark any saved chat as time-sensitive with an optional review date. A badge or banner appears when the date is past, signalling the information may be stale.

**Value:** AI chats about library versions, API docs, or current events go stale quickly. An expiry system turns bAInder into a lightweight knowledge maintenance tool rather than a write-only archive.

**Implementation sketch:**
- Add `reviewDate: string | null` (ISO date) and `flaggedAsStale: boolean` to `ChatEntry`.
- "Set review date" option in chat context menu → date picker dialog.
- Background service worker checks on extension startup and once daily; sets `flaggedAsStale = true` for overdue entries.
- In tree view: stale chats show a `⚠` badge. In reader: a dismissible banner at the top.
- "Mark as reviewed" / "Update review date" clears the flag.

**Status:** Completed March 4, 2026. Implemented: `reviewDate` and `flaggedAsStale` fields on `ChatEntry`; `src/background/stale-check.js` module with `checkStaleChats()` (daily alarm + startup check); "Set review date" date-picker item in the chat context menu (clears stale flag on save); `⚠` badge on stale tree items; dismissible stale banner in reader header with "Mark as reviewed" button that persists the cleared flag. 19 new tests added.

**Effort:** Low. **Differentiator:** Moderate.

---

## C.20 — JSONL Fine-Tuning Export

**Idea:** Export any topic branch (or selected chats) as an **OpenAI-format JSONL file** — each line one `{"messages": [{"role":"user", ...}, {"role":"assistant", ...}]}` object.

**Value:** Users building personal fine-tuning datasets or RAG pipelines from their curated conversations get a one-click path to training-ready data. No other AI chat manager offers this today — it is a strong differentiator for the developer/researcher segment.

**Implementation sketch:**
- Add `JSONL (Fine-tuning)` as an export format option in the existing export dialog (alongside MD, HTML, PDF, ZIP).
- `export-engine.js`: serialize each `ChatEntry` messages array into OpenAI chat completion format; write one JSON object per line.
- Include only `user` + `assistant` roles; strip system turns added by the platform.
- System message (first line) is optional and configurable: e.g. `"You are a helpful assistant."` or left empty.
- Single-chat export → one `.jsonl` file; multi-chat / topic export → one file per topic or a merged file (user choice).

**Effort:** Low–Medium. **Differentiator:** Very High — unique in the market for a consumer extension.

---

## C.21 — Direct Obsidian Push (Local REST API)

**Idea:** Complement the existing Obsidian ZIP export (C.2) with a **live push** to a running Obsidian vault via the [Obsidian Local REST API plugin](https://github.com/coddingtonbear/obsidian-local-rest-api), creating or updating notes without any file management.

**Value:** Obsidian power users who maintain a second brain would get a frictionless one-click sync rather than a download-unzip-move workflow. Pairs naturally with C.2 as the "advanced" tier.

**Implementation sketch:**
- Settings page: "Obsidian integration" section — REST API base URL (`http://localhost:27123`) + API key (from Obsidian plugin settings). Stored in `chrome.storage.local`.
- `export-engine.js`: `pushToObsidian(chatEntry, options)` — `PUT /vault/<topic-path>/<chat-title>.md` using the existing Markdown serialiser.
- Chat context menu: "Send to Obsidian" (only shown when integration is configured).
- Bulk push: "Push topic to Obsidian" from topic context menu — iterates all chats in the branch.
- Status toast: "Pushed to Obsidian: `Research/AI Chats/Chat Title.md`".
- Graceful failure if Obsidian is not running — falls back to suggesting the ZIP export.

**Effort:** Medium. **Differentiator:** High — targets the large Obsidian user overlap in the developer/knowledge-worker demographic.

---

## C.22 — Reading Progress Persistence

**Idea:** Remember the scroll position per chat across sessions in the reader view, so returning to a long technical chat resumes where you left off.

**Value:** Long code-heavy chats (debugging sessions, architecture discussions) are frequently revisited. The current behaviour resets to the top on every open — subtle but noticeably frustrating.

**Implementation sketch:**
- On reader `scroll` event (debounced 500 ms), write `scrollPositions[chatId] = scrollY` to `localStorage`.
- On reader load, after content renders, `window.scrollTo(0, scrollPositions[chatId] ?? 0)`.
- Cap stored entries to the 100 most recent chat IDs to avoid unbounded `localStorage` growth (LRU eviction).
- "Return to top" button already exists — behaviour unchanged.

**Effort:** Low. **Differentiator:** Moderate — small touch, immediately noticeable quality improvement.

---

*Document generated: March 3, 2026*
