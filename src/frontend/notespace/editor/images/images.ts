import { IMAGE_ID, imageUrl, saveImage } from '../../imageStore';
import type { DrawingStroke } from '../../../../shared/types/note';
import { decodeStrokes, encodeStrokes, inDrawingOrder, strokeMarkup } from '../drawing/drawing';
import type { EditorSession } from '../session';

/* Where an image sits on its line. left: in the text, so words can come before and after it. */
/* wrap-left: at the left edge, with the text running beside it. center: on a line of its own. */
/* right: at the right edge, with the text running beside it. */
export type ImageAlign = 'left' | 'wrap-left' | 'center' | 'right';
export const IMAGE_ALIGNS: ImageAlign[] = ['left', 'wrap-left', 'center', 'right'];

/* An anchored drawing's own size, and how far it may be moved from where the text would put it. */
const MAX_DRAWING_SIZE = 5000;
const MAX_OFFSET = 2000;

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

  /* A drawing in front of the text takes no room itself, so its strokes are sized on their own. */
  if (block.classList.contains('drawing-block')) block.style.setProperty('--drawing-width', `${value}px`);
  return value;
}

export function imageAlign(block: HTMLElement): ImageAlign {
  return IMAGE_ALIGNS.includes(block.dataset.align as ImageAlign) ? block.dataset.align as ImageAlign : 'left';
}

export function setImageAlign(block: HTMLElement, align: ImageAlign) {
  if (align === 'left') delete block.dataset.align;
  else block.dataset.align = align;
}

/* The image id (or drawing) last drawn into each block, so unchanged blocks are not redrawn. */
const drawn = new WeakMap<Element, string>();

