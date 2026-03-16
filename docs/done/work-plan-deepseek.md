# Work Plan — Adding DeepSeek Support

**Created:** March 16, 2026  
**Status:** Not started

---

## Objective

Add DeepSeek support so chats from `chat.deepseek.com` can be saved with the same quality and reliability as existing platforms.

Known DOM signal from initial analysis:

- Both user and assistant messages use `.ds-message`
- Assistant messages are distinguishable by a `style` attribute containing `--assistant` (example: `--assistant-last-margin-bottom: 32px;`)

---

## Implementation Model

To stay aligned with current architecture, DeepSeek support is split across these touch-points:

1. Extractor module: `src/content/extractors/deepseek.js`
2. Orchestrator wiring: `src/content/chat-extractor.js`
3. Content script wiring (inlined): `src/content/content.js`
4. Manifest coverage: `manifest.json`
5. Automated tests in `tests/`

Each phase below is structured so tasks can be implemented independently and, where possible, in parallel.

---

## Phase 1 — Selector Contract and Fixture Baseline

**Goal:** Lock the DeepSeek selector contract before wiring code.

### Atomic tasks

1. Define role selectors for extraction:
   - `messageNodes`: `.ds-message`
   - `assistantNodes`: `.ds-message[style*="--assistant"]`
   - `userNodes`: `.ds-message:not([style*="--assistant"])`

2. Define title strategy in priority order:
   - DeepSeek page title (trim site suffix)
   - First user message fallback
   - Existing `generateTitle(messages, url)` fallback

3. Define content-clean rules for first pass:
   - Strip obvious control labels (retry/copy/share artifacts)
   - Preserve text semantics (lists/code/inline formatting)

4. Create minimal HTML fixtures for tests (can be done in parallel with task 2):
   - One-turn fixture
   - Multi-turn fixture
   - Empty-state fixture

### Parallelization

- Track A: selector and role contract (tasks 1, 3)
- Track B: title and fallback rules (task 2)
- Track C: synthetic fixtures for tests (task 4)

### Deliverables

- Written selector contract finalized
- Fixture snippets ready for extractor/unit tests
- Agreed role-disambiguation rule using `style*="--assistant"`

### Tests so far

- Manual selector checks in DevTools using `$$('.ds-message')` and `$$('.ds-message[style*="--assistant"]')`
- Verify role partition covers all currently visible turns without overlap

---

## Phase 2 — Core Extractor Module

**Goal:** Implement a standalone DeepSeek extractor with no cross-file dependencies.

### Atomic tasks

1. Add `src/content/extractors/deepseek.js` exporting `extractDeepSeek(doc)`.

2. Implement message collection pipeline:
   - Query `.ds-message`
   - Derive role by checking `style` contains `--assistant`
   - Convert message HTML to markdown with existing helpers

3. Implement content sanitation specific to DeepSeek UI noise.

4. Implement title extraction and fallback chain from Phase 1.

5. Guarantee output contract:
   - `{ title, messages, messageCount }`
   - stable behavior for empty/malformed DOM

### Parallelization

- Track A: extractor scaffolding + output contract (tasks 1, 5)
- Track B: role parsing + markdown conversion (task 2)
- Track C: title and UI-noise cleanup (tasks 3, 4)

### Deliverables

- New file: `src/content/extractors/deepseek.js`
- Extractor returns normalized turns and safe fallback title

### Tests so far

- Unit tests for extractor-only behavior:
  - empty DOM
  - only user turns
  - only assistant turns
  - mixed multi-turn order
  - title fallback chain
  - UI-noise stripping behavior

---

## Phase 3 — Platform Wiring (Orchestrator + Content Script + Manifest)

**Goal:** Wire DeepSeek end-to-end so Save Chat appears and executes on DeepSeek pages.

### Atomic tasks

1. Update `src/content/chat-extractor.js`:
   - import and re-export `extractDeepSeek`
   - extend `detectPlatform()` for `chat.deepseek.com`
   - add `extractChat()` switch case: `deepseek`

