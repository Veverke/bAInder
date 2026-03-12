# bAInder — Additional Feature Recommendations

---

> Generated: March 3, 2026  
> Source: AI-assisted brainstorming session — features not already covered by the roadmap or design specs.  
> These are catalogued as **C.13 – C.32** in Appendix C of `DESIGN_SPECS.md` and `roadmap.html`.  
> Last updated: March 12, 2026 — sorted by impact/complexity ROI; completed features moved to end. C.20 completed March 12, 2026. C.26 completed March 12, 2026. C.28 completed March 12, 2026.

---

## Candidates — Sorted by Impact and Complexity

Items are ordered by return on investment: highest differentiator with lowest effort first. Within the same effort band, higher differentiator ranks first.

| Ref | Feature | Effort | Differentiator |
|-----|---------|--------|----------------|
| ~~C.28~~ | ~~Enumerate prompts & responses in chat header~~ | ~~Low~~ | ~~Moderate~~ | ✅ Done |
| C.24 | Internal API-based extraction — platform-wide strategy | Low/platform | Moderate |
| C.18 | Model comparison (side-by-side diff view) | Medium | Very High |
| C.16 | Cross-platform prompt launch | Medium | Very High |
| C.23 | Platform expansion: DeepSeek, Grok & Perplexity | Medium | Very High |
| C.25 | Chat hover overlay (tree preview) | Medium | High |
| C.13 | Prompt Library | Medium | High |
| C.21 | Direct Obsidian push (Local REST API) | Medium | High |
| C.31 | Manage code snippets (tree view) | Medium | High |
| C.29 | Manage embedded images (tree view) | Medium | High |
| C.30 | Manage attachments (tree view) | Medium | High |
| C.32 | Manage audio recordings (tree view) | Medium | Moderate |
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

## C.18 — Model Comparison View (Side-by-Side Diff)

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

## C.13 — Prompt Library

**Idea:** Automatically extract the user-turn prompts from every saved chat and surface them in a dedicated "Prompt Library" panel. One-click to copy or re-fire any saved prompt on any supported AI platform.

**Value:** Power users re-use prompts constantly. This elevates bAInder from a passive archive into an active productivity tool — the closest analogy is a personal snippet manager, but for AI prompts.

**Implementation sketch:**
- On save, extract all user-turn messages into a `prompts[]` array stored alongside the `ChatEntry`.
- Add a "Prompt Library" view (or collapsible section) in the side panel, listing prompts with their source topic, date, and platform badge.
- "Copy" button copies the raw text; "Re-fire" opens the appropriate platform URL with the prompt pre-filled in the URL query param (where supported — ChatGPT and Claude both accept `?q=` or similar deep links).

**Effort:** Medium. **Differentiator:** High — no mainstream extension does this today.

---

### C.13.1 — Prompt Manager (Tabbed Tree View)

**Feature:**
- Add a Prompt Manager as another tree view. The main screen will now be tabbed:
  - Tab 1: Topic tree viewer
  - Tab 2: Prompt tree viewer
  - Tab 3: Code snippets tree viewer
- Clicking a prompt in tab 2 or a code snippet in tab 3 opens the saved chat from which that prompt or code snippet was taken, highlighting the prompt or code snippet in the chat contents.

**Value:**
Streamlines navigation and retrieval of prompts and code, supporting power-user workflows.

**Effort:** Medium. **Differentiator:** High — combines advanced navigation with cross-linking and content highlighting.

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

## C.31 — Manage Code Snippets (Tree View)

**Idea:** Build a dedicated **Code Snippets** tree view listing every fenced code block across all saved chats, grouped by programming language and then by topic/chat. Each snippet is browsable and copyable without opening the full chat.

**Value:** This is the primary retrieval workflow for developer users — they save a chat because it contains a useful function or script, then later need to find and copy that exact snippet. The current approach requires opening the chat and scrolling. The C.13.1 Prompt Manager already proposes a Code Snippets tab; this entry defines the full feature scope.

**Implementation sketch:**
- At save time, extract all fenced code blocks from assistant messages: parse ` ```lang \n code \n ``` ` patterns; store `{ id, language, code, lineCount, messageIndex, chatId }`.
- Add a **Code** tab to the tabbed view (this is the "Tab 3" referenced in C.13.1).
- **Two-level grouping modes** (toggle in header):
  1. *By language* → **JavaScript → Topic / Chat → snippet preview**
  2. *By topic* → **Topic → Chat → snippet list** (mirrors main tree)
- Render each snippet as a compact card: language badge, first 3 lines preview, line count, copy button.
- Clicking the card opens the reader at the correct message anchor.
- **Copy button** on each card copies the raw code to clipboard directly from the tree — no need to open the chat.
- **Search:** full-text search within code snippet contents (not just filenames).
- **Export:** select multiple snippets → export as a single `.md` or `.zip` of individual files named `<language>-snippet-<N>.<ext>`.
- Extends the hover overlay (C.25): "Code Snippets: Python: 3, JavaScript: 2" is already planned there — this view is the backing data source.

