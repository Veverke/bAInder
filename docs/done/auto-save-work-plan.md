# Auto-Save Work Plan

## Feature Overview

**Auto-Save** (also referred to as "Autonomous Mode" or "Auto-Sync") eliminates the need for the user to manually save chats. Navigating to a supported chat platform and completing a conversation automatically persists it to bAInder storage — silently, without any dialogs or prompts.

### Primary Goal
Streamline **Compare Mode** by removing the prerequisite manual-save steps. Currently: save chat A → save chat B → multi-select → compare. With Auto-Save: just compare.

### Secondary Value
- Full-text search covers the entire AI interaction history, not just consciously saved chats
- Entity extraction (`extractChatEntities`) runs passively across all sessions
- Stale-check / review-date system gains value without user discipline
- Export covers the whole history automatically

---

## Design Decisions

### Trigger: Sidepanel Open / Tab Focus (Option D)

Auto-save fires when the user opens the sidepanel or switches focus to an AI tab — not on navigation away or on a timer.

**Rationale:**
- The user naturally opens the sidepanel *when they want to compare* — save happens at the moment of intent
- Captures a complete (or near-complete) conversation; the user has finished chatting before shifting attention
- Zero wasted I/O for conversations the user never intends to surface
- Sidesteps the "save incomplete conversation" problem entirely
- Avoids the unreliability of `chrome.tabs.onRemoved` (service worker may be dead, DOM-based extractors are gone)

**Other options considered and rejected:**

| Option | Mechanism | Reason rejected |
|---|---|---|
| A — Tab close / navigate away | `chrome.tabs.onRemoved` + `onUpdated` | Service worker may be dead; content script gone; DOM extraction fails for ChatGPT/Gemini |
| B — Periodic re-save | `chrome.alarms` every N minutes | High I/O churn; snapshot not final state; wasteful for ignored conversations |
| C — Streaming-done detection | `MutationObserver` watching DOM for end-of-stream signals | Captures after every turn (most complete); per-platform DOM signals are brittle; fires many times per session |

### Merge vs. New Entry

**Decision: Always create a new entry in v1. No merge.**

The merge-by-first-prompt idea is attractive but has edge cases:
- Users frequently start sessions with near-identical prompts ("explain X") — false merges occur
- String match on first prompt is insufficient; semantic similarity (GloVe already in stack) would be needed
- URL identity is a better key but cross-session URLs differ anyway

Defer merge/deduplication to a future iteration. Compare Mode itself surfaces similarity.

### Topic Assignment

**Decision: Unassigned by default, with optional monthly bucket.**

Two modes (user-configurable):
1. **Unassigned** — auto-saved chats carry no `topicId`, appear in the unassigned pool
2. **Monthly bucket** — a topic named `Auto Save - YYYY-MMM` (e.g. `Auto Save - 2026-MAR`) is created lazily on first auto-save of the month; chats are assigned to it automatically

The monthly bucket keeps auto-saved chats separated and searchable without polluting manually curated topic trees.

### Chat Naming

Reuse the existing title-generation strategy (already in `message-utils.js`):
1. First complete sentence from the first user message (ending `.?!`), stripped of Markdown and role labels
2. Fallback to last URL path segment
3. Fallback to `'Untitled Chat'`

No changes needed to naming logic.

### Privacy & Consent

**Auto-Save is opt-in, off by default.**

- Prominent toggle in sidepanel settings
- Per-platform enable/disable (user may want auto-save on ChatGPT but not Claude)
- Conversations can be deleted after the fact via existing UI
- This is a significant behavioral shift (implicit persistence of potentially sensitive content); opt-out is not acceptable

### UX: Silent Operation

No dialogs, no "assign to topic" prompt, no notifications on auto-save. The existing post-save dialog is suppressed in auto-save mode. A subtle "auto-saved" badge or indicator in the sidepanel chat list is the only signal.

### Noise Filter

Skip auto-save if conversation has fewer than 2 turns at save time (avoids persisting accidental navigations or empty sessions).

---

## Architecture

### New Components

| Component | Location | Responsibility |
|---|---|---|
| `auto-save-controller.js` | `src/background/` | Listens to `chrome.tabs.onActivated`, decides whether to trigger auto-save for the active tab |
| `auto-save-settings.js` | `src/sidepanel/features/` | UI toggle and per-platform configuration |

### Modified Components

| Component | Change |
|---|---|
| `chat-save-handler.js` | Accept `autoSaved: true` flag on payload; skip post-save topic dialog; create/assign monthly bucket topic when configured |
| `sidepanel/save-banner.js` | Suppress manual-save prompt when auto-save already fired for the current URL in this session |
| `background/service-worker.js` | Wire `chrome.tabs.onActivated` and sidepanel open event to `auto-save-controller` |
| `storage schema` | Add `autoSaved: boolean` field to chat entry; add `autoSaveEnabled` and `autoSavePlatforms` to settings |

### Data Flow

```
chrome.tabs.onActivated (or sidepanel open)
  → auto-save-controller.js
      → is tab URL a supported platform? NO → stop
      → is auto-save enabled for this platform? NO → stop
      → send EXTRACT_CHAT to content script
          → returns { title, messages, messageCount }
      → messageCount < 2? → stop (noise filter)
      → already saved this URL in this session? → stop (dedup)
      → prepareChatForSave()
      → handleSaveChat({ ...payload, autoSaved: true })
          → create/assign monthly bucket topic (if configured)
          → push to browser.storage.local.chats[]
          → broadcast CHAT_SAVED (no topic dialog)
```

---

## Implementation Steps

### Phase 1 — Foundation

- [ ] Add `autoSaved`, `autoSaveEnabled`, `autoSavePlatforms` fields to storage schema and defaults
- [ ] Create `auto-save-controller.js` with tab-activation listener and platform detection
- [ ] Wire controller into service worker
- [ ] Add noise filter (skip if < 2 turns)
- [ ] Add session-level dedup (don't re-save same URL twice in one session)

### Phase 2 — Topic Bucket

- [ ] Implement lazy monthly topic creation (`Auto Save - YYYY-MMM`) in `chat-save-handler.js`
- [ ] Add `autoSaved: true` flag to storage entry
- [ ] Suppress post-save topic dialog when `autoSaved` is true

### Phase 3 — Settings UI

- [ ] Add Auto-Save toggle to sidepanel settings panel
- [ ] Add per-platform checkboxes (ChatGPT, Claude, Gemini, Copilot)
- [ ] Surface `autoSaved` badge on chat list items (subtle, non-intrusive)

### Phase 4 — Save-Banner Integration

- [ ] Suppress or adapt the manual save banner when the current session was already auto-saved
- [ ] Provide a "Re-save" action so users can manually update an auto-saved chat with the latest turns

### Phase 5 — Tests

- [ ] Unit tests for `auto-save-controller.js` (platform detection, noise filter, dedup)
- [ ] Unit tests for monthly bucket creation logic in `chat-save-handler.js`
- [ ] Integration test: sidepanel open on supported platform → chat appears in list

---

## Known Limitations (v1)

- Claude: auto-save fires an authenticated internal API call (`/api/organizations/{org}/chat_conversations/{id}`) without explicit user action per-save. Acceptable given opt-in, but worth documenting.
- If the user compares chats from two separate browser windows with no sidepanel interaction in either, auto-save does not fire. Out of scope for v1.
- Re-save (updating an existing auto-saved chat with newer turns) is manual in v1. Continuous sync is deferred.
- Merge / deduplication of similar conversations is deferred.
