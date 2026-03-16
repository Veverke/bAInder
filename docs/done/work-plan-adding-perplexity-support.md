# Work Plan — Adding Perplexity AI Support

**Created:** March 15, 2026
**Status:** 🔲 Not started

---

## Overview

Add [perplexity.ai](https://www.perplexity.ai) as a fifth supported chatbot platform in bAInder, enabling users to save and organise Perplexity conversations the same way they can with ChatGPT, Claude, Gemini, and Copilot.

Perplexity's domains are already in `host_permissions` in `manifest.json`, so the extension has the necessary permissions. No new library dependencies are required — the work follows the exact same pattern established for the four existing platforms.

---

## Architecture Context

Every platform integration consists of exactly **five touch-points**:

| Layer | File | Role |
|---|---|---|
| Extractor module | `src/content/extractors/<platform>.js` | DOM → `{title, messages, messageCount}` |
| Orchestrator wiring | `src/content/chat-extractor.js` | import + `detectPlatform` + `extractChat` switch |
| Content script wiring | `src/content/content.js` | inlined `detectPlatform` + inlined extractor call |
| Manifest | `manifest.json` | `content_scripts[].matches` arrays (2 entries) |
| Tests | `tests/` | unit tests for extractor + orchestrator |

All extractors must return:
```js
{ title: string, messages: Array<{role: 'user'|'assistant', content: string}>, messageCount: number }
```

---

## Phase 1 — DOM Research & Selector Specification

**Goal:** Identify stable, resilient CSS selectors for Perplexity's conversation DOM structure before writing any code. This phase produces a written selector specification that all subsequent phases depend on.

### Task 1.1 — Inspect Perplexity DOM structure manually

Open a Perplexity conversation in Chrome DevTools and identify:

- The outermost conversation container (scoping element, analogous to `main` or `[role="main"]`)
- User query elements — look for `[data-testid*="user"]`, `[class*="UserQuery"]`, `[class*="query"]`, `[class*="Question"]`
- Answer/response elements — look for `[data-testid*="answer"]`, `[class*="Answer"]`, `[class*="AnswerBody"]`, `.prose`
- Source citation containers (to be stripped, analogous to `extractSourceLinks` used in other extractors)
- Whether the page uses open shadow DOM roots (requiring `appendShadowImages`-style traversal)
- The `<title>` element content format and whether a better in-page title element exists

### Task 1.2 — Assess image/media presence

Check whether Perplexity renders:
- Inline images (generated images, uploaded images) — determines if `resolveImageBlobs` is needed
- Audio elements — determines if `audio-interceptor.js` changes are needed

### Task 1.3 — Document the selector spec

Write down the confirmed selectors as a comment block at the top of the new extractor file (mirroring the JSDoc comment style in `chatgpt.js`, `copilot.js`, etc.).

### Deliverables
- Written selector specification ready to be encoded in `perplexity.js`
- Decision on whether sources should be captured as inline text, a footer block, or stripped entirely

### UI to verify (manual)
- Open a Perplexity conversation in the browser and confirm the identified selectors select the right elements via DevTools `$$()` queries

---

## Phase 2 — Core Extractor Module

**Goal:** Create `src/content/extractors/perplexity.js` with a working `extractPerplexity(doc)` function. This phase is entirely self-contained — no other files change.

### Task 2.1 — Create `src/content/extractors/perplexity.js`

Scaffold the file following the structure of `copilot.js` or `chatgpt.js`:

```js
/**
 * Perplexity conversation extractor.
 * Targets: www.perplexity.ai, perplexity.ai
 *
 * Perplexity DOM (as of <date>):
 *   User queries:   <selectors from Phase 1>
 *   AI answers:     <selectors from Phase 1>
 *   Sources:        <selectors from Phase 1>
 */

import { htmlToMarkdown }        from './html-to-markdown.js';
import { resolveImageBlobs }     from './image-resolver.js';         // if needed
import { extractSourceLinks, stripSourceContainers } from './source-links.js'; // if sources exist
import { formatMessage, generateTitle }              from './message-utils.js';
import { removeDescendants }                         from './shared.js';

export async function extractPerplexity(doc) { ... }
```

Key implementation decisions to make in this task:
- User turn selector strategy (stable `data-testid` vs. class-based fallback chain)
- Whether sources are extracted as a trailing markdown block or stripped
- Role assignment logic (Perplexity turns are unconditional: odd = user, even = assistant, or use explicit selectors)
- Title extraction: page `<title>`, first user query, or `generateTitle(messages, url)`

### Task 2.2 — Handle UI noise

Identify and strip Perplexity-specific UI chrome from extracted content, such as:
- "Sources" section headers
- Share / Follow-up buttons text that leaks into text nodes
- "Pro" badges or regeneration prompts

Create a private `_stripUILabels(content)` helper inside the extractor (same pattern as `stripRoleLabels` in `copilot.js` and `stripGeminiUILabels` in `gemini.js`).

### Deliverables
- `src/content/extractors/perplexity.js` — complete and exported

### UI to verify (manual)
- None yet (extractor is not wired in). Verification happens in Phase 4.

---

## Phase 3 — Orchestrator & Manifest Wiring

**Goal:** Wire the extractor into the two orchestration layers and update the manifest so the content scripts actually run on Perplexity pages. After this phase the extension can save Perplexity chats end-to-end.

### Task 3.1 — Update `src/content/chat-extractor.js`

Three sub-changes in one file:

1. **Add import** at the top with the other platform imports:
   ```js
   import { extractPerplexity } from './extractors/perplexity.js';
   ```

2. **Add re-export** in the `export { ... }` block:
   ```js
   extractPerplexity,
   ```

3. **Add to `detectPlatform()`**:
   ```js
   if (h.includes('perplexity.ai')) return 'perplexity';
   ```

4. **Add to `extractChat()` switch**:
   ```js
   case 'perplexity':
     if (!doc) throw new Error('Document is required');
     result = await extractPerplexity(doc);
     break;
   ```

### Task 3.2 — Update `src/content/content.js` (inlined copy)

`content.js` is bundled as a self-contained IIFE and cannot use ES module imports, so it contains an inlined copy of `detectPlatform` and calls the platform extractor directly. Two sub-changes:

1. **Update inlined `detectPlatform()`** (at line ~136):
   ```js
   if (h.includes('perplexity.ai')) return 'perplexity';
   ```

2. **Add `extractPerplexity` inline implementation** — either port the logic directly into the IIFE or add a `case 'perplexity':` that calls an inlined version of the extractor. The easiest approach is to inline the key DOM logic since the bundler does not tree-shake the IIFE.

### Task 3.3 — Update `manifest.json`

Add `"https://www.perplexity.ai/*"` and `"https://perplexity.ai/*"` to **both** `content_scripts` entries (the `audio-interceptor.js` entry at `document_start` and the `content.js` entry at `document_idle`):

```json
"matches": [
  "https://chat.openai.com/*",
  "https://chatgpt.com/*",
  "https://claude.ai/*",
  "https://gemini.google.com/*",
  "https://copilot.microsoft.com/*",
  "https://m365.cloud.microsoft/*",
  "https://www.perplexity.ai/*",
  "https://perplexity.ai/*"
]
```

### Deliverables
- `chat-extractor.js` — updated with import, re-export, `detectPlatform`, and `extractChat` case
- `content.js` — updated inlined `detectPlatform` and inlined extractor dispatch
- `manifest.json` — both `content_scripts[].matches` arrays updated

### UI to verify (manual, end-to-end)
1. Reload the unpacked extension in `chrome://extensions`
2. Navigate to an open Perplexity conversation (not the home page)
3. Open the bAInder side panel — the **Save Chat** button should appear
4. Click **Save Chat** — the chat should appear in the side panel with a title, correct message count, and readable content
5. Open the saved chat in the reader — user and assistant turns should alternate correctly with no UI noise

---

## Phase 4 — Unit Tests

**Goal:** Achieve test parity with the other platform extractors. Tests use jsdom and follow the patterns in `tests/chat-extractor.test.js`.

### Task 4.1 — Add `detectPlatform` cases to `tests/chat-extractor.test.js`

Inside the existing `describe('detectPlatform()', ...)` block, add:

```js
it('returns "perplexity" for www.perplexity.ai', () => {
  expect(detectPlatform('www.perplexity.ai')).toBe('perplexity');
});
it('returns "perplexity" for perplexity.ai', () => {
  expect(detectPlatform('perplexity.ai')).toBe('perplexity');
});
```

### Task 4.2 — Create `tests/perplexity-extractor.test.js`

A dedicated test file with a `buildPerplexityDoc(turns)` helper (same pattern as `buildCopilotDoc`, `buildGeminiDoc` etc.) and the following test groups:

- **Empty document** — returns `{ title: '', messages: [], messageCount: 0 }` or equivalent graceful result
- **Single user turn** — correctly sets `role: 'user'`
- **Single assistant turn** — correctly sets `role: 'assistant'`
- **Multi-turn conversation** — roles alternate correctly, message count matches
- **Title extraction** — falls back to first user message or `generateTitle()` when no `<title>` element present
- **Source stripping** — source citation sections do not appear in message content
- **UI noise stripping** — share buttons, regeneration prompts do not appear in content
- **HTML → Markdown** — bold, inline code, lists survive `htmlToMarkdown` conversion
- **Missing document** — throws `'Document is required'`

### Task 4.3 — Run full test suite and confirm no regressions

```bash
npm test -- --run
```

All existing tests must pass. New Perplexity tests must pass.

### Deliverables
- `tests/chat-extractor.test.js` — `detectPlatform` cases added
- `tests/perplexity-extractor.test.js` — full new test file
- Green test suite (`npm test -- --run`)

### UI to verify (automated)
- `npm test -- --run` passes with 0 failures

---

## Phase 5 — Build Validation & Polish

**Goal:** Confirm the production build is clean, the extension loads without errors, and the sidebar reflects the new platform correctly.

### Task 5.1 — Production build

```bash
npm run build
```

Confirm zero errors and zero warnings related to Perplexity files.

### Task 5.2 — Verify extension loads cleanly

1. Reload the extension in `chrome://extensions`
2. Check the service worker has no errors (Inspect views → service worker)
3. Navigate to `perplexity.ai` — confirm no console errors in the tab

### Task 5.3 — Update the `supported platforms` comment in `chat-extractor.js`

The JSDoc header currently lists 4 platforms. Add Perplexity:

```js
 * Supported platforms:
 *   - ChatGPT   (chat.openai.com)
 *   - Claude    (claude.ai)
 *   - Gemini    (gemini.google.com)
 *   - Copilot   (copilot.microsoft.com → redirects to m365.cloud.microsoft/chat)
 *   - Perplexity (www.perplexity.ai)
```

### Task 5.4 — Smoke test multi-turn save & reader flow

1. Start a multi-turn Perplexity conversation (at least 3 exchanges)
2. Save via the bAInder button
3. Open the saved chat in the reader — verify turn count, content quality, and title
4. Export the chat (Markdown + JSONL) — verify both formats contain the Perplexity messages correctly
5. Compare a Perplexity chat against a ChatGPT chat in the Compare view

### Deliverables
- Clean production build
- Extension reloads without errors
- All 5 smoke test steps pass manually

### UI to verify (manual)
- Save button appears on Perplexity conversation pages
- Saved chat appears in side panel with correct title and message count
- Reader view shows alternating user / assistant turns with clean content
- Export and Compare features work with Perplexity chats

---

## Completion Checklist

- [ ] Phase 1 — DOM selectors researched and documented
- [ ] Phase 2 — `src/content/extractors/perplexity.js` created
- [ ] Phase 3.1 — `src/content/chat-extractor.js` updated
- [ ] Phase 3.2 — `src/content/content.js` updated (inlined copy)
- [ ] Phase 3.3 — `manifest.json` updated (both `content_scripts` entries)
- [ ] Phase 4.1 — `detectPlatform` test cases added
- [ ] Phase 4.2 — `tests/perplexity-extractor.test.js` created
- [ ] Phase 4.3 — Full test suite passes
- [ ] Phase 5.1 — Production build clean
- [ ] Phase 5.2–5.3 — Extension loads without errors, JSDoc updated
- [ ] Phase 5.4 — End-to-end smoke test passed

---

## Files Modified / Created Summary

| File | Change |
|---|---|
| `src/content/extractors/perplexity.js` | **Create** — new platform extractor |
| `src/content/chat-extractor.js` | **Edit** — import, re-export, detectPlatform, extractChat switch |
| `src/content/content.js` | **Edit** — inlined detectPlatform + inlined extractor dispatch |
| `manifest.json` | **Edit** — 2 URL strings in both content_scripts matches arrays |
| `tests/chat-extractor.test.js` | **Edit** — add 2 detectPlatform assertions |
| `tests/perplexity-extractor.test.js` | **Create** — full extractor test suite |
