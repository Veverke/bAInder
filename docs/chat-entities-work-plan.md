# Chat Entities Manager — Detailed Work Plan

> Created: March 14, 2026  
> Covers: whats-next.md — Chat Entities Manager (C.13 · C.29 · C.30 · C.31 · C.32 · C.33 · C.34 · C.35 · C.36 · C.37)  
> Status: Planning

---

## Conventions

- Each task is **atomic and independently implementable** — no task requires another task in the same phase to be started or completed first unless an explicit dependency is noted.
- Tasks within a phase may be parallelised; phases must be completed in order (each phase depends on the phase before it).
- File paths are relative to `src/` unless otherwise stated.
- **Test files** live in `tests/` and follow the existing `vitest` + `jsdom` setup.

---

## Architecture reference

Relevant existing files:

| File | Role |
|------|------|
| `background/chat-save-handler.js` | Builds `ChatEntry` via `buildChatEntry()`; entry point for entity extraction |
| `lib/storage.js` | `StorageService` — all chrome.storage I/O |
| `sidepanel/services/chat-repository.js` | `ChatRepository` — chat CRUD; `MAX_CHATS_IN_MEMORY = 5000` |
| `sidepanel/app-context.js` | `state` and `elements` singletons |
| `sidepanel/sidepanel.js` | Thin bootstrap; delegates to controllers + features |
| `sidepanel/sidepanel.html` | Panel HTML |
| `sidepanel/controllers/search-controller.js` | `runSearch()`, `debounce()`, filter bar |
| `sidepanel/controllers/tree-controller.js` | Tree load/render/save |
| `lib/renderer/tree-renderer.js` | `TreeRenderer` class — orchestrates topic tree |
| `lib/renderer/virtual-scroll.js` | `startVirtualScroll()`, `renderVirtualRow()` |
| `lib/renderer/chat-item-builder.js` | Per-chat DOM card factory |

New files introduced by this feature live under:
- `src/lib/entities/` — pure data types, extractors, registry, store
- `src/lib/renderer/entity-cards/` — per-type card renderers
- `src/sidepanel/controllers/entity-controller.js` — entity tab wiring

---

## Phase 0 — Shared Infrastructure

> Prerequisite for all subsequent phases. Nothing in Phases A–E can be built without this phase being complete.

### Task 0.1 — `ChatEntity` base type and `ENTITY_TYPES` constant

**File:** `src/lib/entities/chat-entity.js`  
**Depends on:** nothing

Define the shared base type and factory used by every concrete entity type.

```js
// ENTITY_TYPES — canonical string keys for all ten entity types
export const ENTITY_TYPES = Object.freeze({
  PROMPT:      'prompt',
  CITATION:    'citation',
  TABLE:       'table',
  CODE:        'code',
  DIAGRAM:     'diagram',
  TOOL_CALL:   'toolCall',
  ATTACHMENT:  'attachment',
  IMAGE:       'image',
  AUDIO:       'audio',
  ARTIFACT:    'artifact',
});

// createEntity — factory for concrete entities; all per-type extractors must call this
// to guarantee the base fields are always present.
export function createEntity(type, messageIndex, chatId, role, fields = {}) { … }
```

`createEntity` generates a unique `id` (using the existing `generateId()` from `search-utils.js`), stamps `type`, `messageIndex`, `chatId`, `role`, and spreads `fields`.

**Deliverable:** `src/lib/entities/chat-entity.js` exported and importable.  
**Test file:** `tests/chat-entity.test.js`  
- `createEntity` populates all base fields  
- `createEntity` generates unique ids across calls  
- `ENTITY_TYPES` values are all distinct strings  

---

### Task 0.2 — `EntityExtractorRegistry` and `extractChatEntities()` pipeline

**File:** `src/lib/entities/entity-extractor.js`  
**Depends on:** 0.1

Implement the registration map and the top-level extraction function called from the save handler.

```js
const _registry = new Map(); // type → extractorFn(messages, doc) → Entity[]

export function registerExtractor(type, fn) { _registry.set(type, fn); }

// extractChatEntities — called once per save; chatId is stamped onto every entity
export function extractChatEntities(messages, doc, chatId) {
  const result = {};
  for (const [type, fn] of _registry) {
    try {
      const entities = fn(messages, doc, chatId);
      if (entities.length > 0) result[type] = entities;
    } catch (e) { /* log, never throw */ }
  }
  return result; // { prompt: [...], table: [...], … } — sparse, omits empty arrays
}
```

**Deliverable:** `src/lib/entities/entity-extractor.js` exported.  
**Test file:** `tests/entity-extractor.test.js`  
- `registerExtractor` + `extractChatEntities` calls each registered extractor  
- extractor that throws does not abort the pipeline  
- empty extractor results are omitted from the output object  
- `chatId` is passed through to each extractor call  

---

### Task 0.3 — Extend `buildChatEntry()` to run entity extraction

**File:** `src/background/chat-save-handler.js`  
**Depends on:** 0.2 (the pipeline must exist before the save handler calls it)

After the existing `return { id, title, content, … }` block in `buildChatEntry()`, call `extractChatEntities(chatData.messages, null, id)` and spread the result as top-level keys on the entry object. All entity arrays are optional; existing entries without them remain valid.

```js
// Inside buildChatEntry():
const entities = extractChatEntities(chatData.messages ?? [], null, generatedId);
return { id: generatedId, title, content, …, ...entities };
```

`doc` is `null` during background-script execution; extractors must handle a null doc gracefully (DOM-dependent extraction is a no-op when doc is absent — relevant for later phases that rely on rendered DOM).

**Deliverable:** `buildChatEntry` returns entity arrays when messages contain extractable content.  
**Test file:** `tests/chat-save-handler.test.js` (extend existing)  
- entry built from messages with a fenced code block contains `codeSnippets[]`  
- entry built from messages without entities has no entity keys (clean, no empty arrays)  
- extractors that fail do not cause `buildChatEntry` to throw  

---

### Task 0.4 — `EntityStore` — cross-chat entity queries

