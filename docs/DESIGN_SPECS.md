# bAInder - AI Chat Organizer
## Design Specifications

---

## 0. Design Discussions & Requirements Analysis

This section documents the brainstorming and technical decisions made during the requirements phase.

### 0.1 Project Complexity Assessment

**Complexity Level: Moderate** - Achievable but non-trivial

**Challenging Aspects:**
- **Hierarchical tree structure** with parent/child relationships and alphabetical sorting at each level
- **Content extraction** from multiple AI chat sites (ChatGPT, Claude, Gemini) - each has different DOM structures
- **Search indexing** across potentially large chat histories (hundreds to thousands of conversations)
- **Merge/insert operations** while maintaining tree integrity and alphabetical order
- **Performance optimization** for large datasets with lazy loading and virtual scrolling

**Manageable Because:**
- These are solved problems with well-established patterns
- No backend infrastructure required (local-only storage)
- Chrome extension APIs are mature and well-documented
- Can build incrementally with testable stages
- Storage and UI frameworks are straightforward

### 0.2 Database & Storage Strategy

#### Options Considered

**Option A: chrome.storage.local + unlimitedStorage (Selected for MVP)**

*Pros:*
- ✅ Simple API - `chrome.storage.local.set()` and `.get()`
- ✅ Automatic JSON serialization
- ✅ Built-in sync - data persists across extension updates
- ✅ No dependencies - native Chrome API
- ✅ Fast for small-medium datasets (< 1000 records)
- ✅ Easy debugging via DevTools
- ✅ Built-in quota management

*Cons:*
- ❌ Loads entire dataset - must read/write whole objects
- ❌ No indexing - can't query by fields (must filter in memory)
- ❌ Slower with large data - no pagination support
- ❌ No transactions - race conditions possible
- ❌ Limited query capabilities
- ❌ Memory intensive for large trees

**Option B: IndexedDB**

*Pros:*
- ✅ True database with indexes, cursors, ranges
- ✅ Query by any field - fast lookups
- ✅ Transactions - ACID guarantees
- ✅ Pagination - load data in chunks
- ✅ Scalable - handles 10,000+ chats
- ✅ Full-text search support
- ✅ Memory efficient

*Cons:*
- ❌ Complex API - verbose, steep learning curve
- ❌ No automatic serialization
- ❌ More boilerplate code (5-10x more)
- ❌ Harder to debug
- ❌ Requires wrapper library (e.g., Dexie.js)

**Option C: Hybrid Approach (Future Enhancement)**

Store tree structure in `chrome.storage.local` and actual chat content in IndexedDB for best of both worlds.

#### Decision: chrome.storage.local with Migration Path

**Rationale:**
- Faster MVP development
- Simpler codebase for initial version
- Sufficient for most users (< 500-1000 chats)
- Storage abstraction layer allows painless migration to IndexedDB later

**Migration Trigger:**
- User exceeds 500 conversations
- Performance degradation noticed
- User requests advanced query features

### 0.3 UI Approach & Design Philosophy

#### Evaluated Options

**Option A: Popup Window**
- Quick access from toolbar
- Limited space (typically 800x600px max)
- Auto-closes when focus lost
- Good for quick topic selection

**Option B: Side Panel (Selected)**
- Persistent panel alongside browser window
- More screen real estate for tree navigation
- Doesn't auto-close when clicking elsewhere
- Better for working with chats while browsing
- Modern Chrome API (Manifest V3)
- **Best fit for extended interaction with hierarchical data**

**Option C: Full Tab**
- Dedicated page with unlimited space
- Best for heavy organization work
- More disruptive to workflow

#### Selected: Side Panel

**Why:** Provides persistent access without disrupting browsing flow, ideal for drag-and-drop operations and extended tree navigation.

### 0.4 UI Structure Design

```
┌─────────────────────────────────────────┐
│ 🔍 [Search box]            [+ Add Topic]│
├─────────────────────────────────────────┤
│ 📖 Table of Contents                    │
│ ─────────────────────────────────────── │
│ ▼ 📁 AI Models                          │ ← Expandable topic
│   ▶ 📁 ChatGPT [Jan 2025 - Feb 2026]   │ ← With timespan
│   ▼ 📁 Claude [Mar 2025 - Feb 2026]    │
│     💬 Coding help (Feb 15, 2026)       │ ← Individual chat
│     💬 Writing review (Feb 10, 2026)    │
│ ▶ 📁 Learning [Dec 2024 - Jan 2026]    │
│ ▶ 📁 Projects                           │ ← Empty topic (no dates)
│ ▼ 📁 Research [Sep 2025 - Feb 2026]    │
│   ▶ 📁 Science                          │
│   ▼ 📁 Technology [Nov 2025 - Feb 2026]│
│     💬 Blockchain basics (Nov 3, 2025)  │
│     💬 ML algorithms (Feb 1, 2026)      │
├─────────────────────────────────────────┤
│ [Optional Preview Pane]                 │
│ Shows snippet of selected chat          │
│ "How do I implement a binary tree..."   │
└─────────────────────────────────────────┘
```

**Key Design Elements:**
- **Collapsible tree** - Show only 2-3 levels initially to prevent overwhelming
- **Icons for hierarchy** - 📁 for topics/folders, 💬 for individual chats
- **Timespan indicators** - Display date range for each topic (e.g., "[Feb 2023 - Apr 2024]")
- **Timestamps on chats** - Individual chat dates for granular reference
- **Context menu** - Right-click for: merge, move, delete, export, create report
- **Drag & drop** - Intuitive reorganization of topics and chats
- **Lazy loading** - Load children only when topic expanded (performance)
- **Search integration** - Prominent search box at top
- **Visual feedback** - Hover states, selection highlighting, operation animations

