import { addRow, cellsInRow, tableGrid } from '../tables/tables';
import { caretAtEdge, caretElement, closestAtCaret, emptyParagraph, isEmptyContent, placeCaret } from './dom';
import { joinLineOfToggle, toggleBody, withBreak, type LineChange } from './lines';
import { tabKeys } from './tabs';


/* =========================
   Lines Around Tables
   ========================= */

/* The line just above or below another line (such as a table): its neighbour in the document, */
/* outside any sticky group it ends, or in structured mode the neighbouring block. Null at either end. */
function neighbourLine(line: Element, below: boolean): Element | null {
  const sibling = (node: Element) => (below ? node.nextElementSibling : node.previousElementSibling);
  let node: Element = line;
  while (!sibling(node) && node.parentElement && !node.parentElement.matches('.note-body, .block-content')) node = node.parentElement;
  if (sibling(node)) return sibling(node);

  const block = line.closest('.editable-block');
  const blocks = Array.from(block?.closest('.note-body')?.querySelectorAll('.editable-block') ?? []);
  return block ? blocks[blocks.indexOf(block) + (below ? 1 : -1)]?.querySelector('.block-content') ?? null : null;
}

/* The empty line right under a table, adding one when there is none. In structured mode the */
/* next line may sit in the next block. created tells the editor whether the note changed. */
export function lineBelowTable(table: HTMLElement) {
  const nextBlock = table.closest('.editable-block')?.nextElementSibling;
  const next = table.nextElementSibling
    ?? (nextBlock?.matches('.editable-block') ? nextBlock.querySelector('.block-content')?.firstElementChild : null);
  if (next instanceof HTMLParagraphElement && isEmptyContent(next)) return { line: next, created: false };
  const paragraph = emptyParagraph();
  table.after(paragraph);
  return { line: paragraph, created: true };
}


/* =========================
   Keys Inside Tables, Toggles and Lists
   ========================= */

/* blocked: the key was stopped and nothing changed. changed: text changed inside the same line. */
/* lines: lines were added or removed, and the caret belongs in focus. */
export type KeyResult = { kind: 'blocked' } | { kind: 'changed' } | ({ kind: 'lines' } & LineChange);

function insertBreak() {
  const selection = window.getSelection();
  if (!selection?.rangeCount) return;
  const range = selection.getRangeAt(0);
  range.deleteContents();
  const lineBreak = document.createElement('br');
  range.insertNode(lineBreak);
  range.setStartAfter(lineBreak);
  range.collapse(true);

  /* Browsers need a second <br> to show a caret after a trailing line break. */
  if (!lineBreak.nextSibling) lineBreak.after(document.createElement('br'));
  selection.removeAllRanges();
  selection.addRange(range);
}

/* True when the caret is on the first (top) or last (bottom) line of text in a cell or line. */
/* The text is measured rather than the box, because a cell can be taller than its text when a */
/* neighbouring cell has more lines. Empty cells cannot be measured but have one line, so they count as both. */
function caretOnEdgeLine(element: HTMLElement, edge: 'top' | 'bottom') {
  const selection = window.getSelection();
  if (!selection?.rangeCount) return true;
  try {
    const box = selection.getRangeAt(0).getClientRects()[0];
    const content = document.createRange();
    content.selectNodeContents(element);
    const lines = Array.from(content.getClientRects()).filter(rect => rect.height > 0);
    if (!box || !lines.length) return true;
    const half = (parseFloat(getComputedStyle(element).lineHeight) || 20) / 2;
    return edge === 'top'
      ? box.top - Math.min(...lines.map(rect => rect.top)) < half
      : Math.max(...lines.map(rect => rect.bottom)) - box.bottom < half;
  } catch {
    return true;
  }
}

/* Move into a cell above or below, keeping the caret's left-right position when the browser can find it. */
function moveIntoCell(cell: HTMLElement, fromBelow: boolean) {
  const selection = window.getSelection();
  let x = 0;
  try {
    x = selection?.rangeCount ? selection.getRangeAt(0).getClientRects()[0]?.left ?? 0 : 0;
  } catch {
    x = 0;
  }
  const bounds = cell.getBoundingClientRect();
  const point = x && document.caretRangeFromPoint ? document.caretRangeFromPoint(x, fromBelow ? bounds.bottom - 12 : bounds.top + 12) : null;
  if (point && cell.contains(point.startContainer)) {
    selection?.removeAllRanges();
    selection?.addRange(point);
  } else {
    placeCaret(cell, fromBelow);
  }
}

