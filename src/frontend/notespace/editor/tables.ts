/* =========================
   Table Headers
   ========================= */

/* Which edges of a table are headers: the first row, the first column, or both. */
/* Headers belong to a position, so after rows or columns move, the new first row or column becomes the header. */
export type TableHeaders = { row: boolean; column: boolean };

function emptyCell(tag: 'td' | 'th') {
  const cell = document.createElement(tag);
  cell.appendChild(document.createElement('br'));
  return cell;
}

export function tableHeaders(table: HTMLTableElement): TableHeaders {
  const rows = Array.from(table.rows);
  const row = Boolean(rows[0]?.cells.length) && Array.from(rows[0].cells).every(cell => cell.tagName === 'TH');
  const below = rows.slice(row ? 1 : 0);
  const column = below.length > 0 && below.every(line => line.cells[0]?.tagName === 'TH');
  return { row, column };
}

/* Turn cells into header cells (th) or normal cells (td), keeping what they contain. */
export function setHeaders(table: HTMLTableElement, headers: TableHeaders) {
  Array.from(table.rows).forEach((row, rowIndex) => {
    Array.from(row.cells).forEach((cell, columnIndex) => {
      const tag = (headers.row && rowIndex === 0) || (headers.column && columnIndex === 0) ? 'TH' : 'TD';
      if (cell.tagName === tag) return;
      const replacement = document.createElement(tag.toLowerCase());
      replacement.append(...Array.from(cell.childNodes));
      cell.replaceWith(replacement);
    });
  });
}

/* Fit to width (the default) stretches the table across the page; turning it off sizes columns to their text. */
export function isFitToWidth(table: HTMLTableElement) {
  return !table.classList.contains('fit-content');
}

export function setFitToWidth(table: HTMLTableElement, fit: boolean) {
  table.classList.toggle('fit-content', !fit);
  if (!table.classList.length) table.removeAttribute('class');
}


/* =========================
   Rows and Columns
   ========================= */

function columnCount(table: HTMLTableElement) {
  return Math.max(0, ...Array.from(table.rows).map(row => row.cells.length));
}

/* Add an empty row next to another row (below the last row when none is given). */
export function addRow(table: HTMLTableElement, after: HTMLTableRowElement | null = null) {
  const rows = Array.from(table.rows);
  const source = after ?? rows[rows.length - 1];
  return insertRow(table, rows.indexOf(source), 'below');
}

export function insertRow(table: HTMLTableElement, index: number, side: 'above' | 'below') {
  const headers = tableHeaders(table);
  const source = table.rows[index];
  const row = document.createElement('tr');
  for (let column = 0; column < columnCount(table); column += 1) row.appendChild(emptyCell('td'));
  if (side === 'above') source.before(row);
  else source.after(row);
  setHeaders(table, headers);
  return row;
}

export function addColumn(table: HTMLTableElement, after: number) {
  insertColumn(table, after, 'right');
}

export function insertColumn(table: HTMLTableElement, index: number, side: 'left' | 'right') {
  const headers = tableHeaders(table);
  Array.from(table.rows).forEach(row => {
    const cell = emptyCell('td');
    const neighbour = row.cells[index];
    if (!neighbour) row.appendChild(cell);
    else if (side === 'left') neighbour.before(cell);
    else neighbour.after(cell);
  });
  setHeaders(table, headers);
}

/* Removing the last row or column removes the whole table. Returns false when the table is now empty. */
export function removeRow(table: HTMLTableElement, row: HTMLTableRowElement) {
  const headers = tableHeaders(table);
  row.remove();
  setHeaders(table, headers);
  return table.rows.length > 0;
}

export function removeColumn(table: HTMLTableElement, index: number) {
  const headers = tableHeaders(table);
  Array.from(table.rows).forEach(row => row.cells[index]?.remove());
  setHeaders(table, headers);
  return Boolean(table.rows[0]?.cells.length);
}

/* Move a row so it ends up at position "to"; the other rows shift to make room. */
export function moveRow(table: HTMLTableElement, from: number, to: number) {
  const rows = Array.from(table.rows);
  if (from === to || !rows[from] || !rows[to]) return;
  const headers = tableHeaders(table);
  if (to < from) rows[to].before(rows[from]);
  else rows[to].after(rows[from]);
  setHeaders(table, headers);
}

export function moveColumn(table: HTMLTableElement, from: number, to: number) {
  if (from === to || to < 0 || to >= columnCount(table)) return;
  const headers = tableHeaders(table);
  Array.from(table.rows).forEach(row => {
    const cell = row.cells[from];
    const target = row.cells[to];
    if (!cell || !target) return;
    if (to < from) target.before(cell);
    else target.after(cell);
  });
  setHeaders(table, headers);
}
