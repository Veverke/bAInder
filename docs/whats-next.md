# bAInder — Additional Feature Recommendations

---

> Generated: March 3, 2026  
> Source: AI-assisted brainstorming session — features not already covered by the roadmap or design specs.  
> These are catalogued as **C.13 – C.32** in Appendix C of `DESIGN_SPECS.md` and `roadmap.html`.  
> Last updated: March 14, 2026 — sorted by impact/complexity ROI; completed features moved to end. C.18 completed March 13, 2026. C.20 completed March 12, 2026. C.26 completed March 12, 2026. C.28 completed March 12, 2026. C.13 and C.13.1 superseded by Chat Entities framework March 14, 2026. C.33–C.37 added March 14, 2026.

---

## Candidates — Sorted by Impact and Complexity

Items are ordered by return on investment: highest differentiator with lowest effort first. Within the same effort band, higher differentiator ranks first.

| Ref | Feature | Effort | Differentiator |
|-----|---------|--------|----------------|
| C.24 | Internal API-based extraction — platform-wide strategy | Low/platform | Moderate |
| C.16 | Cross-platform prompt launch *(Re-fire action on Prompt entities — see Chat Entities)* | Medium | Very High |
| C.23 | Platform expansion: DeepSeek, Grok & Perplexity | Medium | Very High |
| C.25 | Chat hover overlay (tree preview) | Medium | High |
| C.21 | Direct Obsidian push (Local REST API) | Medium | High |
| — | **Chat Entities Manager — shared infrastructure** | Low–Medium | — |
| C.13 · C.33 · C.37 | Chat Entities · **Group A** — Prompts, Tables, Citations & Sources | Low–Medium | High |
| C.31 · C.34 | Chat Entities · **Group B** — Code Snippets, Diagrams | Medium | High |
| C.36 · C.30 | Chat Entities · **Group C** — Tool-Use Traces, Attachments | Medium | High |
| C.29 · C.32 | Chat Entities · **Group D** — Images, Audio recordings | Medium–High | High |
| C.35 | Chat Entities · **Group E** — Artifacts & Canvas | Medium–High | Very High |
| C.27 | Source auditing (citation provenance) | Medium–High | Very High |

---

## Tier 1 — Best ROI: Low Effort, Strong Impact

> Low complexity, strong return — these should ship first.

---

## C.26 — Copy Chat Content(s) to Clipboard

**Idea:** Allow users to copy the full conversation text of one or more saved chats directly to the clipboard — from the side panel tree, from the reader view, or via the multi-select action bar.

**Value:** The most common next step after reviewing a chat is pasting it somewhere else (a document, email, issue tracker, etc.). A one-click copy removes friction for single chats and enables batch paste for digest workflows without going through a full export.

**Implementation sketch:**
- **Single chat (tree item):** Right-clicking a chat item in the side panel tree exposes a **"Copy to clipboard"** option in the item's context menu. Serialise the `ChatEntry` messages into plain-text (or Markdown — user-selectable in Settings) and call `navigator.clipboard.writeText()`.
- **Folder / topic node (tree item):** Right-clicking a topic/folder node in the side panel tree exposes **"Copy all chats to clipboard"**. Load all `ChatEntry` records under that node, serialise and concatenate them (separated by a horizontal rule with the chat title as a heading), then write to clipboard. Subject to the same large-payload guard as bulk copy below.
- **Reader view:** Expose a **"Copy"** icon button in the reader view header (alongside the existing export/action buttons) so users can copy the currently open chat without returning to the side panel.
- **Multi-select (bulk):** When ≥ 2 chats are checked in multi-select mode, add a **"Copy all"** button to the `#selectionBar` alongside the existing "Export Digest" button. Concatenate each chat's serialised text separated by a horizontal rule.
- **Edge cases:**
  - *Large payload:* Before copying, estimate the combined character count. If it exceeds ~1 MB (browser clipboard practical limit), show a warning toast: *"Content too large to copy — use Export Digest instead."* and abort the copy.
  - *Many chats selected:* Add a soft warning at ≥ 20 chats selected: *"Copying N chats — this may be slow."*
  - *Clipboard permission denied:* Fall back to a `<textarea>` pre-selected + `document.execCommand('copy')` with a user-visible prompt.
