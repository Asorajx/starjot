import type { Note } from '../../../shared/types/note';
import { noteTitle } from '../store';
import { inDrawingOrder, joinBoxes, strokeLayer, strokeMarkup, strokesBounds, visibleLayers, type Box } from '../editor/drawing/drawing';
import { appStyles, openFrame, printFrame, withEmojiFont } from '../export/exportHtml';
import { escapeMarkdown, markdownOf } from '../export/exportMarkdown';
import { textOf } from '../export/exportText';
import { contentCopy, exportFileName } from '../export/exportNotes';
import { dataUrl, downloadFile } from '../../lib/files';
import { escapeHtml } from '../../lib/html';
import type { CanvasBox } from './boxes';


/* =========================
   Canvas Export
   ========================= */

export type CanvasExportFormat = 'png' | 'pdf' | 'markdown' | 'text';

export const CANVAS_EXPORT_FORMATS: { value: CanvasExportFormat; label: string }[] = [
  { value: 'png', label: 'Picture (PNG)' },
  { value: 'pdf', label: 'PDF' },
  { value: 'markdown', label: 'Markdown (text only)' },
  { value: 'text', label: 'Plain text (text only)' }
];

/* A text box as it is laid out on the canvas: its place and size, and its words as shown (with */
/* note cards and links already drawn). */
export type PlacedBox = Box & { html: string };

/* The space left around everything on the canvas, in pixels. */
const MARGIN = 32;

/* Ink strokes are drawn in the app's text colour on light paper. */
const INK_COLOR = '#1c2c47';

/* A picture is made at twice its size, so it stays sharp, within what browsers can draw. */
const PICTURE_SCALE = 2;
const MAX_SIDE = 16000;
const MAX_PIXELS = 50000000;

/* A4 in CSS pixels, and the printed margin. */
const PAPER = { width: 794, height: 1123 };
const PRINT_MARGIN = 48;

/* Styles for an exported canvas, on top of the app's own (which give the text its look). */
const CANVAS_STYLES = `
html, body { margin: 0; background: #ffffff; }
.canvas-export { position: relative; overflow: hidden; background: #ffffff; color: ${INK_COLOR}; font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; }
.canvas-export > svg { position: absolute; top: 0; left: 0; overflow: visible; }
.canvas-export > svg.is-above { z-index: 2; }
.canvas-export .canvas-box { position: absolute; z-index: 1; box-sizing: border-box; padding: 4px 8px; border: 1px solid transparent; }
.canvas-export .note-body { zoom: 1.2; min-height: 0; margin: 0; padding: 0; max-width: none; }
.canvas-export .note-body > :first-child { margin-top: 0; }
.canvas-export .note-body > :last-child { margin-bottom: 0; }
.canvas-export .page-block-sizes, .canvas-export .page-block-resize, .canvas-export .page-block-meta, .canvas-export .image-resize, .canvas-export .tab-strip-remove, .canvas-export .tab-strip-add { display: none !important; }
`;

/* The area holding every visible stroke and every text box, or null for an empty canvas. */
export function canvasBounds(note: Note, boxes: Box[]): Box | null {
  const hidden = new Set(note.drawingLayers.filter(layer => layer.hidden).map(layer => layer.id));
  let bounds = strokesBounds(note.drawing.filter(stroke => !hidden.has(strokeLayer(stroke, note.drawingLayers))));
  boxes.forEach(box => {
    bounds = bounds ? joinBoxes(box, bounds) : box;
  });
  return bounds;
}

