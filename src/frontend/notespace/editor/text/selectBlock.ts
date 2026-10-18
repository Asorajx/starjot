/* =========================
   Selecting a Block
   ========================= */

/* Parts of a note that Ctrl + A selects on their own before the whole note: a table cell, a */
/* code block, a toggle list, a quote, a list and a tab of a tab block. */
const CONTAINERS = 'td, th, pre, .toggle-block, blockquote, ul, ol, .tab-panel';

/* Whether a range covers all of an element's text. Browsers move a selection's ends into the text */
/* nodes, so the text is compared rather than only the boundaries. */
function covers(range: Range, element: Element) {
  const whole = document.createRange();
  whole.selectNodeContents(element);
  if (range.compareBoundaryPoints(Range.START_TO_START, whole) <= 0 && range.compareBoundaryPoints(Range.END_TO_END, whole) >= 0) return true;
  return element.contains(range.commonAncestorContainer) && range.toString() === whole.toString();
}

/* Ctrl + A: 'block' when it selected everything in the innermost block holding the selection, */
/* 'note' when that block was already all selected (the whole note comes next), or null when the */
/* selection is not inside such a block of root (Ctrl + A then works as usual). */
export function selectBlockText(root: Element | null): 'block' | 'note' | null {
  const selection = window.getSelection();
  const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
  const common = range?.commonAncestorContainer;
  const container = (common instanceof Element ? common : common?.parentElement)?.closest(CONTAINERS) ?? null;
  if (!selection || !range || !container || !root?.contains(container)) return null;
  if (covers(range, container)) return 'note';
  const whole = document.createRange();
  whole.selectNodeContents(container);
  selection.removeAllRanges();
  selection.addRange(whole);
  return 'block';
}
