import { describe, expect, it } from 'vitest';
import { unmark } from '../../../../../src/frontend/notespace/editor/comments/comments';
import {
  cellRange, columnElements, hasMergedCells, hydrateTables, insertColumn, insertRow, isFitToWidth, mergeCells, MIN_COLUMN_WIDTH, MIN_ROW_HEIGHT,
  moveColumn, moveRow, removeColumn, removeRow, resizeColumn, setColumnWidth, setFitToWidth, setHeaders, setRowHeight, tableGrid, tableHeaders,
  unmergeCell
} from '../../../../../src/frontend/notespace/editor/tables/tables';

/* A table built from rows of text; the first row is a header row when header is true. */
function table(rows: string[][], header = true) {
  const element = document.createElement('table');
  const body = element.appendChild(document.createElement('tbody'));
  rows.forEach((cells, index) => {
    const row = body.appendChild(document.createElement('tr'));
    cells.forEach(text => {
      const cell = row.appendChild(document.createElement(header && index === 0 ? 'th' : 'td'));
      cell.textContent = text;
    });
  });
  return element;
}

/* Each cell as "tag:text", row by row, for easy comparison. */
function cells(element: HTMLTableElement) {
  return Array.from(element.rows).map(row => Array.from(row.cells).map(cell => `${cell.tagName.toLowerCase()}:${cell.textContent}`).join(' '));
}


/* =========================
   Table Changes
   ========================= */

describe('table rows and columns', () => {
  it('moves a row, keeping the header on the first row', () => {
    const element = table([['Name', 'Role'], ['Ada', 'Lead'], ['Ben', 'Dev']]);
    moveRow(element, 2, 0);
    expect(cells(element)).toEqual(['th:Ben th:Dev', 'td:Name td:Role', 'td:Ada td:Lead']);
  });

  it('moves a column to the right', () => {
    const element = table([['A', 'B', 'C'], ['1', '2', '3']]);
    moveColumn(element, 0, 2);
    expect(cells(element)).toEqual(['th:B th:C th:A', 'td:2 td:3 td:1']);
  });

  it('inserts rows above and below, and columns left and right', () => {
    const element = table([['A', 'B'], ['1', '2']]);
    insertRow(element, 0, 'above');
    insertRow(element, 2, 'below');
    insertColumn(element, 0, 'left');
    expect(element.rows.length).toBe(4);
    expect(element.rows[0].cells.length).toBe(3);
    expect(cells(element)[0]).toBe('th: th: th:');
    expect(cells(element)[1]).toBe('td: td:A td:B');
  });

  it('reports when the last row is removed', () => {
    const element = table([['Only']]);
    expect(removeRow(element, element.rows[0])).toBe(false);
  });
});

describe('table options', () => {
  it('turns the header row and header column on and off', () => {
    const element = table([['A', 'B'], ['1', '2']], false);
    expect(tableHeaders(element)).toEqual({ row: false, column: false });
    setHeaders(element, { row: true, column: true });
    expect(cells(element)).toEqual(['th:A th:B', 'th:1 td:2']);
    expect(tableHeaders(element)).toEqual({ row: true, column: true });
  });

  it('switches fit to width off and back on', () => {
    const element = table([['A']]);
    expect(isFitToWidth(element)).toBe(true);
    setFitToWidth(element, false);
    expect(element.className).toBe('fit-content');
    setFitToWidth(element, true);
    expect(element.hasAttribute('class')).toBe(false);
  });

  it('removes a comment from a whole table without changing the table', () => {
    const holder = document.createElement('div');
    holder.innerHTML = '<table data-comment="c1"><tbody><tr><td>A</td></tr></tbody></table>';
    unmark(holder, 'c1');
    expect(holder.innerHTML).toBe('<table><tbody><tr><td>A</td></tr></tbody></table>');
  });
});


/* =========================
   Merged Cells
   ========================= */

