import { planRowContinuations, type RowBreakOptions } from './rowBreakPlan';
import type { PageGeometry } from './pagination';

/* A table row with "Allow row to break across pages" on (data-split, saved with the note) is */
/* split where a page ends: each cell's text from the first line that would cross the page's end */
/* moves to the next page's text, pushed down by a spacer put into the cell on screen only. Spacers */
/* are never saved, copied or printed (sanitize.ts, print.css), and are taken out before every */
/* layout and before an edit beside them (see usePages). */
export const BREAK_CLASS = 'page-cell-break';

/* Pictures, page blocks and similar cannot be cut, so they move to the next page whole. */
const WHOLE = '.image-block, .page-block, .drawing-block, .reminder-chip, img, hr, table, [contenteditable="false"]';

/* A line of a cell on screen, and where it starts in the cell's content (offset -1: the whole */
/* element). */
type CellLine = { top: number; bottom: number; node: Node; offset: number };

export function splitsAcrossPages(row: HTMLTableRowElement) {
  return row.dataset.split === 'true';
}

export function setSplitsAcrossPages(row: HTMLTableRowElement, split: boolean) {
  if (split) row.dataset.split = 'true';
  else delete row.dataset.split;
}

/* Where in a text node each of its lines starts: the first character whose box is on that line. */
function textLines(text: Text, lines: CellLine[]) {
  if (!text.textContent?.trim()) return;
  const range = document.createRange();
  range.selectNodeContents(text);
  const boxes = Array.from(range.getClientRects()).filter(box => box.height > 0);
  let start = 0;
  boxes.forEach((box, index) => {
    if (index > 0 && Math.abs(box.top - boxes[index - 1].top) < 1) return;
    let offset = 0;
    if (index > 0) {
      let low = start + 1;
      let high = text.length;
      while (low < high) {
        const middle = Math.floor((low + high) / 2);
        range.setStart(text, middle);
        range.setEnd(text, Math.min(text.length, middle + 1));
        if (range.getBoundingClientRect().top >= box.top - 1) high = middle;
        else low = middle + 1;
      }
      offset = low;
    }
    lines.push({ top: box.top, bottom: box.bottom, node: text, offset });
    start = offset;
  });
}

function collectLines(node: Node, lines: CellLine[]) {
  if (node.nodeType === Node.TEXT_NODE) {
    textLines(node as Text, lines);
    return;
  }
  if (!(node instanceof Element) || node.classList.contains(BREAK_CLASS)) return;

  /* Empty lines can hold the caret too. A BR after text merges into that text's line below; */
  /* consecutive BRs contribute their own line boxes and must stay above the page margin. */
  if (node.matches(WHOLE) || node.tagName === 'BR') {
    const box = node.getBoundingClientRect();
    if (box.height) lines.push({ top: box.top, bottom: box.bottom, node, offset: -1 });
    return;
  }
  node.childNodes.forEach(child => collectLines(child, lines));
}

/* A cell's lines in order, one per line on screen (pieces of text on the same line are one). */
export function cellLines(cell: HTMLElement) {
  const lines: CellLine[] = [];
  cell.childNodes.forEach(child => collectLines(child, lines));
  const merged: CellLine[] = [];
  lines.forEach(line => {
    const previous = merged.at(-1);
    if (previous && line.top < previous.bottom - 1 && line.bottom > previous.top + 1) {
      previous.top = Math.min(previous.top, line.top);
      previous.bottom = Math.max(previous.bottom, line.bottom);
    }
    else merged.push({ ...line });
  });
  return merged;
}

