/**
 * tests/extractors/tables.test.js — Task A.3
 */
import { describe, it, expect } from 'vitest';
import { extractTables } from '../../src/lib/entities/extractors/tables.js';

const TABLE_3COL = `| Name | Age | City |
| --- | --- | --- |
| Alice | 30 | London |
| Bob | 25 | Paris |
| Carol | 35 | Berlin |
| Dave | 28 | Tokyo |`;

describe('extractTables()', () => {
  it('3-column, 4-row table → 1 entity with correct headers and rows', () => {
    const msgs = [{ role: 'assistant', index: 1, content: TABLE_3COL }];
    const result = extractTables(msgs, null, 'chat-1');
    expect(result).toHaveLength(1);
    expect(result[0].headers).toEqual(['Name', 'Age', 'City']);
    expect(result[0].rows).toHaveLength(4);
    expect(result[0].rows[0]).toEqual(['Alice', '30', 'London']);
    expect(result[0].rowCount).toBe(4);
  });

  it('two separate tables in one message → 2 entities', () => {
    const content = `${TABLE_3COL}\n\nSome text in between.\n\n| A | B |\n| --- | --- |\n| 1 | 2 |`;
    const msgs = [{ role: 'assistant', index: 1, content }];
    const result = extractTables(msgs, null, 'chat-1');
    expect(result).toHaveLength(2);
  });

  it('text with | characters but no valid separator row → no entity', () => {
    const msgs = [{
      role: 'assistant',
      index: 1,
      content: '| This is just | a sentence | with pipes',
    }];
    expect(extractTables(msgs, null, 'chat-1')).toHaveLength(0);
  });

  it('table with trailing pipe on header is parsed correctly', () => {
    const content = `| Col1 | Col2 |\n| --- | --- |\n| A | B |`;
    const msgs = [{ role: 'assistant', index: 1, content }];
    const result = extractTables(msgs, null, 'chat-1');
    expect(result).toHaveLength(1);
    expect(result[0].headers).toEqual(['Col1', 'Col2']);
  });

  it('user messages are excluded', () => {
    const msgs = [{ role: 'user', index: 0, content: TABLE_3COL }];
    expect(extractTables(msgs, null, 'chat-1')).toHaveLength(0);
  });

  it('model role is treated as assistant', () => {
    const msgs = [{ role: 'model', index: 1, content: TABLE_3COL }];
    expect(extractTables(msgs, null, 'chat-1')).toHaveLength(1);
  });

  it('empty messages array returns empty result', () => {
    expect(extractTables([], null, 'chat-1')).toHaveLength(0);
  });

  it('entity type is "table"', () => {
    const msgs = [{ role: 'assistant', index: 1, content: TABLE_3COL }];
    expect(extractTables(msgs, null, 'chat-1')[0].type).toBe('table');
  });

  it('chatId is stamped on each entity', () => {
    const msgs = [{ role: 'assistant', index: 1, content: TABLE_3COL }];
    extractTables(msgs, null, 'chat-xyz').forEach(e => {
      expect(e.chatId).toBe('chat-xyz');
    });
  });

  it('uses m.index for messageIndex when available', () => {
    const msgs = [{ role: 'assistant', index: 5, content: TABLE_3COL }];
    expect(extractTables(msgs, null, 'chat-1')[0].messageIndex).toBe(5);
  });
});
