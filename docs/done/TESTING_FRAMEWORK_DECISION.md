# Unit Testing Framework Selection

## Discussion Date
February 18, 2026

## Context

The bAInder Chrome extension project requires a testing framework for unit testing the storage abstraction layer, data models, tree operations, and business logic. The choice of testing framework was influenced by:

1. Initial assumption: Vanilla JavaScript only
2. Revised consideration: Potential use of external NLP/ML libraries
3. Chrome extension specific needs (API mocking)
4. Development experience and tooling preferences

---

## Initial Requirements

- Test vanilla JavaScript (no framework)
- Mock Chrome APIs (`chrome.storage`, `chrome.runtime`, etc.)
- Test async operations
- Test data structures and business logic
- Lightweight setup (no complex build process)
- Good VS Code integration

---

## Testing Framework Options Evaluated

### Option 1: Jest ⭐ (Initial Recommendation)

**Pros:**
- ✅ Most mature and well-documented
- ✅ Built-in mocking, assertions, coverage
- ✅ **`jest-chrome`** package for Chrome API mocking
- ✅ Excellent VS Code extensions available
- ✅ Huge community and Stack Overflow answers
- ✅ Works well with vanilla JS
- ✅ Snapshot testing (useful for UI components)

**Cons:**
- ❌ Slightly slower than modern alternatives
- ❌ Requires configuration for ES modules

**Best for:** Projects without build tooling, maximum stability, Chrome extension focus

**Setup Complexity:** Low-Medium

**Example Setup:**
```json
{
  "devDependencies": {
    "jest": "^29.7.0",
    "jest-chrome": "^0.8.0",
    "jest-environment-jsdom": "^29.7.0"
  },
  "scripts": {
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage"
  }
}
```

**Example Test:**
```javascript
// __tests__/storage.test.js
import { ChromeStorageAdapter } from '../src/storage.js';

describe('ChromeStorageAdapter', () => {
  beforeEach(() => {
    chrome.storage.local.get.mockClear();
  });

  test('should save data', async () => {
    const adapter = new ChromeStorageAdapter();
    await adapter.save('topics', [{ id: '1', name: 'Test' }]);
    
    expect(chrome.storage.local.set).toHaveBeenCalledWith({
      topics: [{ id: '1', name: 'Test' }]
    });
  });
});
```

---

### Option 2: Vitest (Modern Alternative)

**Pros:**
- ✅ Extremely fast (Vite-based)
- ✅ Jest-compatible API (easy migration)
- ✅ Native ESM support
- ✅ Built-in TypeScript support
- ✅ Modern and actively developed
- ✅ Great DX with hot reload
- ✅ Perfect integration with Vite bundler

**Cons:**
- ❌ Smaller community than Jest
- ❌ Less Chrome extension specific tooling
- ❌ Need to configure Chrome API mocks manually (but straightforward)

**Best for:** Projects with Vite/modern build tooling, cutting-edge preferences

**Setup Complexity:** Medium

**Example Setup:**
```javascript
// vitest.config.js
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './test/setup.js'
  }
});

// test/setup.js - Mock Chrome APIs
global.chrome = {
  storage: {
    local: {
      get: vi.fn(),
      set: vi.fn()
    }
  },
  runtime: {
    sendMessage: vi.fn()
  }
};
```

---

### Option 3: Mocha + Chai + Sinon

**Pros:**
- ✅ Very flexible and modular
- ✅ **`sinon-chrome`** for Chrome API mocking
- ✅ Lightweight
- ✅ Choose your assertion library

**Cons:**
- ❌ More setup required (3 separate packages)
- ❌ Less "batteries included"
- ❌ More verbose configuration

**Best for:** Developers who prefer modular, composable tooling

**Setup Complexity:** Medium-High

---

## Decision Factor: NLP/ML Libraries

### Game-Changing Consideration

The project may require external NLP/ML libraries for:
1. **Auto-categorization** - Analyze chat content and suggest topics
2. **Similar topic detection** - Identify topics that should be merged
3. **Smart search** - Semantic search beyond simple text matching
4. **Duplicate detection** - Find similar conversations
5. **Auto-summarization** - Generate topic descriptions

### NLP/ML Technology Options

#### Option A: Client-Side ML (TensorFlow.js)
- Run ML models in browser
- No API costs, works offline
- Heavy (several MB), slower
- Good for: embeddings, similarity detection

#### Option B: Lightweight NLP Libraries
- **compromise** (~200KB) - Fast, simple NLP (POS tagging, entities)
- **natural** - Tokenization, stemming, TF-IDF
- Good for: keyword extraction, basic similarity

#### Option C: External API (OpenAI/Claude)
- Send content to API for analysis
- Most powerful, but costs money and requires internet
- Privacy concerns (data leaves device)
- Good for: advanced categorization, summarization

#### Option D: Hybrid Approach (Recommended ⭐)
- **Local first:** Use lightweight NLP for basic matching
- **Optional AI:** Let users opt-in to API features
- Best balance of privacy, performance, and capability

### Impact on Testing Framework Choice

**If using external libraries, you NEED:**

1. **Package Manager** (npm/pnpm/yarn)
2. **Module Bundler** (Vite/Webpack/Rollup)
3. **Build Process** - Compile/bundle for Chrome extension
4. **ES Modules** - Modern import/export

This shifts the testing recommendation significantly.

