import { describe, expect, it } from 'vitest';
import { unmark } from '../../../../../src/frontend/notespace/editor/comments/comments';
import {
  borderNear, cellRange, columnElements, columnResizeChange, hasMergedCells, headerIntoHead, hydrateTables, insertColumn, insertRow, isFitToWidth, measureColumns, mergeCells, MIN_COLUMN_WIDTH, MIN_ROW_HEIGHT,
  moveColumn, moveRow, removeColumn, removeRow, repeatsHeader, resizeColumn, setColumnWidth, setFitToWidth, setHeaders, setRepeatHeader, setRowHeight,
  rowHeightLimit, rowMinHeight, tableGrid, tableHeaders, tableWidthLimit, unmergeCell
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

  it('switches Repeat header on each page on and off, keeping other options', () => {
    const element = table([['A']]);
    setFitToWidth(element, false);
    setRepeatHeader(element, true);
    expect(repeatsHeader(element)).toBe(true);
    expect(element.className).toBe('fit-content repeat-header');
    setRepeatHeader(element, false);
    setFitToWidth(element, true);
    expect(element.hasAttribute('class')).toBe(false);
  });

  it('moves a repeated header row into a <thead> for printing, and back', () => {
    const element = table([['Name'], ['Row 1'], ['Row 2']]);
    expect(headerIntoHead(element)).toBeNull();
    setRepeatHeader(element, true);
    const restore = headerIntoHead(element);
    expect(element.tHead?.textContent).toBe('Name');
    expect(element.tBodies[0].rows[0].textContent).toBe('Row 1');
    restore?.();
    expect(element.tHead).toBeNull();
    expect(cells(element)).toEqual(['th:Name', 'td:Row 1', 'td:Row 2']);
  });

  it('leaves a table without a header row (or with a <thead> already) as it is', () => {
    const plain = table([['A'], ['B']], false);
    setRepeatHeader(plain, true);
    expect(headerIntoHead(plain)).toBeNull();
    const headed = table([['Name'], ['1']]);
    setRepeatHeader(headed, true);
    headed.createTHead();
    expect(headerIntoHead(headed)).toBeNull();
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
  it('measures initial column widths without modifying a table during preview', () => {
    const element = table([['a', 'b'], ['c', 'd']]);
    Array.from(element.querySelectorAll('th, td')).forEach((cell, index) => {
      const width = index % 2 ? 80 : 120;
      const left = index % 2 ? 120 : 0;
      Object.defineProperty(cell, 'getBoundingClientRect', {
        configurable: true, value: () => ({ left, top: 0, right: left + width, bottom: 30, width, height: 30 })
      });
    });
    const before = element.outerHTML;
    expect(measureColumns(element)).toEqual([120, 80]);
    expect(element.outerHTML).toBe(before);
    expect(element.querySelector('colgroup')).toBeNull();
  });

  it('clamps column guide positions to the same limits as committed sizes', () => {
    const element = sized([100, 200, 300]);
    expect(columnResizeChange(element, 0, [100, 200, 300], -500)).toBe(MIN_COLUMN_WIDTH - 100);
    expect(columnResizeChange(element, 0, [100, 200, 300], 500)).toBe(200 - MIN_COLUMN_WIDTH);
    expect(columnResizeChange(element, 2, [100, 200, 300], 500)).toBe(500);
    setFitToWidth(element, false);
    expect(columnResizeChange(element, 0, [100, 200, 300], 500)).toBe(500);
    expect(columnResizeChange(element, 0, [100, 200, 300], -500)).toBe(MIN_COLUMN_WIDTH - 100);
  });

  it('measures how short a row can be dragged without changing it', () => {
    const element = table([['a'], ['b']]);
    const row = element.rows[1];
    Object.defineProperty(row, 'getBoundingClientRect', {
      configurable: true, value: () => ({ height: row.style.height ? Number.parseFloat(row.style.height) : 45 })
    });
    expect(rowMinHeight(row)).toBe(45);
    setRowHeight(row, 120);
    const before = element.outerHTML;
    expect(rowMinHeight(row)).toBe(45);
    expect(rowMinHeight(row, 1.5)).toBe(30);
    expect(element.outerHTML).toBe(before);
    Object.defineProperty(row, 'getBoundingClientRect', { configurable: true, value: () => ({ height: 10 }) });
    expect(rowMinHeight(row)).toBe(MIN_ROW_HEIGHT);
  });

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


/* =========================
   Resize Borders
   ========================= */

/* Give a cell a place on screen, as a browser would after layout. */
function placeAt(cell: Element, left: number, top: number, width: number, height: number) {
  Object.defineProperty(cell, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({ left, top, right: left + width, bottom: top + height, width, height })
  });
}

/* A table from HTML rows, with each cell placed by placeAt. */
function laidOut(rows: string, places: [number, number, number, number][]) {
  const element = document.createElement('table');
  element.innerHTML = `<tbody>${rows}</tbody>`;
  const found = Array.from(element.querySelectorAll('td'));
  found.forEach((cell, index) => placeAt(cell, ...places[index]));
  return { element, found };
}

describe('resize borders', () => {
  it('finds a border only beside the cell under the pointer', () => {
    const { element, found } = laidOut('<tr><td>A</td><td>B</td></tr><tr><td>C</td><td>D</td></tr>', [[0, 0, 100, 30], [100, 0, 100, 30], [0, 30, 100, 30], [100, 30, 100, 30]]);
    expect(borderNear(element, 100, 12, 4)).toMatchObject({ kind: 'column', index: 0, cell: found[0] });
    expect(borderNear(element, 100, 43, 4)).toMatchObject({ kind: 'column', index: 0, cell: found[2] });
    expect(borderNear(element, 100, 130, 4)).toBeNull();
    expect(borderNear(element, 50, 15, 4)).toBeNull();
  });

  it('finds no row border inside a cell merged down', () => {
    const { element, found } = laidOut('<tr><td rowspan="2">Merged</td><td>B</td></tr><tr><td>D</td></tr>', [[0, 0, 100, 60], [100, 0, 100, 30], [100, 30, 100, 30]]);
    expect(borderNear(element, 50, 30, 4)).toBeNull();
    expect(borderNear(element, 150, 30, 4)).toMatchObject({ kind: 'row', index: 0, cell: found[1] });
    expect(borderNear(element, 50, 60, 4)).toMatchObject({ kind: 'row', index: 1, cell: found[0] });
  });

  it('finds no column border inside a cell merged across', () => {
    const { element, found } = laidOut('<tr><td colspan="2">Merged</td></tr><tr><td>C</td><td>D</td></tr>', [[0, 0, 200, 30], [0, 30, 100, 30], [100, 30, 100, 30]]);
    expect(borderNear(element, 100, 15, 4)).toBeNull();
    expect(borderNear(element, 100, 45, 4)).toMatchObject({ kind: 'column', index: 0, cell: found[1] });
    expect(borderNear(element, 200, 15, 4)).toMatchObject({ kind: 'column', index: 1, cell: found[0] });
  });

  it('finds a row moved onto a later page where it shows, and nothing in the gap', () => {
    const { element, found } = laidOut('<tr><td>Before</td></tr><tr><td>After</td></tr>', [[0, 0, 100, 30], [0, 1123, 100, 30]]);
    expect(borderNear(element, 100, 15, 4)?.cell).toBe(found[0]);
    expect(borderNear(element, 100, 1140, 4)?.cell).toBe(found[1]);
    expect(borderNear(element, 100, 600, 4)).toBeNull();
  });
});


/* =========================
   Resize Limits
   ========================= */

/* jsdom has no layout. Give the editor elements screen rectangles so the tests check the */
/* same content-edge measurements as the actual browser, without depending on a window size. */
function box(element: Element, left: number, top: number, width: number, height: number) {
  element.getBoundingClientRect = () => ({
    x: left, y: top, left, top, right: left + width, bottom: top + height, width, height,
    toJSON: () => ({})
  }) as DOMRect;
}

describe('table resize limits', () => {
  it('stops a page-width table at its content margin but still redistributes internal widths', () => {
    const frame = document.createElement('div');
    frame.className = 'editor-width is-paginated';
    frame.style.padding = '96px';
    const editor = frame.appendChild(document.createElement('div'));
    editor.className = 'note-editable';
    const element = editor.appendChild(table([['A', 'B']]));
    document.body.append(frame);
    box(frame, 100, 0, 794, 1123);
    box(editor, 196, 0, 602, 931);
    box(element, 196, 0, 602, 80);

    expect(tableWidthLimit(element)).toBe(602);
    expect(columnResizeChange(element, 1, [300, 302], 100)).toBe(0);
    expect(columnResizeChange(element, 1, [300, 302], -24)).toBe(-24);
    expect(columnResizeChange(element, 0, [300, 302], 100)).toBe(100);

    element.classList.add('fit-content');
    expect(columnResizeChange(element, 0, [250, 250], 200)).toBe(102);
    expect(columnResizeChange(element, 1, [250, 250], 200)).toBe(102);
    frame.remove();
  });

  it('uses the pageless editor column, including block padding, rather than the window', () => {
    const frame = document.createElement('div');
    frame.className = 'editor-width';
    const block = frame.appendChild(document.createElement('div'));
    block.className = 'editable-block';
    block.style.paddingRight = '12px';
    const content = block.appendChild(document.createElement('div'));
    content.className = 'block-content';
    const element = content.appendChild(table([['A', 'B']]));
    element.classList.add('fit-content');
    document.body.append(frame);
    box(frame, 100, 0, 700, 700);
    box(block, 100, 0, 700, 700);
    box(content, 124, 0, 664, 700);
    box(element, 124, 0, 500, 70);

    expect(tableWidthLimit(element)).toBe(664);
    expect(columnResizeChange(element, 1, [250, 250], 300)).toBe(164);
    frame.remove();
  });

  it('allows shrinking, but not further expansion, when a table already overflows', () => {
    const frame = document.createElement('div');
    frame.className = 'editor-width';
    const element = frame.appendChild(table([['A', 'B']]));
    element.classList.add('fit-content');
    document.body.append(frame);
    box(frame, 0, 0, 500, 300);
    box(element, 0, 0, 540, 60);
    expect(columnResizeChange(element, 1, [270, 270], 70)).toBe(0);
    expect(columnResizeChange(element, 1, [270, 270], -70)).toBe(-70);
    frame.remove();
  });

  it('limits a row to a full page, not the room remaining on its current page', () => {
    const frame = document.createElement('div');
    frame.className = 'editor-width is-paginated';
    frame.style.padding = '96px';
    const sheet = frame.appendChild(document.createElement('div'));
    sheet.className = 'page-sheet';
    sheet.style.height = '1123px';
    const element = frame.appendChild(table([['Header'], ['Data']]));
    document.body.append(frame);
    box(element.rows[0], 0, 0, 600, 70);
    box(element.rows[1], 0, 70, 600, 80);
    expect(rowHeightLimit(element.rows[1])).toBe(931);
    element.classList.add('repeat-header');
    expect(rowHeightLimit(element.rows[1])).toBe(861);
    frame.remove();
  });

  it('shares available page height between rows connected by a vertical merge', () => {
    const frame = document.createElement('div');
    frame.className = 'editor-width is-paginated';
    frame.style.padding = '96px';
    const sheet = frame.appendChild(document.createElement('div'));
    sheet.className = 'page-sheet';
    sheet.style.height = '1123px';
    const element = frame.appendChild(table([['A', 'B'], ['C', 'D'], ['E', 'F']], false));
    element.rows[0].cells[0].rowSpan = 2;
    element.rows[1].cells[0].remove();
    document.body.append(frame);
    box(element.rows[0], 0, 0, 600, 120);
    box(element.rows[1], 0, 120, 600, 100);
    box(element.rows[2], 0, 220, 600, 90);

    expect(rowHeightLimit(element.rows[1])).toBe(811);
    expect(rowHeightLimit(element.rows[2])).toBe(931);
    frame.remove();
  });

  it('keeps room on later pages when the repeated header row itself is made taller', () => {
    const frame = document.createElement('div');
    frame.className = 'editor-width is-paginated';
    frame.style.padding = '96px';
    const sheet = frame.appendChild(document.createElement('div'));
    sheet.className = 'page-sheet';
    sheet.style.height = '1123px';
    const element = frame.appendChild(table([['Header'], ['Short'], ['Tall'], ['Short']]));
    element.classList.add('repeat-header');
    document.body.append(frame);
    [70, 80, 300, 90].reduce((top, height, index) => { box(element.rows[index], 0, top, 600, height); return top + height; }, 0);
    expect(rowHeightLimit(element.rows[0])).toBe(631);
    element.classList.remove('repeat-header');
    expect(rowHeightLimit(element.rows[0])).toBe(931);
    frame.remove();
  });

  it('does not put a page-height limit on rows in Pageless mode', () => {
    const element = table([['A']]);
    expect(rowHeightLimit(element.rows[0])).toBe(Infinity);
  });
});