/* Each row as "text(rows x columns)" for every cell, showing how far merged cells stretch. */
function spans(element: HTMLTableElement) {
  return Array.from(element.rows).map(row => Array.from(row.cells).map(cell => `${cell.textContent}(${cell.rowSpan}x${cell.colSpan})`).join(' '));
}

/* A 3 x 3 table of a1..c3 (letter = column, number = row) with no header. */
function grid3() {
  return table([['a1', 'b1', 'c1'], ['a2', 'b2', 'c2'], ['a3', 'b3', 'c3']], false);
}

describe('merged cells', () => {
  it('merges a rectangle into its top-left cell, keeping the text of every cell', () => {
    const element = grid3();
    const range = cellRange(element, element.rows[0].cells[0], element.rows[1].cells[1]);
    const merged = mergeCells(element, range!);
    expect(merged?.innerHTML).toBe('a1<br>b1<br>a2<br>b2');
    expect(spans(element)).toEqual(['a1b1a2b2(2x2) c1(1x1)', 'c2(1x1)', 'a3(1x1) b3(1x1) c3(1x1)']);
    expect(hasMergedCells(element)).toBe(true);
  });

  it('grows the range so that a merged cell is never cut in half', () => {
    const element = grid3();

    /* b1 and b2 are merged; selecting a2 to c2 crosses the bottom half of it, so the range grows upward. */
    mergeCells(element, { top: 0, bottom: 1, left: 1, right: 1 });
    const range = cellRange(element, element.rows[1].cells[0], element.rows[1].cells[1]);
    expect(range).toEqual({ top: 0, bottom: 1, left: 0, right: 2 });
  });

  it('places cells on the grid by column, not by their position in the row', () => {
    const element = grid3();
    mergeCells(element, { top: 0, bottom: 1, left: 0, right: 0 });
    const { places, width } = tableGrid(element);
    expect(width).toBe(3);
    expect(places.get(element.rows[1].cells[0])).toEqual({ row: 1, column: 1, rows: 1, columns: 1 });
  });

  it('never makes a merged cell bigger than the table', () => {
    const element = grid3();
    const merged = mergeCells(element, { top: 0, bottom: 9, left: 1, right: 9 });
    expect(merged?.rowSpan).toBe(3);
    expect(merged?.colSpan).toBe(2);
    expect(tableGrid(element).width).toBe(3);
  });

  it('unmerges back into single empty cells', () => {
    const element = grid3();
    const merged = mergeCells(element, { top: 1, bottom: 2, left: 1, right: 2 })!;
    unmergeCell(element, merged);
    expect(spans(element)).toEqual(['a1(1x1) b1(1x1) c1(1x1)', 'a2(1x1) b2c2b3c3(1x1) (1x1)', 'a3(1x1) (1x1) (1x1)']);
  });

  it('stretches a merged cell when a row or column is inserted through it', () => {
    const element = grid3();
    mergeCells(element, { top: 0, bottom: 1, left: 0, right: 1 });
    insertRow(element, 0, 'below');
    expect(element.rows[0].cells[0].rowSpan).toBe(3);
    expect(element.rows[1].cells).toHaveLength(1);
    insertColumn(element, 0, 'right');
    expect(element.rows[0].cells[0].colSpan).toBe(3);
    expect(tableGrid(element).width).toBe(4);
  });

  it('shrinks a merged cell when one of its rows or columns is deleted', () => {
    const element = grid3();
    mergeCells(element, { top: 0, bottom: 1, left: 0, right: 1 });
    removeRow(element, element.rows[0]);
    expect(spans(element)[0]).toBe('a1b1a2b2(1x2) c2(1x1)');
    removeColumn(element, 0);
    expect(spans(element)).toEqual(['a1b1a2b2(1x1) c2(1x1)', 'b3(1x1) c3(1x1)']);
  });

  it('does not move rows or columns while the table has merged cells', () => {
    const element = grid3();
    mergeCells(element, { top: 0, bottom: 0, left: 0, right: 1 });
    const before = spans(element);
    moveRow(element, 2, 0);
    moveColumn(element, 0, 1);
    expect(spans(element)).toEqual(before);
  });

  it('keeps a merged header cell a header, and keeps its size when headers change', () => {
    const element = table([['A', 'B'], ['1', '2']]);
    mergeCells(element, { top: 0, bottom: 0, left: 0, right: 1 });
    expect(tableHeaders(element)).toEqual({ row: true, column: false });
    setHeaders(element, { row: false, column: false });
    expect(element.rows[0].cells[0].tagName).toBe('TD');
    expect(element.rows[0].cells[0].colSpan).toBe(2);
  });
});


