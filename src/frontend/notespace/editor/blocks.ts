import { iconMarkup, type IconName } from '../../components/Icon';
import { categoryName, getNote, updatedLabel } from '../store';
import { highlight } from './code';
import { addRow } from './tables';
import { caretAtEdge, caretElement, closestAtCaret, emptyParagraph, isEmptyContent, placeCaret } from './dom';


/* =========================
   Slash Commands
   ========================= */

export type CommandId =
  | 'text' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'bullet' | 'numbered' | 'quote' | 'code' | 'divider' | 'table' | 'page' | 'link'
  | 'toggle' | 'toggle-h1' | 'toggle-h2' | 'toggle-h3' | 'toggle-h4' | 'toggle-h5';

export type SlashCommand = {
  id: CommandId;
  label: string;

  /* The Markdown shortcut that does the same thing, shown on the right of the menu. */
  hint: string;
  icon: IconName;

  /* Extra words the menu also matches, so "/ul" finds the bulleted list. */
  keywords: string;
};

export const SLASH_COMMANDS: SlashCommand[] = [
  { id: 'text', label: 'Text', hint: '', icon: 'type', keywords: 'paragraph plain' },
  { id: 'h1', label: 'Heading 1', hint: '#', icon: 'type', keywords: 'title h1 big' },
  { id: 'h2', label: 'Heading 2', hint: '##', icon: 'type', keywords: 'subtitle h2' },
  { id: 'h3', label: 'Heading 3', hint: '###', icon: 'type', keywords: 'h3' },
  { id: 'h4', label: 'Heading 4', hint: '####', icon: 'type', keywords: 'h4 small' },
  { id: 'h5', label: 'Heading 5', hint: '#####', icon: 'type', keywords: 'h5 smallest' },
  { id: 'bullet', label: 'Bulleted list', hint: '-', icon: 'list', keywords: 'ul unordered dots' },
  { id: 'numbered', label: 'Numbered list', hint: '1.', icon: 'list', keywords: 'ol ordered numbers' },
  { id: 'toggle', label: 'Toggle list', hint: '', icon: 'chevron-right', keywords: 'collapse expand details fold' },
  { id: 'toggle-h1', label: 'Toggle heading 1', hint: '', icon: 'chevron-right', keywords: 'collapse fold h1 title' },
  { id: 'toggle-h2', label: 'Toggle heading 2', hint: '', icon: 'chevron-right', keywords: 'collapse fold h2' },
  { id: 'toggle-h3', label: 'Toggle heading 3', hint: '', icon: 'chevron-right', keywords: 'collapse fold h3' },
  { id: 'toggle-h4', label: 'Toggle heading 4', hint: '', icon: 'chevron-right', keywords: 'collapse fold h4' },
  { id: 'toggle-h5', label: 'Toggle heading 5', hint: '', icon: 'chevron-right', keywords: 'collapse fold h5' },
  { id: 'quote', label: 'Quote', hint: '>', icon: 'quote', keywords: 'blockquote citation' },
  { id: 'code', label: 'Code block', hint: '```', icon: 'file-code', keywords: 'pre snippet programming' },
  { id: 'table', label: 'Table', hint: '', icon: 'table', keywords: 'grid rows columns spreadsheet' },
  { id: 'divider', label: 'Divider', hint: '---', icon: 'minus', keywords: 'hr line rule separator' },
  { id: 'page', label: 'Sub-page', hint: '', icon: 'file-text', keywords: 'new page subpage child' },
  { id: 'link', label: 'Link to page', hint: '', icon: 'link', keywords: 'mention reference note' }
];

type CommandContext = {
  /* Table cells and toggle titles cannot hold new lines, so only the link and sub-page (which sit in text) fit there. */
  inlineOnly: boolean;
  canAddPage: boolean;
};

/* Commands whose name or keywords contain the typed text; names that start with it come first. */
export function matchCommands(query: string, context: CommandContext) {
  const text = query.trim().toLowerCase();
  return SLASH_COMMANDS
    .filter(command => (command.id !== 'page' || context.canAddPage) && (!context.inlineOnly || command.id === 'link' || command.id === 'page'))
    .filter(command => !text || `${command.label} ${command.keywords}`.toLowerCase().includes(text))
    .sort((a, b) => Number(b.label.toLowerCase().startsWith(text)) - Number(a.label.toLowerCase().startsWith(text)));
}

/* True when the caret is somewhere a new line cannot be added. */
export function caretIsInlineOnly() {
  return Boolean(closestAtCaret('td, th, .toggle-summary'));
}


/* =========================
   Building Lines
   ========================= */