/* The cell beside another on screen: to its right (step 1) or left (step -1). At the end of a row it */
/* continues on the next row's first cell (or the previous row's last cell). The grid is used because */
/* with merged cells, the cell next to another in the page code is not always the one beside it. */
function sideCell(table: HTMLTableElement, cell: HTMLTableCellElement, step: 1 | -1) {
  const { grid, places } = tableGrid(table);
  const place = places.get(cell);
  if (!place) return null;
  const beside = grid[place.row]?.[step > 0 ? place.column + place.columns : place.column - 1];
  if (beside) return beside;
  const row = grid[step > 0 ? place.row + place.rows : place.row - 1];
  return (step > 0 ? row?.[0] : row?.[row.length - 1]) ?? null;
}

/* Arrow keys move between cells. Leaving the table goes to the line above or below it; a line */
/* is added below when the table is the last thing in the note. */
function cellArrowKeys(event: KeyboardEvent, cell: HTMLTableCellElement, table: HTMLTableElement): KeyResult | null {
  if (event.shiftKey || event.altKey || event.ctrlKey || event.metaKey || !window.getSelection()?.isCollapsed) return null;
  const leave = (below: boolean): KeyResult | null => {
    const line = neighbourLine(table, below);
    if (!line && !below) return null;
    event.preventDefault();
    if (!line) return { kind: 'lines', focus: lineBelowTable(table).line, atEnd: false };
    placeCaret(line, !below);
    return { kind: 'blocked' };
  };

  if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
    const up = event.key === 'ArrowUp';
    if (!caretOnEdgeLine(cell, up ? 'top' : 'bottom')) return null;

    /* The grid is used so a merged cell above or below is found by its column, not its position in the row. */
    const { grid, places } = tableGrid(table);
    const place = places.get(cell);
    const row = place ? (up ? place.row - 1 : place.row + place.rows) : -1;
    const line = grid[row];
    const target = place && line ? line[place.column] ?? line[line.length - 1] : undefined;
    if (!target) return leave(!up);
    event.preventDefault();
    moveIntoCell(target, up);
    return { kind: 'blocked' };
  }

  if (event.key === 'ArrowRight' && caretAtEdge(cell, 'end')) {
    const next = sideCell(table, cell, 1);
    if (!next) return leave(true);
    event.preventDefault();
    placeCaret(next);
    return { kind: 'blocked' };
  }
  if (event.key === 'ArrowLeft' && caretAtEdge(cell, 'start')) {
    const previous = sideCell(table, cell, -1);
    if (!previous) return leave(false);
    event.preventDefault();
    placeCaret(previous, true);
    return { kind: 'blocked' };
  }
  return null;
}

/* Up or Down from the line next to a table goes into the cell nearest the caret, */
/* in the table's last row (from below) or first row (from above). */
function enterTableKeys(event: KeyboardEvent): KeyResult | null {
  if ((event.key !== 'ArrowUp' && event.key !== 'ArrowDown') || event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) return null;
  const below = event.key === 'ArrowDown';

  /* The whole line holding the caret. In structured mode that is a line inside the block, not the block itself. */
  const element = caretElement();
  const content = element?.closest('.block-content');
  const line = content
    ? (element === content ? content.firstElementChild : element?.closest('.block-content > *'))
    : element?.closest('.note-body > *, .sticky-group > *');
  const neighbour = line ? neighbourLine(line, below) : null;
  const table = neighbour?.matches('table') ? neighbour as HTMLTableElement : neighbour?.querySelector<HTMLTableElement>(':scope > table');
  if (!line || !table || !window.getSelection()?.isCollapsed || !caretOnEdgeLine(line as HTMLElement, below ? 'bottom' : 'top')) return null;

  let x = 0;
  try {
    x = window.getSelection()?.getRangeAt(0).getClientRects()[0]?.left ?? 0;
  } catch {
    x = 0;
  }
  const cells = cellsInRow(table, below ? 0 : table.rows.length - 1);
  const cell = cells.find(item => {
    const bounds = item.getBoundingClientRect();
    return x >= bounds.left && x <= bounds.right;
  }) ?? cells[0];
  if (!cell) return null;
  event.preventDefault();
  moveIntoCell(cell, !below);
  return { kind: 'blocked' };
}

