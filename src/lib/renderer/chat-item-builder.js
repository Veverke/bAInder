/**
 * chat-item-builder.js — DOM factory for chat <li> rows in the tree
 *
 * Responsibility: build a fully-wired <li> element for one chat entry,
 * including source chip, badges, tag chips + hover overlay, multi-select
 * checkbox, ripple effect, context menu, and drag source.
 *
 * RendererCtx (subset used here):
 *   nodeIndex         {{value: number}}  — shared mutable counter (by-ref)
 *   multiSelectMode   {boolean}
 *   selectedChatIds   {Set<string>}
 *   container         {HTMLElement}
 *   getDrag           {() => Object|null}
 *   setDrag           {(d: Object|null) => void}
 *   onChatClick       {Function|null}
 *   onChatContextMenu {Function|null}
 *   onChatDrop        {Function|null}
 *   toggleChatSelection {(id: string) => void}
 */

import { getTagColor } from './tag-color.js';

const SOURCE_LABELS = {
  chatgpt: 'ChatGPT',
  claude:  'Claude',
  gemini:  'Gemini',
  copilot: 'Copilot',
  perplexity: 'Perplexity',
  deepseek:   'DeepSeek',
};

// C.25 — entity type display labels for the hover overlay (excludes 'prompt'
// which is shown as part of the message-count row, and 'code' which gets its
// own language-breakdown row).
const _ENTITY_OVERLAY_LABELS = {
  citation:   'Citations',
  table:      'Tables',
  diagram:    'Diagrams',
  toolCall:   'Tool Calls',
  attachment: 'Attachments',
  image:      'Images',
  audio:      'Audio',
  artifact:   'Artifacts',
};

/**
 * Build the inner content fragment for the C.25 chat hover overlay.
 * Returns a DocumentFragment with one or more `.hover-row` divs, or null if
 * there is nothing meaningful to show.
 * @param {Object} chat — chat entry from state.chats
 * @returns {DocumentFragment|null}
 */
function _buildChatInfoOverlay(chat) {
  const frag = document.createDocumentFragment();
  let rowCount = 0;

  const addRow = (className, text) => {
    const row = document.createElement('div');
    row.className = `hover-row ${className}`;
    row.textContent = text;
    frag.appendChild(row);
    rowCount++;
  };

  // ── Size + total message count ──────────────────────────────────────────
  const sizeKB = chat.content
    ? `${(chat.content.length / 1024).toFixed(1)} KB`
    : null;
  const msgCount = chat.messageCount ?? 0;
  const metaParts = [];
  if (sizeKB) metaParts.push(sizeKB);
  if (msgCount > 0) metaParts.push(`${msgCount} ${msgCount === 1 ? 'message' : 'messages'}`);
  if (metaParts.length > 0) addRow('hover-row--meta', metaParts.join(' · '));

  // ── Prompt / response split ─────────────────────────────────────────────
  if (msgCount > 0) {
    const promptCount   = chat.prompt?.length ?? 0;
    const responseCount = msgCount - promptCount;
    addRow('hover-row--turns',
      `${promptCount} ${promptCount === 1 ? 'prompt' : 'prompts'} · ` +
      `${responseCount} ${responseCount === 1 ? 'response' : 'responses'}`);
  }

  // ── Code snippet language breakdown ─────────────────────────────────────
  if (Array.isArray(chat.code) && chat.code.length > 0) {
    const langCounts = {};
    for (const entity of chat.code) {
      const lang = entity.language || 'text';
      langCounts[lang] = (langCounts[lang] ?? 0) + 1;
    }
    const langStr = Object.entries(langCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([lang, n]) => `${lang}: ${n}`)
      .join(', ');
    addRow('hover-row--code', `Code: ${langStr}`);
  }

  // ── Other entity-type counts ─────────────────────────────────────────────
  const entityParts = [];
  for (const [key, label] of Object.entries(_ENTITY_OVERLAY_LABELS)) {
    const count = chat[key]?.length ?? 0;
    if (count > 0) entityParts.push(`${label}: ${count}`);
  }
  if (entityParts.length > 0) addRow('hover-row--entities', entityParts.join(' · '));

  // ── Tag pills ────────────────────────────────────────────────────────────
  const tags = chat.tags || [];
  if (tags.length > 0) {
    const tagsRow = document.createElement('div');
    tagsRow.className = 'hover-row hover-row--tags';
    tags.forEach(tag => {
      const pill = document.createElement('span');
      pill.className = 'tree-tag-chip tree-tag-chip--overlay';
      pill.style.setProperty('--tag-hue', getTagColor(tag));
      pill.textContent = tag;
      tagsRow.appendChild(pill);
    });
    frag.appendChild(tagsRow);
    rowCount++;
  }

  return rowCount > 0 ? frag : null;
}

