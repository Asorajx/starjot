import { highlight } from '../code/code';
import { closestAtCaret, emptyParagraph, isEmptyContent } from './dom';
import type { CommandId } from './slashCommands';


/* =========================
   Building Lines
   ========================= */

/* A line change tells the editor which element should get the caret afterwards. */
export type LineChange = { focus: HTMLElement; atEnd: boolean };

export function withBreak<T extends HTMLElement>(element: T) {
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

/* A toggle's body, holding the lines it opens and closes. A toggle that lost its body (an older */
/* bug could delete it) gets an empty one again, so the toggle can still be opened and filled. */
export function toggleBody(toggle: Element) {
  const body = toggle.querySelector<HTMLElement>(':scope > .toggle-body');
  if (body) return body;
  const made = document.createElement('div');
  made.className = 'toggle-body';
  toggle.appendChild(made);
  return made;
}

/* The line that text joins when the line below a toggle is joined up to it: the toggle's last */
/* line when it is open and has lines, or its title otherwise. */
export function joinLineOfToggle(toggle: Element) {
  const body = toggleBody(toggle);
  const summary = toggle.querySelector<HTMLElement>(':scope > .toggle-summary');
  let line: Element | null = toggle.classList.contains('is-open') ? body.lastElementChild : null;
  while (line && ['UL', 'OL', 'BLOCKQUOTE'].includes(line.tagName) && line.lastElementChild) line = line.lastElementChild;
  if (line?.classList.contains('toggle-block')) return joinLineOfToggle(line);
  return (line && !['PRE', 'HR', 'TABLE'].includes(line.tagName) ? line : summary) as HTMLElement | null;
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
/* A new table starts with every option off: no header row or column, and not stretched to the */
/* page width (its columns grow with their text). All of these can be switched on in the table menu. */
export function createTable(columns = 3, rows = 3) {
  const table = document.createElement('table');
  table.className = 'fit-content';
  const body = table.appendChild(document.createElement('tbody'));
  for (let row = 0; row < rows; row += 1) {
    const line = body.appendChild(document.createElement('tr'));
    for (let column = 0; column < columns; column += 1) line.appendChild(withBreak(document.createElement('td')));
  }
  return table;
}

/* A sub-page shown as a card inside the text. Words can come before and after it once it is */
/* made narrower than its line. */
export function createPageBlock(noteId: string) {
  const block = document.createElement('span');
  block.className = 'page-block';
  block.dataset.page = noteId;
  block.dataset.size = 'small';

  /* A new sub-page card spans the line; it can be dragged narrower. */
  block.dataset.width = '100';
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

/* A mention of another page (from / → Link to page): the page's icon and title, shown as text */
/* that cannot be edited. It is stored empty and drawn by hydratePages, so it always shows the */
/* page's current icon and title. Clicking it opens the page. (A page link pasted into the text */
/* is a normal link instead, whose words can be edited.) */
export function createPageMention(noteId: string) {
  const mention = document.createElement('span');
  mention.className = 'page-mention';
  mention.dataset.page = noteId;
  return mention;
}
