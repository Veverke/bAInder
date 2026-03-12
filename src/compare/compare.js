/**
 * compare.js — C.18 Chat Comparison page
 *
 * Orchestrates loading, rendering, and analysis for the compare page.
 * Phases:
 *   Phase 1 — UI shell with N chat panels, scroll-synced
 *   Phase 2 — Structure analysis card
 *   Phase 3 — Word-level diff panels (vs. auto-reference index 0; Phase 4 upgrades)
 *   Phase 4 — Semantic reasoning alignment via sentence embeddings
 *   Phase 5 — Confidence scoring & synthesis card
 */

import browser from '../lib/vendor/browser.js';
import { renderMarkdown, sourceLabel, badgeClass, escapeHtml } from '../reader/reader.js';
import { extractAssistantTurns } from '../lib/analysis/chat-turns.js';
import { analyseStructure } from '../lib/analysis/structural-analyser.js';

import { tokenize } from '../lib/analysis/semantic-analyser.js';
import * as glove  from '../lib/analysis/glove-loader.js';
import { injectPrompt } from '../content/ai-injector.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build display labels for each chat.
 * When two or more chats share the same title, the source name is appended in
 * brackets so the analysis cards and reference label remain unambiguous.
 * @param {Array} chats
 * @returns {string[]}
 */
function buildChatLabels(chats) {
  const raw    = chats.map((c, i) => c ? (c.title || `Chat ${i + 1}`) : `Chat ${i + 1}`);
  const counts = new Map();
  raw.forEach(l => counts.set(l, (counts.get(l) ?? 0) + 1));
  return raw.map((label, i) => {
    if ((counts.get(label) ?? 0) > 1 && chats[i]) {
      return `[${sourceLabel(chats[i].source ?? '')}] ${label}`;
    }
    return label;
  });
}

/**
 * Attempt to repair markdown content where newlines were lost during DOM
 * extraction (e.g. Gemini responses captured as a single flat text line).
 * Only activates when heading markers are present but none start their own line.
 * @param {string} text
 * @returns {string}
 */
