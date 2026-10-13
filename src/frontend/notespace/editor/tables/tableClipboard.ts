import { cleanHtml } from '../../sanitize';
import { addColumn, addRow, cellRange, columnElements, tableGrid, type CellRange } from './tables';

/* A clipboard type only Starjot reads: the copied tables as note HTML, so pasting them keeps */
/* their header rows, column widths, row heights, merged cells and text formatting. */
export const NOTE_TABLES = 'text/x-starjot-tables';

/* The cell a node is in, if any. */
export function cellAt(node: Node | null | undefined) {
  const element = node instanceof Element ? node : node?.parentElement;
  return element?.closest<HTMLTableCellElement>('td, th') ?? null;
}


/* =========================
   Copying Cells
   ========================= */

/* The cells a selection runs across, when it starts in one cell and ends in another cell of the */
/* same table inside root. */
export function selectedCells(range: Range, root: Element) {
  const from = cellAt(range.startContainer);
  const to = cellAt(range.endContainer);
  const table = from?.closest('table');
  if (!from || !to || from === to || !table || to.closest('table') !== table || !root.contains(table)) return null;
  const cells = cellRange(table, from, to);
  return cells ? { table, cells } : null;
}

/* A copy of a rectangle of a table: its cells (merged ones clipped to the rectangle), and the */
/* table's look: its classes, those columns' widths and those rows' heights. */
export function tableSlice(table: HTMLTableElement, range: CellRange) {
  const { places } = tableGrid(table);
  const slice = document.createElement('table');
  slice.className = table.className;

  const cols = columnElements(table).slice(range.left, range.right + 1);
  if (cols.length) {
    const group = slice.appendChild(document.createElement('colgroup'));
    cols.forEach(col => group.append(col.cloneNode()));
  }

  const body = slice.appendChild(document.createElement('tbody'));
  for (let row = range.top; row <= range.bottom; row += 1) {
    const line = body.appendChild(table.rows[row].cloneNode(false) as HTMLTableRowElement);
    Array.from(table.rows[row].cells).forEach(cell => {
      const place = places.get(cell);
      if (!place || place.column < range.left || place.column > range.right) return;
      const copy = cell.cloneNode(true) as HTMLTableCellElement;
      copy.rowSpan = Math.min(place.rows, range.bottom - place.row + 1);
      copy.colSpan = Math.min(place.columns, range.right - place.column + 1);
      if (copy.rowSpan === 1) copy.removeAttribute('rowspan');
      if (copy.colSpan === 1) copy.removeAttribute('colspan');
      line.append(copy);
    });
  }
  return slice;
}

/* A table as tab-separated text, one row per line, as spreadsheets copy and paste it. */
export function tableText(table: HTMLTableElement) {
  return Array.from(table.rows).map(row => Array.from(row.cells).map(cell => (cell.textContent ?? '').replace(/\s+/g, ' ').trim()).join('\t')).join('\n');
}


/* =========================
   Reading Pasted Tables
   ========================= */

/* The tables copied from a note, cleaned like everything else that is pasted. */
export function copiedTables(data: DataTransfer) {
  const html = data.getData(NOTE_TABLES);
  if (!html) return [];
  const holder = document.createElement('template');
  holder.innerHTML = cleanHtml(html);
  return Array.from(holder.content.children).filter((element): element is HTMLTableElement => element instanceof HTMLTableElement);
}

/* Tab-separated text (copied from a spreadsheet) as a table, or null for other text. */
export function textTable(text: string) {
  if (!text.includes('\t')) return null;
  const lines = text.replace(/\r\n?/g, '\n').replace(/\n+$/, '').split('\n');
  const table = document.createElement('table');
  const body = table.appendChild(document.createElement('tbody'));
  lines.forEach(line => {
    const row = body.appendChild(document.createElement('tr'));
    line.split('\t').forEach(value => {
      const cell = row.appendChild(document.createElement('td'));
      cell.textContent = value;
    });
  });
  return table;
}


/* =========================
   Pasting Into Cells
   ========================= */

/* Put copies of some nodes into a cell, replacing what it held (an empty cell keeps a <br> so */
/* it stays open for typing). */
function fillCell(cell: HTMLTableCellElement, nodes: Node[]) {
  cell.replaceChildren(...nodes.map(node => node.cloneNode(true)));
  if (!cell.childNodes.length) cell.append(document.createElement('br'));
}