/* Draw each image block: the picture, and the handle that resizes it. A picture the store does */
/* not have (for example in a note copied from another browser) shows a short message instead. */
/* An anchored drawing draws its strokes instead of a picture. */
export function hydrateImages(root: Element | null) {
  root?.querySelectorAll<HTMLElement>('.image-block').forEach(block => {
    const id = block.dataset.image ?? '';
    block.contentEditable = 'false';
    setImageWidth(block, imageWidth(block));
    if (block.classList.contains('drawing-block')) {
      hydrateDrawing(block);
      return;
    }
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
   Anchored Drawings
   ========================= */

/* A drawing anchored into the text is an image block with its strokes instead of a picture: */
/* <span class="image-block drawing-block" data-drawing="strokes" data-box="w h" data-width="…">. */
/* data-box is the drawing's own size; data-width is how wide it is shown, so it can be resized */
/* like an image. data-offset="x y" (when snapping is turned off) keeps it where it was drawn, */
/* x pixels from its side of the column and y pixels below its line. */
/* With data-wrap="front" the drawing sits in front of the text instead: it takes no room, so no */
/* words move aside, and data-offset places it from the start of the line it is anchored to (and */
/* moves with). */
export function createDrawingBlock(strokes: DrawingStroke[], width: number, height: number, shownWidth: number, align: ImageAlign, offset: { x: number; y: number } | null) {
  const block = document.createElement('span');
  block.className = 'image-block drawing-block';
  block.dataset.drawing = encodeStrokes(strokes);
  block.dataset.box = `${Math.round(width)} ${Math.round(height)}`;
  if (offset) block.dataset.offset = `${Math.round(offset.x)} ${Math.round(offset.y)}`;
  setImageWidth(block, shownWidth);
  setImageAlign(block, align);
  return block;
}

/* How an anchored drawing sits with the text: wrapped (the text moves aside) or in front of it. */
export type DrawingWrap = 'wrap' | 'front';

export function drawingWrap(block: HTMLElement): DrawingWrap {
  return block.dataset.wrap === 'front' ? 'front' : 'wrap';
}

export function setDrawingWrap(block: HTMLElement, wrap: DrawingWrap) {
  if (wrap === 'front') block.dataset.wrap = 'front';
  else delete block.dataset.wrap;
}

/* Two whole numbers from an attribute such as "120 80", each kept within 0 and max (or within */
/* -max and max when they may be negative). */
function numberPair(value: string | undefined, max: number, signed = false) {
  const parts = (value ?? '').split(' ').map(Number);
  const min = signed ? -max : 0;
  if (parts.length !== 2 || !parts.every(part => Number.isInteger(part) && part >= min && part <= max)) return null;
  return parts as [number, number];
}

export function drawingBox(block: HTMLElement) {
  const box = numberPair(block.dataset.box, MAX_DRAWING_SIZE);
  return box && box[0] > 0 && box[1] > 0 ? { width: box[0], height: box[1] } : { width: imageWidth(block), height: imageWidth(block) };
}

export function drawingOffset(block: HTMLElement) {
  const offset = numberPair(block.dataset.offset, MAX_OFFSET, true);
  return offset ? { x: offset[0], y: offset[1] } : null;
}

/* The box an anchored drawing's strokes are drawn in. A drawing in front of the text takes no */
/* room itself, so this box is what is measured, outlined and clicked. (An image block shows */
/* itself.) */
export function drawingInk(block: HTMLElement) {
  return block.querySelector<HTMLElement>('.drawing-ink') ?? block;
}

/* The two ways an anchored drawing can sit with the text, for the buttons that choose one. */
export const DRAWING_WRAPS: { value: DrawingWrap; label: string; icon: 'wrap-left' | 'text-front' }[] = [
  { value: 'wrap', label: 'Wrap text: the text moves aside to make room for the drawing', icon: 'wrap-left' },
  { value: 'front', label: 'In front of text: sits over the words and moves with them, without moving any text', icon: 'text-front' }
];

export function drawingStrokes(block: HTMLElement) {
  return decodeStrokes(block.dataset.drawing ?? '');
}

/* The drawing as an SVG picture. Ink strokes use the given colour (currentColor on the page, so */
/* they follow light and dark mode). Highlighter strokes go under pen strokes. */
export function drawingMarkup(strokes: DrawingStroke[], width: number, height: number, ink = 'currentColor') {
  const paths = inDrawingOrder(strokes, stroke => stroke).map(stroke => strokeMarkup(stroke, ink)).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" fill="none" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
}

/* An anchored drawing as an SVG file, with Ink in the colour it shows in now. */
export function drawingFile(block: HTMLElement) {
  const { width, height } = drawingBox(block);
  const ink = getComputedStyle(block).color || '#1c2c47';
  return new Blob([drawingMarkup(drawingStrokes(block), width, height, ink)], { type: 'image/svg+xml' });
}

function hydrateDrawing(block: HTMLElement) {
  const offset = drawingOffset(block);
  block.style.setProperty('--offset-x', `${offset?.x ?? 0}px`);
  block.style.setProperty('--offset-y', `${offset?.y ?? 0}px`);
  block.style.setProperty('--drawing-width', `${imageWidth(block)}px`);
  const key = `${block.dataset.box} ${block.dataset.drawing}`;
  if (drawn.get(block) === key && block.querySelector('svg')) return;
  drawn.set(block, key);

  /* The strokes were checked when read (decodeStrokes), so the markup holds only numbers and colours. */
  /* They sit in their own box (.drawing-ink), which is the drawing's visible size even when the */
  /* block takes no room in front of the text. */
  const { width, height } = drawingBox(block);
  block.innerHTML = `<span class="drawing-ink">${drawingMarkup(drawingStrokes(block), width, height)}<span class="image-resize" title="Drag to resize"></span></span>`;
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

/* The sanitizer's check for an image block's attributes. An anchored drawing's strokes are read */
/* and written again, so only valid strokes are kept. */
export function safeImageAttributes(node: Element) {
  const id = node.getAttribute('data-image') ?? '';
  const width = Number(node.getAttribute('data-width'));
  const align = node.getAttribute('data-align') ?? '';
  const isDrawing = node.classList.contains('drawing-block');
  const strokes = isDrawing ? decodeStrokes(node.getAttribute('data-drawing') ?? '') : [];
  const box = numberPair(node.getAttribute('data-box') ?? '', MAX_DRAWING_SIZE);
  const offset = numberPair(node.getAttribute('data-offset') ?? '', MAX_OFFSET, true);
  return {
    image: !isDrawing && IMAGE_ID.test(id) ? id : null,
    width: Number.isInteger(width) && width >= MIN_IMAGE_WIDTH && width <= MAX_IMAGE_WIDTH ? String(width) : null,
    align: IMAGE_ALIGNS.includes(align as ImageAlign) && align !== 'left' ? align : null,
    drawing: strokes.length ? encodeStrokes(strokes) : null,
    box: isDrawing && box && box[0] > 0 && box[1] > 0 ? box.join(' ') : null,
    offset: isDrawing && offset ? offset.join(' ') : null,
    wrap: isDrawing && node.getAttribute('data-wrap') === 'front' ? 'front' : null
  };
}
