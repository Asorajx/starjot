import { cleanHtml } from '../sanitize';
import { markdownOf } from '../export/exportMarkdown';
import { LINE_TAGS } from './dom';

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

/* Fill the clipboard when copying or cutting in a note: plain text (as the browser would), the */
/* HTML, and the Markdown version for pasting back into a note. Returns false (leaving the browser */
/* to copy) when nothing in the note is selected. */
export function writeSelection(event: ClipboardEvent, root: Element) {
  const selection = window.getSelection();
  const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
  if (!selection || !range || range.collapsed || !event.clipboardData || !root.contains(range.commonAncestorContainer)) return false;
  const html = selectionHtml(range, root);
  const holder = document.createElement('div');
  holder.innerHTML = html;
  event.preventDefault();
  event.clipboardData.setData('text/plain', selection.toString());
  event.clipboardData.setData('text/html', html);
  event.clipboardData.setData(NOTE_MARKDOWN, markdownOf(holder));
  return true;
}

/* The text to read Markdown from when pasting: Starjot's own Markdown when it was copied from a */
/* note, or else the plain text. */
export function pastedSource(data: DataTransfer) {
  return data.getData(NOTE_MARKDOWN) || data.getData('text/plain');
}