---

## Revised Comparison: With Build Tooling + Dependencies

| Feature | Jest | Vitest |
|---------|------|---------|
| **Vite integration** | Manual config | Native |
| **Speed with npm deps** | Slower | 10-20x faster |
| **ESM support** | Requires config | Native |
| **Chrome API mocking** | jest-chrome package | Manual (easy with vi.mock) |
| **Learning curve** | Established docs | Same API as Jest |
| **Bundle testing** | Complex setup | Simple |
| **HMR for tests** | No | Yes |
| **Watch mode** | Good | Excellent |

---

## Final Recommendation: Conditional

### Scenario A: Vanilla JavaScript Only (No NLP)

**Use Jest + jest-chrome**

**Reasons:**
- Chrome extension specific tooling (jest-chrome)
- Simpler setup, no bundler needed
- Better documentation for Chrome extension testing
- More stable, battle-tested

**When:**
- ✅ No external libraries planned
- ✅ Want fastest path to MVP
- ✅ Prefer stability over cutting-edge

---

### Scenario B: Using npm Libraries (NLP/ML features) ⭐⭐

**Use Vitest + Vite**

**Reasons:**
- Perfect Vite integration for bundling
- Handles npm packages natively in tests
- 10-20x faster with large dependencies
- ESM native, no configuration headaches
- HMR for tests (instant feedback)
- Modern, future-proof

**When:**
- ✅ Planning NLP features (even if later stages)
- ✅ Want modern dev experience
- ✅ Comfortable with bundlers
- ✅ Need to test code with external dependencies

**Required Stack:**
```json
{
  "dependencies": {
    "compromise": "^14.13.0"
  },
  "devDependencies": {
    "vite": "^5.0.0",
    "vitest": "^1.2.0"
  }
}
```

---

## Decision Timeline

### Phase 1: Now (Stage 2-3)
**Question:** Do we need build tooling NOW?
- **If YES:** Set up Vite + Vitest immediately
- **If NO:** Start with Jest, refactor later if needed

### Phase 2: Later (Stage 11 - Advanced Features)
- If started with Jest, migration to Vitest is straightforward (similar API)
- Refactor from vanilla JS to bundled modules as needed

---

## Recommended Project Structure (If using Vite + Vitest)

```
bAInder/
├── src/
│   ├── background/
│   │   └── background.js
│   ├── content/
│   │   └── content.js
│   ├── sidepanel/
│   │   ├── sidepanel.html
│   │   ├── sidepanel.js
│   │   └── sidepanel.css
│   ├── lib/
│   │   ├── storage.js
│   │   ├── tree.js
│   │   ├── nlp.js           ← NLP features
│   │   └── similarity.js    ← Topic similarity
│   └── utils/
├── test/
│   ├── setup.js              ← Chrome API mocks
│   ├── storage.test.js
│   ├── tree.test.js
│   └── nlp.test.js
├── public/
│   ├── manifest.json
│   └── icons/
├── package.json
├── vite.config.js
└── vitest.config.js
```

---

## Key Questions Asked

### 1. When do you need NLP features?
- **Now (Stage 2-3):** Set up build tooling immediately → Vitest
- **Later (Stage 11):** Can start vanilla, refactor later → Jest now, Vitest later
- **Maybe never:** Keep simple → Jest

### 2. Which NLP features are must-haves?
- Auto-categorization
- Merge suggestions
- Smart search
- All of the above

### 3. Privacy vs Power tradeoff?
- **Privacy focused:** Local-only NLP (compromise, basic algorithms)
- **Power focused:** Optional OpenAI API integration
- **Hybrid:** Basic local + optional API

### 4. Build tooling preference?
- **Modern stack:** Vite + Vitest (recommended if using libraries)
- **Simple stack:** Vanilla JS + Jest (recommended for MVP only)

---

## Conclusion

**For bAInder project:**

Given the discussion about NLP/ML features for auto-categorization and topic merging, the recommendation is:

### **Set up Vite + Vitest from the start**

**Why:**
1. NLP features are being seriously considered
2. Better to set up proper tooling now than refactor everything later
3. Modern dev experience pays off quickly
4. Testing external dependencies is much easier
5. Migration path is clear and well-documented

**Trade-offs accepted:**
- Slightly more initial setup complexity
- Need to learn Vite basics
- Manual Chrome API mocking (but straightforward)

**Benefits gained:**
- Fast, modern testing
- Easy npm package integration
- Future-proof architecture
- Better developer experience
- Scalable for advanced features

---

## Implementation Plan

### If choosing Vitest:

1. **Stage 2 Setup:**
   - Initialize npm project
   - Install Vite + Vitest
   - Configure Chrome API mocks
   - Set up test structure
   - Create example tests

2. **Stage 3-10:**
   - Write tests alongside feature development
   - Use Vitest watch mode for TDD

3. **Stage 11:**
   - Add NLP libraries (compromise, etc.)
   - Test NLP functionality
   - No refactoring needed

### If choosing Jest:

1. **Stage 2 Setup:**
   - Install Jest + jest-chrome
   - Configure for ESM (if needed)
   - Create tests

2. **Stage 11 (if NLP needed):**
   - Add npm + Vite
   - Migrate tests from Jest to Vitest (easy, same API)
   - Restructure project for bundling

---

*Document Version: 1.0*  
*Last Updated: February 18, 2026*
