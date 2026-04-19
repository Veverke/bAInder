# Work Plan: Import External AI Chats via Markdown

## Background & Motivation

bAInder centralises a personal AI knowledge base — conversations saved from
browser tabs on ChatGPT, Claude, Gemini, Copilot, and similar sites.  One
category of AI conversation is currently unreachable: chats exchanged inside
development IDEs (VS Code Copilot Chat, Cursor AI, Windsurf, etc.).  These
tools allow exporting or copying conversation threads as Markdown, but there
is no browser tab to "capture" through bAInder's normal content-script flow.

This feature adds an **"Import markdown" action** to the per-topic 3-dot
context menu so that any Markdown document — regardless of which tool produced
it — can be ingested as a saved chat and assigned directly to the chosen topic.

---

## User Story

> As a developer I export (or copy) a conversation from my IDE's AI chat panel
> and want it to live alongside my other saved AI chats in bAInder under the
> correct topic, so I can search it, review it, and build on it the same way
> I do with browser-captured chats.

**Acceptance criteria:**

- "Import markdown" appears in the topic-level context menu (same menu that
  has Rename, Move, Export, Copy all, Delete, Add sub-topic).
- Clicking the action opens a file-picker filtered to `.md` files.
- The imported file is saved as a chat in that topic.
- The saved entry appears immediately in the tree under the topic,
  behaves identically to a browser-saved chat (can be opened in the reader,
  renamed, moved, rated, exported, etc.).
- Entity extraction and search indexing run on the imported content, exactly
  as they do for any other saved chat.
- If the Markdown is bAInder's own export format, the round-trip is lossless
  (title, source, url, date, and all messages are restored exactly).

---

## Architecture Overview

### Existing save pipeline (browser tab path)

```
[content.js]  EXTRACT_CHAT →  [side-panel]  SAVE_CHAT →  [background SW]
  DOM scrape                   user click     validate, dedup, entity-extract
                                              buildChatEntry → chatRepo.addChat
                                                               ↓
                                              CHAT_SAVED broadcast → UI refresh
```

### Proposed import path

```
[sidepanel UI]  file-picker → read File API → parseMarkdownImport()
                               ↓
                          metadata form (title, source label)
                               ↓
                          [import-markdown.js]  buildImportedChatEntry()
                               ↓
                          extractChatEntities()   (same as ZIP import)
                               ↓
                          chatRepo.addChat(entry)
                               ↓
                          renderTreeView() / select new chat
```

The import path **intentionally bypasses the background service worker** (just
as the ZIP bulk-import path does) because there is no live browser tab and no
need for deduplication by URL.  A lightweight "local origin" flag in metadata
marks the entry as IDE-imported.

---

## Markdown Format Detection & Parsing

This is the central technical challenge.  Imported files can originate from
several tools with different conventions.

### Priority-ordered detection

| Priority | Detected pattern | Strategy |
|---|---|---|
| 1 | Has `---` frontmatter **and** `### User` / `### Assistant` headings | Existing `parseMessagesFromExportMarkdown()` — perfect round-trip of bAInder's own exports |
| 2 | Has `---` frontmatter only (unknown body structure) | Parse frontmatter for metadata, then fall through to heuristic body parse |
| 3 | Bold role labels: `**User**`, `**You**`, `**Human**`, `**Copilot**`, `**Assistant**`, `**AI**` on a line by themselves | VS Code Copilot Chat / Cursor style — split on those labels, classify role |
| 4 | Heading-prefixed roles: `# User`, `## User`, `# Copilot`, `## Assistant` etc. | Some IDE exporters use heading-level role markers |
| 5 | Blockquote role labels: `> Human:` / `> Assistant:` | Less common but seen in some tools |
| 6 | `---` section separators with no role markers | Treat alternating sections as user/assistant, starting with user |
| 7 | No recognisable structure | Entire document becomes a **single assistant message** with title inferred from first H1 or filename |

A new pure function `parseMarkdownImport(content, filename)` will be added to
`src/lib/io/import-parser.js` (or a small sibling file `markdown-import.js`
if the logic grows large) and will be covered by its own test file.

### Metadata extraction

