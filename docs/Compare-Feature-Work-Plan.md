# C.18 — Model Comparison View: Work Plan

Select N saved chats using the existing multi-select infrastructure, press **Compare**, and open a dedicated compare page showing all N chat panels side-by-side, each annotated with structured analysis: topic/entity overlap, structural metrics, similarity scoring, and word-level diff between assistant turns.

**Scope:** MVP uses only free, bundled libraries. No paid API calls.

---

## Libraries (all free, bundled at build time, no CDN)

| Library | Size | Role |
|---|---|---|
| `compromise` | ~250 KB minified | NLP: noun-phrase / entity extraction per response → "what this chat is about" |
| `diff-match-patch` | ~50 KB | Word-level token diff between corresponding assistant turns |
| *(none — pure JS)* | ~0 KB | Structural analysis: heading count, code blocks, list items, prose paragraphs, avg turn length |
| *(none — pure JS)* | ~0 KB | TF-IDF cosine similarity between any two response bodies (~80 lines) |

---

## Entry trigger — existing selection bar

The selection bar (C.17) already appears when multi-select mode is active. Add a third button alongside **Assemble** and **Export Digest**:

```html
<!-- sidepanel.html — inside #selectionBar .selection-bar__actions -->
<button id="compareBtn" class="selection-bar__btn selection-bar__btn--primary"
        disabled title="Select at least 2 chats to compare">
  <!-- SVG: two-column icon -->
  Compare
</button>
```

`updateSelectionBar(count)` in `multi-select.js` already drives `assembleBtn.disabled` — add identical logic for `compareBtn` (enabled at ≥ 2 chats).

---

## New feature module

**`src/sidepanel/features/compare.js`** — mirrors `multi-select.js` structure, single responsibility:

```js
// Responsibility: handle Compare button click.
// Reads selectedChats from state.renderer.getSelectedChats(),
// serialises their IDs into a URL query string, opens the compare page.

export async function handleCompare() {
  const chats = state.renderer.getSelectedChats();  // reuse existing method
  if (chats.length < 2) return;
  const ids = chats.map(c => encodeURIComponent(c.id)).join(',');
  const url = browser.runtime.getURL(`src/compare/compare.html?ids=${ids}`);
  await browser.tabs.create({ url });
}
```

Wired in `sidepanel.js` exactly as `handleAssemble` is today:
```js
elements.compareBtn?.addEventListener('click', handleCompare);
```

---

## New page: `src/compare/`

Three files (parallel to `src/reader/`):

```
src/compare/
  compare.html    — skeleton: <header> + <div id="compare-panels"> + <div id="analysis-summary">
  compare.js      — init(), loads N chats from storage, renders panels + analysis
  compare.css     — grid layout, panel chrome, analysis card styles
```

**`compare.html`** structure:
```html
<div id="compare-panels" class="compare-panels">
  <!-- JS inserts one .compare-panel per chat -->
</div>
<section id="analysis-summary" class="analysis-summary" hidden>
  <!-- JS inserts analysis cards: Topics, Structure, Similarity -->
</section>
```

**`compare.js` — `init()` flow:**
1. Parse `?ids=id1,id2,...` from `URLSearchParams`.
2. Load all chats from `browser.storage.local` (same as `reader.js` does today).
3. Render N `.compare-panel` columns (each re-uses `renderMarkdown` from reader).
4. Run analysis pipeline (below) and populate `#analysis-summary`.

---

## Analysis pipeline — `src/lib/analysis/`

Three single-responsibility modules:

### `structural-analyser.js`
Pure JS, no dependencies. Parses the markdown of each chat's assistant turns and returns:
```js
{
  headings:    number,   // ## / ### count
  codeBlocks:  number,   // fenced ``` blocks
  listItems:   number,   // - / * / 1. lines
  tables:      number,   // | row | count
  paragraphs:  number,   // blank-line-separated prose blocks
  avgTurnLen:  number,   // avg word count per assistant turn
  totalWords:  number,
}
```
Renders as a **table** with one column per chat — immediately shows "A answered in prose, B used headers + code blocks".

### `topic-extractor.js`
Wraps `compromise`. Extracts top-N noun phrases from each chat's concatenated assistant turns. Returns a ranked list of terms per chat. Renders as a **tag-cloud / keyword list** per panel, with shared terms highlighted across panels.

```js
import nlp from 'compromise';