function insertBreak(line: CellLine, height: number) {
  const spacer = document.createElement('span');
  spacer.className = BREAK_CLASS;
  spacer.contentEditable = 'false';
  spacer.setAttribute('aria-hidden', 'true');
  spacer.style.height = `${height}px`;
  const splittingText = line.node.nodeType === Node.TEXT_NODE && line.offset > 0;
  const selection = window.getSelection();
  const anchor = splittingText && selection?.anchorNode === line.node && selection.anchorOffset >= line.offset ? selection.anchorOffset - line.offset : null;
  const focus = splittingText && selection?.focusNode === line.node && selection.focusOffset >= line.offset ? selection.focusOffset - line.offset : null;
  const before = splittingText ? (line.node as Text).splitText(line.offset) : line.node;
  before.parentNode?.insertBefore(spacer, before);

  /* splitText leaves an endpoint exactly at the split on the previous page. Keep it with */
  /* the continuation, including the caret restored by Undo at its first character. */
  if (selection?.anchorNode && selection.focusNode && (anchor !== null || focus !== null)) {
    selection.setBaseAndExtent(anchor !== null ? before : selection.anchorNode, anchor ?? selection.anchorOffset,
      focus !== null ? before : selection.focusNode, focus ?? selection.focusOffset);
  }
}

/* Join neighbouring pieces of text in parent (as a spacer split them), moving the caret or either */
/* end of the selection along with the text it was in. */
function joinText(parent: Node) {
  const selection = window.getSelection();
  let anchor = selection?.anchorNode ?? null;
  let anchorOffset = selection?.anchorOffset ?? 0;
  let focus = selection?.focusNode ?? null;
  let focusOffset = selection?.focusOffset ?? 0;
  let moved = false;
  for (let child = parent.firstChild; child;) {
    const next: ChildNode | null = child.nextSibling;
    if (child.nodeType === Node.TEXT_NODE && next?.nodeType === Node.TEXT_NODE) {
      const length = (child as Text).length;
      if (anchor === next) [anchor, anchorOffset, moved] = [child, anchorOffset + length, true];
      if (focus === next) [focus, focusOffset, moved] = [child, focusOffset + length, true];
      const index = Array.from(parent.childNodes).indexOf(next);
      if (anchor === parent && anchorOffset === index) [anchor, anchorOffset, moved] = [child, length, true];
      else if (anchor === parent && anchorOffset > index) { anchorOffset -= 1; moved = true; }
      if (focus === parent && focusOffset === index) [focus, focusOffset, moved] = [child, length, true];
      else if (focus === parent && focusOffset > index) { focusOffset -= 1; moved = true; }
      (child as Text).appendData((next as Text).data);
      next.remove();
      continue;
    }
    child = next;
  }
  if (moved && selection && anchor && focus) selection.setBaseAndExtent(anchor, anchorOffset, focus, focusOffset);
}

/* Take out every spacer under root, joining the text they split. Returns how many there were. */
export function removeBreaks(root: ParentNode) {
  const spacers = Array.from(root.querySelectorAll(`.${BREAK_CLASS}`));
  const parents = new Set<Node>();
  spacers.forEach(spacer => {
    if (spacer.parentNode) parents.add(spacer.parentNode);
    spacer.remove();
  });
  parents.forEach(joinText);
  return spacers.length;
}

/* Split a row that starts at rowTop (CSS pixels from the page frame's top, as it will be shown) */
/* across the pages it runs over. Returns false, changing nothing, when no line of any cell fits */
/* on the first page, as the row should then move to the next page whole. */
export function breakRow(row: HTMLTableRowElement, rowTop: number, scale: number, geometry: PageGeometry, options: RowBreakOptions) {
  if (!Number.isFinite(scale) || scale <= 0) return false;
  const rowBox = row.getBoundingClientRect();
  const plans = Array.from(row.cells).map(cell => {
    const lines = cellLines(cell);
    const placed = lines.map(line => ({ top: rowTop + (line.top - rowBox.top) / scale, bottom: rowTop + (line.bottom - rowBox.top) / scale }));
    return { lines, breaks: planRowContinuations(placed, geometry, options) };
  });

  /* An indivisible object taller than the available page must remain visible, not be masked. */
  const room = geometry.height - geometry.margin * 2 - Math.max(0, options.headerHeight ?? 0);
  if (plans.some(plan => plan.lines.some(line => (line.bottom - line.top) / scale > room))) return false;
  if (!plans.some(plan => plan.lines.length && plan.breaks[0]?.beforeLine !== 0)) return false;

  /* Later breaks first, so splitting a text node leaves the places of earlier lines as they were. */
  plans.forEach(({ lines, breaks }) => [...breaks].reverse().forEach(item => insertBreak(lines[item.beforeLine], item.spacerHeight)));
  return true;
}
