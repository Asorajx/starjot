import { afterEach, describe, expect, it, vi } from 'vitest';
import { BREAK_CLASS, breakRow, cellLines, removeBreaks, setSplitsAcrossPages, splitsAcrossPages } from '../../../../../src/frontend/notespace/editor/layout/rowBreaks';
import { clearPages, pageGeometry } from '../../../../../src/frontend/notespace/editor/layout/pagination';
import { cleanHtml } from '../../../../../src/frontend/notespace/sanitize';
import { selectionHtml, writeSelection } from '../../../../../src/frontend/notespace/editor/text/clipboard';
import { tableSlice } from '../../../../../src/frontend/notespace/editor/tables/tableClipboard';
import { History } from '../../../../../src/frontend/notespace/editor/history';

afterEach(() => { vi.restoreAllMocks(); window.getSelection()?.removeAllRanges(); document.body.replaceChildren(); });

const box = (top: number, bottom: number) => ({ top, bottom, height: bottom - top } as DOMRect);

describe('measuring and inserting row continuations', () => {
  it.each([0.8, 1, 1.5])('keeps a caret at the first wrapped continuation character at zoom %s', scale => {
    const { frame, cell } = splitCell(); removeBreaks(frame); cell.textContent = 'abcdef';
    const row = cell.parentElement as HTMLTableRowElement;
    vi.spyOn(row, 'getBoundingClientRect').mockReturnValue(box(990 * scale, 1050 * scale));
    const createRange = document.createRange.bind(document);
    vi.spyOn(document, 'createRange').mockImplementation(() => {
      const range = createRange();
      range.getClientRects = () => [box(1000 * scale, 1020 * scale), box(1020 * scale, 1040 * scale)] as unknown as DOMRectList;
      range.getBoundingClientRect = () => range.startOffset < 3 ? box(1000 * scale, 1020 * scale) : box(1020 * scale, 1040 * scale);
      return range;
    });
    const selection = window.getSelection()!;
    selection.setBaseAndExtent(cell.firstChild!, 3, cell.firstChild!, 3);
    expect(breakRow(row, 990, scale, pageGeometry('a4', false), {})).toBe(true);
    expect(cell.querySelector<HTMLElement>('.page-cell-break')?.style.height).toBe('223px');
    expect(selection.focusNode).toBe(cell.lastChild);
    expect(selection.focusOffset).toBe(0);
    expect(cell.textContent).toBe('abcdef');
    removeBreaks(frame);
    expect(selection.focusNode).toBe(cell.firstChild);
    expect(selection.focusOffset).toBe(3);
  });

  it('measures empty BR lines and the full height of differently formatted text on one line', () => {
    const cell = document.createElement('td'); cell.innerHTML = 'normal<strong>bold</strong><br><br>';
    const createRange = document.createRange.bind(document);
    vi.spyOn(document, 'createRange').mockImplementation(() => {
      const range = createRange();
      range.getClientRects = () => [range.startContainer.textContent === 'bold' ? box(8, 24) : box(10, 20)] as unknown as DOMRectList;
      return range;
    });
    Array.from(cell.querySelectorAll('br')).forEach((br, i) => vi.spyOn(br, 'getBoundingClientRect').mockReturnValue(i ? box(30, 50) : box(10, 20)));
    expect(cellLines(cell).map(({ top, bottom }) => ({ top, bottom }))).toEqual([{ top: 8, bottom: 24 }, { top: 30, bottom: 50 }]);
  });

  it('refuses to hide an indivisible object taller than a page behind gap masks', () => {
    const { frame, cell } = splitCell(); removeBreaks(frame); cell.innerHTML = '<img>';
    vi.spyOn(cell.firstElementChild!, 'getBoundingClientRect').mockReturnValue(box(100, 1200));
    expect(breakRow(cell.parentElement as HTMLTableRowElement, 100, 1, pageGeometry('a4', false), {})).toBe(false);
    expect(cell.querySelector('.page-cell-break')).toBeNull();
  });
});

/* A one-cell table row whose text a page-break spacer has split, as the Paginated view does. */
function splitCell() {
  const frame = document.createElement('div');
  frame.innerHTML = '<table><tbody><tr data-split="true"><td>First line</td></tr></tbody></table>';
  document.body.append(frame);
  const cell = frame.querySelector('td')!;
  const text = cell.firstChild as Text;
  const rest = text.splitText(6);
  const spacer = document.createElement('span');
  spacer.className = BREAK_CLASS;
  spacer.contentEditable = 'false';
  spacer.style.height = '200px';
  cell.insertBefore(spacer, rest);
  return { frame, cell, text, rest };
}


