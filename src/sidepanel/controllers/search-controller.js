/**
 * search-controller.js
 *
 * Responsibility: text search and filter-bar interactions.
 *
 * Covers:
 *  - debounced search input handler
 *  - search result rendering + result-card HTML builder
 *  - filter bar setup (source pills, date range, topic scope, rating pills)
 *  - topic-scope <select> population
 *  - filter-active indicator
 *
 * NOT responsible for: tree rendering, storage I/O, or chat/topic dialogs.
 */

import { state, elements } from '../app-context.js';
import {
  extractSnippet,
  highlightTerms,
  formatBreadcrumb,
  escapeHtml,
  applySearchFilters,
} from '../../lib/search-utils.js';
import { getTagColor } from '../../lib/tree-renderer.js';
import { saveExpandedState } from './tree-controller.js';
import { handleChatClick } from './chat-actions.js';

// ─── Debounce helper ─────────────────────────────────────────────────────────

/** Delays `fn` by `ms`; exposes `.cancel()` to abort a pending call. */
export function debounce(fn, ms) {
  let timer;
  const debounced = (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
  debounced.cancel = () => clearTimeout(timer);
  return debounced;
}

// ─── Internal deferred search ────────────────────────────────────────────────

/** Execute the storage search + tree highlight for a given query. */
function runSearch(query) {
  const searchContainer = elements.searchInput?.closest('.search-container');
  if (state.renderer) {
    state.renderer.highlightSearch(query);
    state.renderer.expandAll();
    saveExpandedState();
  }
  state.storage.searchChats(query)
    .then(results => {
      searchContainer?.classList.remove('is-typing');
      const filtered = applySearchFilters(results, state.filters, state.tree);
      renderSearchResults(filtered, query);
    })
    .catch(err => {
      searchContainer?.classList.remove('is-typing');
      console.error('Search failed:', err);
    });
}

const _handleSearchDeferred = debounce(runSearch, 250);

// ─── Public search handlers ──────────────────────────────────────────────────

/** Handle the search input `input` event. */
export function handleSearch(event) {
  const query = event.target.value.trim();
  state.searchQuery = query;

  elements.clearSearchBtn.style.display = query ? 'block' : 'none';
  const searchContainer = elements.searchInput?.closest('.search-container');

  if (query) {
    searchContainer?.classList.add('is-typing');
    _handleSearchDeferred(query);
  } else {
    _handleSearchDeferred.cancel();
    searchContainer?.classList.remove('is-typing');
    state.renderer?.clearHighlight();
    hideSearchResults();
  }
}

/** Clear the search input and reset all related state. */
export function clearSearch() {
  _handleSearchDeferred.cancel();
  elements.searchInput.value = '';
  state.searchQuery = '';
  elements.clearSearchBtn.style.display = 'none';
  state.renderer?.clearHighlight();
  hideSearchResults();
}

/** Re-run the current search query (e.g. after filters change). */
export function rerunSearch() {
  if (state.searchQuery) _handleSearchDeferred(state.searchQuery);
}

// ─── Result rendering ────────────────────────────────────────────────────────

export function renderSearchResults(results, query) {
  elements.searchResults.style.display = 'block';
  const n = results.length;
  elements.resultCount.textContent = n === 1 ? '1 result' : `${n} results`;

  // A4 — badge morph animation on count change
  elements.resultCount.classList.remove('badge--morphing');
  void elements.resultCount.offsetWidth; // force reflow
  elements.resultCount.classList.add('badge--morphing');
  elements.resultCount.addEventListener('animationend',
    () => elements.resultCount.classList.remove('badge--morphing'), { once: true });

  if (n === 0) {
    elements.searchResultsList.innerHTML = `
      <div class="result-empty-state">
        <svg class="result-empty-state__icon" width="52" height="52" viewBox="0 0 52 52" fill="none" aria-hidden="true">
          <circle cx="23" cy="23" r="14" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
          <path d="M33.5 33.5L44 44" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
          <path d="M19 23h8" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity="0.5"/>
          <path d="M23 19v8" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity="0.5"/>
          <circle cx="23" cy="23" r="5" stroke="currentColor" stroke-width="1.4" stroke-dasharray="2.5 2.5" opacity="0.35"/>
        </svg>
        <p class="result-empty-state__title">No matches found</p>
        <p class="result-empty-state__sub">Nothing matched <strong>&ldquo;${escapeHtml(query)}&rdquo;</strong>.<br>Try a shorter or different term.</p>
      </div>`;
    return;
  }

  elements.searchResultsList.innerHTML = results.map(buildResultCard.bind(null, query)).join('');

  elements.searchResultsList.querySelectorAll('.result-card').forEach((card, i) => {
    const open = () => handleChatClick(results[i]);
    card.addEventListener('click', open);
    card.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
    });
  });
}

