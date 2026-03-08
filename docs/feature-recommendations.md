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
| C.22 | Reading progress persistence | Low | Moderate | ✅ Completed (March 4, 2026) |
| C.23 | Platform expansion: DeepSeek, Grok & Perplexity | Medium | Very High | Candidate |
| C.24 | Internal API-based extraction — platform-wide strategy (ChatGPT next, Perplexity after) | Low/platform | Moderate | Candidate |

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
  - DeepSeek: `https://chat.deepseek.com/` (no query param — open tab + inject via content script)
  - Grok: `https://grok.com/` (no stable query param — open tab + inject via content script)
  - Perplexity: `https://www.perplexity.ai/?q=<encoded>` (native query param support)
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

**Idea:** Side-by-side reader view for two or more saved chats answering the same (or similar) question, with structured analysis highlighting how different models responded.

**Value:** Researchers and power users who query multiple models need to compare outputs. A visual compare view without leaving the extension is a compelling capability.

**Detailed work plan:** see [Compare-Feature-Work-Plan.md](Compare-Feature-Work-Plan.md).

**Effort:** Medium (phased). **Differentiator:** Very High — unique in the extension market.

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

## C.22 — Reading Progress Persistence ✅ Completed

**Idea:** Remember the scroll position per chat across sessions in the reader view, so returning to a long technical chat resumes where you left off.

**Value:** Long code-heavy chats (debugging sessions, architecture discussions) are frequently revisited. The current behaviour resets to the top on every open — subtle but noticeably frustrating.

**Status:** Completed March 4, 2026. Implemented: three exported pure helpers in `reader.js` — `getScrollPositions()`, `saveScrollPosition(chatId, scrollY)` (LRU-evicting at 100 entries), and `restoreScrollPosition(chatId)`; `setupScrollFeatures(chatId)` now debounce-saves (500 ms) on scroll; `init()` calls `restoreScrollPosition` immediately after `renderChat`. 11 new tests (3 getScrollPositions + 5 saveScrollPosition + 3 restoreScrollPosition).

**Effort:** Low. **Differentiator:** Moderate — small touch, immediately noticeable quality improvement.

---

## C.23 — Platform Expansion: DeepSeek, Grok & Perplexity

**Idea:** Extend bAInder's content-script coverage to three fast-growing AI platforms — **DeepSeek**, **Grok** (xAI), and **Perplexity** — so users can save, organise, and re-fire chats from these interfaces with the same one-click experience they have on ChatGPT and Claude.

**Value:** These platforms now account for a significant share of power-user AI traffic. Users who run queries across multiple models lose their Grok and Perplexity history the moment they close the tab. Adding native support makes bAInder the single archive for the entire AI ecosystem, not just the incumbents.

**Implementation sketch (per platform):**

### DeepSeek (`chat.deepseek.com`)
- Content script selects `.message-content` / `.user-message` blocks (similar structure to ChatGPT).
- Platform badge: `deepseek` — teal colour token.
- Supports DeepSeek-R1 chain-of-thought blocks (`<think>` tags) — collapse by default in the reader, expandable inline.
- No `?q=` deep-link: prompt injection via content script after tab open (same pattern as Gemini).

### Grok (`grok.com`)
- Content script targets Grok's React-rendered message list (class selectors require monitoring for updates given xAI's active release cadence).
- Platform badge: `grok` — graphite/black colour token matching xAI branding.
- Capture "Show reasoning" / think-mode content as a collapsible aside in the saved entry.
- No stable `?q=` deep-link: open tab + inject prompt via content script.

### Perplexity (`perplexity.ai`)
- Content script extracts query (user turn) and answer (assistant turn) blocks; also captures source citations as a structured `sources[]` array on the `ChatEntry`.
- Render citations as a collapsible "Sources" footer in the reader view (linked list of URLs + titles).
- Platform badge: `perplexity` — teal/indigo colour token.
- Native `?q=<encoded>` deep-link — simplest cross-platform re-fire of the three.

