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
import { logger } from '../../lib/utils/logger.js';
import {
  extractSnippet,
  highlightTerms,
  formatBreadcrumb,
  escapeHtml,
  applySearchFilters,
} from '../../lib/utils/search-utils.js';
import { getTagColor } from '../../lib/renderer/tree-renderer.js';
import { saveExpandedState } from './tree-controller.js';
import { handleChatClick } from './chat-actions.js';
let _state = state;
// ---------------------------------------------------------------------------
// Test injection hook - lets unit tests provide a mock app context instead of
// mutating the real singleton.  Never call from production code.
// ---------------------------------------------------------------------------
/** @internal */
export function _setContext(ctx) { _state = ctx; }


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

/** Return true when at least one filter criterion is currently set. */
function _hasActiveFilters() {
  const f = _state.filters;
  return f.sources.size > 0 || !!f.dateFrom || !!f.dateTo || !!f.topicId ||
    f.minRating != null || f.tags.size > 0;
}

/** Execute the storage search + tree highlight for a given query. */
function runSearch(query) {
  const searchContainer = elements.searchInput?.closest('.search-container');
  if (_state.renderer) {
    if (query) {
      _state.renderer.highlightSearch(query);
      _state.renderer.expandAll();
      saveExpandedState();
    } else {
      _state.renderer.clearHighlight();
    }
  }
  _state.storage.searchChats(query)
    .then(results => {
      searchContainer?.classList.remove('is-typing');
      const filtered = applySearchFilters(results, _state.filters, _state.tree);
      renderSearchResults(filtered, query);
    })
    .catch(err => {
      searchContainer?.classList.remove('is-typing');
      logger.error('Search failed:', err);
    });
}

const _handleSearchDeferred = debounce(runSearch, 250);

// ─── Public search handlers ──────────────────────────────────────────────────

/** Handle the search input `input` event. */
export function handleSearch(event) {
  const query = event.target.value.trim();
  _state.searchQuery = query;

  elements.clearSearchBtn.style.display = query ? 'block' : 'none';
  const searchContainer = elements.searchInput?.closest('.search-container');

  if (query) {
    searchContainer?.classList.add('is-typing');
    _handleSearchDeferred(query);
  } else {
    _handleSearchDeferred.cancel();
    searchContainer?.classList.remove('is-typing');
    if (_hasActiveFilters()) {
      _handleSearchDeferred('');
    } else {
      _state.renderer?.clearHighlight();
      hideSearchResults();
    }
  }
}

/** Clear the search input and reset all related _state. */
export function clearSearch() {
  _handleSearchDeferred.cancel();
  elements.searchInput.value = '';
  _state.searchQuery = '';
  elements.clearSearchBtn.style.display = 'none';
  if (_hasActiveFilters()) {
    runSearch('');
  } else {
    _state.renderer?.clearHighlight();
    hideSearchResults();
  }
}

