import type { DrawingLayerInfo, DrawingStroke, Note } from '../../../shared/types/note';
import { iconMarkup } from '../../components/Icon';
import { loadImage } from '../imageStore';
import { childrenOf } from '../store';
import { hydratePages } from '../editor/blocks';
import { INK, TEXT_LAYER, drawingBottom, strokeLayer, strokePath } from '../editor/drawing';
import { contentCopy, dataUrl, detailRows, downloadFile, exportFileName, hasRemarks, pageAnchor, pageHref, type ExportSettings } from './exportPages';

/* How the open note is laid out in the app, so loose drawings land on the same words: the width */
/* of its text column, and how far below the drawing's starting corner its text begins. */
export type ExportLayout = {
  columnWidth: number;
  textTop: number;
};

/* Paper sizes in CSS pixels, and the printed margin (one inch, as when printing a note). */
const PAPER = { a4: { width: 794, height: 1123 }, letter: { width: 816, height: 1056 } };
const PRINT_MARGIN = 96;

/* Styles for exported pages, on top of the app's own styles (which give the text its look). */
const EXPORT_STYLES = `
html, body { margin: 0; background: #ffffff; }
.export-root { display: block; min-height: 0; padding: 48px 24px; }
.export-root .editor-width { margin: 0 auto; max-width: none; }
.export-page { position: relative; }
.export-page > :not(.drawing-layer) { position: relative; z-index: 1; }
.export-page > .drawing-layer { position: absolute; left: 0; right: 0; top: var(--drawing-shift, 0px); z-index: 2; color: #1c2c47; pointer-events: none; }
.export-page > .drawing-layer.is-below { z-index: 0; }
.export-page > .drawing-layer svg { display: block; width: 100%; overflow: visible; }
.export-divider { margin: 64px 0 48px; border: 0; border-top: 1px solid #e0e8f4; }
.export-root .note-icon { display: block; margin-bottom: 8px; font-size: 40px; line-height: 1.2; }
.export-root .note-title-input { display: block; border: 0; }
.export-root .note-details dd { margin: 0; }
.export-root a.page-block, .export-root a.page-mention, .export-root a.note-page-link { color: inherit; text-decoration: none; }
.export-root .page-block-sizes, .export-root .page-block-resize, .export-root .page-block-meta, .export-root .image-resize { display: none !important; }
.export-root .toggle-block .toggle-body { display: block !important; }
.export-root .image-block, .export-root .page-block, .export-root .page-mention { cursor: default; }
.export-root .note-body pre { padding-top: 16px; background: #f6f8fd; }
@media print {
  .export-root { padding: 0; }
  .export-root .editor-meta { display: flex !important; }
  .export-divider { break-after: page; margin: 0; border: 0; }
}
`;


/* =========================
   Building Pages
   ========================= */

function escapeHtml(text: string) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* Turn an element into a link, keeping its children, classes and attributes. */
function asLink(element: Element, href: string) {
  const link = document.createElement('a');
  Array.from(element.attributes).forEach(attribute => link.setAttribute(attribute.name, attribute.value));
  link.removeAttribute('contenteditable');
  link.setAttribute('href', href);
  link.append(...Array.from(element.childNodes));
  element.replaceWith(link);
}

/* The note's text, ready for an exported page: page cards and mentions drawn and linked, toggles */
/* open, pictures kept inside the file (or left out for a text-only export). */
async function pageContent(note: Note, settings: ExportSettings, included: Set<string>) {
  const root = contentCopy(note.content);
  if (settings.content === 'text') root.querySelectorAll('.image-block').forEach(block => block.remove());
  hydratePages(root);

  root.querySelectorAll('.toggle-block').forEach(toggle => toggle.classList.add('is-open'));
  root.querySelectorAll('[contenteditable]').forEach(element => element.removeAttribute('contenteditable'));
  root.querySelectorAll('.image-resize').forEach(handle => handle.remove());
  root.querySelectorAll<HTMLElement>('.page-block, .page-mention').forEach(element => {
    if (element.classList.contains('is-missing')) element.replaceWith(...Array.from(element.childNodes));
    else asLink(element, pageHref(element.dataset.page ?? '', included));
  });
  root.querySelectorAll<HTMLAnchorElement>('a.page-link[data-page]').forEach(link => link.setAttribute('href', pageHref(link.dataset.page ?? '', included)));

  /* Pictures are loaded from the image store and kept inside the file. Each gets a new <img>, so */
  /* the app's own loading (started when the copy was drawn) cannot replace its picture. */
  await Promise.all(Array.from(root.querySelectorAll<HTMLElement>('.image-block[data-image]')).map(async block => {
    const file = await loadImage(block.dataset.image ?? '');
    if (!file) {
      block.remove();
      return;
    }
    const picture = document.createElement('img');
    picture.alt = '';
    picture.src = await dataUrl(file);
    block.replaceChildren(picture);
  }));
  return root.innerHTML;
}

