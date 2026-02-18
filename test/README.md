# Testing Guide

## Vitest Setup Complete ✅

Vitest is configured and ready for unit testing throughout the project.

## Running Tests

### Basic Commands

```bash
# Run tests once
npm run test:run

# Run tests in watch mode (auto-rerun on file changes)
npm test

# Run tests with UI (opens browser interface)
npm run test:ui

# Run tests with coverage report
npm run test:coverage
```

### VS Code Integration

**Recommended Extensions:**
- **Vitest** (vitest.explorer) - Test Explorer UI in sidebar
- **Error Lens** - Inline error display

## Test Structure

```
test/
├── setup.js          # Chrome API mocks & global test setup
└── example.test.js   # Example tests (can be deleted)
```

## Chrome API Mocks

All Chrome Extension APIs are automatically mocked in `test/setup.js`:

### Available Mocks

- ✅ `chrome.storage.local` (get, set, remove, clear, getBytesInUse)
- ✅ `chrome.runtime` (sendMessage, onMessage, getManifest)
- ✅ `chrome.tabs` (query, create, onUpdated)
- ✅ `chrome.action` (onClicked, setIcon, setBadgeText)
- ✅ `chrome.sidePanel` (open, setOptions)

### Helper Functions

```javascript
import { setStorageMockData, getStorageMockCalls } from './setup.js';

// Set mock data for chrome.storage.local.get
setStorageMockData({ topics: ['topic1', 'topic2'] });

// Get what was saved to storage
const calls = getStorageMockCalls();
```

## Writing Tests

### Basic Test Example

```javascript
import { describe, it, expect } from 'vitest';

describe('MyFunction', () => {
  it('should do something', () => {
    const result = myFunction('input');
    expect(result).toBe('expected output');
  });
});
```

### Testing with Chrome APIs

```javascript
import { describe, it, expect } from 'vitest';
import { setStorageMockData } from './setup.js';

describe('StorageService', () => {
  it('should save data to chrome.storage', async () => {
    const service = new StorageService();
    await service.save('key', 'value');
    
    expect(chrome.storage.local.set).toHaveBeenCalledWith({ key: 'value' });
  });
  
  it('should load data from chrome.storage', async () => {
    setStorageMockData({ key: 'value' });
    
    const service = new StorageService();
    const result = await service.load('key');
    
    expect(result).toBe('value');
  });
});
```

### Testing Async Operations

```javascript
it('should handle async operations', async () => {
  const promise = asyncFunction();
  await expect(promise).resolves.toBe('success');
});

it('should handle errors', async () => {
  const promise = failingFunction();
  await expect(promise).rejects.toThrow('Error message');
});
```

### Mocking Functions

```javascript
import { vi } from 'vitest';

it('should call callback', () => {
  const callback = vi.fn();
  
  myFunction(callback);
  
  expect(callback).toHaveBeenCalled();
  expect(callback).toHaveBeenCalledWith('arg1', 'arg2');
});
```

## Test Coverage

Generate coverage report:

```bash
npm run test:coverage
```

Coverage files are generated in `coverage/` directory (gitignored).

View HTML report: Open `coverage/index.html` in browser.

## Best Practices

### 1. Test File Naming
- Place tests in `test/` directory
- Name files `*.test.js`
- Match source file names (e.g., `storage.js` → `storage.test.js`)

### 2. Test Organization
```javascript
describe('Component/Module name', () => {
  describe('methodName', () => {
    it('should do X when Y', () => {
      // test
    });
    
    it('should handle edge case', () => {
      // test
    });
  });
});
```

### 3. Clear Test Names
- ✅ `it('should return sorted array when input is unsorted')`
- ❌ `it('test1')`

### 4. Arrange-Act-Assert Pattern
```javascript
it('should calculate total', () => {
  // Arrange
  const items = [1, 2, 3];
  
  // Act
  const total = calculateTotal(items);
  
  // Assert
  expect(total).toBe(6);
});
```