**File:** `src/lib/entities/entity-store.js`  
**Depends on:** 0.1, and `ChatRepository` (existing)

Provides the query API used by the entity tree and entity search. Reads entity arrays directly from the in-memory `chats` array (already loaded in `state.chats`), so no additional storage calls are needed for most operations.

```js
export class EntityStore {
  constructor(getChatsFn) {
    // getChatsFn: () => ChatEntry[] — injects state.chats without coupling to state
    this._getChats = getChatsFn;
  }

  // All entities of a given type across all chats — flat array, sorted by chatId, then messageIndex
  getAllByType(type) { … }

  // All entities of a given type within a specific chat
  getForChat(chatId, type = null) { … }

  // All entity types present across all chats — for tab/chip visibility decisions
  getPresentTypes() { … }
}
```

**Deliverable:** `src/lib/entities/entity-store.js` exported.  
**Test file:** `tests/entity-store.test.js`  
- `getAllByType('code')` returns all code entities across multiple chats  
- `getForChat(chatId)` returns only that chat's entities  
- `getPresentTypes()` returns only types that have ≥ 1 entity  
- empty chats array returns empty results without throwing  

---

### Task 0.5 — `ChatEntityTree` — generic entity tree renderer

**File:** `src/lib/renderer/entity-tree.js`  
**Depends on:** 0.1, 0.4; `virtual-scroll.js` (existing)

Generic two-mode renderer. Accepts an `EntityStore` and a `cardRenderer` map (`{ [type]: (entity) → HTMLElement }`).

```js
export class ChatEntityTree {
  constructor(container, entityStore, cardRenderers, topicTree) { … }

  // groupMode: 'byType' (default) | 'byTopic'
  setGroupMode(mode) { … }
  render() { … }            // full re-render
  setFilter(type) { … }     // null = all types
  highlightSearch(query) { … }
  clearHighlight() { … }
}
```

Tree structure in `byType` mode:
```
[Type Section Header]
  └─ [Topic node]
       └─ [Chat node]
            └─ [Entity card via cardRenderers[type](entity)]
```

Tree structure in `byTopic` mode:
```
[Topic node]
  └─ [Chat node]
       └─ [Type badge + entity card]
```

Uses `VirtualScroll` when total entity count exceeds the existing `virtualThreshold` (150).  
Emits a `'entity-click'` custom event on the container when any entity card is clicked; payload: `{ entity, chatId }`.

**Deliverable:** `src/lib/renderer/entity-tree.js` exported.  
**Test file:** `tests/entity-tree.test.js`  
- `render()` in `byType` mode produces type section headers  
- `render()` in `byTopic` mode produces topic nodes  
- `setFilter('code')` hides non-code sections  
- `highlightSearch('async')` adds highlight markup to matching cards  
- clicking a card fires the `entity-click` event with correct payload  
- empty store renders an empty-state message, not a blank container  

---

### Task 0.6 — Two-tab side panel host — HTML and CSS

**Files:** `sidepanel/sidepanel.html`, `sidepanel/sidepanel.css`  
**Depends on:** nothing (pure markup/style, no JS logic yet)

Add a tab bar above `<main>` with two tabs: **Chat Sessions** and **Chat Entities**. Wrap the existing `<main class="main-content">` inside a `<div id="sessionPanel">` so it can be hidden by the tab controller. Add a peer `<div id="entityPanel" hidden>` that will host the `ChatEntityTree`.

```html
<!-- Tab bar — inserted between <header> and <main> -->
<div class="panel-tabs" role="tablist">
  <button class="panel-tab panel-tab--active" id="tabChatSessions"
          role="tab" aria-selected="true"  aria-controls="sessionPanel">Chat Sessions</button>
  <button class="panel-tab"               id="tabChatEntities"
          role="tab" aria-selected="false" aria-controls="entityPanel">Chat Entities</button>
</div>

<div id="sessionPanel" role="tabpanel" aria-labelledby="tabChatSessions">
  <!-- existing main content here -->
</div>

<div id="entityPanel" role="tabpanel" aria-labelledby="tabChatEntities" hidden>
  <!-- ChatEntityTree mounts here -->
  <div id="entityTree"></div>
</div>
```

CSS: `.panel-tabs`, `.panel-tab`, `.panel-tab--active` — match existing design tokens (`--primary`, `--bg-elevated`, `--border`, etc.).

**Deliverable:** Visual tab bar renders correctly in the side panel. Clicking each tab shows/hides panels (CSS-only `hidden` attribute — the JS wiring comes in 0.7).  
**Test:** Manual visual check only (no JS test needed for static markup).

---

### Task 0.7 — Two-tab wiring — `app-context.js` and `sidepanel.js`

**Files:** `sidepanel/app-context.js`, `sidepanel/sidepanel.js`  
**Depends on:** 0.6

Add tab elements to `elements`:
```js
tabChatSessions: document.getElementById('tabChatSessions'),
tabChatEntities: document.getElementById('tabChatEntities'),
sessionPanel:    document.getElementById('sessionPanel'),
entityPanel:     document.getElementById('entityPanel'),
entityTree:      document.getElementById('entityTree'),
```

Add `activeTab: 'sessions'` to `state`.

In `sidepanel.js` (init section), wire tab click handlers:
```js
elements.tabChatSessions.addEventListener('click', () => switchTab('sessions'));
elements.tabChatEntities.addEventListener('click', () => switchTab('entities'));
```

`switchTab(tab)`:
- Updates `state.activeTab`
- Toggles `hidden` on panels and `panel-tab--active` / `aria-selected` on buttons
- When switching to `entities` for the first time: initialises the entity controller (lazy init — see Phase A)

**Deliverable:** Clicking tabs correctly switches panels; `state.activeTab` reflects current tab.  
**Test file:** `tests/sidepanel-tabs.test.js` (new)  
- clicking entity tab hides session panel, shows entity panel  
- clicking sessions tab restores session panel  
- `aria-selected` attributes toggle correctly  

---

### Task 0.8 — Search context toggle — UI and routing

