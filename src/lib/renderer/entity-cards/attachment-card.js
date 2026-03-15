/**
 * attachment-card.js — DOM card renderer for Attachment entities.
 *
 * Renders: file-type icon (determined from mimeType/extension), filename,
 * size badge (if sizeBytes is available), "Original file on [platform]" notice,
 * "Go to message" link (via onOpen callback).
 */

// ---------------------------------------------------------------------------
// MIME type → icon mapping
// ---------------------------------------------------------------------------

/**
 * Return a text icon for a given MIME type.
 *
 * @param {string|null} mimeType
 * @param {string|null} filename  Fallback when mimeType is null
 * @returns {string}
 */
function _fileIcon(mimeType, filename) {
  const mime = mimeType ?? '';
  if (mime.startsWith('image/'))                    return '🖼️';
  if (mime.startsWith('audio/'))                    return '🎵';
  if (mime.startsWith('video/'))                    return '🎬';
  if (mime === 'application/pdf')                   return '📄';
  if (mime.includes('spreadsheet') || mime === 'text/csv') return '📊';
  if (mime.includes('wordprocessingml') || mime === 'application/msword') return '📝';
  if (mime === 'application/zip' || mime.includes('zip')) return '🗜️';
  if (mime === 'text/plain' || mime === 'text/markdown') return '📃';
  if (mime === 'application/json' || mime.startsWith('text/')) return '📜';
  // Extension fallback
  const ext = filename?.split('.').pop()?.toLowerCase();
  if (ext === 'pdf')  return '📄';
  if (ext === 'csv')  return '📊';
  if (ext === 'zip')  return '🗜️';
  return '📎';
}

// ---------------------------------------------------------------------------
// Size formatting
// ---------------------------------------------------------------------------

/**
 * Format a byte count as a human-readable size string (KB / MB).
 *
 * @param {number|null} bytes
 * @returns {string|null}
 */
function _formatSize(bytes) {
  if (bytes == null || typeof bytes !== 'number') return null;
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024)        return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

// ---------------------------------------------------------------------------
// Public renderer
// ---------------------------------------------------------------------------

/**
 * Build a card element for an Attachment entity.
 *
 * @param {Object}   entity
 * @param {Object}   [opts={}]
 * @param {Function} [opts.onOpen]  Called with the entity to navigate to the message
 * @returns {HTMLElement}
 */
export function attachmentCard(entity, { onOpen } = {}) {
  const { filename = null, mimeType = null, sizeBytes = null } = entity;

  const el = document.createElement('div');
  el.className = 'entity-card entity-card--attachment';

  // ── File-type icon + filename ─────────────────────────────────────────────
  const header = document.createElement('div');
  header.className = 'entity-card__attachment-header';

  const icon = document.createElement('span');
  icon.className = 'entity-card__attachment-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = _fileIcon(mimeType, filename);
  header.appendChild(icon);

  const nameEl = document.createElement('span');
  nameEl.className = 'entity-card__attachment-name';
  nameEl.textContent = filename ?? 'Untitled file';
  header.appendChild(nameEl);

  el.appendChild(header);

  // ── Size badge ────────────────────────────────────────────────────────────
  const formattedSize = _formatSize(sizeBytes);
  if (formattedSize) {
    const sizeBadge = document.createElement('span');
    sizeBadge.className = 'entity-card__badge entity-card__badge--size';
    sizeBadge.textContent = formattedSize;
    el.appendChild(sizeBadge);
  }

  // ── "Original file on [platform]" notice ─────────────────────────────────
  const notice = document.createElement('p');
  notice.className = 'entity-card__attachment-notice';
  notice.textContent = 'Original file on platform — open the chat to access it.';
  el.appendChild(notice);

  // ── "Go to message" link ─────────────────────────────────────────────────
  if (onOpen) {
    const goBtn = document.createElement('button');
    goBtn.className = 'entity-card__btn entity-card__btn--goto';
    goBtn.textContent = 'Go to message';
    goBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      onOpen(entity);
    });
    el.appendChild(goBtn);
  }

  return el;
}
