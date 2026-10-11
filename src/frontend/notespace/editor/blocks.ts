import { iconMarkup, type IconName } from '../../components/Icon';
import { categoryName, getNote, updatedLabel } from '../store';
import { highlight } from './code';
import { caretAtEdge, closestAtCaret, emptyParagraph, isEmptyContent, placeCaret } from './dom';


/* =========================
   Slash Commands
   ========================= */

export type CommandId = 'text' | 'h1' | 'h2' | 'h3' | 'bullet' | 'numbered' | 'quote' | 'code' | 'divider' | 'toggle' | 'table' | 'page' | 'link';

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
  { id: 'h3', label: 'Heading 3', hint: '###', icon: 'type', keywords: 'h3 small' },
  { id: 'bullet', label: 'Bulleted list', hint: '-', icon: 'list', keywords: 'ul unordered dots' },
  { id: 'numbered', label: 'Numbered list', hint: '1.', icon: 'list', keywords: 'ol ordered numbers' },
  { id: 'toggle', label: 'Toggle list', hint: '', icon: 'chevron-right', keywords: 'collapse expand details fold' },
  { id: 'quote', label: 'Quote', hint: '>', icon: 'quote', keywords: 'blockquote citation' },
  { id: 'code', label: 'Code block', hint: '```', icon: 'file-code', keywords: 'pre snippet programming' },
  { id: 'table', label: 'Table', hint: '', icon: 'table', keywords: 'grid rows columns spreadsheet' },
  { id: 'divider', label: 'Divider', hint: '---', icon: 'minus', keywords: 'hr line rule separator' },
  { id: 'page', label: 'Sub-page', hint: '', icon: 'file-text', keywords: 'new page subpage child' },
  { id: 'link', label: 'Link to page', hint: '', icon: 'link', keywords: 'mention reference note' }
];

type CommandContext = {
  /* Table cells and toggle titles only hold text, so only the inline link fits there. */
  inlineOnly: boolean;
  canAddPage: boolean;
};

/* Commands whose name or keywords contain the typed text; names that start with it come first. */
export function matchCommands(query: string, context: CommandContext) {
  const text = query.trim().toLowerCase();
  return SLASH_COMMANDS
    .filter(command => (context.inlineOnly ? command.id === 'link' : command.id !== 'page' || context.canAddPage))
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
  if (kind === 'h1' || kind === 'h2' || kind === 'h3') {
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
  if (kind === 'toggle') {
    const toggle = createToggle();
    return { element: toggle, text: toggle.querySelector('.toggle-summary') as HTMLElement };
  }
  const paragraph = document.createElement('p');
  return { element: paragraph, text: paragraph };
}

export function createToggle() {
  const toggle = document.createElement('div');
  toggle.className = 'toggle-block is-open';
  const summary = toggle.appendChild(document.createElement('p'));
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

export function createPageBlock(noteId: string) {
  const block = document.createElement('div');
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

/* Insert a link to another page at the caret. Its text can be changed like any other text. */
export function insertPageLink(range: Range, noteId: string) {
  const note = getNote(noteId);
  const link = document.createElement('a');
  link.className = 'page-link';
  link.dataset.page = noteId;
  link.textContent = note?.title || 'Untitled note';
  const space = document.createTextNode(' ');
  range.deleteContents();
  range.insertNode(space);
  range.insertNode(link);

  const selection = window.getSelection();
  const caret = document.createRange();
  caret.setStart(space, 1);
  selection?.removeAllRanges();
  selection?.addRange(caret);
}


/* =========================
   Page Blocks
   ========================= */

export type PageSize = 'small' | 'medium' | 'large';
export const PAGE_SIZES: PageSize[] = ['small', 'medium', 'large'];

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
   Tables
   ========================= */

export function addRow(table: HTMLTableElement, after: HTMLTableRowElement | null = null) {
  const rows = Array.from(table.rows);
  const source = after ?? rows[rows.length - 1];
  const row = document.createElement('tr');
  Array.from(source.cells).forEach(() => row.appendChild(withBreak(document.createElement('td'))));
  source.after(row);
  return row;
}

export function addColumn(table: HTMLTableElement, after: number) {
  Array.from(table.rows).forEach((row, index) => {
    const cell = withBreak(document.createElement(index === 0 && row.cells[0]?.tagName === 'TH' ? 'th' : 'td'));
    const neighbour = row.cells[after];
    if (neighbour) neighbour.after(cell);
    else row.appendChild(cell);
  });
}

/* Removing the last row or column removes the whole table. Returns false when the table is gone. */
export function removeRow(table: HTMLTableElement, row: HTMLTableRowElement) {
  row.remove();
  return table.rows.length > 0;
}

export function removeColumn(table: HTMLTableElement, index: number) {
  Array.from(table.rows).forEach(row => row.cells[index]?.remove());
  return Boolean(table.rows[0]?.cells.length);
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

function cellKeys(event: KeyboardEvent, cell: HTMLTableCellElement): KeyResult | null {
  const table = cell.closest('table') as HTMLTableElement;

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

  /* Backspace at the start of the title turns the toggle back into normal lines. */
  if (summary && event.key === 'Backspace' && window.getSelection()?.isCollapsed && caretAtEdge(summary, 'start')) {
    event.preventDefault();
    const paragraph = document.createElement('p');
    paragraph.append(...Array.from(summary.childNodes));
    withBreak(paragraph);
    const onlyEmpty = body.childElementCount === 1 && isEmptyContent(body.firstElementChild as Element);
    toggle.replaceWith(paragraph, ...(onlyEmpty ? [] : Array.from(body.childNodes)));
    return { kind: 'lines', focus: paragraph, atEnd: false };
  }

  /* Enter on an empty last line leaves the toggle, like ending a list. */
  const line = closestAtCaret('p');
  if (!summary && event.key === 'Enter' && !event.shiftKey && line && line.parentElement === body && !line.nextElementSibling && isEmptyContent(line)) {
    event.preventDefault();
    if (body.childElementCount > 1) line.remove();
    const paragraph = emptyParagraph();
    toggle.after(paragraph);
    return { kind: 'lines', focus: paragraph, atEnd: false };
  }
  return null;
}

/* Keys with special meaning in table cells and toggle lists. Returns null for every other key. */
export function handleBlockKeys(event: KeyboardEvent, root: HTMLElement): KeyResult | null {
  const cell = closestAtCaret<HTMLTableCellElement>('td, th');
  if (cell && root.contains(cell)) return cellKeys(event, cell);
  return toggleKeys(event);
}