**Files:** `sidepanel/sidepanel.html`, `sidepanel/sidepanel.css`, `sidepanel/controllers/search-controller.js`, `sidepanel/app-context.js`  
**Depends on:** 0.7 (needs `state.activeTab`; entity search impl is a stub at this stage)

Add a **Chats / Entities** toggle button group inside `.search-container`, to the right of the search input, to the left of the filter toggle:
```html
<div class="search-context-toggle" role="group" aria-label="Search context">
  <button class="context-btn context-btn--active" id="searchCtxChats"  data-ctx="chats">Chats</button>
  <button class="context-btn"                     id="searchCtxEntities" data-ctx="entities">Entities</button>
</div>
```

Add to `elements`: `searchCtxChats`, `searchCtxEntities`.  
Add to `state`: `searchContext: 'chats'` (default).

Modify `runSearch()` in `search-controller.js`:
- When `state.searchContext === 'chats'`: existing behaviour unchanged.
- When `state.searchContext === 'entities'`: call `runEntitySearch(query)` (stub that calls a not-yet-implemented function; safe to silently no-op at this phase).

When context switches to `entities`:
- Show entity-type filter chips section (added as a hidden `<div id="filterEntityTypes">` in the filter bar — populated in Phase A).
- Hide the existing source/date/topic/rating filter groups (they are chat-specific).

When context switches to `chats`: restore previous filter groups, hide entity type chips.

**Deliverable:** Toggle switches `state.searchContext`; correct filter sections show/hide; search input fires the correct handler based on context.  
**Test file:** `tests/search-controller.test.js` (extend existing)  
- switching to entities calls `runEntitySearch` (spy), not `runSearch`  
- switching back to chats calls `runSearch`, not `runEntitySearch`  
- entity-type chips section toggles visibility on context switch  

---

### Task 0.9 — `openChatAtMessage(chatId, messageIndex)` navigation helper

**File:** `src/lib/entities/entity-navigation.js`  
**Depends on:** nothing (pure navigation logic using existing `handleChatClick` pattern)

```js
// Opens the reader for chatId, then scrolls to the message anchor after load.
// messageIndex corresponds to the ordinal used by C.28 (#p<N> for user turns,
// #r<N> for assistant turns, derived from entity.role and entity.messageIndex).
export function openChatAtMessage(chatId, messageIndex, role, { onChatClick }) {
  const anchor = role === 'user' ? `#p${messageIndex + 1}` : `#r${messageIndex + 1}`;
  onChatClick(chatId, { scrollToAnchor: anchor });
}
```

`onChatClick` is the existing `handleChatClick` from `chat-actions.js`, passed in to avoid a circular dependency.

**Deliverable:** `openChatAtMessage` exported and importable.  
**Test file:** `tests/entity-navigation.test.js`  
- calls `onChatClick` with the correct chatId  
- constructs `#p<N>` anchor for user-role entities  
- constructs `#r<N>` anchor for assistant-role entities  
- messageIndex 0 → anchor `#p1` / `#r1` (1-based)  

---

### Phase 0 — Deliverables summary

| Task | New file | Tests |
|------|----------|-------|
| 0.1 | `src/lib/entities/chat-entity.js` | `tests/chat-entity.test.js` |
| 0.2 | `src/lib/entities/entity-extractor.js` | `tests/entity-extractor.test.js` |
| 0.3 | *(extends `chat-save-handler.js`)* | *(extends `tests/chat-save-handler.test.js`)* |
| 0.4 | `src/lib/entities/entity-store.js` | `tests/entity-store.test.js` |
| 0.5 | `src/lib/renderer/entity-tree.js` | `tests/entity-tree.test.js` |
| 0.6 | *(extends HTML + CSS)* | *(manual only)* |
| 0.7 | *(extends `sidepanel.js`, `app-context.js`)* | `tests/sidepanel-tabs.test.js` |
| 0.8 | *(extends `search-controller.js`, HTML, CSS)* | *(extends `tests/search-controller.test.js`)* |
| 0.9 | `src/lib/entities/entity-navigation.js` | `tests/entity-navigation.test.js` |

### Phase 0 — What to verify end-to-end

1. **Tab switching**: clicking "Chat Entities" tab shows the (empty) entity panel; "Chat Sessions" restores the tree.
2. **Search context**: toggling "Entities" in the search bar does not error; entity-type chips section is visible; existing chat search is unaffected when in "Chats" context.
3. **Save pipeline**: saving a chat that contains a fenced code block via the content script round-trip results in a stored entry with a `code` key containing at least one entity. (Validate with `chrome.storage.local.get` in browser devtools.)
4. **All new unit tests pass**: `npm test` reports zero failures for the 6 new test files.

---

## Phase A — Group A: Text Entities (Prompts, Citations, Tables)

> Depends on Phase 0 being complete. Tasks A.1–A.9 are independent of each other within this phase.

### Task A.1 — `extractPrompts(messages, doc, chatId)` extractor

**File:** `src/lib/entities/extractors/prompts.js`  
**Depends on:** 0.1

Iterate `messages[]`; for each message where `role === 'user'`, create a Prompt entity.

```js
export function extractPrompts(messages, _doc, chatId) {
  return messages
    .filter(m => m.role === 'user')
    .map((m, i) => createEntity(ENTITY_TYPES.PROMPT, m.index ?? i, chatId, 'user', {
      text:      m.content,
      wordCount: m.content.trim().split(/\s+/).length,
    }));
}
```

`m.index` is the message's position in the full messages array. `_doc` is intentionally unused (text-only extraction).

**Test file:** `tests/extractors/prompts.test.js`  
- 2 user turns from 4-message array → 2 prompt entities  
- `wordCount` is correct  
- assistant turns are excluded  
- empty messages array → empty result  

---

### Task A.2 — `extractCitations(messages, doc, chatId)` extractor

**File:** `src/lib/entities/extractors/citations.js`  
**Depends on:** 0.1

Scan assistant messages for citation patterns. Two strategies (tried in order, first that yields results wins):