| Field | Source (in order of preference) |
|---|---|
| `title` | Frontmatter `title:` → first `# Heading` in body → filename (without `.md`) → `"Imported chat"` |
| `source` | Frontmatter `source:` → `"external"` |
| `url` | Frontmatter `url:` → `""` (empty — no origin URL for IDE chats) |
| `date` | Frontmatter `date:` → file `lastModified` (from `File` object) → `Date.now()` |
| `messageCount` | Computed from parsed `messages[]` length |

A small **metadata confirmation form** (modal dialog, reusing the existing
dialog infrastructure) is shown before saving.  It presents:

- Title (editable text field, pre-filled as above)
- Source label (editable text field, default: `"external"`, free-form so user
  can type `"VS Code Copilot"` or `"Cursor"`)

The user can confirm or cancel.  No other fields are required.

---

## Implementation Plan

### 1. Parser — `src/lib/io/markdown-import.js` (new file)

```
parseMarkdownImport(content: string, filename?: string)
  → { title, source, url, timestamp, messages: [{role, content}][], detectedFormat }
```

- Pure function, no side effects, no DOM.
- `detectedFormat` is a string for logging/debugging
  (`"bainder-v1"`, `"bold-roles"`, `"heading-roles"`, `"alternating-sections"`,
  `"single-block"`).
- Re-exports `parseFrontmatter` from `import-parser.js` (or copies the minimal
  version) rather than duplicating logic.

### 2. UI — `src/sidepanel/sidepanel.html`

Add one new `<li>` to `#contextMenu`:

```html
<li data-action="import-markdown">Import markdown</li>
```

Position it below the existing `export` item (logical grouping: export / import
together, above the destructive `delete`).

### 3. Handler — `src/sidepanel/controllers/topic-actions.js`

Register `'import-markdown': handleImportMarkdown` in the `actions` map inside
`setupContextMenuActions()`.

**`handleImportMarkdown()`** (new async function, same file):

1. Creates a hidden `<input type="file" accept=".md,text/markdown">` in the
   DOM (same ephemeral pattern used elsewhere in the codebase) and triggers a
   `.click()`.
2. On `change`: reads the `File` with `file.text()`.
3. Calls `parseMarkdownImport(content, file.name)` to get parsed metadata +
   messages.
4. Opens a metadata confirmation dialog (see §4 below) pre-filled with
   parsed values.
5. On confirm: calls `buildImportedChatEntry(parsed, formValues, topicId)` to
   construct the full chat entry object (see §5).
6. Runs `extractChatEntities(entry)` (already imported in sidepanel pipeline —
   same call as ZIP import uses).
7. Calls `chatRepo.addChat(entry)`.
8. Calls `renderTreeView()` and selects the new chat node.
9. Dispatches a toast notification: `"Chat imported from markdown"`.

### 4. Metadata confirmation dialog — `src/sidepanel/features/topic-dialogs.js`

Add `showImportMarkdownDialog(defaults)` method:

```
showImportMarkdownDialog({ title, source })
  → Promise<{ title, source } | null>
```

- Reuses the existing modal scaffold (`<div id="topicModal" …>`).
- Two fields: Title (`<input type="text">`), Source label (`<input type="text"
  placeholder="e.g. VS Code Copilot, Cursor">`).
- Confirm / Cancel.
- Returns `null` on cancel (handler aborts with no side effects).

### 5. Chat entry builder — `src/background/chat-save-handler.js`

Add (or expose) a new pure helper `buildImportedChatEntry(parsed, formValues,
topicId)`:

```
buildImportedChatEntry({
  title, source, url, timestamp, messages
}, { title: userTitle, source: userSource }, topicId)
→ ChatEntry
```

This produces the same shape as `buildChatEntry()` already does, except:
- `id` generated with existing `generateId()`.
- `topicId` set to the caller-supplied value.
- `metadata.contentFormat` = `"markdown-v1"`.
- `metadata.importedAt` = `Date.now()` (provenance field).
- `metadata.importSource` = `"markdown-file"` (distinguishes from ZIP-batch
  import and from browser capture).
- `content` field serialised via existing `messagesToMarkdown()` with the
  confirmed metadata so it is stored in the canonical bAInder format — making
  the reader work with no changes.

This helper is a pure function (no storage I/O) so it is easily unit-tested.

### 6. Tests — `tests/markdown-import.test.js` (new file)

Cover:

