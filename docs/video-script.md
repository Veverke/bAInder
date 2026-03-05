# bAInder — Instructional Video Script & Production Guide

**Format:** Narrated walkthrough with chapter breaks  
**Total target length:** 5–8 min (split into two parts)  
**Audience:** General users and power users  
**Structure:** Part 1 — Core Flows (~3 min) · Part 2 — Advanced Features (~4 min)

---

## Production checklist (before recording)

- [ ] Chrome loaded with a fresh bAInder install (no pre-existing data for Part 1)
- [ ] Open ChatGPT (chatgpt.com) with 2–3 ready-made conversations (one short, one longer)
- [ ] Side panel pinned and visible
- [ ] Screen resolution: 1920×1080, browser zoom at 100 %
- [ ] Record at 60 fps
- [ ] Mic tested, minimal background noise
- [ ] Cursor-highlight tool active (so mouse position is obvious)
- [ ] Before Part 2: pre-populate tree with ~3 topics and ~5 chats for demo richness

---

## PART 1 — Core Flows

### Chapter 0 — Cold open / hook  
**Duration:** ~15 s  
**Screen:** Animated title card or a quick montage of the extension UI  

**Narrator:**  
> "You've had hundreds of great conversations with AI — but where do they go? bAInder is a Chrome extension that lets you save, organise, and revisit every chat that matters."

---

### Chapter 1 — Installing the extension  
**Duration:** ~30 s  
**Screen:** Chrome extensions page → Load unpacked (or Chrome Web Store if published)