1. **DOM strategy** (when `doc` is not null): query citation-specific elements per platform — Perplexity source drawer `[data-source]`, Copilot `<citation-block>`, Gemini `.source-item`. Extract `url`, `title`, `snippet`, `number`.  
2. **Text strategy** (fallback, or when `doc` is null): regex-scan assistant message text for `[1]`-style footnote markers; extract adjacent hyperlinks or bare URLs.

```js
export function extractCitations(messages, doc, chatId) { … }
```

**Test file:** `tests/extractors/citations.test.js`  
- text strategy: message with `[1] https://example.com — Some title` → 1 citation entity  
- DOM strategy: mock doc with Perplexity `[data-source]` elements → citation entities  
- messages with no citation markers → empty result  
- doc-null fallback does not throw  

---

### Task A.3 — `extractTables(messages, doc, chatId)` extractor

**File:** `src/lib/entities/extractors/tables.js`  
**Depends on:** 0.1

Parse Markdown table syntax from assistant messages using a state-machine parser. A table is detected by: ≥ 2 consecutive lines starting with `|`, with a separator line matching `/^\|[-|\s:]+\|/`.

```js
export function extractTables(messages, _doc, chatId) { … }
// Each entity: { headers: string[], rows: string[][], rowCount: number }
```

Edge cases: pipe characters inside cells escaped with `\|`; tables with merged separator detected as a single table.

**Test file:** `tests/extractors/tables.test.js`  
- 3-column, 4-row table in one message → 1 table entity with correct headers and rows  
- two separate tables in one message → 2 entities  
- text with `|` characters but no valid separator row → no entity  
- table with trailing pipe only on header → parsed correctly  

---

### Task A.4 — Register A.1–A.3 extractors

**File:** `src/lib/entities/extractors/index.js`  
**Depends on:** 0.2, A.1, A.2, A.3

The barrel file that calls `registerExtractor` for each implemented extractor. Imported once from `entity-extractor.js` (or from the save handler module) so registration happens automatically on import.

```js
import { registerExtractor } from '../entity-extractor.js';
import { extractPrompts }    from './prompts.js';
import { extractCitations }  from './citations.js';
import { extractTables }     from './tables.js';
// … later phases add their imports here

registerExtractor('prompt',   extractPrompts);
registerExtractor('citation', extractCitations);
registerExtractor('table',    extractTables);
```

**Test:** covered by `tests/entity-extractor.test.js` (extend to include an end-to-end case with real extractor).

---

### Task A.5 — Prompt entity card renderer

**File:** `src/lib/renderer/entity-cards/prompt-card.js`  
**Depends on:** 0.1

```js
// promptCard(entity) → HTMLElement
// Shows: truncated first line (max 120 chars), word count badge, platform badge,
// Copy button, Re-fire button.
export function promptCard(entity, { onRefire }) { … }
```

Re-fire logic: call the platform URL builder from C.16 (stubbed as a `TODO` import at this stage; can be wired in when C.16 is implemented).  
Copy button: `navigator.clipboard.writeText(entity.text)`.

**Test file:** `tests/entity-cards/prompt-card.test.js`  
- card renders text truncated to 120 chars  
- word count badge shows correct value  
- clicking Copy calls `navigator.clipboard.writeText` with full text  
- clicking Re-fire calls `onRefire` with the entity  

---

### Task A.6 — Citation entity card renderer

**File:** `src/lib/renderer/entity-cards/citation-card.js`  
**Depends on:** 0.1

```js
// citationCard(entity) → HTMLElement
// Shows: favicon (via Google favicon API — best-effort, graceful fallback to globe icon),
// title (linked), domain pill, snippet preview (collapsible), "Open" button.
export function citationCard(entity) { … }
```

Click on title / Open button: `window.open(entity.url, '_blank', 'noopener')`.

**Test file:** `tests/entity-cards/citation-card.test.js`  
- title is rendered as a link with correct href  
- snippet is present in the DOM  
- "Open" button click calls `window.open` with entity.url  

---

### Task A.7 — Table entity card renderer

**File:** `src/lib/renderer/entity-cards/table-card.js`  
**Depends on:** 0.1

```js
// tableCard(entity) → HTMLElement
// Shows: header row, first 2 data rows as a mini <table>; "Show all N rows" expand toggle;
// "Copy as Markdown" button; "Export as CSV" button.
export function tableCard(entity) { … }
```

Copy as Markdown: serialise `headers` + `rows` back to pipe-delimited Markdown.  
Export as CSV: RFC 4180 serialisation → `Blob` → `URL.createObjectURL` → auto-click anchor download.

**Test file:** `tests/entity-cards/table-card.test.js`  
- card renders header and first 2 rows; remaining rows hidden initially  
- "Show all" toggle reveals all rows  
- Copy button writes correct Markdown to clipboard  
- CSV export creates the correct comma-separated string  

---

### Task A.8 — Entity-type filter chips for Entities search context

**File:** `sidepanel/sidepanel.html`, `sidepanel/controllers/search-controller.js`  
**Depends on:** 0.8, A.4

Add a `<div id="filterEntityTypes" class="filter-group" hidden>` inside `#searchFilterBar` with one chip per `ENTITY_TYPES` value. Chips follow the same `.filter-pill` pattern as source pills.

In `runEntitySearch(query)` in `search-controller.js`:
- Read `state.filters.entityTypes` (new `Set`)
- Filter `EntityStore.getAllByType()` results by active chips and query text
- Render results into `#searchResultsList` using entity card renderers

Add `entityTypes: new Set()` to `state.filters`.  
Add to `elements`: `filterEntityTypes`.

**Test file:** `tests/search-controller.test.js` (extend)  
- entity-type chips appear only when in Entities context  
- activating a chip sets the correct type in `state.filters.entityTypes`  
- `runEntitySearch` filters results to active entity types  

---

### Task A.9 — `EntityController` — Phase A tab initialisation

**File:** `sidepanel/controllers/entity-controller.js`  
**Depends on:** 0.4, 0.5, 0.7, 0.9, A.4, A.5, A.6, A.7

