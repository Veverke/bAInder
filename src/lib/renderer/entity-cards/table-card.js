/**
 * table-card.js — DOM card renderer for Table entities.
 *
 * Renders: mini <table> (header + first 2 rows), "Show all N rows" expand toggle,
 * "Copy as Markdown" button, "Export as CSV" button.
 */

// ── Serialisation helpers ────────────────────────────────────────────────────

function _toMarkdown(headers, rows) {
  const esc       = s => String(s ?? '').replace(/\|/g, '\\|');
  const headerRow = '| ' + headers.map(esc).join(' | ') + ' |';
  const sepRow    = '| ' + headers.map(() => '---').join(' | ') + ' |';
  const dataRows  = rows.map(r => '| ' + r.map(esc).join(' | ') + ' |');
  return [headerRow, sepRow, ...dataRows].join('\n');
}

function _toCSV(headers, rows) {
  const escCSV = s => {
    const str = String(s ?? '');
    return (str.includes(',') || str.includes('"') || str.includes('\n'))
      ? '"' + str.replace(/"/g, '""') + '"'
      : str;
  };
  const lines = [
    headers.map(escCSV).join(','),
    ...rows.map(r => r.map(escCSV).join(',')),
  ];
  return lines.join('\n');
}

// ── Card factory ─────────────────────────────────────────────────────────────

/**
 * Build a card element for a Table entity.
 *
 * @param {Object} entity
 * @returns {HTMLElement}
 */
export function tableCard(entity) {
  const { headers = [], rows = [], rowCount = 0 } = entity;

  const el = document.createElement('div');
  el.className = 'entity-card entity-card--table';

  // ── Mini <table> ─────────────────────────────────────────────────────────
  const table = document.createElement('table');
  table.className = 'entity-card__table';

  const thead = document.createElement('thead');
  const headerTr = document.createElement('tr');
  for (const h of headers) {
    const th = document.createElement('th');
    th.textContent = h;
    headerTr.appendChild(th);
  }
  thead.appendChild(headerTr);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  table.appendChild(tbody);

  const previewRows = rows.slice(0, 2);
  const extraRows   = rows.slice(2);

  for (const row of previewRows) {
    const tr = document.createElement('tr');
    for (const cell of row) {
      const td = document.createElement('td');
      td.textContent = cell;
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }

  const hiddenTrs = [];
  for (const row of extraRows) {
    const tr = document.createElement('tr');
    tr.hidden = true;
    for (const cell of row) {
      const td = document.createElement('td');
      td.textContent = cell;
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
    hiddenTrs.push(tr);
  }

  el.appendChild(table);

  // ── Expand toggle ────────────────────────────────────────────────────────
  if (extraRows.length > 0) {
    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'entity-card__btn entity-card__btn--toggle';
    toggleBtn.dataset.expanded = 'false';
    toggleBtn.textContent = `Show all ${rowCount} rows`;
    toggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const expanded = toggleBtn.dataset.expanded === 'true';
      hiddenTrs.forEach(tr => { tr.hidden = expanded; });
      toggleBtn.dataset.expanded = String(!expanded);
      toggleBtn.textContent = expanded ? `Show all ${rowCount} rows` : 'Show less';
    });
    el.appendChild(toggleBtn);
  }

  // ── Action buttons ───────────────────────────────────────────────────────
  const actions = document.createElement('div');
  actions.className = 'entity-card__actions';

  const copyMdBtn = document.createElement('button');
  copyMdBtn.className = 'entity-card__btn entity-card__btn--copy-md';
  copyMdBtn.textContent = 'Copy as Markdown';
  copyMdBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(_toMarkdown(headers, rows));
  });
  actions.appendChild(copyMdBtn);

  const exportCsvBtn = document.createElement('button');
  exportCsvBtn.className = 'entity-card__btn entity-card__btn--export-csv';
  exportCsvBtn.textContent = 'Export as CSV';
  exportCsvBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const csv  = _toCSV(headers, rows);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = 'table.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });
  actions.appendChild(exportCsvBtn);

  el.appendChild(actions);
  return el;
}