/* =========================
   Column Widths and Row Heights
   ========================= */

/* A table with stored column widths, like one whose borders have been dragged. */
function sized(widths: number[]) {
  const element = table([widths.map(String), widths.map(String)]);
  const group = element.insertBefore(document.createElement('colgroup'), element.firstChild);
  widths.forEach(width => setColumnWidth(group.appendChild(document.createElement('col')), width));
  return element;
}

const storedWidths = (element: HTMLTableElement) => columnElements(element).map(col => Number(col.dataset.width));

describe('column widths and row heights', () => {
  it('with Fit to width on, moves a border between two columns and keeps the total', () => {
    const element = sized([100, 200, 300]);
    resizeColumn(element, 0, [100, 200, 300], 50);
    expect(storedWidths(element)).toEqual([150, 150, 300]);
    resizeColumn(element, 0, [100, 200, 300], 500);
    expect(storedWidths(element)).toEqual([300 - MIN_COLUMN_WIDTH, MIN_COLUMN_WIDTH, 300]);
    expect(isFitToWidth(element)).toBe(true);
  });

  it('with Fit to width off, changes only one column and sizes the table to fit its columns', () => {
    const element = sized([100, 200, 300]);
    setFitToWidth(element, false);
    resizeColumn(element, 1, [100, 200, 300], -50);
    expect(storedWidths(element)).toEqual([100, 150, 300]);
    expect(element.style.width).toBe('550px');
  });

  it('turns Fit to width off when the right edge of the table is dragged', () => {
    const element = sized([100, 200, 300]);
    resizeColumn(element, 2, [100, 200, 300], 40);
    expect(isFitToWidth(element)).toBe(false);
    expect(storedWidths(element)).toEqual([100, 200, 340]);
    expect(element.style.width).toBe('640px');
  });

  it('keeps stored widths in step when columns are inserted, moved or deleted', () => {
    const element = sized([100, 200, 300]);
    insertColumn(element, 0, 'right');
    expect(storedWidths(element)).toEqual([100, 100, 200, 300]);
    moveColumn(element, 3, 0);
    expect(storedWidths(element)).toEqual([300, 100, 100, 200]);
    removeColumn(element, 0);
    expect(storedWidths(element)).toEqual([100, 100, 200]);
  });

  it('never makes a column or row smaller than the minimum', () => {
    const element = sized([100]);
    expect(setColumnWidth(columnElements(element)[0], 5)).toBe(MIN_COLUMN_WIDTH);
    expect(setRowHeight(element.rows[0], 3)).toBe(MIN_ROW_HEIGHT);
  });

  it('applies stored sizes when a saved table is shown again', () => {
    const holder = document.createElement('div');
    holder.innerHTML = '<table class="fit-content"><colgroup><col data-width="120"><col data-width="80"></colgroup><tbody><tr data-height="60"><td>A</td><td>B</td></tr></tbody></table>';
    hydrateTables(holder);
    const element = holder.querySelector('table') as HTMLTableElement;
    expect(columnElements(element)[0].style.width).toBe('120px');
    expect(element.rows[0].style.height).toBe('60px');
    expect(element.style.width).toBe('200px');
  });
});
