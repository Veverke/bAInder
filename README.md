# bAInder - AI Chat Organizer

Chrome extension to organize AI browser chats (ChatGPT, Claude, Gemini) into a hierarchical notebook with topics, table of contents, and search functionality.

## Stage 1: Foundation & Project Setup ✅

The basic extension structure is now complete and ready for testing!

### What's Included

- ✅ Extension manifest with required permissions
- ✅ Side panel UI with header, search, and empty state
- ✅ Background service worker for lifecycle management
- ✅ Content script placeholder for future chat detection
- ✅ Basic styling and layout
- ✅ Placeholder icons (16x16, 32x32, 48x48, 128x128)

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
- ➕ "Add Topic" button (functional in Stage 5)
- Empty state message: "No topics yet"
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

### Known Stage 1 Limitations

The following features are **not yet implemented** (coming in later stages):
- ❌ Creating topics (Stage 5)
- ❌ Displaying/managing topics in tree (Stage 4)
- ❌ Saving chats (Stage 6-7)
- ❌ Search functionality (Stage 8)
- ❌ Export features (Stage 9)
- ❌ Settings page (Stage 10)

Buttons for these features show alerts saying they're coming in future stages.

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
├── background.js                    # Service worker (message handling)
├── content.js                       # Content script (chat detection)
├── sidepanel.html                   # Side panel UI
├── generate-icons.ps1               # Icon generation script
├── DESIGN_SPECS.md                  # Complete design documentation
├── TESTING_FRAMEWORK_DECISION.md    # Unit testing framework analysis
├── README.md                        # This file
├── icons/                           # Extension icons
│   ├── icon16.png
│   ├── icon32.png
│   ├── icon48.png
│   └── icon128.png
├── scripts/                         # JavaScript files
│   └── sidepanel.js                # Side panel logic
└── styles/                          # CSS files
    └── sidepanel.css               # Side panel styling
```

## Next Steps

After successful Stage 1 testing, we'll proceed with:

- **Stage 2:** Storage Abstraction Layer
- **Stage 3:** Data Models & Tree Structure
- **Stage 4:** Side Panel UI - Basic Tree View
- **Stage 5:** Topic Management UI

See [DESIGN_SPECS.md](DESIGN_SPECS.md) for complete development roadmap.

## Development Notes

### Chrome Extension Permissions

The extension requests:
- `storage` + `unlimitedStorage` - Local data storage
- `tabs` + `activeTab` - Access current tab for side panel
- `sidePanel` - Side panel API access
- Host permissions for ChatGPT, Claude, Gemini

### Storage Strategy

Currently using `chrome.storage.local` with unlimited storage permission. See [DESIGN_SPECS.md](DESIGN_SPECS.md) Section 0.2 for database strategy details.

### Testing Framework

Testing strategy to be implemented in Stage 2. See [TESTING_FRAMEWORK_DECISION.md](TESTING_FRAMEWORK_DECISION.md) for comprehensive analysis of Jest vs Vitest and considerations for NLP/ML library integration.

### NLP/ML Features

Optional smart features (Stage 11) using local NLP libraries for auto-categorization and topic similarity. See [DESIGN_SPECS.md](DESIGN_SPECS.md) Section 0.7 for detailed analysis of technology options and privacy considerations.

### Supported Platforms

Content script is configured for:
- OpenAI ChatGPT (`chat.openai.com`)
- Anthropic Claude (`claude.ai`)
- Google Gemini (`gemini.google.com`)

## Contributing

This is currently in active development following the stage-by-stage approach outlined in DESIGN_SPECS.md.

## Version

**Current Stage:** Stage 1 - Foundation & Project Setup ✅  
**Version:** 1.0.0  
**Last Updated:** February 18, 2026
