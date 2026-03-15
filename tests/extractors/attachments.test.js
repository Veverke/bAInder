/**
 * tests/extractors/attachments.test.js — Task C.2
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { extractAttachments } from '../../src/lib/entities/extractors/attachments.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function msg(overrides = {}) {
  return { role: 'user', index: 0, content: '', ...overrides };
}

// ---------------------------------------------------------------------------
// Structured strategy — content.parts
// ---------------------------------------------------------------------------

describe('extractAttachments() — structured content.parts', () => {
  it('message with file_reference part → 1 attachment entity', () => {
    const messages = [msg({
      index: 1,
      content: [{ type: 'file_reference', filename: 'report.pdf', mime_type: 'application/pdf' }],
    })];
    const result = extractAttachments(messages, null, 'chat-1');
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('attachment');
    expect(result[0].filename).toBe('report.pdf');
    expect(result[0].mimeType).toBe('application/pdf');
  });

  it('message with image_file part → 1 attachment entity', () => {
    const messages = [msg({
      index: 2,
      content: [{ type: 'image_file', filename: 'photo.png', mime_type: 'image/png' }],
    })];
    const result = extractAttachments(messages, null, 'chat-1');
    expect(result).toHaveLength(1);
    expect(result[0].filename).toBe('photo.png');
  });

  it('multiple parts → multiple attachment entities', () => {
    const messages = [msg({
      index: 0,
      content: [
        { type: 'file_reference', filename: 'a.pdf', mime_type: 'application/pdf' },
        { type: 'file_reference', filename: 'b.docx' },
      ],
    })];
    const result = extractAttachments(messages, null, 'chat-1');
    expect(result).toHaveLength(2);
  });

  it('non-attachment part types are ignored', () => {
    const messages = [msg({
      content: [
        { type: 'text', text: 'Hello' },
        { type: 'file_reference', filename: 'data.csv' },
      ],
    })];
    const result = extractAttachments(messages, null, 'chat-1');
    expect(result).toHaveLength(1);
  });

  it('sizeBytes is extracted from size_bytes field', () => {
    const messages = [msg({
      content: [{ type: 'file_reference', filename: 'large.zip', size_bytes: 1024 * 1024 }],
    })];
    const result = extractAttachments(messages, null, 'chat-1');
    expect(result[0].sizeBytes).toBe(1024 * 1024);
  });

  it('mime type inferred from extension when not provided', () => {
    const messages = [msg({
      content: [{ type: 'file_reference', filename: 'data.json' }],
    })];
    const result = extractAttachments(messages, null, 'chat-1');
    expect(result[0].mimeType).toBe('application/json');
  });

  it('messageIndex taken from message.index', () => {
    const messages = [msg({
      index: 7,
      content: [{ type: 'file_reference', filename: 'sheet.xlsx' }],
    })];
    const result = extractAttachments(messages, null, 'chat-1');
    expect(result[0].messageIndex).toBe(7);
  });

  it('chatId is stamped on each entity', () => {
    const messages = [msg({
      content: [{ type: 'file_reference', filename: 'notes.txt' }],
    })];
    const result = extractAttachments(messages, null, 'chat-xyz');
    expect(result[0].chatId).toBe('chat-xyz');
  });

  it('assistant-role messages are also scanned', () => {
    const messages = [msg({
      role: 'assistant',
      content: [{ type: 'file_reference', filename: 'output.py' }],
    })];
    const result = extractAttachments(messages, null, 'chat-1');
    expect(result).toHaveLength(1);
    expect(result[0].role).toBe('assistant');
  });
});

// ---------------------------------------------------------------------------
// DOM strategy
// ---------------------------------------------------------------------------

describe('extractAttachments() — DOM scan', () => {
  let doc;

  beforeEach(() => {
    doc = document.implementation.createHTMLDocument('test');
  });

  it('[data-filename] element → attachment captured', () => {
    doc.body.innerHTML = `<div data-filename="report.pdf" data-file-type="application/pdf"></div>`;
    const result = extractAttachments([], doc, 'chat-1');
    expect(result).toHaveLength(1);
    expect(result[0].filename).toBe('report.pdf');
    expect(result[0].mimeType).toBe('application/pdf');
  });

  it('.attachment-name element → attachment captured', () => {
    doc.body.innerHTML = `<div><span class="attachment-name">invoice.pdf</span></div>`;
    const result = extractAttachments([], doc, 'chat-1');
    expect(result).toHaveLength(1);
    expect(result[0].filename).toBe('invoice.pdf');
  });

  it('.attachment-name inside [data-filename] is not double-captured', () => {
    doc.body.innerHTML = `
      <div data-filename="report.pdf">
        <span class="attachment-name">report.pdf</span>
      </div>`;
    const result = extractAttachments([], doc, 'chat-1');
    expect(result).toHaveLength(1);
  });

  it('[data-size-bytes] parsed to numeric sizeBytes', () => {
    doc.body.innerHTML = `<div data-filename="big.zip" data-size-bytes="2097152"></div>`;
    const result = extractAttachments([], doc, 'chat-1');
    expect(result[0].sizeBytes).toBe(2097152);
  });
});

// ---------------------------------------------------------------------------
// No attachment data
// ---------------------------------------------------------------------------

describe('extractAttachments() — no attachment data', () => {
  it('plain-text content messages → empty result', () => {
    const messages = [
      msg({ role: 'user', content: 'Hello' }),
      msg({ role: 'assistant', content: 'Hi back' }),
    ];
    expect(extractAttachments(messages, null, 'chat-1')).toHaveLength(0);
  });

  it('empty messages array and no doc → empty result', () => {
    expect(extractAttachments([], null, 'chat-1')).toHaveLength(0);
  });

  it('doc null does not throw', () => {
    expect(() => extractAttachments([], null, 'chat-1')).not.toThrow();
  });

  it('empty body DOM → empty result', () => {
    const doc = document.implementation.createHTMLDocument('test');
    expect(extractAttachments([], doc, 'chat-1')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Strategy 3 — markdown text scan (primary path for DOM-captured chats)
// ---------------------------------------------------------------------------

describe('extractAttachments() — markdown text scan', () => {
  it('filename on its own line → 1 attachment entity', () => {
    const messages = [msg({ role: 'user', content: 'termination_letter_template.pdf' })];
    const result = extractAttachments(messages, null, 'chat-1');
    expect(result).toHaveLength(1);
    expect(result[0].filename).toBe('termination_letter_template.pdf');
    expect(result[0].mimeType).toBe('application/pdf');
  });

  it('ChatGPT chip format (filename \\n\\n type label) → 1 attachment entity', () => {
    // This is the exact format produced by htmlToMarkdown from ChatGPT's file chip
    const messages = [msg({ role: 'user', content: 'termination_letter_template.pdf\n\nPDF' })];
    const result = extractAttachments(messages, null, 'chat-1');
    expect(result).toHaveLength(1);
    expect(result[0].filename).toBe('termination_letter_template.pdf');
  });

  it('filename embedded in prose is NOT extracted (line contains more text)', () => {
    const messages = [msg({ role: 'user', content: 'Please review the file report.pdf and let me know.' })];
    expect(extractAttachments(messages, null, 'chat-1')).toHaveLength(0);
  });

  it('filename inside a fenced code block is NOT extracted', () => {
    const messages = [msg({ role: 'assistant', content: '```\nreport.pdf\n```' })];
    expect(extractAttachments(messages, null, 'chat-1')).toHaveLength(0);
  });

  it('filename inside inline code is NOT extracted', () => {
    const messages = [msg({ role: 'assistant', content: 'Run `data.csv` to see results.' })];
    expect(extractAttachments(messages, null, 'chat-1')).toHaveLength(0);
  });

  it('filename inside a URL is NOT extracted', () => {
    const messages = [msg({ role: 'assistant', content: 'See [report](https://example.com/report.pdf)' })];
    expect(extractAttachments(messages, null, 'chat-1')).toHaveLength(0);
  });

  it('multiple files in one message → multiple entities', () => {
    const messages = [msg({ role: 'user', content: 'data.csv\nreport.pdf' })];
    const result = extractAttachments(messages, null, 'chat-1');
    expect(result).toHaveLength(2);
    const names = result.map(e => e.filename).sort();
    expect(names).toContain('data.csv');
    expect(names).toContain('report.pdf');
  });

  it('same filename twice in one message → deduplicated to 1 entity', () => {
    const messages = [msg({ role: 'user', content: 'report.pdf\n\nreport.pdf' })];
    expect(extractAttachments(messages, null, 'chat-1')).toHaveLength(1);
  });

  it('DOCX file → mimeType correctly inferred', () => {
    const messages = [msg({ role: 'user', content: 'proposal.docx' })];
    const result = extractAttachments(messages, null, 'chat-1');
    expect(result[0].mimeType).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    );
  });

  it('PNG file → mimeType image/png', () => {
    const messages = [msg({ role: 'user', content: 'screenshot.png' })];
    expect(extractAttachments(messages, null, 'chat-1')[0].mimeType).toBe('image/png');
  });

  it('CSV file → mimeType text/csv', () => {
    const messages = [msg({ role: 'user', content: 'data.csv' })];
    expect(extractAttachments(messages, null, 'chat-1')[0].mimeType).toBe('text/csv');
  });

  it('Python file → text-scan picks it up', () => {
    const messages = [msg({ role: 'user', content: 'analysis.py' })];
    const result = extractAttachments(messages, null, 'chat-1');
    expect(result).toHaveLength(1);
    expect(result[0].filename).toBe('analysis.py');
  });

  it('filename with spaces and accents → extracted', () => {
    const messages = [msg({ role: 'user', content: 'résumé finale.pdf' })];
    const result = extractAttachments(messages, null, 'chat-1');
    expect(result).toHaveLength(1);
    expect(result[0].filename).toBe('résumé finale.pdf');
  });

  it('sizeBytes is null for text-scan entities (unavailable from text)', () => {
    const messages = [msg({ role: 'user', content: 'report.pdf' })];
    expect(extractAttachments(messages, null, 'chat-1')[0].sizeBytes).toBeNull();
  });

  it('chatId stamped on text-scan entity', () => {
    const messages = [msg({ role: 'user', content: 'report.pdf' })];
    expect(extractAttachments(messages, null, 'chat-xyz')[0].chatId).toBe('chat-xyz');
  });

  it('messageIndex taken from message.index in text-scan', () => {
    const messages = [msg({ role: 'user', content: 'report.pdf', index: 3 })];
    expect(extractAttachments(messages, null, 'chat-1')[0].messageIndex).toBe(3);
  });

  it('structured strategy takes priority over text scan when parts are present', () => {
    const messages = [msg({
      content: [{ type: 'file_reference', filename: 'api-report.pdf', mime_type: 'application/pdf' }],
    })];
    const result = extractAttachments(messages, null, 'chat-1');
    expect(result).toHaveLength(1);
    expect(result[0].filename).toBe('api-report.pdf');
  });

  it('bare line "PDF" (type label only) is NOT extracted as a filename', () => {
    const messages = [msg({ role: 'user', content: 'PDF' })];
    expect(extractAttachments(messages, null, 'chat-1')).toHaveLength(0);
  });

  it('assistant message with standalone attachment filename → extracted', () => {
    const messages = [msg({ role: 'assistant', content: 'Here is the output:\nresults.csv' })];
    // The filename is NOT on a standalone line here — "Here is the output:" is also on a preceding line
    // Actually only "results.csv" is on its own line in this case → should match
    const result = extractAttachments(messages, null, 'chat-1');
    expect(result).toHaveLength(1);
    expect(result[0].filename).toBe('results.csv');
  });
});