- Format toggle in Settings: `Plain text` (default) / `Markdown` — so the clipboard output matches the user's intended destination.

**Effort:** Low–Medium. **Differentiator:** High — eliminates the most common manual step after archiving.

---

## C.28 — Enumerate Prompts & Responses in Chat Header ✅ COMPLETED March 12, 2026

**Idea:** In the saved chat header (and the hover overlay introduced in C.25), display the total count of user prompts and assistant responses. Each prompt and each response within the chat view itself is additionally labelled with its own sequential number — prompts numbered independently (P1, P2, …) and responses numbered independently (R1, R2, …) — making it trivial to cross-reference hover stats with actual content.

**Value:** Long chats with many back-and-forth turns become navigable at a glance. A user who sees "Prompts: 8 | Responses: 8" in the hover overlay can immediately jump to P5/R5 without mentally counting.

**Implementation (as built):**
- **Header/overlay counts:** `countTurns(contentEl)` counts `.chat-turn--user/.chat-turn--assistant` (legacy wrapped format) with a fallback for `🙋`/`🤖` paragraph prefixes (current emoji serialiser format). Counts are displayed in `#meta-responses` in the reader header.
- **Per-message labels:** `addOrdinalLabels(contentEl)` prepends a `<span class="msg-ordinal">` to each user/assistant turn before the emoji role indicator:
  - User turns: `P1`, `P2`, … — prepended to the `<p>🙋 …</p>` element
  - Assistant turns: `R1`, `R2`, … — prepended to the `<p>🤖 …</p>` element
  - Legacy wrapped-format chats: labels are prepended inside `.chat-turn__role`
- Labels are styled as bold pill badges (weight 800, `--primary` colour on a translucent background) so they are clearly visible without cluttering the content.
- **Deep-link anchor:** Each labelled element is assigned `id="p1"` / `id="r3"` (etc.), matching the prompts-overlay `href` anchors — enabling direct in-page navigation.
- **Dual-format support:** Both the current emoji format and the legacy `### User` / `### Assistant` heading format are handled; the function auto-detects which is in use.
- Settings toggle: "Show message ordinals" (default: on) in the Reader settings section — `body.ordinals-hidden .msg-ordinal { display: none }` hides all labels when toggled off.

**Effort:** Low. **Differentiator:** Moderate — a small but meaningful navigability improvement for power users working with long research chats.

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

## Tier 2 — High Value, Medium Effort

> Core product differentiators worth sustained investment. All are "Medium" effort; ordered by differentiator strength, then strategic sequencing.

---

## C.18 — Model Comparison View (Side-by-Side Diff) ✅ COMPLETED March 13, 2026

**Idea:** Side-by-side reader view for two or more saved chats answering the same (or similar) question, with structured analysis highlighting how different models responded.

**Value:** Researchers and power users who query multiple models need to compare outputs. A visual compare view without leaving the extension is a compelling capability.

**Detailed work plan:** see [Compare-Feature-Work-Plan.md](Compare-Feature-Work-Plan.md).

**Effort:** Medium (phased). **Differentiator:** Very High — unique in the extension market.

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

## C.25 — Chat Hover Overlay (Tree Preview)

**Idea:**
When hovering over a chat in the saved chat tree, show an overlay containing:
  1. Size in KBs
  2. Message summary in the format: `Messages: N | Prompts: M/N | Responses: K/N` (where M + K = N)
  3. Code Snippets: count per coding language/script (e.g., `Python: 3, JavaScript: 2`)

**Value:**
Gives users instant insight into chat content and code density without opening each chat.

**Effort:** Medium. **Differentiator:** High — advanced tree navigation with granular content preview.

---

## C.13 — Prompt Library ⛔ SUPERSEDED

**Status:** Superseded March 14, 2026 by the **Chat Entities** framework. Prompts are now a first-class entity type extracted at save time and browsed through the **Chat Entities** tab (Group A). The Re-fire capability planned here is implemented as the **Re-fire** action on Prompt entity cards, using the platform URL logic from C.16.

