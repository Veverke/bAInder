# C.18 — Chat Diff Work Plan
## Intelligent Reasoning & Conclusion Comparison

**Created:** March 12, 2026  
**Status:** ✅ Completed — March 12, 2026

---

## Use-Case Clarity

This feature is **not** about helping a user understand an unfamiliar chat.
The user already knows what each chat is about, has read it, and has understood it.

**The actual goal:** The user submits the same query to multiple AI chatbots. They then select those saved chats in bAInder and press **Compare**. The compare page must answer:

- Where do these chats **agree** in their reasoning and conclusions?
- Where do they **diverge** — and how significantly?
- Which chat's response is more **definitive** (vs. hedged/uncertain)?
- What is the **synthesised actionable guidance** that combines the strongest points from all chats?

This is reasoning-quality comparison, not topic discovery. Zero-shot categorisation, entity extraction, and topic tagging are **out of scope** for this feature.

---

## Library Decisions

| Library | Purpose | License | Size |
|---|---|---|---|
| `@xenova/transformers` + `all-MiniLM-L6-v2` | Sentence embeddings → cosine similarity between reasoning turns | Apache 2.0 | ~23 MB model (cached; not bundled) |
| `diff-match-patch` | Word-level literal text diff between corresponding turns | Apache 2.0 | ~50 KB |
| *(pure JS)* | Structural metrics (heading/code/list counts, turn lengths) | n/a | 0 KB |
| *(pure JS)* | Confidence-marker scoring (hedging vs. assertive language) | n/a | 0 KB |

`compromise`, TF-IDF, and zero-shot classification are **not used** — they address topic discovery, which is not the use case.

---

## Architecture Overview

```
src/
  compare/
    compare.html          ← new extension page (parallel to reader.html)
    compare.js            ← page init, chat loading, panel rendering, analysis orchestration
    compare.css           ← grid layout, panel chrome, analysis card styles
  sidepanel/
    features/
      compare.js          ← new: handles Compare button click, opens compare page
    app-context.js        ← add compareBtn element reference
    sidepanel.html        ← add compareBtn to selectionBar
  lib/
    analysis/             ← new directory, all new analysis modules
      structural-analyser.js
      turn-differ.js
      semantic-analyser.js
      reasoning-synthesiser.js
vite.config.js            ← add compare entry point
```

---

## Phase 1 — UI Entry Point & Compare Page Shell

**Goal:** The Compare button appears in the selection bar, is enabled when ≥ 2 chats are selected, and opens a working compare page that renders N chat panels side-by-side with no analysis yet. The entire navigation flow is wired and tested.

### Atomic Tasks

#### Task 1.1 — Add `compareBtn` to `sidepanel.html`

Inside `#selectionBar .selection-bar__actions`, after `#copyAllBtn` and before `#selectionClearBtn`:

```html
<!-- C.18 — Compare selected chats -->
<button id="compareBtn" class="selection-bar__btn selection-bar__btn--primary"
        disabled title="Select at least 2 chats to compare">
  <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
    <path d="M3 2v12M13 2v12M7 2v12M3 2h4M3 14h4M9 2h4M9 14h4"
          stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
  </svg>
  Compare
</button>
```

#### Task 1.2 — Register `compareBtn` in `app-context.js`

Add to the `elements` export object (alongside the existing C.17 entries):

```js
compareBtn: document.getElementById('compareBtn'),
```

#### Task 1.3 — Enable/disable `compareBtn` in `multi-select.js`

In `updateSelectionBar(count)`, add:

```js
if (elements.compareBtn) {
  elements.compareBtn.disabled = count < 2;
  elements.compareBtn.title = count < 2
    ? 'Select at least 2 chats to compare'
    : `Compare ${count} chats`;
}
```

#### Task 1.4 — Create `src/sidepanel/features/compare.js`

Single-responsibility module that handles the Compare button click:

