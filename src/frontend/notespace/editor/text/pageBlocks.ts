import { iconMarkup } from '../../../components/Icon';
import { categoryName, getNote, noteTitle, updatedLabel } from '../../store';
import { hydrateImages } from '../images/images';
import { escapeHtml } from '../../../lib/html';


/* =========================
   Page Blocks
   ========================= */

export type PageSize = 'small' | 'medium' | 'large';
export const PAGE_SIZES: PageSize[] = ['small', 'medium', 'large'];

/* A page block can be dragged narrower, down to this share of the line (in percent). */
export const MIN_PAGE_WIDTH = 25;

/* The block's width in percent of the line, or null when it has not been resized */
/* (it is then only as wide as its title needs). */
export function pageWidth(block: HTMLElement) {
  const width = Number(block.dataset.width);
  return width >= MIN_PAGE_WIDTH && width <= 100 ? Math.round(width) : null;
}

/* Set the width from a dragged edge position, in steps of 5%. A block wider than the space left */
/* on its line moves down to the next line, like a long word would. */
export function setPageWidth(block: HTMLElement, percent: number | null) {
  const width = percent === null ? null : Math.min(100, Math.max(MIN_PAGE_WIDTH, Math.round(percent / 5) * 5));
  if (width === null) delete block.dataset.width;
  else block.dataset.width = String(width);
  block.style.width = width === null ? '' : `${width}%`;
  if (!block.getAttribute('style')) block.removeAttribute('style');
  return width;
}

/* The markup last drawn into each page block, so unchanged blocks are not redrawn. */
const drawn = new WeakMap<Element, string>();

/* Ask the note's block widgets to open a sub-note's menu as a name box beside its block, as */
/* Rename does, for a sub-note just made and left closed. */
export const RENAME_SUB_NOTE = 'starjot-rename-sub-note';

export function renameSubNote(id: string) {
  window.dispatchEvent(new CustomEvent(RENAME_SUB_NOTE, { detail: id }));
}

/* Page blocks are stored empty; their title, description and size buttons are drawn when shown, */
/* so they always match the page they point to. Images are stored empty too and drawn here as well. */
export function hydratePages(root: Element | null) {
  hydrateImages(root);
  root?.querySelectorAll<HTMLElement>('.page-mention').forEach(mention => {
    const note = getNote(mention.dataset.page ?? '');
    mention.contentEditable = 'false';
    mention.classList.toggle('is-missing', !note);
    const icon = note?.icon ? escapeHtml(note.icon) : iconMarkup(note ? 'file-text' : 'file', 14);
    const html = `<span class="page-mention-icon">${icon}</span><span class="page-mention-title">${escapeHtml(note ? noteTitle(note) : 'Note not found')}</span>`;
    if (drawn.get(mention) === html && mention.firstChild) return;
    mention.innerHTML = html;
    drawn.set(mention, html);
  });
  root?.querySelectorAll<HTMLElement>('.page-block').forEach(block => {
    const note = getNote(block.dataset.page ?? '');
    const size = PAGE_SIZES.includes(block.dataset.size as PageSize) ? block.dataset.size as PageSize : 'small';
    block.contentEditable = 'false';
    block.classList.toggle('is-missing', !note);
    setPageWidth(block, pageWidth(block));

    const sizes = PAGE_SIZES.map(option => (
      `<button type="button" class="page-block-size${option === size ? ' is-active' : ''}" data-size-option="${option}" aria-label="${option} size" title="${option[0].toUpperCase()}${option.slice(1)}">${option[0].toUpperCase()}</button>`
    )).join('');
    const category = note ? categoryName(note.category) : '';
    const html = note
      ? `<span class="page-block-icon">${note.icon ? escapeHtml(note.icon) : iconMarkup('file-text', 18)}</span>`
        + `<span class="page-block-text"><strong>${escapeHtml(noteTitle(note))}</strong>`
        + `<small>${escapeHtml(note.subtitle || note.preview || 'Empty note')}</small>`
        + `<span class="page-block-meta">${category ? `${escapeHtml(category)} · ` : ''}${escapeHtml(updatedLabel(note))}</span></span>`
        + `<span class="page-block-sizes" role="group" aria-label="Block size">${sizes}</span>`
        + '<span class="page-block-resize" title="Drag to change the width" aria-hidden="true"></span>'
      : `<span class="page-block-icon">${iconMarkup('file', 18)}</span><span class="page-block-text"><strong>Note not found</strong><small>The note was deleted.</small></span>`;
    if (drawn.get(block) === html && block.firstChild) return;
    block.innerHTML = html;
    drawn.set(block, html);
  });
}


