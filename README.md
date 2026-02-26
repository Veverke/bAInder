# bAInder - AI Chat Organizer

Chrome/Edge extension to organize AI browser chats (ChatGPT, Claude, Gemini, Copilot) into a hierarchical notebook with topics, table of contents, and search functionality.

## Installation

### Prerequisites

```bash
npm install
npm run build:all   # produces dist/chrome/ and dist/edge/
```

Or build for a single browser:

```bash
npm run build:chrome   # → dist/chrome/
npm run build:edge     # → dist/edge/
```

---

### Google Chrome

1. Open **chrome://extensions**
2. Enable **Developer mode** (toggle, top-right)
3. Click **Load unpacked**
4. Select the **`dist/chrome`** folder from this repo
5. The bAInder icon appears in the toolbar — click it to open the side panel

---

### Microsoft Edge

1. Open **edge://extensions**
2. Enable **Developer mode** (toggle, bottom-left of the sidebar)
3. Click **Load unpacked**
4. Select the **`dist/edge`** folder from this repo
5. The bAInder icon appears in the toolbar — click it to open the side panel

> **Note:** Edge is Chromium-based and supports the same Manifest V3 API as Chrome, so the extension is fully compatible. The separate `dist/edge/` build exists to allow Edge-specific manifest overrides (e.g. a store `update_url`) when publishing to the Microsoft Edge Add-ons portal.

---

### Producing a store-ready zip

```bash
npm run package:chrome   # → releases/bainder-chrome-v1.0.0.zip
npm run package:edge     # → releases/bainder-edge-v1.0.0.zip
npm run package:all      # both at once
```

---

## Stage 1: Foundation & Project Setup ✅

The basic extension structure is now complete with a modern, polished UI!

### What's Included

- ✅ Extension manifest with required permissions
- ✅ Modern side panel UI with theme support (light/dark/auto)
- ✅ Refined search interface with smooth animations
- ✅ Background service worker for lifecycle management
- ✅ Content script placeholder for future chat detection
- ✅ Professional styling with SVG icons
- ✅ Responsive design and accessibility support
- ✅ Placeholder icons (16x16, 32x32, 48x48, 128x128)

### UI Features

- **Theme System**: Toggle between light, dark, and auto (system preference) themes
- **Modern Design**: Clean, professional interface with smooth transitions
- **SVG Icons**: Scalable vector graphics for crisp visuals at any size
- **Responsive**: Adapts to different panel widths
- **Accessible**: Keyboard navigation and screen reader support

## Stage 2: Storage Abstraction Layer ✅

Flexible storage system with future-proofing for database migration!

### What's Included

- ✅ **IStorageService Interface** - Abstract interface for storage implementations
- ✅ **ChromeStorageAdapter** - Implementation using chrome.storage.local API
- ✅ **StorageService Factory** - Singleton pattern for storage instance management
- ✅ **StorageUsageTracker** - Utility for monitoring storage usage
- ✅ **Comprehensive Tests** - 28 unit tests covering all storage operations

### Storage Capabilities

- **Topic Tree Operations**
  - Save and load complete topic tree structure
  - Default initialization for empty trees
  - Version tracking for future migrations

- **Chat Operations**
  - Save chat entries with validation
  - Load individual chats by ID
  - Delete chats with cleanup
  - Full-text search across chat titles and content
  - Search result ranking (title matches prioritized)

- **Storage Management**
  - Real-time usage statistics (bytes used, quota, percentages)
  - Topic and chat counts
  - Clear all data functionality
  - Automatic metadata tracking

- **Data Validation**
  - Required fields validation (title, content, source)
  - Source validation (chatgpt, claude, gemini only)
  - Error handling with descriptive messages

### Testing Stage 2

Run the storage tests:
```bash
npm test tests/storage.test.js
```

All tests for Stages 1-2 should pass (45 tests total: 17 from Stage 1 + 28 from Stage 2).

### Migration Path

The abstraction layer allows easy migration to IndexedDB when needed:
- Current: `chrome.storage.local` for datasets < 1000 items
- Future: Switch to IndexedDB for larger datasets with zero code changes in app logic
- Factory pattern enables: `StorageService.getInstance('indexeddb')`

## Stage 3: Data Models & Tree Structure ✅

Hierarchical tree management with topic organization and chat tracking!