function cellKeys(event: KeyboardEvent, cell: HTMLTableCellElement): KeyResult | null {
  const table = cell.closest('table') as HTMLTableElement;
  if (event.key.startsWith('Arrow')) return cellArrowKeys(event, cell, table);

  /* Tab moves between cells; Tab in the last cell adds a row. */
  if (event.key === 'Tab' && !event.altKey && !event.ctrlKey && !event.metaKey) {
    event.preventDefault();
    let next = sideCell(table, cell, event.shiftKey ? -1 : 1);
    const adding = !next && !event.shiftKey;
    if (adding) next = addRow(table).cells[0];
    if (next) placeCaret(next, true);
    return adding ? { kind: 'changed' } : { kind: 'blocked' };
  }

  /* Enter adds a line inside the cell, because a cell cannot be split into two lines of the note. */
  if (event.key === 'Enter' && !event.altKey && !event.ctrlKey && !event.metaKey) {
    event.preventDefault();
    insertBreak();
    return { kind: 'changed' };
  }

  /* Deleting at the edge of a cell would merge cells or lines, so it is ignored. */
  const selection = window.getSelection();
  if (selection?.isCollapsed && ((event.key === 'Backspace' && caretAtEdge(cell, 'start')) || (event.key === 'Delete' && caretAtEdge(cell, 'end')))) {
    event.preventDefault();
    return { kind: 'blocked' };
  }
  return null;
}

/* Backspace at the start of the line just below a toggle joins that line to the toggle (see */
/* joinLineOfToggle). The browser would otherwise move it into the toggle's frame, outside its */
/* lines, where a few more presses could delete the toggle's body. */
function joinBelowToggle(event: KeyboardEvent): KeyResult | null {
  if (event.key !== 'Backspace' || event.altKey || event.ctrlKey || event.metaKey || !window.getSelection()?.isCollapsed) return null;
  let line: Element | null = caretElement();
  while (line && !line.previousElementSibling?.classList.contains('toggle-block')) {
    if (line.matches('.block-content, .note-body, .toggle-body, td, th') || !caretAtEdge(line, 'start')) return null;
    line = line.parentElement;
  }
  if (!line || !caretAtEdge(line, 'start') || !/^(P|H[1-6])$/.test(line.tagName)) return null;
  const target = joinLineOfToggle(line.previousElementSibling as Element);
  if (!target) return null;

  event.preventDefault();
  if (isEmptyContent(target)) target.replaceChildren();
  else if (target.lastChild?.nodeName === 'BR') target.lastChild.remove();
  const caret = document.createRange();
  caret.setStart(target, target.childNodes.length);
  if (!isEmptyContent(line)) target.append(...Array.from(line.childNodes));
  if (!target.childNodes.length) target.append(document.createElement('br'));
  line.remove();
  window.getSelection()?.removeAllRanges();
  window.getSelection()?.addRange(caret);
  return { kind: 'changed' };
}

