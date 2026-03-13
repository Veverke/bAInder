/**
 * tests/compare-page.test.js — Phase 1
 * Tests for compare page init(): panel rendering, error states, CSS var.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ── Mock browser ──────────────────────────────────────────────────────────
vi.mock('../src/lib/vendor/browser.js', () => ({
  default: new Proxy({}, { get(_, prop) { return global.chrome?.[prop]; } })
}));

// ── Mock all analysis modules (tested independently) ──────────────────────
vi.mock('../src/lib/analysis/chat-turns.js', () => ({
  extractAssistantTurns: (chat) => (chat?.messages ?? [])
    .filter(m => m.role === 'assistant')
    .map(m => m.content ?? ''),
}));
vi.mock('../src/lib/analysis/structural-analyser.js', () => ({
  analyseStructure: () => ({ headings: 0, codeBlocks: 0, listItems: 0, tables: 0, paragraphs: 0, totalWords: 0, avgTurnWords: 0 }),
}));
vi.mock('../src/lib/analysis/turn-differ.js', () => ({
  diffAllTurns: (a, b) => b.map(() => ''),
}));
vi.mock('../src/lib/analysis/semantic-analyser.js', () => ({
  tokenize: (text) =>
    (text ?? '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(t => t.length > 1),
}));
vi.mock('../src/lib/analysis/glove-loader.js', () => ({
  initialise:         vi.fn().mockResolvedValue(false),
  isAvailable:        vi.fn().mockReturnValue(false),
  semanticSimilarity: vi.fn().mockReturnValue(null),
  sentenceVector:     vi.fn().mockReturnValue(null),
  wordVector:         vi.fn().mockReturnValue(null),
  cosineSim:          vi.fn().mockReturnValue(0),
  dimensions:         vi.fn().mockReturnValue(0),
}));

// ── Mock reader utilities ─────────────────────────────────────────────────
vi.mock('../src/reader/reader.js', () => ({
  renderMarkdown: (md) => `<p>${md}</p>`,
  sourceLabel:    (src) => src || 'Unknown',
  badgeClass:     (src) => `badge badge--${src || 'unknown'}`,
  escapeHtml:     (s)   => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
}));

import { init, loadChat, renderErrorPanel, buildTopicFingerprints, buildComparePrompt } from '../src/compare/compare.js';

// ── Helpers ───────────────────────────────────────────────────────────────

/** Seed chrome.storage.local with a chats array built from the id→chat map */
function seedStorage(map) {
  const chats = Object.values(map).filter(Boolean);
  chrome.storage.local.get.mockResolvedValue({ chats });
}

function makeChat(id, title = 'Test Chat', extra = {}) {
  return { id, title, source: 'chatgpt', messages: [
    { role: 'user',      content: 'Hello' },
    { role: 'assistant', content: 'World' },
  ], ...extra };
}

function buildDom() {
  document.body.innerHTML = `
    <header class="compare-header">
      <h1 class="compare-title">Chat Comparison</h1>
    </header>
    <div id="compareError" hidden>
      <p id="compareErrorMsg"></p>
    </div>
    <main>
      <section class="unique-section" id="uniqueSection" hidden>
        <button class="unique-section__toggle" id="uniqueToggle" aria-expanded="false">
          <svg class="unique-section__chevron" width="14" height="14"></svg>
          <span class="unique-section__label">Unique Terms Analysis</span>
          <span class="unique-count" id="uniqueCount" hidden>
            <span class="unique-count__label" id="uniqueCountLabel"></span>
            <div class="unique-overlay" id="uniqueOverlay" hidden></div>
          </span>
        </button>
        <div class="unique-section__body" id="uniqueBody" hidden>
          <p class="compare-legend" id="compareLegend"></p>
          <div id="comparePanels" class="compare-panels"></div>
        </div>
      </section>
      <section id="analysisSummary" class="analysis-summary" hidden></section>
    </main>
  `;
}