| Test | Input | Expected |
|---|---|---|
| bAInder export round-trip | bAInder-format markdown | messages array matches original, detectedFormat = `"bainder-v1"` |
| Bold-role VS Code format | `**User**\n\ntext\n\n**Copilot**\n\nresponse` | 2 messages with correct roles |
| Heading-role format | `## User\n\ntext\n\n## Assistant\n\nresponse` | 2 messages |
| Alternating sections | `intro\n\n---\n\nreply\n\n---\n\nfollow-up` | 3 messages alternating user/assistant |
| Single block fallback | Plain prose, no structure | 1 assistant message, title from first H1 |
| Filename title fallback | No H1, no frontmatter | title = filename without `.md` |
| Frontmatter round-trip | Has full frontmatter | title/source/url/date preserved exactly |
| Empty input | `""` | returns `{ messages: [], title: "Imported chat", source: "external" }` |

Also extend `tests/topic-actions.test.js` (if one exists) or add a companion
test for the handler wiring.

---

## Data Flow Diagram

```
User right-clicks topic → 3-dot menu → "Import markdown"
        │
        ▼
  <input type="file"> picker
        │
        ▼
   file.text()  ──────────────────────────────────────────────┐
        │                                                       │
        ▼                                                       │
parseMarkdownImport(content, filename)                         │
  detects format, extracts messages + metadata                 │
        │                                                       │
        ▼                                                       │
showImportMarkdownDialog({ title, source })   ← pre-filled ───┘
        │  (user confirms / edits)
        ▼
buildImportedChatEntry(parsed, formValues, topicId)
  → ChatEntry (canonical bAInder shape)
        │
        ├── extractChatEntities(entry)   → entities spread
        │
        ▼
  chatRepo.addChat(entry)
        │
        ├── chatIndex updated
        ├── chatSearchIndex updated
        └── chrome.storage.local  "chat:<id>" written
               │
               ▼
        renderTreeView()  → new item visible in topic
        selectNode(entry.id)  → chat opens in reader
        toast: "Chat imported from markdown"
```

---

## Files Changed / Created

| Status | Path | Change |
|---|---|---|
| **New** | `src/lib/io/markdown-import.js` | `parseMarkdownImport()` pure parser |
| **New** | `tests/markdown-import.test.js` | parser unit tests |
| Modified | `src/sidepanel/sidepanel.html` | Add `<li data-action="import-markdown">` |
| Modified | `src/sidepanel/controllers/topic-actions.js` | Register action, add `handleImportMarkdown()` |
| Modified | `src/sidepanel/features/topic-dialogs.js` | Add `showImportMarkdownDialog()` |
| Modified | `src/background/chat-save-handler.js` | Add/expose `buildImportedChatEntry()` |

No changes required to: background message router, content scripts, the reader
page, markdown-serialiser, or the existing ZIP import path.

---

## Out of Scope (this iteration)

- Drag-and-drop of `.md` files onto the topic node in the tree.
- Bulk import of multiple `.md` files at once (that is closer to ZIP import).
- Auto-detecting the IDE tool from file content (source label stays editable
  free-form text).
- Inline paste of raw markdown text (paste dialog) — that can be a follow-on
  if the file-picker UX proves insufficient.
- Any changes to the reader rendering engine (the import writes canonical
  `markdown-v1` so the reader needs no changes).

---

## Open Questions

1. **Source enum vs. free text** — The `source` field on a `ChatEntry` is
   currently one of a defined set of values (`chatgpt`, `claude`, `gemini`,
   `copilot`, `perplexity`, `deepseek`).  External imports need a graceful
   extension.  Options:
   - Add `"external"` as a catch-all sentinel value.
   - Allow any string in `source` and update icon/label logic to fall back
     to a generic robot icon for unknown values.
   - Add explicit values `"vscode"`, `"cursor"` etc. as the set grows.
   Recommendation: use `"external"` sentinel for now, refine when specific IDE
   integrations are added.

2. **Deduplication** — The background `handleSaveChat()` deduplicates by URL
   within a 5-second window.  The direct `chatRepo.addChat()` call proposed
   here skips that.  Since IDE chats have no meaningful URL this is fine, but
   re-importing the same `.md` file twice will create two entries.
   A lightweight filename+size hash check could be added later if this becomes
   a pain point.

3. **Content warnings** — Very large markdown files (e.g. a long Cursor session
   with embedded code blocks) could approach `chrome.storage.local` per-item
   limits.  The existing save pipeline already handles this; the import path
   will inherit the same risk.  No special handling needed for the initial
   implementation.
