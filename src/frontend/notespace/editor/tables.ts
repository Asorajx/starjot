/* =========================
   Table Grid
   ========================= */

/* Where a cell sits in the table's grid: its top-left row and column, and how many rows and */
/* columns it covers (more than one for a merged cell). */
export type CellPlace = { row: number; column: number; rows: number; columns: number };

/* A rectangle of grid rows and columns, from top to bottom and left to right (inclusive). */
export type CellRange = { top: number; bottom: number; left: number; right: number };

/* The grid behind a table. grid[row][column] is the cell covering that spot; a merged cell */
/* covers several spots, so the HTML position of a cell is not always its column. */
export function tableGrid(table: HTMLTableElement) {
  const rows = Array.from(table.rows);
  const grid: HTMLTableCellElement[][] = rows.map(() => []);
  const places = new Map<HTMLTableCellElement, CellPlace>();

  rows.forEach((row, rowIndex) => {
    let column = 0;
    Array.from(row.cells).forEach(cell => {
      while (grid[rowIndex][column]) column += 1;
      const place = {
        row: rowIndex,
        column,
        rows: Math.min(Math.max(1, cell.rowSpan || 1), rows.length - rowIndex),
        columns: Math.max(1, cell.colSpan || 1)
      };
      places.set(cell, place);
      for (let y = rowIndex; y < rowIndex + place.rows; y += 1) {
        for (let x = column; x < column + place.columns; x += 1) grid[y][x] = cell;
      }
      column += place.columns;
    });
  });
  return { grid, places, width: Math.max(0, ...grid.map(line => line.length)) };
}

export function hasMergedCells(table: HTMLTableElement) {
  return Array.from(table.querySelectorAll<HTMLTableCellElement>('th, td')).some(cell => cell.rowSpan > 1 || cell.colSpan > 1);
}

/* The cells covering a grid row (or column), each listed once even when merged. */
export function cellsInRow(table: HTMLTableElement, row: number) {
  return [...new Set(tableGrid(table).grid[row] ?? [])].filter(Boolean);
}

export function cellsInColumn(table: HTMLTableElement, column: number) {
  return [...new Set(tableGrid(table).grid.map(line => line[column]))].filter(Boolean);
}

function emptyCell(tag: 'td' | 'th') {
  const cell = document.createElement(tag);
  cell.appendChild(document.createElement('br'));
  return cell;
}

/* Put a cell into a row at a grid column, before the first cell of that row further right. */
function placeInRow(row: HTMLTableRowElement, column: number, cell: HTMLTableCellElement, places: Map<HTMLTableCellElement, CellPlace>) {
  const after = Array.from(row.cells).find(item => (places.get(item)?.column ?? 0) > column);
  row.insertBefore(cell, after ?? null);
}

/* Remove rows that no longer hold or are covered by any cell, which can happen after deleting a column. */
function removeEmptyRows(table: HTMLTableElement) {
  const { grid } = tableGrid(table);
  Array.from(table.rows).reverse().forEach(row => {
    const index = Array.from(table.rows).indexOf(row);
    if (!grid[index]?.some(Boolean)) row.remove();
  });
}


/* =========================
   Table Headers
   ========================= */

/* Which edges of a table are headers: the first row, the first column, or both. */
/* Headers belong to a position, so after rows or columns move, the new first row or column becomes the header. */
export type TableHeaders = { row: boolean; column: boolean };

export function tableHeaders(table: HTMLTableElement): TableHeaders {
  const { places } = tableGrid(table);
  const cells = [...places.entries()];
  const firstRow = cells.filter(([, place]) => place.row === 0);
  const row = firstRow.length > 0 && firstRow.every(([cell]) => cell.tagName === 'TH');
  const firstColumn = cells.filter(([, place]) => place.column === 0 && (!row || place.row > 0));
  const column = firstColumn.length > 0 && firstColumn.every(([cell]) => cell.tagName === 'TH');
  return { row, column };
}

/* Turn cells into header cells (th) or normal cells (td), keeping what they contain and how far they stretch. */
export function setHeaders(table: HTMLTableElement, headers: TableHeaders) {
  tableGrid(table).places.forEach((place, cell) => {
    const tag = (headers.row && place.row === 0) || (headers.column && place.column === 0) ? 'TH' : 'TD';
    if (cell.tagName === tag) return;
    const replacement = document.createElement(tag.toLowerCase());
    Array.from(cell.attributes).forEach(attribute => replacement.setAttribute(attribute.name, attribute.value));
    replacement.append(...Array.from(cell.childNodes));
    cell.replaceWith(replacement);
  });
}

/* Fit to width (the default) stretches the table across the page; turning it off sizes columns to their text. */
export function isFitToWidth(table: HTMLTableElement) {
  return !table.classList.contains('fit-content');
}

