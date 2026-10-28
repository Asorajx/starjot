import { describe, expect, it, vi } from 'vitest';
import { clearPages, layOutPages, pageGeometry, pageStep } from '../../../../../src/frontend/notespace/editor/layout/pagination';


/* =========================
   Page Sizes
   ========================= */

describe('pageGeometry', () => {
  it('gives A4 and Letter pages in CSS pixels with a one-inch margin', () => {
    expect(pageGeometry('a4', false)).toEqual({ width: 794, height: 1123, margin: 96, gap: 24 });
    expect(pageGeometry('letter', false)).toMatchObject({ width: 816, height: 1056 });
  });

  it('turns a landscape page sideways', () => {
    expect(pageGeometry('a4', true)).toMatchObject({ width: 1123, height: 794 });
  });

  it('steps from one page to the next across the gap', () => {
    expect(pageStep(pageGeometry('a4', false))).toBe(1147);
  });
});

describe('clearPages', () => {
  it('also clears a page mark the browser copied onto a new line (Enter in a moved line)', () => {
    const frame = document.createElement('div');
    frame.innerHTML = '<p class="page-pushed" style="--page-push: 200px">Moved</p><p class="page-pushed" style="--page-push: 200px"><br></p>';
    clearPages(frame);
    expect(frame.innerHTML).toBe('<p>Moved</p><p><br></p>');
  });
});

/* The Paginated view never inserts synthetic rows into an editable table. Screen-only */
/* transforms and separately drawn headers can be removed before saving or printing. */
describe('long tables in Paginated view', () => {
  function longTable(repeatHeader: boolean) {
    const frame = document.createElement('div');
    frame.innerHTML = '<div class="page-preview-overlays"></div><div class="note-body"><p>Intro</p><table><tbody></tbody></table><p>After</p></div>';
    const body = frame.querySelector<HTMLElement>('.note-body')!;
    const table = frame.querySelector('table')!;
    if (repeatHeader) table.classList.add('repeat-header');
    const rect = (top: number, height: number, left = 96, width = 600) => ({
      top, bottom: top + height, left, right: left + width, x: left, y: top, width, height, toJSON: () => ({})
    });
    const at = (node: Element, top: number, height: number, left?: number, width?: number) => {
      Object.defineProperty(node, 'getBoundingClientRect', { configurable: true, value: () => rect(top, height, left, width) });
    };
    at(frame, 0, 4500, 0, 794);
    at(body.firstElementChild!, 220, 38);
    at(table, 450, 70 * 38);
    at(body.lastElementChild!, 450 + 70 * 38, 38);
    const rows = Array.from({ length: 70 }, (_, index) => {
      const row = table.tBodies[0].insertRow();
      const first = row.insertCell();
      const second = row.insertCell();
      if (index === 0) {
        first.replaceWith(document.createElement('th'));
        second.replaceWith(document.createElement('th'));
      }
      Array.from(row.cells).forEach((cell, column) => {
        cell.textContent = `Row ${index} column ${column}`;
        at(cell, 450 + index * 38, 38, 96 + column * 300, 300);
      });
      at(row, 450 + index * 38, 38);
      return row;
    });
    return { frame, body, table, rows };
  }

  it('moves whole table rows across page boundaries and draws repeated headers separately', () => {
    const { frame, body, table, rows } = longTable(true);
    const originalTexts = rows.map(row => row.textContent);
    const pages = layOutPages(frame, body, pageGeometry('a4', false));
    expect(pages).toBeGreaterThan(2);
    expect(table.rows).toHaveLength(70);
    expect(rows.map(row => row.textContent)).toEqual(originalTexts);
    expect(table.querySelectorAll('.page-table-row').length).toBeGreaterThan(1);
    expect(table.classList.contains('page-table-expanded')).toBe(true);
    expect(frame.querySelectorAll('.page-repeat-header').length).toBeGreaterThan(1);
    expect(frame.querySelectorAll('.page-gap-mask')).toHaveLength(pages - 1);

    clearPages(frame);
    expect(table.rows).toHaveLength(70);
    expect(table.querySelector('.page-table-row')).toBeNull();
    expect(table.classList.contains('page-table-expanded')).toBe(false);
    expect(frame.querySelector('.page-preview-overlays')?.childElementCount).toBe(0);
    expect(rows.map(row => row.textContent)).toEqual(originalTexts);
  });

  it('returns to the original header when its repeated copy is double-clicked or activated', () => {
    const { frame, body, table, rows } = longTable(true);
    const scroller = document.createElement('div');
    scroller.className = 'main-scroll';
    scroller.scrollTop = 1800;
    scroller.scrollTo = vi.fn();
    Object.defineProperty(scroller, 'getBoundingClientRect', { value: () => ({ top: 0 }) });
    const bar = document.createElement('div');
    bar.className = 'page-bar';
    Object.defineProperty(bar, 'getBoundingClientRect', { value: () => ({ bottom: 70 }) });
    scroller.append(bar, frame);
    document.body.append(scroller);
    try {
      const original = rows[0].textContent;
      const heading = rows[0].cells[0];
      heading.id = 'real-header-cell';
      layOutPages(frame, body, pageGeometry('a4', false));
      const preview = frame.querySelector<HTMLElement>('.page-repeat-header')!;
      expect(preview.getAttribute('role')).toBe('button');
      expect(preview.querySelector('#real-header-cell')).toBeNull();
      preview.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
      expect(scroller.scrollTo).toHaveBeenCalledWith({ top: 2164, behavior: 'smooth' });
      preview.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
      expect(scroller.scrollTo).toHaveBeenCalledTimes(2);
      expect(rows[0].textContent).toBe(original);
      expect(table.rows).toHaveLength(70);
    } finally {
      scroller.remove();
    }
  });

  it('moves long tables even when repeat header is switched off', () => {
    const { frame, body, table } = longTable(false);
    layOutPages(frame, body, pageGeometry('a4', false));
    expect(table.querySelector('.page-table-row')).not.toBeNull();
    expect(frame.querySelector('.page-repeat-header')).toBeNull();
  });
});