Create a minimal `EntityController` that:
1. Is lazily initialised on first switch to the Chat Entities tab (called from `switchTab('entities')` in `sidepanel.js`).
2. Creates an `EntityStore` backed by `() => state.chats`.
3. Instantiates `ChatEntityTree` with the `#entityTree` container, `EntityStore`, and the three Phase-A card renderers.
4. Calls `entityTree.render()`.
5. Exposes `refresh()` (called when a new chat is saved) and `setFilter(type)`.

Wire the entity-click event on `#entityTree` to call `openChatAtMessage`.

**Test file:** `tests/entity-controller.test.js` (new)  
- `init()` with chats containing prompts renders prompt cards  
- `refresh()` after adding a new chat re-renders the tree  
- entity-click event triggers `openChatAtMessage` with correct args  

---

### Phase A — Deliverables summary

| Task | New file | Tests |
|------|----------|-------|
| A.1 | `src/lib/entities/extractors/prompts.js` | `tests/extractors/prompts.test.js` |
| A.2 | `src/lib/entities/extractors/citations.js` | `tests/extractors/citations.test.js` |
| A.3 | `src/lib/entities/extractors/tables.js` | `tests/extractors/tables.test.js` |
| A.4 | `src/lib/entities/extractors/index.js` | *(extends entity-extractor.test.js)* |
| A.5 | `src/lib/renderer/entity-cards/prompt-card.js` | `tests/entity-cards/prompt-card.test.js` |
| A.6 | `src/lib/renderer/entity-cards/citation-card.js` | `tests/entity-cards/citation-card.test.js` |
| A.7 | `src/lib/renderer/entity-cards/table-card.js` | `tests/entity-cards/table-card.test.js` |
| A.8 | *(extends HTML + search-controller.js)* | *(extends search-controller.test.js)* |
| A.9 | `sidepanel/controllers/entity-controller.js` | `tests/entity-controller.test.js` |

### Phase A — What to verify end-to-end

1. Save a multi-turn chat that contains: (a) user prompts, (b) a Markdown table in a response, (c) a Perplexity-style `[1]` citation.
2. Open the Chat Entities tab → **By Type** view shows three sections: Prompts, Tables, Citations.
3. Each section expands to show the correct entities under the correct topic/chat grouping.
4. Clicking a prompt card opens the reader scrolled to the correct `#p<N>` turn.
5. The Entities search bar finds a prompt by keyword; the Tables chip filters to tables only.
6. "Copy as Markdown" on a table card writes valid Markdown to the clipboard.
7. All new unit tests pass (`npm test`).

---

## Phase B — Group B: Code & Structured Text (Snippets, Diagrams)

> Depends on Phase A (specifically A.4 for the extractor barrel and A.9 for `EntityController` extension).

### Task B.1 — `extractCodeSnippets(messages, doc, chatId)` extractor

**File:** `src/lib/entities/extractors/code-snippets.js`  
**Depends on:** 0.1

Regex-scan assistant messages for fenced code blocks: `/^```(\w*)\n([\s\S]*?)^```/gm`. Capture language (or `'text'` if omitted) and code body.

```js
// Entity fields: { language, code, lineCount }
export function extractCodeSnippets(messages, _doc, chatId) { … }
```

**Test file:** `tests/extractors/code-snippets.test.js`  
- single JS block → 1 entity with `language: 'javascript'`  
- two blocks in one message → 2 entities both with same `messageIndex`  
- fenced block with no language tag → `language: 'text'`  
- user-role messages excluded  

---

### Task B.2 — `extractDiagrams(messages, doc, chatId)` extractor

**File:** `src/lib/entities/extractors/diagrams.js`  
**Depends on:** 0.1

Two strategies:

1. **Fenced Mermaid blocks**: regex-scan for ` ```mermaid\n…\n``` ` in assistant messages. Detect `diagramType` from first identifier in the source (`flowchart`, `sequenceDiagram`, `erDiagram`, `gantt`, `classDiagram`, etc.).
2. **DOM `<svg>` capture** (when `doc` is not null): query all `<svg>` elements that are platform-rendered diagram outputs (heuristic: `<svg>` inside a `.mermaid` or `[data-diagram]` container). Capture `outerHTML` as `thumbnailSvg`.

Mermaid → SVG rendering is deferred: `thumbnailSvg` is left null at extraction time; a separate background pass can render it later (avoids bundling `mermaid` in the save-time content script).

```js
// Entity fields: { source, diagramType, thumbnailSvg }
export function extractDiagrams(messages, doc, chatId) { … }
```

**Test file:** `tests/extractors/diagrams.test.js`  
- Mermaid block with `flowchart LR` → `diagramType: 'flowchart'`  
- `sequenceDiagram` block → `diagramType: 'sequence'`  
- unknown diagram keyword → `diagramType: 'other'`  
- DOM strategy with mock `<svg class="mermaid">` → `thumbnailSvg` populated  

---

### Task B.3 — Code Snippet entity card renderer

**File:** `src/lib/renderer/entity-cards/code-card.js`  
**Depends on:** 0.1

```js
// codeCard(entity) → HTMLElement
// Shows: language badge, first 3 lines of code in <pre>, line count,
// Copy button, "Open in chat" link.
export function codeCard(entity, { onOpen }) { … }
```

**Test file:** `tests/entity-cards/code-card.test.js`  
- language badge shows correct language  
- `<pre>` contains only first 3 lines when code has more  
- Copy writes full `entity.code` to clipboard  
- clicking card fires `onOpen`  

---

### Task B.4 — Diagram entity card renderer

**File:** `src/lib/renderer/entity-cards/diagram-card.js`  
**Depends on:** 0.1

```js
// diagramCard(entity) → HTMLElement
// Shows: diagramType badge, inline <svg> if thumbnailSvg is present
//        (or a placeholder icon if null), "Copy source" button, "Download SVG" button.
export function diagramCard(entity, { onOpen }) { … }
```

Download SVG: `Blob(entity.thumbnailSvg, {type: 'image/svg+xml'})` → auto-click download.