**Effort:** Medium. **Differentiator:** High — the most developer-facing feature in the suite; directly increases daily utility for the core power-user segment.

---

## C.29 — Manage Embedded Images (Tree View)

**Idea:** Build a dedicated **Images** tree view listing every image embedded across all saved chats, grouped by topic (mirroring the main chat tree hierarchy). Clicking any image thumbnail opens the source chat at the point where the image appears.

**Value:** Users who save chats containing diagrams, screenshots, charts, or AI-generated images currently have no way to browse those assets without opening each chat individually. A centralised image gallery turns bAInder into a visual research archive.

**Implementation sketch:**
- At save time (or lazily on first view), scan each `ChatEntry` for embedded images: inline `<img>` tags, data-URI blobs, and image attachments in the messages array.
- Store an `images[]` array on `ChatEntry`: `{ id, src, mimeType, altText, messageIndex, thumbnailDataUri }`.
- Add an **Images** tab to the main tabbed view (alongside the existing topic tree and Prompt Manager from C.13.1).
- Render as a two-level tree: **Topic → Chat title → image thumbnails** (grid layout within each chat node).
- Clicking a thumbnail opens the reader at the correct message (`#r<N>` anchor from C.28).
- Filter bar: filter by topic, by platform, or by image type (photo / diagram / generated).
- **Edge cases:** Very large images (> 5 MB data URI) — store only the thumbnail; link to the full image in the reader rather than embedding in the tree.

**Effort:** Medium. **Differentiator:** High — unique visual asset management for AI chat archives.

---

## C.30 — Manage Attachments (Tree View)

**Idea:** Build a dedicated **Attachments** tree view listing every file attachment present across all saved chats — PDFs, spreadsheets, Word documents, code files, etc. — grouped by topic, with metadata (filename, type, size, originating chat).

**Value:** Power users frequently attach documents to AI sessions for analysis. Locating a specific attachment currently requires opening every chat. A centralised attachment browser enables instant retrieval.

**Implementation sketch:**
- At save time, scan `ChatEntry` messages for attachment metadata: filename, MIME type, size (where available from the platform DOM/API), and the `messageIndex` where it appears.
- Store as `attachments[]` on `ChatEntry`: `{ id, filename, mimeType, sizeBytes, messageIndex, platform }`.
- Add an **Attachments** tab to the tabbed view (alongside Images, Prompts, topic tree).
- Render as a two-level tree: **Topic → Chat title → attachment list** with file-type icons and size badges.
- Clicking an attachment entry opens the reader at the message where the attachment appears.
- Filter/sort: by file type, by date, by size; search by filename.
- **Note:** bAInder stores chat text and metadata — it does not store the actual binary file contents (those remain on the AI platform). The attachment entry is a reference/pointer, not a local copy. Show a clear label: *"Original file on [Platform]"*.

**Effort:** Medium. **Differentiator:** High — closes a significant gap for users who rely on document-upload AI workflows.

---

## C.32 — Manage Audio Recordings (Tree View)

**Idea:** Build a dedicated **Audio** tree view listing every audio recording or voice message embedded in saved chats, grouped by topic. Inline playback and transcript display are available directly from the tree without opening the full chat.

**Value:** Voice-input AI workflows (Gemini voice mode, ChatGPT Advanced Voice, Copilot voice) are growing. Users who save voice-driven chats currently have no way to locate or replay specific recordings. A centralised audio browser closes this gap.

**Implementation sketch:**
- At save time, detect audio assets in chat messages: `<audio>` elements, blob URLs, or audio-attachment metadata from the platform DOM/API.
- Store as `audioRecordings[]` on `ChatEntry`: `{ id, durationSeconds, mimeType, src, transcript, messageIndex }`.
  - `transcript`: if the platform provides an auto-generated transcript (Gemini/Copilot often do), capture it alongside the audio reference.
- Add an **Audio** tab to the tabbed view.
- Render as a two-level tree: **Topic → Chat title → recording list** with duration badges and waveform placeholders.
- Each entry shows:
  - Duration, timestamp, platform badge.
  - Inline `<audio>` player (if the src is accessible — note blob URLs expire with the page session).
  - Expandable transcript (if available), with the assistant response rendered below it.
- **Blob URL caveat:** Audio blob URLs created by the platform are session-scoped and will be invalid after the tab closes. At save time, attempt to read the blob via `fetch(blobUrl)` → `arrayBuffer()` and store as a base64 data URI within the `ChatEntry` (size-capped at a configurable limit, default 10 MB). If the blob is unavailable or too large, show a *"Audio not saved — original page required"* notice.
- Filter/sort: by platform, by date, by duration; filter to only entries with transcripts.

**Effort:** Medium. **Differentiator:** Moderate — relatively niche today but increasingly relevant as voice AI usage grows; positions bAInder ahead of the curve.

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
| C.20 | JSONL fine-tuning export | Low–Medium | Very High | ✅ Completed (March 12, 2026) |
| C.22 | Reading progress persistence | Low | Moderate | ✅ Completed (March 4, 2026) |

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

*Document generated: March 3, 2026 — last updated: March 12, 2026*