### 0.5 Key Features to Consider

#### Interaction Features
- **Collapsible tree navigation** - Expand/collapse topics to manage visual complexity
- **Context menu (Right-click):**
  - Rename, move, delete operations
  - Merge similar topics
  - Export to MD/HTML/PDF
  - Create styled reports (technical article, blog, academic, LinkedIn)
- **Drag & drop** - Reorganize topics and chats intuitively
- **Lazy loading** - Performance optimization for 1000+ items
- **Virtual scrolling** - Render only visible items in viewport

#### Content Transformation
- **Export formats:** Markdown, HTML, PDF
- **Writing style templates:**
  - Technical article
  - Academic journal
  - Blog post
  - LinkedIn article
  - Raw transcript
- **Use case:** Transform chat conversations into presentable articles for publishing on platforms like LinkedIn

#### Data Management
- **Alphabetical sorting** - Maintain A-Z order at each tree level
- **Insert operations** - Add chats/topics in sorted position (not just append)
- **Merge functionality** - Combine similar topics while preserving all chats
- **Search with context** - Show topic breadcrumb path in search results
- **Storage monitoring** - Display usage to user

### 0.6 Storage Capacity Analysis

#### Calculations

**Average Conversation Size:**
- Typical AI chat: 30-50 exchanges (user + AI responses)
- Average exchange: ~1,000 characters
- UTF-8 encoding + metadata: ~1.3 bytes per character
- **Full conversation: ~40,000 bytes (~39 KB)**

**10 MB Storage Capacity:**
- **10 MB ≈ 250-300 full conversations**

#### Time to Fill Storage

| User Type | Chats/Day | Days to 10MB | Approximate Duration |
|-----------|-----------|--------------|---------------------|
| **Light User** (occasional) | 2-3 | 90-120 | ~3-4 months |
| **Moderate User** (daily) | 5-10 | 30-50 | ~5-7 weeks |
| **Heavy User** (dev/researcher) | 15-30 | 10-20 | ~2-3 weeks |

**Reality:** Most users won't hit 10MB for months. Power users might need more capacity within weeks.

#### Storage Solutions

**For MVP:**
- Request `unlimitedStorage` permission in manifest
- Gives unlimited space with user consent (one-time permission prompt)
- Simple manifest change, no code complexity

**Data Management Features:**
- **Storage usage indicator** - Show current usage in settings
- **Archive function** - Export old chats to files
- **Delete option** - Remove old/irrelevant topics
- **Compression** - Can reduce size by 60-70% (future enhancement)

**Migration to IndexedDB:**
- Only if user exceeds 500+ conversations
- Implement when performance becomes issue
- Storage abstraction layer makes migration seamless

#### Recommendation

Start with `chrome.storage.local` + `unlimitedStorage` permission. This provides simplicity now with scalability later. Given the export features (MD/HTML/PDF), power users will accumulate data quickly, making unlimited storage essential from day one.

### 0.7 NLP/ML Libraries & Smart Features

#### Use Cases for Natural Language Processing

The extension can benefit from NLP/ML capabilities for intelligent features:

1. **Auto-categorization** - Analyze chat content and automatically suggest appropriate topics
2. **Similar Topic Detection** - Identify topics that could be merged based on content similarity
3. **Smart Search** - Semantic search beyond simple keyword matching
4. **Duplicate Detection** - Find conversations covering similar subjects
5. **Auto-summarization** - Generate descriptive titles or summaries for topics
6. **Keyword Extraction** - Identify main themes from chat conversations

#### Technology Options Evaluated

**Option A: Client-Side ML (TensorFlow.js)**

*Description:* Run machine learning models directly in the browser

*Advantages:*
- ✅ Privacy-preserving (data never leaves device)
- ✅ Works offline
- ✅ No API costs
- ✅ Full user control

*Disadvantages:*
- ❌ Large bundle size (several MB)
- ❌ Slower performance on low-end devices
- ❌ Limited model sophistication
- ❌ Requires model training/fine-tuning

*Best for:* Embeddings generation, similarity scoring, basic classification

---

**Option B: Lightweight NLP Libraries (Recommended for MVP)**

*Libraries considered:*
- **compromise** (~200KB) - Fast NLP with POS tagging, entity extraction
- **natural** - Tokenization, stemming, TF-IDF, Levenshtein distance
- **stopword** - Remove common words for better analysis

*Advantages:*
- ✅ Small footprint (< 500KB total)
- ✅ Fast, synchronous operations
- ✅ Privacy-preserving (local only)
- ✅ No internet required
- ✅ Good enough for 80% of use cases

*Disadvantages:*
- ❌ Less sophisticated than deep learning
- ❌ Rule-based rather than learned
- ❌ Limited understanding of context

*Best for:* Keyword extraction, basic similarity, topic suggestions

**Example Implementation:**
```javascript
import nlp from 'compromise';
import natural from 'natural';

// Extract keywords from chat
function extractKeywords(chatContent) {
  const doc = nlp(chatContent);
  const nouns = doc.nouns().out('array');
  const topics = doc.topics().out('array');
  return [...new Set([...nouns, ...topics])];
}

// Calculate topic similarity
function calculateSimilarity(topic1Content, topic2Content) {
  const tfidf = new natural.TfIdf();
  tfidf.addDocument(topic1Content);
  tfidf.addDocument(topic2Content);
  
  // Calculate cosine similarity
  return natural.JaroWinklerDistance(topic1Content, topic2Content);
}
```