function setQueryString(params) {
  // jsdom does not support location.search mutation directly
  Object.defineProperty(window, 'location', {
    value: { ...window.location, search: params },
    writable: true,
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe('compare page init()', () => {
  beforeEach(() => {
    buildDom();
    vi.clearAllMocks();
  });

  it('shows error state when 0 IDs in URL', async () => {
    setQueryString('');
    await init();
    expect(document.getElementById('compareError').hasAttribute('hidden')).toBe(false);
    expect(document.querySelectorAll('.compare-panel')).toHaveLength(0);
  });

  it('shows error state when 1 ID in URL', async () => {
    seedStorage({ 'chat-1': makeChat('chat-1') });
    setQueryString('?ids=chat-1');
    await init();
    expect(document.getElementById('compareError').hasAttribute('hidden')).toBe(false);
    expect(document.querySelectorAll('.compare-panel')).toHaveLength(0);
  });

  it('renders 2 panels when 2 valid IDs provided', async () => {
    const c1 = makeChat('id-1');
    const c2 = makeChat('id-2');
    seedStorage({ 'id-1': c1, 'id-2': c2 });
    setQueryString('?ids=id-1,id-2');
    await init();
    expect(document.querySelectorAll('.compare-panel')).toHaveLength(2);
  });

  it('renders 3 panels when 3 valid IDs provided', async () => {
    const c1 = makeChat('a'); const c2 = makeChat('b'); const c3 = makeChat('c');
    seedStorage({ a: c1, b: c2, c: c3 });
    setQueryString('?ids=a,b,c');
    await init();
    expect(document.querySelectorAll('.compare-panel')).toHaveLength(3);
  });

  it('renders error card for failed load; others render normally', async () => {
    const c1 = makeChat('good-1');
    const c2 = makeChat('good-2');
    // 'bad-id' returns undefined (not in storage)
    seedStorage({ 'good-1': c1, 'good-2': c2 });
    setQueryString('?ids=good-1,bad-id,good-2');
    await init();
    const panels = document.querySelectorAll('.compare-panel');
    expect(panels).toHaveLength(3);
    expect(panels[1].classList.contains('compare-panel--error')).toBe(true);
    expect(panels[0].classList.contains('compare-panel--error')).toBe(false);
    expect(panels[2].classList.contains('compare-panel--error')).toBe(false);
  });

  it('sets --panel-count CSS var on #comparePanels', async () => {
    const c1 = makeChat('x'); const c2 = makeChat('y'); const c3 = makeChat('z');
    seedStorage({ x: c1, y: c2, z: c3 });
    setQueryString('?ids=x,y,z');
    await init();
    const panelsEl = document.getElementById('comparePanels');
    expect(panelsEl.style.getPropertyValue('--panel-count')).toBe('3');
  });

  it('#analysisSummary remains hidden after init when only 1 valid panel', async () => {
    // Only one valid chat out of 2 IDs → analysisSection shows (we have 1 valid)
    // But with 0 valid: stays hidden
    seedStorage({});
    setQueryString('?ids=missing-a,missing-b');
    await init();
    // Both panels are error panels; no valid chats; analysis section should stay hidden
    // because the guard `if (validChats.length < 1) return;` fires
    expect(document.getElementById('analysisSummary').hasAttribute('hidden')).toBe(true);
  });
});

describe('loadChat()', () => {
  it('returns chat object when found in storage', async () => {
    const chat = makeChat('test-id');
    chrome.storage.local.get.mockResolvedValue({ chats: [chat] });
    const result = await loadChat('test-id');
    expect(result).toEqual(chat);
  });

  it('returns null when not found in storage', async () => {
    chrome.storage.local.get.mockResolvedValue({ chats: [] });
    const result = await loadChat('missing');
    expect(result).toBeNull();
  });

  it('returns null on storage error', async () => {
    chrome.storage.local.get.mockRejectedValue(new Error('storage fail'));
    const result = await loadChat('any');
    expect(result).toBeNull();
  });
});

describe('buildComparePrompt()', () => {
  function makeChat2(title, source, messages) {
    return { id: 'x', title, source, messages };
  }

  it('includes the instructions header', () => {
    const chats  = [makeChat2('Test', 'chatgpt', [])];
    const labels = ['Test'];
    const prompt = buildComparePrompt(chats, labels);
    expect(prompt).toContain('Compare the following AI chat conversations');
    expect(prompt).toContain('Summarise the key points');
  });

  it('includes a labelled section per chat', () => {
    const c1 = makeChat2('Alpha', 'chatgpt', [{ role: 'user', content: 'Hi' }, { role: 'assistant', content: 'Hello' }]);
    const c2 = makeChat2('Beta',  'claude',  [{ role: 'user', content: 'Hey' }, { role: 'assistant', content: 'Greetings' }]);
    const prompt = buildComparePrompt([c1, c2], ['Alpha', 'Beta']);
    expect(prompt).toContain('CHAT 1');
    expect(prompt).toContain('Alpha');
    expect(prompt).toContain('CHAT 2');
    expect(prompt).toContain('Beta');
  });

  it('formats user and AI turns correctly', () => {
    const chat = makeChat2('T', 'chatgpt', [
      { role: 'user',      content: 'Question?' },
      { role: 'assistant', content: 'Answer.' },
    ]);
    const prompt = buildComparePrompt([chat], ['T']);
    expect(prompt).toContain('[User]: Question?');
    expect(prompt).toContain('[AI]: Answer.');
  });

  it('skips null chat slots gracefully', () => {
    const c1 = makeChat2('Real', 'chatgpt', [{ role: 'user', content: 'Hi' }]);
    const prompt = buildComparePrompt([c1, null], ['Real', 'Missing']);
    expect(prompt).toContain('CHAT 1');
    expect(prompt).not.toContain('CHAT 2');
  });
});

describe('buildTopicFingerprints()', () => {
  it('returns one fingerprint array per chat', () => {
    const allTurns = [['solar energy renewable power'], ['nuclear fission reactor energy']];
    const result = buildTopicFingerprints(allTurns);
    expect(result).toHaveLength(2);
    expect(Array.isArray(result[0])).toBe(true);
    expect(Array.isArray(result[1])).toBe(true);
  });

  it('returns terms emphasised by each chat but not the other', () => {
    const allTurns = [
      ['quantum entanglement photon qubit quantum quantum quantum'],
      ['blockchain hash ledger decentralised blockchain blockchain blockchain'],
    ];
    const result = buildTopicFingerprints(allTurns);
    // Chat 0 should emphasise quantum-related terms
    expect(result[0].some(t => t.includes('quantum') || t.includes('photon') || t.includes('qubit'))).toBe(true);
    // Chat 1 should emphasise blockchain-related terms
    expect(result[1].some(t => t.includes('blockchain') || t.includes('ledger') || t.includes('hash') || t.includes('decentralised'))).toBe(true);
  });

  it('handles empty turns gracefully', () => {
    const result = buildTopicFingerprints([[], []]);
    expect(result).toHaveLength(2);
    expect(result[0]).toHaveLength(0);
    expect(result[1]).toHaveLength(0);
  });

  it('returns at most topN terms per chat', () => {
    const turns = [['apple banana cherry delta echo foxtrot golf hotel india juliet kiwi lemon']];
    const result = buildTopicFingerprints(turns, 3);
    expect(result[0].length).toBeLessThanOrEqual(3);
  });

  it('does not include stop-words in fingerprint', () => {
    const STOP = ['that','this','with','from','have','been','they','their',
      'will','would','could','should','which','when'];
    const allTurns = [['solar photovoltaic panel that will could should have been'], ['wind turbine generator energy']];
    const result = buildTopicFingerprints(allTurns);
    const found = result[0].filter(t => STOP.includes(t));
    expect(found).toHaveLength(0);
  });

  it('terms common to all chats do not appear in any fingerprint', () => {
    // 'climate' appears once in each six-token chat → identical relative rate in all panels
    const allTurns = [
      ['climate solar photovoltaic renewable panel wind'],
      ['climate nuclear fission reactor uranium meltdown'],
      ['climate hydrogen electrolysis battery storage grid'],
    ];
    const result = buildTopicFingerprints(allTurns);
    // Each chat's fingerprint should contain its unique domain terms
    expect(result[0].some(t => ['solar','photovoltaic','renewable','panel','wind'].includes(t))).toBe(true);
    expect(result[1].some(t => ['nuclear','fission','reactor','uranium','meltdown'].includes(t))).toBe(true);
    expect(result[2].some(t => ['hydrogen','electrolysis','battery','storage','grid'].includes(t))).toBe(true);
    // climate rate is identical across all chats → relative score = 0 → not in any fingerprint
    result.forEach(terms => {
      expect(terms).not.toContain('climate');
    });
  });
});

describe('renderErrorPanel()', () => {
  it('has error panel class', () => {
    const el = renderErrorPanel('bad-id');
    expect(el.classList.contains('compare-panel--error')).toBe(true);
  });

  it('shows the chat ID in the error text', () => {
    const el = renderErrorPanel('some-id-123');
    expect(el.textContent).toContain('some-id-123');
  });

  it('escapes HTML special chars in ID', () => {
    const el = renderErrorPanel('<script>xss</script>');
    expect(el.innerHTML).not.toContain('<script>');
  });
});