/* The note's loose drawing for one side of the text, as SVG. Hidden layers are left out, and */
/* within a layer highlighter strokes go under pen strokes. */
function looseDrawing(strokes: DrawingStroke[], layers: DrawingLayerInfo[], below: boolean) {
  const text = layers.findIndex(layer => layer.id === TEXT_LAYER);
  const shown = (below ? layers.slice(0, text) : layers.slice(text + 1)).filter(layer => !layer.hidden);
  const paths = shown.flatMap(layer => {
    const own = strokes.filter(stroke => strokeLayer(stroke, layers) === layer.id);
    return [...own.filter(stroke => stroke.tool === 'highlighter'), ...own.filter(stroke => stroke.tool === 'pen')];
  }).map(stroke => {
    const color = stroke.color === INK ? 'currentColor' : stroke.color;
    const opacity = stroke.tool === 'highlighter' ? ' opacity="0.4"' : '';
    return `<path d="${strokePath(stroke.points)}" stroke="${color}" stroke-width="${stroke.size}"${opacity}/>`;
  });
  if (!paths.length) return '';
  const height = drawingBottom(strokes) + 24;
  return `<div class="drawing-layer${below ? ' is-below' : ''}" aria-hidden="true"><svg height="${height}" fill="none" stroke-linecap="round" stroke-linejoin="round">${paths.join('')}</svg></div>`;
}

/* The details under the title: category, description and created date (when set), remarks, and */
/* the sub-pages (linked to their sections when they are in the file). */
function detailsMarkup(note: Note, settings: ExportSettings, included: Set<string>) {
  const parts = settings.detailParts;
  const rows = detailRows(note, parts).map(row => `<dt>${row.label}</dt><dd>${escapeHtml(row.text)}</dd>`);
  if (parts.remarks && hasRemarks(note)) rows.push(`<dt class="note-remarks-label">Remarks</dt><dd class="note-remarks-cell"><div class="note-remarks">${contentCopy(note.remarks).innerHTML}</div></dd>`);
  const pages = parts.pages ? childrenOf(note.id) : [];
  if (pages.length) {
    const items = pages.map(page => {
      const icon = page.icon ? `<span class="note-page-icon" aria-hidden="true">${escapeHtml(page.icon)}</span>` : iconMarkup('file-text', 13);
      return `<li><a class="note-page-link" href="${escapeHtml(pageHref(page.id, included))}">${icon}<span class="note-page-title">${escapeHtml(page.title || 'Untitled note')}</span></a></li>`;
    });
    rows.push(`<dt class="note-pages-label">Pages</dt><dd class="note-pages"><ul class="note-page-list">${items.join('')}</ul></dd>`);
  }
  return rows.length ? `<dl class="note-details">${rows.join('')}</dl>` : '';
}

/* One exported page: the document label, icon, title, details (when asked), then the text, with */
/* its loose drawing over (and under) it. */
async function pageMarkup(note: Note, settings: ExportSettings, included: Set<string>) {
  const icon = note.icon ? `<div class="note-icon">${escapeHtml(note.icon)}</div>` : '';
  const drawing = settings.content === 'everything' ? looseDrawing(note.drawing, note.drawingLayers, true) + looseDrawing(note.drawing, note.drawingLayers, false) : '';
  return `<article class="export-page" id="${pageAnchor(note.id)}">`
    + `<div class="editor-meta"><span class="page-type">${iconMarkup('file-text', 14)} DOCUMENT</span></div>`
    + `<div class="note-header">${icon}<h1 class="note-title-input">${escapeHtml(note.title || 'Untitled note')}</h1>${settings.details ? detailsMarkup(note, settings, included) : ''}</div>`
    + '<div class="article-rule"></div>'
    + `<div class="note-content"><div class="note-body article-body continuous-document note-editable">${await pageContent(note, settings, included)}</div></div>`
    + drawing
    + '</article>';
}

