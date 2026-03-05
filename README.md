# 🗂️ bAInder — AI Chat Organizer

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

---

## ✨ Features

### 💾 Capture
| | |
|---|---|
| 💾 **Save from any AI platform** | One-click floating Save button on ChatGPT, Claude, Gemini, and Copilot; also clip any highlighted selection via right-click. |

### 🗂️ Organise
| | |
|---|---|
| 🌳 **Hierarchical topic tree** | Organise chats into nested topics with sorted counts, sparklines, and pinned favourites. |
| 📁 **Topic management** | Add, rename, delete, move (drag-and-drop), merge, and pin topics at any depth. |
| 🏷️ **Tags** | Add comma-separated tags at save time or later; shown as coloured chips and included in search. |
| ⭐ **Star ratings** | Rate chats 1–5 stars from the context menu or Reader header; filter search results by minimum rating. |
| ⏰ **Review-by date & stale alerts** | Set a review date on any chat; get a ⚠️ badge and Reader banner when it's overdue. |

### 🔍 Find
| | |
|---|---|
| 🔍 **Powerful search** | Full-text search across titles, content, and tags with snippet previews, breadcrumbs, and star-rating filters. |
| 🕐 **Recently saved rail** | Scrollable strip below the search bar showing your five most recently saved chats. |

### 📖 Read & Annotate
| | |
|---|---|
| 📖 **Distraction-free Reader** | Clean chat viewer with persistent scroll position so you resume exactly where you left off. |
| 📝 **Sticky notes & annotations** | Add draggable Markdown sticky notes or colour-highlight any passage directly in the Reader. |

### 📤 Export & Share
| | |
|---|---|
| ☑️ **Multi-chat digest export** | Select chats across topics and export a combined Markdown, HTML, or PDF digest with an optional table of contents. |
| 📦 **Export & Import** | Download a topic as a ZIP of Markdown/HTML files, or import a ZIP to restore or share it. |

### 🎛️ Customise & Monitor
| | |
|---|---|
| 🎨 **Themes** | Customise the look with [ThemeStudioSDK](https://github.com/Veverke/ThemeStudioSDK) themes, including community presets like Neon, Mario Bros, and Sci-Fi. |
| 📊 **Activity sparklines** | Per-topic mini bar charts showing weekly save activity over the last six weeks. |
| 💿 **Storage usage meter** | Bottom-of-panel bar showing how much local storage is in use. |

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

## 📄 License

MIT