/* =========================
   Keeping Page Blocks
   ========================= */

/* Page blocks touched by a range (fully or partly), in the order they appear. */
export function pageBlocksIn(range: Range, root: Element) {
  return Array.from(root.querySelectorAll<HTMLElement>('.page-block')).filter(block => range.intersectsNode(block));
}

/* A page block stands for a whole page, so typing never deletes it: only the right-click menu can. */
/* Delete the text in a range but put back any page blocks it held, where the range started (after */
/* any replacement text), each followed by a space. Returns false when the range held none. */
export function deleteKeepingPages(range: Range, root: Element, text = '') {
  const blocks = pageBlocksIn(range, root);
  if (!blocks.length) return false;

  /* Remember where the selection starts and which lines it starts and ends in, before deleting. */
  const lineOf = (node: Node) => (node instanceof Element ? node : node.parentElement)?.closest<HTMLElement>('p, h1, h2, h3, h4, h5, h6, li, pre');
  const startNode = range.startContainer;
  const startOffset = range.startOffset;
  const startLine = lineOf(startNode);
  const endLine = lineOf(range.endContainer);
  range.deleteContents();

  /* Like normal deleting, the rest of the last line joins the first line. */
  if (startLine && endLine && startLine !== endLine && startLine.isConnected && endLine.isConnected) {
    startLine.append(...Array.from(endLine.childNodes));
    endLine.remove();
  }
  if (startNode.isConnected) range.setStart(startNode, Math.min(startOffset, startNode.nodeType === Node.TEXT_NODE ? startNode.textContent?.length ?? 0 : startNode.childNodes.length));
  range.collapse(true);

  /* A partly selected block may have lost some of its drawn content; it is drawn again afterwards. */
  blocks.forEach(block => block.replaceChildren());
  const typed = text ? document.createTextNode(text) : null;
  const fragment = document.createDocumentFragment();
  if (typed) fragment.append(typed);
  blocks.forEach(block => fragment.append(block, document.createTextNode(' ')));
  range.insertNode(fragment);
  hydratePages(root);

  /* A selection across several lines leaves the first and last of them as empty shells; they are removed. */
  root.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, blockquote').forEach(line => {
    if (!line.firstChild) line.remove();
  });
  root.querySelectorAll('ul, ol').forEach(list => {
    if (!list.firstElementChild) list.remove();
  });

  const caret = document.createRange();
  if (typed) caret.setStartAfter(typed);
  else caret.setStartBefore(blocks[0]);
  window.getSelection()?.removeAllRanges();
  window.getSelection()?.addRange(caret);
  return true;
}

/* Backspace or Delete right next to a page block moves the caret past it instead of deleting it, */
/* like stepping over one character. Returns true when the caret was moved. */
export function stepOverPage(event: InputEvent, root: Element) {
  const deleting = /^delete(Content|Word|SoftLine|HardLine)(Backward|Forward)$/.test(event.inputType);
  const target = event.getTargetRanges?.()[0];
  if (!deleting || !target || !window.getSelection()?.isCollapsed) return false;
  const range = document.createRange();
  range.setStart(target.startContainer, target.startOffset);
  range.setEnd(target.endContainer, target.endOffset);
  const blocks = pageBlocksIn(range, root);
  if (!blocks.length) return false;

  const backward = event.inputType.endsWith('Backward');
  const caret = document.createRange();
  if (backward) caret.setStartBefore(blocks[0]);
  else caret.setStartAfter(blocks[blocks.length - 1]);
  window.getSelection()?.removeAllRanges();
  window.getSelection()?.addRange(caret);
  return true;
}

/* Remove every block for one page from the note's content (when the page is deleted or moved out). */
export function removePageBlocks(root: Element, id: string) {
  root.querySelectorAll<HTMLElement>(`.page-block[data-page="${CSS.escape(id)}"]`).forEach(block => {
    const after = block.nextSibling;
    if (after?.nodeType === Node.TEXT_NODE && after.textContent?.startsWith(' ')) after.textContent = after.textContent.slice(1);
    block.remove();
  });
}