export function setFitToWidth(table: HTMLTableElement, fit: boolean) {
  table.classList.toggle('fit-content', !fit);
  if (!table.classList.length) table.removeAttribute('class');
  updateTableWidth(table);
}


/* =========================
   Column Widths and Row Heights
   ========================= */

/* Dragged borders stop at these sizes, so a column or row can never disappear. */
export const MIN_COLUMN_WIDTH = 48;
export const MIN_ROW_HEIGHT = 28;

/* Column widths are stored on <col> elements in a <colgroup>, which only exists once a column border */
/* has been dragged. Row heights are stored on each row. Only the numbers are saved (data-width and */
/* data-height); the sizes are applied as styles each time the table is shown. */
export function columnElements(table: HTMLTableElement) {
  return Array.from(table.querySelectorAll<HTMLTableColElement>(':scope > colgroup > col'));
}

export function setColumnWidth(col: HTMLTableColElement, width: number) {
  const size = Math.round(Math.max(MIN_COLUMN_WIDTH, width));
  col.dataset.width = String(size);
  col.style.width = `${size}px`;
  return size;
}

export function setRowHeight(row: HTMLTableRowElement, height: number) {
  const size = Math.round(Math.max(MIN_ROW_HEIGHT, height));
  row.dataset.height = String(size);
  row.style.height = `${size}px`;
  return size;
}

/* How wide each column is on screen now. A column only covered by merged cells shares their width. */
function measureColumns(table: HTMLTableElement) {
  const { grid, places, width } = tableGrid(table);
  return Array.from({ length: width }, (_, column) => {
    const cells = grid.map(line => line[column]).filter(Boolean);
    const single = cells.find(cell => places.get(cell)?.columns === 1);
    const cell = single ?? cells[0];
    return cell ? cell.getBoundingClientRect().width / (single ? 1 : places.get(cell)?.columns ?? 1) : MIN_COLUMN_WIDTH;
  });
}

/* Give the table one <col> per column, set to the width each column has on screen right now. */
/* Called when a column border starts being dragged. Returns the starting widths. */
export function ensureColumns(table: HTMLTableElement) {
  const widths = measureColumns(table);
  let group = table.querySelector(':scope > colgroup');
  if (!group) {
    group = document.createElement('colgroup');
    table.prepend(group);
  }
  const cols = columnElements(table);
  while (cols.length < widths.length) cols.push(group.appendChild(document.createElement('col')));
  cols.slice(widths.length).forEach(col => col.remove());
  return widths.map((width, index) => setColumnWidth(cols[index], width));
}

/* Move the border on the right of a column. With Fit to width on, the next column gives or takes */
/* the same amount, so the table keeps the width of the page. Dragging the table's right edge turns */
/* Fit to width off, because the table then needs its own width. */
export function resizeColumn(table: HTMLTableElement, column: number, startWidths: number[], change: number) {
  const cols = columnElements(table);
  if (!cols[column]) return;
  if (isFitToWidth(table) && cols[column + 1]) {
    const pair = startWidths[column] + startWidths[column + 1];
    const left = Math.min(Math.max(startWidths[column] + change, MIN_COLUMN_WIDTH), pair - MIN_COLUMN_WIDTH);
    setColumnWidth(cols[column], left);
    setColumnWidth(cols[column + 1], pair - left);
  } else {
    if (isFitToWidth(table)) {
      table.classList.add('fit-content');
      cols.forEach((col, index) => setColumnWidth(col, startWidths[index]));
    }
    setColumnWidth(cols[column], startWidths[column] + change);
  }
  updateTableWidth(table);
}

/* With Fit to width off and stored column widths, the table is exactly as wide as its columns. */
export function updateTableWidth(table: HTMLTableElement) {
  const cols = columnElements(table);
  const total = cols.reduce((sum, col) => sum + (Number(col.dataset.width) || 0), 0);
  table.style.width = !isFitToWidth(table) && cols.length && total ? `${total}px` : '';
  if (!table.getAttribute('style')) table.removeAttribute('style');
}

/* Apply the stored widths and heights when a table is shown (saved notes keep only the numbers). */
export function hydrateTables(root: Element | null) {
  root?.querySelectorAll('table').forEach(table => {
    columnElements(table).forEach(col => {
      if (Number(col.dataset.width)) col.style.width = `${Number(col.dataset.width)}px`;
    });
    table.querySelectorAll<HTMLTableRowElement>('tr[data-height]').forEach(row => {
      row.style.height = `${Number(row.dataset.height)}px`;
    });
    updateTableWidth(table);
  });
}


/* =========================
   Rows and Columns
   ========================= */