```js
// Reads selected chats from the renderer, serialises their IDs into the URL,
// and opens the compare page in a new tab.
import { state } from '../app-context.js';
import browser from '../../lib/vendor/browser.js';

export async function handleCompare() {
  const chats = state.renderer?.getSelectedChats();
  if (!chats || chats.length < 2) return;
  const ids = chats.map(c => encodeURIComponent(c.id)).join(',');
  const url = browser.runtime.getURL(`src/compare/compare.html?ids=${ids}`);
  await browser.tabs.create({ url });
}
```

#### Task 1.5 — Wire `compareBtn` in `sidepanel.js`

Alongside the existing `assembleBtn` and `exportDigestBtn` wiring:

```js
import { handleCompare } from './features/compare.js';
elements.compareBtn?.addEventListener('click', handleCompare);
```

#### Task 1.6 — Create `src/compare/compare.html`

Skeleton HTML page, parallel to `src/reader/reader.html`. Links `compare.css` and `compare.js`. Contains:

```html
<header class="compare-header">
  <h1 class="compare-title">Chat Comparison</h1>
  <div id="compareHeaderMeta" class="compare-header__meta"></div>
</header>
<main>
  <div id="comparePanels" class="compare-panels"></div>
  <section id="analysisSummary" class="analysis-summary" hidden></section>
</main>
```

#### Task 1.7 — Create `src/compare/compare.css`

Grid layout:

- `.compare-panels` → `display: grid; grid-template-columns: repeat(var(--panel-count, 2), 1fr); gap: 1rem;`
- For N > 3: `overflow-x: auto; min-width: calc(var(--panel-count) * 320px)`
- `.compare-panel` → panel card with header (source badge + chat title) and scrollable body
- Scroll-sync JS will set `scrollTop` via JS, not CSS
- `.analysis-summary` → stacked cards below the panels

#### Task 1.8 — Create `src/compare/compare.js` (stub)

`init()` flow:
1. Parse `?ids=id1,id2,...` from `URLSearchParams`; guard: < 2 IDs → show error state.
2. Load each chat from `browser.storage.local` (same call pattern as `reader.js`).
3. Set CSS `--panel-count` on `#comparePanels`.
4. Render N `.compare-panel` columns — each shows the chat title, source badge, and all messages rendered as plain markdown (re-use the markdown rendering utilities from reader).
5. Wire scroll-sync: on scroll of any panel, set all siblings' `scrollTop` to match.
6. Analysis section remains hidden (next phases populate it).

#### Task 1.9 — Add `compare` entry to `vite.config.js`

```js
compare: resolve(__dirname, 'src/compare/compare.html'),
```

### Phase 1 — Tests

**`tests/compare-navigation.test.js`**

| Test | Assertion |
|---|---|
| `handleCompare` with 0 selected chats | returns immediately, no `tabs.create` call |
| `handleCompare` with 1 selected chat | returns immediately, no `tabs.create` call |
| `handleCompare` with 2 selected chats | calls `browser.tabs.create` with URL containing both IDs |
| `handleCompare` with 3 selected chats | URL contains all 3 IDs comma-separated |
| IDs with special characters | IDs are `encodeURIComponent`-encoded in the URL |

**`tests/compare-page.test.js`**

| Test | Assertion |
|---|---|
| `init()` with 0 IDs in URL | renders error state, no panels |
| `init()` with 1 ID in URL | renders error state (need ≥ 2) |
| `init()` with 2 valid IDs | loads both chats; renders 2 `.compare-panel` elements |
| `init()` with 3 valid IDs | renders 3 `.compare-panel` elements |
| Storage load failure for one ID | renders error card for that panel, others render normally |
| `--panel-count` CSS var | set to the number of loaded chats |
| `#analysisSummary` | remains `hidden` after Phase 1 init |

### Phase 1 — Deliverables

- `compareBtn` in selection bar, enabled/disabled correctly on selection changes
- Clicking Compare opens a new tab with the compare page
- Compare page renders N chat panels side-by-side, scroll-synced
- All navigation and load-error cases covered by unit tests

