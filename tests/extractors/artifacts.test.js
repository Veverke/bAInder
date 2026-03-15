/**
 * tests/extractors/artifacts.test.js — Task E.1
 */
import { describe, it, expect } from 'vitest';
import { extractArtifacts } from '../../src/lib/entities/extractors/artifacts.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDoc(html) {
  const doc = document.implementation.createHTMLDocument('test');
  doc.body.innerHTML = html;
  return doc;
}

const MESSAGES = []; // artifacts are DOM-only; messages array is ignored

// ---------------------------------------------------------------------------
// doc=null guard
// ---------------------------------------------------------------------------

describe('extractArtifacts() — doc null', () => {
  it('returns empty array when doc is null', () => {
    expect(extractArtifacts(MESSAGES, null, 'c1')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Strategy 1 — Claude Artifacts via [data-artifact-type]
// ---------------------------------------------------------------------------

describe('extractArtifacts() — Claude [data-artifact-type]', () => {
  it('extracts an HTML artifact', () => {
    const doc = makeDoc(`
      <div data-artifact-type="html">
        <pre>&lt;h1&gt;Hello&lt;/h1&gt;</pre>
      </div>
    `);
    const result = extractArtifacts(MESSAGES, doc, 'chat-1');
    expect(result).toHaveLength(1);
    expect(result[0].artifactType).toBe('html');
    expect(result[0].type).toBe('artifact');
    expect(result[0].mimeType).toBe('text/html');
  });

  it('extracts a text artifact with mimeType text/plain', () => {
    const doc = makeDoc('<div data-artifact-type="text"><pre>Hello world</pre></div>');
    const result = extractArtifacts(MESSAGES, doc, 'chat-1');
    expect(result[0].artifactType).toBe('text');
    expect(result[0].mimeType).toBe('text/plain');
  });

  it('extracts an SVG artifact with mimeType image/svg+xml', () => {
    const doc = makeDoc('<div data-artifact-type="svg"><pre>&lt;svg/&gt;</pre></div>');
    const result = extractArtifacts(MESSAGES, doc, 'chat-1');
    expect(result[0].mimeType).toBe('image/svg+xml');
  });

  it('screenshotDataUri is null at extraction time', () => {
    const doc = makeDoc('<div data-artifact-type="html"><pre>body</pre></div>');
    expect(extractArtifacts(MESSAGES, doc, 'chat-1')[0].screenshotDataUri).toBeNull();
  });

  it('extracts title from adjacent previous heading sibling', () => {
    const doc = makeDoc(`
      <h2>My Artifact</h2>
      <div data-artifact-type="html"><pre>&lt;p&gt;hi&lt;/p&gt;</pre></div>
    `);
    const result = extractArtifacts(MESSAGES, doc, 'chat-1');
    expect(result[0].title).toBe('My Artifact');
  });

  it('extracts title from data-artifact-title attribute', () => {
    const doc = makeDoc('<div data-artifact-type="react" data-artifact-title="Counter App"><pre>code</pre></div>');
    expect(extractArtifacts(MESSAGES, doc, 'chat-1')[0].title).toBe('Counter App');
  });

  it('extracts source text from <pre>', () => {
    const doc = makeDoc('<div data-artifact-type="html"><pre>const x = 1;</pre></div>');
    expect(extractArtifacts(MESSAGES, doc, 'chat-1')[0].source).toContain('const x = 1;');
  });

  it('extracts source text from <textarea>', () => {
    const doc = makeDoc('<div data-artifact-type="code"><textarea>let y = 2;</textarea></div>');
    expect(extractArtifacts(MESSAGES, doc, 'chat-1')[0].source).toContain('let y = 2;');
  });

  it('no artifact DOM elements → empty result', () => {
    const doc = makeDoc('<p>No artifacts here</p>');
    expect(extractArtifacts(MESSAGES, doc, 'chat-1')).toHaveLength(0);
  });

  it('stamped fields: chatId, type, role, messageIndex', () => {
    const doc = makeDoc('<div data-artifact-type="html"><pre>x</pre></div>');
    const [e] = extractArtifacts(MESSAGES, doc, 'my-chat');
    expect(e.chatId).toBe('my-chat');
    expect(e.type).toBe('artifact');
    expect(e.role).toBe('assistant');
    expect(typeof e.messageIndex).toBe('number');
    expect(typeof e.id).toBe('string');
    expect(e.id.length).toBeGreaterThan(0);
  });

  it('multiple [data-artifact-type] elements → multiple entities', () => {
    const doc = makeDoc(`
      <div data-artifact-type="html"><pre>html</pre></div>
      <div data-artifact-type="code"><pre>code</pre></div>
    `);
    expect(extractArtifacts(MESSAGES, doc, 'c1')).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Strategy 1 — Claude Artifacts via .artifact-container
// ---------------------------------------------------------------------------

describe('extractArtifacts() — Claude .artifact-container', () => {
  it('extracts artifact from .artifact-container without data-artifact-type', () => {
    const doc = makeDoc('<div class="artifact-container"><pre>some code</pre></div>');
    const result = extractArtifacts(MESSAGES, doc, 'c2');
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('artifact');
  });

  it('.artifact-container with data-artifact-type child is not double-counted', () => {
    const doc = makeDoc(`
      <div class="artifact-container">
        <div data-artifact-type="html"><pre>code</pre></div>
      </div>
    `);
    // The [data-artifact-type] is extracted by strategy-1a; the outer .artifact-container
    // is skipped because it contains a data-artifact-type descendant.
    expect(extractArtifacts(MESSAGES, doc, 'c3')).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Strategy 2 — ChatGPT Canvas
// ---------------------------------------------------------------------------

describe('extractArtifacts() — ChatGPT Canvas', () => {
  it('.canvas-panel → artifact with artifactType "canvas"', () => {
    const doc = makeDoc('<div class="canvas-panel"><pre>canvas content</pre></div>');
    const result = extractArtifacts(MESSAGES, doc, 'c4');
    expect(result).toHaveLength(1);
    expect(result[0].artifactType).toBe('canvas');
    expect(result[0].mimeType).toBe('text/html');
  });

  it('[data-panel="canvas"] → artifact with artifactType "canvas"', () => {
    const doc = makeDoc('<div data-panel="canvas"><pre>canvas text</pre></div>');
    const result = extractArtifacts(MESSAGES, doc, 'c5');
    expect(result[0].artifactType).toBe('canvas');
  });

  it('duplicate canvas selector matches on same element are deduplicated', () => {
    // An element matching both .canvas-panel and [data-panel="canvas"]
    const doc = makeDoc('<div class="canvas-panel" data-panel="canvas"><pre>dedup</pre></div>');
    expect(extractArtifacts(MESSAGES, doc, 'c6')).toHaveLength(1);
  });
});