---

**Option C: External AI APIs (OpenAI/Claude/Gemini)**

*Description:* Send content to cloud AI services for analysis

*Advantages:*
- ✅ Most powerful and accurate
- ✅ State-of-the-art understanding
- ✅ Continuously improving
- ✅ Can handle complex reasoning

*Disadvantages:*
- ❌ Costs money (per API call)
- ❌ Requires internet connection
- ❌ Privacy concerns (data sent to third party)
- ❌ Latency (network round-trip)
- ❌ API key management

*Best for:* Advanced categorization, content summarization, style transformation

---

**Option D: Hybrid Approach (Recommended for Full Product) ⭐**

*Strategy:* Combine local and cloud processing intelligently

*Tier 1 - Local (Free, Private, Fast):*
- Basic keyword extraction (compromise)
- Simple similarity scoring (natural + TF-IDF)
- Duplicate detection (fuzzy matching)

*Tier 2 - Cloud (Optional, Opt-in):*
- Advanced auto-categorization (OpenAI API)
- Intelligent summaries (Claude API)
- Style transformation for exports (Gemini API)

*Implementation:*
```javascript
// User preference in settings
const nlpMode = 'local'; // or 'local+api'

async function suggestTopic(chatContent) {
  if (nlpMode === 'local') {
    return suggestTopicLocal(chatContent);
  } else {
    return await suggestTopicWithAPI(chatContent);
  }
}
```

*Advantages:*
- ✅ Best of both worlds
- ✅ User choice (privacy vs power)
- ✅ Graceful degradation (works offline)
- ✅ Scalable (API only when needed)

#### Impact on Technology Stack

**If implementing NLP features, requires:**

1. **Package Manager:** npm/pnpm/yarn for dependencies
2. **Module Bundler:** Vite (recommended) or Webpack
3. **Build Process:** Compile and bundle for Chrome extension
4. **ES Modules:** Modern import/export syntax
5. **Testing:** Vitest (over Jest) for better npm package testing

**Dependencies Example:**
```json
{
  "dependencies": {
    "compromise": "^14.13.0",
    "natural": "^6.10.0",
    "stopword": "^2.0.8"
  },
  "devDependencies": {
    "vite": "^5.0.0",
    "vitest": "^1.2.0"
  }
}
```

#### Recommendation for bAInder

**Phase 1 (MVP - Stages 1-10):**
- Build core functionality WITHOUT NLP
- Keep vanilla JavaScript for simplicity
- Manual topic assignment by user

**Phase 2 (Enhancement - Stage 11):**
- Add lightweight NLP (compromise + natural)
- Implement local-only smart features:
  - Keyword extraction for search
  - Topic similarity suggestions
  - Duplicate detection
- Requires refactoring to use Vite bundler

**Phase 3 (Advanced - Future):**
- Add optional AI API integration
- User opt-in with API key
- Advanced features:
  - Auto-categorization
  - Intelligent summarization
  - Style transformation

**Migration Path:**
1. Stage 1-10: Vanilla JS → Focus on core features
2. Stage 11: Add Vite + npm packages → Local NLP
3. Future: Add API integration → Cloud AI (optional)

#### Privacy & Data Considerations

**Local NLP (compromise, natural):**
- ✅ All data stays on device
- ✅ No tracking, no external requests
- ✅ Works completely offline
- ✅ No privacy policy needed for this feature

**API-based features (if implemented):**
- ⚠️ Must clearly inform users data will be sent externally
- ⚠️ User opt-in required
- ⚠️ API key stored securely
- ⚠️ Option to exclude sensitive chats
- ⚠️ Privacy policy required

**Recommendation:** Start with local-only, add API as optional premium feature later.

---

## 1. Extension Goals & Features

### Primary Goal
Organize AI browser chats (ChatGPT, Claude, Gemini, etc.) into a hierarchical notebook format with topics, enabling efficient browsing, searching, and management of conversation history.

### Core Features

#### 1.1 Hierarchical Topic Organization
- **Tree structure** with unlimited nesting levels (parent → child → grandchild topics)
- **Alphabetical sorting** at each tree level (A-Z)
- **Timespan display** showing date range of chats in each topic (e.g., "Health Issues [Feb 2023 - Apr 2024]")
- Topics serve as organizational containers for related chats
- Support for topic renaming, moving, and deleting

#### 1.2 Table of Contents (ToC)
- Visual tree navigation in side panel
- Expandable/collapsible nodes
- Icons for visual hierarchy (folders for topics, chat bubbles for conversations)
- Lazy loading of child nodes for performance

#### 1.3 Chat Management
- **Insert** new chats under appropriate topics (not just append)
- **Merge** similar topics or conversations
- Maintain topic organization integrity during operations
- Preserve chat metadata (date, source, URL)

#### 1.4 Search Functionality
- Full-text search across all chat contents
- Results display with topic context (breadcrumb path)
- Click result to navigate to specific chat in tree
- Search within specific topic branches (optional filter)

#### 1.5 Content Actions (Context Menu)
- Right-click context menu on topics/chats
- **Export formats:** Markdown, HTML, PDF
- **Writing style transformation:**
  - Technical article
  - Academic journal
  - Blog post
  - LinkedIn article
  - Custom styles
- Move, rename, delete operations
- Merge similar topics option

#### 1.6 UI/UX
- **Side panel** interface (persistent alongside browser)
- **Timespan indicators** displaying date ranges for each topic to provide temporal context
- Drag & drop for reorganizing topics/chats
- Visual feedback for operations
- Storage usage indicator
- Responsive design