**Last task of Phase 1:** Update this document — mark Phase 1 as ✅ Completed with the completion date.

**Phase 1 completed: March 12, 2026**

---

## Phase 2 — Structural Analysis Card

**Goal:** The compare page shows a "Structure" analysis card below the panels. It presents a per-chat breakdown of structural metrics (heading count, code blocks, list items, tables, paragraphs, avg turn word count). No external dependencies.

### Atomic Tasks

#### Task 2.1 — Create `src/lib/analysis/structural-analyser.js`

Pure function, no imports. Accepts a list of assistant-turn markdown strings:

```js
/**
 * @param {string[]} assistantTurns  Raw markdown of each assistant response
 * @returns {{
 *   headings:   number,
 *   codeBlocks: number,
 *   listItems:  number,
 *   tables:     number,
 *   paragraphs: number,
 *   avgTurnWords: number,
 *   totalWords:   number,
 * }}
 */
export function analyseStructure(assistantTurns) { ... }
```

Detection rules (all pure regex, no parsing library):
- `headings`: lines matching `/^#{1,6}\s/m`
- `codeBlocks`: count of opening ` ``` ` fences
- `listItems`: lines matching `/^[\s]*[-*+]\s|^\d+\.\s/m`
- `tables`: lines matching `/^\|/m`
- `paragraphs`: blocks of consecutive non-empty lines separated by blank lines (excluding code blocks and list items)
- `totalWords`: split on whitespace after stripping code blocks and markdown symbols
- `avgTurnWords`: `totalWords / assistantTurns.length` (0 if no turns)

#### Task 2.2 — Wire "Structure" card into `compare.js`

After rendering panels, call `analyseStructure` for each chat's assistant turns. Render a card in `#analysisSummary`:

- Card title: "Structure"
- A table with one column per chat: heading counts, code blocks, list items, tables, paragraphs, avg turn words, total words
- Values that differ across chats are highlighted (e.g. bold + subtle background tint)
- Show `#analysisSummary` (remove `hidden`)

#### Task 2.3 — Extract assistant turns utility

`src/lib/analysis/chat-turns.js` — pure function:

```js
/**
 * Extract only the assistant (non-user) turn content strings from a ChatEntry.
 * @param {ChatEntry} chat
 * @returns {string[]}
 */
export function extractAssistantTurns(chat) {
  return chat.messages
    .filter(m => m.role === 'assistant')
    .map(m => m.content ?? '');
}
```

This utility is shared across all analysis modules.

### Phase 2 — Tests

**`tests/structural-analyser.test.js`**

| Test | Assertion |
|---|---|
| Empty turns array | all counts = 0 |
| Single turn with 2 headings | `headings === 2` |
| Single turn with fenced code block | `codeBlocks === 1` |
| Turn with unordered list (3 items) | `listItems === 3` |
| Turn with ordered list (2 items) | `listItems === 2` |
| Turn with markdown table | `tables >= 1` |
| Two turns, known word counts | `totalWords`, `avgTurnWords` correct |
| Paragraphs: 3 prose blocks separated by blank lines | `paragraphs === 3` |
| Code blocks excluded from word count | words inside ` ``` ` not counted |
| Mixed content (headings + code + list + prose) | all fields non-zero and correct |

**`tests/chat-turns.test.js`**

| Test | Assertion |
|---|---|
| Chat with only user messages | returns `[]` |
| Chat with alternating user/assistant | returns only assistant content strings |
| Assistant turn with empty `content` | mapped to `''`, not dropped |

### Phase 2 — Deliverables

- `analyseStructure()` function, fully tested
- `extractAssistantTurns()` utility, fully tested
- "Structure" card visible in compare page showing per-chat structural breakdown
- Differing values highlighted in the table

**Last task of Phase 2:** Update this document — mark Phase 2 as ✅ Completed with the completion date.

**Phase 2 completed: March 12, 2026**

---

## Phase 3 — Word-Level Diff

**Goal:** Each chat's corresponding assistant turns are diffed word-by-word against the **auto-selected reference chat** (the medoid — computed automatically in Phase 4 from sentence embeddings). For Phase 3, the reference defaults to chat index 0; Phase 4 upgrades it to the true medoid once embeddings are available. Inserted words appear with `<ins>` styling (green underline), deleted words with `<del>` styling (red strikethrough). **No manual pair picker is exposed** — the reference is always auto-selected, keeping the UI clean for any N.

**Scaling design:** For N chats, Phase 3 renders N−1 diff views (each non-reference chat vs. the reference), not N² pairs. This is O(N), not O(N²), and requires no user interaction to manage.

**New dependency:** `diff-match-patch` (Apache 2.0, ~50 KB).

### Atomic Tasks

#### Task 3.1 — Install `diff-match-patch`

```
npm install diff-match-patch
```

#### Task 3.2 — Create `src/lib/analysis/turn-differ.js`

```js
import { diff_match_patch, DIFF_INSERT, DIFF_DELETE, DIFF_EQUAL }
  from 'diff-match-patch';