function repairFlatMarkdown(text) {
  if (!text || typeof text !== 'string') return text;
  if (!/#{1,6} /.test(text)) return text;       // no heading markers → no-op
  if (/^#{1,6} /m.test(text)) return text;      // at least one proper heading → intact
  // All heading markers are inline: content was captured without newlines.
  // Insert double-newlines before heading markers and single newlines before
  // common list-item prefixes.
  return text
    .replace(/([^\n]) (#{1,6} )/g,     '$1\n\n$2')
    .replace(/([^\n]) ([-*] (?=\S))/g, '$1\n$2')
    .replace(/([^\n]) (\d+\. (?=\S))/g,'$1\n$2');
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export async function init() {
  const params = new URLSearchParams(window.location.search);
  const rawIds = params.get('ids') ?? '';
  const ids    = rawIds.split(',').map(id => decodeURIComponent(id)).filter(Boolean);

  if (ids.length < 2) {
    showError('Select at least 2 chats to compare.');
    return;
  }

  // Begin loading GloVe vectors in the background immediately so they are
  // ready (or timed-out) before diff annotation runs.
  const gloveReady = glove.initialise();

  // Load all chats (failures produce null)
  const chats = await Promise.all(ids.map(loadChat));
  const chatLabels = buildChatLabels(chats);

  const panelsEl = document.getElementById('comparePanels');
  panelsEl.style.setProperty('--panel-count', String(chats.length));

  // Phase 1 — render panels
  const panelEls = chats.map((chat, i) => {
    const el = chat ? renderPanel(chat, i, chatLabels[i]) : renderErrorPanel(ids[i]);
    panelsEl.appendChild(el);
    return el;
  });

  // Scroll sync
  wireScrollSync(panelEls.map(el => el.querySelector('.compare-panel__body')).filter(Boolean));

  const validChats = chats.filter(Boolean);
  if (validChats.length < 1) return; // nothing to analyse

  // Phase 3 — symmetric uniqueness annotation.
  // Wait up to 800 ms for GloVe; if unavailable, word-overlap is used instead.
  await Promise.race([gloveReady, new Promise(r => setTimeout(r, 800))]);
  const uniqueBlocks = applyDiffPanels(panelEls, chats, chatLabels);
  wireUniqueSection(uniqueBlocks, chatLabels);

  // Reveal the Unique Terms Analysis section (collapsed by default)
  const uniqueSection = document.getElementById('uniqueSection');
  const uniqueToggle  = document.getElementById('uniqueToggle');
  const uniqueBody    = document.getElementById('uniqueBody');
  uniqueSection?.removeAttribute('hidden');
  uniqueToggle?.addEventListener('click', e => {
    if (e.target.closest('.unique-count')) return; // badge area — don't toggle section
    const open = uniqueToggle.getAttribute('aria-expanded') === 'true';
    uniqueToggle.setAttribute('aria-expanded', String(!open));
    uniqueBody.toggleAttribute('hidden', open);
    uniqueToggle.classList.toggle('unique-section__toggle--open', !open);
  });

  const analysisSummary = document.getElementById('analysisSummary');
  analysisSummary.removeAttribute('hidden');

  // Phase 2 — structural analysis
  const allTurns = chats.map(c => c ? extractAssistantTurns(c) : []);
  analysisSummary.appendChild(renderStructureCard(validChats, chats, allTurns, chatLabels));

  // Phase 4 — topic fingerprint card
  analysisSummary.appendChild(renderTopicFingerprintCard(chats, allTurns, chatLabels));

  // Phase 5 — compare with AI card
  analysisSummary.appendChild(await renderSendToAiCard(chats, chatLabels));
}

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------

export async function loadChat(id) {
  try {
    const result = await browser.storage.local.get('chats');
    const chats = Array.isArray(result.chats) ? result.chats : [];
    return chats.find(c => c.id === id) ?? null;
  } catch (_) {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Phase 1 — panel rendering
// ---------------------------------------------------------------------------

function renderPanel(chat, _index, displayLabel) {
  const panel = document.createElement('div');
  panel.className = 'compare-panel';
  panel.dataset.chatId = chat.id ?? '';

  const source = chat.source ?? '';
  const label  = displayLabel ?? chat.title ?? 'Untitled';

  panel.innerHTML =
    `<div class="compare-panel__header">` +
    `  <span class="${escapeHtml(badgeClass(source))}">${escapeHtml(sourceLabel(source))}</span>` +
    `  <span class="compare-panel__title" title="${escapeHtml(label)}">${escapeHtml(label)}</span>` +
    `</div>` +
    `<div class="compare-panel__body"></div>`;

  const body = panel.querySelector('.compare-panel__body');
  const messages = chat.messages ?? [];
  messages.forEach(msg => {
    const msgEl = document.createElement('div');
    msgEl.className = `compare-message compare-message--${escapeHtml(msg.role ?? 'assistant')}`;
    msgEl.dataset.role = msg.role ?? 'assistant';
    const content = repairFlatMarkdown(msg.content ?? '');
    msgEl.innerHTML =
      `<div class="compare-message__role">${escapeHtml(msg.role ?? 'assistant')}</div>` +
      `<div class="compare-message__content">${renderMarkdown(content)}</div>`;
    body.appendChild(msgEl);
  });

  return panel;
}

export function renderErrorPanel(id) {
  const panel = document.createElement('div');
  panel.className = 'compare-panel compare-panel--error';
  panel.innerHTML =
    `<div class="compare-panel__header">` +
    `  <span class="compare-panel__title">Could not load chat</span>` +
    `</div>` +
    `<div class="compare-panel__body">` +
    `  <p class="compare-panel__error">ID: ${escapeHtml(String(id))}</p>` +
    `</div>`;
  return panel;
}

function wireScrollSync(bodies) {
  let syncing = false;
  bodies.forEach(b => {
    b.addEventListener('scroll', () => {
      if (syncing) return;
      syncing = true;
      bodies.forEach(other => { if (other !== b) other.scrollTop = b.scrollTop; });
      syncing = false;
    });
  });
}

function updateReferenceLabel(_chatLabels, _referenceIdx) {
  // Reference concept removed — panels are symmetric.
  // Keep function stub so semantic-analyser medoid re-render path doesn't break.
  const meta = document.getElementById('compareHeaderMeta');
  if (meta) meta.innerHTML = '';
}

function showError(msg) {
  const errEl = document.getElementById('compareError');
  const msgEl = document.getElementById('compareErrorMsg');
  if (errEl) errEl.removeAttribute('hidden');
  if (msgEl) msgEl.textContent = msg;
}

// ---------------------------------------------------------------------------
// Phase 2 — structural analysis card
// ---------------------------------------------------------------------------

const CHEVRON_SVG =
  `<svg class="analysis-card__chevron" width="12" height="12" viewBox="0 0 14 14"` +
  ` fill="none" stroke="currentColor" stroke-width="2"` +
  ` stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">` +
  `<polyline points="3,5 7,9 11,5"/></svg>`;

/**
 * Create a collapsible `.analysis-card` with a button title and hidden body.
 * @param {string}  title     — displayed text (uppercase via CSS)
 * @param {object}  [opts]
 * @param {boolean} [opts.expanded=false] — whether the body starts visible
 * @returns {{ card: HTMLElement, body: HTMLElement }}
 */
function makeCollapsibleCard(title, { expanded = false } = {}) {
  const card = document.createElement('div');
  card.className = 'analysis-card';

  const titleBtn = document.createElement('button');
  titleBtn.className = 'analysis-card__toggle' + (expanded ? ' analysis-card__toggle--open' : '');
  titleBtn.setAttribute('aria-expanded', String(expanded));
  titleBtn.innerHTML = CHEVRON_SVG + escapeHtml(title);

  const body = document.createElement('div');
  body.className = 'analysis-card__body';
  if (!expanded) body.hidden = true;

  titleBtn.addEventListener('click', () => {
    const open = titleBtn.getAttribute('aria-expanded') === 'true';
    titleBtn.setAttribute('aria-expanded', String(!open));
    body.hidden = open;
    titleBtn.classList.toggle('analysis-card__toggle--open', !open);
  });

  card.appendChild(titleBtn);
  card.appendChild(body);
  return { card, body };
}

function renderStructureCard(validChats, chats, allTurns, chatLabels) {
  const metrics = chats.map((_, i) => analyseStructure(allTurns[i]));

  const FIELDS = [
    ['headings',     'Headings'],
    ['codeBlocks',   'Code blocks'],
    ['listItems',    'List items'],
    ['tables',       'Tables'],
    ['paragraphs',   'Paragraphs'],
    ['totalWords',   'Total words'],
    ['avgTurnWords', 'Avg words / turn'],
  ];

  // Column headers using disambiguated chat labels
  const headers = chats.map((c, i) =>
    escapeHtml(chatLabels?.[i] ?? (c ? (c.title ?? `Chat ${i + 1}`) : `Chat ${i + 1}`))
  );

  const rows = FIELDS.map(([key, label]) => {
    const values = metrics.map(m => m[key]);
    const allSame = values.every(v => v === values[0]);
    const cells = values.map(v => {
      const formatted = key === 'avgTurnWords' ? v.toFixed(1) : String(v);
      const cls = allSame ? '' : ' class="value--differs"';
      return `<td${cls}>${formatted}</td>`;
    });
    return `<tr><td>${label}</td>${cells.join('')}</tr>`;
  });

  const { card, body } = makeCollapsibleCard('Structure');
  body.innerHTML =
    `<table class="structure-table">` +
    `<thead><tr><th>Metric</th>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>` +
    `<tbody>${rows.join('')}</tbody>` +
    `</table>`;

  return card;
}

// ---------------------------------------------------------------------------
// Phase 3 — block-level diff annotation
// ---------------------------------------------------------------------------

/**
 * Word-overlap ratio between two plain-text strings.
 * Ignores tokens shorter than 3 characters to avoid noise from articles/prepositions.
 * @param {string} a
 * @param {string} b
 * @returns {number}  0–1
 */
function blockSimilarity(a, b) {
  const tokenise = t => t.toLowerCase().split(/\W+/).filter(w => w.length > 2);
  // Prefer GloVe semantic similarity when vectors are loaded
  if (glove.isAvailable()) {
    const sim = glove.semanticSimilarity(tokenise(a), tokenise(b));
    if (sim !== null) return sim;
    // sim === null means neither block had any GloVe vocabulary (e.g. code)
    // fall through to word-overlap for those cases
  }
  const setA = new Set(tokenise(a));
  const tokB  = tokenise(b);
  if (!setA.size && !tokB.length) return 1; // both empty/short: treat as same
  if (!setA.size || !tokB.length) return 0;
  const matches = tokB.filter(w => setA.has(w)).length;
  return matches / Math.max(setA.size, tokB.length);
}

/**
 * Apply symmetric uniqueness annotations to all panels.
 *
 * Every panel has its own blocks compared against the union of blocks from ALL
 * other panels. Blocks with no close semantic match in any other panel are
 * flagged as unique to that panel — shown on both/all sides equally.
 * No panel is treated as a reference or ground truth.
 *
 * @param {Element[]} panelEls
 * @param {Array}      chats
 * @param {string[]}   chatLabels
 * @returns {{ uid: string, chatIdx: number, chatLabel: string, excerpt: string }[]}
 */
function applyDiffPanels(panelEls, chats, chatLabels) {
  const BLOCK_SEL = 'p, h1, h2, h3, h4, h5, h6, blockquote, pre, li';
  // 0.88 requires near-paraphrases to be considered "covered"; same-topic blocks
  // with different specifics score 0.78–0.85 and are correctly flagged unique.
  // Word-overlap fallback (no GloVe) uses a lower threshold (0.40).
  const THRESHOLD    = glove.isAvailable() ? 0.88 : 0.40;
  const uniqueBlocks = [];

  // Collect all assistant-content element arrays, one per panel
  const panelBlocks = panelEls.map((panelEl, i) => {
    if (!chats[i]) return [];   // error panel — no blocks
    return [...panelEl.querySelectorAll('.compare-message--assistant .compare-message__content')];
  });

  panelEls.forEach((panelEl, i) => {
    if (!chats[i]) return; // error panel — skip

    // Build the pool of text blocks from all OTHER panels
    const otherTexts = [];
    panelBlocks.forEach((contentEls, j) => {
      if (j === i) return;
      for (const contentEl of contentEls) {
        for (const el of contentEl.querySelectorAll(BLOCK_SEL)) {
          const t = el.textContent.trim();
          if (t) otherTexts.push(t);
        }
      }
    });

    // Annotate blocks in this panel that don't appear elsewhere
    for (const contentEl of panelBlocks[i]) {
      Array.from(contentEl.querySelectorAll(BLOCK_SEL)).forEach(blockEl => {
        const txt = blockEl.textContent.trim();
        if (!txt) return;
        const best = otherTexts.length
          ? Math.max(...otherTexts.map(r => blockSimilarity(r, txt)))
          : 0;
        if (best < THRESHOLD) {
          const uid = `ub-${uniqueBlocks.length}`;
          blockEl.id = uid;
          blockEl.classList.add('diff-block--unique');
          uniqueBlocks.push({
            uid,
            chatIdx:   i,
            chatLabel: chatLabels?.[i] ?? `Chat ${i + 1}`,
            excerpt:   txt.slice(0, 72).trimEnd() + (txt.length > 72 ? '\u2026' : ''),
          });
        }
      });
    }
  });

  return uniqueBlocks;
}

// ---------------------------------------------------------------------------
// Unique Terms Analysis — badge + hover overlay
// ---------------------------------------------------------------------------

/**
 * Populate the count badge in the section header and build the hover overlay
 * listing every unique block, grouped by chat, with click-to-navigate.
 *
 * @param {{ uid: string, chatIdx: number, chatLabel: string, excerpt: string }[]} uniqueBlocks
 * @param {string[]} chatLabels
 */
function wireUniqueSection(uniqueBlocks, chatLabels) {
  const countEl = document.getElementById('uniqueCount');
  const labelEl = document.getElementById('uniqueCountLabel');
  const overlay = document.getElementById('uniqueOverlay');
  if (!countEl || !labelEl || !overlay) return;

  const n = uniqueBlocks.length;
  labelEl.textContent = `${n} unique block${n !== 1 ? 's' : ''}`;
  countEl.removeAttribute('hidden');
  // Stop clicks on the badge from propagating to the toggle button
  countEl.addEventListener('click', e => e.stopPropagation());

  if (!n) return; // no blocks — badge shown, overlay not needed

  // Group blocks by chat for the overlay headings
  const byChat = new Map();
  for (const blk of uniqueBlocks) {
    if (!byChat.has(blk.chatIdx)) byChat.set(blk.chatIdx, []);
    byChat.get(blk.chatIdx).push(blk);
  }

  for (const [, blocks] of byChat) {
    const heading = document.createElement('div');
    heading.className = 'unique-overlay__heading';
    heading.textContent = blocks[0].chatLabel;
    overlay.appendChild(heading);

    for (const blk of blocks) {
      const btn = document.createElement('button');
      btn.className = 'unique-overlay__item';
      btn.textContent = blk.excerpt;
      btn.addEventListener('click', () => {
        overlay.setAttribute('hidden', '');
        // Expand the section if it's still collapsed
        const toggle = document.getElementById('uniqueToggle');
        const body   = document.getElementById('uniqueBody');
        if (body?.hasAttribute('hidden')) {
          body.removeAttribute('hidden');
          toggle?.setAttribute('aria-expanded', 'true');
          toggle?.classList.add('unique-section__toggle--open');
        }
        // Scroll to the block and flash it
        const el = document.getElementById(blk.uid);
        if (el) requestAnimationFrame(() => {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          el.classList.add('diff-block--flash');
          setTimeout(() => el.classList.remove('diff-block--flash'), 1500);
        });
      });
      overlay.appendChild(btn);
    }
  }

  // Show/hide overlay on hover with a 200 ms grace period for mouse movement
  let hideTimer;
  countEl.addEventListener('mouseenter', () => { clearTimeout(hideTimer); overlay.removeAttribute('hidden'); });
  countEl.addEventListener('mouseleave', () => { hideTimer = setTimeout(() => overlay.setAttribute('hidden', ''), 200); });
  overlay.addEventListener('mouseenter',  () => clearTimeout(hideTimer));
  overlay.addEventListener('mouseleave',  () => { hideTimer = setTimeout(() => overlay.setAttribute('hidden', ''), 200); });
}

// ---------------------------------------------------------------------------
// Phase 5 — Compare with AI
// ---------------------------------------------------------------------------

/** AI targets the user can open to paste a comparison prompt. */
const AI_TARGETS = [
  { id: 'chatgpt',    label: 'ChatGPT',    url: 'https://chatgpt.com/',          patterns: ['chatgpt.com', 'chat.openai.com']                  },
  { id: 'gemini',     label: 'Gemini',     url: 'https://gemini.google.com/',     patterns: ['gemini.google.com']                              },
  { id: 'copilot',    label: 'Copilot',    url: 'https://copilot.microsoft.com/', patterns: ['copilot.microsoft.com', 'm365.cloud.microsoft']   },
  { id: 'perplexity', label: 'Perplexity', url: 'https://perplexity.ai/',         patterns: ['perplexity.ai']                                  },
];

/**
 * Build the formatted comparison prompt from all loaded chats.
 * @param {Array} chats
 * @param {string[]} chatLabels
 * @returns {string}
 */
export function buildComparePrompt(chats, chatLabels) {
  const divider = '═'.repeat(52);
  const parts = [
    'Compare the following AI chat conversations on the same topic.\n',
    'Please:\n' +
    '1. Summarise the key points each response makes\n' +
    '2. Identify the main differences in approach, depth, and conclusions\n' +
    '3. Note where both responses agree\n' +
    '4. State which response is more conclusive, confident, or actionable — and explain why\n',
  ];

  chats.forEach((chat, i) => {
    if (!chat) return;
    const label = chatLabels?.[i] ?? `Chat ${i + 1}`;
    parts.push(`\n${divider}\nCHAT ${i + 1} · ${label}\n${divider}\n`);
    (chat.messages ?? []).forEach(msg => {
      const role = msg.role === 'assistant' ? 'AI' : 'User';
      parts.push(`[${role}]: ${(msg.content ?? '').trim()}\n`);
    });
  });

  return parts.join('\n');
}

/**
 * Wait for a specific tab to finish loading, or resolve after `timeoutMs`
 * regardless (so the caller can still attempt injection on a slow tab).
 * @param {number} tabId
 * @param {number} [timeoutMs=15000]
 * @returns {Promise<void>}
 */
function waitForTabLoad(tabId, timeoutMs = 15000) {
  return new Promise(resolve => {
    const timerId = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    }, timeoutMs);

    function listener(id, info) {
      if (id === tabId && info.status === 'complete') {
        clearTimeout(timerId);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    }
    chrome.tabs.onUpdated.addListener(listener);
  });
}

/**
 * Query all open browser tabs for any supported AI chatbot.
 * Returns a Map of AI target id → Chrome tab object.
 * @returns {Promise<Map<string, object>>}
 */
async function detectOpenAiTabs() {
  try {
    if (typeof chrome === 'undefined' || !chrome.tabs?.query) return new Map();
    const tabs  = await chrome.tabs.query({});
    const found = new Map();
    for (const target of AI_TARGETS) {
      const tab = tabs.find(t => target.patterns.some(p => (t.url ?? '').includes(p)));
      if (tab) found.set(target.id, tab);
    }
    return found;
  } catch {
    return new Map();
  }
}

/**
 * Build and return the "Compare with AI" analysis card.
 * Detects open AI tabs so the user can copy + jump in one click.
 * @param {Array}    chats
 * @param {string[]} chatLabels
 * @returns {Promise<HTMLElement>}
 */
async function renderSendToAiCard(chats, chatLabels) {
  const prompt = buildComparePrompt(chats, chatLabels);

  const card = document.createElement('div');
  card.className = 'analysis-card';

  const titleEl = document.createElement('h2');
  titleEl.className = 'analysis-card__title';
  titleEl.textContent = 'Compare with AI';

  const body = document.createElement('div');
  body.className = 'analysis-card__body';

  card.appendChild(titleEl);
  card.appendChild(body);

  const charCount = prompt.length;
  const warnMsg   = charCount > 40000
    ? `⚠ ${(charCount / 1000).toFixed(0)}K characters — may exceed some AI context limits.`
    : null;
  const warn = warnMsg ? `<p class="send-ai-warn">${escapeHtml(warnMsg)}</p>` : '';

  const buttons = AI_TARGETS.map(ai => {
    const title = `Open ${ai.label} in a new tab and send compare prompt`;
    return (
      `<button class="send-ai-btn"` +
      ` data-ai="${escapeHtml(ai.id)}" data-url="${escapeHtml(ai.url)}"` +
      ` title="${escapeHtml(title)}">${escapeHtml(ai.label)}</button>`
    );
  }).join('');

  body.innerHTML = warn + `<div class="send-ai-targets">${buttons}</div>`;

  // Each button: inject prompt → submit → hide user bubble → scroll to spinner
  body.querySelectorAll('.send-ai-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (btn.disabled) return;
      btn.disabled = true;

      const aiId  = btn.dataset.ai;
      const aiCfg = AI_TARGETS.find(a => a.id === aiId);

      // Always write to clipboard first as silent fallback
      try { await navigator.clipboard.writeText(prompt); } catch { /* ignore */ }

      // Show loading state
      btn.classList.add('send-ai-btn--loading');
      btn.textContent = `${aiCfg?.label ?? aiId} ⏳`;

      const tabTitle = `${aiCfg?.label ?? aiId} bAInder Compare`;

      try {
        // Always open a fresh tab — no conversation history, no stale DOM
        const targetTab = await chrome.tabs.create({ url: btn.dataset.url });
        await waitForTabLoad(targetTab.id, 15000);
        // Extra delay for React / Vue hydration after DOMContentLoaded
        await new Promise(r => setTimeout(r, 800));

        // Execute injection in the target tab's page context
        const [result] = await chrome.scripting.executeScript({
          target: { tabId: targetTab.id },
          func:   injectPrompt,
          args:   [prompt, tabTitle],
        });

        const outcome = result?.result ?? { success: false, reason: 'no result' };

        btn.classList.remove('send-ai-btn--loading');
        if (outcome.success) {
          btn.classList.add('send-ai-btn--done');
          btn.disabled = false;
          btn.textContent = `✓ ${aiCfg?.label ?? aiId}`;
          // Switch to the AI tab so the user sees the response arriving
          chrome.tabs.update(targetTab.id, { active: true });
          if (targetTab.windowId != null) {
            chrome.windows.update(targetTab.windowId, { focused: true });
          }
        } else {
          btn.classList.add('send-ai-btn--fail');
          btn.textContent = `⬇ ${aiCfg?.label ?? aiId} — paste manually`;
          btn.disabled = false;
        }
      } catch {
        btn.classList.remove('send-ai-btn--loading');
        btn.classList.add('send-ai-btn--fail');
        btn.textContent = `⬇ ${aiCfg?.label ?? aiId} — paste manually`;
        btn.disabled = false;
      }
    });
  });

  return card;
}

// ---------------------------------------------------------------------------
// Phase 4 — topic fingerprint card
// ---------------------------------------------------------------------------

/**
 * Build per-chat "topic fingerprint" — the top terms that each chat
 * emphasises more than the others, weighted by IDF to suppress stop-word noise.
 *
 * @param {string[][]} allTurns  allTurns[chatIdx][turnIdx] = turn text
 * @param {number}     topN
 * @returns {string[][]}  up to topN distinguishing terms per chat
 */
export function buildTopicFingerprints(allTurns, topN = 8) {
  const MIN_TERM_LEN = 4;
  const STOP = new Set([
    'that','this','with','from','have','been','they','their',
    'will','would','could','should','which','when','also','more',
    'than','into','other','about','these','those','were','what',
    'your','some','each','just','like','then','very','make',
  ]);

  const tokenized = allTurns.map(turns => tokenize(turns.join(' ')));
  const N  = tokenized.length;
  const df = new Map();
  for (const tokens of tokenized) {
    for (const t of new Set(tokens)) df.set(t, (df.get(t) ?? 0) + 1);
  }
  const idf = new Map();
  for (const [t, count] of df) {
    idf.set(t, Math.log((N + 1) / (count + 1)) + 1);
  }

  return tokenized.map((tokens, chatIdx) => {
    if (!tokens.length) return [];
    const myLen = tokens.length;
    const myTf  = new Map();
    for (const t of tokens) myTf.set(t, (myTf.get(t) ?? 0) + 1);

    const otherTokens = tokenized.flatMap((toks, j) => (j === chatIdx ? [] : toks));
    const otherLen    = otherTokens.length || 1;
    const otherTf     = new Map();
    for (const t of otherTokens) otherTf.set(t, (otherTf.get(t) ?? 0) + 1);

    const scores = new Map();
    for (const [t, count] of myTf) {
      if (t.length < MIN_TERM_LEN || STOP.has(t)) continue;
      const myRate    = count / myLen;
      const otherRate = (otherTf.get(t) ?? 0) / otherLen;
      const score     = (myRate - otherRate) * (idf.get(t) ?? 1);
      if (score > 0) scores.set(t, score);
    }

    return Array.from(scores.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, topN)
      .map(([term]) => term);
  });
}

function renderTopicFingerprintCard(chats, allTurns, chatLabels) {
  const fingerprints = buildTopicFingerprints(allTurns);

  const columns = chats.map((c, i) => {
    const label = escapeHtml(chatLabels?.[i] ?? (c ? (c.title ?? `Chat ${i + 1}`) : `Chat ${i + 1}`));
    const terms  = fingerprints[i] ?? [];
    const pills  = terms.length
      ? terms.map(t => `<span class="fingerprint-term">${escapeHtml(t)}</span>`).join('')
      : `<span class="fingerprint-empty">—</span>`;
    return (
      `<div class="fingerprint-col">` +
      `<div class="fingerprint-col__heading">${label}</div>` +
      `<div class="fingerprint-col__terms">${pills}</div>` +
      `</div>`
    );
  });

  const { card, body } = makeCollapsibleCard('Topic Fingerprint');
  body.innerHTML =
    `<p class="analysis-card__hint">Terms each chat emphasises that are less prominent in the others.</p>` +
    `<div class="fingerprint-grid">${columns.join('')}</div>`;

  return card;
}



// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', init);
}
