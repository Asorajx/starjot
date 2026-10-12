/* Only text typed by the user is counted, never editor labels or controls. */
const EDITABLE = '[data-note-editable]';

export type TextRange = { start: number; end: number };


/* =========================
   Editable Text Positions
   ========================= */

/* Positions are counted as characters of editable text, so they survive re-rendering. */
/* A <br> counts as one character because it represents one line break. */
function textUnits(root: Element) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
    acceptNode(node) {
      if (node instanceof Element && node.tagName !== 'BR') return NodeFilter.FILTER_SKIP;
      const parent = node instanceof Element ? node : node.parentElement;
      return parent?.closest(EDITABLE) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
    }
  });
  const units: Node[] = [];
  while (walker.nextNode()) units.push(walker.currentNode);
  return units;
}

function unitLength(node: Node) {
  return node.nodeType === Node.TEXT_NODE ? (node as Text).length : 1;
}

function childIndex(node: Node) {
  return Array.from(node.parentNode?.childNodes ?? []).indexOf(node as ChildNode);
}

/* Count the characters between the start of the root and one point in the document. */
function offsetOf(root: Element, container: Node, offset: number) {
  const point = document.createRange();
  point.setStart(container, offset);
  let total = 0;

  for (const node of textUnits(root)) {
    if (node === container) return total + offset;

    /* Compare against the end of the node to know whether it sits fully before the point. */
    const comparison = node.nodeType === Node.TEXT_NODE
      ? point.comparePoint(node, (node as Text).length)
      : point.comparePoint(node.parentNode as Node, childIndex(node) + 1);
    if (comparison > 0) break;
    total += unitLength(node);
  }
  return total;
}

/* Convert a character count back into a node and offset. */
function pointAt(root: Element, offset: number): { node: Node; offset: number } {
  let remaining = Math.max(0, offset);
  const units = textUnits(root);

  for (const node of units) {
    const length = unitLength(node);
    if (node.nodeType === Node.TEXT_NODE && remaining <= length) return { node, offset: remaining };
    if (node.nodeType !== Node.TEXT_NODE && remaining === 0) return { node: node.parentNode as Node, offset: childIndex(node) };
    remaining -= length;
  }

  /* Past the end, place the caret after the last line break or at the end of the last editor. */
  const last = units[units.length - 1];
  if (last && last.nodeType !== Node.TEXT_NODE) return { node: last.parentNode as Node, offset: childIndex(last) + 1 };
  const editables = root.matches(EDITABLE) ? [root] : Array.from(root.querySelectorAll(EDITABLE));
  const end = editables[editables.length - 1] ?? root;
  return { node: end, offset: end.childNodes.length };
}


/* =========================
   Reading and Restoring the Caret
   ========================= */

/* Return the caret position inside the root, or null when the caret is elsewhere. */
export function getOffset(root: Element | null) {
  const selection = window.getSelection();
  if (!root || !selection?.rangeCount || !selection.focusNode || !root.contains(selection.focusNode)) return null;
  return offsetOf(root, selection.focusNode, selection.focusOffset);
}

/* Return both ends of a selection so it can be restored after the DOM is rebuilt. */
export function getRange(root: Element | null): TextRange | null {
  const selection = window.getSelection();
  if (!root || !selection?.rangeCount) return null;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null;
  return {
    start: offsetOf(root, range.startContainer, range.startOffset),
    end: offsetOf(root, range.endContainer, range.endOffset)
  };
}

export function getLength(root: Element) {
  return textUnits(root).reduce((total, node) => total + unitLength(node), 0);
}

/* Select a range of characters and keep it visible inside the scrolling editor. */
export function setRange(root: Element | null, start: number, end = start) {
  if (!root) return;
  const from = pointAt(root, start);
  const to = end === start ? from : pointAt(root, end);
  const startElement = from.node instanceof Element ? from.node : from.node.parentElement;

  /* Focus first, because focusing an editor can reset its selection. */
  startElement?.closest<HTMLElement>('[contenteditable="true"]')?.focus({ preventScroll: true });
  const range = document.createRange();
  range.setStart(from.node, from.offset);
  range.setEnd(to.node, to.offset);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
  startElement?.scrollIntoView({ block: 'nearest' });
}

export function setOffset(root: Element | null, offset: number) {
  setRange(root, offset, offset);
}
