import type { IconName } from '../../../components/Icon';
import { highlight } from '../code/code';
import { buildLine, joinAdjacentLists, placeBesideListItem, withBreak } from '../text/lines';


/* =========================
   Line Types
   ========================= */

/* The kinds of line the selection toolbar can turn selected lines into, in the order its menu */
/* lists them. Toggles, tables and tab blocks are left out on purpose: their structure (a title */
/* with a body, cells, panels) has no simple one-line form to swap between. */
export type LineType = 'text' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'bullet' | 'numbered' | 'checklist' | 'quote' | 'code';

export const LINE_TYPES: { id: LineType; label: string; icon: IconName }[] = [
  { id: 'text', label: 'Text', icon: 'type' },
  { id: 'h1', label: 'Heading 1', icon: 'type' },
  { id: 'h2', label: 'Heading 2', icon: 'type' },
  { id: 'h3', label: 'Heading 3', icon: 'type' },
  { id: 'h4', label: 'Heading 4', icon: 'type' },
  { id: 'h5', label: 'Heading 5', icon: 'type' },
  { id: 'bullet', label: 'Bulleted list', icon: 'list' },
  { id: 'numbered', label: 'Numbered list', icon: 'list' },
  { id: 'checklist', label: 'Checklist', icon: 'check-square' },
  { id: 'quote', label: 'Quote', icon: 'quote' },
  { id: 'code', label: 'Code block', icon: 'file-code' }
];

const LIST_TYPES: LineType[] = ['bullet', 'numbered', 'checklist'];

/* Lines whose type can be changed, and places where a line's type must not change (a table */
/* cell, a toggle's title, anything not editable). */
const LINE = 'p, h1, h2, h3, h4, h5, li';
const FIXED = 'td, th, .toggle-summary, [contenteditable="false"]';

/* The type of one changeable line (a <pre> counts as one line of code). */
export function typeOfLine(line: Element): LineType {
  const tag = line.tagName.toLowerCase();
  if (tag === 'pre') return 'code';
  if (/^h[1-5]$/.test(tag)) return tag as LineType;
  if (tag === 'li') {
    const list = line.parentElement;
    if (list?.classList.contains('checklist')) return 'checklist';
    return list?.tagName === 'OL' ? 'numbered' : 'bullet';
  }
  return line.parentElement?.tagName === 'BLOCKQUOTE' ? 'quote' : 'text';
}

/* The selected words inside a node (empty when the selection only touches its edge, such as a */
/* selection ending at the very start of the next line). */
function selectedText(range: Range, node: Node) {
  const part = document.createRange();
  part.selectNodeContents(node);
  if (range.compareBoundaryPoints(Range.START_TO_START, part) > 0) part.setStart(range.startContainer, range.startOffset);
  if (range.compareBoundaryPoints(Range.END_TO_END, part) < 0) part.setEnd(range.endContainer, range.endOffset);
  return part.collapsed ? '' : part.toString();
}

const isList = (node: Node) => node instanceof HTMLElement && ['UL', 'OL'].includes(node.tagName);

/* Whether words of the line itself are selected, not only words of a list nested inside it (a */
/* bullet whose sub-bullets alone are selected is not itself selected). */
function ownTextSelected(range: Range, line: Element) {
  return Array.from(line.childNodes).some(child => !isList(child) && selectedText(range, child).length > 0);
}

/* The lines a selection covers, in order, or null when it covers something whose type cannot */
/* change (a table cell, a toggle's title) or reaches across blocks in Block mode. */
export function linesInRange(range: Range, root: Element): HTMLElement[] | null {
  const startBlock = elementOf(range.startContainer)?.closest('.block-content');
  const endBlock = elementOf(range.endContainer)?.closest('.block-content');
  if (startBlock !== endBlock) return null;

  const lines: HTMLElement[] = [];
  let fixed = false;
  const visit = (element: Element) => {
    if (!selectedText(range, element)) return;
    if (element.matches(FIXED)) {
      fixed = true;
      return;
    }
    if (element.tagName === 'PRE') {
      lines.push(element as HTMLElement);
      return;
    }

    /* A line is taken whole; only lists nested in it are looked into further. */
    if (element.matches(LINE)) {
      if (ownTextSelected(range, element)) lines.push(element as HTMLElement);
      Array.from(element.children).filter(isList).forEach(visit);
      return;
    }
    Array.from(element.children).forEach(visit);
  };
  Array.from(root.children).forEach(visit);
  return fixed || !lines.length ? null : lines;
}

