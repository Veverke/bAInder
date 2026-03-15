/**
 * tests/artifact-preview.test.js — Task E.3
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  showArtifactPreview,
  hideArtifactPreview,
  _setElements,
} from '../src/sidepanel/features/artifact-preview.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePanel() {
  const panel = document.createElement('div');
  panel.id = 'artifactPreviewPanel';
  panel.setAttribute('hidden', '');
  panel.setAttribute('aria-hidden', 'true');

  const titleEl = document.createElement('span');
  titleEl.className = 'artifact-preview__title';
  panel.appendChild(titleEl);

  const frame = document.createElement('iframe');
  frame.id = 'artifactFrame';
  panel.appendChild(frame);

  const copyBtn = document.createElement('button');
  copyBtn.id = 'artifactCopySourceBtn';
  panel.appendChild(copyBtn);

  const dlBtn = document.createElement('button');
  dlBtn.id = 'artifactDownloadBtn';
  panel.appendChild(dlBtn);

  const closeBtn = document.createElement('button');
  closeBtn.id = 'artifactPreviewCloseBtn';
  panel.appendChild(closeBtn);

  document.body.appendChild(panel);
  return { panel, frame, copyBtn, dlBtn, closeBtn };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('showArtifactPreview()', () => {
  let panel, frame, copyBtn, dlBtn;

  beforeEach(() => {
    document.body.innerHTML = '';
    ({ panel, frame, copyBtn, dlBtn } = makePanel());

    // Inject mock elements so we bypass lazy getElementById calls
    _setElements({ panel, frame, copyBtn, dlBtn });

    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      writable: true,
      configurable: true,
    });
    global.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
    global.URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    // Reset injected elements (forces re-init on next call)
    _setElements({ panel: null, frame: null, copyBtn: null, dlBtn: null });
  });

  it('sets iframe srcdoc to entity.source (HTML)', () => {
    const entity = { source: '<p>Hello</p>', mimeType: 'text/html', artifactType: 'html', title: '' };
    showArtifactPreview(entity);
    expect(frame.getAttribute('srcdoc')).toBe('<p>Hello</p>');
  });

  it('wraps SVG source in an HTML body', () => {
    const entity = { source: '<svg/>', mimeType: 'image/svg+xml', artifactType: 'svg', title: '' };
    showArtifactPreview(entity);
    expect(frame.getAttribute('srcdoc')).toContain('<body');
    expect(frame.getAttribute('srcdoc')).toContain('<svg/>');
  });

  it('wraps plain text source in <pre>', () => {
    const entity = { source: 'hello world', mimeType: 'text/plain', artifactType: 'text', title: '' };
    showArtifactPreview(entity);
    expect(frame.getAttribute('srcdoc')).toContain('<pre');
    expect(frame.getAttribute('srcdoc')).toContain('hello world');
  });

  it('removes hidden attribute on show', () => {
    showArtifactPreview({ source: '<p>x</p>', mimeType: 'text/html', artifactType: 'html', title: '' });
    expect(panel.hasAttribute('hidden')).toBe(false);
    expect(panel.getAttribute('aria-hidden')).toBe('false');
  });

  it('updates the panel title from entity.title', () => {
    showArtifactPreview({ source: '<p>x</p>', mimeType: 'text/html', artifactType: 'html', title: 'Counter App' });
    const titleEl = panel.querySelector('.artifact-preview__title');
    expect(titleEl.textContent).toBe('Counter App');
  });

  it('uses fallback title when entity.title is empty', () => {
    showArtifactPreview({ source: '<p>x</p>', mimeType: 'text/html', artifactType: 'html', title: '' });
    const titleEl = panel.querySelector('.artifact-preview__title');
    expect(titleEl.textContent).toContain('html');
  });

  it('Copy button calls clipboard.writeText with entity.source', () => {
    const entity = { source: '<p>Hello</p>', mimeType: 'text/html', artifactType: 'html', title: '' };
    showArtifactPreview(entity);
    copyBtn.click();
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('<p>Hello</p>');
  });

  it('Download button creates a blob download link', () => {
    const appendSpy = vi.spyOn(document.body, 'appendChild').mockImplementation(() => {});
    const entity = { source: '<p>x</p>', mimeType: 'text/html', artifactType: 'html', title: '' };
    showArtifactPreview(entity);

    const a = document.createElement('a');
    const clickSpy = vi.spyOn(a, 'click');
    vi.spyOn(document, 'createElement').mockImplementationOnce(() => a);

    dlBtn.click();

    expect(URL.createObjectURL).toHaveBeenCalled();
    expect(a.download).toBe('artifact.html');

    appendSpy.mockRestore();
  });
});

describe('hideArtifactPreview()', () => {
  let panel, frame, copyBtn, dlBtn;

  beforeEach(() => {
    document.body.innerHTML = '';
    ({ panel, frame, copyBtn, dlBtn } = makePanel());
    _setElements({ panel, frame, copyBtn, dlBtn });

    // Show first, then hide
    showArtifactPreview({ source: '<p>x</p>', mimeType: 'text/html', artifactType: 'html', title: '' });
  });

  afterEach(() => {
    _setElements({ panel: null, frame: null, copyBtn: null, dlBtn: null });
  });

  it('adds hidden attribute', () => {
    hideArtifactPreview();
    expect(panel.hasAttribute('hidden')).toBe(true);
    expect(panel.getAttribute('aria-hidden')).toBe('true');
  });

  it('clears iframe srcdoc', () => {
    hideArtifactPreview();
    expect(frame.hasAttribute('srcdoc')).toBe(false);
  });
});

describe('close button wiring', () => {
  it('clicking the close button hides the panel', () => {
    document.body.innerHTML = '';
    const { panel, frame, copyBtn, dlBtn, closeBtn } = makePanel();
    _setElements({ panel, frame, copyBtn, dlBtn, closeBtn });

    showArtifactPreview({ source: '<p>x</p>', mimeType: 'text/html', artifactType: 'html', title: '' });
    expect(panel.hasAttribute('hidden')).toBe(false);

    closeBtn.click();
    expect(panel.hasAttribute('hidden')).toBe(true);

    _setElements({ panel: null, frame: null, copyBtn: null, dlBtn: null });
  });
});
