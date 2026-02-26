# bAInder — End-to-End Test Plan

| Symbol | Meaning |
|--------|---------|
| `[ ]` | Not yet tested |
| `[x]` | Pass |
| `[!]` | Bug found |
| `—` | N/A on this platform |

---

| # | Category | Test Case | ChatGPT | Claude | Gemini | Copilot |
|---|----------|-----------|:-------:|:------:|:------:|:-------:|
| A01 | Injection | Extension loads on the site — zero console errors | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| A02 | Injection | "Save to bAInder" button appears on an active conversation page | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| A03 | Injection | Button absent on home / new-chat page (no conversation yet) | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| A04 | Injection | Button appears after first reply arrives, without page reload | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| A05 | Injection | Navigating to a different conversation: button moves to the new chat | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| A06 | Injection | Button absent on non-conversation pages (settings, account, explore) | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| B01 | Extraction | All user turns captured — count matches what is visible in UI | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| B02 | Extraction | All assistant turns captured — count matches what is visible in UI | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| B03 | Extraction | Turn order preserved: user → assistant → user → … | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| B04 | Extraction | Long conversation (10+ turns) — all turns captured, none missing | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| B05 | Extraction | User turn prefixed with 🙋 in the reader | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| B06 | Extraction | Assistant turn prefixed with 🤖 on its first non-empty line only | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| B07 | Extraction | `---` separator appears between consecutive turns | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| C01 | Markdown | Plain prose extracted without garbage characters | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| C02 | Markdown | Bold preserved as `**bold**` | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| C03 | Markdown | Italic preserved as `*italic*` | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| C04 | Markdown | Inline code preserved as `` `code` `` | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| C05 | Markdown | Fenced code block preserved with correct language label | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| C06 | Markdown | Numbered list items preserved as `1. 2. 3.` | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| C07 | Markdown | Bulleted list items preserved as `- item` | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| C08 | Markdown | Heading preserved with correct `#` level | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| C09 | Markdown | Blockquote preserved as `> text` | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| C10 | Markdown | Hyperlink preserved as `[text](url)` | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| C11 | Markdown | `https://` image preserved as `![alt](url)` | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| C12 | Markdown | `blob:` image URL is **not** saved (session-only, omitted) | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| C13 | Markdown | "You said:" / "Copilot said:" role labels absent from saved content | — | — | — | `[ ]` |
| C14 | Markdown | Microsoft Designer generated image captured (data URL or https URL) | — | — | — | `[ ]` |
| D01 | Title | Save dialog pre-filled with text from first user message | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| D02 | Title | Title field is editable before saving | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| D03 | Title | Very short first message → title falls back gracefully ("Untitled Chat" or URL segment) | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| D04 | Title | Markdown artefacts (`**`, `##`, `` ` ``) stripped from the generated title | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| E01 | Save | Chat saved to root (no topic) — appears at root level in tree | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| E02 | Save | Chat saved to an existing topic — appears inside that topic | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| E03 | Save | New topic created on-the-fly inside the save dialog — chat placed in it | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| E04 | Save | Saving the same URL a second time → duplicate warning shown | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| E05 | Save | Cancelling the save dialog → chat not saved | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| F01 | Topics | Create root topic via "+ Add Topic" button | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| F02 | Topics | Create subtopic via right-click → "Add subtopic" | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| F03 | Topics | 3-level nesting (root → child → grandchild) visible and correctly indented | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| F04 | Topics | Timespan badge shows date range on a topic that contains chats | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| F05 | Topics | Rename topic — new name persists after panel reload | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| F06 | Topics | Collapse topic node — children hidden | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| F07 | Topics | Expand collapsed topic node — children reappear | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| F08 | Topics | Collapse/expand state persists after closing and reopening the side panel | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| F09 | Topics | Delete empty topic — removed from tree | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| F10 | Topics | Delete topic with chats — cascade warning dialog shown | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| F11 | Topics | Delete cascades: all descendant subtopics removed | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| F12 | Topics | Delete cascades: all chats in deleted topics removed | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| F13 | Topics | Storage indicator decreases after topic cascade delete | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| F14 | Topics | Topics at the same level are sorted alphabetically | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| G01 | Tags | Add a single tag to a saved chat | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| G02 | Tags | Add multiple comma-separated tags in one edit | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| G03 | Tags | Tag chips visible on the chat row in the tree | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| G04 | Tags | Different tags have visually distinct chip colours | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| G05 | Tags | Remove one tag — that chip disappears, others remain | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| G06 | Tags | Remove all tags — no chips shown on the chat row | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| H01 | Chat Mgmt | Right-click chat → Delete → confirmation dialog shown | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| H02 | Chat Mgmt | Delete confirmed → chat removed from tree | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| H03 | Chat Mgmt | Parent topic still present after its last chat is deleted | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| H04 | Chat Mgmt | Right-click chat → Move to… → topic picker dialog opens | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| H05 | Chat Mgmt | Move confirmed → chat appears in destination topic | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| H06 | Chat Mgmt | Move confirmed → chat absent from source topic | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| H07 | Chat Mgmt | Drag chat onto a different topic → chat reassigned | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| H08 | Chat Mgmt | Drag chat reassignment persists after panel reload | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| H09 | Chat Mgmt | Drag topic onto another topic → dragged topic becomes a child | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| H10 | Chat Mgmt | Drag topic onto root zone → topic becomes root-level | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| H11 | Chat Mgmt | Drop target highlighted during drag | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| I01 | Search | Search by title keyword → matching chats shown | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| I02 | Search | Search by content keyword → matching chats shown | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| I03 | Search | Search by tag name → chats with that tag shown | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| I04 | Search | Partial word match (e.g. "hoo" matches "hooks") | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| I05 | Search | Query with no matches → "No results" empty state shown | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| I06 | Search | Result card shows breadcrumb topic path | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| I07 | Search | Result card shows snippet with keyword highlighted | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| I08 | Search | Clicking result selects and highlights the chat in the tree | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| I09 | Search | Clicking result opens the chat in the reader | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| I10 | Search | Clearing the search box returns tree to full view | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| J01 | Reader | Metadata bar shows source platform label | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| J02 | Reader | Metadata bar shows original URL | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| J03 | Reader | Metadata bar shows save date | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| J04 | Reader | Metadata bar shows topic breadcrumb path | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| J05 | Reader | Clicking source URL opens original chat in a new tab | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| J06 | Reader | All turns visible — count matches saved message count | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| J07 | Reader | Code block rendered in styled fence, not raw backticks | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| J08 | Reader | Inline image rendered as `<img>` | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| J09 | Reader | Layout reflows without horizontal overflow in a narrow panel | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| K01 | Sticky Notes | Right-click in reader → context menu has "Add Sticky Note" | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| K02 | Sticky Notes | "Add Sticky Note" → overlay appears near click position | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| K03 | Sticky Notes | Note text area is immediately focused | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| K04 | Sticky Notes | Note text persists after closing and reopening the reader | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| K05 | Sticky Notes | Note shows a created / last-modified timestamp | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| K06 | Sticky Notes | `**bold**` renders as bold inside the note | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| K07 | Sticky Notes | `*italic*` renders as italic inside the note | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| K08 | Sticky Notes | `` `code` `` renders as inline code inside the note | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| K09 | Sticky Notes | Second note near same position → disambiguation control appears ("Note 1 of 2") | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| K10 | Sticky Notes | Disambiguation prev/next arrows cycle through overlapping notes | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| K11 | Sticky Notes | "Show sticky notes" toggle hides all note overlays | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| K12 | Sticky Notes | "Show sticky notes" toggle re-shows all note overlays | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| K13 | Sticky Notes | Show/hide state persists after closing and reopening the reader | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| K14 | Sticky Notes | Edit note content → change persists after reload | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| K15 | Sticky Notes | Delete one note → disambiguation count decrements | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| K16 | Sticky Notes | Delete all notes → overlay and disambiguation disappear | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| L01 | Export | Export single chat as Markdown → `.md` downloads | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| L02 | Export | Markdown file has chat title as H1 | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| L03 | Export | Markdown file has metadata block (date, source, URL) | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| L04 | Export | Markdown file has all turns with 🙋/🤖 prefixes | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| L05 | Export | Markdown file has `---` separators between turns | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| L06 | Export | Markdown file fenced code blocks intact | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| L07 | Export | Export single chat as HTML → `.html` downloads | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| L08 | Export | Exported HTML renders standalone (no broken styles or missing assets) | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| L09 | Export | Export single chat as PDF → browser print dialog opens with correct content | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| L10 | Export | Style: "Raw Transcript" — conversation Q&A format preserved | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| L11 | Export | Style: "Blog Post" — content rewritten in blog tone | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| L12 | Export | Style: "Technical Article" — content rewritten in technical tone | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| L13 | Export | Style: "Academic Journal" — content rewritten in academic tone | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| L14 | Export | Style: "LinkedIn Article" — content rewritten in LinkedIn tone | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| M01 | Export ZIP | Topic export, scope "This topic only" → `.zip` downloads | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| M02 | Export ZIP | ZIP contains `README.md` with export metadata | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| M03 | Export ZIP | ZIP contains one `.md` file per chat | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| M04 | Export ZIP | ZIP filenames are sanitised (no illegal characters) | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| M05 | Export ZIP | Scope "Topic + all subtopics" → subfolders mirror hierarchy | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| M06 | Export ZIP | Scope "Entire tree" → all topics and chats included | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| M07 | Export ZIP | Topic exported as HTML single file → renders standalone | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| M08 | Export ZIP | Topic exported as Markdown single file → all chats concatenated | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| N01 | Import | Drop valid `.zip` onto import drop zone → accepted | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| N02 | Import | Click drop zone → file picker opens, accepts `.zip` | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| N03 | Import | Wrong file type (e.g. `.txt`) → error shown, import blocked | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| N04 | Import | Preview phase shows correct topic count | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| N05 | Import | Preview phase shows correct chat count | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| N06 | Import | Confirm import → progress phase shown | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| N07 | Import | Import completes → success summary shown | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| N08 | Import | Tree populated with imported topics matching ZIP folder structure | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| N09 | Import | Imported chat content intact — code and formatting preserved | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| N10 | Import | Cancel import dialog → nothing added to tree | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| O01 | Round-trip | Export topic ZIP → clear storage → import → tree matches original | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| O02 | Round-trip | After import: chat content in reader identical to pre-export content | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| P01 | Themes | Switch to Dark theme → side panel switches to dark colours | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| P02 | Themes | Switch to Light theme → side panel reverts to light colours | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| P03 | Themes | Auto theme → side panel follows OS dark-mode setting | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| P04 | Themes | Sharp skin → all border-radius collapses to 0 | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| P05 | Themes | Rounded skin → pill/rounded shapes visible | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| P06 | Themes | Default skin → standard border-radius restored | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| P07 | Themes | Theme choice persists after closing and reopening the panel | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| P08 | Themes | Skin choice persists after closing and reopening the panel | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| P09 | Themes | Load custom theme JSON → primary accent colour changes | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| P10 | Themes | Custom theme: variables missing from JSON fall back to defaults | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| Q01 | Storage | Storage indicator increases after saving a chat | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| Q02 | Storage | Storage indicator decreases after deleting a chat | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| Q03 | Storage | Storage indicator decreases after a topic cascade delete | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| R01 | Resilience | Panel tree intact after navigating to a non-AI website | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| R02 | Resilience | Panel tree intact after navigating back to an AI platform | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| R03 | Resilience | Works fully offline — save and read without network | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| R04 | Resilience | No uncaught errors in service worker console during a full session | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| R05 | Resilience | No uncaught errors in side panel console during a full session | `[ ]` | `[ ]` | `[ ]` | `[ ]` |

---

## Progress Tracker

| Platform | Total | Pass `[x]` | Bug `[!]` |
|----------|------:|-----------:|----------:|
| ChatGPT  | 147 | | |
| Claude   | 147 | | |
| Gemini   | 147 | | |
| Copilot  | 149 | | |