/* A line change tells the editor which element should get the caret afterwards. */
export type LineChange = { focus: HTMLElement; atEnd: boolean };

function withBreak<T extends HTMLElement>(element: T) {
  if (!element.firstChild) element.appendChild(document.createElement('br'));
  return element;
}

/* The line holding the caret: a paragraph, heading or list item inside the editor. */
export function lineAtCaret(root: HTMLElement) {
  const line = closestAtCaret('p, h1, h2, h3, h4, h5, h6, li');
  return line && line !== root && root.contains(line) ? line : null;
}

/* Build a converted line and the element inside it that holds the text. */
function buildLine(kind: CommandId): { element: HTMLElement; text: HTMLElement } {
  if (/^h[1-5]$/.test(kind)) {
    const heading = document.createElement(kind);
    return { element: heading, text: heading };
  }
  if (kind === 'bullet' || kind === 'numbered') {
    const list = document.createElement(kind === 'bullet' ? 'ul' : 'ol');
    return { element: list, text: list.appendChild(document.createElement('li')) };
  }
  if (kind === 'quote') {
    const quote = document.createElement('blockquote');
    return { element: quote, text: quote.appendChild(document.createElement('p')) };
  }
  if (kind === 'code') {
    const pre = document.createElement('pre');
    return { element: pre, text: pre.appendChild(document.createElement('code')) };
  }
  if (kind.startsWith('toggle')) {
    const toggle = createToggle(Number(kind.slice(-1)) || 0);
    return { element: toggle, text: toggle.querySelector('.toggle-summary') as HTMLElement };
  }
  const paragraph = document.createElement('p');
  return { element: paragraph, text: paragraph };
}

/* A toggle list's title is a paragraph, or a heading (levels 1 to 5) for a toggle heading. */
export function createToggle(headingLevel = 0) {
  const toggle = document.createElement('div');
  toggle.className = 'toggle-block is-open';
  const summary = toggle.appendChild(document.createElement(headingLevel ? `h${headingLevel}` : 'p'));
  summary.className = 'toggle-summary';
  const body = toggle.appendChild(document.createElement('div'));
  body.className = 'toggle-body';
  body.appendChild(emptyParagraph());
  return toggle;
}

/* A table with a header row and two body rows, three columns wide. */
export function createTable(columns = 3, rows = 3) {
  const table = document.createElement('table');
  const body = table.appendChild(document.createElement('tbody'));
  for (let row = 0; row < rows; row += 1) {
    const line = body.appendChild(document.createElement('tr'));
    for (let column = 0; column < columns; column += 1) line.appendChild(withBreak(document.createElement(row === 0 ? 'th' : 'td')));
  }
  return table;
}

/* A sub-page shown as a small card inside the text, so words can come before and after it. */
export function createPageBlock(noteId: string) {
  const block = document.createElement('span');
  block.className = 'page-block';
  block.dataset.page = noteId;
  block.dataset.size = 'small';
  return block;
}

/* Put an element where a list item was, splitting the list around it. */
/* The list item itself is removed when remove is true, or kept above the element otherwise. */
function placeBesideListItem(item: HTMLElement, element: HTMLElement, remove: boolean) {
  const list = item.parentElement as HTMLElement;
  const after = [];
  for (let next = item.nextElementSibling; next; next = next.nextElementSibling) after.push(next);
  if (after.length) {
    const rest = list.cloneNode(false) as HTMLElement;
    rest.append(...after);
    list.after(rest);
  }
  if (remove) item.remove();
  list.after(element);
  if (!list.children.length) list.remove();
}

/* Change the caret's line into another kind of line, keeping its text. */
export function convertLine(line: HTMLElement, kind: CommandId): LineChange {
  const { element, text } = buildLine(kind);
  const empty = isEmptyContent(line);
  if (kind === 'code') text.textContent = line.textContent ?? '';
  else if (!empty) text.append(...Array.from(line.childNodes));
  withBreak(text);

  if (line.tagName === 'LI') placeBesideListItem(line, element, true);
  else line.replaceWith(element);
  if (kind === 'code') highlight(element);
  return { focus: kind === 'code' ? element.querySelector('code') as HTMLElement : text, atEnd: !empty };
}

/* Add a divider, table or page block below the caret's line, or in place of an empty line. */
export function insertBlock(line: HTMLElement, element: HTMLElement): LineChange {
  if (line.tagName === 'LI') placeBesideListItem(line, element, isEmptyContent(line));
  else if (isEmptyContent(line)) line.replaceWith(element);
  else line.after(element);

  /* Writing continues on an empty line below the new block. */
  const next = element.nextElementSibling;
  let paragraph = next instanceof HTMLParagraphElement && isEmptyContent(next) ? next : null;
  if (!paragraph) {
    paragraph = emptyParagraph();
    element.after(paragraph);
  }
  const firstCell = element.querySelector<HTMLElement>('th, td');
  return { focus: firstCell ?? paragraph, atEnd: false };
}