/** Build a single result-card HTML string. */
export function buildResultCard(query, chat) {
  const LABELS = { chatgpt: 'ChatGPT', claude: 'Claude', gemini: 'Gemini', copilot: 'Copilot' };
  const KNOWN_SOURCES = Object.keys(LABELS);
  const source     = chat.source || 'unknown';
  const badgeCls   = KNOWN_SOURCES.includes(source) ? `badge badge--${source}` : 'badge badge--unknown';
  const sourceText = LABELS[source] || (source.charAt(0).toUpperCase() + source.slice(1));
  const title      = chat.title || 'Untitled Chat';
  const snippet    = extractSnippet(chat.content || '', query);
  const path       = (chat.topicId && state.tree) ? state.tree.getTopicPath(chat.topicId) : [];
  const breadcrumb = formatBreadcrumb(path);
  const tags       = chat.tags || [];

  const titleHtml   = highlightTerms(title, query);
  const snippetHtml = snippet ? highlightTerms(snippet, query) : '';
  const snippetEl   = snippetHtml ? `<p class="result-snippet">${snippetHtml}</p>` : '';

  const tagsHtml = tags.length > 0
    ? `<div class="result-tags">${tags.map(t => {
        const isMatch = t.toLowerCase().includes(query.toLowerCase());
        const style = isMatch ? '' : ` style="--tag-hue:${getTagColor(t)}"`;
        return `<span class="result-tag-chip${isMatch ? ' result-tag-chip--match' : ''}"${style}>${escapeHtml(t)}</span>`;
      }).join('')}</div>`
    : '';

  const ratingHtml = chat.rating
    ? `<span class="result-rating" title="${chat.rating} star${chat.rating > 1 ? 's' : ''}">${'★'.repeat(chat.rating)}${'☆'.repeat(5 - chat.rating)}</span>`
    : '';

  return (
    `<article class="result-card" role="button" tabindex="0" aria-label="${escapeHtml(title)}">
      <div class="result-header">
        <span class="result-title">${titleHtml}</span>
        ${ratingHtml}
        <span class="${badgeCls}">${escapeHtml(sourceText)}</span>
      </div>
      ${snippetEl}
      ${tagsHtml}
      <div class="result-breadcrumb">${escapeHtml(breadcrumb)}</div>
    </article>`
  );
}

export function hideSearchResults() {
  elements.searchResults.style.display = 'none';
  elements.searchResultsList.innerHTML = '';
}

// ─── C.3 Filter bar ──────────────────────────────────────────────────────────

export function setupFilterBar() {
  // Open/close
  elements.filterToggleBtn?.addEventListener('click', () => {
    const bar = elements.searchFilterBar;
    if (!bar) return;
    const isOpen = bar.classList.toggle('is-open');
    elements.filterToggleBtn.setAttribute('aria-expanded', String(isOpen));
    bar.setAttribute('aria-hidden', String(!isOpen));
    if (isOpen) populateTopicScopeSelect();
  });

  // Source pills
  elements.filterSourcePills?.querySelectorAll('.filter-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      const src = pill.dataset.source;
      if (state.filters.sources.has(src)) {
        state.filters.sources.delete(src);
        pill.classList.remove('is-active');
      } else {
        state.filters.sources.add(src);
        pill.classList.add('is-active');
      }
      updateFilterIndicator();
      rerunSearch();
    });
  });

  // Date range
  elements.filterDateFrom?.addEventListener('change', () => {
    state.filters.dateFrom = elements.filterDateFrom.value || null;
    updateFilterIndicator();
    rerunSearch();
  });
  elements.filterDateTo?.addEventListener('change', () => {
    state.filters.dateTo = elements.filterDateTo.value || null;
    updateFilterIndicator();
    rerunSearch();
  });

  // Topic scope
  elements.filterTopicScope?.addEventListener('change', () => {
    state.filters.topicId = elements.filterTopicScope.value;
    updateFilterIndicator();
    rerunSearch();
  });

  // C.15 — rating pills
  elements.filterRatingPills?.querySelectorAll('[data-min-rating]').forEach(pill => {
    pill.addEventListener('click', () => {
      const val = parseInt(pill.dataset.minRating, 10);
      if (state.filters.minRating === val) {
        state.filters.minRating = null;
        pill.classList.remove('is-active');
      } else {
        state.filters.minRating = val;
        elements.filterRatingPills
          .querySelectorAll('[data-min-rating]')
          .forEach(p => p.classList.remove('is-active'));
        pill.classList.add('is-active');
      }
      updateFilterIndicator();
      rerunSearch();
    });
  });

  // Clear all filters
  elements.filterClearBtn?.addEventListener('click', () => {
    state.filters.sources   = new Set();
    state.filters.dateFrom  = null;
    state.filters.dateTo    = null;
    state.filters.topicId   = '';
    state.filters.minRating = null;

    elements.filterSourcePills?.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('is-active'));
    elements.filterRatingPills?.querySelectorAll('[data-min-rating]').forEach(p => p.classList.remove('is-active'));
    if (elements.filterDateFrom)   elements.filterDateFrom.value   = '';
    if (elements.filterDateTo)     elements.filterDateTo.value     = '';
    if (elements.filterTopicScope) elements.filterTopicScope.value = '';

    updateFilterIndicator();
    rerunSearch();
  });
}

/**
 * Populate the topic-scope <select> from the current tree.
 * Safe to call multiple times — clears and rebuilds each time.
 */
export function populateTopicScopeSelect() {
  const sel = elements.filterTopicScope;
  if (!sel || !state.tree) return;
  sel.innerHTML = '<option value="">All topics</option>';
  state.tree.getRootTopics().forEach(topic => {
    const opt = document.createElement('option');
    opt.value       = topic.id;
    opt.textContent = topic.name;
    sel.appendChild(opt);
  });
  sel.value = state.filters.topicId || '';
}

/** Toggle the filter-active indicator dot on the filter toggle button. */
export function updateFilterIndicator() {
  if (!elements.filterToggleBtn) return;
  const hasFilters =
    state.filters.sources.size > 0 ||
    state.filters.dateFrom       ||
    state.filters.dateTo         ||
    state.filters.topicId        ||
    state.filters.minRating != null;
  elements.filterToggleBtn.classList.toggle('has-active-filters', Boolean(hasFilters));
}