/* Paste a table's cells into another table, the top-left cell at a grid spot. Rows and columns */
/* are added when the pasted cells reach past the table's edge. The table keeps its own look */
/* (header rows, widths and merged cells); a merged pasted cell fills its top-left spot. Returns */
/* the last cell filled. */
export function pasteCells(table: HTMLTableElement, at: { row: number; column: number }, source: HTMLTableElement) {
  const pasted = tableGrid(source);
  while (table.rows.length < at.row + pasted.grid.length) addRow(table);
  while (tableGrid(table).width < at.column + pasted.width) addColumn(table, tableGrid(table).width - 1);

  const { grid } = tableGrid(table);
  const filled = new Set<HTMLTableCellElement>();
  let last: HTMLTableCellElement | null = null;
  pasted.grid.forEach((line, row) => line.forEach((cell, column) => {
    const place = pasted.places.get(cell);
    const target = grid[at.row + row]?.[at.column + column];
    if (!target || filled.has(target) || place?.row !== row || place.column !== column) return;
    fillCell(target, Array.from(cell.childNodes));
    filled.add(target);
    last = target;
  }));
  return last as HTMLTableCellElement | null;
}

/* Fill every cell of a range with the same content. Returns the last cell filled. */
export function fillCells(table: HTMLTableElement, range: CellRange, nodes: Node[]) {
  const { grid } = tableGrid(table);
  const filled = new Set<HTMLTableCellElement>();
  for (let row = range.top; row <= range.bottom; row += 1) {
    for (let column = range.left; column <= range.right; column += 1) {
      const cell = grid[row]?.[column];
      if (cell && !filled.has(cell)) {
        fillCell(cell, nodes);
        filled.add(cell);
      }
    }
  }
  return [...filled].pop() ?? null;
}

/* The pasted words as inline content: a single formatted line's contents, or else the plain text. */
function pastedWords(data: DataTransfer, lines: HTMLElement[] | null): Node[] {
  if (lines?.length === 1 && lines[0].tagName === 'P') return Array.from(lines[0].childNodes);
  return [document.createTextNode(data.getData('text/plain').replace(/\s*\n\s*/g, ' ').trim())];
}

/* Empty the cells a selection runs across (after cutting them), keeping the table's shape. */
/* Returns false when the selection is not across cells. */
export function clearSelectedCells(root: Element) {
  const selection = window.getSelection();
  const chosen = selection?.rangeCount ? selectedCells(selection.getRangeAt(0), root) : null;
  if (!chosen) return false;
  const last = fillCells(chosen.table, chosen.cells, []);
  if (last) selection?.collapse(last, 0);
  return true;
}

/* Paste into a table when the caret or selection is in one: a copied table (or a Markdown table, */
/* or spreadsheet text) goes in cell by cell from the caret's cell (or the top-left selected */
/* cell); one piece of text over several selected cells fills each of them. lines are the pasted */
/* Markdown lines, when the text had any. Returns false when the paste is ordinary text into one */
/* cell, which pasting handles as usual. */
export function pasteIntoTable(data: DataTransfer, root: Element, lines: HTMLElement[] | null) {
  const selection = window.getSelection();
  const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
  const start = cellAt(range?.startContainer);
  const table = start?.closest('table');
  if (!range || !start || !table || !root.contains(table)) return false;

  const chosen = selectedCells(range, root);
  const place = tableGrid(table).places.get(start);
  const at = chosen ? { row: chosen.cells.top, column: chosen.cells.left } : { row: place?.row ?? 0, column: place?.column ?? 0 };
  const markdownTable = lines?.length === 1 && lines[0] instanceof HTMLTableElement ? lines[0] : null;
  const source = copiedTables(data)[0] ?? markdownTable ?? textTable(data.getData('text/plain'));

  let last: HTMLTableCellElement | null = null;
  const single = source && source.rows.length === 1 && source.rows[0].cells.length === 1;
  if (source && !(single && chosen)) {
    last = pasteCells(table, at, source);
  } else if (chosen) {
    last = fillCells(table, chosen.cells, single && source ? Array.from(source.rows[0].cells[0].childNodes) : pastedWords(data, lines));
  } else {
    return false;
  }

  /* The caret goes to the end of the last cell filled. */
  if (last && selection) {
    const caret = document.createRange();
    caret.selectNodeContents(last);
    caret.collapse(false);
    selection.removeAllRanges();
    selection.addRange(caret);
  }
  return true;
}
