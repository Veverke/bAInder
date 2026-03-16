# Work Plan: Direct Prompt Injection into AI Chatbots

**Feature:** "Compare with AI" card — fully automated injection: open (or focus)
the target AI tab, inject the comparison prompt, hit send, hide the user bubble,
and scroll to the AI site's loading spinner — all without user interaction.

**Current state:** The card already builds the prompt, copies it to clipboard,
and focuses / opens the correct AI tab.  This plan replaces that flow with full
automation: inject → submit → hide user bubble → scroll to spinner.

---

## Viability

Yes, fully viable with one new permission needed.

| Requirement | Already present? |
|---|---|
| `host_permissions` for chatgpt.com, claude.ai, gemini.google.com, copilot.microsoft.com | ✅ |
| `scripting` permission | ❌ — add (required for `executeScript`) |
| `tabs` permission | ✅ |
| `host_permissions` for perplexity.ai | ❌ — add in Phase 4 |

The compare page is an extension page (not a content script), so it can call
`chrome.scripting.executeScript` directly — no background service-worker relay
needed.

---

## Architecture

```
Compare page  ──button click──▶  chrome.scripting.executeScript(
                                   { target: { tabId },
                                     func: injectPrompt,
                                     args: [promptText] }
                                 )
                                      │
                              runs in tab's page context
                                      │
                       1. inject text into input field
                       2. click send button (or press Enter)
                       3. hide / remove user message bubble
                       4. poll for loading spinner, scroll to it
                                      │
                              returns { success, reason }
                                      │
                    ┌─────────────────┴──────────────────┐
                  success                              failure
              focus tab +                      clipboard already filled
           show "✓ ChatGPT"                  show "⬇ Copied — paste manually"
```

---

## Phase 1 — Message routing (½ day)

- In `renderSendToAiCard()`, replace the current `chrome.tabs.update` call with
  a helper `injectIntoTab(tab, prompt)`:
  ```js
  async function injectIntoTab(tab, prompt) {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func:   injectPrompt,        // serialised and run in target page
      args:   [prompt],
    });
    return result?.result ?? { success: false, reason: 'no result' };
  }
  ```
- Button click flow:
  1. Copy prompt to clipboard (fallback regardless of injection outcome)
  2. If tab already open → call `injectIntoTab`, then focus tab
  3. If no tab open → open tab, wait for load, then inject (Phase 3b)
  4. Update button label based on outcome

---

## Phase 2 — `injectPrompt` function (1 day)

A single serialisable async function placed in `src/content/ai-injector.js`.
Detects target site by `window.location.hostname` and applies the correct strategy.
**Must be fully self-contained** (no imports, no closures over outer scope) so it
survives `chrome.scripting.executeScript` serialisation.

### Selector resilience strategy

Each site defines **multiple independent selector strategies** tried in order.
A selector that fails (throws or returns null) is silently skipped; the next is
tried.  For shadow-DOM sites (Gemini), a recursive shadow-piercing query is used
instead of `querySelector`.

This multi-layer approach means any single DOM refactor by the AI vendor only
breaks *one* strategy, leaving the others intact.

### Per-site strategies