function toggleKeys(event: KeyboardEvent): KeyResult | null {
  const summary = closestAtCaret('.toggle-summary');
  const toggle = (summary ?? closestAtCaret('.toggle-body'))?.closest<HTMLElement>('.toggle-block');
  if (!toggle) return joinBelowToggle(event);
  const body = toggleBody(toggle);

  /* Ctrl + Enter opens or closes the toggle. Closing it from one of its lines moves the caret to */
  /* the end of its title, so the caret is never hidden. */
  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey) {
    event.preventDefault();
    const open = !toggle.classList.contains('is-open');
    toggle.classList.toggle('is-open', open);
    if (!open && !summary) {
      const title = toggle.querySelector(':scope > .toggle-summary');
      if (title) placeCaret(title, true);
    }
    return { kind: 'changed' };
  }
  if (event.altKey || event.ctrlKey || event.metaKey) return null;

  /* A caret in a toggle with no lines sits in its empty body; deleting there would delete the */
  /* body itself, so the caret moves to the end of the title instead. */
  if (!summary && (event.key === 'Backspace' || event.key === 'Delete') && !body.firstElementChild) {
    event.preventDefault();
    const title = toggle.querySelector(':scope > .toggle-summary');
    if (title) placeCaret(title, true);
    return { kind: 'blocked' };
  }

  /* Enter in the title of a closed toggle adds a new line below the toggle and leaves it closed. */
  if (summary && event.key === 'Enter' && !event.shiftKey && !toggle.classList.contains('is-open')) {
    event.preventDefault();
    const paragraph = emptyParagraph();
    toggle.after(paragraph);
    return { kind: 'lines', focus: paragraph, atEnd: false };
  }

  /* Enter in the title of an open toggle moves to its first line. */
  if (summary && event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    toggle.classList.add('is-open');
    const first = body.firstElementChild;
    const line = first instanceof HTMLParagraphElement && isEmptyContent(first) ? first : body.insertBefore(emptyParagraph(), first);
    placeCaret(line);
    return { kind: 'changed' };
  }

  /* Backspace at the start of the title turns the toggle back into normal lines (a toggle */
  /* heading keeps its heading). */
  if (summary && event.key === 'Backspace' && window.getSelection()?.isCollapsed && caretAtEdge(summary, 'start')) {
    event.preventDefault();
    const paragraph = document.createElement(summary.tagName.toLowerCase());
    paragraph.append(...Array.from(summary.childNodes));
    withBreak(paragraph);
    const onlyEmpty = body.childElementCount === 1 && isEmptyContent(body.firstElementChild as Element);
    toggle.replaceWith(paragraph, ...(onlyEmpty ? [] : Array.from(body.childNodes)));
    return { kind: 'lines', focus: paragraph, atEnd: false };
  }

  /* Backspace on an empty last line moves it out of the toggle, to just below it. Enter keeps */
  /* adding lines inside the toggle, so empty lines can be used for spacing. */
  const line = closestAtCaret('.toggle-body > *');
  if (!summary && event.key === 'Backspace' && line?.parentElement === body && !line.nextElementSibling && isEmptyContent(line)
    && window.getSelection()?.isCollapsed) {
    event.preventDefault();
    line.remove();
    const paragraph = emptyParagraph();
    toggle.after(paragraph);
    return { kind: 'lines', focus: paragraph, atEnd: false };
  }
  return null;
}

/* Enter inside a page link would split it, or carry the link onto the new line. The caret is */
/* moved just outside the link first (before it at its start, after it anywhere else), so the */
/* new line starts as plain text. The key itself is still handled as usual afterwards. */
function leavePageLink(event: KeyboardEvent) {
  const link = event.key === 'Enter' ? closestAtCaret('a.page-link') : null;
  const selection = window.getSelection();
  if (!link || !selection?.isCollapsed) return;
  const caret = document.createRange();
  if (caretAtEdge(link, 'start') && link.textContent) caret.setStartBefore(link);
  else caret.setStartAfter(link);
  selection.removeAllRanges();
  selection.addRange(caret);
}

/* A comment belongs to the words that were selected. Pressing Enter at the start or end of those */
/* words first moves the caret just outside them, so the new line is not part of the comment. */
/* (Enter in the middle still splits the words, and both halves keep the comment.) */
function leaveCommentMark(event: KeyboardEvent) {
  const mark = event.key === 'Enter' ? closestAtCaret('.comment-mark') : null;
  const selection = window.getSelection();
  if (!mark || !selection?.isCollapsed) return;
  const atStart = caretAtEdge(mark, 'start');
  if (!atStart && !caretAtEdge(mark, 'end')) return;
  const caret = document.createRange();
  if (atStart) caret.setStartBefore(mark);
  else caret.setStartAfter(mark);
  selection.removeAllRanges();
  selection.addRange(caret);
}

