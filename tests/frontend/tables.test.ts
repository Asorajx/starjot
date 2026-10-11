import { describe, expect, it } from 'vitest';
import { unmark } from '../../src/frontend/notespace/editor/comments';
import {
  insertColumn, insertRow, isFitToWidth, moveColumn, moveRow, removeRow, setFitToWidth, setHeaders, tableHeaders
} from '../../src/frontend/notespace/editor/tables';

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