### What's Included

- ✅ **Topic Model** - Data structure for topic nodes with metadata
- ✅ **ChatEntry Model** - Data structure for chat entries with validation
- ✅ **TopicTree Class** - Complete tree management system
- ✅ **Comprehensive Tests** - 59 unit tests covering all tree operations

### Data Models

**Topic:**
- `id` - Unique identifier (UUID v4)
- `name` - Topic display name
- `parentId` - Parent topic ID (null for root topics)
- `children` - Array of child topic IDs
- `chatIds` - Array of associated chat IDs
- `firstChatDate` / `lastChatDate` - Date range tracking
- `createdAt` / `updatedAt` - Timestamps
- `getDateRangeString()` - Formatted date range display

**ChatEntry:**
- `id` - Unique identifier (UUID v4)
- `title` - Chat title
- `content` - Full chat content
- `url` - Source URL
- `source` - AI platform (chatgpt, claude, gemini)
- `timestamp` - Creation date

### Tree Operations

**Basic Operations:**
- `addTopic(name, parentId)` - Add topic with automatic alphabetical sorting
- `deleteTopic(topicId, deleteChats)` - Delete topic and optionally its chats
- `renameTopic(topicId, newName)` - Rename with automatic re-sorting
- `moveTopic(topicId, newParentId)` - Move topic with circular reference prevention

**Navigation:**
- `getTopicPath(topicId)` - Get breadcrumb path to topic
- `getRootTopics()` - Get all root-level topics
- `getChildren(topicId)` - Get direct children of topic
- `getAllTopics()` - Get all topics in tree

**Advanced Operations:**
- `mergeTopics(sourceId, targetId)` - Merge two topics (chats, children, date ranges)
- `updateTopicDateRange(topicId, timestamp)` - Update topic's date range
- `findOrphans()` - Find topics with missing parents
- `repairTree()` - Move orphaned topics to root
- `getStatistics()` - Get tree metrics (total topics, chats, max depth)

**Sorting:**
- Automatic alphabetical sorting after add/rename operations
- Case-insensitive sorting
- Maintains sort order at all tree levels

### Key Features

- **Circular Reference Prevention** - Prevents moving topics under themselves or descendants
- **Alphabetical Sorting** - Automatic case-insensitive sorting at all levels
- **Date Range Tracking** - Automatic tracking of first and last chat dates for topics
- **Merge Operations** - Intelligently combine topics with chat and date range merging
- **Tree Integrity** - Orphan detection and repair functionality
- **Serialization** - Complete toObject/fromObject support for storage persistence

### Testing Stage 3

Run the tree tests:
```bash
npm test tests/tree.test.js
```

All 104 tests should pass (45 from Stages 1-2 + 59 from Stage 3).

Run all tests:
```bash
npm run test:run
```

### Usage Examples

```javascript
import { Topic, ChatEntry, TopicTree } from './src/lib/tree.js';

// Create tree
const tree = new TopicTree();

// Add topics
const workId = tree.addTopic('Work');
const projectsId = tree.addTopic('Projects', workId);

// Add chat
const chat = new ChatEntry('My Chat', 'Content...', 'https://...', 'chatgpt');

// Update date range when chat added to topic
tree.updateTopicDateRange(projectsId, chat.timestamp);

// Get breadcrumb path
const path = tree.getTopicPath(projectsId);
// Returns: [{id: workId, name: 'Work'}, {id: projectsId, name: 'Projects'}]

// Merge topics
tree.mergeTopics(sourceId, targetId); // Combines chats, children, date ranges

// Get statistics
const stats = tree.getStatistics();
// Returns: { totalTopics: 2, totalChats: 0, maxDepth: 2 }
```

## Stage 4: Side Panel UI - Basic Tree View ✅

Interactive tree view displaying hierarchical topics in the side panel!

### What's Included

- ✅ **TreeRenderer Class** - Complete tree rendering engine
- ✅ **Hierarchical Display** - Indented tree structure with proper nesting
- ✅ **Expand/Collapse** - Fully functional expandable nodes
- ✅ **Timespan Badges** - Display date ranges for topics with chats
- ✅ **Chat Count Badges** - Show number of chats per topic
- ✅ **Selection State** - Visual feedback for selected topics
- ✅ **Search Highlighting** - Highlight matching topics in tree
- ✅ **Accessibility** - ARIA attributes and keyboard navigation support
- ✅ **Comprehensive Tests** - 48 unit tests covering all tree rendering features

