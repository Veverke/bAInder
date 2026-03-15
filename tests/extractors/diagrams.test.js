/**
 * tests/extractors/diagrams.test.js — Task B.2
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { extractDiagrams } from '../../src/lib/entities/extractors/diagrams.js';

function mermaidMsg(source, index = 1) {
  return { role: 'assistant', index, content: '```mermaid\n' + source + '\n```' };
}

describe('extractDiagrams() — fenced Mermaid blocks', () => {
  it('flowchart LR block → diagramType "flowchart"', () => {
    const msgs = [mermaidMsg('flowchart LR\n  A --> B')];
    const result = extractDiagrams(msgs, null, 'chat-1');
    expect(result).toHaveLength(1);
    expect(result[0].diagramType).toBe('flowchart');
    expect(result[0].type).toBe('diagram');
  });

  it('sequenceDiagram block → diagramType "sequence"', () => {
    const msgs = [mermaidMsg('sequenceDiagram\n  A->>B: hello')];
    const result = extractDiagrams(msgs, null, 'chat-1');
    expect(result[0].diagramType).toBe('sequence');
  });

  it('graph TD block → diagramType "flowchart" (synonym)', () => {
    const msgs = [mermaidMsg('graph TD\n  A --> B')];
    const result = extractDiagrams(msgs, null, 'chat-1');
    expect(result[0].diagramType).toBe('flowchart');
  });

  it('unknown diagram keyword → diagramType "other"', () => {
    const msgs = [mermaidMsg('unknownDiagram\n  stuff')];
    const result = extractDiagrams(msgs, null, 'chat-1');
    expect(result[0].diagramType).toBe('other');
  });

  it('erDiagram block → diagramType "er"', () => {
    const msgs = [mermaidMsg('erDiagram\n  USER { int id }')];
    const result = extractDiagrams(msgs, null, 'chat-1');
    expect(result[0].diagramType).toBe('er');
  });

  it('thumbnailSvg is null at extraction time (deferred)', () => {
    const msgs = [mermaidMsg('flowchart LR\n  A --> B')];
    expect(extractDiagrams(msgs, null, 'chat-1')[0].thumbnailSvg).toBeNull();
  });

  it('source field contains the raw diagram text', () => {
    const src = 'flowchart LR\n  A --> B';
    const msgs = [mermaidMsg(src)];
    const result = extractDiagrams(msgs, null, 'chat-1');
    expect(result[0].source).toContain('A --> B');
  });

  it('user messages excluded', () => {
    const msgs = [{ role: 'user', index: 0, content: '```mermaid\nflowchart LR\n  A-->B\n```' }];
    expect(extractDiagrams(msgs, null, 'chat-1')).toHaveLength(0);
  });

  it('empty messages array returns empty result', () => {
    expect(extractDiagrams([], null, 'chat-1')).toHaveLength(0);
  });

  it('chatId is stamped on the entity', () => {
    const msgs = [mermaidMsg('flowchart LR\n  A-->B')];
    expect(extractDiagrams(msgs, null, 'chat-xyz')[0].chatId).toBe('chat-xyz');
  });

  it('multiple mermaid blocks → multiple entities', () => {
    const content =
      '```mermaid\nflowchart LR\n  A-->B\n```\n\n```mermaid\nsequenceDiagram\n  A->>B: hi\n```';
    const msgs = [{ role: 'assistant', index: 1, content }];
    expect(extractDiagrams(msgs, null, 'chat-1')).toHaveLength(2);
  });
});

describe('extractDiagrams() — DOM SVG strategy', () => {
  let doc;

  beforeEach(() => {
    const parser = new DOMParser();
    doc = parser.parseFromString(
      '<html><body>' +
      '<div class="mermaid"><svg id="svg1"><rect/></svg></div>' +
      '</body></html>',
      'text/html'
    );
  });

  it('DOM strategy: <svg> inside .mermaid → thumbnailSvg populated', () => {
    const msgs = [{ role: 'assistant', index: 1, content: 'see diagram above' }];
    const result = extractDiagrams(msgs, doc, 'chat-1');
    expect(result).toHaveLength(1);
    expect(result[0].thumbnailSvg).toContain('<svg');
  });

  it('DOM strategy: <svg> inside [data-diagram] → thumbnailSvg populated', () => {
    const parser = new DOMParser();
    const d = parser.parseFromString(
      '<html><body><div data-diagram="true"><svg id="diag"><circle/></svg></div></body></html>',
      'text/html'
    );
    const msgs = [{ role: 'assistant', index: 1, content: '' }];
    const result = extractDiagrams(msgs, d, 'chat-1');
    expect(result).toHaveLength(1);
    expect(result[0].thumbnailSvg).toContain('<svg');
  });

  it('null doc does not throw and returns only text results', () => {
    const msgs = [{ role: 'assistant', index: 1, content: 'no mermaid blocks here' }];
    expect(() => extractDiagrams(msgs, null, 'chat-1')).not.toThrow();
    expect(extractDiagrams(msgs, null, 'chat-1')).toHaveLength(0);
  });
});

describe('extractDiagrams() — Strategy 3: non-mermaid fence with Mermaid keyword content', () => {
  it('plain code fence starting with sequenceDiagram → diagram entity', () => {
    const content = '```\nsequenceDiagram\n  A->>B: hello\n```';
    const msgs = [{ role: 'assistant', index: 1, content }];
    const result = extractDiagrams(msgs, null, 'chat-1');
    expect(result).toHaveLength(1);
    expect(result[0].diagramType).toBe('sequence');
    expect(result[0].type).toBe('diagram');
  });

  it('wrong language tag (e.g. "diagram") with sequenceDiagram body → diagram entity', () => {
    const content = '```diagram\nsequenceDiagram\n  Actor A->>Actor B: action\n```';
    const msgs = [{ role: 'assistant', index: 1, content }];
    const result = extractDiagrams(msgs, null, 'chat-1');
    expect(result).toHaveLength(1);
    expect(result[0].diagramType).toBe('sequence');
  });

  it('plain fence with flowchart body → diagramType "flowchart"', () => {
    const content = '```\nflowchart LR\n  A --> B\n```';
    const msgs = [{ role: 'assistant', index: 1, content }];
    const result = extractDiagrams(msgs, null, 'chat-1');
    expect(result).toHaveLength(1);
    expect(result[0].diagramType).toBe('flowchart');
  });

  it('plain fence with erDiagram body → diagramType "er"', () => {
    const content = '```\nerDiagram\n  USER { int id }\n```';
    const msgs = [{ role: 'assistant', index: 1, content }];
    const result = extractDiagrams(msgs, null, 'chat-1');
    expect(result[0].diagramType).toBe('er');
  });

  it('strategy 3 block not double-counted with strategy 1', () => {
    // One explicit mermaid fence + one plain fence with mermaid content
    const content =
      '```mermaid\nflowchart LR\n  A-->B\n```\n\n```\nsequenceDiagram\n  A->>B: hi\n```';
    const msgs = [{ role: 'assistant', index: 1, content }];
    const result = extractDiagrams(msgs, null, 'chat-1');
    expect(result).toHaveLength(2);
  });

  it('typescript code block with regular TS code → NOT extracted as diagram', () => {
    const content = '```typescript\nconst x: number = 1;\n```';
    const msgs = [{ role: 'assistant', index: 1, content }];
    expect(extractDiagrams(msgs, null, 'chat-1')).toHaveLength(0);
  });
});

describe('extractDiagrams() — Strategy 4: prose diagram inside a code fence', () => {
  it('code fence with "Sequence Diagram:" heading + 2 arrow lines → diagram entity', () => {
    const body =
      'Sequence Diagram: User Login\n' +
      'Actors:\n- User\n- Server\n' +
      'Flow:\n' +
      '1. User → Server: POST /login\n' +
      '2. Server → User: 200 OK\n';
    const content = '```\n' + body + '```';
    const msgs = [{ role: 'assistant', index: 1, content }];
    const result = extractDiagrams(msgs, null, 'chat-1');
    expect(result).toHaveLength(1);
    expect(result[0].diagramType).toBe('sequence');
    expect(result[0].type).toBe('diagram');
  });

  it('code fence with "Flow Diagram:" heading + 2 arrow lines → diagramType "flowchart"', () => {
    const body =
      'Flow Diagram: Data Pipeline\n' +
      '1. Ingestor -> Transformer: raw data\n' +
      '2. Transformer -> Store: cleaned data\n';
    const content = '```text\n' + body + '```';
    const msgs = [{ role: 'assistant', index: 1, content }];
    const result = extractDiagrams(msgs, null, 'chat-1');
    expect(result).toHaveLength(1);
    expect(result[0].diagramType).toBe('flowchart');
  });

  it('prose with "diagram" heading but only 1 arrow line → NOT extracted', () => {
    const body = 'Sequence Diagram: short\n1. A → B: hello\n';
    const content = '```\n' + body + '```';
    const msgs = [{ role: 'assistant', index: 1, content }];
    expect(extractDiagrams(msgs, null, 'chat-1')).toHaveLength(0);
  });

  it('free prose (no code fence) with sequence diagram structure → NOT extracted', () => {
    // This is the key false-positive guard: no ```...``` fence
    const msgs = [{
      role: 'assistant',
      index: 1,
      content:
        'Sequence Diagram: Auth\nActors:\n- User\n- Server\nFlow:\n' +
        '1. User → Server: login\n2. Server → User: token\n',
    }];
    expect(extractDiagrams(msgs, null, 'chat-1')).toHaveLength(0);
  });
});
