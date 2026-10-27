import type { DrawingLayerInfo, DrawingStroke, Note } from '../../../shared/types/note';
import { iconMarkup } from '../../components/Icon';
import { loadImage } from '../imageStore';
import { childrenOf, noteTitle } from '../store';
import { hydratePages } from '../editor/text/pageBlocks';
import { tabPanels, tabTitle } from '../editor/text/tabs';
import { reminderText } from '../reminders';
import { drawingBottom, inDrawingOrder, strokeLayer, strokeMarkup, visibleLayers } from '../editor/drawing/drawing';
import { contentCopy, detailRows, exportFileName, hasRemarks, pageAnchor, pageHref, type ExportSettings } from './exportNotes';
import { escapeHtml } from '../../lib/html';
import { dataUrl, downloadFile } from '../../lib/files';
import { BASE_SCALE, SMALL_TEXT_SCALE } from '../editor/noteScale';

/* How the open note is laid out in the app, so loose drawings land on the same words: the width */
/* of its text column, and how far below the drawing's starting corner its text begins. */
export type ExportLayout = {
  columnWidth: number;
  textTop: number;
};

/* Paper sizes in CSS pixels, and the printed margin (one inch, as when printing a note). */
const PAPER = { a4: { width: 794, height: 1123 }, letter: { width: 816, height: 1056 } };
const PRINT_MARGIN = 96;

/* A table wider than the printed column is shrunk on its own down to this much, so its text */
/* stays readable; past that, its columns share the width and their text wraps. */
const TABLE_MIN_ZOOM = 0.75;

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
.export-root .tab-strip-remove, .export-root .tab-strip-add { display: none !important; }
.export-root .tab-export-title { margin: 0 0 8px; font-weight: 700; }
.export-root .tab-panel + .tab-panel { border-top: 1px solid #e2e8f1; }
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

  /* A tab block shows its strip and the tab shown, or, with All tabs, every tab under its name. */
  if (settings.allTabs) {
    root.querySelectorAll('.tab-block').forEach(block => {
      block.querySelector(':scope > .tab-strip')?.remove();
      tabPanels(block).forEach((panel, index) => {
        const title = document.createElement('p');
        title.className = 'tab-export-title';
        title.textContent = tabTitle(panel, index);
        panel.classList.add('is-active');
        panel.prepend(title);
      });
    });
  }
  /* A reminder is written with its full date, since "Tomorrow" would not stay true in a file. */
  root.querySelectorAll<HTMLElement>('.reminder-chip').forEach(chip => {
    chip.textContent = reminderText(chip);
    chip.classList.remove('is-due');
  });
  root.querySelectorAll('[contenteditable]').forEach(element => element.removeAttribute('contenteditable'));
  root.querySelectorAll('.image-resize').forEach(handle => handle.remove());
  root.querySelectorAll<HTMLElement>('.page-block, .page-mention').forEach(element => {
    if (element.classList.contains('is-missing')) element.replaceWith(...Array.from(element.childNodes));
    else asLink(element, pageHref(element.dataset.page ?? '', included));
  });
  root.querySelectorAll<HTMLAnchorElement>('a.page-link[data-page]').forEach(link => link.setAttribute('href', pageHref(link.dataset.page ?? '', included, link.dataset.linkId)));

  /* Linked blocks can be jumped to inside the file (and in a PDF), by their link id. */
  root.querySelectorAll<HTMLElement>('[data-link-id]:not(a)').forEach(block => {
    block.id = block.dataset.linkId ?? '';
  });

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
  const paths = visibleLayers(layers, below).flatMap(layer => {
    const own = strokes.filter(stroke => strokeLayer(stroke, layers) === layer.id);
    return inDrawingOrder(own, stroke => stroke).map(stroke => strokeMarkup(stroke));
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
      return `<li><a class="note-page-link" href="${escapeHtml(pageHref(page.id, included))}">${icon}<span class="note-page-title">${escapeHtml(noteTitle(page))}</span></a></li>`;
    });
    rows.push(`<dt class="note-pages-label">Sub-notes</dt><dd class="note-pages"><ul class="note-page-list">${items.join('')}</ul></dd>`);
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
    + `<div class="note-header">${icon}<h1 class="note-title-input">${escapeHtml(noteTitle(note))}</h1>${settings.details ? detailsMarkup(note, settings, included) : ''}</div>`
    + '<div class="article-rule"></div>'
    + `<div class="note-content"><div class="note-body article-body continuous-document note-editable">${await pageContent(note, settings, included)}</div></div>`
    + drawing
    + '</article>';
}