**Test file:** `tests/entity-cards/diagram-card.test.js`  
- when `thumbnailSvg` is non-null, SVG is injected into card DOM  
- when `thumbnailSvg` is null, placeholder is shown  
- "Copy source" writes `entity.source` to clipboard  
- "Download SVG" creates a download link  

---

### Task B.5 — Register B.1–B.2 extractors; extend `EntityController`

**Files:** `src/lib/entities/extractors/index.js`, `sidepanel/controllers/entity-controller.js`  
**Depends on:** A.4, A.9, B.1, B.2, B.3, B.4

Add `registerExtractor('code', extractCodeSnippets)` and `registerExtractor('diagram', extractDiagrams)` to the barrel. Add `codeCard` and `diagramCard` to the `EntityController`'s card-renderer map.

**Test:** extend `tests/entity-controller.test.js`  
- chats with code snippets render code cards in the entity tree  
- chats with Mermaid blocks render diagram cards  

---

### Phase B — What to verify end-to-end

1. Save a chat containing a Python function in a fenced code block and a Mermaid flowchart block.
2. Chat Entities tab shows **Code Snippets** and **Diagrams** sections (in addition to Phase A sections).
3. Code card shows first 3 lines and the language badge `python`. Copy button copies full code.
4. Diagram card shows the `flowchart` type badge. Download SVG is shown (even if thumbnail is null at this stage).
5. All new unit tests pass.

---

## Phase C — Group C: API-Sourced Metadata (Tool-Use Traces, Attachments)

> Depends on Phase A (extractor barrel + `EntityController`). Tasks C.1–C.5 are independent.

### Task C.1 — `extractToolCalls(messages, doc, chatId)` extractor

**File:** `src/lib/entities/extractors/tool-calls.js`  
**Depends on:** 0.1

Detect tool invocation records in messages using two strategies (depending on what the platform API returns):

1. **Structured `tool_call` messages**: messages with `role === 'tool'` or `type === 'tool_use'` / `type === 'tool_result'` (Claude/ChatGPT API shapes). Extract `tool`, `input`, `output`.
2. **Heuristic text scan**: detect `> Web search:` / `> Ran code:` patterns in assistant prose (DOM fallback).

```js
// Entity fields: { tool, input, output, durationMs }
// tool: 'web_search' | 'code_interpreter' | 'function' | 'browser' | 'unknown'
export function extractToolCalls(messages, doc, chatId) { … }
```

Output is truncated to 10 000 chars before storage.

**Test file:** `tests/extractors/tool-calls.test.js`  
- message with `type: 'tool_use'` and `name: 'web_search'` → entity with `tool: 'web_search'`  
- message with `role: 'tool'` → entity with input/output populated  
- no tool messages → empty result  
- output longer than 10 000 chars is truncated  

---

### Task C.2 — `extractAttachments(messages, doc, chatId)` extractor

**File:** `src/lib/entities/extractors/attachments.js`  
**Depends on:** 0.1

Scan messages for attachment metadata. Two strategies:
1. **Structured `attachments[]` on message**: ChatGPT API returns `content.parts` of type `image_file` / `file_reference` with `filename` and `mime_type`.
2. **DOM scan** (when `doc` not null): query `[data-filename]`, `[data-file-type]`, `.attachment-name` elements in user-turn message containers.

```js
// Entity fields: { filename, mimeType, sizeBytes }
export function extractAttachments(messages, doc, chatId) { … }
```

**Test file:** `tests/extractors/attachments.test.js`  
- message with `content: [{ type: 'file_reference', filename: 'report.pdf' }]` → 1 attachment entity  
- DOM mock with `.attachment-name` → attachment captured  
- user-role and assistant-role messages both scanned  
- no attachment data → empty result  

---

### Task C.3 — Tool call entity card renderer

**File:** `src/lib/renderer/entity-cards/tool-call-card.js`  
**Depends on:** 0.1

```js
// toolCallCard(entity) → HTMLElement
// Shows: tool-type badge (icon + label), input summary (first 100 chars),
// output preview (first 150 chars), collapsible "Show full" section for
// complete input + output text.
export function toolCallCard(entity, { onOpen }) { … }
```

**Test file:** `tests/entity-cards/tool-call-card.test.js`  
- badge shows correct tool type  
- input is truncated to 100 chars in summary  
- "Show full" reveals complete input and output  
- clicking card fires `onOpen`  

---

### Task C.4 — Attachment entity card renderer

**File:** `src/lib/renderer/entity-cards/attachment-card.js`  
**Depends on:** 0.1

```js
// attachmentCard(entity) → HTMLElement
// Shows: file-type icon (determined from mimeType/extension), filename,
// size badge (if sizeBytes available), "Original file on [platform]" notice,
// "Go to message" link.
export function attachmentCard(entity, { onOpen }) { … }
```

**Test file:** `tests/entity-cards/attachment-card.test.js`  
- PDF mime type → PDF icon  
- size badge shows human-readable size (KB/MB)  
- "Original file" notice is present for all attachment cards  

---

### Task C.5 — Register C.1–C.2 extractors; extend `EntityController`

**Files:** `src/lib/entities/extractors/index.js`, `sidepanel/controllers/entity-controller.js`  
**Depends on:** A.9, C.1, C.2, C.3, C.4

Add registrations and card renderers.

**Test:** extend `tests/entity-controller.test.js`.

---

### Phase C — What to verify end-to-end

1. Save a ChatGPT chat that used code interpreter (check that the `messages[]` array from the API includes tool-use entries).
2. Chat Entities tab shows **Tool Calls** section with a `code_interpreter` badge.
3. Save a chat where a PDF was attached; Attachments section appears with the filename + "Original file" notice.
4. All new unit tests pass.

---

## Phase D — Group D: Binary / Visual Assets (Images, Audio)

> Depends on Phase A. Tasks D.1–D.5 are independent. **Note:** these tasks require careful handling of binary data (data URIs); tests must use synthetic test data, never real user content.