export function extractTopics(text, topN = 20) {
  const doc = nlp(text);
  const nouns = doc.nouns().out('array');
  // frequency map → sort → return top N
}
```

### `similarity-scorer.js`
TF-IDF cosine similarity (pure JS, ~80 lines). Accepts an array of text strings, returns an N×N matrix.  
Renders as a **heatmap grid** or labelled pairs: "A↔B: 0.72 (high), A↔C: 0.31 (low)".

---

## Word-level diff (per assistant turn)

For the **2-chat case**, or any pair the user selects from a toggle, `diff-match-patch` diffs corresponding assistant turns and injects `<ins>` / `<del>` spans into the rendered panel HTML. For N > 2, a "Diff pair" dropdown lets the user pick which two panels to diff.

---

## Layout

```
┌─────────────────────────────────────────────────────┐
│  [Chat A title / source badge]  [Chat B]  [Chat C]  │  ← panel headers
├──────────────────┬──────────────────┬───────────────┤
│  <rendered chat> │  <rendered chat> │ <rendered>    │  ← scroll-synced columns
│                  │                  │               │
└──────────────────┴──────────────────┴───────────────┘
│  ── Analysis Summary ───────────────────────────────│
│  [Structural] [Topics] [Similarity] [Turn Diff ▾]   │  ← tabbed cards
└─────────────────────────────────────────────────────┘
```

CSS Grid: `grid-template-columns: repeat(N, 1fr)`. For N > 3 the panels become horizontally scrollable (`overflow-x: auto`).

Scroll sync: a single `scroll` event listener on the active panel broadcasts `scrollTop` to all siblings.

---

## Build / manifest changes

1. **`vite.config.js`** — add `src/compare/compare.html` as a new entry point (same pattern as `reader.html`).
2. **`manifest.json`** — `compare.html` requires no extra permissions; it's a regular extension page like the reader.

---

## New tests

| Test file | What it covers |
|---|---|
| `tests/structural-analyser.test.js` | heading / code / list counts from known markdown strings |
| `tests/topic-extractor.test.js` | top-N noun extraction from fixture text |
| `tests/similarity-scorer.test.js` | cosine similarity of identical, disjoint, and partial texts |
| `tests/compare.test.js` | `init()` integration: loads N chats, produces N panels, analysis summary present |

---

## Implementation order (phased)

**Phase 1 — Skeleton & navigation** *(low risk, delivers visible progress)*
- Add `compareBtn` to `selectionBar` in `sidepanel.html` + `sidepanel.css`.
- Update `updateSelectionBar()` in `multi-select.js`.
- Create `src/sidepanel/features/compare.js` with URL-open logic.
- Create `src/compare/compare.html` + `compare.css` + stub `compare.js` that just renders N chat panels (no analysis yet), re-using `renderMarkdown`.
- `vite.config.js` + `manifest.json` entry.

**Phase 2 — Structural analysis** *(zero new dependencies)*
- Implement `structural-analyser.js` + tests.
- Wire into compare page as the first analysis card.

**Phase 3 — Topic extraction** *(adds `compromise`)*
- `npm install compromise`.
- Implement `topic-extractor.js` + tests.
- Add Topics card to analysis summary.

**Phase 4 — Similarity scoring** *(zero new dependencies)*
- Implement `similarity-scorer.js` (TF-IDF) + tests.
- Add Similarity card (pair scores or heatmap for N > 2).

**Phase 5 — Word-level diff** *(adds `diff-match-patch`)*
- `npm install diff-match-patch`.
- Implement per-turn diff for selected pair; `<ins>`/`<del>` highlighting in panels.
- "Diff pair" dropdown for N > 2.