---

### C.13.1 — Prompt Manager (Tabbed Tree View) ⛔ SUPERSEDED

**Status:** Superseded March 14, 2026. The two-tab side panel model (Chat Sessions / Chat Entities) with a shared entity tree renderer replaces the ad-hoc tabbed view described here. See **Chat Entities Manager — Unified Work Plan**.

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

## Chat Entities Manager — Unified Work Plan

**Covers:** C.13 · C.29 · C.30 · C.31 · C.32 · C.33 · C.34 · C.35 · C.36 · C.37

**Idea:** Extend bAInder's save pipeline to extract every distinct entity a chat can contain — both user-authored (prompts) and assistant-generated (code snippets, tables, diagrams, images, etc.) — and surface them through a unified **Chat Entities** tab in the side panel.

The side panel becomes a two-tab window:
- **Tab 1 — Chat Sessions:** the existing topic/chat tree, unchanged.
- **Tab 2 — Chat Entities:** a new tree view where all extracted entities across all saved chats are browsable, searchable, and actionable.

All ten entity types share a single codebase for extraction, storage, tree rendering, and reader navigation. Each type contributes only its extractor logic and its item card renderer. This prevents ten near-identical silos and makes adding a future entity type trivial. C.13 (Prompt Library) and C.13.1 (Prompt Manager) are fully superseded by this framework.

### Shared Infrastructure (prerequisite for all groups)

Build this once before starting any group:

- **`ChatEntity` base type** — `{ id: string, type: string, messageIndex: number, chatId: string, role: 'user'|'assistant' }`. All concrete entity types extend this.
- **`ChatEntry` arrays** — optional fields: `prompts[]`, `tables[]`, `images[]`, `attachments[]`, `audioRecordings[]`, `codeSnippets[]`, `diagrams[]`, `artifacts[]`, `toolCalls[]`, `citations[]`. Absent arrays are omitted — fully backward-compatible with existing saved chats.
- **`extractChatEntities(messages, doc)`** — called by the save handler; dispatches to each registered per-type extractor and returns the populated arrays. Extractors are registered via a simple map; adding a new type requires no changes to the pipeline.
- **`ChatEntityTree`** — generic renderer with two grouping modes (toggle in the tab header):
  - **By Type** (default): `Entity type → Topic → Chat → item cards` — the primary retrieval workflow ("show me all my Python snippets").
  - **By Topic**: `Topic → Chat → [type-badged mixed entity cards]` — mirrors the Chat Sessions tree.
  - Reuses `VirtualScroll` from the existing tree renderer for large lists.
- **Two-tab side panel host** — tab bar at the top of the side panel: "Chat Sessions" | "Chat Entities". The existing panel content moves wholesale into Tab 1; Tab 2 hosts the entity tree.
- **Search context toggle** — the search bar gains a **Chats / Entities** toggle. In Chats mode, behaviour is unchanged. In Entities mode, the query runs against entity-specific indexes (code text, table cell values, citation URLs/titles, prompt text, etc.) and the filter chips switch to entity-type checkboxes (Prompts, Tables, Code, Diagrams, Citations, Tool Calls, Attachments, Images, Audio, Artifacts). Entity-type chips are hidden in Chats mode.
- **`openChatAtMessage(chatId, messageIndex)`** — shared navigation helper; opens the reader and scrolls to the correct message anchor. Used identically by all entity types.

---

### Group A — Text entities · easiest (Low–Medium effort)

Pure text extraction; no binary data, no rendering libraries, no session-scoped URLs. Highest ROI relative to effort — implement first.

#### C.13 — Prompts
- Extract all user-turn messages at save time.
- Store `prompts[]` on `ChatEntry`: `{ id, text, wordCount, messageIndex }`.
- Tree: type → topic → chat → prompt cards. Card: truncated first line, word count, platform badge.
- Per-card: **Copy** copies raw text; **Re-fire** opens the appropriate platform with the prompt pre-filled (C.16 platform URL logic: `?q=` param for ChatGPT/Claude/Perplexity; open tab + content-script injection for Gemini/Grok/DeepSeek). Click → reader at `#p<N>` anchor.
- Search: full-text across prompt content.