**On-screen action:**
1. Navigate to `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** → select the bAInder folder
4. Extension icon appears in toolbar; pin it

**Narrator:**  
> "Installing bAInder takes under a minute. After loading the extension, pin it to your toolbar so it's always one click away."

---

### Chapter 2 — Saving your first chat  
**Duration:** ~45 s  
**Screen:** ChatGPT conversation open in a tab

**On-screen action:**
1. Navigate to an existing ChatGPT conversation
2. Click the bAInder toolbar icon — side panel slides open
3. Click **Save this chat** (or point out that the save is triggered from the side panel / context menu depending on current UX)
4. The **Assign Chat** dialog appears

**Narrator:**  
> "When you're on a ChatGPT page, open the bAInder side panel and click Save. A dialog appears asking where you'd like to file this conversation."

---

### Chapter 3 — Assigning a topic, title & tags  
**Duration:** ~45 s  
**Screen:** Assign Chat dialog

**On-screen action:**
1. Dialog shows auto-detected title — edit it to something descriptive
2. Click the topic dropdown — pick an existing topic, or click **+ New topic** to create one
3. In the **Tags** field, type `react, performance` → chips appear
4. Click **Save**
5. Side panel tree animates, new chat node flashes briefly under the chosen topic

**Narrator:**  
> "You can rename the chat, place it in a topic — or create a new one on the fly — and add free-text tags for quick filtering later. Click Save and the chat is filed instantly."

---

### Chapter 4 — The side panel at a glance  
**Duration:** ~30 s  
**Screen:** Side panel showing tree with a few topics

**On-screen action:**  
Point out each element in order:
1. **Search bar** at the top
2. **Recently saved rail** — horizontal scrollable chips
3. **Topic tree** — folders with expand/collapse arrows, date-span badges, chat-count badges, histogram sparklines
4. **Storage usage** meter at the bottom

**Narrator:**  
> "The side panel is your personal library. At the top, a search bar for instant lookup. Below it, a rail showing your five most recent saves. The main area is a topic tree — each topic shows its date range and how many chats it holds."

---

### Chapter 5 — Opening a chat in Reader view  
**Duration:** ~30 s  
**Screen:** Side panel → click a chat → Reader opens in a new tab

**On-screen action:**
1. Click any chat node in the tree
2. Reader opens in a new tab — clean, readable formatting
3. Scroll through the conversation

**Narrator:**  
> "Click any saved chat to open it in the built-in Reader — a clean, distraction-free view of the full conversation."

---

### Chapter 6 — Basic search  
**Duration:** ~30 s  
**Screen:** Side panel search

**On-screen action:**
1. Click the search bar, type a keyword (e.g. `performance`)
2. Tree highlights matching topic names; search result cards appear below
3. Each card shows a snippet with the keyword highlighted and the topic breadcrumb
4. Click a result card — Reader opens at that chat

**Narrator:**  
> "Search works across all your saved chats — full text, titles, and tags. Results show a preview snippet and tell you exactly which topic the chat lives in. Click to open."

---

### Part 1 — End card  
**Duration:** ~10 s  
**Screen:** Title card: "That's the core workflow — save, organise, find."

---

## PART 2 — Advanced Features

### Chapter 7 — Topic management  
**Duration:** ~60 s  
**Screen:** Side panel with a populated tree

**7a — Add a topic**  
**On-screen action:** Click **+ Add Topic** button → dialog → type name → choose parent (or root) → confirm  

**Narrator:** > "Need a new folder? Hit the Add Topic button, give it a name, and optionally nest it under a parent."

**7b — Rename, Move, Delete, Merge (context menu)**  
**On-screen action:**  
1. Right-click a topic → context menu appears
2. Click **Rename** → edit name inline, confirm
3. Right-click another topic → **Move** → pick new parent
4. Demo **Merge**: right-click → **Merge into…** → pick target topic → both topics combine, chats consolidate

**Narrator:**  
> "Right-clicking any topic opens a context menu with full management options. Rename, move to a different parent, delete, or merge two topics together — great for cleaning up duplicates."

---

### Chapter 8 — Drag & drop  
**Duration:** ~30 s  
**Screen:** Side panel

**On-screen action:**
1. Drag a topic node and drop it onto a different parent — tree re-orders
2. Drag a chat item from one topic and drop it onto another topic

**Narrator:**  
> "Everything in the tree is draggable. Reorganise topics and chats by simply dragging them where they belong."

---

### Chapter 9 — Pinning a topic  
**Duration:** ~20 s  
**Screen:** Side panel

**On-screen action:**
1. Hover over a topic — pin icon appears in the header
2. Click the pin — topic moves to the top of the tree, shown with a 📌 prefix

**Narrator:**
> "Pin your most important topics with the pin icon — pinned topics always float to the top of the tree, no matter how many others you have."

---

### Chapter 10 — Tags & tag search  
**Duration:** ~30 s  
**Screen:** Tree view showing chat chips; search bar

**On-screen action:**
1. Point out coloured tag chips on a chat node in the tree
2. Click the search bar, type a tag name (e.g. `react`) — results highlight tag matches
3. Result cards show the matching tag chip highlighted

**Narrator:**  
> "Tags let you cross-reference chats independently of the folder structure. Search by tag name and bAInder highlights the matching [react] chip right in the result card."

---

### Chapter 11 — Sticky notes in Reader  
**Duration:** ~45 s  
**Screen:** Reader view

**On-screen action:**
1. Right-click anywhere in the reader — context menu → **Add Sticky Note**
2. A sticky-note overlay appears, cursor inside, ready to type
3. Type a note (e.g. "Follow up: try the chunking approach")
4. Note auto-saves; show Markdown preview toggle
5. Click **Show/Hide notes** header toggle — all notes collapse/expand
6. Add a second note, demonstrate drag to reposition

**Narrator:**  
> "Inside the Reader you can attach sticky notes anywhere — right-click and choose Add Sticky Note. Notes are a personal layer on top of the read-only conversation. They auto-save, support Markdown, and can be shown or hidden with a single click."

---

### Chapter 12 — Export & Import  
**Duration:** ~45 s  
**Screen:** Side panel → Export flow; then Import flow

**12a — Export**  
**On-screen action:**
1. Right-click a topic → **Export**
2. Export dialog: choose format (Markdown / HTML), confirm
3. ZIP file downloads to disk

**Narrator:** > "Right-click any topic and export it — you'll get a ZIP containing each saved chat as a Markdown or HTML file, ready to share or archive."

**12b — Import**  
**On-screen action:**
1. Click **Import** button in side panel toolbar
2. File picker → select the previously exported ZIP
3. Import dialog shows a summary: "3 chats → 1 topic"
4. Confirm — tree updates, chats appear

**Narrator:** > "Import brings a ZIP straight back into your library — useful for moving data between machines or restoring a backup."

---

### Chapter 13 — Themes, skins & accent colours  
**Duration:** ~45 s  
**Screen:** Settings panel

**On-screen action:**
1. Click the **Settings** (gear) icon
2. Toggle **Theme**: Light → Dark → OLED → Auto; show each briefly
3. Switch **Skin**: Default → Sharp → Rounded → Outlined → Elevated
4. Pick an **Accent colour**: Rose, Teal, Amber — watch the UI update live

**Narrator:**  
> "Personalise the look in Settings. Choose from four base themes — including an OLED pitch-black mode for AMOLED screens — five control skins, and three accent colours. Changes apply instantly."

---

### Chapter 14 — Activity sparklines & stats  
**Duration:** ~20 s  
**Screen:** Side panel with a few topics active over several weeks

**On-screen action:**
1. Point to the mini bar chart (sparkline) visible inside a topic card
2. Hover over it — tooltip shows "X chats saved in the last 6 weeks"

**Narrator:**  
> "Each topic card shows a mini sparkline — a tiny bar chart of how many chats you've saved per week over the last six weeks. A quick visual pulse of where your activity has been."

---

### Chapter 15 — Closing  
**Duration:** ~20 s  
**Screen:** Animated outro / extension icon

**Narrator:**  
> "That's bAInder — your personal library for AI conversations. Save, organise, search, annotate, export. Everything you need to turn fleeting chats into a lasting knowledge base. Install the extension — link in the description."

---

## Post-production notes

| Element | Recommendation |
|---|---|
| Chapters | Use YouTube chapter markers (timestamps in description) |
| Captions | Auto-generated + manual review for accuracy |
| Background music | Optional ambient track, kept very low under narration |
| Lower-thirds | Show chapter title on screen for 2–3 s at each chapter break |
| Transitions | Simple cross-dissolve between chapters; no flashy effects |
| Cursor highlight | Yellow/orange glow on cursor; click flash on each click |
| Zoom-ins | Zoom to 130–150 % on dialogs so text is legible at small playback sizes |
| Thumbnail | Side-by-side: ChatGPT page on left, bAInder side panel on right |

---

## Suggested chapter timestamps (approximate)

**Part 1**
```
0:00  Intro / hook
0:15  Installing the extension
0:45  Saving your first chat
1:30  Assigning topic, title & tags
2:15  Side panel at a glance
2:45  Opening Reader view
3:15  Basic search
3:45  End card
```

**Part 2**
```
0:00  Intro (quick recap sentence)
0:10  Topic management (add / rename / move / merge)
1:10  Drag & drop
1:40  Pinning a topic
2:00  Tags & tag search
2:30  Sticky notes
3:15  Export & Import
4:00  Themes, skins & accent colours
4:45  Activity sparklines
5:05  Closing
```