| AI | Input selectors (tried in order) | Input type | Send selectors (tried in order) |
|---|---|---|---|
| ChatGPT | `#prompt-textarea`, `[data-testid="prompt-textarea"]`, `div[contenteditable][data-id]`, `div[contenteditable][aria-label]`, `form div[contenteditable]` | `contenteditable` div | `[data-testid="send-button"]`, `button[aria-label="Send prompt"]`, `button[aria-label*="Send"]`, `form button[type="button"]:last-of-type` |
| Claude | `.ProseMirror[contenteditable]`, `div[contenteditable].ProseMirror`, `div[contenteditable][aria-label]`, `[data-placeholder][contenteditable]`, `fieldset div[contenteditable]`, `div[contenteditable]` | ProseMirror `contenteditable` | `button[aria-label="Send Message"]`, `button[aria-label*="Send"]`, `[data-testid="send-button"]`, `fieldset button:last-of-type` |
| Gemini | shadow-pierce: `[contenteditable][aria-label]`, `[contenteditable]`, `rich-textarea [contenteditable]` | Custom element / shadow DOM | shadow-pierce: `button[aria-label*="Send"]`, `[data-testid*="send"]`, `button.send-button` |
| Copilot | `[data-testid="composer-input"]`, `textarea[aria-label*="message" i]`, `div[contenteditable][aria-multiline]`, `div[contenteditable][aria-label]`, `div[contenteditable]` | Either | `button[aria-label*="Submit"]`, `button[aria-label*="Send"]`, `[data-testid*="send"]`, `button[type="submit"]` |
| Perplexity | `textarea[placeholder*="Ask"]`, `textarea[placeholder*="ask" i]`, `form textarea`, `[role="textbox"]`, `textarea` | `<textarea>` | `button[aria-label*="Submit"]`, `[data-testid*="send"]`, `button[type="submit"]`, `form button:last-of-type` |

### Synthetic event pattern (contenteditable)

Plain property assignment does not notify React/Vue — framework state stays
stale.  The reliable cross-framework pattern (three-layer fallback):

```js
// Layer 1: execCommand (deprecated but still works in all Chromium targets as of 2026)
el.focus();
document.execCommand('selectAll', false);
document.execCommand('insertText', false, promptText);

// Layer 2: DataTransfer-based paste simulation
const dt = new DataTransfer();
dt.setData('text/plain', promptText);
el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true }));

// Layer 3: direct textContent + input event (last resort)
el.textContent = promptText;
el.dispatchEvent(new Event('input', { bubbles: true }));
```

### Auto-submit

After text insertion, prefer clicking the send button; fall back to dispatching
a full Enter `keydown` + `keypress` + `keyup` sequence on the input element.

### Hide user message bubble

After submitting (400 ms delay for the bubble to render), find the last user
message element and `display: none !important` it.  Hiding is preferred over
removal to avoid breaking the page's JS state.

Per-site user-bubble selectors:
- ChatGPT: `[data-message-author-role="user"]`, `[data-testid*="conversation-turn"]`
- Claude: `[data-testid="user-message"]`, `.human-turn`, `[class*="human"]`
- Gemini: `user-query`, `[class*="user-query"]`, `query-text`
- Copilot: `[data-testid="user-message"]`, `[class*="UserMessage"]`
- Perplexity: `[class*="UserMessage"]`, `[class*="user-message"]`, `[class*="query"]`

### Scroll to loading indicator

After hiding the bubble, poll (up to 8 s, 200 ms interval) for a spinner /
loading element and call `scrollIntoView({ behavior: 'smooth', block: 'center' })`.

Per-site spinner selectors:
- ChatGPT: `[data-testid="stop-button"]`, `button[aria-label*="Stop"]`, `.result-streaming`
- Claude: `[data-testid="stop-response-button"]`, `button[aria-label*="Stop"]`, `[class*="streaming"]`
- Gemini: `mat-progress-spinner`, `model-response:last-child`, `[class*="generating"]`
- Copilot: `[class*="typing"]`, `[class*="loading"]`, `[class*="spinner"]`
- Perplexity: `[class*="loading"]`, `[class*="spinner"]`, `[class*="generating"]`

### Return value

```js
// Success
return { success: true };

// Failure — unrecognised hostname
return { success: false, reason: 'unrecognised site: ...' };

// Failure — input element not found
return { success: false, reason: 'input not found' };

// Failure — text insertion failed
return { success: false, reason: 'inject failed' };
```

---

## Phase 3 — UX states on the compare card (½ day)

Extend the existing AI target buttons with four states:

| State | Button appearance |
|---|---|
| Idle, tab open | `Gemini ↗` (green border) |
| Idle, no tab | `Gemini` (neutral) |
| Injecting… | `Gemini ⏳` (disabled, muted) |
| Success | `✓ Gemini` (green, click re-focuses tab) |
| Failure | `⬇ Gemini — paste manually` (amber, clipboard already filled) |

### Phase 3b — Inject into a freshly opened tab

