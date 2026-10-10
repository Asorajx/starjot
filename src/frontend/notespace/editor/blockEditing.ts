import { getLength } from './caret';
import { isEmptyContent, selectionInside } from './dom';


/* =========================
   Splitting Blocks
   ========================= */

/* The HTML for a new block made from the text after the caret. */
function nextBlockHtml(fragment: DocumentFragment) {
  const holder = document.createElement('div');
  holder.appendChild(fragment);
  if (!holder.textContent?.trim() && !holder.querySelector('br, hr')) return '<p><br></p>';

  /* A new, empty line after a heading is a normal paragraph, not another heading. */
  const only = holder.children.length === 1 ? holder.firstElementChild : null;
  if (only && /^H[1-6]$/.test(only.tagName) && !only.textContent?.trim()) return '<p><br></p>';
  return holder.innerHTML || '<p><br></p>';
}

/* Move everything after the caret out of a block. Returns the HTML for the next block. */
/* The block element itself keeps the text before the caret. */
export function splitAtCaret(editable: HTMLElement) {
  const selection = window.getSelection();
  if (!selection?.rangeCount || !selectionInside(editable)) return '<p><br></p>';

  const current = selection.getRangeAt(0).cloneRange();
  current.deleteContents();
  current.collapse(true);
  const trailing = document.createRange();
  trailing.setStart(current.startContainer, current.startOffset);
  trailing.setEnd(editable, editable.childNodes.length);
  const nextHtml = nextBlockHtml(trailing.extractContents());

  /* Keep an emptied line (such as a heading) open with a <br>, so the caret can return to it. */
  if (isEmptyContent(editable) && !editable.querySelector('br')) {
    const only = editable.children.length === 1 ? editable.firstElementChild : null;
    if (only && !only.childElementCount && only.tagName !== 'HR') only.appendChild(document.createElement('br'));
    else editable.innerHTML = '<p><br></p>';
  }
  return nextHtml;
}


/* =========================
   Merging Blocks
   ========================= */

export function isRuleOnly(editable: Element) {
  return !editable.textContent?.trim() && Boolean(editable.querySelector('hr'));
}

/* Combine two neighbouring blocks, like deleting the line break between two lines. */
/* Works on copies and returns the merged HTML plus the caret offset where the blocks meet. */
export function mergeContents(upper: HTMLElement, lower: HTMLElement) {
  const target = upper.cloneNode(true) as HTMLElement;
  const source = lower.cloneNode(true) as HTMLElement;
  const containers = ['UL', 'OL', 'BLOCKQUOTE', 'PRE'];

  /* Find the innermost last line of the upper block and first line of the lower block. */
  let targetLine: Element = target.lastElementChild ?? target;
  while (containers.includes(targetLine.tagName) && targetLine.lastElementChild) targetLine = targetLine.lastElementChild;
  let sourceLine: Element = source.firstElementChild ?? source;
  while (containers.includes(sourceLine.tagName) && sourceLine.firstElementChild) sourceLine = sourceLine.firstElementChild;

  /* Divider lines cannot hold text, so blocks next to them are placed one after the other instead. */
  const canJoin = targetLine.tagName !== 'HR' && sourceLine.tagName !== 'HR';
  if (canJoin && !targetLine.textContent) targetLine.replaceChildren();
  const offset = getLength(target);

  if (canJoin && sourceLine.textContent) targetLine.append(...Array.from(sourceLine.childNodes));

  /* Remove the moved line and any list or quote it leaves empty. */
  if (canJoin && sourceLine !== source) {
    let parent = sourceLine.parentElement;
    sourceLine.remove();
    while (parent && parent !== source && !parent.childElementCount && !parent.textContent?.trim()) {
      const next: HTMLElement | null = parent.parentElement;
      parent.remove();
      parent = next;
    }
  }
  target.append(...Array.from(source.childNodes));

  if (isEmptyContent(target) && !target.querySelector('br')) target.innerHTML = '<p><br></p>';
  return { html: target.innerHTML, offset };
}