/* The emoji font (see styles.css) and whether some text holds an emoji it draws. */
const EMOJI_FONT = /url\((["']?)[^"')]*Twemoji\.Mozilla\.ttf\1\)/g;
const HAS_EMOJI = /\p{Extended_Pictographic}|[\u{1F1E6}-\u{1F1FF}]/u;

/* A file saved on its own (an HTML export, a canvas picture) cannot reach the app's emoji font, */
/* so one that shows emoji carries the font inside it (about 2 MB), and its emoji look as in the */
/* app. Without emoji, or if the font cannot be read, the file is left as it is (emoji then use */
/* the system's). The font is read from the app's own folder (BASE_URL), wherever it runs from. */
export async function withEmojiFont(file: string) {
  if (!HAS_EMOJI.test(file.replace(/<style[\s\S]*?<\/style>/g, ''))) return file;
  try {
    const font = await dataUrl(await (await fetch(`${import.meta.env.BASE_URL}fonts/Twemoji.Mozilla.ttf`)).blob());
    return file.replace(EMOJI_FONT, `url("${font}")`);
  } catch {
    return file;
  }
}

/* The app's own styles, so exported text looks as it does in the note. */
export function appStyles() {
  return Array.from(document.styleSheets).map(sheet => {
    try {
      return Array.from(sheet.cssRules).map(rule => rule.cssText).join('\n');
    } catch {
      return '';
    }
  }).join('\n');
}

/* The paper and orientation a PDF uses, and the width of its printed column. */
function paperFor(note: Note, settings: ExportSettings) {
  const fromNote = settings.pageFormat === 'note';
  const size = fromNote ? (note.pageSize === 'letter' ? 'letter' : 'a4') : settings.pageFormat.startsWith('letter') ? 'letter' : 'a4';
  const landscape = fromNote ? note.landscape : settings.pageFormat.endsWith('landscape');
  const paper = PAPER[size];
  return { page: `${size === 'a4' ? 'A4' : 'letter'} ${landscape ? 'landscape' : 'portrait'}`, printable: (landscape ? paper.height : paper.width) - PRINT_MARGIN * 2 };
}

/* The size note text prints at: as at 100% in the app (Small text included), so a PDF reads like */
/* the note does. */
function textScale(note: Note) {
  return BASE_SCALE * (note.smallText ? SMALL_TEXT_SCALE : 1);
}

/* How much the printed page is scaled: the note's text size and the Scale chosen in Export, or, */
/* when the column is too wide for the paper at that size (a note laid out as on screen, see */
/* printLayout), enough to fit it. */
function printSetup(note: Note, settings: ExportSettings, columnWidth: number) {
  const { page, printable } = paperFor(note, settings);
  return { page, zoom: Math.min(textScale(note), printable / columnWidth) * (settings.scale / 100) };
}

/* Whether a note's loose drawing goes into the file: it is placed by where it was drawn on the */
/* screen, so its text must keep the on-screen width for the drawing to land on the same words. */
function keepsScreenWidth(notes: Note[], settings: ExportSettings) {
  return settings.content === 'everything' && notes.some(note => note.drawing.length > 0);
}

/* The layout a PDF is built in. Normally the text is laid out to fill the printed column at its */
/* normal size, so it wraps to the paper (rather than the whole screen-wide column being shrunk */
/* to fit, which made the text small). A note with a loose drawing keeps the screen layout, so */
/* the drawing still lines up. */
function printLayout(notes: Note[], settings: ExportSettings, layout: ExportLayout): ExportLayout {
  if (keepsScreenWidth(notes, settings)) return layout;
  return { ...layout, columnWidth: Math.floor(paperFor(notes[0], settings).printable / textScale(notes[0])) };
}

/* A table wider than the printed column is shrunk on its own (never the whole page), down to */
/* TABLE_MIN_ZOOM; one still too wide shares the column's width between its columns, so its */
/* words wrap instead of being cut off at the page edge. */
function fitWideTables(doc: Document, columnWidth: number) {
  doc.querySelectorAll<HTMLTableElement>('.note-body table').forEach(table => {
    const width = table.scrollWidth;
    if (width <= columnWidth + 1) return;
    const zoom = columnWidth / width;
    if (zoom >= TABLE_MIN_ZOOM) {
      table.style.zoom = String(Math.floor(zoom * 100) / 100);
      return;
    }
    table.style.zoom = String(TABLE_MIN_ZOOM);
    table.style.width = `${Math.floor(columnWidth / TABLE_MIN_ZOOM)}px`;
    table.style.tableLayout = 'fixed';
    table.querySelectorAll<HTMLTableColElement>('col').forEach(col => { col.style.width = ''; });
    table.querySelectorAll<HTMLElement>('td, th').forEach(cell => { cell.style.overflowWrap = 'anywhere'; });
  });
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
    + `<title>${escapeHtml(noteTitle(main))}</title>`
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
/* the difference, measured on the first page. For a PDF (printing), tables too wide for the */
/* printed column are fitted to it. */
async function laidOut(notes: Note[], settings: ExportSettings, layout: ExportLayout, printing = false) {
  const frame = await openFrame(await buildDocument(notes, settings, layout), layout.columnWidth + 120);
  const doc = frame.contentDocument as Document;
  if (printing && !keepsScreenWidth(notes, settings)) fitWideTables(doc, layout.columnWidth);

  const page = doc.querySelector('.export-page');
  const text = page?.querySelector('.note-content');
  if (page && text) {
    const textTop = text.getBoundingClientRect().top - page.getBoundingClientRect().top;
    doc.querySelector<HTMLElement>('.export-root')?.style.setProperty('--drawing-shift', `${Math.round(textTop - layout.textTop)}px`);
  }
  return frame;
}

/* An exported page, loaded into a hidden frame of the given width with its pictures ready. */
export async function openFrame(html: string, width: number) {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.tabIndex = -1;
  frame.style.cssText = `position: fixed; right: 0; bottom: 0; width: ${Math.ceil(width)}px; height: 800px; border: 0; opacity: 0; pointer-events: none;`;
  await new Promise<void>(resolve => {
    frame.onload = () => resolve();
    frame.srcdoc = html;
    document.body.appendChild(frame);
  });
  const doc = frame.contentDocument as Document;
  await Promise.all(Array.from(doc.images).map(picture => picture.decode().catch(() => undefined)));

  /* The emoji font loads once emoji are laid out; printing waits for it, so a PDF shows them. */
  await doc.fonts?.ready;
  return frame;
}

/* Open the browser's print window for a frame's page, where it can be saved as a PDF. The frame */
/* is removed once printing ends, or after a minute in browsers that never say so. */
export function printFrame(frame: HTMLIFrameElement) {
  const view = frame.contentWindow;
  if (!view) {
    frame.remove();
    return;
  }
  view.addEventListener('afterprint', () => window.setTimeout(() => frame.remove(), 500));
  window.setTimeout(() => frame.remove(), 60000);
  view.focus();
  view.print();
}

/* Save the note as one HTML file, with its pictures and drawings inside it. */
export async function exportHtml(notes: Note[], settings: ExportSettings, layout: ExportLayout) {
  const frame = await laidOut(notes, settings, layout);
  const html = await withEmojiFont(`<!doctype html>\n${frame.contentDocument?.documentElement.outerHTML ?? ''}`);
  frame.remove();
  downloadFile(exportFileName(notes[0].title, 'html'), new Blob([html], { type: 'text/html' }));
}

/* Open the browser's print window for the note, where it can be saved as a PDF. The page size, */
/* orientation and scale come from the export settings; the text is laid out for the paper (see */
/* printLayout). */
export async function exportPdf(notes: Note[], settings: ExportSettings, layout: ExportLayout) {
  printFrame(await laidOut(notes, settings, printLayout(notes, settings, layout), true));
}