---

## 2. Architecture & Technical Design

### 2.1 Technology Stack

**MVP (Stages 1-10):**
- **Manifest Version:** 3 (latest Chrome extension standard)
- **Storage:** chrome.storage.local with unlimitedStorage permission
- **Future Migration:** IndexedDB support via abstraction layer
- **UI Framework:** Vanilla JavaScript + CSS (lightweight, no dependencies)
- **Testing:** Jest + jest-chrome (no build tooling required)

**Advanced (Stage 11+):**
- **Build System:** Vite (for bundling npm packages)
- **NLP Libraries:** compromise (~200KB), natural (for local AI features)
- **Testing:** Vitest (better npm package integration)
- **Optional:** External AI APIs (OpenAI/Claude) for advanced features
- **See Section 0.7** for detailed NLP/ML strategy discussion

**Technology Evolution Path:**
1. Stages 1-10: Vanilla JS → Core functionality without dependencies
2. Stage 11: Add Vite + npm → NLP libraries for smart features
3. Future: Optional API integration → Cloud AI capabilities

### 2.2 Component Architecture

```
┌─────────────────────────────────────────┐
│         Chrome Extension                │
├─────────────────────────────────────────┤
│  Background Service Worker              │
│  - Lifecycle management                 │
│  - Message routing                      │
│  - Storage operations coordinator       │
└─────────────────────────────────────────┘
         ↕                    ↕
┌──────────────────┐   ┌──────────────────┐
│  Content Script  │   │   Side Panel     │
│  - Chat detection│   │   - Tree UI      │
│  - DOM extraction│   │   - Search UI    │
│  - Auto-capture  │   │   - Context menu │
└──────────────────┘   └──────────────────┘
         ↕                    ↕
┌─────────────────────────────────────────┐
│      Storage Abstraction Layer          │
│  StorageService Interface               │
│  - ChromeStorageAdapter (MVP)           │
│  - IndexedDBAdapter (future)            │
└─────────────────────────────────────────┘
         ↕
┌─────────────────────────────────────────┐
│          Data Layer                     │
│  - TopicTree (hierarchical structure)   │
│  - ChatEntry (individual conversations) │
│  - SearchIndex (content indexing)       │
└─────────────────────────────────────────┘
```

---

## 3. Development Stages

### Stage 1: Foundation & Project Setup
**Goal:** Set up extension skeleton and development environment

**Tasks:**
- Create `manifest.json` with required permissions
- Set up folder structure
- Create placeholder icons (16x16, 32x32, 48x48, 128x128)
- Initialize side panel HTML boilerplate
- Set up background service worker
- Test: Load extension in Chrome and verify side panel opens

**Deliverable:** Extension loads successfully with empty side panel

**Independent:** ✅ Can test without other stages

---

### Stage 2: Storage Abstraction Layer
**Goal:** Create flexible storage interface for future-proofing

**Tasks:**
- Design `IStorageService` interface with methods:
  - `saveTopicTree(tree)`
  - `loadTopicTree()`
  - `saveChat(topicPath, chatData)`
  - `loadChat(chatId)`
  - `searchChats(query)`
  - `deleteChat(chatId)`
  - `deleteTopic(topicId)`
- Implement `ChromeStorageAdapter` class
  - Use `chrome.storage.local` API
  - Handle JSON serialization
  - Error handling and validation
- Create `StorageService` factory pattern
- Add storage usage tracking utility

**Deliverable:** Storage service with CRUD operations

**Independent:** ✅ Can test with mock data

**Test Strategy:**
- Unit tests with sample data
- Verify data persistence across extension reloads
- Test storage limits and error handling

---

### Stage 3: Data Models & Tree Structure
**Goal:** Define data structures and tree management logic

**Tasks:**
- Define `Topic` data model:
  ```javascript
  {
    id: string,
    name: string,
    parentId: string | null,
    children: string[], // child IDs
    chatIds: string[],
    createdAt: timestamp,
    updatedAt: timestamp,
    firstChatDate: timestamp | null, // earliest chat in this topic
    lastChatDate: timestamp | null   // most recent chat in this topic
  }
  ```
- Define `ChatEntry` data model:
  ```javascript
  {
    id: string,
    topicId: string,
    title: string,
    content: string, // full chat text
    url: string,
    source: 'chatgpt' | 'claude' | 'gemini',
    timestamp: timestamp,
    metadata: object
  }
  ```
- Implement `TopicTree` class:
  - `addTopic(name, parentId)`
  - `deleteTopic(topicId, deleteChats)`
  - `moveTopic(topicId, newParentId)`
  - `renameTopic(topicId, newName)`
  - `sortChildren(parentId)` // alphabetical
  - `getTopicPath(topicId)` // breadcrumb array
  - `mergeTopics(sourceId, targetId)`
  - `updateTopicDateRange(topicId, chatTimestamp)` // update first/last chat dates
  - `getTopicDateRange(topicId)` // returns formatted date range string
- Implement alphabetical sorting logic
- Handle circular reference prevention
- Auto-update topic date ranges when chats are added/removed

**Deliverable:** Data models and tree manipulation logic

**Independent:** ✅ Can test with in-memory data

**Test Strategy:**
- Create sample tree programmatically
- Test all CRUD operations
- Verify alphabetical sorting
- Test edge cases (circular refs, orphans)

---

### Stage 4: Side Panel UI - Basic Tree View
**Goal:** Display hierarchical topic tree