/* Add an empty row next to another row (below the last row when none is given). */
export function addRow(table: HTMLTableElement, after: HTMLTableRowElement | null = null) {
  const rows = Array.from(table.rows);
  const source = after ?? rows[rows.length - 1];
  return insertRow(table, rows.indexOf(source), 'below');
}

/* A merged cell that reaches across the new row is stretched over it instead of getting a new cell. */
export function insertRow(table: HTMLTableElement, index: number, side: 'above' | 'below') {
  const headers = tableHeaders(table);
  const { grid, places, width } = tableGrid(table);
  const rows = Array.from(table.rows);
  const at = side === 'above' ? index : index + 1;
  const row = document.createElement('tr');
  const stretched = new Set<HTMLTableCellElement>();

  for (let column = 0; column < width; column += 1) {
    const cell = grid[at]?.[column];
    const place = cell ? places.get(cell) : undefined;
    if (cell && place && place.row < at) {
      if (!stretched.has(cell)) cell.rowSpan = place.rows + 1;
      stretched.add(cell);
    } else {
      row.appendChild(emptyCell('td'));
    }
  }

  if (rows[at]) rows[at].before(row);
  else rows[rows.length - 1].after(row);
  setHeaders(table, headers);
  return row;
}

export function addColumn(table: HTMLTableElement, after: number) {
  insertColumn(table, after, 'right');
}

/* A merged cell that reaches across the new column is stretched over it instead of getting a new cell. */
export function insertColumn(table: HTMLTableElement, index: number, side: 'left' | 'right') {
  const headers = tableHeaders(table);
  const { grid, places } = tableGrid(table);
  const at = side === 'left' ? index : index + 1;
  const stretched = new Set<HTMLTableCellElement>();

  Array.from(table.rows).forEach((row, rowIndex) => {
    const cell = grid[rowIndex]?.[at];
    const place = cell ? places.get(cell) : undefined;
    if (cell && place && place.column < at) {
      if (!stretched.has(cell)) cell.colSpan = place.columns + 1;
      stretched.add(cell);
      return;
    }
    placeInRow(row, at - 1, emptyCell('td'), places);
  });

  /* A resized table gets a width for the new column too, copied from the column beside it. */
  const cols = columnElements(table);
  const neighbour = cols[Math.min(index, cols.length - 1)];
  if (neighbour) {
    const col = document.createElement('col');
    setColumnWidth(col, Number(neighbour.dataset.width) || MIN_COLUMN_WIDTH);
    if (cols[at]) cols[at].before(col);
    else cols[cols.length - 1].after(col);
    updateTableWidth(table);
  }
  setHeaders(table, headers);
}

/* A merged cell loses one row instead of disappearing; if it started on the removed row, it moves */
/* down to the next one. Returns false when the table has no rows left. */
export function removeRow(table: HTMLTableElement, row: HTMLTableRowElement) {
  const headers = tableHeaders(table);
  const { grid, places } = tableGrid(table);
  const rows = Array.from(table.rows);
  const index = rows.indexOf(row);

  new Set(grid[index] ?? []).forEach(cell => {
    const place = cell ? places.get(cell) : undefined;
    if (!cell || !place || place.rows === 1) return;
    cell.rowSpan = place.rows - 1;
    if (place.row === index && rows[index + 1]) placeInRow(rows[index + 1], place.column - 1, cell, places);
  });
  row.remove();
  setHeaders(table, headers);
  return table.rows.length > 0;
}

/* A merged cell loses one column instead of disappearing. Returns false when no cells are left. */
export function removeColumn(table: HTMLTableElement, index: number) {
  const headers = tableHeaders(table);
  const { grid, places } = tableGrid(table);
  new Set(grid.map(line => line[index])).forEach(cell => {
    const place = cell ? places.get(cell) : undefined;
    if (!cell || !place) return;
    if (place.columns > 1) cell.colSpan = place.columns - 1;
    else cell.remove();
  });
  columnElements(table)[index]?.remove();
  updateTableWidth(table);
  removeEmptyRows(table);
  setHeaders(table, headers);
  return Boolean(table.querySelector('th, td'));
}

/* Move a row so it ends up at position "to"; the other rows shift to make room. */
/* Rows and columns cannot be moved while the table has merged cells, because a merged cell */
/* would have to be cut in two. */
export function moveRow(table: HTMLTableElement, from: number, to: number) {
  const rows = Array.from(table.rows);
  if (from === to || !rows[from] || !rows[to] || hasMergedCells(table)) return;
  const headers = tableHeaders(table);
  if (to < from) rows[to].before(rows[from]);
  else rows[to].after(rows[from]);
  setHeaders(table, headers);
}