#### C.37 — Citations & Sources
- Scan assistant messages for citation blocks at save time: Perplexity footnote drawer, Copilot `<citation-block>`, Gemini Sources panel, ChatGPT browse-mode `mapping` annotations.
- Store `citations[]` on `ChatEntry`: `{ id, url, title, snippet, number, messageIndex }`.
- Tree: type → topic → chat → source list (favicon + domain + snippet preview). Click → opens URL in new tab.
- "All sources" flat view deduplicates the same URL across chats with back-references to originating chats.
- Export: BibTeX / Markdown list / plain URL list. Search: by domain, title keyword, snippet text.
- *(The `citations[]` array also serves as the data source for C.27's reader-level provenance view.)*

#### C.33 — Tables
- Parse Markdown tables from assistant messages at save time: detect `| … |` rows + `|---|` separator row; capture headers + data rows.
- Store `tables[]` on `ChatEntry`: `{ id, headers: string[], rows: string[][], rowCount, messageIndex }`.
- Tree: type → topic → chat → table preview cards (header + first 2 data rows; expand for full table).
- Per-card: **Copy as Markdown**, **Export as CSV** (RFC 4180). Click → reader at `#r<N>`. Search: by header or cell text.

---

### Group B — Code & structured text (Medium effort)

Text extraction with a rendering step; no binary storage. Requires a bundled diagram library for C.34 but no network calls.

#### C.31 — Code Snippets
- Extract fenced ` ```lang … ``` ` blocks from assistant messages at save time.
- Store `codeSnippets[]` on `ChatEntry`: `{ id, language, code, lineCount, messageIndex }`.
- Tree: type → topic → chat → snippet cards. Secondary grouping by language available via toggle. Card: language badge, first 3 lines, line count, **Copy** button.
- Full-text search within code. Export: selected snippets → single `.md` or `.zip` of language-named files.

#### C.34 — Diagrams
- Extract fenced ` ```mermaid … ``` ` blocks and platform-rendered `<svg>` elements at save time.
- For Mermaid: render source → SVG at save time using bundled `mermaid` lib (no network call).
- Store `diagrams[]` on `ChatEntry`: `{ id, source, diagramType, thumbnailSvg, messageIndex }`.
- Tree: type → topic → chat → inline SVG thumbnails. Per-card: **Copy source**, **Download SVG**. Filter: by type (flowchart / sequence / ER / Gantt / other).

---

### Group C — API-sourced metadata (Medium effort)

Structured data from the platform's internal API or DOM. Metadata-only pointers; no binary content stored.

#### C.36 — Tool-Use Traces
- Detect tool invocations at save time: ChatGPT `tool_call` mapping nodes, Claude `tool_use`/`tool_result` blocks, Perplexity search query + result DOM.
- Store `toolCalls[]` on `ChatEntry`: `{ id, tool, input, output (≤ 10 KB), durationMs, messageIndex }`.
- Tree: type → topic → chat → tool call list with type badge (`web_search` / `code_interpreter` / `function` / `browser`). Expand: full input + output + the assistant message that followed. Filter by tool type; full-text search.

#### C.30 — Attachments
- Scan messages for attachment metadata at save time: filename, MIME type, size, `messageIndex`.
- Store `attachments[]` on `ChatEntry`: `{ id, filename, mimeType, sizeBytes, messageIndex, platform }`.
- Tree: type → topic → chat → attachment list with file-type icon + size badge. Click → reader at `#r<N>`.
- **Note:** metadata pointer only — bAInder does not store the binary. Label: *"Original file on [Platform]"*. Filter/sort: by filetype, date, size; search by filename.

---

### Group D — Binary / visual assets (Medium–High effort)

Require capturing and storing binary content as data URIs. Implement large-payload guards and handle session-scoped blob URLs.

#### C.29 — Images
- Scan the rendered DOM for `<img>` tags, inline data-URI blobs, and image attachments at save time.
- Generate a ≤ 400 px thumbnail at save time. Full image stored only if ≤ 5 MB; otherwise thumbnail only + link to reader.
- Store `images[]` on `ChatEntry`: `{ id, src, mimeType, altText, messageIndex, thumbnailDataUri }`.
- Tree: type → topic → chat → thumbnail grid. Filter: by topic, platform, image type.

#### C.32 — Audio
- Detect `<audio>` elements and blob URLs at save time; immediately `fetch(blobUrl) → arrayBuffer() → base64 data URI` before the tab closes. Cap at 10 MB; show *"Audio not saved — original page required"* if unavailable or over limit.
- Store `audioRecordings[]` on `ChatEntry`: `{ id, durationSeconds, mimeType, src, transcript, messageIndex }`.
- Tree: type → topic → chat → recording list with duration badges. Per-entry: inline `<audio>` player, expandable transcript.
- Filter: by platform, date, duration; "transcripts only" toggle.

---

### Group E — Complex rendering · hardest (Medium–High effort)

Requires sandboxed iframe preview, screenshot capture, and deep platform-specific DOM/API detection. Build last.

#### C.35 — Artifacts & Canvas
- Detect at save time: Claude `.artifact-container` / `[data-artifact-type]`, ChatGPT Canvas sidebar. Capture `type` (`html`|`react`|`svg`|`text`), `title`, full source, and screenshot thumbnail (via `html2canvas` or platform's own preview).
- Store `artifacts[]` on `ChatEntry`: `{ id, type, title, source, mimeType, screenshotDataUri, messageIndex }`.
- Tree: type → topic → chat → artifact cards (title + type badge + screenshot thumbnail).
- Click → opens **sandboxed preview panel** (`<iframe sandbox="allow-scripts">`) rendering the artifact from stored source. No network access inside sandbox.
- Per-card: **Copy source**, **Download** (`.html` / `.jsx` / `.svg`).

---

### Effort summary

| Group | Entity types | Effort | Order |
|-------|-------------|--------|-------|
| Shared infra | (all types) | Low–Medium | 0 — prerequisite |
| A — Text | C.13 Prompts, C.37 Citations, C.33 Tables | Low–Medium | 1st |
| B — Code | C.31 Snippets, C.34 Diagrams | Medium | 2nd |
| C — Metadata | C.36 Tool Traces, C.30 Attachments | Medium | 3rd |
| D — Binary | C.29 Images, C.32 Audio | Medium–High | 4th |
| E — Rendering | C.35 Artifacts & Canvas | Medium–High | 5th |

---

## Tier 3 — Ambitious Long-Term

> High strategic value but significant complexity — plan carefully before committing.

---

## C.27 — Source Auditing (Citation Provenance)

**Idea:** When a saved chat contains citations (common in Copilot, Perplexity, and Gemini responses), surface not just the source URL/title but also *where exactly* in the source article the cited information appears — identifying the specific paragraph, sentence, or section that was referenced.

**Value:** Increases trust in archived AI research. Allows users to verify whether a cited fact is a direct quote, a paraphrase, or an inference — critical for knowledge workers, researchers, and anyone using bAInder as a reference library.

**Implementation sketch:**

### Tier 1 — Literal / Exact-match linking (Low complexity)
- After saving a chat with citations, extract the cited claim (text preceding the citation marker) and the source URL.
- Fetch the source page (via background service worker, respecting CORS/CSP), strip to plain text, and run a sliding-window exact-string search for the cited phrase.
- If a match is found: store `{ quote: string, charOffset: number, snippet: string }` alongside the citation in `ChatEntry.sources[]`.
- In the reader view, render matched citations with a **"View in source"** link that opens the source URL with a `#:~:text=<encoded>` fragment (Web Text Fragment — natively supported in Chromium) to scroll directly to the passage.

### Tier 2 — Inferred / paraphrased content (High complexity)
- For citations where no literal match exists, apply a lightweight local similarity search:
  - Tokenise both the cited claim and candidate passages (TF-IDF or bag-of-words).
  - Score each passage; surface the top-3 candidate passages ranked by similarity score.
- Render as **"Possible source passage (N% match)"** with an expand-to-read inline preview — clearly labelled as inferred, not confirmed.
- Flag with a `⚠ Inferred` badge to distinguish from exact matches.

**Risks:**
- Source pages may be paywalled, require login, or return 403/404 — handle gracefully with a "Source unavailable" fallback.
- Large source documents increase processing time — run analysis lazily (on user request) rather than automatically at save time.
- For Tier 2: similarity scoring without an embedding model is approximate; make confidence thresholds conservative to avoid misleading users.

**Effort:** Medium (Tier 1) — High (Tier 2). **Differentiator:** Very High — no consumer AI chat manager provides citation-level provenance linking today.

---

## Maintenance

> Internal quality and maintainability tasks — not user-facing features, but essential for long-term health of the codebase.

---

### Centralize Selectors Logic

**Goal:** Create a single, canonical source of DOM selectors for each supported AI chat site (ChatGPT, Claude, Gemini, Copilot, DeepSeek, Grok, Perplexity). Currently, selectors are scattered across multiple files (content scripts, extractors, background handlers), meaning a DOM change on any platform requires hunting down and updating multiple locations.

**Value:** AI chat platforms update their DOM frequently. Centralising selectors into one module per platform means a DOM change requires a single-line fix rather than a multi-file audit. It also makes it trivial to spot when selectors are stale and to test selector validity in isolation.

**Implementation sketch:**
- Create `src/content/selectors/` directory with one file per platform: `chatgpt.js`, `claude.js`, `gemini.js`, `copilot.js`, `deepseek.js`, `grok.js`, `perplexity.js`.
- Each file exports a frozen `SELECTORS` object, e.g.:
  ```js
  // chatgpt.js
  export const SELECTORS = Object.freeze({
    userTurn:      '[data-message-author-role="user"]',
    assistantTurn: '[data-message-author-role="assistant"]',
    messageContent: '.markdown',
    conversationId: /* parsed from pathname */,
  });
  ```
- All content scripts, extractors, and any background-script logic that references platform-specific DOM selectors import from this central module instead of inlining strings.
- Add a barrel export `src/content/selectors/index.js` keyed by platform name for dynamic lookup.
- Document the "last verified" date in each selector file as a comment — makes staleness immediately visible during maintenance.

**Effort:** Low–Medium (mechanical refactor; no behaviour change). **Differentiator:** Internal — significantly reduces future maintenance cost for all platform-related work, particularly C.23 and C.24.

---

## Completed

| Ref | Feature | Effort | Differentiator | Status |
|-----|---------|--------|----------------|--------|
| C.14 | Per-message / Q&A clipping | Low | High | ✅ Completed (context-menu save selection) |
| C.15 | Chat star rating (1–5) | Low | Moderate | ✅ Completed (March 4, 2026) |
| C.17 | Multi-chat assembly / digest export | Medium | High | ✅ Completed |
| C.19 | Review-by date / expiry flag | Low | Moderate | ✅ Completed (March 4, 2026) |
| C.18 | Model comparison (side-by-side diff view) | Medium | Very High | ✅ Completed (March 13, 2026) |
| C.20 | JSONL fine-tuning export | Low–Medium | Very High | ✅ Completed (March 12, 2026) |
| C.22 | Reading progress persistence | Low | Moderate | ✅ Completed (March 4, 2026) |
| C.26 | Copy chat content(s) to clipboard | Low–Medium | High | ✅ Completed (March 12, 2026) |
| C.28 | Enumerate prompts & responses in chat header | Low | Moderate | ✅ Completed (March 12, 2026) |

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

## C.22 — Reading Progress Persistence ✅ Completed

**Idea:** Remember the scroll position per chat across sessions in the reader view, so returning to a long technical chat resumes where you left off.

**Value:** Long code-heavy chats (debugging sessions, architecture discussions) are frequently revisited. The current behaviour resets to the top on every open — subtle but noticeably frustrating.

**Status:** Completed March 4, 2026. Implemented: three exported pure helpers in `reader.js` — `getScrollPositions()`, `saveScrollPosition(chatId, scrollY)` (LRU-evicting at 100 entries), and `restoreScrollPosition(chatId)`; `setupScrollFeatures(chatId)` now debounce-saves (500 ms) on scroll; `init()` calls `restoreScrollPosition` immediately after `renderChat`. 11 new tests (3 getScrollPositions + 5 saveScrollPosition + 3 restoreScrollPosition).

**Effort:** Low. **Differentiator:** Moderate — small touch, immediately noticeable quality improvement.

---

## C.20 — JSONL Fine-Tuning Export ✅ Completed

**Idea:** Export any topic branch (or selected chats) as an **OpenAI-format JSONL file** — each line one complete conversation `{"messages": [{...}, ...]}` object, ready for fine-tuning pipelines.

**Value:** Users building personal fine-tuning datasets or RAG pipelines from their curated conversations get a one-click path to training-ready data.

**Status:** Completed March 12, 2026. Implemented:
- `src/lib/export/jsonl-builder.js` — new module exporting `buildFineTuningJsonl(chat, options)` (single chat → one JSONL line) and `buildFineTuningJsonlMulti(chats, options)` (multiple chats → merged JSONL document). Only `user` and `assistant` roles are included; optional configurable system message is prepended when provided.
- `src/lib/export/export-engine.js` — re-exports both functions via the barrel.
- `src/lib/dialogs/export-dialog.js` — `JSONL (Fine-tuning)` added to `TOPIC_FORMATS` and `CHAT_FORMATS`; `#export-jsonl-section` panel with a system-message text input toggles visible when JSONL is selected (style section hidden); `_doExportChat`, `_doExportDigest`, and `_doExportTopic` all handle `format === 'jsonl'`; single-chat JSONL uses the chat title as filename; multi-chat uses `bAInder-finetune-<date>.jsonl`.
- `src/lib/export/zip-builder.js` — when `format === 'jsonl'`, writes one `_finetune.jsonl` file per topic folder containing all chats for that topic.
- `tests/jsonl-builder.test.js` — 22 unit tests covering all builder paths.
- `tests/export-dialog-jsonl.test.js` — 17 unit tests covering all JSONL dialog paths (chat, digest, topic export) and section visibility toggling.

**Effort:** Low–Medium. **Differentiator:** Very High — unique in the market for a consumer extension.

---

## C.26 — Copy Chat Content(s) to Clipboard ✅ Completed

**Idea:** Allow users to copy the full conversation text of one or more saved chats directly to the clipboard — from the side panel tree, from the reader view, or via the multi-select action bar.

**Status:** Completed March 12, 2026. Implemented:

- **`src/lib/export/clipboard-serialiser.js`** — New module. Exports `chatToPlainText(chat)`, `chatToMarkdown(chat)`, `serialiseChats(chats, format)`, `getClipboardFormat()`, `writeToClipboard(text)`, and `copyChatsToClipboard(chats, options)`. Guards: rejects payloads > 1 MB (`MAX_CLIPBOARD_CHARS`); bulk warning threshold at ≥ 20 chats (`BULK_WARN_THRESHOLD`). Falls back to hidden-textarea + `execCommand('copy')` when the Clipboard API is unavailable. Returns a result object so callers surface notifications without coupling to the notification system.
- **Chat context menu** (`sidepanel.html` + `chat-actions.js`) — "Copy to Clipboard" item added to `#chatContextMenu`. `handleCopyChatAction()` loads the full chat via `chatRepo.loadFullByIds`, delegates to `copyChatsToClipboard`, and shows toast feedback.
- **Topic context menu** (`sidepanel.html` + `topic-actions.js`) — "Copy all chats" item added to `#contextMenu`. `handleCopyAllTopicChats()` collects all descendant chat IDs via `collectDescendantChatIds`, loads full content, and copies with appropriate error/success toasts.
- **Multi-select bar** (`sidepanel.html` + `multi-select.js` + `sidepanel.js`) — "Copy all" button (`#copyAllBtn`) added to `#selectionBar`. `handleCopyAll()` follows the same pattern as `handleExportDigest`; button is enabled/disabled in `updateSelectionBar` when ≥ 2 chats are selected. Wired in `sidepanel.js`.
- **Reader view** (`reader.html` + `reader.js`) — "Copy" button (`#reader-copy-btn`) added to the reader header. `setupReaderCopyButton(chat, storage)` is called from `init()`, reads the format preference, serialises the open chat, and shows button-level feedback (✓ / fallback prompt / error).
- **Settings panel** (`sidepanel.html` + `settings-panel.js`) — New "Clipboard" settings section with `#clipboardFormatSelect` (Plain text / Markdown). Persists to `browser.storage.local` key `'clipboardFormat'`.
- **`app-context.js`** — Added `copyAllBtn` to the `elements` registry.
- **Tests** — 6 new test files covering all new code: `tests/clipboard-serialiser.test.js` (41 tests), `tests/clipboard-copy-actions.test.js` (7), `tests/clipboard-topic-copy.test.js` (9), `tests/clipboard-multiselect.test.js` (12), `tests/clipboard-settings.test.js` (4), plus additions to `tests/reader.test.js` (4 new tests for `setupReaderCopyButton`). Total: 77 new tests; full suite 2280 tests, all passing.

**Effort:** Low–Medium. **Differentiator:** High — eliminates the most common manual step after archiving.

---

## C.18 — Model Comparison View (Side-by-Side Diff) ✅ COMPLETED March 13, 2026

**Idea:** Side-by-side reader view for two or more saved chats answering the same (or similar) question, with structured analysis highlighting how different models responded.

**Value:** Researchers and power users who query multiple models need to compare outputs. A visual compare view without leaving the extension is a compelling capability.

**Detailed work plan:** see [Compare-Feature-Work-Plan.md](Compare-Feature-Work-Plan.md).

**Effort:** Medium (phased). **Differentiator:** Very High — unique in the extension market.

---

## C.28 — Enumerate Prompts & Responses in Chat Header ✅ COMPLETED March 12, 2026

**Idea:** In the saved chat header (and the hover overlay introduced in C.25), display the total count of user prompts and assistant responses. Each prompt and each response within the chat view itself is additionally labelled with its own sequential number — prompts numbered independently (P1, P2, …) and responses numbered independently (R1, R2, …) — making it trivial to cross-reference hover stats with actual content.

**Value:** Long chats with many back-and-forth turns become navigable at a glance. A user who sees "Prompts: 8 | Responses: 8" in the hover overlay can immediately jump to P5/R5 without mentally counting.

**Implementation (as built):**
- **Header/overlay counts:** `countTurns(contentEl)` counts `.chat-turn--user/.chat-turn--assistant` (legacy wrapped format) with a fallback for `🙋`/`🤖` paragraph prefixes (current emoji serialiser format). Counts are displayed in `#meta-responses` in the reader header.
- **Per-message labels:** `addOrdinalLabels(contentEl)` prepends a `<span class="msg-ordinal">` to each user/assistant turn before the emoji role indicator:
  - User turns: `P1`, `P2`, … — prepended to the `<p>🙋 …</p>` element
  - Assistant turns: `R1`, `R2`, … — prepended to the `<p>🤖 …</p>` element
  - Legacy wrapped-format chats: labels are prepended inside `.chat-turn__role`
- Labels are styled as bold pill badges (weight 800, `--primary` colour on a translucent background) so they are clearly visible without cluttering the content.
- **Deep-link anchor:** Each labelled element is assigned `id="p1"` / `id="r3"` (etc.), matching the prompts-overlay `href` anchors — enabling direct in-page navigation.
- **Dual-format support:** Both the current emoji format and the legacy `### User` / `### Assistant` heading format are handled; the function auto-detects which is in use.
- Settings toggle: "Show message ordinals" (default: on) in the Reader settings section — `body.ordinals-hidden .msg-ordinal { display: none }` hides all labels when toggled off.

**Effort:** Low. **Differentiator:** Moderate — a small but meaningful navigability improvement for power users working with long research chats.

---

*Document generated: March 3, 2026 — last updated: March 13, 2026*