### Tree Features

**Display:**
- Hierarchical indentation (20px per level)
- Folder icons (📁) for topics with children
- Document icons (📄) for leaf topics
- Topic names with text truncation
- Timespan badges (e.g., "Jan 2024 - Mar 2024")
- Chat count badges with hover tooltips
- Alphabetical sorting at all levels

**Interaction:**
- Click to select topic
- Click expand/collapse button (▶/▼) to toggle children
- Right-click for context menu (Stage 5)
- Smooth animations and transitions
- Hover states and visual feedback

**State Management:**
- Expanded nodes tracked and persisted to localStorage
- Selected node highlighted
- Search highlighting with auto-expand
- Lazy rendering for performance

### Testing Stage 4

Run the tree renderer tests:
```bash
npm test tests/tree-renderer.test.js
```

Run all tests:
```bash
npm run test:run
```

All 152 tests should pass (104 from Stages 1-3 + 48 from Stage 4).

### Testing in Browser

1. Load the extension in Chrome (see instructions below)
2. Open DevTools Console for the side panel: Right-click side panel → Inspect
3. Create sample topics in the console:

```javascript
const { tree, saveTree } = window.bAInder;
const treeObj = tree();

// Add some sample topics
const workId = treeObj.addTopic('Work');
treeObj.addTopic('Projects', workId);
treeObj.addTopic('Meetings', workId);

const personalId = treeObj.addTopic('Personal');
treeObj.addTopic('Health', personalId);
treeObj.addTopic('Finance', personalId);

const learningId = treeObj.addTopic('Learning');
treeObj.addTopic('JavaScript', learningId);
treeObj.addTopic('Python', learningId);

// Save and refresh
await saveTree();
window.bAInder.renderTreeView();
```

4. Test tree functionality:
   - Click expand buttons to show/hide children
   - Click topics to select them
   - Search for topics in the search box (auto-expands matching nodes)
   - Reload the extension - expanded state persists

### CSS Styling

All tree styles are in [src/sidepanel/sidepanel.css](src/sidepanel/sidepanel.css):
- `.tree-root`, `.tree-children` - Tree structure
- `.tree-node`, `.tree-node-content` - Individual nodes
- `.tree-expand-btn` - Expand/collapse buttons
- `.tree-icon` - Topic icons
- `.tree-label`, `.tree-label-text` - Topic names
- `.tree-timespan` - Date range badges
- `.tree-chat-count` - Chat count badges
- `.search-match` - Search highlighting
- `.selected` - Selected node style

## Stage 6: Content Script - Chat Detection ✅

Full chat extraction from ChatGPT, Claude, and Gemini with a floating "Save to bAInder" button!

### What's Included

- ✅ **`src/content/chat-extractor.js`** - ES module with all pure extraction logic (fully testable)
- ✅ **`src/content/content.js`** - Full Chrome content script (IIFE, inlines extractor logic)
- ✅ **`src/background/chat-save-handler.js`** - ES module with background save/validation logic
- ✅ **Updated background.js** - Imports handler, strict validation, deduplication
- ✅ **Updated manifest.json** - Service worker set to `"type": "module"` for ES import support

### Chat Extraction

**Platform Detection:**
- `detectPlatform(hostname)` → `'chatgpt' | 'claude' | 'gemini' | null`
- Auto-detects on page load and re-detects on SPA navigation

**Site-Specific Extractors:**
- **ChatGPT** - `article[data-testid^="conversation-turn"]` with `[data-message-author-role]`
- **Claude** - `[data-testid="human-turn"]` / `[data-testid="ai-turn"]` with class fallbacks
- **Gemini** - `.user-query-content` / `.model-response-text` with class fallbacks
- All extractors order messages by DOM position (correct for SPAs)
- Multiple fallback selectors per platform for DOM version resilience

**Content Sanitisation:**
- Strips HTML tags, decodes entities (`&amp;`, `&lt;`, `&gt;`, `&quot;`, `&#39;`, `&nbsp;`)
- Normalises whitespace

**Title Generation (priority):**
1. First user message (truncated to 80 chars)
2. URL path segment (e.g. conversation ID)
3. "Untitled Chat" fallback

