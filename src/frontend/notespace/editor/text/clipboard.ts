import { cleanHtml } from '../../sanitize';
import { markdownOf } from '../../export/exportMarkdown';
import { LINE_TAGS } from './dom';
import { pastedMarkdown } from './paste';
import { copiedTables, NOTE_TABLES, selectedCells, tableSlice, tableText } from '../tables/tableClipboard';
import { elementOf } from '../../../lib/nodes';

/* A clipboard type only Starjot reads: the copied text as Markdown, so pasting it into a note */
/* brings back its headings, lists, quotes, code and formatting. Other apps get plain text. */
export const NOTE_MARKDOWN = 'text/x-starjot-markdown';

/* Toggle lists and tab blocks cannot be written in Markdown exactly (a toggle heading, or which */
/* tab is shown, would be lost), so they also go on the clipboard in full, as cleaned HTML in this */
/* type (a list, in order). The Markdown holds a marker line in each one's place, which pasting */
/* swaps for the block. */
export const NOTE_BLOCKS = 'text/x-starjot-blocks';
const BLOCKS = '.toggle-block, .tab-block';

/* The marker line for the copied block at index, made of characters no one types. */
function blockMarker(index: number) {
  return `⁣starjot-block-${index}⁣`;
}


/* =========================
   Copying From a Note
   ========================= */

/* The line (paragraph, heading, list item…) a node is in, inside the editable root. */
function lineOf(node: Node, root: Element) {
  const element = elementOf(node);
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
  const wholeLine = start && start === lineOf(range.endContainer, root) && range.toString().trim() === start.textContent?.trim();
  if (start && wholeLine) {
    let wrapper: Element = start.cloneNode(false) as Element;
    wrapper.append(...Array.from(holder.childNodes));
    if (start.tagName === 'LI' && start.parentElement) {
      const list = start.parentElement.cloneNode(false) as Element;
      list.append(wrapper);
      wrapper = list;
    }
    holder.replaceChildren(wrapper);
  }

  /* A selection of a whole toggle's text (its title and lines) copies the toggle itself; the */
  /* browser would copy only what is inside it. The same goes for toggles around that one. (A */
  /* toggle that is itself the whole line selected was wrapped above already.) */
  const common = range.commonAncestorContainer;
  let toggle = elementOf(common)?.closest('.toggle-block') ?? null;
  if (wholeLine && toggle === start) toggle = toggle.parentElement?.closest('.toggle-block') ?? null;
  while (toggle && root.contains(toggle) && range.toString().trim() === toggle.textContent?.trim()) {
    const wrapper = toggle.cloneNode(false) as Element;
    wrapper.append(...Array.from(holder.childNodes));
    holder.replaceChildren(wrapper);
    toggle = toggle.parentElement?.closest('.toggle-block') ?? null;
  }
  holder.querySelectorAll('.block-controls, button, .image-resize, .page-block-sizes, .page-block-resize').forEach(element => element.remove());
  return cleanHtml(holder.innerHTML);
}

/* Put copied note HTML on the clipboard: the plain text, the HTML, the Markdown version for */
/* pasting back into a note, and any tables, toggle lists and tab blocks in full (so they come back */
/* exactly as they were). */
export function writeClipboard(data: DataTransfer, html: string, plain: string) {
  const holder = document.createElement('div');
  holder.innerHTML = html;
  data.setData('text/plain', plain);
  data.setData('text/html', html);

  /* Only the outermost toggles and tab blocks: ones inside them travel with them. */
  const blocks = Array.from(holder.querySelectorAll(BLOCKS)).filter(block => !block.parentElement?.closest(BLOCKS));
  if (blocks.length) data.setData(NOTE_BLOCKS, JSON.stringify(blocks.map(block => block.outerHTML)));
  const markdown = holder.cloneNode(true) as HTMLElement;
  Array.from(markdown.querySelectorAll(BLOCKS)).filter(block => !block.parentElement?.closest(BLOCKS)).forEach((block, index) => {
    block.replaceWith(Object.assign(document.createElement('p'), { textContent: blockMarker(index) }));
  });
  data.setData(NOTE_MARKDOWN, markdownOf(markdown));

  const tables = Array.from(holder.querySelectorAll('table')).filter(table => !table.closest(BLOCKS));
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
function pastedSource(data: DataTransfer) {
  return data.getData(NOTE_MARKDOWN) || data.getData('text/plain');
}

/* Pasted lines with each table read from Markdown swapped for the same table as it was copied, */
/* with its look (see NOTE_TABLES). */
function withCopiedTables(lines: HTMLElement[], data: DataTransfer) {
  const tables = copiedTables(data);
  return lines.map(line => (line.tagName === 'TABLE' ? tables.shift() ?? line : line));
}

/* The toggle lists and tab blocks copied from a note (see NOTE_BLOCKS), cleaned again. */
function copiedBlocks(data: DataTransfer) {
  try {
    const list: unknown = JSON.parse(data.getData(NOTE_BLOCKS) || '[]');
    if (!Array.isArray(list)) return [];
    return list.map(html => {
      const holder = document.createElement('template');
      holder.innerHTML = cleanHtml(String(html));
      return holder.content.firstElementChild as HTMLElement | null;
    });
  } catch {
    return [];
  }
}

/* The lines to paste into a note, or null to paste plain text: the Markdown read as lines, with */
/* copied tables, toggle lists and tab blocks put back exactly as they were (a marker line, alone or */
/* inside a quote or list, becomes its block). */
export function pastedLines(data: DataTransfer) {
  const blocks = copiedBlocks(data);
  const lines = pastedMarkdown(pastedSource(data), data.getData('text/html'), blocks.length > 0);
  if (!lines) return null;
  const blockFor = (line: Element) => {
    const index = blocks.findIndex((_, at) => line.tagName === 'P' && line.textContent === blockMarker(at));
    return index >= 0 ? blocks[index] : null;
  };
  return withCopiedTables(lines, data).map(line => {
    const block = blockFor(line);
    if (block) return block;
    line.querySelectorAll('p').forEach(inner => {
      const nested = blockFor(inner);
      if (nested) inner.replaceWith(nested);
    });
    return line;
  });
}