**Shared work:**
- Add `'deepseek' | 'grok' | 'perplexity'` to the `Platform` union type in `chat-entry.js`.
- Register three new manifest `content_scripts` entries with appropriate `matches` patterns.
- Extend the platform icon/badge map in the UI (`platform-badge.js`).
- Update C.16 "Launch on…" dropdown to include all three (see C.16 implementation notes above).
- Extend the JSONL export (C.20) to correctly map Perplexity's `assistant` turns (which may include citation markup).

**Risks:**
- Grok's DOM is under active development — class names may shift with xAI product updates; use MutationObserver-based selectors.
- Perplexity's answer blocks mix markdown + inline citations — stripping citation markers for clean export needs careful regex.

**Effort:** Medium (each platform is roughly the same scope as a new ChatGPT content script; ~1–2 days per platform). **Differentiator:** Very High — broadens addressable user base significantly at a time when DeepSeek and Perplexity usage is surging.

---

## C.24 — Internal API-Based Extraction (Replace DOM Scraping — Platform-Wide Strategy)

**Idea:** Migrate extractors away from DOM scraping toward each platform's internal web API — the same approach already proven with Claude (March 2026). ChatGPT is the next priority, with Perplexity a strong secondary candidate.

**Background:** Every major AI chat site is a React SPA that calls its own backend API. These endpoints are not public/documented APIs — they are the same endpoints the site's own frontend uses. They return clean JSON and are accessible from a content script using the user's existing browser session (`credentials: 'include'`). **No API key, no cost, no additional subscription required.**

This is fundamentally different from paid generation APIs (e.g. `api.anthropic.com`, `api.openai.com`) — those are for building AI products and are billed per token. Internal web APIs are free because the user is already authenticated and the server is just serving their own data.

| Platform | Internal API | Notes |
|---|---|---|
| **Claude** | ✅ Implemented | `/api/organizations/:orgId/chat_conversations/:id` — clean JSON, stable |
| **ChatGPT** | Available | `/backend-api/conversation/{id}` — clean JSON, `mapping` tree |
| **Perplexity** | Available | Accessible JSON endpoints, reasonably stable |
| **Gemini** | Available but complex | Uses protobuf/gRPC-style requests — harder to parse reliably |
| **Grok / DeepSeek** | Unknown | Requires investigation |

**ChatGPT — implementation sketch:**
- Replace `extractChatGPT(doc)` in `content.js` and `extractors/chatgpt.js` with async `extractChatGPTViaApi()`.
- Parse `conversationId` from `window.location.pathname` (`/c/[uuid]`).
- Fetch `https://chatgpt.com/backend-api/conversation/${conversationId}` with `credentials: 'include'`.
- Walk the `mapping` tree from `current_node` back through `parent` pointers (same pattern as Claude branch traversal) to build the active branch in chronological order.
- Map `author.role === 'user'` → `'user'`, `'assistant'` → `'assistant'`; skip `system` and `tool` nodes.
- Concatenate `content.parts[]` (filter to `string` type; skip image/file parts).
- Make the `EXTRACT_CHAT` handler for ChatGPT async (same `return true` pattern already applied for Claude).

**Value:** The API approach eliminates DOM fragility: content is always complete (no lazy-loading issues), edited message branches are handled via the mapping tree, and streaming-in-progress responses aren't truncated. ChatGPT's DOM has already changed multiple times — the current extractor carries two fallback selector strategies.

**Risks:** Platforms could add auth checks or rate-limit internal endpoints; DOM scraping should be kept as a silent fallback. Internal endpoints are undocumented and can change without notice, though in practice they tend to be more stable than rendered DOM.

**Effort:** Low per platform — identical pattern to the Claude fix, already proven. **Differentiator:** Moderate — primarily a reliability/maintenance improvement, but directly reduces future maintenance burden for all C.23 platform expansions.

---

*Document generated: March 3, 2026 — last updated: March 5, 2026*