/* The strokes of the layers under the text boxes (below) or over them, as SVG. */
function strokesSvg(note: Note, area: Box, below: boolean) {
  const paths = visibleLayers(note.drawingLayers, below)
    .flatMap(layer => inDrawingOrder(note.drawing.filter(stroke => strokeLayer(stroke, note.drawingLayers) === layer.id), stroke => stroke))
    .map(stroke => strokeMarkup(stroke, INK_COLOR))
    .join('');
  return `<svg class="${below ? 'is-below' : 'is-above'}" xmlns="http://www.w3.org/2000/svg" width="${area.width}" height="${area.height}" viewBox="${area.x} ${area.y} ${area.width} ${area.height}" fill="none" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
}

/* The whole canvas as one block of HTML, cropped to what is on it (with a margin), or null when */
/* there is nothing on it. */
export function canvasScene(note: Note, boxes: PlacedBox[]) {
  const bounds = canvasBounds(note, boxes);
  if (!bounds) return null;
  const area = { x: Math.floor(bounds.x - MARGIN), y: Math.floor(bounds.y - MARGIN), width: Math.ceil(bounds.width + MARGIN * 2), height: Math.ceil(bounds.height + MARGIN * 2) };
  const boxMarkup = boxes.map(box => (
    `<div class="canvas-box" style="left: ${box.x - area.x}px; top: ${box.y - area.y}px; width: ${box.width}px">`
    + `<div class="note-body article-body continuous-document">${box.html}</div></div>`
  )).join('');
  const html = `<div class="canvas-export" style="width: ${area.width}px; height: ${area.height}px">`
    + `${strokesSvg(note, area, true)}${boxMarkup}${strokesSvg(note, area, false)}</div>`;
  return { html, width: area.width, height: area.height };
}

/* Pictures in text boxes are kept in the browser, where a drawn picture cannot reach them, so */
/* they are put inside the page instead. */
async function inlinePictures(root: Element) {
  await Promise.all(Array.from(root.querySelectorAll('img')).map(async picture => {
    const source = picture.getAttribute('src') ?? '';
    if (!source.startsWith('blob:')) return;
    try {
      picture.setAttribute('src', await dataUrl(await (await fetch(source)).blob()));
    } catch {
      picture.remove();
    }
  }));
}

/* Save the canvas as a PNG picture: the page is put inside an SVG picture (foreignObject), */
/* which the browser draws onto a canvas element at twice the size. */
export async function exportCanvasPng(note: Note, boxes: PlacedBox[]) {
  const scene = canvasScene(note, boxes);
  if (!scene) return;
  const holder = document.createElement('div');
  const style = document.createElement('style');
  style.textContent = `${appStyles()}\n${CANVAS_STYLES}`;
  holder.append(style);
  holder.insertAdjacentHTML('beforeend', scene.html);
  await inlinePictures(holder);
  const page = await withEmojiFont(new XMLSerializer().serializeToString(holder));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${scene.width}" height="${scene.height}"><foreignObject x="0" y="0" width="100%" height="100%">${page}</foreignObject></svg>`;

  const picture = new Image();
  picture.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await picture.decode();
  const scale = Math.min(PICTURE_SCALE, MAX_SIDE / scene.width, MAX_SIDE / scene.height, Math.sqrt(MAX_PIXELS / (scene.width * scene.height)));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(scene.width * scale);
  canvas.height = Math.round(scene.height * scale);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('No canvas to draw the picture on.');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.scale(scale, scale);
  context.drawImage(picture, 0, 0);
  const file = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
  if (!file) throw new Error('The picture could not be made.');
  downloadFile(exportFileName(note.title, 'png'), file);
}

/* Open the print window for the canvas, on one page (portrait or landscape, whichever fits */
/* better), scaled down to fit when it is bigger than the paper. */
export async function exportCanvasPdf(note: Note, boxes: PlacedBox[]) {
  const scene = canvasScene(note, boxes);
  if (!scene) return;
  const landscape = scene.width > scene.height;
  const room = { width: (landscape ? PAPER.height : PAPER.width) - PRINT_MARGIN * 2, height: (landscape ? PAPER.width : PAPER.height) - PRINT_MARGIN * 2 };
  const zoom = Math.min(1, room.width / scene.width, room.height / scene.height);
  const printStyles = `@page { size: A4 ${landscape ? 'landscape' : 'portrait'}; margin: ${PRINT_MARGIN}px; } @media print { .canvas-export { zoom: ${zoom}; } }`;
  const html = '<!doctype html><html lang="en" data-theme="light"><head><meta charset="utf-8">'
    + `<title>${escapeHtml(noteTitle(note))}</title>`
    + `<style>${appStyles()}</style><style>${CANVAS_STYLES}${printStyles}</style></head>`
    + `<body>${scene.html}</body></html>`;
  const frame = await openFrame(html, scene.width + 48);
  const doc = frame.contentDocument;
  if (doc) await inlinePictures(doc.body);
  printFrame(frame);
}

/* The text boxes in reading order: top to bottom, and left to right for boxes level with each */
/* other. */
export function readingOrder(boxes: CanvasBox[]) {
  return [...boxes].sort((a, b) => a.y - b.y || a.x - b.x);
}

/* The canvas's words as Markdown: its title, then each text box's lines. */
export function canvasMarkdown(note: Note, boxes: CanvasBox[]) {
  const parts = readingOrder(boxes).map(box => markdownOf(contentCopy(box.html)).trim()).filter(Boolean);
  return `${[`# ${escapeMarkdown(noteTitle(note))}`, ...parts].join('\n\n')}\n`;
}

/* The canvas's words as plain text: its title (underlined), then each text box's lines. */
export function canvasText(note: Note, boxes: CanvasBox[]) {
  const title = noteTitle(note);
  const parts = readingOrder(boxes).map(box => textOf(contentCopy(box.html)).trim()).filter(Boolean);
  return `${[`${title}\n${'='.repeat(Math.min(40, title.length))}`, ...parts].join('\n\n')}\n`;
}

export function exportCanvasMarkdown(note: Note, boxes: CanvasBox[]) {
  downloadFile(exportFileName(note.title, 'md'), new Blob([canvasMarkdown(note, boxes)], { type: 'text/markdown' }));
}

export function exportCanvasText(note: Note, boxes: CanvasBox[]) {
  downloadFile(exportFileName(note.title, 'txt'), new Blob([canvasText(note, boxes)], { type: 'text/plain' }));
}