2. Update `src/content/content.js` inlined platform logic:
   - extend inlined `detectPlatform()` with `chat.deepseek.com`
   - add inlined `extractDeepSeek` function
   - add switch case calling the inlined extractor

3. Update `manifest.json` coverage:
   - add `https://chat.deepseek.com/*` to both `content_scripts[].matches`
   - add `https://chat.deepseek.com/*` to `host_permissions` if required by existing fetch paths

4. Validate no regressions in existing platforms after wiring.

### Parallelization

- Track A: modular orchestrator updates (task 1)
- Track B: inlined content script updates (task 2)
- Track C: manifest permission/match updates (task 3)
- Task 4 runs after A/B/C merge

### Deliverables

- DeepSeek recognized as a supported platform in both detection layers
- DeepSeek pages receive content scripts and can trigger extraction

### Tests so far

- Automated:
  - detectPlatform tests for DeepSeek hostname
  - extractChat switch-path test for `deepseek`
- Manual:
  - extension reload
  - open DeepSeek conversation
  - confirm Save Chat UI appears and extraction returns non-empty turn list

---

## Phase 4 — Test Suite Expansion

**Goal:** Add durable tests that isolate DeepSeek behavior and prevent regressions.

### Atomic tasks

1. Add detectPlatform coverage for DeepSeek in `tests/chat-extractor.test.js`.

2. Add dedicated extractor tests file, for example `tests/deepseek-extractor.test.js`.

3. Add edge-case tests:
   - missing `style` attribute defaults to user
   - assistant style variants still match (`style` contains `--assistant` anywhere)
   - mixed whitespace and nested markup

4. Add negative/robustness tests:
   - malformed HTML nodes do not crash extraction
   - empty results still return valid contract

5. Run targeted tests and then full suite.

### Parallelization

- Track A: platform detection tests (task 1)
- Track B: happy-path extractor tests (task 2)
- Track C: edge/robustness matrix (tasks 3, 4)
- Task 5 runs after A/B/C merge

### Deliverables

- DeepSeek test coverage for detection and extraction
- Regression guardrails for role parsing and title fallback behavior

### Tests so far

- Targeted: DeepSeek-related test files all pass
- Full: `vitest --run` suite passes with no new failures

---

## Phase 5 — QA, Hardening, and Release Readiness

**Goal:** Validate behavior against real DeepSeek UI and finalize for merge.

### Atomic tasks

1. Manual QA pass on real conversations:
   - short chat
   - long chat
   - code-heavy chat
   - chat with edited/regenerated assistant responses

2. DOM drift resilience check:
   - confirm fallback behavior if style attribute ordering changes
   - confirm extractor degrades gracefully if DeepSeek removes the assistant style variable

3. Logging and diagnostics review:
   - ensure no debug noise
   - ensure errors are actionable if extraction fails

4. Documentation update:
   - update supported platforms docs/readme sections as needed

### Parallelization

- Track A: manual QA scenarios (task 1)
- Track B: resilience checks and diagnostics (tasks 2, 3)
- Track C: docs update (task 4)

### Deliverables

- QA sign-off checklist completed
- Documentation reflects DeepSeek support
- Merge-ready changeset with verified behavior

### Tests so far

- Manual end-to-end save and reader validation for DeepSeek
- Full automated suite green after final polish

---

## Suggested Execution Order

1. Phase 1 and Phase 2 in parallel (contract and extractor can overlap with quick sync points)
2. Phase 3 immediately after extractor API stabilizes
3. Phase 4 before merge request
4. Phase 5 as final gate

---

## Risks and Mitigations

1. Risk: role detection tied to inline style token may change.
   Mitigation: keep selector helper centralized and covered by dedicated tests.

2. Risk: `.ds-message` captures non-conversation UI blocks.
   Mitigation: validate role partition and sanitize aggressively for known UI noise.

3. Risk: mismatch between modular extractor and inlined `content.js` logic.
   Mitigation: phase 3 split plus mirrored tests for both detection and extraction paths.