### Task D.1 — `extractImages(messages, doc, chatId)` extractor

**File:** `src/lib/entities/extractors/images.js`  
**Depends on:** 0.1

Scan messages and DOM for image content. Three sources:
1. **`content.parts` image entries**: ChatGPT / Claude API may include `{ type: 'image_url', url }` or `{ type: 'image_file', file_id }` in message content.
2. **Markdown `![alt](url)` syntax**: regex-scan assistant message text.
3. **DOM `<img>` tags** (when `doc` not null): query all `<img>` elements within assistant message containers; skip tracking/decorative images (< 10 px, `aria-hidden`, etc.).

Thumbnail generation (max 400 px) is deferred to `ThumbnailService` (see D.2). The extractor stores the raw `src` and a null `thumbnailDataUri`; the thumbnail pass runs in the content script before the message is sent to the background.

```js
// Entity fields: { src, mimeType, altText, thumbnailDataUri }
export function extractImages(messages, doc, chatId) { … }
```

**Test file:** `tests/extractors/images.test.js`  
- message with `![alt](https://…)` Markdown → 1 image entity  
- DOM `<img src="data:image/png;base64,…">` in assistant turn → captured  
- small/decorative `<img>` (< 10 px) in DOM → excluded  
- src > 5 MB data URI → stored but flagged; `thumbnailDataUri` = null  

---

### Task D.2 — `ThumbnailService` — image thumbnail generation

**File:** `src/lib/entities/thumbnail-service.js`  
**Depends on:** nothing external

A pure utility that takes an image URL or data URI and returns a resized data URI (max 400 px on the longest dimension) using an `OffscreenCanvas`.

```js
export async function generateThumbnail(src, maxPx = 400) {
  // Load image → OffscreenCanvas → scale → toDataURL
  // Returns null if src is inaccessible or canvas throws.
}
```

Called from the content script (not the background) so it runs in a context that has access to the rendered images.

**Test file:** `tests/thumbnail-service.test.js`  
- 800×600 image → 400×300 thumbnail  
- 200×200 image → returned unchanged (already ≤ maxPx)  
- inaccessible src → returns null without throwing  

---

### Task D.3 — `extractAudio(messages, doc, chatId)` extractor

**File:** `src/lib/entities/extractors/audio.js`  
**Depends on:** 0.1

Detect audio content in DOM and message metadata:
1. **DOM `<audio>` elements** (when `doc` not null): query all `<audio>` within message containers; capture `src`, attempt to read duration from `audio.duration`.
2. **Blob URL capture**: if `src` is a blob URL, immediately `fetch(blobUrl) → arrayBuffer()` and encode as base64 data URI before the page session ends. Cap at 10 MB; return `null` for src and set `captureError: 'too_large' | 'expired'` if unavailable.
3. **Transcript**: if a sibling `.transcript` or `[data-transcript]` element exists in the DOM, capture its `textContent`.

```js
// Entity fields: { src, mimeType, durationSeconds, transcript, captureError }
export function extractAudio(messages, doc, chatId) { … }
// NOTE: Returns a Promise (blob capture is async).
```

This extractor is the only one that returns a Promise; `extractChatEntities()` must `await` it.

**Test file:** `tests/extractors/audio.test.js`  
- DOM with `<audio src="blob:…">` → entity created; `fetch` called on blob URL  
- blob > 10 MB → `captureError: 'too_large'`, `src: null`  
- expired blob (fetch rejects) → `captureError: 'expired'`  
- `<audio>` with adjacent transcript text → `transcript` populated  

---

### Task D.4 — Image entity card renderer

**File:** `src/lib/renderer/entity-cards/image-card.js`  
**Depends on:** 0.1

```js
// imageCard(entity) → HTMLElement
// Shows: thumbnail <img> (from thumbnailDataUri or a placeholder),
// altText label, mimeType badge, "Open in chat" link.
export function imageCard(entity, { onOpen }) { … }
```

**Test file:** `tests/entity-cards/image-card.test.js`  
- `thumbnailDataUri` set → `<img src>` is that URI  
- `thumbnailDataUri` null → placeholder element rendered  
- altText appears in caption  

---

### Task D.5 — Audio entity card renderer

**File:** `src/lib/renderer/entity-cards/audio-card.js`  
**Depends on:** 0.1

```js
// audioCard(entity) → HTMLElement
// Shows: duration badge, inline <audio controls> (if src non-null),
// "Audio not saved" notice (if captureError set),
// collapsible transcript section (if transcript non-null).
export function audioCard(entity, { onOpen }) { … }
```

**Test file:** `tests/entity-cards/audio-card.test.js`  
- `src` set → `<audio controls>` rendered with that src  
- `captureError` set → notice replaces audio player  
- transcript non-null → collapsible section rendered  

---

### Task D.6 — Register D.1, D.3 extractors; extend `EntityController`

**Files:** `src/lib/entities/extractors/index.js`, `sidepanel/controllers/entity-controller.js`, `entity-extractor.js` (make async-aware)  
**Depends on:** A.9, D.1, D.3, D.4, D.5

Update `extractChatEntities()` to `await` async extractors. Add registrations and card renderers.

**Test:** extend `tests/entity-extractor.test.js` (async extractor behaviour).

---

### Phase D — What to verify end-to-end

1. Save a chat that contains an inline image (e.g. ChatGPT generated image in a response).
2. Chat Entities tab → Images section shows thumbnail card.
3. Save a Gemini voice-mode chat with an `<audio>` element; Audio section shows duration and inline player.
4. Audio blob capture: if blob is expired (saving from a closed tab context), card shows the "Audio not saved" notice.
5. All new unit tests pass.

---

## Phase E — Group E: Complex Rendering (Artifacts & Canvas)

> Depends on Phase A. Most complex phase — sandboxed preview, screenshot capture, deep DOM detection.

### Task E.1 — `extractArtifacts(messages, doc, chatId)` extractor

**File:** `src/lib/entities/extractors/artifacts.js`  
**Depends on:** 0.1

Detect artifact containers in the rendered DOM. DOM-only; returns empty when `doc` is null.

