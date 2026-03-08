# 🗂️ bAInder — AI Chat Organizer

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

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

## Screenshots

### Extension Side Panel

![bAInder screenshot 1](assets/screenshots/bAInder%20screenshot%201.png)

### Chat Reader View

![bAInder reader screenshot 1](assets/screenshots/bAInder%20reader%20screenshot%201.png)

### Some of the themes that can be installed

![bAInder themed screenshot 1](assets/screenshots/bAInder%20themed%20screenshot%201.png)
![bAInder themed screenshot 2](assets/screenshots/bAInder%20themed%20screenshot%202.png)
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

## Contributing & Development

### Getting Started

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

### Available Scripts

```bash
npm run build:all    # Build extensions for both Chrome and Edge
npm run dev          # Start development server with watch mode
npm run test         # Run tests with Vitest
npm test -- --watch # Run tests in watch mode
npm run lint         # Run ESLint
```

### Project Structure

- **`src/background/`** — Extension background scripts
- **`src/content/`** — Content scripts injected into web pages
- **`src/sidepanel/`** — Side panel UI and logic
- **`src/reader/`** — Chat viewer UI
- **`src/lib/`** — Core utilities, storage, export/import logic
- **`tests/`** — Test files for all modules
- **`docs/`** — Documentation and design specs

### Testing

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

### Code Quality

- **Linting**: ESLint configuration ensures code consistency
- **Tests**: All new features should include corresponding tests
- **UT Coverage gate**: 90% minimum code coverage required
- **Commits**: Follow conventional commit messages for clarity

### Making Changes

1. Create a feature branch: `git checkout -b feature/your-feature`
2. Make your changes and write tests
3. Run `npm run lint` and `npm test` to verify
4. Build with `npm run build:all` to test in the extension
5. Commit with descriptive messages
6. Push and create a pull request

---

## 📄 License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.

**Copyright © 2026 Avraham Y. Kahana**

You are free to use, modify, and distribute this software for any purpose, including commercial use, provided you include the original copyright notice and license text.

For contribution guidelines, see [CONTRIBUTING.md](CONTRIBUTING.md).