/**
 * Diff two assistant turn strings word-by-word.
 * Returns an array of { type: 'insert'|'delete'|'equal', text: string }.
 * @param {string} textA
 * @param {string} textB
 * @returns {Array<{type: string, text: string}>}
 */
export function diffTurns(textA, textB) { ... }

/**
 * Convert a diffTurns result to HTML with <ins> / <del> / text nodes.
 * @param {Array<{type: string, text: string}>} diffs
 * @returns {string}  safe HTML string
 */
export function diffToHtml(diffs) { ... }

/**
 * Diff N corresponding turns between chat A (reference) and chat B.
 * Short chat is padded with empty turns.
 * @param {string[]} turnsA
 * @param {string[]} turnsB
 * @returns {string[]}  array of HTML strings, one per turn
 */
export function diffAllTurns(turnsA, turnsB) { ... }
```

Implementation notes:
- Use `dmp.diff_wordMode()` (not character mode) or split on whitespace, run `diff_main`, then `diff_cleanupSemantic` for readable output.
- `diffToHtml` must escape plain text runs through `escapeHtml` before wrapping in tags to prevent XSS.
- Neither `<ins>` nor `<del>` content is ever set via `innerHTML` without escaping.

#### Task 3.3 — Render diff panels in `compare.js`

- Reference chat: chat index 0 (Phase 4 will upgrade this to the true medoid).
- For each non-reference panel, replace the rendered markdown in assistant turns with diff-annotated HTML (`innerHTML` set from `diffToHtml` output — safe because content is escaped in `diffToHtml`).
- The reference panel itself is rendered with no diff decoration — it is the baseline.
- User turns are rendered normally (no diff) in all panels.
- A small read-only label "Reference (auto): [chat title]" is shown in the compare page header — informational only, no interactive picker.

#### Task 3.4 — CSS for diff highlighting

In `compare.css`:

```css
ins.diff-ins { text-decoration: underline; color: var(--diff-insert-color, #1a7f37); }
del.diff-del { text-decoration: line-through; color: var(--diff-delete-color, #cf222e); }
```

Respects dark/light theme via CSS variables.

### Phase 3 — Tests

**`tests/turn-differ.test.js`**

| Test | Assertion |
|---|---|
| Identical strings | result contains only `equal` segments |
| Completely different strings | result contains `insert` and `delete`, no `equal` |
| One word inserted in B | that word has type `insert` in result |
| One word deleted from A | that word has type `delete` in result |
| `diffToHtml` equal segment | plain text, no tags |
|`diffToHtml` insert segment | wrapped in `<ins class="diff-ins">` |
| `diffToHtml` delete segment | wrapped in `<del class="diff-del">` |
| `diffToHtml` with HTML special chars in text | `<`, `>`, `&` are escaped, no XSS |
| `diffAllTurns` with unequal turn counts | shorter side padded with empty turns |
| `diffAllTurns` 3-turn each | returns 3 HTML strings |

### Phase 3 — Deliverables

- Word-level diff rendered in all non-reference panels (each vs. reference chat index 0)
- "Reference (auto)" label shown in compare page header
- `<ins>`/`<del>` spans styled per theme
- No manual pair picker — diff is always reference-relative, O(N)
- All diff logic fully unit-tested including XSS-safety of `diffToHtml`

**Last task of Phase 3:** Update this document — mark Phase 3 as ✅ Completed with the completion date.

**Phase 3 completed: March 12, 2026**

---

## Phase 4 — Semantic Reasoning Alignment

**Goal:** For each pair of corresponding assistant turns, compute a semantic similarity score using sentence embeddings from `@xenova/transformers`. Turns with low similarity are flagged as **reasoning divergence points**. The compare page shows a "Reasoning Alignment" card with per-turn scores and an overall alignment percentage.

**New dependency:** `@xenova/transformers` (Apache 2.0). Model `all-MiniLM-L6-v2` (~23 MB, fetched once from HuggingFace CDN and cached by the browser — **not bundled** into the extension).

### Decision Rationale

`all-MiniLM-L6-v2` is a sentence-transformer trained specifically to produce semantically meaningful sentence embeddings. Two paragraphs expressing the same conclusion in different words will have a cosine similarity near 1.0. Two paragraphs that reach opposite conclusions will have a score near 0.0 or negative. This is exactly the signal needed to identify reasoning divergence — something that word-level diff or TF-IDF cannot do.

### Atomic Tasks

#### Task 4.1 — Create `src/lib/analysis/semantic-analyser.js`

```js
/**
 * semantic-analyser.js
 *
 * Lazy-loads all-MiniLM-L6-v2 via @xenova/transformers on first call.
 * Converts assistant turns into sentence embeddings and computes cosine
 * similarity between corresponding turns across two chats.
 *
 * No external API calls — inference runs entirely in the browser via ONNX/WASM.
 */

let pipeline = null;

/**
 * Load the embedding pipeline on first use.
 * Subsequent calls return the cached instance.
 * @param {(progress: number) => void} [onProgress]  0–100
 */
export async function loadEmbeddingPipeline(onProgress) { ... }

/**
 * Embed an array of text strings.
 * @param {string[]} texts
 * @returns {Promise<Float32Array[]>}  one embedding vector per text
 */
export async function embedTexts(texts) { ... }

/**
 * Cosine similarity between two Float32Array vectors.
 * @param {Float32Array} a
 * @param {Float32Array} b
 * @returns {number}  range [-1, 1]
 */
export function cosineSimilarity(a, b) { ... }

/**
 * Compute the centroid (element-wise mean) of an array of embedding vectors.
 * @param {Float32Array[]} embeddings
 * @returns {Float32Array}
 */
export function computeCentroid(embeddings) { ... }

/**
 * Find the medoid — the embedding index closest (highest cosine similarity) to the centroid.
 * This is the auto-selected reference chat for diffs and alignment scoring.
 * @param {Float32Array[]} embeddings
 * @returns {number}  index of the medoid
 */
export function computeMedoid(embeddings) { ... }

/**
 * Compare N chats using the auto-medoid as reference.
 * Each non-medoid chat is scored against the medoid per turn.
 *
 * @param {string[][]} allTurns  one entry per chat, each an array of assistant turn strings
 * @returns {Promise<{
 *   medoidIndex:   number,       // auto-selected reference chat index
 *   turnScores:    (number|null)[][], // [chatIndex][turnIndex] cosine similarity, null if unmatched
 *   overallScores: number[],     // per-chat weighted avg vs medoid (medoid itself = 1.0)
 *   divergentTurns: number[],    // turn indices where ≥1 chat scores < DIVERGENCE_THRESHOLD
 * }>}
 */
export async function compareReasoningTurns(allTurns) { ... }
```

Implementation notes:
- `DIVERGENCE_THRESHOLD = 0.65` — turns below this score are considered meaningfully divergent (tunable constant exported for test overrides).
- Similarity is clamped to `[0, 1]` before display (raw cosine can be slightly negative for orthogonal vectors, which maps to "no agreement").
- Pairs with one empty turn (unequal turn counts) get score `null` — rendered as "N/A" in the UI.

#### Task 4.2 — Model loading UX in `compare.js`

Before running Phase 4 analysis:
1. Show a loading bar / spinner in `#analysisSummary` with text: "Loading reasoning model… (first use only)"
2. Pass a `onProgress` callback to `loadEmbeddingPipeline` that updates the bar.
3. After loading completes, proceed to `compareReasoningTurns` and render the card.
4. If loading fails (offline, CSP error), show a graceful fallback card: "Semantic analysis unavailable — model could not load."

#### Task 4.3 — Render "Reasoning Alignment" card

Layout for any N (reference-relative, always O(N)):

```
Reasoning Alignment
─────────────────────────────────────────────────
Reference (auto): Chat B  [most representative]

           Chat A  Chat B(ref)  Chat C  Chat D
Overall    78%     —            44% ⚠   73%

Turn 1     82%     —            51% ⚠   79%
Turn 2     97% ✓   —            92% ✓   88% ✓
Turn 3     41% ⚠   —            11% ⚠   65%
Turn 4     71%     —            62%     71%
```

Visual: horizontal bar per cell, colour-coded — green ≥ 80%, amber 65–79%, red < 65%.
The reference column shows `—` (it is the baseline, not scored against itself).
Chats with `overallScore < DIVERGENCE_THRESHOLD` are flagged as outliers in the column header.

Divergent turns are cross-referenced to the panels — clicking a divergent turn badge scrolls all panels to that turn.

### Phase 4 — Tests

**`tests/semantic-analyser.test.js`**

The Transformers.js pipeline is **mocked** entirely — tests verify the orchestration logic and math, not the ML model.

| Test | Assertion |
|---|---|
| `cosineSimilarity` of identical vectors | returns 1.0 |
| `cosineSimilarity` of orthogonal vectors | returns 0.0 |
| `cosineSimilarity` of opposite vectors | returns -1.0 |
| `cosineSimilarity` of zero vector | returns 0 (no division by zero) |
| `computeCentroid` of 2 identical vectors | centroid equals that vector |
| `computeCentroid` of 2 opposite vectors | centroid is the zero vector |
| `computeMedoid` with 3 vecs, one closest to centroid | returns correct index |
| `computeMedoid` with 1 vec | returns index 0 |
| `compareReasoningTurns` 2 chats, identical embeddings | `overallScores` both near 1; `medoidIndex` is 0 or 1 |
| `compareReasoningTurns` with outlier chat | outlier `overallScore` < threshold; appears in `divergentTurns` |
| `compareReasoningTurns` N=4 chats | `overallScores` has 4 entries; medoid entry = 1.0 |
| Unequal turn counts across chats | unmatched turns get score `null` |
| Overall weighted average | longer turns (more words) contribute more weight |
| `loadEmbeddingPipeline` called twice | returns same cached instance (no double-load) |
| Pipeline load failure | `compareReasoningTurns` rejects; compare.js catches and shows fallback |

### Phase 4 — Deliverables

- `semantic-analyser.js` with `computeCentroid`, `computeMedoid`, full embedding + cosine logic
- Auto-medoid computed from embeddings; reference chat label updated in compare page header (replacing Phase 3's placeholder index 0)
- Phase 3 diff panels re-rendered automatically using true medoid as reference
- "Reasoning Alignment" card: reference-relative O(N) layout, colour-coded bars, divergence flags, outlier chat flagging
- Divergent-turn scroll anchors linking card to panel positions
- Graceful offline/CSP fallback
- All orchestration and math logic unit-tested with mocked pipeline

**Last task of Phase 4:** Update this document — mark Phase 4 as ✅ Completed with the completion date.

**Phase 4 completed: March 12, 2026**

---

## Phase 5 — Confidence Scoring & Synthesis Card

**Goal:** The compare page's crown feature: a "Synthesis" card that answers the user's core question — *"Which chat gives me more confident, actionable guidance, and where should I trust which one?"*

Pure JS, no new dependencies.

### Atomic Tasks

#### Task 5.1 — Create `src/lib/analysis/reasoning-synthesiser.js`

```js
/**
 * reasoning-synthesiser.js
 *
 * Pure JS analysis of reasoning confidence and actionability.
 * No external dependencies.
 */

// Hedging phrases reduce confidence score
const HEDGING_PATTERNS = [
  /\b(may|might|could|possibly|perhaps|potentially|seems? to|appears? to|
      it is (possible|likely)|one (possibility|option)|unclear|uncertain|
      depends (on|upon)|varies|not (definitive|conclusive))\b/gi,
];

// Assertive phrases increase confidence score
const ASSERTIVE_PATTERNS = [
  /\b(clearly|definitely|certainly|the (answer|solution|recommendation) is|
      you should|always|never|must|will|is the best|recommend(ed)?|
      the correct|specifically|in conclusion|therefore|thus)\b/gi,
];

/**
 * Score the confidence/assertiveness of a text passage.
 * Returns a value in [0, 1]: 0 = pure hedging, 1 = fully assertive.
 * @param {string} text
 * @returns {number}
 */
export function scoreConfidence(text) { ... }

/**
 * Extract the conclusion from a chat — the last 1–2 assistant turns,
 * stripped of markdown formatting, truncated to ~300 words.
 * @param {string[]} assistantTurns
 * @returns {string}
 */
export function extractConclusion(assistantTurns) { ... }

/**
 * Synthesise a comparison report for N chats.
 * @param {Array<{label: string, turns: string[], overallSimilarity: number}>} chats
 * @returns {{
 *   confidenceScores: number[],    // one per chat
 *   mostDefinitive:   number,      // index of most assertive chat
 *   conclusions:      string[],    // extracted conclusion per chat
 *   agreements:       string[],    // high-level consensus points (Phase 4 high-score turns)
 *   divergences:      string[],    // high-level conflict points (Phase 4 low-score turns)
 *   synthesisNote:    string,      // plain-English summary
 * }}
 */
export function synthesise(chats) { ... }
```

`synthesisNote` generation rules (pure string logic, no AI):
- If all chats score ≥ 80% similarity: "All chats broadly agree. [Most definitive chat label] expresses the highest confidence."
- If one chat scores outlier high confidence and others are hedged: "Prefer [label]'s guidance — it is the most definitive. Others are more exploratory."
- If scores diverge (< 65% similarity on ≥ 1 turn): "Chats differ on [N] reasoning points. Review the highlighted divergent turns before acting."

#### Task 5.2 — Render "Synthesis" card in `compare.js`

Layout:

```
Synthesis
─────────────────────────────────────────────────
Confidence     Chat A ████████░░ 82%   Chat B ████░░░░░░ 43%

Most definitive: Chat A

Conclusion (A): "Use approach X because it guarantees Y under all conditions..."
Conclusion (B): "It may be worth considering X, though Y could also work..."

Note: Chat B is significantly more hedged. Chat A's recommendation is more
actionable. One reasoning divergence identified — see Turn 3.
─────────────────────────────────────────────────
```

This card is always rendered last, below the other analysis cards, as the summary the user uses to make a decision.

#### Task 5.3 — Pass Phase 4 similarity data into synthesiser

`synthesise()` accepts the `overallSimilarity` from Phase 4 results so `synthesisNote` can reference agreement level. If Phase 4 was unavailable (model failed to load), similarity is passed as `null` and the note omits agreement phrasing.

### Phase 5 — Tests

**`tests/reasoning-synthesiser.test.js`**

| Test | Assertion |
|---|---|
| `scoreConfidence` on fully hedged text | score < 0.3 |
| `scoreConfidence` on fully assertive text | score > 0.7 |
| `scoreConfidence` on balanced text | score ≈ 0.5 (±0.2) |
| `scoreConfidence` on empty string | returns 0 |
| `extractConclusion` with 1 turn | returns that turn (truncated) |
| `extractConclusion` with 5 turns | returns last 1–2 turns |
| `extractConclusion` with empty turns array | returns `''` |
| `extractConclusion` strips markdown headings | output has no `##` prefixes |
| `synthesise` all high-similarity chats | `synthesisNote` references agreement |
| `synthesise` with one dominant assertive chat | `mostDefinitive` points to that chat; note calls it out |
| `synthesise` with divergent chats | `synthesisNote` references divergences |
| `synthesise` with `overallSimilarity: null` | note generated without agreement phrasing |
| `synthesise` with 3 chats | `confidenceScores` has 3 entries |

### Phase 5 — Deliverables

- `reasoning-synthesiser.js` with confidence scoring, conclusion extraction, and synthesis logic
- "Synthesis" card as the primary actionable output card in the compare page
- Confidence meter per chat, most-definitive flag, per-chat conclusions, plain-English synthesis note
- Full unit test coverage including edge cases and null similarity input

**Last task of Phase 5:** Update this document — mark Phase 5 as ✅ Completed with the completion date.

**Phase 5 completed: March 12, 2026**

---

## Full Deliverable Summary

At completion of all phases, a user selecting 2+ chats and pressing **Compare** will see:

| Card | Content | Phase |
|---|---|---|
| **Panels** | N chats side-by-side, scroll-synced, word-level diff highlighted | 1 + 3 |
| **Structure** | Heading / code / list / table counts, avg turn length per chat | 2 |
| **Reasoning Alignment** | Per-turn semantic agreement score, divergence flags | 4 |
| **Synthesis** | Confidence scores, conclusions, synthesis note, most-definitive pick | 5 |

### Full UI Experience Test (manual, post-Phase-5)

1. Save the same query to 3 different AI chatbots.
2. Select all 3 in the bAInder side panel via multi-select.
3. Click **Compare** → compare page opens in a new tab.
4. All 3 chat panels render, scroll-synced.
5. Structure card shows structural breakdown per chat (e.g. one used headers, one used prose).
6. Word-level diff shows inserted/deleted words between each chat and the auto-reference.
7. "Reference (auto): [chat title]" label is shown — no dropdown, no manual selection needed.
8. On first use, a loading bar appears while the model downloads; "Reasoning Alignment" card then appears. The auto-medoid is computed and the reference label and diff panels update to reflect it.
9. Per-turn bars show agreement %; divergent turns are highlighted amber/red.
10. Clicking a divergent-turn badge scrolls the panels to that turn.
11. Synthesis card shows confidence scores per chat, extracted conclusions, and a plain-English synthesis note.
12. The note correctly identifies the most definitive chat and flags the divergence count.

---

## Test File Index

| File | Phase | Covers |
|---|---|---|
| `tests/compare-navigation.test.js` | 1 | `handleCompare` URL construction, guard clauses |
| `tests/compare-page.test.js` | 1 | `init()` panel rendering, error states, CSS var |
| `tests/chat-turns.test.js` | 2 | `extractAssistantTurns` — filtering, empty content |
| `tests/structural-analyser.test.js` | 2 | All structural metrics, edge cases |
| `tests/turn-differ.test.js` | 3 | `diffTurns`, `diffToHtml` (including XSS safety), `diffAllTurns` |
| `tests/semantic-analyser.test.js` | 4 | Cosine math, orchestration with mocked pipeline, fallback |
| `tests/reasoning-synthesiser.test.js` | 5 | Confidence scoring, conclusion extraction, synthesis logic |

---

*Document maintained as part of C.18 implementation. Each phase updates this document as its final task.*
