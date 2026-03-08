/**
 * sparkline.js — weekly-activity sparkline SVG factory (feature U3)
 *
 * Pure function: builds an SVG sparkline showing chat-save frequency over the
 * last N weeks for a given topic. No side-effects, no DOM reads.
 */

const WEEKS   = 6;
const BAR_W   = 6;
const GAP     = 2;
const HEIGHT  = 16;
const NS      = 'http://www.w3.org/2000/svg';
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const WIDTH   = WEEKS * (BAR_W + GAP) - GAP;

const WEEK_LABELS = ['5 weeks ago', '4 weeks ago', '3 weeks ago', '2 weeks ago', 'Last week', 'This week'];

/**
 * Build an SVG sparkline element showing weekly chat activity for `topicId`.
 * @param {string}   topicId  — topic whose chats are counted
 * @param {Object[]} chats    — full flat chats array (all topics, all chats)
 * @returns {SVGElement}
 */
export function buildSparklineEl(topicId, chats) {
  const now    = Date.now();
  const counts = new Array(WEEKS).fill(0);

  chats
    .filter(c => c.topicId === topicId && c.timestamp)
    .forEach(c => {
      const age = Math.floor((now - new Date(c.timestamp).getTime()) / WEEK_MS);
      if (age >= 0 && age < WEEKS) counts[WEEKS - 1 - age]++;
    });

  const max = Math.max(...counts, 1);
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class',     'tree-sparkline');
  svg.setAttribute('width',     WIDTH);
  svg.setAttribute('height',    HEIGHT);
  svg.setAttribute('viewBox',   `0 0 ${WIDTH} ${HEIGHT}`);
  svg.setAttribute('aria-hidden', 'true');

  const total = counts.reduce((a, b) => a + b, 0);
  const svgTitle = document.createElementNS(NS, 'title');
  svgTitle.textContent = `Activity last 6 weeks: ${total} ${total === 1 ? 'chat' : 'chats'} total`;
  svg.appendChild(svgTitle);

  counts.forEach((count, i) => {
    const h    = Math.max(Math.round((count / max) * HEIGHT), 2);
    const rect = document.createElementNS(NS, 'rect');
    rect.setAttribute('x',      i * (BAR_W + GAP));
    rect.setAttribute('y',      HEIGHT - h);
    rect.setAttribute('width',  BAR_W);
    rect.setAttribute('height', h);
    rect.setAttribute('rx',     '1');
    const barTitle = document.createElementNS(NS, 'title');
    barTitle.textContent = `${WEEK_LABELS[i]}: ${count} ${count === 1 ? 'chat' : 'chats'}`;
    rect.appendChild(barTitle);
    svg.appendChild(rect);
  });

  return svg;
}