/* Insert something at the caret, such as a page link or page block, with a space after it */
/* so the caret has a place to continue typing. */
export function insertInline(range: Range, element: HTMLElement) {
  const space = document.createTextNode(' ');
  range.deleteContents();
  range.insertNode(space);
  range.insertNode(element);

  const selection = window.getSelection();
  const caret = document.createRange();
  caret.setStart(space, 1);
  selection?.removeAllRanges();
  selection?.addRange(caret);
}

/* Insert a link to another page at the caret. Its text can be changed like any other text. */
export function insertPageLink(range: Range, noteId: string) {
  const link = document.createElement('a');
  link.className = 'page-link';
  link.dataset.page = noteId;
  link.textContent = getNote(noteId)?.title || 'Untitled note';
  insertInline(range, link);
}


/* =========================
   Page Blocks
   ========================= */

export type PageSize = 'small' | 'medium' | 'large';
export const PAGE_SIZES: PageSize[] = ['small', 'medium', 'large'];

/* A page block can be dragged narrower, down to this share of the line (in percent). */
export const MIN_PAGE_WIDTH = 25;

/* The block's width in percent of the line, or null when it has not been resized */
/* (it is then only as wide as its title needs). */
export function pageWidth(block: HTMLElement) {
  const width = Number(block.dataset.width);
  return width >= MIN_PAGE_WIDTH && width <= 100 ? Math.round(width) : null;
}

/* Set the width from a dragged edge position, in steps of 5%. A block wider than the space left */
/* on its line moves down to the next line, like a long word would. */
export function setPageWidth(block: HTMLElement, percent: number | null) {
  const width = percent === null ? null : Math.min(100, Math.max(MIN_PAGE_WIDTH, Math.round(percent / 5) * 5));
  if (width === null) delete block.dataset.width;
  else block.dataset.width = String(width);
  block.style.width = width === null ? '' : `${width}%`;
  if (!block.getAttribute('style')) block.removeAttribute('style');
  return width;
}

/* True when part of the page's title or description is hidden by the block's size or width. */
export function pageBlockIsCut(block: HTMLElement) {
  const title = block.querySelector<HTMLElement>('.page-block-text strong');
  const description = block.querySelector<HTMLElement>('.page-block-text small');
  if (!title || !description) return false;
  const hidden = getComputedStyle(description).display === 'none';
  return hidden || title.scrollWidth > title.clientWidth + 1 || description.scrollHeight > description.clientHeight + 1;
}

function escapeHtml(text: string) {
  return text.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character] ?? character));
}

/* The markup last drawn into each page block, so unchanged blocks are not redrawn. */
const drawn = new WeakMap<Element, string>();

/* Page blocks are stored empty; their title, description and size buttons are drawn when shown, */
/* so they always match the page they point to. */
export function hydratePages(root: Element | null) {
  root?.querySelectorAll<HTMLElement>('.page-block').forEach(block => {
    const note = getNote(block.dataset.page ?? '');
    const size = PAGE_SIZES.includes(block.dataset.size as PageSize) ? block.dataset.size as PageSize : 'small';
    block.contentEditable = 'false';
    block.classList.toggle('is-missing', !note);
    setPageWidth(block, pageWidth(block));

    const sizes = PAGE_SIZES.map(option => (
      `<button type="button" class="page-block-size${option === size ? ' is-active' : ''}" data-size-option="${option}" aria-label="${option} size" title="${option[0].toUpperCase()}${option.slice(1)}">${option[0].toUpperCase()}</button>`
    )).join('');
    const category = note ? categoryName(note.category) : '';
    const html = note
      ? `<span class="page-block-icon">${note.icon ? escapeHtml(note.icon) : iconMarkup('file-text', 18)}</span>`
        + `<span class="page-block-text"><strong>${escapeHtml(note.title || 'Untitled note')}</strong>`
        + `<small>${escapeHtml(note.subtitle || note.preview || 'Empty page')}</small>`
        + `<span class="page-block-meta">${category ? `${escapeHtml(category)} · ` : ''}${escapeHtml(updatedLabel(note))}</span></span>`
        + `<span class="page-block-sizes" role="group" aria-label="Block size">${sizes}</span>`
        + '<span class="page-block-resize" title="Drag to change the width" aria-hidden="true"></span>'
      : `<span class="page-block-icon">${iconMarkup('file', 18)}</span><span class="page-block-text"><strong>Page not found</strong><small>The page was deleted.</small></span>`;
    if (drawn.get(block) === html && block.firstChild) return;
    block.innerHTML = html;
    drawn.set(block, html);
  });
}