### 5. Reset Mocks
Mocks are automatically cleared before each test via `beforeEach()` in `setup.js`.

## Common Assertions

```javascript
// Equality
expect(value).toBe(expected);           // Strict equality (===)
expect(value).toEqual(expected);        // Deep equality
expect(value).not.toBe(expected);       // Negation

// Truthiness
expect(value).toBeTruthy();
expect(value).toBeFalsy();
expect(value).toBeNull();
expect(value).toBeUndefined();
expect(value).toBeDefined();

// Numbers
expect(value).toBeGreaterThan(3);
expect(value).toBeLessThan(5);
expect(value).toBeCloseTo(0.3);         // For floating point

// Strings
expect(string).toMatch(/pattern/);
expect(string).toContain('substring');

// Arrays
expect(array).toHaveLength(3);
expect(array).toContain(item);
expect(array).toEqual([1, 2, 3]);

// Objects
expect(obj).toHaveProperty('key');
expect(obj).toHaveProperty('key', 'value');
expect(obj).toMatchObject({ key: 'value' });

// Functions
expect(fn).toThrow();
expect(fn).toThrow('error message');
expect(fn).toHaveBeenCalled();
expect(fn).toHaveBeenCalledTimes(2);
expect(fn).toHaveBeenCalledWith(arg1, arg2);

// Promises
await expect(promise).resolves.toBe(value);
await expect(promise).rejects.toThrow();
```

## Debugging Tests

### 1. Run Single Test File
```bash
npm test test/storage.test.js
```

### 2. Run Tests Matching Pattern
```bash
npm test -- -t "pattern"
```

### 3. Use Console Logs
```javascript
it('should debug', () => {
  console.log('Debug value:', value);
  expect(value).toBe(expected);
});
```

### 4. VS Code Debugger
1. Set breakpoint in test file
2. Open Command Palette (Ctrl+Shift+P)
3. Run "Debug: JavaScript Debug Terminal"
4. Run `npm test` in that terminal

## Troubleshooting

### Tests Not Running
- Check `vitest.config.js` is present
- Verify test files match pattern in config: `test/**/*.test.js`
- Run `npm install` to ensure dependencies are installed

### Chrome APIs Undefined
- Check `test/setup.js` is in setupFiles array in `vitest.config.js`
- Verify global.chrome is defined in setup.js

### Import Errors
- Ensure `"type": "module"` is in package.json
- Use `.js` extension in imports: `import { x } from './file.js'`

### Mocks Not Working
- Ensure `beforeEach(vi.clearAllMocks())` is called in setup.js
- Check mock is defined before importing code that uses it

## Next Steps

As you develop Stage 2+ features:

1. Create test file for each module (e.g., `test/storage.test.js`)
2. Write tests alongside development (TDD recommended)
3. Run tests in watch mode: `npm test`
4. Aim for >80% code coverage

## Example: Stage 2 Storage Tests

```javascript
// test/storage.test.js
import { describe, it, expect, beforeEach } from 'vitest';
import { StorageService } from '../src/lib/storage.js';
import { setStorageMockData } from './setup.js';

describe('StorageService', () => {
  let service;
  
  beforeEach(() => {
    service = new StorageService();
  });
  
  describe('saveTopicTree', () => {
    it('should save tree to chrome.storage', async () => {
      const tree = [{ id: '1', name: 'Topic 1' }];
      
      await service.saveTopicTree(tree);
      
      expect(chrome.storage.local.set).toHaveBeenCalledWith({
        topics: tree
      });
    });
  });
  
  describe('loadTopicTree', () => {
    it('should load tree from chrome.storage', async () => {
      const tree = [{ id: '1', name: 'Topic 1' }];
      setStorageMockData({ topics: tree });
      
      const result = await service.loadTopicTree();
      
      expect(result).toEqual(tree);
    });
    
    it('should return empty array if no data', async () => {
      setStorageMockData({});
      
      const result = await service.loadTopicTree();
      
      expect(result).toEqual([]);
    });
  });
});
```

Happy Testing! 🧪