/**
 * Build a rendered <li> element for one chat entry.
 * @param {Object}      chat
 * @param {number}      level  — indentation depth
 * @param {Object}      ctx    — RendererCtx
 * @returns {HTMLElement}
 */
export function buildChatItem(chat, level, ctx) {
  const li = document.createElement('li');
  li.className = 'tree-node tree-chat-item';
  li.setAttribute('role', 'treeitem');
  li.setAttribute('data-chat-id', chat.id);
  li.style.setProperty('--node-index', ctx.nodeIndex.value++);

  // C.17 — mark selected items in multi-select mode
  if (ctx.multiSelectMode && ctx.selectedChatIds.has(chat.id)) {
    li.classList.add('tree-chat-item--selected');
  }

  // Source attribute drives CSS left-border accent colour
  const source = chat.source || 'unknown';
  li.setAttribute('data-source', source);

  const content = document.createElement('div');
  content.className = 'tree-node-content';
  content.style.paddingLeft = `${level * 20}px`;
  content.tabIndex = 0; // U6 keyboard navigation

  // ── Checkbox (multi-select) or indent spacer ────────────────────────────
  if (ctx.multiSelectMode) {
    const cb = document.createElement('input');
    cb.type      = 'checkbox';
    cb.className = 'tree-chat-checkbox';
    cb.checked   = ctx.selectedChatIds.has(chat.id);
    cb.setAttribute('aria-label', `Select "${chat.title || 'Untitled Chat'}"`);
    cb.addEventListener('click', (e) => {
      // Stop the click from bubbling to the `li` row handler, which would call
      // toggleChatSelection a second time and immediately undo the selection.
      // NOTE: do NOT call e.preventDefault() here — that would cause the browser
      // to revert the checkbox's visual checked state after the handler returns.
      e.stopPropagation();
      ctx.toggleChatSelection(chat.id);
    });
    content.appendChild(cb);
  } else {
    const spacer = document.createElement('span');
    spacer.className = 'tree-expand-spacer';
    content.appendChild(spacer);
  }

  // ── Icon: assembled vs excerpt vs full chat ───────────────────────────
  const icon = document.createElement('span');
  icon.className   = 'tree-icon';
  if (chat.metadata?.isAssembled) {
    icon.textContent = '🔗';
    icon.title       = 'Assembled Chat';
  } else if (chat.metadata?.isExcerpt) {
    icon.textContent = '✂️';
    icon.title       = 'Chat Excerpt';
  } else {
    icon.textContent = '💬';
    icon.title       = 'Full Chat';
  }
  content.appendChild(icon);

  // ── Label ───────────────────────────────────────────────────────────────
  const label = document.createElement('span');
  label.className = 'tree-label';

  // Source badge chip (not shown for excerpts or assembled chats)
  if (!chat.metadata?.isExcerpt && !chat.metadata?.isAssembled) {
    const sourceChip = document.createElement('span');
    sourceChip.className   = `tree-source-chip tree-source-chip--${source}`;
    sourceChip.textContent = SOURCE_LABELS[source] || source;
    label.appendChild(sourceChip);
  }

  const labelText = document.createElement('span');
  labelText.className   = 'tree-label-text';
  labelText.textContent = chat.title || 'Untitled Chat';
  labelText.addEventListener('mouseenter', () => {
    labelText.title = labelText.scrollWidth > labelText.clientWidth
      ? (chat.title || 'Untitled Chat')
      : '';
  });
  label.appendChild(labelText);

  // Date badge
  if (chat.timestamp) {
    const dateBadge = document.createElement('span');
    dateBadge.className   = 'tree-timespan';
    dateBadge.textContent = new Date(chat.timestamp).toLocaleDateString(
      'en-US', { month: 'short', day: 'numeric', year: 'numeric' }
    );
    label.appendChild(dateBadge);
  }

  // C.15 — star rating badge
  if (chat.rating) {
    const ratingBadge = document.createElement('span');
    ratingBadge.className   = 'tree-rating-badge';
    ratingBadge.textContent = '★'.repeat(chat.rating);
    ratingBadge.title       = `${chat.rating} star${chat.rating > 1 ? 's' : ''}`;
    label.appendChild(ratingBadge);
  }

  // C.19 — stale review badge
  if (chat.flaggedAsStale) {
    const staleBadge = document.createElement('span');
    staleBadge.className   = 'tree-stale-badge';
    staleBadge.textContent = '⚠';
    staleBadge.title       = chat.reviewDate
      ? `Review was due ${chat.reviewDate}`
      : 'Flagged as stale — consider reviewing this chat';
    label.appendChild(staleBadge);
  }

  // ── Tag chips + hover overlay (C.25) ────────────────────────────────────
  const tags = chat.tags || [];
  if (tags.length > 0) {
    const tagsEl = document.createElement('span');
    tagsEl.className = 'tree-chat-tags';
    tags.forEach(tag => {
      const chip = document.createElement('span');
      chip.className = 'tree-tag-chip';
      chip.style.setProperty('--tag-hue', getTagColor(tag));
      chip.textContent = tag;
      tagsEl.appendChild(chip);
    });
    label.appendChild(tagsEl);
  }

  // C.25 — Rich hover overlay: size, message counts, code breakdown, entity counts, tags
  const _overlayContent = _buildChatInfoOverlay(chat);
  if (_overlayContent) {
    let _overlay = null;
    let _docOverListener = null;
    const _hideOverlay = () => {
      if (_overlay) { _overlay.remove(); _overlay = null; }
      if (_docOverListener) {
        document.removeEventListener('mouseover', _docOverListener);
        _docOverListener = null;
      }
    };
    const _showOverlay = (anchorRect) => {
      if (_overlay) return;
      _overlay = document.createElement('div');
      _overlay.className = 'tree-chat-hover-overlay';
      _overlay.appendChild(_overlayContent.cloneNode(true));
      document.body.appendChild(_overlay);
      const left = Math.min(anchorRect.left, window.innerWidth - 260);
      const top  = anchorRect.bottom + 4;
      _overlay.style.left = `${left}px`;
      _overlay.style.top  = `${top}px`;
      _docOverListener = (e) => {
        if (!document.contains(content) || !content.contains(e.target)) {
          _hideOverlay();
        }
      };
      document.addEventListener('mouseover', _docOverListener);
    };
    content.addEventListener('mouseenter', () => _showOverlay(content.getBoundingClientRect()));
    content.addEventListener('mouseleave', _hideOverlay);
  }

  content.appendChild(label);

  // ── ⋮ more-actions button (visible on hover) ─────────────────────────────
  const chatMoreBtn = document.createElement('button');
  chatMoreBtn.className = 'tree-more-btn';
  chatMoreBtn.setAttribute('aria-label', 'More actions');
  chatMoreBtn.textContent = '⋮';
  chatMoreBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (ctx.onChatContextMenu) ctx.onChatContextMenu(chat, e);
  });
  content.appendChild(chatMoreBtn);

  // ── Row click — toggle selection (C.17) or open chat ─────────────────────
  li.addEventListener('click', (e) => {
    if (ctx.multiSelectMode) {
      ctx.toggleChatSelection(chat.id);
      return;
    }
    // Ripple effect
    const ripple = document.createElement('span');
    ripple.className = 'tree-ripple';
    const rect = content.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    ripple.style.cssText = `width:${size}px;height:${size}px;` +
      `top:${e.clientY - rect.top - size / 2}px;` +
      `left:${e.clientX - rect.left - size / 2}px`;
    content.appendChild(ripple);
    ripple.addEventListener('animationend', () => ripple.remove(), { once: true });
    if (ctx.onChatClick) ctx.onChatClick(chat);
  });

  content.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (ctx.onChatContextMenu) ctx.onChatContextMenu(chat, e);
  });

  // ── Drag source ──────────────────────────────────────────────────────────
  content.draggable = true;
  content.addEventListener('dragstart', (e) => {
    ctx.setDrag({ type: 'chat', id: chat.id });
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', chat.id);
    const ghost = document.createElement('div');
    ghost.className   = 'tree-drag-ghost';
    ghost.textContent = `💬 ${chat.title || 'Untitled Chat'}`;
    document.body.appendChild(ghost);
    e.dataTransfer.setDragImage(ghost, 0, 14);
    requestAnimationFrame(() => ghost.remove());
    setTimeout(() => content.classList.add('dragging'), 0);
  });
  content.addEventListener('dragend', () => {
    content.classList.remove('dragging');
    ctx.setDrag(null);
    ctx.container.querySelectorAll('.drop-target').forEach(el => el.classList.remove('drop-target'));
  });

  li.appendChild(content);
  return li;
}
