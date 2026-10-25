import { getRange, setRange } from './caret';
import { elementOf } from '../../../lib/nodes';

/* Elements that form their own line in a document; anything else is inline text. */
export const LINE_TAGS = new Set(['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL', 'BLOCKQUOTE', 'PRE', 'HR', 'TABLE']);


/* =========================
   Selection Helpers
   ========================= */

/* The element that contains the caret (text nodes are replaced by their parent). */
export function caretElement() {
  const node = window.getSelection()?.focusNode ?? null;
  return elementOf(node);
}

export function closestAtCaret<T extends Element = HTMLElement>(selector: string) {
  return caretElement()?.closest<T>(selector) ?? null;
}

export function selectionInside(root: Element) {
  const selection = window.getSelection();
  return Boolean(selection?.rangeCount && selection.anchorNode && selection.focusNode
    && root.contains(selection.anchorNode) && root.contains(selection.focusNode));
}

/* Put the caret at the start or end of an element. */
export function placeCaret(element: Element, atEnd = false) {
  const range = document.createRange();
  range.selectNodeContents(element);
  range.collapse(!atEnd);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

export function selectContents(element: Element) {
  const range = document.createRange();
  range.selectNodeContents(element);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

/* Check whether only empty markup sits between the caret and the start or end of an element. */
export function caretAtEdge(element: Element, edge: 'start' | 'end') {
  const selection = window.getSelection();
  if (!selection?.rangeCount || !selection.anchorNode || !element.contains(selection.anchorNode)) return false;
  const range = document.createRange();
  range.selectNodeContents(element);
  if (edge === 'start') range.setEnd(selection.anchorNode, selection.anchorOffset);
  else range.setStart(selection.anchorNode, selection.anchorOffset);

  const holder = document.createElement('div');
  holder.appendChild(range.cloneContents());
  if (holder.textContent?.replace(/​/g, '') || holder.querySelector('hr, img, table, .page-block')) return false;

  /* A final <br> only keeps an empty line open, so it does not count after the caret. */
  const breaks = Array.from(holder.querySelectorAll('br'));
  if (edge === 'end' && breaks.length) {
    let last: Node = holder;
    while (last.lastChild) last = last.lastChild;
    if (last === breaks[breaks.length - 1]) breaks.pop();
  }
  return breaks.length === 0;
}

/* The character just before or after a collapsed caret, used to group undo steps by word. */
export function charBesideCaret(direction: 'before' | 'after') {
  const selection = window.getSelection();
  const node = selection?.focusNode;
  if (!selection?.isCollapsed || !node || node.nodeType !== Node.TEXT_NODE) return '\n';
  const text = node.textContent ?? '';
  const offset = selection.focusOffset;
  return (direction === 'before' ? text[offset - 1] : text[offset]) ?? '\n';
}


/* =========================
   Content Helpers
   ========================= */

/* A line or block with no text left (only empty lines) counts as empty. */
export function isEmptyContent(element: Element) {
  return !element.textContent?.replace(/​/g, '') && !element.querySelector('hr, img, table, .page-block');
}

export function emptyParagraph() {
  const paragraph = document.createElement('p');
  paragraph.appendChild(document.createElement('br'));
  return paragraph;
}

/* Wrap loose text that sits directly in an editor into paragraphs. */
/* Browsers type the first line of an empty editor without a <p>, which gave it a different font and size. */
export function wrapLooseLines(root: Element) {
  const hasLoose = Array.from(root.childNodes).some(node =>
    (node.nodeType === Node.TEXT_NODE && node.textContent) || (node instanceof Element && !LINE_TAGS.has(node.tagName) && node.tagName !== 'BR'));
  if (!hasLoose) {
    /* An emptied editor gets one empty paragraph, so the next line typed is styled correctly. */
    if (!root.childNodes.length) {
      const paragraph = root.appendChild(emptyParagraph());
      if (root === document.activeElement) placeCaret(paragraph);
    }
    return;
  }

  /* Moving nodes clears the selection, so restore it from character offsets afterwards. */
  const selection = root.contains(document.activeElement) || root === document.activeElement ? getRange(root) : null;
  let paragraph: HTMLParagraphElement | null = null;

  Array.from(root.childNodes).forEach(node => {
    const isLine = node instanceof Element && LINE_TAGS.has(node.tagName);
    if (isLine) {
      paragraph = null;
      return;
    }
    if (!paragraph) {
      paragraph = document.createElement('p');
      node.before(paragraph);
    }
    paragraph.appendChild(node);
  });

  if (selection) setRange(root, selection.start, selection.end);
}
