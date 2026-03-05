/**
 * Tests for src/sidepanel/services/message-validator.js
 *
 * Covers the two-layer defence added for security issue 7.2:
 *   1. Sender identity  — messages from outside the extension are rejected
 *   2. Payload schema   — messages missing required fields are rejected
 */

import { describe, it, expect } from 'vitest';
import { validateRuntimeMessage } from '../src/sidepanel/services/message-validator.js';

const EXT_ID   = 'abcdefghijklmnoabcdefghijklmno12'; // fake extension ID
const VALID_SENDER     = { id: EXT_ID };
const EXTERNAL_SENDER  = { id: 'another-extension-id' };
const NO_ID_SENDER     = { id: undefined };

// ---------------------------------------------------------------------------
// Sender identity checks
// ---------------------------------------------------------------------------

describe('validateRuntimeMessage() — sender identity', () => {
  it('accepts a message from the same extension', () => {
    const result = validateRuntimeMessage(
      { type: 'SELECT_CHAT', chatId: 'chat_123' },
      VALID_SENDER,
      EXT_ID
    );
    expect(result.ok).toBe(true);
  });

  it('rejects a message from a different extension ID', () => {
    const result = validateRuntimeMessage(
      { type: 'SELECT_CHAT', chatId: 'chat_123' },
      EXTERNAL_SENDER,
      EXT_ID
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/untrusted sender/);
  });

  it('rejects a message with no sender ID', () => {
    const result = validateRuntimeMessage(
      { type: 'SELECT_CHAT', chatId: 'chat_123' },
      NO_ID_SENDER,
      EXT_ID
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/untrusted sender/);
  });

  it('rejects when sender is null', () => {
    const result = validateRuntimeMessage(
      { type: 'SELECT_CHAT', chatId: 'chat_123' },
      null,
      EXT_ID
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/untrusted sender/);
  });

  it('rejects when sender is undefined', () => {
    const result = validateRuntimeMessage(
      { type: 'SELECT_CHAT', chatId: 'chat_123' },
      undefined,
      EXT_ID
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/untrusted sender/);
  });
});

// ---------------------------------------------------------------------------
// Top-level message shape checks
// ---------------------------------------------------------------------------

describe('validateRuntimeMessage() — message shape', () => {
  it('rejects null message', () => {
    const result = validateRuntimeMessage(null, VALID_SENDER, EXT_ID);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/invalid message shape/);
  });

  it('rejects a string instead of an object', () => {
    const result = validateRuntimeMessage('CHAT_SAVED', VALID_SENDER, EXT_ID);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/invalid message shape/);
  });

  it('rejects a message with a missing type field', () => {
    const result = validateRuntimeMessage({ data: {} }, VALID_SENDER, EXT_ID);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/invalid message shape/);
  });

  it('rejects a message with a numeric type', () => {
    const result = validateRuntimeMessage({ type: 42 }, VALID_SENDER, EXT_ID);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/invalid message shape/);
  });

  it('accepts an unknown type with no further payload requirements', () => {
    // Unknown types are not rejected — the listener simply won't match any
    // handler, but the validator does not block them
    const result = validateRuntimeMessage(
      { type: 'UNKNOWN_FUTURE_TYPE' },
      VALID_SENDER,
      EXT_ID
    );
    expect(result.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// CHAT_SAVED payload validation
// ---------------------------------------------------------------------------

describe('validateRuntimeMessage() — CHAT_SAVED payload', () => {
  const validChatSaved = {
    type: 'CHAT_SAVED',
    data: { id: '1234-abcd', title: 'My Chat', url: 'https://chatgpt.com/', source: 'chatgpt' },
  };

  it('accepts a well-formed CHAT_SAVED message', () => {
    expect(validateRuntimeMessage(validChatSaved, VALID_SENDER, EXT_ID).ok).toBe(true);
  });

  it('rejects CHAT_SAVED when data is missing', () => {
    const result = validateRuntimeMessage({ type: 'CHAT_SAVED' }, VALID_SENDER, EXT_ID);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/CHAT_SAVED/);
  });

  it('rejects CHAT_SAVED when data is null', () => {
    const result = validateRuntimeMessage({ type: 'CHAT_SAVED', data: null }, VALID_SENDER, EXT_ID);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/data must be an object/);
  });

  it('rejects CHAT_SAVED when data is a string', () => {
    const result = validateRuntimeMessage({ type: 'CHAT_SAVED', data: 'bad' }, VALID_SENDER, EXT_ID);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/data must be an object/);
  });

  it('rejects CHAT_SAVED when data.id is missing', () => {
    const result = validateRuntimeMessage(
      { type: 'CHAT_SAVED', data: { title: 'Chat' } },
      VALID_SENDER, EXT_ID
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/data\.id must be a non-empty string/);
  });

  it('rejects CHAT_SAVED when data.id is empty string', () => {
    const result = validateRuntimeMessage(
      { type: 'CHAT_SAVED', data: { id: '  ', title: 'Chat' } },
      VALID_SENDER, EXT_ID
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/data\.id/);
  });

  it('rejects CHAT_SAVED when data.title is missing', () => {
    const result = validateRuntimeMessage(
      { type: 'CHAT_SAVED', data: { id: 'abc123' } },
      VALID_SENDER, EXT_ID
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/data\.title must be a non-empty string/);
  });

  it('rejects CHAT_SAVED when data.title is whitespace only', () => {
    const result = validateRuntimeMessage(
      { type: 'CHAT_SAVED', data: { id: 'abc123', title: '   ' } },
      VALID_SENDER, EXT_ID
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/data\.title/);
  });
});

// ---------------------------------------------------------------------------
// SELECT_CHAT payload validation
// ---------------------------------------------------------------------------

describe('validateRuntimeMessage() — SELECT_CHAT payload', () => {
  it('accepts a well-formed SELECT_CHAT message', () => {
    const result = validateRuntimeMessage(
      { type: 'SELECT_CHAT', chatId: 'chat_abc123' },
      VALID_SENDER, EXT_ID
    );
    expect(result.ok).toBe(true);
  });

  it('rejects SELECT_CHAT with missing chatId', () => {
    const result = validateRuntimeMessage(
      { type: 'SELECT_CHAT' },
      VALID_SENDER, EXT_ID
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/chatId must be a non-empty string/);
  });

  it('rejects SELECT_CHAT with empty chatId', () => {
    const result = validateRuntimeMessage(
      { type: 'SELECT_CHAT', chatId: '' },
      VALID_SENDER, EXT_ID
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/chatId/);
  });

  it('rejects SELECT_CHAT with whitespace-only chatId', () => {
    const result = validateRuntimeMessage(
      { type: 'SELECT_CHAT', chatId: '   ' },
      VALID_SENDER, EXT_ID
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/chatId/);
  });

  it('rejects SELECT_CHAT with numeric chatId', () => {
    const result = validateRuntimeMessage(
      { type: 'SELECT_CHAT', chatId: 42 },
      VALID_SENDER, EXT_ID
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/chatId/);
  });
});
