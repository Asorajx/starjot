import { IMAGE_ID, imageUrl, saveImage } from '../imageStore';
import type { EditorSession } from './session';

/* Where an image sits on its line. left: in the text, so words can come before and after it. */
/* center: on a line of its own. right: at the right edge, with the text running beside it. */
export type ImageAlign = 'left' | 'center' | 'right';
export const IMAGE_ALIGNS: ImageAlign[] = ['left', 'center', 'right'];

/* An image can be dragged as small as this, in pixels; it is never wider than its line. */
export const MIN_IMAGE_WIDTH = 32;
const MAX_IMAGE_WIDTH = 4000;

/* A new image starts at its own width, but no wider than this. */
const START_WIDTH = 640;


/* =========================
   Image Blocks
   ========================= */

/* Images sit in the text as <span class="image-block" data-image="id" data-width="320" */
/* data-align="left">. Like page blocks, the span is stored empty and the picture is drawn into */
/* it when the note is shown. Its height follows its width, so the picture keeps its shape. */
export function createImageBlock(id: string, width: number) {
  const block = document.createElement('span');
  block.className = 'image-block';
  block.dataset.image = id;
  setImageWidth(block, width);
  return block;
}

export function imageWidth(block: HTMLElement) {
  const width = Number(block.dataset.width);
  return Number.isFinite(width) && width >= MIN_IMAGE_WIDTH ? Math.min(MAX_IMAGE_WIDTH, Math.round(width)) : 320;
}

export function setImageWidth(block: HTMLElement, width: number) {
  const value = Math.min(MAX_IMAGE_WIDTH, Math.max(MIN_IMAGE_WIDTH, Math.round(width)));
  block.dataset.width = String(value);
  block.style.width = `${value}px`;
  return value;
}

export function imageAlign(block: HTMLElement): ImageAlign {
  return IMAGE_ALIGNS.includes(block.dataset.align as ImageAlign) ? block.dataset.align as ImageAlign : 'left';
}

export function setImageAlign(block: HTMLElement, align: ImageAlign) {
  if (align === 'left') delete block.dataset.align;
  else block.dataset.align = align;
}

/* The image id last drawn into each block, so unchanged blocks are not redrawn. */
const drawn = new WeakMap<Element, string>();

/* Draw each image block: the picture, and the handle that resizes it. A picture the store does */
/* not have (for example in a note copied from another browser) shows a short message instead. */
export function hydrateImages(root: Element | null) {
  root?.querySelectorAll<HTMLElement>('.image-block').forEach(block => {
    const id = block.dataset.image ?? '';
    block.contentEditable = 'false';
    setImageWidth(block, imageWidth(block));
    if (drawn.get(block) === id && block.querySelector('img')) return;
    drawn.set(block, id);

    const picture = document.createElement('img');
    picture.alt = '';
    picture.draggable = false;
    const handle = document.createElement('span');
    handle.className = 'image-resize';
    handle.title = 'Drag to resize';
    block.replaceChildren(picture, handle);
    imageUrl(id).then(url => {
      if (url) picture.src = url;
      else block.classList.add('is-missing');
    });
  });
}


/* =========================
   Adding Images
   ========================= */

/* The image files in a paste or a drop. */
export function imageFiles(data: DataTransfer | null) {
  return Array.from(data?.files ?? []).filter(file => file.type.startsWith('image/'));
}

/* An image's own width in pixels, read from the file. */
function naturalWidth(file: Blob) {
  return new Promise<number>(resolve => {
    const url = URL.createObjectURL(file);
    const picture = new Image();
    picture.onload = () => {
      resolve(picture.naturalWidth || START_WIDTH);
      URL.revokeObjectURL(url);
    };
    picture.onerror = () => {
      resolve(START_WIDTH);
      URL.revokeObjectURL(url);
    };
    picture.src = url;
  });
}

/* Keep each image file and put it at the range, one after another, each followed by a space. */
/* An image starts at its own width, no wider than START_WIDTH or the line it lands on. */
/* Returns the new image blocks (none when the range left the page while the files were saved). */
export async function addImages(files: File[], range: Range, lineWidth: number) {
  const blocks: HTMLElement[] = [];
  for (const file of files) {
    const [id, width] = await Promise.all([saveImage(file), naturalWidth(file)]);
    blocks.push(createImageBlock(id, Math.min(width, START_WIDTH, Math.max(MIN_IMAGE_WIDTH, lineWidth))));
  }
  if (!range.startContainer.isConnected) return [];

  /* Each block goes in front of the ones already placed, so the last image's space is made first; */
  /* the caret goes after it. */
  let end: Text | null = null;
  range.deleteContents();
  for (const block of [...blocks].reverse()) {
    const space = document.createTextNode(' ');
    end ??= space;
    range.insertNode(space);
    range.insertNode(block);
  }
  if (end) {
    const caret = document.createRange();
    caret.setStart(end, 1);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(caret);
  }
  return blocks;
}

/* Paste or drop image files into a note: at the given point (a drop), or else at the caret, */
/* replacing selected text within one line. The whole change is one undo step. */
export async function insertImageFiles(session: EditorSession, files: File[], point: Range | null = null) {
  const body = session.body();
  const selection = window.getSelection();
  const range = point ?? (selection?.rangeCount ? selection.getRangeAt(0).cloneRange() : null);
  if (!body || !range || !body.contains(range.startContainer)) return;

  /* A selection over several lines (or blocks) is not deleted; the images go where it starts. */
  const start = range.startContainer instanceof Element ? range.startContainer : range.startContainer.parentElement;
  const line = start?.closest<HTMLElement>('p, li, h1, h2, h3, h4, h5, h6, td, th, blockquote, .block-content') ?? body;
  if (!line.contains(range.endContainer)) range.collapse(true);

  session.checkpoint();
  const blocks = await addImages(files, range, line.clientWidth);
  if (!blocks.length) return;
  hydrateImages(body);
  session.commit();
}

/* The ids of the images a note's content shows. */
export function imageIdsIn(html: string) {
  const template = document.createElement('template');
  template.innerHTML = html;
  return Array.from(template.content.querySelectorAll<HTMLElement>('.image-block[data-image]')).map(block => block.dataset.image as string);
}

/* The sanitizer's check for an image block's attributes. */
export function safeImageAttributes(node: Element) {
  const id = node.getAttribute('data-image') ?? '';
  const width = Number(node.getAttribute('data-width'));
  const align = node.getAttribute('data-align') ?? '';
  return {
    image: IMAGE_ID.test(id) ? id : null,
    width: Number.isInteger(width) && width >= MIN_IMAGE_WIDTH && width <= MAX_IMAGE_WIDTH ? String(width) : null,
    align: align === 'center' || align === 'right' ? align : null
  };
}