**Tasks:**
- Design HTML structure for tree view
- Implement CSS for tree styling:
  - Indentation for hierarchy levels
  - Icons (📁 folders, 💬 chats)
  - Hover states and selection
  - Expand/collapse indicators (▶️/▼)
  - Timespan badge styling (subtle, gray text)
- Create `TreeRenderer` class:
  - Render tree from data model
  - Display topic name with timespan (e.g., "Topic [Feb 2023 - Apr 2024]")
  - Format dates appropriately (Month Year for readability)
  - Hide timespan if topic has no chats yet
  - Expandable/collapsible nodes
  - Click handlers for expand/collapse
  - Lazy loading for performance
- Integrate with StorageService
- Load and display saved tree on panel open

**Deliverable:** Functional tree view displaying topics

**Dependencies:** Stage 2 (Storage), Stage 3 (Data Models)

**Test Strategy:**
- Load tree with 100+ topics
- Verify expand/collapse works
- Test lazy loading performance
- Check alphabetical ordering visually

---

### Stage 5: Topic Management UI
**Goal:** Add/edit/delete topics through UI

**Tasks:**
- Add "➕ Add Topic" button in side panel
- Create modal/inline form for topic creation:
  - Topic name input
  - Parent topic dropdown (with tree view)
  - Validation (no empty names, unique names per level)
- Implement context menu (right-click):
  - Rename topic
  - Move to... (with topic picker)
  - Delete topic (with confirmation)
  - Merge with... (with topic picker)
- Add drag & drop support:
  - Drag topic to reorder or move to another parent
  - Visual drop indicators
  - Update tree after drop
- Wire up all operations to TopicTree and StorageService
- Add undo/redo support (optional but recommended)

**Deliverable:** Full topic CRUD through UI

**Dependencies:** Stage 4 (Basic Tree UI)

**Test Strategy:**
- Create deeply nested topics
- Rename and verify alphabetical re-sorting
- Drag & drop between different parents
- Delete topics with and without chats
- Test merge operation

---

### Stage 6: Content Script - Chat Detection
**Goal:** Detect and extract chat content from AI websites

**Tasks:**
- Create `content.js` content script
- Implement site-specific extractors:
  - **ChatGPT:** Extract from DOM structure
  - **Claude:** Extract from DOM structure
  - **Gemini:** Extract from DOM structure
  - Modular design for easy addition of new sites
- Detect when user is on a chat page
- Create "💾 Save to bAInder" button injection:
  - Inject button into page UI
  - Position near chat controls
  - Style to match site theme
- Extract chat data on save:
  - Full conversation (all messages)
  - Metadata (URL, timestamp, title)
  - Sanitize HTML/markdown
- Send data to background script via messaging
- Handle extraction errors gracefully

**Deliverable:** Auto-detect chats and save them

**Dependencies:** Stage 2 (Storage), Stage 3 (Data Models)

**Test Strategy:**
- Visit ChatGPT, Claude, Gemini
- Verify button injection
- Save various chat types (short, long, with code, with images)
- Test with empty or unsupported pages

#### Stage 6 Extension: Context Menu — Save Chat Excerpt

**Goal:** Allow saving a user-selected portion of a chat as a `ChatEntry` instead of the full conversation.

**Rationale:** The floating button saves the entire conversation. For cases where only a specific exchange or passage is relevant, the user should be able to highlight text on the page and save just that selection via right-click.

**Tasks:**
- Register a `chrome.contextMenus` item in `background.js`:
  - Title: `"💾 Save selection to bAInder"`
  - `contexts: ['selection']` — only appears when text is selected
  - Only shown on supported AI chat platforms (filter by `documentUrlPatterns` matching all supported hostnames)
- On context menu click, background sends a `SAVE_EXCERPT` message to the active tab's content script
- Content script `SAVE_EXCERPT` handler:
  - Reads `window.getSelection().toString()` for the selected text
  - Detects the platform via `detectPlatform(window.location.hostname)`
  - Builds a `ChatEntry`-compatible object:
    - `title`: first line / first 80 chars of the selection
    - `content`: full selected text
    - `source`: detected platform
    - `url`: `window.location.href`
    - `messageCount`: 0 (not a full conversation)
    - `metadata.isExcerpt: true` (flag to distinguish from full-chat saves)
  - Sends `SAVE_CHAT` message to background with this payload (reuses existing save pipeline)
- The excerpt is stored as a regular `ChatEntry` with `topicId: null`, same as full saves
- Visual feedback: brief status indicator (reuse `setButtonState` pattern or a transient toast)

**Design Decisions:**
- Excerpts are treated as first-class `ChatEntry` items — no separate data type for MVP
- `metadata.isExcerpt: true` allows future UI differentiation (e.g. different icon in tree)
- Selection is captured at the moment background fires the message; no selection state is stored in background

**Test Strategy:**
- Select text on a supported AI chat site → context menu item appears
- Context menu item absent on non-supported sites
- Context menu item absent when nothing is selected
- Saved excerpt has correct `title`, `content`, `source`, `url`
- `metadata.isExcerpt` is `true`
- Empty/whitespace-only selection is rejected gracefully
- Reuses deduplication logic from `handleSaveChat`

---

### Stage 7: Chat Assignment UI
**Goal:** Allow users to assign saved chats to topics

**Tasks:**
- Create "Assign Chat" dialog:
  - Triggered after saving chat from content script
  - Show chat preview/title
  - Topic picker (tree view or searchable dropdown)
  - "Create new topic" quick action
  - Option to auto-assign based on keywords (future)
