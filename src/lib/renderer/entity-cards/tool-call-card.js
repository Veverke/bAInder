/**
 * tool-call-card.js — DOM card renderer for Tool Call entities.
 *
 * Renders: tool-type badge (icon + label), input summary (first 100 chars),
 * output preview (first 150 chars), collapsible "Show full" section for
 * complete input + output text.
 */

// ---------------------------------------------------------------------------
// Tool type → display label mapping
// ---------------------------------------------------------------------------

const TOOL_LABELS = {
  web_search:       'Web Search',
  code_interpreter: 'Code Interpreter',
  browser:          'Browser',
  function:         'Function',
  unknown:          'Tool',
};

const TOOL_ICONS = {
  web_search:       '🔍',
  code_interpreter: '💻',
  browser:          '🌐',
  function:         '⚙️',
  unknown:          '🔧',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function _trunc(str, max) {
  if (!str) return '';
  return str.length > max ? str.slice(0, max) + '\u2026' : str;
}

// ---------------------------------------------------------------------------
// Public renderer
// ---------------------------------------------------------------------------

/**
 * Build a card element for a Tool Call entity.
 *
 * @param {Object}   entity
 * @param {Object}   [opts={}]
 * @param {Function} [opts.onOpen]  Called with the entity when the card is clicked
 * @returns {HTMLElement}
 */
export function toolCallCard(entity, { onOpen } = {}) {
  const { tool = 'unknown', input = '', output = '' } = entity;

  const el = document.createElement('div');
  el.className = 'entity-card entity-card--tool-call';
  if (onOpen) {
    el.addEventListener('click', () => onOpen(entity));
  }

  // ── Badge (icon + label) ─────────────────────────────────────────────────
  const badge = document.createElement('span');
  badge.className = 'entity-card__badge entity-card__badge--tool';
  badge.textContent = `${TOOL_ICONS[tool] ?? TOOL_ICONS.unknown} ${TOOL_LABELS[tool] ?? tool}`;
  el.appendChild(badge);

  // ── Input summary (first 100 chars) ──────────────────────────────────────
  if (input) {
    const inputSummary = document.createElement('p');
    inputSummary.className = 'entity-card__tool-input';
    inputSummary.textContent = _trunc(input, 100);
    el.appendChild(inputSummary);
  }

  // ── Output preview (first 150 chars) ─────────────────────────────────────
  if (output) {
    const outputPreview = document.createElement('p');
    outputPreview.className = 'entity-card__tool-output';
    outputPreview.textContent = _trunc(output, 150);
    el.appendChild(outputPreview);
  }

  // ── "Show full" collapsible section ──────────────────────────────────────
  if (input || output) {
    const details = document.createElement('details');
    details.className = 'entity-card__tool-details';

    const summary = document.createElement('summary');
    summary.className = 'entity-card__tool-details-toggle';
    summary.textContent = 'Show full';
    details.appendChild(summary);

    if (input) {
      const inputFull = document.createElement('pre');
      inputFull.className = 'entity-card__tool-input-full';
      inputFull.textContent = input;
      details.appendChild(inputFull);
    }

    if (output) {
      const outputFull = document.createElement('pre');
      outputFull.className = 'entity-card__tool-output-full';
      outputFull.textContent = output;
      details.appendChild(outputFull);
    }

    el.appendChild(details);
  }

  return el;
}