export function moveColumn(table: HTMLTableElement, from: number, to: number) {
  if (from === to || to < 0 || to >= tableGrid(table).width || hasMergedCells(table)) return;
  const headers = tableHeaders(table);
  Array.from(table.rows).forEach(row => {
    const cell = row.cells[from];
    const target = row.cells[to];
    if (!cell || !target) return;
    if (to < from) target.before(cell);
    else target.after(cell);
  });
  const cols = columnElements(table);
  if (cols[from] && cols[to]) {
    if (to < from) cols[to].before(cols[from]);
    else cols[to].after(cols[from]);
  }
  setHeaders(table, headers);
}


/* =========================
   Merging Cells
   ========================= */

/* The smallest rectangle holding two cells, grown until no merged cell sticks out of it, */
/* so merging always gives a clean rectangle. */
export function cellRange(table: HTMLTableElement, from: HTMLTableCellElement, to: HTMLTableCellElement): CellRange | null {
  const { grid, places } = tableGrid(table);
  const a = places.get(from);
  const b = places.get(to);
  if (!a || !b) return null;
  const range = {
    top: Math.min(a.row, b.row),
    bottom: Math.max(a.row + a.rows, b.row + b.rows) - 1,
    left: Math.min(a.column, b.column),
    right: Math.max(a.column + a.columns, b.column + b.columns) - 1
  };

  let grown = true;
  while (grown) {
    grown = false;
    for (let row = range.top; row <= range.bottom; row += 1) {
      for (let column = range.left; column <= range.right; column += 1) {
        const cell = grid[row]?.[column];
        const place = cell ? places.get(cell) : undefined;
        if (!place) continue;
        const next = {
          top: Math.min(range.top, place.row),
          bottom: Math.max(range.bottom, place.row + place.rows - 1),
          left: Math.min(range.left, place.column),
          right: Math.max(range.right, place.column + place.columns - 1)
        };
        if (next.top !== range.top || next.bottom !== range.bottom || next.left !== range.left || next.right !== range.right) {
          Object.assign(range, next);
          grown = true;
        }
      }
    }
  }
  return range;
}

/* The cells inside a range, top-left first, each listed once. */
export function cellsInRange(table: HTMLTableElement, range: CellRange) {
  const { grid } = tableGrid(table);
  const cells = new Set<HTMLTableCellElement>();
  for (let row = range.top; row <= range.bottom; row += 1) {
    for (let column = range.left; column <= range.right; column += 1) {
      const cell = grid[row]?.[column];
      if (cell) cells.add(cell);
    }
  }
  return [...cells];
}

function hasContent(cell: Element) {
  return Boolean(cell.textContent?.trim() || cell.querySelector('.page-block, img'));
}

/* Merge every cell in the range into its top-left cell. Text from the other cells is kept, */
/* one cell per line. Returns the merged cell, or null when the range holds only one cell. */
export function mergeCells(table: HTMLTableElement, range: CellRange) {
  /* A range is kept inside the table, so a merged cell can never claim rows or columns that do not exist. */
  const { width } = tableGrid(table);
  range = {
    top: Math.max(0, range.top),
    bottom: Math.min(table.rows.length - 1, range.bottom),
    left: Math.max(0, range.left),
    right: Math.min(width - 1, range.right)
  };
  const [first, ...rest] = cellsInRange(table, range);
  if (!first || !rest.length) return null;
  if (!hasContent(first)) first.replaceChildren();
  rest.forEach(cell => {
    if (hasContent(cell)) {
      if (first.childNodes.length) first.appendChild(document.createElement('br'));
      first.append(...Array.from(cell.childNodes));
    }
    cell.remove();
  });
  if (!first.childNodes.length) first.appendChild(document.createElement('br'));
  first.rowSpan = range.bottom - range.top + 1;
  first.colSpan = range.right - range.left + 1;
  if (first.rowSpan === 1) first.removeAttribute('rowspan');
  if (first.colSpan === 1) first.removeAttribute('colspan');
  return first;
}

/* Split a merged cell back into single cells. Its text stays in the top-left cell; the others are empty. */
export function unmergeCell(table: HTMLTableElement, cell: HTMLTableCellElement) {
  const headers = tableHeaders(table);
  const { places } = tableGrid(table);
  const place = places.get(cell);
  if (!place || (place.rows === 1 && place.columns === 1)) return;
  cell.removeAttribute('rowspan');
  cell.removeAttribute('colspan');

  const rows = Array.from(table.rows);
  const last = place.column + place.columns - 1;
  for (let row = place.row; row < place.row + place.rows; row += 1) {
    const after = Array.from(rows[row].cells).find(item => item !== cell && (places.get(item)?.column ?? -1) > last) ?? null;
    for (let column = place.column; column <= last; column += 1) {
      if (row === place.row && column === place.column) continue;
      rows[row].insertBefore(emptyCell('td'), after);
    }
  }
  setHeaders(table, headers);
}