- Display chats under topics in tree view:
  - Chat items with titles
  - Visual distinction from topic folders
  - Click to open original chat URL
  - Auto-update topic timespan when chats added/moved
- Implement chat context menu:
  - Move to different topic
  - Rename chat
  - Delete chat
  - Export (prepare for Stage 9)
- Show chat count badge on topics
- Update topic date ranges automatically (firstChatDate/lastChatDate)

**Deliverable:** Chats visible in tree and manageable

**Dependencies:** Stage 5 (Topic Management), Stage 6 (Chat Detection)

**Test Strategy:**
- Save 10+ chats
- Assign to various topics
- Move chats between topics
- Verify tree updates correctly

---

### Stage 8: Search Functionality
**Goal:** Full-text search across all chats

**Tasks:**
- Create search UI in side panel:
  - Search input at top of panel
  - Real-time search results dropdown/panel
  - Results with chat title + snippet
  - Topic breadcrumb path for each result
  - Highlight matching terms
- Implement `SearchIndex` class:
  - Index chat content on save
  - Simple text-based search (MVP)
  - Return results with relevance scoring
  - Include topic path in results
- Add search filters (optional):
  - Filter by date range
  - Filter by source (ChatGPT, Claude, etc.)
  - Filter by topic branch
- Click result to jump to chat in tree:
  - Expand parent topics automatically
  - Highlight selected chat
  - Optionally show chat preview pane

**Deliverable:** Working search with result navigation

**Dependencies:** Stage 7 (Chat Display)

**Test Strategy:**
- Index 50+ chats
- Search for various terms
- Verify results accuracy
- Test fuzzy matching (if implemented)
- Performance test with 200+ chats

---

### Stage 9: Export & Content Transformation
**Goal:** Export chats in various formats with style transformation, plus folder structure export for local browsing

**Tasks:**
- Add export option to context menu
- Create export dialog:
  - Format selection (Markdown, HTML, PDF, **ZIP Archive**)
  - Style selection:
    - Technical article
    - Academic journal
    - Blog post
    - LinkedIn article
    - Raw transcript
  - Export scope:
    - Single chat
    - Single topic
    - Topic with all children (recursive)
    - **Entire tree as folder structure**
  - Preview pane (optional)
- Implement export engines:
  - **Markdown:** Format with headers, code blocks, lists
  - **HTML:** Styled with CSS, responsive
  - **PDF:** Use browser print API or library (jsPDF)
  - **ZIP Archive (New):** Complete folder structure export
- Implement style transformers:
  - Use templates for each style
  - Reformat conversation structure
  - Add professional formatting (title, intro, sections)
  - Optional: AI-powered rewriting (future enhancement)
- Download file to user's system
- Support batch export (entire topic with all chats)

**New Feature: Folder Structure Export to ZIP**

Export the entire topic tree as a ZIP file containing:
- Hierarchical folder structure mirroring the topic tree
- Each chat saved as individual Markdown file
- Metadata file (tree structure, timestamps, sources)
- README.md with navigation instructions

**Implementation Details:**

*Folder Structure:*
```
bAInder-export-2024-03-15/
├── README.md (export info, navigation guide)
├── _metadata.json (tree structure, export date, version)
├── Work/
│   ├── Projects/
│   │   ├── chat-001-project-alpha-discussion.md
│   │   ├── chat-002-technical-requirements.md
│   │   └── chat-003-architecture-decisions.md
│   ├── Meetings/
│   │   └── chat-004-weekly-standup-notes.md
│   └── _topic.json (topic metadata: name, dates, chat count)
├── Personal/
│   ├── Health/
│   │   └── chat-005-workout-routine-planning.md
│   └── Finance/
│       └── chat-006-budget-analysis.md
└── Learning/
    ├── JavaScript/
    │   └── chat-007-async-await-patterns.md
    └── Python/
        └── chat-008-data-science-intro.md
```

*Markdown File Format:*
```markdown
---
title: "Project Alpha Discussion"
source: chatgpt
url: https://chat.openai.com/c/abc123
date: 2024-03-15T10:30:00Z
topic: Work > Projects
chat_id: chat-001
---

# Project Alpha Discussion

**Source:** ChatGPT  
**Date:** March 15, 2024 at 10:30 AM  
**Topic Path:** Work > Projects

---

## Conversation

### User
[First message content...]

### Assistant
[Response content...]

### User
[Next message...]

[Continue conversation...]

---

*Exported from bAInder on March 15, 2024*
```

*_metadata.json Format:*
```json
{
  "export_version": "1.0",
  "export_date": "2024-03-15T14:30:00Z",
  "bainder_version": "1.0.0",
  "tree_structure": {
    "topics": [...],
    "total_chats": 8,
    "total_topics": 8
  },
  "statistics": {
    "date_range": {
      "first_chat": "2024-01-15T10:00:00Z",
      "last_chat": "2024-03-15T10:30:00Z"
    },
    "sources": {
      "chatgpt": 5,
      "claude": 2,
      "gemini": 1
    }
  }
}
```

*Implementation:*
- Use JSZip library for ZIP file creation
- Sanitize folder/file names (remove special chars, limit length)
- Handle name collisions with numeric suffixes
- Progress indicator for large exports
- Async/chunked processing to prevent UI freeze
- Download via Blob URL and `<a download>` trigger

*Benefits:*
- Browse chats locally in VS Code or any text editor
- Full-text search with tools like `grep` or VS Code search
- Version control with Git (markdown is VCS-friendly)
- Local backup without vendor lock-in
- Works offline permanently
- Can share entire knowledge base as ZIP file

**Deliverable:** Export system with multiple formats including ZIP archive

