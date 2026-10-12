import { describe, expect, it } from 'vitest';
import { clearSelectedCells, pasteIntoTable, tableSlice, tableText, textTable } from '../../../../../src/frontend/notespace/editor/tables/tableClipboard';
import { pastedMarkdown } from '../../../../../src/frontend/notespace/editor/text/paste';

/* A note body holding one table, with the text of each cell given row by row. */
function noteWithTable(rows: string[][]) {
  const body = document.createElement('div');
  body.innerHTML = `<table class="fit-content"><tbody>${rows.map(row => `<tr>${row.map(text => `<td>${text || '<br>'}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  document.body.replaceChildren(body);
  return { body, table: body.querySelector('table') as HTMLTableElement };
}

/* Put the caret in a cell, or select text from one cell to another. */
function select(table: HTMLTableElement, from: [number, number], to: [number, number] = from) {
  const range = document.createRange();
  range.setStart(table.rows[from[0]].cells[from[1]], 0);
  const end = table.rows[to[0]].cells[to[1]];
  range.setEnd(end, end.childNodes.length);
  window.getSelection()?.removeAllRanges();
  window.getSelection()?.addRange(range);
}

/* What a paste would hold: some types of clipboard data. */
function clipboard(data: Record<string, string>) {
  return { getData: (type: string) => data[type] ?? '' } as DataTransfer;
}

const cellTexts = (table: HTMLTableElement) => Array.from(table.rows).map(row => Array.from(row.cells).map(cell => cell.textContent));


/* =========================
   Copying Cells
   ========================= */

describe('copying table cells', () => {
  it('copies a rectangle of cells with the table look, its widths and heights', () => {
    const { table } = noteWithTable([['a', 'b', 'c'], ['d', 'e', 'f']]);
    table.insertAdjacentHTML('afterbegin', '<colgroup><col data-width="80"><col data-width="120"><col data-width="90"></colgroup>');
    table.rows[1].dataset.height = '40';
    table.rows[0].cells[1].outerHTML = '<th><strong>b</strong></th>';
    const slice = tableSlice(table, { top: 0, bottom: 1, left: 1, right: 2 });
    expect(slice.outerHTML).toBe('<table class="fit-content"><colgroup><col data-width="120"><col data-width="90"></colgroup><tbody><tr><th><strong>b</strong></th><td>c</td></tr><tr data-height="40"><td>e</td><td>f</td></tr></tbody></table>');
    expect(tableText(slice)).toBe('b\tc\ne\tf');
  });

  it('clips a merged cell to the copied rectangle', () => {
    const { table } = noteWithTable([['a', 'b'], ['c', 'd']]);
    table.rows[0].cells[0].colSpan = 2;
    table.rows[0].cells[1].remove();
    const slice = tableSlice(table, { top: 0, bottom: 0, left: 0, right: 1 });
    expect(slice.rows[0].cells[0].colSpan).toBe(2);
  });

  it('reads tab-separated text from a spreadsheet as a table', () => {
    expect(cellTexts(textTable('a\tb\nc\td\n') as HTMLTableElement)).toEqual([['a', 'b'], ['c', 'd']]);
    expect(textTable('no tabs here')).toBeNull();
  });
});


/* =========================
   Pasting Into Cells
   ========================= */

describe('pasting into a table', () => {
  it('pastes cells from the caret, adding the rows and columns that are needed', () => {
    const { body, table } = noteWithTable([['', ''], ['', ''], ['', ''], ['', '']]);
    select(table, [1, 0]);
    const copied = '<table><tbody><tr><td>1</td><td>2</td><td>3</td></tr><tr><td>4</td><td>5</td><td>6</td></tr><tr><td>7</td><td>8</td><td>9</td></tr><tr><td>10</td><td>11</td><td>12</td></tr></tbody></table>';
    expect(pasteIntoTable(clipboard({ 'text/x-starjot-tables': copied }), body, null)).toBe(true);
    expect(cellTexts(table)).toEqual([['', '', ''], ['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9'], ['10', '11', '12']]);
  });

  it('starts from the second column when the caret is there', () => {
    const { body, table } = noteWithTable([['', '']]);
    select(table, [0, 1]);
    pasteIntoTable(clipboard({ 'text/plain': 'a\tb' }), body, null);
    expect(cellTexts(table)).toEqual([['', 'a', 'b']]);
  });

  it('pastes a Markdown table cell by cell', () => {
    const { body, table } = noteWithTable([['', '']]);
    select(table, [0, 0]);
    const text = '| x | y |\n| --- | --- |\n| 1 | 2 |';
    pasteIntoTable(clipboard({ 'text/plain': text }), body, pastedMarkdown(text));
    expect(cellTexts(table)).toEqual([['x', 'y'], ['1', '2']]);
  });

  it('fills every selected cell with one piece of text', () => {
    const { body, table } = noteWithTable([['a', 'b'], ['c', 'd'], ['e', 'f']]);
    select(table, [0, 0], [1, 1]);
    pasteIntoTable(clipboard({ 'text/plain': 'same' }), body, null);
    expect(cellTexts(table)).toEqual([['same', 'same'], ['same', 'same'], ['e', 'f']]);
  });

  it('leaves ordinary text in one cell to normal pasting', () => {
    const { body, table } = noteWithTable([['a']]);
    select(table, [0, 0]);
    expect(pasteIntoTable(clipboard({ 'text/plain': 'words' }), body, null)).toBe(false);
  });

  it('empties cut cells, keeping the table', () => {
    const { body, table } = noteWithTable([['a', 'b'], ['c', 'd']]);
    select(table, [0, 0], [0, 1]);
    expect(clearSelectedCells(body)).toBe(true);
    expect(cellTexts(table)).toEqual([['', ''], ['c', 'd']]);
  });
});