/* The app's own styles, so exported text looks as it does in the note. */
function appStyles() {
  return Array.from(document.styleSheets).map(sheet => {
    try {
      return Array.from(sheet.cssRules).map(rule => rule.cssText).join('\n');
    } catch {
      return '';
    }
  }).join('\n');
}

/* The paper and orientation a PDF uses, and how much the column is scaled to fit it. */
function printSetup(note: Note, settings: ExportSettings, columnWidth: number) {
  const fromNote = settings.pageFormat === 'note';
  const size = fromNote ? (note.pageSize === 'letter' ? 'letter' : 'a4') : settings.pageFormat.startsWith('letter') ? 'letter' : 'a4';
  const landscape = fromNote ? note.landscape : settings.pageFormat.endsWith('landscape');
  const paper = PAPER[size];
  const printable = (landscape ? paper.height : paper.width) - PRINT_MARGIN * 2;
  const zoom = Math.min(1, printable / columnWidth) * (settings.scale / 100);
  return { page: `${size === 'a4' ? 'A4' : 'letter'} ${landscape ? 'landscape' : 'portrait'}`, zoom };
}

/* The whole exported file. */
async function buildDocument(notes: Note[], settings: ExportSettings, layout: ExportLayout) {
  const included = new Set(notes.map(note => note.id));
  const pages = await Promise.all(notes.map(note => pageMarkup(note, settings, included)));
  const main = notes[0];
  const print = printSetup(main, settings, layout.columnWidth);
  const printStyles = `@page { size: ${print.page}; margin: ${PRINT_MARGIN}px; } @media print { .export-root { zoom: ${print.zoom}; } }`;
  return '<!doctype html><html lang="en" data-theme="light"><head><meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width, initial-scale=1">'
    + `<title>${escapeHtml(main.title || 'Untitled note')}</title>`
    + `<style>${appStyles()}</style><style>${EXPORT_STYLES}${printStyles}</style></head>`
    + `<body><div class="editor-wrap export-root"><div class="editor-width" style="width: ${Math.round(layout.columnWidth)}px">`
    + pages.join('<hr class="export-divider">')
    + '</div></div></body></html>';
}


/* =========================
   Exporting
   ========================= */

/* Lay the file out in a hidden frame, so loose drawings can be lined up with the text: the */
/* exported title and details are not exactly as tall as the app's, so the drawing is moved by */
/* the difference, measured on the first page. */
async function laidOut(notes: Note[], settings: ExportSettings, layout: ExportLayout) {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.tabIndex = -1;
  frame.style.cssText = `position: fixed; right: 0; bottom: 0; width: ${Math.ceil(layout.columnWidth) + 120}px; height: 800px; border: 0; opacity: 0; pointer-events: none;`;
  const html = await buildDocument(notes, settings, layout);
  await new Promise<void>(resolve => {
    frame.onload = () => resolve();
    frame.srcdoc = html;
    document.body.appendChild(frame);
  });
  const doc = frame.contentDocument as Document;
  await Promise.all(Array.from(doc.images).map(picture => picture.decode().catch(() => undefined)));

  const page = doc.querySelector('.export-page');
  const text = page?.querySelector('.note-content');
  if (page && text) {
    const textTop = text.getBoundingClientRect().top - page.getBoundingClientRect().top;
    doc.querySelector<HTMLElement>('.export-root')?.style.setProperty('--drawing-shift', `${Math.round(textTop - layout.textTop)}px`);
  }
  return frame;
}

/* Save the note as one HTML file, with its pictures and drawings inside it. */
export async function exportHtml(notes: Note[], settings: ExportSettings, layout: ExportLayout) {
  const frame = await laidOut(notes, settings, layout);
  const html = `<!doctype html>\n${frame.contentDocument?.documentElement.outerHTML ?? ''}`;
  frame.remove();
  downloadFile(exportFileName(notes[0].title, 'html'), new Blob([html], { type: 'text/html' }));
}

/* Open the browser's print window for the note, where it can be saved as a PDF. The page size, */
/* orientation and scale come from the export settings. */
export async function exportPdf(notes: Note[], settings: ExportSettings, layout: ExportLayout) {
  const frame = await laidOut(notes, settings, layout);
  const view = frame.contentWindow;
  if (!view) {
    frame.remove();
    return;
  }
  /* The frame is removed once printing ends, or after a minute in browsers that never say so. */
  view.addEventListener('afterprint', () => window.setTimeout(() => frame.remove(), 500));
  window.setTimeout(() => frame.remove(), 60000);
  view.focus();
  view.print();
}