**Dependencies:** Stage 7 (Chat Display)

**Test Strategy:**
- Export single chat in all formats
- Export entire topic tree as ZIP
- Verify folder structure matches tree hierarchy
- Test with special characters in topic/chat names
- Test with large datasets (100+ topics, 500+ chats)
- Verify markdown formatting in exported files
- Test ZIP file integrity
- Verify style transformations
- Test PDF generation quality
- Test with long chats (100+ exchanges)

**New Feature: Import Folder Structure from ZIP**

Import and merge an entire folder structure from a previously exported ZIP file (or manually created folder structure) into the existing topic tree.

**Use Cases:**
- Restore from backup
- Migrate from another device
- Share knowledge base with team members
- Merge multiple exported archives
- Import manually organized markdown files

**Implementation Details:**

*Import Dialog:*
- File picker for ZIP file selection (or drag & drop)
- Import strategy options:
  - **Merge (default):** Combine with existing tree, skip duplicate topics
  - **Replace:** Clear existing data and import fresh
  - **Create New Root:** Import under a new parent topic
- Conflict resolution settings:
  - Skip existing topics (preserve current structure)
  - Update existing topics (merge chats)
  - Rename imported topics (append suffix)
- Preview pane showing:
  - Topics to be created
  - Topics to be merged
  - Total chats to be imported
  - Conflicts detected
- Progress indicator during import

*Import Algorithm:*

```javascript
async function importFromZip(zipFile, strategy) {
  // 1. Extract and parse ZIP
  const zip = await JSZip.loadAsync(zipFile);
  const metadata = await zip.file('_metadata.json').async('string');
  const metaObj = JSON.parse(metadata);
  
  // 2. Build folder map
  const folderStructure = await parseFolderStructure(zip);
  
  // 3. Process based on strategy
  if (strategy === 'merge') {
    // Navigate existing tree and merge
    await mergeImportedStructure(folderStructure);
  } else if (strategy === 'replace') {
    // Clear existing tree and import fresh
    await clearAndImport(folderStructure);
  } else if (strategy === 'create_root') {
    // Create new parent topic and import under it
    await importUnderNewRoot(folderStructure);
  }
  
  // 4. Save updated tree
  await saveTree();
  
  // 5. Refresh UI
  renderer.render();
}
```

*Merge Strategy Details:*

When importing with merge strategy:

1. **For each folder (topic):**
   - Check if topic with same name exists at same level
   - **If exists:** 
     - Skip topic creation
     - Proceed to import chats into existing topic
     - Recursively process subfolders/chats
   - **If not exists:**
     - Create new topic
     - Import all chats
     - Recursively import subfolders

2. **For each markdown file (chat):**
   - Parse frontmatter to extract metadata
   - Check if chat with same ID already exists
   - **If exists:** 
     - Skip or update based on settings
   - **If not exists:**
     - Create new chat entry
     - Add to topic's chat list
     - Update topic date range

3. **Edge Cases:**
   - Orphaned files (no parent folder) → Import to root
   - Invalid markdown → Skip with warning
   - Name collisions → Offer rename or skip
   - Circular references → Detect and prevent

*File Format Compatibility:*

Support importing from:
- bAInder ZIP exports (with _metadata.json)
- Generic folder structures (auto-detect from structure)
- Individual markdown files (create single topic)

*Markdown Parsing:*

Extract metadata from frontmatter:
```markdown
---
title: "Chat Title"
source: chatgpt
url: https://...
date: 2024-03-15T10:30:00Z
topic: Work > Projects
chat_id: chat-001
---
```

If no frontmatter exists, fallback to:
- Filename as title
- File modification date as chat date
- Default source to "imported"

*Implementation Steps:*

1. Add "Import from ZIP" button in settings or main menu
2. File input dialog with ZIP file picker
3. Parse ZIP contents:
   - Read _metadata.json (if exists)
   - Walk directory structure
   - Parse all .md files
4. Build import preview:
   - Show topic tree to be imported
   - Highlight conflicts
   - Allow user to customize before import
5. Execute import with progress tracking
6. Show import summary:
   - Topics created: X
   - Topics merged: Y
   - Chats imported: Z
   - Errors/warnings: N
7. Refresh tree view

*Error Handling:*
- Validate ZIP structure before import
- Graceful handling of corrupt files
- Continue import on individual file errors
- Collect and display all errors at end
- Offer rollback/undo option

*Security Considerations:*
- Validate file types (only .md, .json)
- Sanitize filenames before creating topics
- Limit file sizes (max 10MB per chat)
- Limit total import size (max 500MB)
- No script execution from imported content

*Benefits:*
- Easy backup and restore workflow
- Share curated knowledge bases
- Collaborate with team members
- Migrate between devices
- Integrate manually organized markdown notes
- Recover from data loss

**Testing Strategy for Import:**
- Import previously exported ZIP
- Verify tree structure matches original
- Test merge with existing data (duplicates handled)
- Test with missing metadata files
- Test with invalid/corrupted files
- Test with large imports (1000+ files)
- Test rollback/undo functionality
- Verify chat content integrity
- Test conflict resolution strategies
- Import manually created folder structure

---

### Stage 10: Polish & Optimization
**Goal:** Improve performance and user experience

