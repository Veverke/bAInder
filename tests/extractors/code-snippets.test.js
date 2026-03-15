/**
 * tests/extractors/code-snippets.test.js — Task B.1
 */
import { describe, it, expect } from 'vitest';
import { extractCodeSnippets } from '../../src/lib/entities/extractors/code-snippets.js';

describe('extractCodeSnippets()', () => {
  it('single JS block → 1 entity with language "javascript"', () => {
    const msgs = [{
      role: 'assistant',
      index: 1,
      content: '```javascript\nconsole.log("hi");\n```',
    }];
    const result = extractCodeSnippets(msgs, null, 'chat-1');
    expect(result).toHaveLength(1);
    expect(result[0].language).toBe('javascript');
    expect(result[0].type).toBe('code');
  });

  it('two blocks in one message → 2 entities with same messageIndex', () => {
    const content =
      '```python\nprint("hello")\n```\n\nSome text.\n\n```bash\necho hello\n```';
    const msgs = [{ role: 'assistant', index: 2, content }];
    const result = extractCodeSnippets(msgs, null, 'chat-1');
    expect(result).toHaveLength(2);
    expect(result[0].messageIndex).toBe(2);
    expect(result[1].messageIndex).toBe(2);
  });

  it('fenced block with no language tag → language "text"', () => {
    const msgs = [{ role: 'assistant', index: 1, content: '```\nhello world\n```' }];
    const result = extractCodeSnippets(msgs, null, 'chat-1');
    expect(result).toHaveLength(1);
    expect(result[0].language).toBe('text');
  });

  it('user-role messages excluded', () => {
    const msgs = [{
      role: 'user',
      index: 0,
      content: '```javascript\nconsole.log("hi");\n```',
    }];
    expect(extractCodeSnippets(msgs, null, 'chat-1')).toHaveLength(0);
  });

  it('model role treated as assistant', () => {
    const msgs = [{ role: 'model', index: 1, content: '```js\nlet x = 1;\n```' }];
    expect(extractCodeSnippets(msgs, null, 'chat-1')).toHaveLength(1);
  });

  it('empty messages array returns empty result', () => {
    expect(extractCodeSnippets([], null, 'chat-1')).toHaveLength(0);
  });

  it('lineCount is correct for multi-line block', () => {
    const msgs = [{
      role: 'assistant',
      index: 1,
      content: '```python\nline1\nline2\nline3\n```',
    }];
    const result = extractCodeSnippets(msgs, null, 'chat-1');
    expect(result[0].lineCount).toBe(3);
  });

  it('code field contains the raw block body', () => {
    const msgs = [{
      role: 'assistant',
      index: 1,
      content: '```js\nconst a = 1;\n```',
    }];
    const result = extractCodeSnippets(msgs, null, 'chat-1');
    expect(result[0].code).toContain('const a = 1;');
  });

  it('chatId is stamped on each entity', () => {
    const msgs = [{ role: 'assistant', index: 1, content: '```js\nlet x;\n```' }];
    const result = extractCodeSnippets(msgs, null, 'chat-xyz');
    expect(result[0].chatId).toBe('chat-xyz');
  });

  it('entities have a unique non-empty id', () => {
    const content = '```js\nlet a;\n```\n\n```ts\nlet b;\n```';
    const msgs = [{ role: 'assistant', index: 1, content }];
    const result = extractCodeSnippets(msgs, null, 'chat-1');
    expect(result[0].id).toBeTruthy();
    expect(result[1].id).toBeTruthy();
    expect(result[0].id).not.toBe(result[1].id);
  });

  it('multiple assistant messages are all scanned', () => {
    const msgs = [
      { role: 'assistant', index: 1, content: '```py\nprint(1)\n```' },
      { role: 'assistant', index: 3, content: '```py\nprint(2)\n```' },
    ];
    const result = extractCodeSnippets(msgs, null, 'chat-1');
    expect(result).toHaveLength(2);
  });
});

describe('extractCodeSnippets() — diagram skip logic', () => {
  it('mermaid fence skipped — no code entity created', () => {
    const content = '```mermaid\nflowchart LR\n  A --> B\n```';
    const msgs = [{ role: 'assistant', index: 1, content }];
    expect(extractCodeSnippets(msgs, null, 'chat-1')).toHaveLength(0);
  });

  it('plain fence with sequenceDiagram body skipped', () => {
    const content = '```\nsequenceDiagram\n  A->>B: hello\n```';
    const msgs = [{ role: 'assistant', index: 1, content }];
    expect(extractCodeSnippets(msgs, null, 'chat-1')).toHaveLength(0);
  });

  it('wrong-tag fence with flowchart body skipped', () => {
    const content = '```diagram\nflowchart LR\n  A --> B\n```';
    const msgs = [{ role: 'assistant', index: 1, content }];
    expect(extractCodeSnippets(msgs, null, 'chat-1')).toHaveLength(0);
  });

  it('prose diagram fence skipped (heading + 2 arrow lines)', () => {
    const body =
      'Sequence Diagram: Auth Flow\n' +
      '1. Client → Server: request\n' +
      '2. Server → Client: response\n';
    const content = '```\n' + body + '```';
    const msgs = [{ role: 'assistant', index: 1, content }];
    expect(extractCodeSnippets(msgs, null, 'chat-1')).toHaveLength(0);
  });

  it('regular code block alongside a mermaid block — only regular block extracted', () => {
    const content =
      '```mermaid\nflowchart LR\n  A-->B\n```\n\n' +
      '```javascript\nconsole.log("hi");\n```';
    const msgs = [{ role: 'assistant', index: 1, content }];
    const result = extractCodeSnippets(msgs, null, 'chat-1');
    expect(result).toHaveLength(1);
    expect(result[0].language).toBe('javascript');
  });
});