/* =========================
   Row Page Breaks
   ========================= */

describe('page-break spacers in table rows', () => {
  it.each([1, 2, 3])('preserves a caret at cell child boundary %i when text is rejoined', offset => {
    const { frame, cell } = splitCell();
    const selection = window.getSelection()!;
    selection.setBaseAndExtent(cell, offset, cell, offset);
    removeBreaks(frame);
    const range = document.createRange();
    range.selectNodeContents(cell);
    range.setEnd(selection.focusNode!, selection.focusOffset);
    expect(range.toString()).toBe(offset === 3 ? 'First line' : 'First ');
  });

  it('preserves a backwards selection across a split text node', () => {
    const { frame, text, rest } = splitCell();
    const selection = window.getSelection()!;
    selection.setBaseAndExtent(rest, 3, text, 2);
    removeBreaks(frame);
    expect(selection.toString()).toBe('rst lin');
    expect(selection.anchorOffset).toBe(9);
    expect(selection.focusOffset).toBe(2);
  });

  it('copies text and full cells without spacers and keeps the row setting', () => {
    const { frame, cell, text, rest } = splitCell();
    const range = document.createRange();
    range.setStart(text, 2); range.setEnd(rest, 3);
    expect(selectionHtml(range, frame)).toBe('rst lin');
    window.getSelection()!.addRange(range);
    const copied: Record<string, string> = {};
    writeSelection({ clipboardData: { setData: (type: string, value: string) => { copied[type] = value; } }, preventDefault() {} } as unknown as ClipboardEvent, frame);
    expect(copied['text/plain']).toBe('rst lin');
    expect(Object.values(copied).every(value => !value.includes(BREAK_CLASS))).toBe(true);
    const slice = tableSlice(cell.closest('table')!, { top: 0, bottom: 0, left: 0, right: 0 });
    expect(cleanHtml(slice.outerHTML)).toBe('<table><tbody><tr data-split="true"><td>First line</td></tr></tbody></table>');
  });

  it('does not create an undo step for layout; undo and redo keep only the saved row setting', () => {
    const { frame, cell } = splitCell();
    const original = cleanHtml(frame.innerHTML);
    const history = new History(original);
    expect(history.record(cleanHtml(frame.innerHTML), 8)).toBe(false);
    history.checkpoint(8);
    removeBreaks(frame);
    (cell.firstChild as Text).insertData(8, 'Z');
    history.record(cleanHtml(frame.innerHTML), 9);
    expect(history.undo()?.content).toBe(original);
    const redone = history.redo()!;
    expect(redone.content).toContain('data-split="true"');
    expect(redone.content).toContain('First liZne');
    expect(redone.content).not.toContain(BREAK_CLASS);
  });
  it('are never saved, and the text they split is saved whole', () => {
    const { frame } = splitCell();
    expect(cleanHtml(frame.innerHTML)).toBe('<table><tbody><tr data-split="true"><td>First line</td></tr></tbody></table>');
    frame.remove();
  });

  it('come out with the text joined again, keeping the caret where it was', () => {
    const { frame, cell, rest } = splitCell();
    const selection = window.getSelection()!;
    const range = document.createRange();
    range.setStart(rest, 2);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);

    expect(removeBreaks(frame)).toBe(1);
    expect(cell.childNodes).toHaveLength(1);
    expect(cell.textContent).toBe('First line');
    expect(selection.anchorNode).toBe(cell.firstChild);
    expect(selection.anchorOffset).toBe(8);
    frame.remove();
  });

  it('are cleared with the rest of the page layout', () => {
    const { frame, cell } = splitCell();
    clearPages(frame);
    expect(frame.querySelector(`.${BREAK_CLASS}`)).toBeNull();
    expect(cell.childNodes).toHaveLength(1);
    frame.remove();
  });
});

describe('the Allow row to break across pages setting', () => {
  it('is off unless switched on, and only "true" is saved', () => {
    const row = document.createElement('tr');
    expect(splitsAcrossPages(row)).toBe(false);
    setSplitsAcrossPages(row, true);
    expect(row.outerHTML).toBe('<tr data-split="true"></tr>');
    setSplitsAcrossPages(row, false);
    expect(row.outerHTML).toBe('<tr></tr>');
    expect(cleanHtml('<table><tbody><tr data-split="yes"><td>A</td></tr></tbody></table>')).toBe('<table><tbody><tr><td>A</td></tr></tbody></table>');
  });
});
