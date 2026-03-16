# 🗂️ bAInder — AI Chat Organizer

[![License: MIT + Commons Clause](https://img.shields.io/badge/License-MIT%20%2B%20Commons%20Clause-yellow.svg)](LICENSE)

> Stop losing your best AI conversations. bAInder saves, organises, and lets you search every chat from ChatGPT, Claude, Gemini, and Copilot — all in a sleek browser side panel, entirely on your device.

Install the extension, hit **Save** on any conversation, drop it into a topic, and it's yours forever — tagged, searchable, and readable in a clean viewer. No accounts, no cloud sync, no data ever leaves your browser.

> 🔒 **Fully local & private** — All data lives in `chrome.storage.local`. Nothing is ever transmitted anywhere.

**[▶ Watch the animated tutorial](docs/tutorial.html)**

---

## 🤖 Supported platforms

| AI Service | URL |
|---|---|
| 🟢 ChatGPT | `chat.openai.com` / `chatgpt.com` |
| 🟠 Claude | `claude.ai` |
| 🔵 Gemini | `gemini.google.com` |
| 🔷 Microsoft Copilot | `copilot.microsoft.com` |
| 🔍 Perplexity | `perplexity.ai` |

---

## ✨ Features

### 💾 Capture
| | |
|---|---|
| 💾 **One-click Save button** | A floating "Save to bAInder" button is injected on every supported AI page. Click it to snapshot the full conversation locally — no copy-paste required. |
| ✂️ **Right-click selection save** | Highlight any text on a supported AI page, right-click, and choose "Save selection to bAInder". The excerpt is captured as rich Markdown and stored as its own entry. |
| 🔊 **Audio interception** | Generated audio from ChatGPT and Gemini is automatically captured as a data URI so it remains playable even after the original URL expires. |
| 🖼️ **Microsoft Designer image capture** | Images generated in Microsoft Copilot's Designer panel are automatically screenshot-captured and attached to the saved chat. |

### 🗂️ Organise
| | |
|---|---|
| 🌳 **Hierarchical topic tree** | Organise chats into unlimited-depth nested topics with sorted counts, activity sparklines, and pinned favourites. |
| 📁 **Full topic management** | Add, rename, delete, move (drag-and-drop or menu), merge, and pin topics at any depth. |
| 🏷️ **Tags** | Add comma-separated tags at save time or later; shown as coloured chips and included in all search and filter operations. |
| ⭐ **Star ratings** | Rate chats 1–5 stars from the context menu or the Reader header; filter search results by minimum rating. |
| ⏰ **Review-by date & stale alerts** | Set a review date on any chat; the extension checks daily and shows a ⚠️ badge and Reader banner when it is overdue. |

### 🔍 Find
| | |
|---|---|
| 🔍 **Powerful full-text search** | Debounced live search across titles, content, and tags with snippet previews, topic breadcrumbs, and source badges. |
| 🎯 **Advanced filter bar** | Narrow results by platform (ChatGPT / Claude / Gemini / Copilot / Perplexity), date range, topic scope, minimum star rating, or tag name — all combinable. |
| 🕐 **Recently saved rail** | Horizontal scrollable strip below the search bar showing your eight most recently saved chats as quick-access chips. |

### 📖 Read & Annotate
| | |
|---|---|
| 📖 **Distraction-free Reader** | Full custom Markdown renderer — code blocks with syntax highlighting and copy buttons, tables, Mermaid diagrams, images, and audio players — with persistent scroll position so you resume exactly where you left off. |
| 🔢 **Message ordinal labels** | Every prompt and response in the Reader is labelled P1/R1, P2/R2, … as deep-linkable anchors, making it easy to reference specific turns. Toggle them on or off in Settings. |
| 🖍️ **Colour highlights** | Select any text in the Reader and apply a colour highlight (yellow, green, blue, red, or purple) with an optional attached note. Highlights survive page reloads. |
| 📝 **Sticky notes** | Add floating, draggable, resizable Markdown sticky notes anchored anywhere over the chat body. Show or hide the note layer as needed. |

### 🧬 Entity Browser
| | |
|---|---|
| 🧬 **Chat Entities tab** | A second panel tab that automatically extracts and indexes ten types of structured content from every saved chat: user prompts, citations, tables, code snippets, diagrams, tool calls, file attachments, images, audio, and Claude/ChatGPT Artifacts. |
| 🔎 **Entity navigation** | Click any entity card to jump directly to the exact message in the Reader where it appears. |
| 🖼️ **Artifact preview & download** | Preview Claude Artifacts and ChatGPT Canvas panels in a sandboxed in-panel iframe. Copy the source or download it with the correct file extension. |

### 🆚 Compare
| | |
|---|---|
| ⚖️ **Side-by-side Compare page** | Select 2 or more saved chats in multi-select mode and open them in a Compare page — panels scroll in sync, with unique terms highlighted per chat. |
| 📐 **Structural analysis** | Automated count of headings, code blocks, lists, tables, and words per chat — shown as a comparison card. |
| 🏷️ **Topic fingerprint** | TF-IDF key-term extraction per chat, with a shared "Common topics" section and per-chat distinctive terms. |
| 🧠 **Confidence scoring** | Each chat is scored for assertiveness vs hedging; the most definitive answer is flagged and key agreements / divergences are surfaced. |
| 🤖 **"Compare with AI" card** | One-click compare mechanism to arbitrate between your saved answers on the same topic. |

### 📤 Export, Import & Clipboard
| | |
|---|---|
| 📄 **Markdown export** | Export any chat, topic, or multi-chat selection as a `.md` file with YAML frontmatter (title, source, date, tags, rating). |
| 🌐 **HTML export** | Self-contained `.html` files with embedded styles — no external dependencies. |
| 🖨️ **PDF export** | Opens the HTML export in a new tab and triggers the browser's print dialog for immediate PDF saving. |
| 📦 **ZIP export** | Package an entire topic (or your whole library) as a ZIP of per-chat files plus a `README.md` and `metadata.json`. |
| 🤖 **JSONL fine-tuning export** | Export chats in OpenAI fine-tuning format (`{"messages":[{"role":…,"content":…}]}`, one line per chat) with an optional custom system message. |
| 📥 **Import from ZIP** | Restore topics and chats by importing a previously exported ZIP — great for backups or moving between browsers. |
| 📋 **Flexible clipboard copy** | Copy any chat (or a bulk selection) to the clipboard in Plain text, Markdown, or HTML. Configure separators, emoji stripping, image inclusion, and attachment inclusion in Settings. |
| ☑️ **Multi-select & bulk actions** | Enable multi-select mode to batch compare, export a digest, copy, or assemble selected chats into a single merged entry — all in a few clicks. |

### 🎛️ Customise & Monitor
| | |
|---|---|
| 🎨 **Themes** | Customise the look with [ThemeStudioSDK](https://github.com/Veverke/ThemeStudioSDK) themes, including community presets like Neon, Mario Bros, and Sci-Fi. |
| 📊 **Activity sparklines** | Per-topic mini bar charts showing weekly save activity over the last six weeks. |
| 💿 **Storage usage meter** | Bottom-of-panel bar showing how much local storage is in use; turns orange/red when you approach the limit. |
| 🔔 **Backup reminder** | Configurable banner that reminds you to export a backup ZIP when your last export was too long ago; supports snooze and "never remind" options. |
| ⚙️ **Settings panel** | Slide-in settings for clipboard format, emoji/image/attachment inclusion, custom chat/turn separators, Reader ordinal labels, log level, and backup reminder interval. |

### ThemeStudioSDK Integration

bAInder supports out-of-the-box theming through **ThemeStudioSDK**.

- End users can install and apply ThemeStudioSDK themes without changing bAInder source code.
- Theme files are intentionally not stored in this repository.
- ThemeStudioSDK is currently maintained as a separate repository (private for now, planned to be public).

This keeps the core bAInder repository focused on extension functionality while theme packs are managed as a third-party service.

---

## 🆚 How bAInder Compares

Every AI chat platform saves your conversations — but discovery, organisation, and recall are where they all fall short. Here's how each platform's native features stack up against bAInder.

**Legend:** ✅ Full · ⚠️ Partial / limited · ❌ None · 🔒 Paid plan required

> **Accuracy note:** Native platform features change frequently. This table reflects capabilities verified against official documentation as of March 2026.

### 🌐 Platform Coverage

| Feature | ChatGPT | Gemini | Copilot | Claude | Perplexity | **bAInder** |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| Native ChatGPT support | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Native Gemini support | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ |
| Native Copilot support | ❌ | ❌ | ✅ | ❌ | ❌ | ✅ |
| Native Claude support | ❌ | ❌ | ❌ | ✅ | ❌ | ✅ |
| Native Perplexity support | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| **Single tool covers all 5** | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |

### 💾 Saving & Capturing

| Feature | ChatGPT | Gemini | Copilot | Claude | Perplexity | **bAInder** |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| One-click save to local storage | ❌¹ | ❌¹ | ❌¹ | ❌¹ | ❌¹ | ✅ |
| Clip a highlighted text selection | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Capture generated audio persistently | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Capture AI-generated images persistently | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Works without a cloud account | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Data stays entirely on your device | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |

¹ Chats auto-sync to vendor servers. There is no one-click "save a snapshot locally" action.

### 🗂️ Organisation

| Feature | ChatGPT | Gemini | Copilot | Claude | Perplexity | **bAInder** |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| Folder / project grouping | ⚠️² | ❌ | ❌ | ⚠️³ | ⚠️⁴ | ✅ |
| Unlimited nested hierarchy | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Drag-and-drop reordering / moving | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Merge topics | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Tags (coloured chips, searchable) | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Star ratings (1–5) | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Review-by date & overdue alerts | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Pin favourite chats / topics | ❌ | ⚠️⁵ | ❌ | ❌ | ❌ | ✅ |

² ChatGPT Projects are flat (no sub-projects), cloud-only, require a ChatGPT account.  
³ Claude Projects are flat, cloud-only, max 5 on the free tier.  
⁴ Perplexity Collections are flat, server-side only.  
⁵ Gemini lets you pin individual chats, but there is no folder structure.

### 🔍 Finding

| Feature | ChatGPT | Gemini | Copilot | Claude | Perplexity | **bAInder** |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| Full-text search | ⚠️⁶ | ⚠️⁶ | ⚠️⁷ | ⚠️⁶ | ⚠️⁶ | ✅ |
| Search across all platforms at once | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Filter by source platform | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Filter by date range | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Search within tags | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Filter results by star rating | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Snippet preview in results | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Recently saved strip | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |

⁶ Search covers only that platform's own history.  
⁷ Copilot history search is minimal with no content preview.

### 📖 Reading & Annotating

| Feature | ChatGPT | Gemini | Copilot | Claude | Perplexity | **bAInder** |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| Distraction-free clean reader | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Message ordinal labels with deep links | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Persistent scroll position | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Sticky notes (Markdown, draggable) | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Colour-highlight passages | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |

### 🧬 Entity Extraction & Analysis

| Feature | ChatGPT | Gemini | Copilot | Claude | Perplexity | **bAInder** |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| Automatically index all code snippets | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Automatically index all Artifacts / Canvas | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Automatically index tables, diagrams, citations | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Preview Artifacts in a sandboxed panel | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Navigate directly to an entity in the reader | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |

### ⚖️ Comparison & Analysis

| Feature | ChatGPT | Gemini | Copilot | Claude | Perplexity | **bAInder** |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| Side-by-side multi-chat comparison | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Unique-term highlighting across chats | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Structural metrics card | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Confidence / assertiveness scoring | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| One-click "Compare with AI" | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |

### 📤 Export & Portability

| Feature | ChatGPT | Gemini | Copilot | Claude | Perplexity | **bAInder** |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| Export to Markdown | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Export to HTML | ⚠️⁸ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Export to PDF | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Multi-chat digest with table of contents | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| ZIP archive export per topic | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| JSONL fine-tuning export | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Assemble multiple chats into one entry | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Import / restore from ZIP | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Copy to clipboard (plain / Markdown / HTML) | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Share conversation via public link | ✅ | ✅ | ❌ | ✅ | ✅ | ❌⁹ |

⁸ ChatGPT's "Export data" (in Settings) produces a raw JSON/HTML archive of your entire account — not a per-chat usable export.  
⁹ By design: bAInder is local-first. Share via ZIP export instead.

### 🎛️ Customisation & Insights

| Feature | ChatGPT | Gemini | Copilot | Claude | Perplexity | **bAInder** |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| Community theme packs | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Per-topic activity sparklines | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Local storage usage meter | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Backup reminder with configurable interval | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |

### 🤝 What the platforms have that bAInder doesn't

| Feature | ChatGPT | Gemini | Copilot | Claude | Perplexity | **bAInder** |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| AI cross-chat memory / context | ✅ | ⚠️ | ❌ | ✅ | ❌ | ❌¹⁰ |
| Team collaboration on shared projects | 🔒 | ❌ | 🔒 | 🔒 | ❌ | ❌ |
| Integration with external services | ✅¹¹ | ❌ | ✅¹² | ❌ | ❌ | ❌ |

¹⁰ bAInder organises conversations — it does not add new AI capabilities.  
¹¹ ChatGPT Projects connect to Google Drive and Slack.  
¹² Copilot integrates deeply with Microsoft 365 (Outlook, Teams, SharePoint).

---

## � Feature Guide — Purposes, Use Cases & UI Flows

This section walks through every major feature in the order you would naturally encounter them. Each entry describes what it does, when you'd reach for it, and the exact steps to use it.

---

### 💾 Saving a conversation

**Purpose:** Snapshot a full AI chat to your local library at any point in the conversation — no copy-paste, no account required.

**Use cases:** You just got a great debugging session from ChatGPT and want to keep it. You asked Claude to draft a contract clause and want to store the result. You want an offline archive before closing the tab.

**UI flow:**
1. Open any ChatGPT, Claude, Gemini, Copilot, or Perplexity conversation.
2. A floating **"💾 Save"** button appears in the corner of the page.
3. Click it. The bAInder side panel opens (or focuses) and a save dialog appears.
4. Type or accept an auto-suggested title, pick a topic from the dropdown, and add optional comma-separated tags.
5. Click **Save**. A green toast confirms success. The chat is now searchable and readable offline.

---

### ✂️ Saving a text selection (excerpt)

**Purpose:** Clip just the relevant part of a conversation — a single code block, a key insight, or a specific answer — without saving the entire thread.

**Use cases:** You got one amazing paragraph out of a long Claude conversation. You want to save only the SQL query an AI wrote, not the full back-and-forth. You're building a collection of specific prompting techniques.

**UI flow:**
1. Open any supported AI page.
2. Select the text you want to keep (click and drag).
3. Right-click the selection → click **"💾 Save selection to bAInder"**.
4. The selection is saved as its own entry labelled with an **Excerpt** badge. Assign a title and topic in the same save dialog.

---

### 🌳 Organising with topics

**Purpose:** Group saved chats into a hierarchical folder structure so you can browse by project, subject, or client rather than scrolling an endless flat list.

**Use cases:** Separate personal chats from work chats. Create nested topics like `Work > Projects > Q1 Planning`. Keep all coding sessions under `Dev > Debugging`.

**UI flow:**
- **Add a topic:** Click the **＋** button at the top of the tree → type a name → optionally pick a parent topic.
- **Rename / delete / move:** Right-click any topic node for the context menu.
- **Drag-and-drop move:** Drag a topic node and drop it onto another to reparent it instantly.
- **Merge topics:** Right-click a topic → **Merge into…** → pick the destination. All chats move and the source topic is removed.
- **Pin a topic:** Right-click → **Pin** — pinned topics sort to the top of their level.
- **Collapse/expand all:** Use the ▲▼ toolbar buttons to collapse or expand the entire tree in one click.

---

### 🏷️ Tags and star ratings

**Purpose:** Add cross-cutting labels (tags) and a quality score (stars) to make chats easier to filter and prioritise.

**Use cases:** Tag chats `python`, `debugging`, `work` to find all Python-related sessions across different topics. Rate a particularly useful answer five stars so you can surface your best material quickly.

**UI flow:**
- **Add/edit tags:** Right-click a chat → **Edit tags** → type comma-separated tags → Save. Tags appear as coloured chips on the chat row and in search results.
- **Rate a chat:** Right-click a chat → **Rate** → click 1–5 stars. Rating is also editable from the Reader header.
- **Filter by rating:** In the search filter bar, set **Min rating** to show only chats at that level or above.

---

### ⏰ Review dates and stale alerts

**Purpose:** Schedule a future date to revisit a chat — useful for decisions you want to re-evaluate, follow-ups, or research you want to update.

**Use cases:** You saved a blog-post draft from Claude — set a review date for the publish deadline. You compared two AI answers about a fast-moving topic — set a 30-day review to check if the answer has changed.

**UI flow:**
1. Right-click a chat → **Set review date** → pick a date.
2. The extension checks daily in the background. When the date passes, the chat receives a **⚠** badge in the tree.
3. Opening the chat in the Reader shows a dismissible overdue banner at the top.
4. Right-click the chat → **Clear review date** to remove the alert.

---

### 🔍 Search and filtering

**Purpose:** Find any saved chat fast — by any word in its content, by platform, by tag, by date, or by rating — across all five platforms at once.

**Use cases:** You remember an AI wrote you a great memoize function but you can't remember which chat. You want all your five-star Gemini conversations from last month. You're looking for everything tagged `python`.

**UI flow:**
1. Click the **search bar** at the top of the side panel and start typing. Results appear live with keyword-highlighted snippets and topic breadcrumbs.
2. Open the **filter bar** (funnel icon) to:
   - Select one or more **source platforms** as pills.
   - Set a **From / To** date range.
   - Restrict to a **topic scope**.
   - Set a **minimum star rating**.
   - Filter by **tag name**.
3. Combine any filters — they stack. A colour-coded badge shows filters are active.
4. Click a result card to open the chat in the Reader.

---

### 🕐 Recently saved rail

**Purpose:** Jump back to your last few chats without having to search or navigate the tree.

**Use cases:** You just saved a chat and want to re-open it immediately. You're saving several chats in a session and want fast access to the most recent ones.

**UI flow:** The horizontal scrollable strip just below the search bar shows the 8 most recently saved chats as small chips with platform colour dots. Click any chip to open it in the Reader. The rail is hidden until you have at least 3 saved chats.

---

### 📖 Reader — reading a saved chat

**Purpose:** View a saved conversation in a clean, distraction-free page with full Markdown rendering — outside the AI platform's cluttered interface.

**Use cases:** You want to read a long research session without ads, sidebar menus, and UI chrome. You want to share a clean view of an AI response. You want to navigate directly to a specific prompt by number.

**UI flow:**
1. Click any chat in the side panel tree, or click a chip in the recently saved rail.
2. The **Reader** opens in a new browser tab.
3. The header shows: source badge, title, word count, estimated reading time, prompt/response counts, tags, and rating.
4. Each user message is labelled **P1, P2, …** and each assistant reply **R1, R2, …** You can click a label to get a direct deep-link anchor URL to that specific turn.
5. Toggle ordinal labels on/off in the ⚙ Settings panel → **Show message ordinals**.
6. Your scroll position is saved automatically and restored next time you open the same chat.

---

### 🖍️ Highlighting passages

**Purpose:** Mark important text in a saved chat with a persistent colour highlight — like a highlighter pen on a printed page — optionally with a note.

**Use cases:** You're studying an AI-generated explanation and want to call out the key sentence. You're reviewing a long answer and want to mark the parts you agree/disagree with in different colours.

**UI flow:**
1. Open a chat in the Reader.
2. Select any text passage.
3. A **highlight toolbar** appears — click a colour swatch (yellow / green / blue / red / purple).
4. Optionally type a note in the text box that appears.
5. The highlight is saved immediately. It re-applies on every future open of that chat.
6. To remove a highlight, click the highlighted text and choose the delete (✕) option.

---

### 📝 Sticky notes

**Purpose:** Add free-form Markdown notes that float over the chat — like digital Post-it notes tied to a position on the page.

**Use cases:** You want to jot down a follow-up question to ask. You want to leave a reminder that a certain code block needs testing. You want to record your own summary of a long analysis.

**UI flow:**
1. Open a chat in the Reader.
2. Click the **"Add note"** button in the Reader toolbar.
3. A sticky note appears at the current scroll position. Type Markdown into it — it renders in real time.
4. Drag the note by its header to reposition it. Resize by dragging the bottom-right corner.
5. Close a note with the **✕** button. Toggle all notes visible/hidden with the note-layer button.

---

### 🧬 Chat Entities tab

**Purpose:** Automatically surface all structured content — code, tables, citations, diagrams, images, audio, Artifacts — from your entire library so you can find and reuse them without re-reading chats.

**Use cases:** You want to find every Python code block you've ever saved from any AI. You want to review all the Mermaid diagrams from a recent architecture session. You want to preview a Claude Artifact without opening the chat.

**UI flow:**
1. Click the **Chat Entities** tab at the top of the side panel.
2. Use the **type filter chips** to show only the entity types you care about (Code, Table, Diagram, Image, etc.).
3. The tree groups entities by type → by chat. Expand a group to see individual entity cards.
4. Click any card to open the Reader at exactly the message where that entity appears.
5. For **Artifacts**, click the **"Preview"** button on the card to load it in a sandboxed panel — then copy its source or download it.

---

### ⚖️ Comparing chats side by side

**Purpose:** Place two or more saved answers to the same question (or related questions) next to each other with automated structural analysis, unique-term highlighting, and confidence scoring.

**Use cases:** You asked the same question to ChatGPT and Claude and want to see which answer is more complete. You saved a series of progressively refined prompts and want to compare how the answers changed. You want to decide which AI answer to use.

**UI flow:**
1. In the side panel tree, click the **"Select"** toolbar button to enter multi-select mode.
2. Tick the checkboxes next to 2 or more chats.
3. Click **Compare** in the selection bar at the bottom.
4. The **Compare page** opens in a new tab with the chats displayed in synced side-by-side panels.
5. Scroll any panel — all panels scroll together.
6. View the **Structural Analysis card** below for counts of headings, code blocks, tables, and words.
7. View the **Unique Terms** panel — words unique to each chat are highlighted inline in their panel.
8. View the **Topic Fingerprint card** for TF-IDF key terms per chat and shared common topics.
9. View the **Confidence Scoring card** to see which chat is most assertive and where the answers agree or diverge.
10. Click **"Send to AI"** in the Compare with AI card to have the comparison prompt auto-injected into a live AI tab.

---

### 📤 Exporting chats

**Purpose:** Take saved chats out of the extension for archiving, sharing, or downstream use — including fine-tuning a language model.

**Use cases:** You want a PDF you can email to a colleague. You want a ZIP backup of an entire research topic. You want Markdown files to commit to a knowledge-base repository. You want a JSONL dataset to fine-tune an AI model.

**UI flow — single chat:**
1. Right-click a chat → **Export** → choose format: **Markdown / HTML / PDF / JSONL**.
2. For JSONL, optionally add a custom system message in the dialog.
3. Click **Export** — the file downloads immediately.

**UI flow — topic or full library:**
1. Right-click a topic → **Export topic** → choose **Markdown or HTML zip**.
2. Or click the **Export All** toolbar button for a full library ZIP.
3. The ZIP contains one file per chat plus a `README.md` and `metadata.json`.

**UI flow — multi-chat digest:**
1. Enter multi-select mode → select chats → click **Export Digest**.
2. Choose format and optionally enable **Table of contents**.
3. A combined document is downloaded.

---

### 📥 Importing a backup

**Purpose:** Restore your library (or part of it) from a previously exported ZIP, including all topic structure and chat content.

**Use cases:** You're switching browsers or computers. You made a backup before clearing storage. A colleague shared a topic ZIP with you.

**UI flow:**
1. Click the **Import ZIP** toolbar button (tray-with-arrow icon).
2. Pick the `.zip` file from your filesystem.
3. Review the conflict-resolution options if topics or chat IDs already exist.
4. Click **Import** — the topic tree updates immediately.

---

### ☑️ Multi-select and bulk actions

**Purpose:** Act on many chats at once — compare, export a combined document, copy to clipboard, or merge them into a single entry.

**Use cases:** You want to export a week's worth of research sessions as one structured document. You want to merge several partial coding sessions into one consolidated chat. You want to copy a set of chats to paste into a document editor.

**UI flow:**
1. Click the **"Select"** button in the side panel toolbar.
2. Check the boxes next to the chats you want (up to 100).
3. The **selection bar** appears at the bottom showing the count and action buttons:
   - **Assemble** — merges all selected chats into one new entry (prompts for title and destination topic).
   - **Export Digest** — opens the export dialog for a combined document.
   - **Copy All** — copies all selected chats to the clipboard in your configured format.
   - **Compare** — opens the Compare page.
   - **Clear** — deselects all.
   - **Cancel** — exits multi-select mode.

---

### 📋 Clipboard and copy settings

**Purpose:** Control exactly how chat content is formatted when you copy it — so it's ready to paste into any tool without manual cleanup.

**Use cases:** You want clean plain text to paste into an email. You want Markdown to paste into Notion or Obsidian. You want HTML to paste into a rich-text editor. You need to strip emojis for a formal document.

**UI flow:**
1. Open ⚙ **Settings** (gear icon in the toolbar).
2. Under **Clipboard**:
   - Set **Format** to Plain text / Markdown / HTML.
   - Toggle **Include emojis**, **Include images**, **Include attachments**.
   - Set a **Chat separator** (the text or HTML between chats in bulk copies).
   - Set a **Turn separator** (the text between each prompt/response within a chat).
3. Click **Copy** on any chat, or use **Copy All** in multi-select mode — the output uses your settings automatically.

---

### 🔔 Backup reminder

**Purpose:** Prompt you to export a ZIP backup on a schedule so you don't lose your library to browser storage clearing.

**Use cases:** You use bAInder heavily and want a monthly reminder to export a backup. You're cautious about browser profile data and want a frequent reminder (every 7 days). You prefer to manage backups yourself and want to disable the reminder.

**UI flow:**
1. The reminder banner appears automatically in the side panel when your last export was longer ago than the configured interval (default: 30 days).
2. Banner buttons: **Export now** (triggers the full library ZIP export), **Remind later** (snoozes 7 days), **Never remind**, **Dismiss** (snoozes one cycle).
3. To change the interval or disable the reminder: ⚙ **Settings** → **Backup reminder** section.

---

### 🎨 Themes

**Purpose:** Change the look of the bAInder side panel to match your taste or browser theme.

**Use cases:** You prefer a dark high-contrast look (Sci-Fi theme). You want something playful for personal use (Mario Bros theme). You want a vivid neon look.

**UI flow:**
1. Click the **palette icon** in the side panel toolbar.
2. Pick a community preset or configure custom CSS variables via the ThemeStudioSDK panel.
3. The theme is applied instantly and persists across sessions.

---

### 🧩 Extension Side Panel

![bAInder screenshot 1](assets/screenshots/bAInder%20screenshot%201.png)

### 📖 Chat Reader View

![bAInder reader screenshot 1](assets/screenshots/bAInder%20reader%20screenshot%201.png)

### 🎨 Themes You Can Install

![bAInder themed screenshot 1](assets/screenshots/bAInder%20themed%20screenshot%201.png)
![bAInder themed screenshot 4](assets/screenshots/bAInder%20themed%20screenshot%204.png)

---

## 🚀 Installation

### 🌐 Chrome
1. Go to `chrome://extensions` and enable **Developer mode**
2. Click **Load unpacked** and select the `dist/chrome` folder
3. Pin the bAInder icon to your toolbar and open the side panel

### 🌐 Edge
1. Go to `edge://extensions` and enable **Developer mode**
2. Click **Load unpacked** and select the `dist/edge` folder
3. Pin the bAInder icon to your toolbar and open the side panel

### 🛠️ Build from source
```bash
npm install
npm run build:all   # produces dist/chrome/ and dist/edge/
```

---

## 🛠️ Contributing & Development

### 🏁 Getting Started

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/bAInder.git
   cd bAInder
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start development with watch mode**
   ```bash
   npm run dev
   ```

4. **Load the extension in your browser**
   - **Chrome**: Open `chrome://extensions`, enable Developer mode, click **Load unpacked**, and select `dist/chrome/`
   - **Edge**: Open `edge://extensions`, enable Developer mode, click **Load unpacked**, and select `dist/edge/`

### 📜 Available Scripts

```bash
npm run build:all    # Build extensions for both Chrome and Edge
npm run dev          # Start development server with watch mode
npm run test         # Run tests with Vitest
npm test -- --watch # Run tests in watch mode
npm run lint         # Run ESLint
```

### 🗃️ Project Structure

- **`src/background/`** — Extension background scripts
- **`src/content/`** — Content scripts injected into web pages
- **`src/sidepanel/`** — Side panel UI and logic
- **`src/reader/`** — Chat viewer UI
- **`src/lib/`** — Core utilities, storage, export/import logic
- **`tests/`** — Test files for all modules
- **`docs/`** — Documentation and design specs

### 🧪 Testing

Run the test suite:
```bash
npm test
```

Tests use Vitest and cover:
- Chat extraction and parsing
- Data storage and retrieval
- Export/import functionality
- UI components and interactions
- Utility functions

### ✅ Code Quality

- **Linting**: ESLint configuration ensures code consistency
- **Tests**: All new features should include corresponding tests
- **UT Coverage gate**: 90% minimum code coverage required
- **Commits**: Follow conventional commit messages for clarity

### ✍️ Making Changes

1. Create a feature branch: `git checkout -b feature/your-feature`
2. Make your changes and write tests
3. Run `npm run lint` and `npm test` to verify
4. Build with `npm run build:all` to test in the extension
5. Commit with descriptive messages
6. Push and create a pull request

---

## 📄 License

This project is licensed under the **MIT License with Commons Clause** — see the [LICENSE](LICENSE) file for details.

**Copyright © 2026 Avraham Y. Kahana**

You are free to use, modify, and distribute this software for **personal and internal business use**, provided you include the original copyright notice and license text. You may **not** sell the Software or offer it as a commercial product or hosted service whose value derives substantially from the functionality of this Software.

For contribution guidelines, see [CONTRIBUTING.md](CONTRIBUTING.md).