/* Ids of the pages shown as page blocks in a note's content. */
export function embeddedPageIds(html: string) {
  const template = document.createElement('template');
  template.innerHTML = html;
  return new Set(Array.from(template.content.querySelectorAll<HTMLElement>('.page-block[data-page]')).map(block => block.dataset.page as string));
}


/* =========================
   Lines Around Tables
   ========================= */

/* The line just above or below another line (such as a table): its neighbour in the document, */
/* outside any sticky group it ends, or in structured mode the neighbouring block. Null at either end. */
function neighbourLine(line: Element, below: boolean): Element | null {
  const sibling = (node: Element) => (below ? node.nextElementSibling : node.previousElementSibling);
  let node: Element = line;
  while (!sibling(node) && node.parentElement && !node.parentElement.matches('#note-body, .block-content')) node = node.parentElement;
  if (sibling(node)) return sibling(node);

  const block = line.closest('.editable-block');
  const blocks = Array.from(block?.closest('#note-body')?.querySelectorAll('.editable-block') ?? []);
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
   Keys Inside Tables and Toggles
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

/* Arrow keys move between cells. Leaving the table goes to the line above or below it; a line */
/* is added below when the table is the last thing in the note. */
function cellArrowKeys(event: KeyboardEvent, cell: HTMLTableCellElement, table: HTMLTableElement): KeyResult | null {
  if (event.shiftKey || event.altKey || event.ctrlKey || event.metaKey || !window.getSelection()?.isCollapsed) return null;
  const row = cell.parentElement as HTMLTableRowElement;
  const cells = Array.from(table.querySelectorAll<HTMLTableCellElement>('th, td'));
  const index = cells.indexOf(cell);
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
    const target = table.rows[row.rowIndex + (up ? -1 : 1)];
    if (!target) return leave(!up);
    event.preventDefault();
    moveIntoCell(target.cells[Math.min(cell.cellIndex, target.cells.length - 1)], up);
    return { kind: 'blocked' };
  }

  if (event.key === 'ArrowRight' && caretAtEdge(cell, 'end')) {
    if (!cells[index + 1]) return leave(true);
    event.preventDefault();
    placeCaret(cells[index + 1]);
    return { kind: 'blocked' };
  }
  if (event.key === 'ArrowLeft' && caretAtEdge(cell, 'start')) {
    if (!cells[index - 1]) return leave(false);
    event.preventDefault();
    placeCaret(cells[index - 1], true);
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
    : element?.closest('#note-body > *, .sticky-group > *');
  const neighbour = line ? neighbourLine(line, below) : null;
  const table = neighbour?.matches('table') ? neighbour as HTMLTableElement : neighbour?.querySelector<HTMLTableElement>(':scope > table');
  if (!line || !table || !window.getSelection()?.isCollapsed || !caretOnEdgeLine(line as HTMLElement, below ? 'bottom' : 'top')) return null;

  let x = 0;
  try {
    x = window.getSelection()?.getRangeAt(0).getClientRects()[0]?.left ?? 0;
  } catch {
    x = 0;
  }
  const row = table.rows[below ? 0 : table.rows.length - 1];
  const cells = Array.from(row?.cells ?? []);
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
    const cells = Array.from(table.querySelectorAll<HTMLTableCellElement>('th, td'));
    const index = cells.indexOf(cell);
    let next = cells[index + (event.shiftKey ? -1 : 1)];
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

function toggleKeys(event: KeyboardEvent): KeyResult | null {
  const summary = closestAtCaret('.toggle-summary');
  const toggle = (summary ?? closestAtCaret('.toggle-body'))?.closest<HTMLElement>('.toggle-block');
  if (!toggle || event.altKey || event.ctrlKey || event.metaKey) return null;
  const body = toggle.querySelector<HTMLElement>(':scope > .toggle-body');
  if (!body) return null;

  /* Enter in the title opens the toggle and moves to its first line. */
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

/* Keys with special meaning in table cells and toggle lists. Returns null for every other key. */
export function handleBlockKeys(event: KeyboardEvent, root: HTMLElement): KeyResult | null {
  leavePageLink(event);
  const cell = closestAtCaret<HTMLTableCellElement>('td, th');
  if (cell && root.contains(cell)) return cellKeys(event, cell);
  return enterTableKeys(event) ?? toggleKeys(event);
}
