import { cleanHtml } from '../../sanitize';
import { markdownOf } from '../../export/exportMarkdown';
import { LINE_TAGS } from './dom';
import { copiedTables, NOTE_TABLES, selectedCells, tableSlice, tableText } from '../tables/tableClipboard';

/* A clipboard type only Starjot reads: the copied text as Markdown, so pasting it into a note */
/* brings back its headings, lists, quotes, code and formatting. Other apps get plain text. */
export const NOTE_MARKDOWN = 'text/x-starjot-markdown';


/* =========================
   Copying From a Note
   ========================= */

/* The line (paragraph, heading, list item…) a node is in, inside the editable root. */
function lineOf(node: Node, root: Element) {
  const element = node instanceof Element ? node : node.parentElement;
  let line = element;
  while (line && line !== root && !LINE_TAGS.has(line.tagName) && line.tagName !== 'LI') line = line.parentElement;
  return line && line !== root ? line : null;
}

/* The selected part of a note as HTML. A selection inside one line that covers all of its text */
/* keeps the kind of line it is (a whole heading copies as a heading, a whole list item as a list */
/* item); part of a line copies as text. Editor-only parts (buttons, block handles) are left out. */
export function selectionHtml(range: Range, root: Element) {
  const holder = document.createElement('div');
  holder.append(range.cloneContents());
  const start = lineOf(range.startContainer, root);
  if (start && start === lineOf(range.endContainer, root) && range.toString().trim() === start.textContent?.trim()) {
    let wrapper: Element = start.cloneNode(false) as Element;
    wrapper.append(...Array.from(holder.childNodes));
    if (start.tagName === 'LI' && start.parentElement) {
      const list = start.parentElement.cloneNode(false) as Element;
      list.append(wrapper);
      wrapper = list;
    }
    holder.replaceChildren(wrapper);
  }
  holder.querySelectorAll('.block-controls, button, .image-resize, .page-block-sizes, .page-block-resize').forEach(element => element.remove());
  return cleanHtml(holder.innerHTML);
}

/* Put copied note HTML on the clipboard: the plain text, the HTML, the Markdown version for */
/* pasting back into a note, and any tables in full (so they keep their look when pasted). */
export function writeClipboard(data: DataTransfer, html: string, plain: string) {
  const holder = document.createElement('div');
  holder.innerHTML = html;
  data.setData('text/plain', plain);
  data.setData('text/html', html);
  data.setData(NOTE_MARKDOWN, markdownOf(holder));
  const tables = Array.from(holder.querySelectorAll('table'));
  if (tables.length) data.setData(NOTE_TABLES, tables.map(table => table.outerHTML).join(''));
}

/* Fill the clipboard when copying or cutting in a note. A selection from one table cell to */
/* another copies those cells as a table (tab-separated as plain text, as spreadsheets expect). */
/* Returns false (leaving the browser to copy) when nothing in the note is selected. */
export function writeSelection(event: ClipboardEvent, root: Element) {
  const selection = window.getSelection();
  const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
  if (!selection || !range || range.collapsed || !event.clipboardData || !root.contains(range.commonAncestorContainer)) return false;
  event.preventDefault();
  const cells = selectedCells(range, root);
  if (cells) {
    const slice = tableSlice(cells.table, cells.cells);
    writeClipboard(event.clipboardData, cleanHtml(slice.outerHTML), tableText(slice));
  } else {
    writeClipboard(event.clipboardData, selectionHtml(range, root), selection.toString());
  }
  return true;
}

/* The text to read Markdown from when pasting: Starjot's own Markdown when it was copied from a */
/* note, or else the plain text. */
export function pastedSource(data: DataTransfer) {
  return data.getData(NOTE_MARKDOWN) || data.getData('text/plain');
}

/* Pasted lines with each table read from Markdown swapped for the same table as it was copied, */
/* with its look (see NOTE_TABLES). */
export function withCopiedTables(lines: HTMLElement[], data: DataTransfer) {
  const tables = copiedTables(data);
  return lines.map(line => (line.tagName === 'TABLE' ? tables.shift() ?? line : line));
}
