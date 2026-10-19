import { emptyParagraph, placeCaret } from './dom';


/* =========================
   Selecting a Divider
   ========================= */

/* A click on a divider (or an arrow key past one) leaves the caret between lines, as tall as */
/* the line next to it and not inside any text, so it is unclear what Backspace would do. Such */
/* a caret selects the divider instead: it is highlighted, Backspace, Delete or typing replace */
/* it, Enter adds a line below it and the arrow keys step past it. */

/* The divider right beside a caret that sits between lines (not in any text), or null. */
function dividerBesideCaret(root: HTMLElement): HTMLHRElement | null {
  const selection = window.getSelection();
  const node = selection?.anchorNode;
  if (!selection?.isCollapsed || !(node instanceof Element) || !root.contains(node) || node.closest('pre, td, th')) return null;
  const after = node.childNodes[selection.anchorOffset];
  const before = node.childNodes[selection.anchorOffset - 1];
  if (after instanceof HTMLHRElement) return after;
  return before instanceof HTMLHRElement ? before : null;
}

/* The divider the selection holds and nothing else, or null. */
export function selectedDivider(root: HTMLElement): HTMLHRElement | null {
  const selection = window.getSelection();
  const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
  if (!range || range.collapsed || range.startContainer !== range.endContainer || range.endOffset - range.startOffset !== 1) return null;
  const node = range.startContainer.childNodes[range.startOffset];
  return node instanceof HTMLHRElement && root.contains(node) ? node : null;
}

/* Called on every selection change: a caret beside a divider selects it, and the selected */
/* divider is marked so it shows (the mark is never saved; see sanitize.ts). */
export function selectDividerAtCaret(root: HTMLElement) {
  const divider = dividerBesideCaret(root);
  if (divider) {
    const range = document.createRange();
    range.selectNode(divider);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
  }
  const selected = divider ?? selectedDivider(root);
  root.querySelectorAll('hr.is-selected').forEach(rule => {
    if (rule !== selected) rule.removeAttribute('class');
  });
  selected?.classList.add('is-selected');
}

/* The caret's place just past a divider: the end of the text before it, or the start of the */
/* text after it (a line break counts as an empty line's text). False at either end of the note. */
function stepPast(divider: HTMLHRElement, root: HTMLElement, backward: boolean) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
    acceptNode: node => (node.nodeName === 'BR' || (node.nodeType === Node.TEXT_NODE && node.textContent?.trim()) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP)
  });
  walker.currentNode = divider;
  const node = backward ? walker.previousNode() : walker.nextNode();
  if (!node) return false;
  const caret = document.createRange();
  if (node.nodeName === 'BR') caret.setStartBefore(node);
  else caret.setStart(node, backward ? (node.textContent?.length ?? 0) : 0);
  window.getSelection()?.removeAllRanges();
  window.getSelection()?.addRange(caret);
  return true;
}

/* Keys on a selected divider. 'moved' when only the caret moved, 'changed' when the note */
/* changed, or null to let the browser (or the other handlers) act: Backspace, Delete and */
/* typing remove the divider as they would any selection. */
export function dividerKeys(event: KeyboardEvent, root: HTMLElement): 'moved' | 'changed' | null {
  const divider = selectedDivider(root);
  if (!divider || event.altKey || event.ctrlKey || event.metaKey) return null;
  if (['ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight'].includes(event.key) && !event.shiftKey) {
    event.preventDefault();
    if (!stepPast(divider, root, event.key === 'ArrowUp' || event.key === 'ArrowLeft')) stepPast(divider, root, event.key === 'ArrowDown' || event.key === 'ArrowRight');
    return 'moved';
  }
  if (event.key === 'Enter') {
    event.preventDefault();
    const paragraph = emptyParagraph();
    divider.after(paragraph);
    placeCaret(paragraph);
    return 'changed';
  }
  return null;
}
