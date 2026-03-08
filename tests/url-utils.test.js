import { describe, it, expect } from 'vitest';
import { isSpecificChatUrl } from '../src/lib/utils/url-utils.js';

describe('isSpecificChatUrl()', () => {
  // ── Non-Copilot platforms ────────────────────────────────────────────────
  // ChatGPT, Claude, and Gemini embed the conversation ID in the path, so any
  // URL from those hosts is specific.
  describe('non-Copilot platforms — always specific', () => {
    it('treats a ChatGPT conversation URL as specific', () => {
      expect(isSpecificChatUrl('https://chat.openai.com/c/abc123')).toBe(true);
    });

    it('treats a Claude.ai conversation URL as specific', () => {
      expect(isSpecificChatUrl('https://claude.ai/chat/xyz-789')).toBe(true);
    });

    it('treats a Gemini conversation URL as specific', () => {
      expect(isSpecificChatUrl('https://gemini.google.com/app/abc')).toBe(true);
    });
  });

  // ── Copilot SPA — generic landing pages (no conversation param) ──────────
  // These URLs are the same for every conversation; dedup must NOT trigger.
  describe('Copilot SPA — generic base URLs are NOT specific', () => {
    it('returns false for the bare m365 /chat page', () => {
      expect(isSpecificChatUrl('https://m365.cloud.microsoft/chat')).toBe(false);
    });

    it('returns false for m365 /chat with trailing slash', () => {
      expect(isSpecificChatUrl('https://m365.cloud.microsoft/chat/')).toBe(false);
    });

    it('returns false for m365 root with no params', () => {
      expect(isSpecificChatUrl('https://m365.cloud.microsoft/')).toBe(false);
    });

    it('returns false for copilot.microsoft.com root with no params', () => {
      expect(isSpecificChatUrl('https://copilot.microsoft.com/')).toBe(false);
    });

    it('returns false for copilot.microsoft.com/chat with no params', () => {
      expect(isSpecificChatUrl('https://copilot.microsoft.com/chat')).toBe(false);
    });

    it('returns false for unrelated query params (no conversation ID)', () => {
      expect(isSpecificChatUrl('https://m365.cloud.microsoft/chat?locale=en-US')).toBe(false);
    });
  });

  // ── Copilot SPA — conversation-specific URLs ─────────────────────────────
  // These have a recognised conversation-ID query param and SHOULD dedup.
  describe('Copilot SPA — conversation-specific URLs ARE specific', () => {
    it('returns true when entityid param is present (m365)', () => {
      expect(isSpecificChatUrl('https://m365.cloud.microsoft/chat?entityid=abc123')).toBe(true);
    });

    it('returns true when entityid is mixed-case', () => {
      expect(isSpecificChatUrl('https://m365.cloud.microsoft/chat?EntityId=abc')).toBe(true);
    });

    it('returns true when ThreadId param is present', () => {
      expect(isSpecificChatUrl('https://m365.cloud.microsoft/chat?ThreadId=xyz')).toBe(true);
    });

    it('returns true when conversationId is present', () => {
      expect(isSpecificChatUrl('https://copilot.microsoft.com/chat?conversationId=foo')).toBe(true);
    });

    it('returns true when chatId is present', () => {
      expect(isSpecificChatUrl('https://m365.cloud.microsoft/chat?chatId=bar')).toBe(true);
    });

    it('returns true when threadId (lowercase) is among multiple params', () => {
      expect(isSpecificChatUrl('https://m365.cloud.microsoft/chat?locale=en&threadId=abc')).toBe(true);
    });

    it('returns true when entityid is not the first param', () => {
      expect(isSpecificChatUrl('https://m365.cloud.microsoft/chat?a=1&entityid=xyz&b=2')).toBe(true);
    });
  });

  // ── Edge cases ────────────────────────────────────────────────────────────
  describe('edge cases', () => {
    it('returns false for an empty string', () => {
      expect(isSpecificChatUrl('')).toBe(false);
    });

    it('returns false for null', () => {
      expect(isSpecificChatUrl(null)).toBe(false);
    });

    it('returns false for undefined', () => {
      expect(isSpecificChatUrl(undefined)).toBe(false);
    });

    it('returns false for a malformed / non-URL string', () => {
      expect(isSpecificChatUrl('not-a-url')).toBe(false);
    });

    it('returns false for a relative URL', () => {
      expect(isSpecificChatUrl('/chat?entityid=abc')).toBe(false);
    });
  });
});