**Tasks:**
- Performance optimization:
  - Virtual scrolling for large trees (1000+ items)
  - Debounce search input
  - Lazy load chat content (don't load all in memory)
  - Background indexing for search
- UI/UX improvements:
  - Loading spinners for async operations
  - Success/error toast notifications
  - Keyboard shortcuts (Ctrl+F for search, etc.)
  - Dark mode support
  - Animations for expand/collapse
- Settings page:
  - Storage usage display
  - Auto-save preferences
  - Export/import entire database (see Stage 9 for ZIP folder structure export/import)
  - Clear all data option
  - Site-specific extraction settings
- Error handling:
  - Graceful degradation
  - User-friendly error messages
  - Retry mechanisms for failed operations
- Documentation:
  - Inline help tooltips
  - User guide (markdown)
  - Keyboard shortcut cheat sheet

**Deliverable:** Production-ready extension

**Dependencies:** All previous stages

**Test Strategy:**
- Load test with 1000+ chats
- Test on low-end hardware
- User acceptance testing
- Browser compatibility (Chrome, Edge)

---

### Stage 11: Advanced Features (Future)
**Goal:** Enhanced functionality for power users

**Potential Features:**
- **IndexedDB migration:**
  - Implement `IndexedDBAdapter`
  - Data migration tool
  - Toggle in settings
- **Cloud sync:**
  - Optional Google Drive backup
  - Cross-device synchronization
- **AI-powered features (See Section 0.7 for detailed analysis):**
  - Auto-categorization of chats using NLP
  - Suggested topic names based on content analysis
  - Chat summarization
  - Duplicate detection via similarity algorithms
  - Smart topic merging suggestions
  - Keyword extraction for improved search
  - **Technology:** Lightweight NLP libraries (compromise, natural) for local processing
  - **Optional:** External AI API integration (OpenAI/Claude) for advanced features
  - **Migration required:** Vite bundler + npm package management
- **Collaboration:**
  - Share topics/chats via export
  - Import shared collections
- **Advanced search:**
  - Semantic search using NLP embeddings
  - Regex support
  - Boolean operators (AND, OR, NOT)
  - Saved searches
- **Analytics:**
  - Usage statistics
  - Most used topics
  - Chat heat map by date

**Independent:** ✅ Each feature can be developed separately

**Note on NLP Implementation:**
This stage requires significant architectural changes:
- Migration from vanilla JS to bundled modules (Vite)
- Addition of npm dependencies (compromise, natural)
- Updated testing strategy (Vitest over Jest)
- See [TESTING_FRAMEWORK_DECISION.md](TESTING_FRAMEWORK_DECISION.md) for testing approach
- Prioritize local-only NLP for privacy; API features are optional user opt-in

---

## 4. Technical Considerations

### 4.1 Storage Strategy (MVP)
- Use `chrome.storage.local` with `unlimitedStorage` permission
- Store entire tree structure as single JSON object for simplicity
- Store individual chats as separate entries (keyed by chat ID)
- Implement storage abstraction for future IndexedDB migration
- Add storage monitoring to warn users approaching limits

### 4.2 Performance Considerations
- Lazy loading: Load topic children only when expanded
- Virtual scrolling: Render only visible tree nodes (for 1000+ items)
- Debounced search: Wait for user to stop typing
- Background processing: Index chats asynchronously
- Incremental updates: Don't reload entire tree on change

### 4.3 Content Extraction Challenges
- Each AI site has unique DOM structure
- DOM structures change with site updates
- Fallback mechanisms if extraction fails
- User manual input option if auto-detection fails
- Modular extractor design for easy site additions

### 4.4 Data Integrity
- Validate all data before storage
- Prevent orphaned chats (chat without topic)
- Handle deleted topics gracefully
- Implement data repair utilities
- Regular data structure validation

### 4.5 Security & Privacy
- All data stored locally (no external servers)
- No tracking or analytics
- Secure content extraction (prevent XSS)
- Sanitize user inputs
- Export files safely (no code execution)

---

## 5. Testing Strategy

### Unit Testing
- Data models and tree operations
- Storage adapters (mock storage)
- Search and indexing logic
- Export formatters

### Integration Testing
- Storage ↔ UI interactions
- Content script ↔ background messaging
- Search ↔ tree navigation

### Manual Testing
- Test on actual AI chat sites
- User workflow testing (end-to-end)
- Performance testing with large datasets
- Cross-browser testing (Chrome, Edge)

### Test Data Sets
- Small: 10 topics, 50 chats
- Medium: 50 topics, 300 chats
- Large: 200 topics, 1000+ chats

---

## 6. Deployment Checklist

- [ ] All features tested and working
- [ ] Performance optimized for large datasets
- [ ] Error handling comprehensive
- [ ] User documentation complete
- [ ] Privacy policy drafted (if publishing)
- [ ] Icons and branding finalized
- [ ] Extension screenshots prepared
- [ ] Chrome Web Store listing ready
- [ ] Version number and changelog updated

---

## 7. Success Metrics

- **Functional:** All core features working without errors
- **Performance:** Tree with 500 items loads < 1 second
- **Storage:** Supports 300+ chats without issues
- **UX:** Users can save and find chats in < 30 seconds
- **Stability:** No crashes or data loss in testing

---

## 8. Future Migration Path

### When to Migrate to IndexedDB
- User exceeds 500 chats
- Search performance degrades
- User requests advanced query features
- Memory usage becomes problem

### Migration Process
1. Create `IndexedDBAdapter` implementing `IStorageService`
2. Build data migration utility
3. Test with copy of user data
4. Provide opt-in migration in settings
5. Maintain backward compatibility

### Abstraction Benefits
- Swap storage backend without UI changes
- Test with different storage implementations
- Support multiple storage backends simultaneously
- Easy rollback if migration fails

---

*Document Version: 1.0*  
*Last Updated: February 18, 2026*