### "Save to bAInder" Button

- Floating button injected into every supported AI chat page
- CSP-safe: no inline event handlers, styles applied via JS
- Visual feedback states: loading ⏳ → success ✅ / error ❌ / empty ⚠️
- Auto-resets to default after 2.5 seconds
- Removed and re-injected on SPA URL changes (MutationObserver + history API hooks)

### SPA Navigation Handling

- `MutationObserver` on `document.body` detects DOM changes
- `history.pushState` / `history.replaceState` are wrapped to catch programmatic navigation
- `popstate` event catches browser back/forward
- Button re-injected on every URL change

### Background Save Handler

- **Validation** - title (required, non-empty), content (required, non-empty), source (must be chatgpt/claude/gemini)
- **Deduplication** - skips re-save if same URL saved within 5 seconds
- **Entry structure** - id, title, content, url, source, timestamp, topicId (null until Stage 7), messageCount, messages, metadata

### Message Protocol (Content Script ↔ Background)

| Type | Direction | Purpose |
|------|-----------|---------|
| `SAVE_CHAT` | Content → Background | Save extracted chat |
| `EXTRACT_CHAT` | Background → Content | Trigger chat extraction |
| `GET_PLATFORM` | Background → Content | Query current platform |
| `PING` | Background → Content | Health check |

### Testing Stage 6

```bash
# Run only Stage 6 tests
npm test -- chat-extractor
npm test -- chat-save-handler

# Run all tests
npm run test:run
```

**Total Test Count: 363 tests passing** across 10 test files:
- 68 tree tests
- 40 dialog tests
- 28 storage tests
- 18 integration tests
- 48 tree-renderer tests
- 8 sidepanel UI tests
- 7 theme tests
- 21 context menu tests
- **80 chat-extractor tests** (Stage 6 - platform detection, extraction, sanitisation, pipeline)
- **45 chat-save-handler tests** (Stage 6 - validation, deduplication, ID generation, save flow)

**Stage 6 Test Coverage:**
- ✅ `detectPlatform()` - all platforms, edge cases, null/undefined/case-insensitive
- ✅ `sanitizeContent()` - HTML stripping, entity decoding, whitespace normalisation
- ✅ `getTextContent()` - DOM element extraction
- ✅ `formatMessage()` - role/content normalisation
- ✅ `generateTitle()` - user message, URL fallback, truncation, edge cases
- ✅ `extractChatGPT()` - single/multi message, fallback selectors, role mapping
- ✅ `extractClaude()` - data-testid and class fallbacks
- ✅ `extractGemini()` - all class variants
- ✅ `extractChat()` - dispatch, error handling, platform validation
- ✅ `prepareChatForSave()` - content formatting, metadata, empty conversations
- ✅ `detectSource()` - all platforms, unknown, null/empty
- ✅ `generateChatId()` - uniqueness (100 IDs), timestamp component
- ✅ `validateChatData()` - all invalid combinations, all valid sources
- ✅ `findDuplicate()` - time window, URL matching, edge cases
- ✅ `buildChatEntry()` - field mapping, source inference, deduplication
- ✅ `handleSaveChat()` - save flow, dedup, validation errors, empty storage
- ✅ End-to-end pipeline: extract → prepare → save for all 3 platforms

---

## Stage 5: Topic Management UI ✅

Complete topic management with modal dialogs for all CRUD operations!

### What's Included

- ✅ **DialogManager Class** - Generic modal dialog system
- ✅ **TopicDialogs Class** - Topic-specific dialog workflows
- ✅ **Modal Dialog System** - Alert, confirm, prompt, and custom form dialogs
- ✅ **CRUD Operations** - Add, rename, move, delete, and merge topics
- ✅ **Context Menu** - Right-click menu for topic actions
- ✅ **Form Validation** - Client-side validation with error states
- ✅ **Hierarchical Selection** - Dropdown menus with indented topic tree
- ✅ **CSS Styling** - Professional dialog and form styles with animations
- ✅ **Comprehensive Tests** - 40 unit tests covering all dialog operations

### Dialog Features

**Dialog Types:**
- **Alert** - Simple informational dialogs
- **Confirm** - Yes/No confirmation dialogs
- **Prompt** - Single text input dialogs
- **Form** - Multi-field custom forms (text, select, textarea)