function elementOf(node: Node) {
  return node instanceof Element ? node : node.parentElement;
}

/* A line inside a list or a quote leaves it for something else: the list or quote is split */
/* around it (and removed when it ends up empty). Other lines are simply replaced. */
function putInPlace(line: HTMLElement, element: HTMLElement) {
  const parent = line.parentElement;
  if (parent && ['UL', 'OL', 'BLOCKQUOTE'].includes(parent.tagName)) placeBesideListItem(line, element, true);
  else line.replaceWith(element);
}

/* Turn one line (not code) into another type, keeping its words and inline formatting. A list */
/* item's own sub-list stays with it when it becomes another kind of list item, and moves out */
/* below it otherwise. Returns the element holding its words. */
function changeLine(line: HTMLElement, type: LineType) {
  const { element, text } = buildLine(type);
  const nested = Array.from(line.children).filter(isList);
  const keepsNested = LIST_TYPES.includes(type);
  Array.from(line.childNodes).forEach(child => {
    if (nested.includes(child as Element) && !keepsNested) return;
    text.append(child);
  });
  if (!text.textContent && !text.querySelector('br, img, .page-block, .page-mention')) text.replaceChildren(document.createElement('br'));
  else withBreak(text);
  putInPlace(line, element);
  if (!keepsNested && nested.length) element.after(...nested);
  return text;
}

/* Code keeps only words: a code block becomes one line per line of code, and lines becoming */
/* code are joined into one block. */
function linesOfCode(pre: HTMLElement, type: LineType) {
  const rows = (pre.textContent ?? '').replace(/\n$/, '').split('\n');
  const made = rows.map(row => {
    const { element, text } = buildLine(type);
    text.replaceChildren(row ? document.createTextNode(row) : document.createElement('br'));
    return { element, text };
  });
  pre.after(...made.map(item => item.element));
  pre.remove();
  return made.map(item => item.text);
}

/* Quotes made from several lines in a row become one quote, as lists do. */
function joinNewQuotes(quotes: Set<Element>) {
  quotes.forEach(quote => {
    const previous = quote.previousElementSibling;
    if (previous && quotes.has(previous) && previous.tagName === 'BLOCKQUOTE' && quote.parentNode) {
      previous.append(...Array.from(quote.childNodes));
      quote.remove();
    }
  });
}

/* Change every line to the type, in place. Lines already of that type are left as they are. */
/* Returns the first and last elements holding the words, to select them again afterwards. */
export function changeLinesType(lines: HTMLElement[], type: LineType, root: HTMLElement) {
  const texts: HTMLElement[] = [];

  if (type === 'code') {
    if (lines.length === 1 && lines[0].tagName === 'PRE') return { first: lines[0], last: lines[0] };
    const { element, text } = buildLine('code');
    text.textContent = lines.map(line => (line.tagName === 'PRE' ? (line.textContent ?? '').replace(/\n$/, '') : childText(line))).join('\n');
    putInPlace(lines[0], element);
    lines.slice(1).forEach(remove);
    highlight(element);
    return { first: text, last: text };
  }

  const quotes = new Set<Element>();
  lines.forEach(line => {
    if (line.tagName === 'PRE') {
      const made = linesOfCode(line, type);
      if (type === 'quote') made.forEach(text => quotes.add(text.parentElement as Element));
      texts.push(...made);
      return;
    }
    if (typeOfLine(line) === type) {
      texts.push(line);
      return;
    }
    const text = changeLine(line, type);
    if (type === 'quote') quotes.add(text.parentElement as Element);
    texts.push(text);
  });
  joinNewQuotes(quotes);
  joinAdjacentLists(root);
  return { first: texts[0], last: texts[texts.length - 1] };
}

/* A line's own words, without the words of a list nested inside it. */
function childText(line: Element) {
  return Array.from(line.childNodes)
    .filter(child => !isList(child))
    .map(child => child.textContent ?? '')
    .join('');
}

/* Take a line out (when lines are joined into one code block), and any list or quote left empty. */
function remove(line: HTMLElement) {
  let parent = line.parentElement;
  const nested = Array.from(line.children).filter(isList);
  if (nested.length) line.after(...nested);
  line.remove();
  while (parent && ['UL', 'OL', 'BLOCKQUOTE'].includes(parent.tagName) && !parent.children.length) {
    const above: HTMLElement | null = parent.parentElement;
    parent.remove();
    parent = above;
  }
}
