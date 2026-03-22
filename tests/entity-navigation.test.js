import { describe, it, expect, vi } from 'vitest';
import { openChatAtMessage } from '../src/lib/entities/entity-navigation.js';

// Helper: build a minimal entity with just the fields openChatAtMessage needs.
function entity(role, roleOrdinal) {
  return { role, roleOrdinal };
}

describe('openChatAtMessage()', () => {
  it('calls onChatClick with the correct chatId', () => {
    const onChatClick = vi.fn();
    openChatAtMessage('chat-42', entity('user', 1), { onChatClick });
    expect(onChatClick).toHaveBeenCalledWith('chat-42', expect.any(Object));
  });

  it('constructs #p<roleOrdinal> for user-role entities', () => {
    const onChatClick = vi.fn();
    openChatAtMessage('chat-1', entity('user', 3), { onChatClick });
    expect(onChatClick).toHaveBeenCalledWith('chat-1', expect.objectContaining({ scrollToAnchor: '#p3' }));
  });

  it('constructs #r<roleOrdinal> for assistant-role entities', () => {
    const onChatClick = vi.fn();
    openChatAtMessage('chat-1', entity('assistant', 2), { onChatClick });
    expect(onChatClick).toHaveBeenCalledWith('chat-1', expect.objectContaining({ scrollToAnchor: '#r2' }));
  });

  it('constructs #r<roleOrdinal> for model-role entities (treated as assistant)', () => {
    const onChatClick = vi.fn();
    openChatAtMessage('chat-1', entity('model', 1), { onChatClick });
    expect(onChatClick).toHaveBeenCalledWith('chat-1', expect.objectContaining({ scrollToAnchor: '#r1' }));
  });

  it('roleOrdinal 1, user role → #p1', () => {
    const onChatClick = vi.fn();
    openChatAtMessage('c', entity('user', 1), { onChatClick });
    expect(onChatClick).toHaveBeenCalledWith('c', expect.objectContaining({ scrollToAnchor: '#p1' }));
  });

  it('roleOrdinal 1, assistant role → #r1', () => {
    const onChatClick = vi.fn();
    openChatAtMessage('c', entity('assistant', 1), { onChatClick });
    expect(onChatClick).toHaveBeenCalledWith('c', expect.objectContaining({ scrollToAnchor: '#r1' }));
  });

  it('roleOrdinal 2, assistant role → #r2', () => {
    const onChatClick = vi.fn();
    openChatAtMessage('c', entity('assistant', 2), { onChatClick });
    expect(onChatClick).toHaveBeenCalledWith('c', expect.objectContaining({ scrollToAnchor: '#r2' }));
  });

  it('falls back to #r1 / #p1 when roleOrdinal is missing (old entities)', () => {
    const onChatClick = vi.fn();
    openChatAtMessage('c', { role: 'assistant' }, { onChatClick });
    expect(onChatClick).toHaveBeenCalledWith('c', expect.objectContaining({ scrollToAnchor: '#r1' }));
  });

  it('model role without roleOrdinal falls back to #r1', () => {
    const onChatClick = vi.fn();
    openChatAtMessage('c', { role: 'model' }, { onChatClick });
    expect(onChatClick).toHaveBeenCalledWith('c', expect.objectContaining({ scrollToAnchor: '#r1' }));
  });

  it('passes snippetHint derived from code entity first line', () => {
    const onChatClick = vi.fn();
    const codeEntity = { role: 'assistant', roleOrdinal: 1, type: 'code', code: 'const x = 1;\nconst y = 2;' };
    openChatAtMessage('c', codeEntity, { onChatClick });
    expect(onChatClick).toHaveBeenCalledWith('c', expect.objectContaining({ snippetHint: 'const x = 1;' }));
  });

  it('passes turn:self snippetHint for prompt entities', () => {
    const onChatClick = vi.fn();
    const promptEntity = { role: 'user', roleOrdinal: 1, type: 'prompt', text: 'hello world' };
    openChatAtMessage('c', promptEntity, { onChatClick });
    expect(onChatClick).toHaveBeenCalledWith('c', expect.objectContaining({ snippetHint: 'turn:self' }));
  });

  it('passes snippetHint url for citation entities', () => {
    const onChatClick = vi.fn();
    const citationEntity = { role: 'assistant', roleOrdinal: 1, type: 'citation', url: 'https://example.com' };
    openChatAtMessage('c', citationEntity, { onChatClick });
    expect(onChatClick).toHaveBeenCalledWith('c', expect.objectContaining({ snippetHint: 'https://example.com' }));
  });

  it('passes snippetHint first line of source for diagram entities', () => {
    const onChatClick = vi.fn();
    const diagramEntity = {
      role: 'assistant', roleOrdinal: 2, type: 'diagram',
      source: 'sequenceDiagram\n  A->>B: hello',
    };
    openChatAtMessage('c', diagramEntity, { onChatClick });
    expect(onChatClick).toHaveBeenCalledWith('c', expect.objectContaining({ snippetHint: 'sequenceDiagram' }));
  });

  it('passes null snippetHint for diagram with empty source', () => {
    const onChatClick = vi.fn();
    const diagramEntity = { role: 'assistant', roleOrdinal: 1, type: 'diagram', source: '' };
    openChatAtMessage('c', diagramEntity, { onChatClick });
    expect(onChatClick).toHaveBeenCalledWith('c', expect.objectContaining({ snippetHint: null }));
  });

  it('passes filename as snippetHint for attachment entities', () => {
    const onChatClick = vi.fn();
    const attachmentEntity = { role: 'assistant', roleOrdinal: 1, type: 'attachment', filename: 'report.pdf' };
    openChatAtMessage('c', attachmentEntity, { onChatClick });
    expect(onChatClick).toHaveBeenCalledWith('c', expect.objectContaining({ snippetHint: 'report.pdf' }));
  });

  it('passes null snippetHint for attachment without filename', () => {
    const onChatClick = vi.fn();
    const attachmentEntity = { role: 'assistant', roleOrdinal: 1, type: 'attachment' };
    openChatAtMessage('c', attachmentEntity, { onChatClick });
    expect(onChatClick).toHaveBeenCalledWith('c', expect.objectContaining({ snippetHint: null }));
  });

  it('passes pipe-delimited header row as snippetHint for table entities', () => {
    const onChatClick = vi.fn();
    const tableEntity = {
      role: 'assistant', roleOrdinal: 1, type: 'table',
      headers: ['Possible next token', 'Probability'],
      rows: [['mat', '0.72'], ['floor', '0.10']],
      rowCount: 2,
    };
    openChatAtMessage('c', tableEntity, { onChatClick });
    expect(onChatClick).toHaveBeenCalledWith('c', expect.objectContaining({
      snippetHint: '| Possible next token | Probability |',
    }));
  });

  it('passes null snippetHint for table entity with no headers', () => {
    const onChatClick = vi.fn();
    const tableEntity = { role: 'assistant', roleOrdinal: 1, type: 'table', headers: [] };
    openChatAtMessage('c', tableEntity, { onChatClick });
    expect(onChatClick).toHaveBeenCalledWith('c', expect.objectContaining({ snippetHint: null }));
  });

  it('passes altText as snippetHint for image entities with alt text', () => {
    const onChatClick = vi.fn();
    const imageEntity = { role: 'assistant', roleOrdinal: 1, type: 'image', altText: 'A bar chart', src: 'https://example.com/img.png' };
    openChatAtMessage('c', imageEntity, { onChatClick });
    expect(onChatClick).toHaveBeenCalledWith('c', expect.objectContaining({ snippetHint: 'A bar chart' }));
  });

  it('passes turn:self as snippetHint for image entities without alt text', () => {
    const onChatClick = vi.fn();
    const imageEntity = { role: 'assistant', roleOrdinal: 1, type: 'image', src: 'https://example.com/img.png' };
    openChatAtMessage('c', imageEntity, { onChatClick });
    expect(onChatClick).toHaveBeenCalledWith('c', expect.objectContaining({ snippetHint: 'turn:self' }));
  });

  it('passes turn:self as snippetHint for toolCall entities', () => {
    const onChatClick = vi.fn();
    const toolCallEntity = { role: 'assistant', roleOrdinal: 1, type: 'toolCall', tool: 'web_search' };
    openChatAtMessage('c', toolCallEntity, { onChatClick });
    expect(onChatClick).toHaveBeenCalledWith('c', expect.objectContaining({ snippetHint: 'turn:self' }));
  });

  it('passes turn:self as snippetHint for artifact entities', () => {
    const onChatClick = vi.fn();
    const artifactEntity = { role: 'assistant', roleOrdinal: 1, type: 'artifact', title: 'My Component' };
    openChatAtMessage('c', artifactEntity, { onChatClick });
    expect(onChatClick).toHaveBeenCalledWith('c', expect.objectContaining({ snippetHint: 'turn:self' }));
  });
});