**Dialog Capabilities:**
- ESC key to close
- Click backdrop to close
- Auto-focus first input
- Promise-based API for async/await
- HTML escaping for XSS prevention
- Multiple sizes (small, medium, large)
- Modal overlay with backdrop

### Topic Operations

**Add Topic:**
- Modal form with topic name input
- Parent topic selection dropdown (hierarchical)
- Create at root level or as child of any topic
- Validation prevents empty names
- Auto-alphabetical sorting after creation

**Rename Topic:**
- Pre-filled form with current topic name
- Validation prevents empty names
- Returns null if name unchanged (no-op)
- Auto-alphabetical re-sort after rename

**Move Topic:**
- Dropdown shows all valid parent options
- Excludes topic itself and all descendants (prevents circular references)
- Move to root level or under any other topic
- Shows "(Root Level)" option in dropdown
- Alert if no valid move destinations available

**Delete Topic:**
- Confirmation dialog before deletion
- Warning if topic has child topics
- Warning if topic has associated chats
- Note about chats becoming unassigned

**Merge Topics:**
- Select target topic from dropdown
- Excludes topic itself, ancestors, and descendants
- Confirmation dialog shows merge details:
  - Number of chats to move
  - Child topics to move
  - Source topic will be deleted
- All chats and children merged into target
- Date ranges combined
- Alert if no valid merge targets available

### Context Menu

Right-click any topic to access:
- **Rename** - Rename the topic
- **Move** - Move to different location
- **Delete** - Delete topic
- **Merge** - Merge into another topic

Context menu features:
- Screen boundary detection (prevents overflow)
- Click outside to close
- Displays topic name at top

### Form Validation

All forms include:
- Required field validation (red border on error)
- Real-time error removal on input
- Client-side validation before submission
- Error messages via alert dialogs
- Graceful error handling

### Testing Stage 5

Run the dialog tests:
```bash
npm test tests/dialogs.test.js
```

Run the context menu tests:
```bash
npm test -- context-menu
```

Run all tests:
```bash
npm run test:run
```

**Total Test Count: 363 tests passing** across 10 test files:
- 68 tree tests (including duplicate name prevention)
- 40 dialog tests
- 28 storage tests
- 18 integration tests (dialog workflows with storage)
- 48 tree-renderer tests
- 8 sidepanel UI tests (CSP compliance, duplicate IDs, console errors, accessibility)
- 7 theme tests
- 21 context menu tests (all right-click operations with REAL event flow)
- 80 chat-extractor tests (Stage 6 - all 3 platforms, full pipeline)
- 45 chat-save-handler tests (Stage 6 - validation, dedup, save flow)

**Test Quality Standards:**
- ✅ All tests verify REAL behavior (not just "element exists")
- ✅ All tests use REAL production code flows
- ✅ All tests catch bugs users would encounter
- ✅ Removed 87 low-value tests (27% reduction)
- ✅ CSP compliance verified (no inline event handlers)
- ✅ Console error detection in all flows
- ✅ Context menu bug fix verified with critical preservation test

**Removed Tests (87 total):**
- ❌ example.test.js - 10 mock verification tests
- ❌ sidepanel-ui.test.js - 50 "element exists" and "doesn't throw" tests
- ❌ context-menu.test.js - 6 HTML structure tests
- ❌ sidepanel-complete.test.js - 21 fragile workflow tests with DOM issues

See [docs/test-coverage-complete.md](docs/test-coverage-complete.md) for detailed coverage.

### Testing in Browser

1. Load the extension and open the side panel
2. Open DevTools Console: Right-click side panel → Inspect
3. Test dialog system directly:

```javascript
const { dialog, topicDialogs } = window.bAInder;

// Test alert
await dialog().alert('Hello world!', 'My Alert');

// Test confirm
const confirmed = await dialog().confirm('Are you sure?', 'Confirmation');
console.log('User confirmed:', confirmed);

// Test prompt
const name = await dialog().prompt('Enter your name:', 'Default Name');
console.log('User entered:', name);

// Test form
const result = await dialog().form([
  { name: 'firstName', label: 'First Name', type: 'text', required: true },
  { name: 'age', label: 'Age', type: 'number' },
  { name: 'country', label: 'Country', type: 'select', options: [
    { value: 'us', label: 'United States' },
    { value: 'uk', label: 'United Kingdom' }
  ]}
], 'User Info', 'Submit');
console.log('Form result:', result);
```