Two platform strategies:
1. **Claude Artifacts**: query `[data-artifact-type]` or `.artifact-container`. Capture `type` attribute (`html`/`react`/`svg`/`text`/`code`), `title` from adjacent heading element, and source from the artifact panel's `<pre>` or `<textarea>`.
2. **ChatGPT Canvas**: query `.canvas-panel` or `[data-panel="canvas"]`. Capture content HTML.

```js
// Entity fields: { artifactType, title, source, mimeType, screenshotDataUri }
// screenshotDataUri is null at extraction time; set by ArtifactScreenshotService (E.2).
export function extractArtifacts(messages, doc, chatId) { … }
```

**Test file:** `tests/extractors/artifacts.test.js`  
- mock DOM with `[data-artifact-type="html"]` → entity with `artifactType: 'html'`  
- mock DOM with Claude text artifact → `mimeType: 'text/plain'`  
- no artifact DOM elements → empty result  
- `doc` null → empty result  

---

### Task E.2 — `ArtifactScreenshotService` — thumbnail screenshot capture

**File:** `src/lib/entities/artifact-screenshot.js`  
**Depends on:** nothing external (uses existing `chrome.tabs.captureVisibleTab` or `html2canvas`)

```js
// Renders artifact source in a hidden sandboxed iframe, waits for load,
// captures a screenshot as a data URI.
export async function captureArtifactScreenshot(source, mimeType, maxPx = 280) {
  // Create <iframe sandbox="allow-scripts" srcdoc="…">
  // Wait for load event, then use html2canvas or canvas.drawImage
  // Returns dataUri string or null on failure.
}
```

**Test file:** `tests/artifact-screenshot.test.js`  
- resolves to a data URI string for valid HTML source  
- resolves to null for empty source  
- rejects are caught; returns null rather than propagating  

---

### Task E.3 — Sandboxed artifact preview panel

**File:** `sidepanel/features/artifact-preview.js`, `sidepanel/sidepanel.html`, `sidepanel/sidepanel.css`  
**Depends on:** E.1

A slide-in panel that mounts on demand over the entity panel. Contains:
- A `<iframe id="artifactFrame" sandbox="allow-scripts">` (no `allow-same-origin`, no `allow-top-navigation`, no network).
- Close button, source‐copy button, download button.
- `srcdoc` attribute set to `entity.source` for `html`/`react`/`svg` types; plain text in `<pre>` for `text` type.

```js
export function showArtifactPreview(entity) { … }
export function hideArtifactPreview() { … }
```

**Test file:** `tests/artifact-preview.test.js`  
- `showArtifactPreview(entity)` sets `iframe.srcdoc` to entity.source  
- `hideArtifactPreview()` removes/hides the panel  
- close button calls `hideArtifactPreview`  

---

### Task E.4 — Artifact entity card renderer

**File:** `src/lib/renderer/entity-cards/artifact-card.js`  
**Depends on:** 0.1, E.3

```js
// artifactCard(entity) → HTMLElement
// Shows: title, artifactType badge (HTML / React / SVG / Text),
// screenshot thumbnail (or placeholder), "Preview" button (opens artifact-preview),
// "Copy source" button, "Download" button.
export function artifactCard(entity, { onPreview, onOpen }) { … }
```

**Test file:** `tests/entity-cards/artifact-card.test.js`  
- type badge shows correct label  
- screenshot shown when `screenshotDataUri` set  
- "Preview" button calls `onPreview` with entity  
- "Download" generates correct file extension per `mimeType`  

---

### Task E.5 — Register E.1 extractor; extend `EntityController`; wire preview

**Files:** `src/lib/entities/extractors/index.js`, `sidepanel/controllers/entity-controller.js`  
**Depends on:** A.9, E.1, E.4, E.3

Add extractor registration and card renderer. Wire `onPreview` callback to `showArtifactPreview`.

---

### Phase E — What to verify end-to-end

1. Save a Claude chat that produced an HTML artifact.
2. Chat Entities tab → Artifacts section shows the artifact card with type badge `HTML`.
3. Clicking "Preview" opens the sandboxed preview panel with the rendered artifact.
4. Clicking "Copy source" copies `entity.source` to clipboard.
5. Download button downloads the file as `artifact.html`.
6. Opening devtools on the sandboxed iframe confirms: no cookies, no `localStorage`, no external network requests possible.
7. All new unit tests pass.

---

## Cross-cutting: Post-Phase-E work

Once all entity types are implemented:

### `refresh()` on chat save

`EntityController.refresh()` is called from `handleChatSaved()` in `chat-actions.js` so newly extracted entities appear in the Chat Entities tab immediately after a save, without requiring a panel reload.

### `EntityStore.getPresentTypes()` → dynamic tab/chip visibility

The Chat Entities tab header applies `EntityStore.getPresentTypes()` to hide type sections (and search chips) for types that have zero entities across all saved chats. This keeps the UI clean for users who have only ever saved text-only chats.

### C.25 hover overlay integration

`EntityStore.getForChat(chatId)` is called by the hover overlay builder (C.25) to populate entity counts (`Tables: 2`, `Code: 5`, etc.) alongside the existing prompt/response counts.

---

## Completion protocol

At the end of each phase:

1. Run the full test suite (`npm test -- --run`) and confirm zero new failures.
2. Update **this file** — mark the phase status as ✅ Completed with the date.
3. Update **`whats-next.md`** — add ✅ COMPLETED and the date to the relevant group row in the Chat Entities Manager effort summary table, and update the header "Last updated" line.

---

## Status tracker

| Phase | Status | Completed |
|-------|--------|-----------|
| 0 — Shared infrastructure | Not started | — |
| A — Text entities (Prompts, Citations, Tables) | Not started | — |
| B — Code entities (Snippets, Diagrams) | Not started | — |
| C — Metadata entities (Tool Traces, Attachments) | Not started | — |
| D — Binary entities (Images, Audio) | Not started | — |
| E — Complex rendering (Artifacts & Canvas) | Not started | — |
