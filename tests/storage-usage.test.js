/**
 * Tests for src/sidepanel/features/storage-usage.js
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  _setContext,
  updateStorageUsage,
} from '../src/sidepanel/features/storage-usage.js';
import { elements } from '../src/sidepanel/app-context.js';

// ── Module mocks ──────────────────────────────────────────────────────────────

// ── Module mocks ──────────────────────────────────────────────────────────────

const { mockGetFormatted, mockIsApproaching } = vi.hoisted(() => ({
  mockGetFormatted:  vi.fn().mockResolvedValue('1.2 MB / 5 MB'),
  mockIsApproaching: vi.fn().mockResolvedValue(false),
}));

vi.mock('../src/lib/storage.js', () => {
  class StorageUsageTracker {
    getFormattedUsage  = mockGetFormatted;
    isApproachingQuota = mockIsApproaching;
  }
  return { StorageUsageTracker };
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeStorageEl() {
  const el = document.createElement('span');
  el.id = 'storageUsage';
  // Wrap in a .storage-info container so classList.toggle works
  const container = document.createElement('div');
  container.className = 'storage-info';
  container.appendChild(el);
  document.body.appendChild(container);
  elements.storageUsage = el;
  return { el, container };
}

beforeEach(() => {
  document.body.innerHTML = '';
  _setContext({ storage: {} });
});

afterEach(() => {
  elements.storageUsage = null;
  document.body.innerHTML = '';
  vi.clearAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────
// updateStorageUsage()
// ─────────────────────────────────────────────────────────────────────────────

describe('updateStorageUsage()', () => {
  it('displays formatted usage in the storageUsage element', async () => {
    const { el } = makeStorageEl();
    await updateStorageUsage();
    expect(el.textContent).toBe('1.2 MB / 5 MB');
  });

  it('does not add warn class when isApproachingQuota returns false', async () => {
    const { container } = makeStorageEl();
    await updateStorageUsage();
    expect(container.classList.contains('storage-info--warn')).toBe(false);
  });

  it('adds warn class when isApproachingQuota returns true', async () => {
    mockIsApproaching.mockResolvedValueOnce(true);
    const { container } = makeStorageEl();
    await updateStorageUsage();
    expect(container.classList.contains('storage-info--warn')).toBe(true);
  });

  it('sets "Unknown" text when StorageUsageTracker throws', async () => {
    mockGetFormatted.mockRejectedValueOnce(new Error('Quota API error'));
    const { el } = makeStorageEl();
    await updateStorageUsage();
    expect(el.textContent).toBe('Unknown');
  });
});