4. Create and manage topics:

```javascript
const { tree, saveTree } = window.bAInder;

// Add some topics first
const workId = tree().addTopic('Work');
const personalId = tree().addTopic('Personal');
await saveTree();
window.bAInder.renderTreeView();

// Now use the UI:
// - Click "+ Add Topic" button
// - Right-click any topic for context menu
// - Try rename, move, delete, merge operations
```

### CSS Styling

All dialog styles are in [src/sidepanel/sidepanel.css](src/sidepanel/sidepanel.css):
- `.modal`, `.modal-content` - Modal container and sizing
- `.modal-header`, `.modal-body`, `.modal-footer` - Dialog structure
- `.dialog-form`, `.form-group` - Form layout
- `.form-input`, `.form-select`, `.form-textarea` - Form fields
- `.form-hint` - Field hints/descriptions
- `.error` - Validation error states
- `.btn-primary`, `.btn-secondary` - Button styles

### Keyboard Shortcuts

- **ESC** - Close current dialog
- **Enter** - Submit single-field forms (prompt dialogs)

## How to Load the Extension in Chrome

### Step 1: Open Chrome Extensions Page

1. Open Google Chrome
2. Navigate to `chrome://extensions/`
3. Enable **Developer mode** (toggle in top-right corner)

### Step 2: Load the Extension

1. Click **"Load unpacked"** button
2. Navigate to the `bAInder` folder (this directory)
3. Select the folder and click **"Select Folder"**

### Step 3: Verify Installation

You should see:
- **bAInder - AI Chat Organizer** in your extensions list
- Extension icon in the Chrome toolbar (shows "bA" logo)
- Extension status showing as "Enabled"

### Step 4: Open the Side Panel

**Option 1:** Click the extension icon in the toolbar

**Option 2:** 
1. Visit any webpage
2. Click the puzzle icon (extensions menu)
3. Find "bAInder - AI Chat Organizer"
4. Click it to open the side panel

### What You Should See

The side panel should open with:
- 📖 Header with "bAInder" title
- 🔍 Search box (functional in Stage 8)
- ➕ "Add Topic" button (fully functional with modal dialog)
- Empty state message: "No topics yet" (or tree view if topics exist)
- 💾 Storage usage indicator in footer
- ⚙️ Settings button (functional in Stage 10)

## Testing Stage 1

### Basic Functionality Tests

1. **Extension Loads:**
   - Extension appears in `chrome://extensions/`
   - No errors in extension details
   
2. **Side Panel Opens:**
   - Click extension icon opens side panel
   - Side panel displays correctly
   
3. **UI Elements Present:**
   - Header, search box, and buttons visible
   - Empty state message displays
   - Footer with storage info shows
   
4. **Console Logs:**
   - Open DevTools for side panel: Right-click side panel → Inspect
   - Should see: "bAInder Side Panel loaded" and "bAInder initialized successfully"
   - Check background script: Chrome extensions page → Extension details → Inspect views: "service worker"
   - Should see: "bAInder Background Service Worker initialized"

5. **Content Script (optional):**
   - Visit `https://chat.openai.com`, `https://claude.ai`, or `https://gemini.google.com`
   - Open DevTools console on the page (F12)
   - Should see: "bAInder content script loaded on: [hostname]"

### Known Limitations

The following features are **not yet implemented** (coming in later stages):
- ❌ Saving chats from AI websites (Stage 6-7)
- ❌ Search functionality (Stage 8)
- ❌ Export/Import features (Stage 9)
- ❌ Settings page (Stage 10)
- ❌ Advanced features (Stage 11)

## Testing Setup ✅

Vitest is configured and ready for unit testing.

### Running Tests

```bash
# Install dependencies first (if not done already)
npm install

# Run tests once
npm run test:run

# Run tests in watch mode
npm test

# Run tests with UI
npm run test:ui

# Run with coverage report
npm run test:coverage
```

### What's Tested

- ✅ Chrome API mocks (storage, runtime, tabs, sidePanel)
- ✅ Example tests demonstrating the setup
- ✅ Ready for Stage 2+ feature tests

### Test Files