When no matching tab is open the user clicks to open one.  The page must load
before injection is possible.

```js
const tab = await chrome.tabs.create({ url: ai.url });
// Wait for the tab to complete loading
await new Promise(resolve => {
  chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
    if (tabId === tab.id && info.status === 'complete') {
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    }
  });
});
// Small extra delay for React/Vue hydration
await new Promise(r => setTimeout(r, 800));
await injectIntoTab(tab, prompt);
```

Timeout: if the tab does not complete within 15 s, fall back to clipboard-only.

---

## Phase 4 — Manifest (15 min)

Add `scripting` to `permissions` and Perplexity to `host_permissions` in `manifest.json`:

```json
"permissions": ["storage", "unlimitedStorage", "tabs", "activeTab", "sidePanel",
                 "contextMenus", "alarms", "scripting"],
"host_permissions": [
  ...,
  "https://www.perplexity.ai/*",
  "https://perplexity.ai/*"
]
```

---

## Phase 5 — Tests (½ day)

### Unit tests (`tests/ai-injector.test.js`)

- Mock `document` / `window.location` for each site
- Verify the correct selector chain is attempted per hostname
- Verify `execCommand('insertText')` is called with the prompt text, with DataTransfer fallback
- Verify send button is clicked (or Enter dispatched when no button found)
- Verify user bubble is hidden (`display: none`) after injection
- Verify return value on success and on "input not found" / "unrecognised site"

### Integration tests (`tests/compare-page.test.js` additions)

- Button click → `chrome.scripting.executeScript` called with correct `tabId` and `args`
- Success path → button shows `✓ <Label>`, tab is focused
- Failure path → button shows `⬇ … — paste manually`, clipboard still written
- New-tab path → `chrome.tabs.create` called, `onUpdated` listener resolved, extra delay, then inject

---

## Risks and mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| AI sites update their DOM; selectors break | Medium (ChatGPT changes frequently) | Multiple independent selector strategies; clipboard fallback always fires first |
| `document.execCommand('insertText')` stops working | Low | DataTransfer paste simulation → direct textContent assignment fallback chain |
| Gemini shadow root depth / structure changes | Low | Recursive shadow-piercing query; same approach used in html-to-markdown.js extractor |
| Newly opened tab loads slowly | Low | 15 s timeout + clipboard fallback |
| Send button not found | Low | Fall back to Enter keydown/keypress/keyup dispatch on the input element |
| User bubble selector misses / hides wrong element | Medium | Only hide last matched element; non-critical (page still functions without it) |
| Spinner never appears (fast model / error) | Low | 8 s poll timeout; function returns success regardless (inject + submit succeeded) |
| Prompt exceeds AI context window | Low (UX only) | Existing `⚠ 40K chars` warning already present |

---

## File changes summary

| File | Change |
|---|---|
| `src/content/ai-injector.js` | **New** — async `injectPrompt(text)` with per-site multi-strategy logic, auto-submit, hide bubble, scroll to spinner |
| `src/compare/compare.js` | Replace `tabs.update`/`clipboard` flow with `scripting.executeScript` + `waitForTabLoad`; add loading/done/fail button state machine |
| `src/compare/compare.css` | Button `--loading`, `--done`, `--fail` states |
| `manifest.json` | Add `scripting` permission; add `https://www.perplexity.ai/*` and `https://perplexity.ai/*` to `host_permissions` |
| `tests/ai-injector.test.js` | **New** — unit tests for injector |
| `tests/compare-page.test.js` | Add injection flow integration tests |

---

## Estimated effort

| Phase | Effort |
|---|---|
| 1 — Routing | ½ day |
| 2 — Injector (4 sites + Perplexity) | 1 day |
| 3 — UX states + new-tab flow | ½ day |
| 4 — Manifest | 15 min |
| 5 — Tests | ½ day |
| **Total** | **~2.5 days** |

The highest-variance work is Phase 2: getting synthetic events right for each
framework (React on ChatGPT, ProseMirror on Claude, shadow DOM on Gemini).
That is where most of the testing time will be spent.