/* Text typed at the start or end of commented words goes just outside them, so it is not added to */
/* the comment. The browser would otherwise keep typing inside the comment. Returns true when the */
/* text was placed here (the caller then stops the browser from also typing it). */
export function typeOutsideComment(event: InputEvent) {
  const mark = event.inputType === 'insertText' && event.data ? closestAtCaret('.comment-mark') : null;
  if (!mark || !window.getSelection()?.isCollapsed) return false;
  const atStart = caretAtEdge(mark, 'start');
  if (!atStart && !caretAtEdge(mark, 'end')) return false;

  const data = event.data as string;
  const neighbour = atStart ? mark.previousSibling : mark.nextSibling;
  let node: Text;
  let offset: number;
  if (neighbour?.nodeType === Node.TEXT_NODE) {
    node = neighbour as Text;
    if (atStart) node.appendData(data);
    else node.insertData(0, data);
    offset = atStart ? node.length : data.length;
  } else {
    node = document.createTextNode(data);
    if (atStart) mark.before(node);
    else mark.after(node);
    offset = data.length;
  }
  const caret = document.createRange();
  caret.setStart(node, offset);
  window.getSelection()?.removeAllRanges();
  window.getSelection()?.addRange(caret);
  return true;
}

/* Backspace at the start of a list item (not inside another list) turns it into a normal line, */
/* as in most editors; the browser would otherwise do nothing for a list at the top of a note. */
/* Items after it move into a new list below the line, and lists inside the item follow the line. */
function listKeys(event: KeyboardEvent, root: HTMLElement): KeyResult | null {
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return null;
  if (!window.getSelection()?.isCollapsed) return null;
  const checklistItem = event.key === 'Enter' ? closestAtCaret<HTMLLIElement>('ul.checklist > li') : null;
  if (checklistItem && root.contains(checklistItem) && !isEmptyContent(checklistItem)) return splitChecklistItem(event, checklistItem);
  const leavesEmpty = checklistItem && root.contains(checklistItem);
  if (event.key !== 'Backspace' && !leavesEmpty) return null;
  const item = closestAtCaret<HTMLLIElement>('li');
  const list = item?.parentElement;
  if (!item || !list || !root.contains(item) || !list.matches('ul, ol') || list.parentElement?.closest('li')) return null;
  if (!leavesEmpty && !caretAtEdge(item, 'start')) return null;
  event.preventDefault();

  const nested = Array.from(item.children).filter(child => child.matches('ul, ol'));
  const paragraph = document.createElement('p');
  paragraph.append(...Array.from(item.childNodes).filter(node => !nested.includes(node as Element)));
  withBreak(paragraph);

  const rest = list.cloneNode(false) as HTMLElement;
  while (item.nextElementSibling) rest.append(item.nextElementSibling);
  item.remove();
  list.after(paragraph, ...nested, ...(rest.childElementCount ? [rest] : []));
  if (!list.childElementCount) list.remove();
  return { kind: 'lines', focus: paragraph, atEnd: false };
}

/* Enter in a checklist item moves the text after the caret into a new, unticked item below (the */
/* browser would copy the tick). Enter in an empty item leaves the list, like other lists. */
function splitChecklistItem(event: KeyboardEvent, item: HTMLLIElement): KeyResult {
  event.preventDefault();
  const caret = window.getSelection()?.getRangeAt(0);
  const after = document.createRange();
  if (caret) after.setStart(caret.startContainer, caret.startOffset);
  after.setEndAfter(item.lastChild ?? item);
  const next = document.createElement('li');
  next.append(after.extractContents());
  if (isEmptyContent(next)) next.replaceChildren(document.createElement('br'));
  withBreak(item);
  item.after(next);
  return { kind: 'lines', focus: next, atEnd: false };
}

/* Keys with special meaning in table cells, tab blocks, toggle lists and lists. Returns null for */
/* every other key. */
export function handleBlockKeys(event: KeyboardEvent, root: HTMLElement): KeyResult | null {
  leavePageLink(event);
  leaveCommentMark(event);
  const cell = closestAtCaret<HTMLTableCellElement>('td, th');
  if (cell && root.contains(cell)) return cellKeys(event, cell);
  return enterTableKeys(event) ?? tabKeys(event) ?? toggleKeys(event) ?? listKeys(event, root);
}