All tests are in the `tests/` directory:
- `tests/setup.js` - Chrome API mocks & global configuration
- `tests/example.test.js` - Example tests (verify setup works)
- `tests/README.md` - Comprehensive testing guide

See [tests/README.md](tests/README.md) for detailed testing documentation, best practices, and examples.

## Troubleshooting

### Extension Won't Load

- Check that all files are present in the directory
- Ensure `manifest.json` has no syntax errors
- Look for errors on `chrome://extensions/` page

### Side Panel Won't Open

- Ensure you're using Chrome 114+ (sidePanel API requirement)
- Check extension has proper permissions in manifest
- Try clicking extension icon instead of puzzle menu

### Console Errors

- Open DevTools for side panel (right-click → Inspect)
- Check for JavaScript errors
- Verify all file paths are correct

### Icons Not Showing

- If icons are missing, regenerate them:
  ```powershell
  .\generate-icons.ps1
  ```
- Reload the extension after regenerating

## Project Structure

```
bAInder/
├── manifest.json                    # Extension configuration
├── package.json                     # npm project configuration
├── vite.config.js                   # Vite bundler config (for future)
├── vitest.config.js                 # Vitest testing config
├── .gitignore                       # Git ignore rules
├── generate-icons.ps1               # Icon generation script
├── README.md                        # This file
├── assets/                          # Static assets
│   └── icons/                       # Extension icons (16, 32, 48, 128)
├── src/                             # Source code
│   ├── background/                  # Background service worker
│   │   ├── background.js             # Service worker entry (ES module)
│   │   └── chat-save-handler.js      # Testable save/validation logic (Stage 6)
│   ├── content/                     # Content scripts
│   │   ├── content.js                # Chrome content script (IIFE, all platforms)
│   │   └── chat-extractor.js         # ES module - extraction logic (Stage 6)
│   ├── sidepanel/                   # Side panel UI
│   │   ├── sidepanel.html
│   │   ├── sidepanel.js
│   │   └── sidepanel.css
│   └── lib/                         # Shared libraries (Stage 2+)
├── tests/                           # Test files
│   ├── setup.js                     # Chrome API mocks
│   ├── example.test.js              # Example tests
│   └── README.md                    # Testing guide
├── docs/                            # Documentation
│   ├── DESIGN_SPECS.md              # Complete design documentation
│   └── TESTING_FRAMEWORK_DECISION.md # Testing framework analysis
└── node_modules/                    # npm dependencies (gitignored)
```

## Next Steps

Stages 1-6 Complete! ✅

Ready to proceed with:

- **Stage 7:** Chat Assignment UI
- **Stage 8:** Search Functionality
- **Stage 9:** Export & Import

See [docs/DESIGN_SPECS.md](docs/DESIGN_SPECS.md) for complete development roadmap.

## Development Notes

### Chrome Extension Permissions

The extension requests:
- `storage` + `unlimitedStorage` - Local data storage
- `tabs` + `activeTab` - Access current tab for side panel
- `sidePanel` - Side panel API access
- Host permissions for ChatGPT, Claude, Gemini

### Storage Strategy

Currently using `chrome.storage.local` with unlimited storage permission. See [docs/DESIGN_SPECS.md](docs/DESIGN_SPECS.md) Section 0.2 for database strategy details.

### Testing Framework

**Vitest configured and ready!** ✅ See [tests/README.md](tests/README.md) for comprehensive testing guide. Run `npm test` to start testing. See [docs/TESTING_FRAMEWORK_DECISION.md](docs/TESTING_FRAMEWORK_DECISION.md) for rationale behind choosing Vitest over Jest.

### NLP/ML Features

Optional smart features (Stage 11) using local NLP libraries for auto-categorization and topic similarity. See [docs/DESIGN_SPECS.md](docs/DESIGN_SPECS.md) Section 0.7 for detailed analysis of technology options and privacy considerations.

### Supported Platforms

Content script is configured for:
- OpenAI ChatGPT (`chat.openai.com`)
- Anthropic Claude (`claude.ai`)
- Google Gemini (`gemini.google.com`)

## Contributing

This is currently in active development following the stage-by-stage approach outlined in DESIGN_SPECS.md.

## Version

**Current Stage:** Stages 1-6 Complete ✅  
**Version:** 1.0.0  
**Last Updated:** February 19, 2026  
**Tests Passing:** 363/363
