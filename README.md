# 🗂️ bAInder — AI Chat Organizer

> Stop losing your best AI conversations. bAInder saves, organises, and lets you search every chat from ChatGPT, Claude, Gemini, and Copilot — all in a sleek browser side panel, entirely on your device.

**[▶ Watch the animated tutorial](docs/tutorial.html)**

---

## 🤔 What is bAInder?

Every day you have insightful conversations with AI assistants that disappear into an ever-growing, unsearchable history. bAInder fixes that.

Install the extension, hit **Save** on any conversation, drop it into a topic, and it's yours forever — tagged, searchable, and readable in a clean viewer. No accounts, no cloud sync, no data ever leaves your browser.

---

## ✨ Features

### 💾 Save from any AI platform
A floating **Save** button appears automatically on ChatGPT, Claude, Gemini, and Microsoft Copilot. One click captures the full conversation. The title is auto-detected; you pick the topic and add tags.

You can also **save just a selection**: highlight any text on an AI page, right-click, and choose **Save selection to bAInder** to clip only that passage as a standalone entry.

### 🌳 Hierarchical topic tree
Organise chats into a nested folder structure of topics and sub-topics. The tree is always alphabetically sorted, shows per-topic chat counts, and sparkline activity bars so you can see which areas you've been working in recently.

### 🔍 Powerful search
Full-text search across every saved conversation — titles, content, and tags — with highlighted snippet previews and topic breadcrumbs in results. Filter results by minimum star rating to surface only your best chats.

### 📖 Distraction-free Reader
Click any saved chat to open it in a clean Reader view. The title, topic breadcrumb, and tags stay visible while you scroll through the full conversation. Your scroll position is remembered per chat, so revisiting a long conversation resumes exactly where you left off.

### 📁 Topic management
- **Add / Rename / Delete** topics at any depth
- **Move** a topic (or chat) to a different parent with drag-and-drop or via the context menu
- **Merge** two topics into one — all chats and sub-topics are combined automatically
- **📌 Pin** important topics so they float to the top of the tree

### ⭐ Star ratings
Rate any saved chat 1–5 stars from the context menu or directly in the Reader header. Rated chats display an amber star badge in the tree, and search results can be filtered by minimum rating so your best conversations are always easy to find.

### ⏰ Review-by date & stale alerts
Mark any chat as time-sensitive by setting an optional review date. When the date passes, a ⚠️ badge appears on the chat in the tree and a dismissible banner appears at the top of the Reader. Hit **Mark as reviewed** to clear the flag, or update the date to push it forward.

### 🏷️ Tags
Attach comma-separated tags to any chat at save time, or edit them later. Tags appear as coloured chips throughout the UI and are included in search.

### 📝 Sticky notes & text annotations
Inside the Reader you can:
- **Sticky notes** — right-click anywhere to add a draggable sticky note. Notes support Markdown, auto-save, and can be shown or hidden with a single click.
- **Text annotations** — select any passage and highlight it in one of several colours. Highlights are persisted and restored every time you open the chat.

### ☑️ Multi-Chat Assembly / Digest Export
Combine multiple saved chats into one document. Activate **multi-select mode** from the side panel toolbar to check off any number of chats across different topics, then export the combined selection as a single **digest document** — Markdown, HTML, or PDF — with a heading per chat and an optional table of contents. Ideal for research summaries and handoff documents.

### 📦 Export & Import
Right-click any topic → **Export** to download a ZIP archive of all its chats as Markdown or HTML files. Use **Import** to restore or share a ZIP on any machine.

### 🎨 Themes
- Customise the extension's look using [ThemeStudioSDK](https://github.com/Veverke/ThemeStudioSDK) themes.
- Want inspiration? The community package includes **⚡ Neon**, **🍄 Mario Bros**, **🚀 Sci-Fi**, **⌨️ Typewriter**, and many other cool themes — try it out!

### 🕐 Recently saved rail
A horizontal scrollable rail below the search bar shows your five most recently saved chats for quick one-click access.

### 📊 Activity sparklines
Each topic card in the tree displays a mini bar chart showing how many chats were saved per week over the last six weeks — a quick visual pulse of where your activity has been.

### 💿 Storage usage meter
A storage bar at the bottom of the side panel shows how much of your local storage budget is in use, so you always know when it's time to export and tidy up.

### 🔒 Fully local & private
All data is stored in your browser using `chrome.storage.local`. Nothing is transmitted anywhere.

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

#### 🛠️ Build from source
```bash
npm install
npm run build:all   # produces dist/chrome/ and dist/edge/
```

---

## 🤖 Supported platforms

| AI Service | URL |
|---|---|
| 🟢 ChatGPT | `chat.openai.com` / `chatgpt.com` |
| 🟠 Claude | `claude.ai` |
| 🔵 Gemini | `gemini.google.com` |
| 🔷 Microsoft Copilot | `copilot.microsoft.com` |

---

## 🎬 Tutorial

The animated walkthrough covers the full workflow in two parts — core usage and advanced features.

**[Open tutorial →](docs/tutorial.html)**

*(The tutorial is a self-contained animated HTML page. Download the repo and open `docs/tutorial.html` in your browser for the best experience.)*

---

## 📄 License

MIT