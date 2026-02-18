import { vi } from 'vitest';

// Mock Chrome Extension APIs
global.chrome = {
  // Storage API
  storage: {
    local: {
      get: vi.fn((keys, callback) => {
        if (callback) {
          callback({});
        }
        return Promise.resolve({});
      }),
      set: vi.fn((items, callback) => {
        if (callback) {
          callback();
        }
        return Promise.resolve();
      }),
      remove: vi.fn((keys, callback) => {
        if (callback) {
          callback();
        }
        return Promise.resolve();
      }),
      clear: vi.fn((callback) => {
        if (callback) {
          callback();
        }
        return Promise.resolve();
      }),
      getBytesInUse: vi.fn((keys, callback) => {
        if (callback) {
          callback(0);
        }
        return Promise.resolve(0);
      })
    }
  },

  // Runtime API
  runtime: {
    sendMessage: vi.fn((message, callback) => {
      if (callback) {
        callback({ success: true });
      }
      return Promise.resolve({ success: true });
    }),
    onMessage: {
      addListener: vi.fn(),
      removeListener: vi.fn()
    },
    onInstalled: {
      addListener: vi.fn()
    },
    onStartup: {
      addListener: vi.fn()
    },
    getManifest: vi.fn(() => ({
      version: '1.0.0',
      name: 'bAInder'
    })),
    lastError: null
  },

  // Tabs API
  tabs: {
    query: vi.fn((queryInfo, callback) => {
      const tabs = [{ id: 1, url: 'https://chat.openai.com', active: true }];
      if (callback) {
        callback(tabs);
      }
      return Promise.resolve(tabs);
    }),
    create: vi.fn((createProperties, callback) => {
      const tab = { id: 2, ...createProperties };
      if (callback) {
        callback(tab);
      }
      return Promise.resolve(tab);
    }),
    onUpdated: {
      addListener: vi.fn()
    }
  },

  // Action API (for toolbar icon)
  action: {
    onClicked: {
      addListener: vi.fn()
    },
    setIcon: vi.fn(),
    setBadgeText: vi.fn(),
    setBadgeBackgroundColor: vi.fn()
  },

  // Side Panel API
  sidePanel: {
    open: vi.fn((options, callback) => {
      if (callback) {
        callback();
      }
      return Promise.resolve();
    }),
    setOptions: vi.fn()
  }
};

// Reset all mocks before each test
beforeEach(() => {
  vi.clearAllMocks();
});

// Helper function to set mock return values for storage
export function setStorageMockData(data) {
  global.chrome.storage.local.get.mockImplementation((keys, callback) => {
    const result = typeof keys === 'string' ? { [keys]: data[keys] } : data;
    if (callback) {
      callback(result);
    }
    return Promise.resolve(result);
  });
}

// Helper function to clear storage mock data
export function clearStorageMock() {
  global.chrome.storage.local.get.mockImplementation((keys, callback) => {
    if (callback) {
      callback({});
    }
    return Promise.resolve({});
  });
}

// Helper function to get what was saved to storage
export function getStorageMockCalls() {
  return global.chrome.storage.local.set.mock.calls;
}

// Helper function to capture messages sent via runtime
export function getMessageMockCalls() {
  return global.chrome.runtime.sendMessage.mock.calls;
}
