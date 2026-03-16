# Context Menu UI Testing

## Overview

This document describes the comprehensive test coverage for the context menu functionality in the bAInder extension. The context menu allows users to perform topic operations via right-click.

## Test Files

- **tests/context-menu.test.js** - 25 tests covering all context menu interactions

## Test Coverage

### 1. Context Menu Structure (6 tests)
- ✅ Context menu element exists
- ✅ Rename action exists
- ✅ Move action exists  
- ✅ Merge action exists
- ✅ Delete action exists
- ✅ Delete action has 'danger' CSS class

### 2. Rename Topic via Context Menu (3 tests)
- ✅ Opens rename dialog when rename is clicked
- ✅ Successfully renames topic when user confirms
- ✅ Does not rename when user cancels

### 3. Move Topic via Context Menu (2 tests)
- ✅ Opens move dialog when move is clicked
- ✅ Successfully moves topic to new parent when user confirms

### 4. Delete Topic via Context Menu (4 tests)
- ✅ Opens delete confirmation when delete is clicked
- ✅ Successfully deletes topic when user confirms
- ✅ Does not delete when user cancels
- ✅ Shows warning when deleting topic with children

### 5. Merge Topics via Context Menu (3 tests)
- ✅ Opens merge dialog when merge is clicked
- ✅ Successfully merges topics when user confirms
- ✅ Does not merge when user cancels

### 6. Context Menu State Management (3 tests)
- ✅ Does not execute action if contextMenuTopic is null
- ✅ Handles multiple rapid clicks gracefully
- ✅ Preserves contextMenuTopic during operation

### 7. Context Menu Event Handling (2 tests)
- ✅ Stops event propagation on action clicks
- ✅ Handles errors in action handlers gracefully

### 8. All Context Menu Actions (2 tests)
- ✅ Event listeners attached to all actions
- ✅ All actions work without errors when contextMenuTopic is set

## Implementation Details

### How Context Menu Works

1. **User Right-Clicks Topic**
   - Tree-renderer listens for 'contextmenu' events on topic nodes
   - Calls `onTopicContextMenu` callback with topic and event

2. **Context Menu Appears**
   - `handleTopicContextMenu()` in sidepanel.js is triggered
   - Sets `state.contextMenuTopic` to the clicked topic
   - Calls `showContextMenu()` to display menu at cursor position

3. **User Clicks an Action**
   - Event listener on `[data-action]` elements triggers
   - Hides context menu
   - Calls appropriate handler (rename/move/delete/merge)
   - Handler checks `state.contextMenuTopic` and opens dialog

4. **Operation Completes**
   - Dialog shows user form/confirmation
   - User confirms or cancels
   - Tree is updated and saved
   - View is re-rendered

### Key Code Locations

**src/sidepanel/sidepanel.js:**
- Line 200: `state.renderer.onTopicContextMenu = handleTopicContextMenu`
- Line 313: `async function handleTopicContextMenu(topic, event)`
- Line 319: `function setupContextMenuActions()` 
- Lines 341-407: Context menu action handlers

**src/lib/tree-renderer.js:**
- Lines 169-173: Context menu event listener on topic nodes

**src/sidepanel/sidepanel.html:**
- Context menu HTML structure with data-action attributes

## Debugging Context Menu Issues

If context menu actions don't work in the browser:

1. **Check Console for Errors**
   - Open DevTools → Console
   - Right-click a topic and click an action
   - Look for JavaScript errors

2. **Verify Event Listeners**
   - In console, run: `document.querySelectorAll('[data-action]')`
   - Should show 4 elements (rename, move, merge, delete)

3. **Check State**
   - Add breakpoint in `handleTopicContextMenu()`
   - Verify `state.contextMenuTopic` is set correctly
   - Check that `state.topicDialogs` exists

4. **Verify Context Menu Shows**
   - Right-click should show context menu
   - Check CSS: `.context-menu { display: flex; }`
   - Verify `showContextMenu()` is called

5. **Test Each Action**
   - Click rename → Should open dialog with name input
   - Click move → Should open dialog with parent dropdown
   - Click delete → Should open confirmation dialog
   - Click merge → Should open dialog with target dropdown

## Test Execution

Run all context menu tests:
```bash
npm test -- context-menu
```

Run all tests including context menu:
```bash
npm test:run
```

## Success Criteria

All 25 context menu tests pass, covering:
- ✅ Menu structure and elements
- ✅ All 4 operations (rename, move, delete, merge)
- ✅ User confirmation and cancellation flows
- ✅ State management and edge cases
- ✅ Event handling and error scenarios

## Current Status

**✅ All 25 context menu tests passing**

Total test count: **290 tests** across 9 test files:
- 10 example tests
- 68 tree tests (including duplicate prevention)
- 40 dialog tests
- 28 storage tests
- 15 integration tests
- 48 tree-renderer tests
- 58 sidepanel UI tests
- 7 theme tests
- 25 context menu tests (NEW)