/** Re-run the current search query (e.g. after filters change). */
export function rerunSearch() {
  if (_state.searchQuery || _hasActiveFilters()) {
    _handleSearchDeferred(_state.searchQuery);
  } else {
    hideSearchResults();
  }
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
        <p class="result-empty-state__sub">${query ? `Nothing matched <strong>&ldquo;${escapeHtml(query)}&rdquo;</strong>.<br>Try a shorter or different term.` : 'No chats match the current filters.<br>Try adjusting or clearing the filters.'}</p>
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
  const path       = (chat.topicId && _state.tree) ? _state.tree.getTopicPath(chat.topicId) : [];
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
    if (isOpen) {
      populateTopicScopeSelect();
      populateTagFilterPills();
    }
  });

  // Source pills
  elements.filterSourcePills?.querySelectorAll('.filter-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      const src = pill.dataset.source;
      if (_state.filters.sources.has(src)) {
        _state.filters.sources.delete(src);
        pill.classList.remove('is-active');
      } else {
        _state.filters.sources.add(src);
        pill.classList.add('is-active');
      }
      updateFilterIndicator();
      rerunSearch();
    });
  });

  // Date range
  elements.filterDateFrom?.addEventListener('change', () => {
    _state.filters.dateFrom = elements.filterDateFrom.value || null;
    updateFilterIndicator();
    rerunSearch();
  });
  elements.filterDateTo?.addEventListener('change', () => {
    _state.filters.dateTo = elements.filterDateTo.value || null;
    updateFilterIndicator();
    rerunSearch();
  });

  // Topic scope
  elements.filterTopicScope?.addEventListener('change', () => {
    _state.filters.topicId = elements.filterTopicScope.value;
    updateFilterIndicator();
    rerunSearch();
  });

  // C.15 — rating pills
  elements.filterRatingPills?.querySelectorAll('[data-min-rating]').forEach(pill => {
    pill.addEventListener('click', () => {
      const val = parseInt(pill.dataset.minRating, 10);
      if (_state.filters.minRating === val) {
        _state.filters.minRating = null;
        pill.classList.remove('is-active');
      } else {
        _state.filters.minRating = val;
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
    _state.filters.sources   = new Set();
    _state.filters.dateFrom  = null;
    _state.filters.dateTo    = null;
    _state.filters.topicId   = '';
    _state.filters.minRating = null;
    _state.filters.tags      = new Set();

    elements.filterSourcePills?.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('is-active'));
    elements.filterRatingPills?.querySelectorAll('[data-min-rating]').forEach(p => p.classList.remove('is-active'));
    elements.filterTagPills?.querySelectorAll('.filter-pill--tag').forEach(p => p.classList.remove('is-active'));
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
  if (!sel || !_state.tree) return;
  sel.innerHTML = '<option value="">All topics</option>';
  _state.tree.getRootTopics().forEach(topic => {
    const opt = document.createElement('option');
    opt.value       = topic.id;
    opt.textContent = topic.name;
    sel.appendChild(opt);
  });
  sel.value = _state.filters.topicId || '';
}

/** Toggle the filter-active indicator dot on the filter toggle button. */
export function updateFilterIndicator() {
  if (!elements.filterToggleBtn) return;
  const hasFilters =
    _state.filters.sources.size > 0 ||
    _state.filters.dateFrom          ||
    _state.filters.dateTo            ||
    _state.filters.topicId           ||
    _state.filters.minRating != null ||
    _state.filters.tags.size > 0;
  elements.filterToggleBtn.classList.toggle('has-active-filters', Boolean(hasFilters));
}

/**
 * Populate the tag filter pills from all saved chats.
 * Rebuilds the pill list each time the filter bar is opened.
 */
export function populateTagFilterPills() {
  const container = elements.filterTagPills;
  if (!container) return;

  const allTags = new Set();
  (_state.chats || []).forEach(chat => {
    (chat.tags || []).forEach(t => allTags.add(t));
  });

  if (allTags.size === 0) {
    container.innerHTML = '<span class="filter-pills__empty">No tags saved yet</span>';
    return;
  }

  const sorted = [...allTags].sort();
  container.innerHTML = sorted.map(tag => {
    const isActive = _state.filters.tags.has(tag);
    const hue = getTagColor(tag);
    return `<button class="filter-pill filter-pill--tag${isActive ? ' is-active' : ''}" data-tag="${escapeHtml(tag)}" style="--tag-hue:${hue}" title="${escapeHtml(tag)}">${escapeHtml(tag)}</button>`;
  }).join('');

  container.querySelectorAll('.filter-pill--tag').forEach(pill => {
    pill.addEventListener('click', () => {
      const tag = pill.dataset.tag;
      if (_state.filters.tags.has(tag)) {
        _state.filters.tags.delete(tag);
        pill.classList.remove('is-active');
      } else {
        _state.filters.tags.add(tag);
        pill.classList.add('is-active');
      }
      updateFilterIndicator();
      rerunSearch();
    });
  });
}
