/* =========================
   Canvas Text Boxes
   ========================= */

/* A canvas keeps its text boxes in the note's content, one after another: */
/* <div class="canvas-box" data-box="b…" data-x data-y data-width>…lines…</div>. Their place is */
/* measured from the canvas's starting corner, like strokes, so search, previews and links reach */
/* the words while the canvas draws each box where it belongs. */
export type CanvasBox = { id: string; x: number; y: number; width: number; html: string };

export const BOX_WIDTH = 320;
export const MIN_BOX_WIDTH = 80;
export const MAX_BOX_WIDTH = 2000;

/* How far from the starting corner a box may be, so a broken value cannot lose it. */
const REACH = 1000000;

export const BOX_ID = /^b[a-z0-9]{1,30}$/;

export function newBoxId() {
  return `b${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/* A box's place, rounded to a tenth of a pixel and kept within reach (0 for anything broken). */
export function boxCoordinate(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(Math.max(-REACH, Math.min(REACH, number)) * 10) / 10 : 0;
}

export function boxWidth(value: unknown) {
  const number = Math.round(Number(value));
  return Number.isFinite(number) && number > 0 ? Math.max(MIN_BOX_WIDTH, Math.min(MAX_BOX_WIDTH, number)) : BOX_WIDTH;
}

function holderOf(content: string) {
  const template = document.createElement('template');
  template.innerHTML = content;
  return template;
}

function boxElements(template: HTMLTemplateElement) {
  return Array.from(template.content.children).filter((child): child is HTMLElement => child.matches('div.canvas-box') && BOX_ID.test(child.getAttribute('data-box') ?? ''));
}

/* The boxes in a canvas's content, in the order they are stored (later ones are drawn on top). */
export function readBoxes(content: string): CanvasBox[] {
  return boxElements(holderOf(content)).map(element => ({
    id: element.getAttribute('data-box') ?? '',
    x: boxCoordinate(element.getAttribute('data-x')),
    y: boxCoordinate(element.getAttribute('data-y')),
    width: boxWidth(element.getAttribute('data-width')),
    html: element.innerHTML
  }));
}

/* The content with one box changed (its place and size, and its lines when given), or added at */
/* the end (on top) when it is not there yet. */
export function writeBox(content: string, box: Omit<CanvasBox, 'html'>, html?: string) {
  const template = holderOf(content);
  let element = boxElements(template).find(item => item.getAttribute('data-box') === box.id);
  if (!element) {
    element = document.createElement('div');
    element.className = 'canvas-box';
    element.setAttribute('data-box', box.id);
    element.innerHTML = '<p><br></p>';
    template.content.appendChild(element);
  }
  element.setAttribute('data-x', String(boxCoordinate(box.x)));
  element.setAttribute('data-y', String(boxCoordinate(box.y)));
  element.setAttribute('data-width', String(boxWidth(box.width)));
  if (html !== undefined) element.innerHTML = html;
  return template.innerHTML;
}

export function removeBox(content: string, id: string) {
  const template = holderOf(content);
  boxElements(template).filter(item => item.getAttribute('data-box') === id).forEach(item => item.remove());
  return template.innerHTML;
}

/* A box with no words and nothing else in it (no note link, picture, table, line or reminder) is */
/* removed when you stop writing in it. */
export function isEmptyBox(html: string) {
  const holder = document.createElement('div');
  holder.innerHTML = html;
  return !holder.textContent?.trim() && !holder.querySelector('.page-block, .page-mention, .image-block, .reminder-chip, table, hr');
}
