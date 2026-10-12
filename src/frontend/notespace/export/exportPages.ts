import type { Note } from '../../../shared/types/note';
import { categoryName, childrenOf, getNote } from '../store';
import { pageAddress } from '../editor/links';
import type { DetailParts, ExportSettings } from './exportSettings';

export type { ExportSettings };


/* =========================
   Pages in an Export
   ========================= */

/* The page ids a note's text points to with page blocks, page links and mentions, in order. */
function pagesNamedIn(html: string) {
  return Array.from(html.matchAll(/data-page="([a-zA-Z0-9_-]+)"/g), match => match[1]);
}

/* The notes an export holds: the note, then (when asked) its sub-pages, in the order their */
/* cards appear in its text and then any others, each followed by its own sub-pages. */
export function exportedNotes(noteId: string, subpages: boolean) {
  const result: Note[] = [];
  const add = (note: Note | undefined) => {
    if (!note || result.some(item => item.id === note.id)) return;
    result.push(note);
    if (!subpages) return;
    const children = childrenOf(note.id);
    const named = pagesNamedIn(note.content).flatMap(id => children.filter(child => child.id === id));
    [...named, ...children].forEach(add);
  };
  add(getNote(noteId));
  return result;
}

/* The id a page's section has in an exported file, so links can jump to it. */
export function pageAnchor(id: string) {
  return `page-${id}`;
}

/* Where a link to a page leads in an export: its section when the page is in the same file, */
/* or its Starjot address. */
export function pageHref(id: string, included: Set<string>) {
  return included.has(id) ? `#${pageAnchor(id)}` : pageAddress(id);
}

/* The chosen details as label and text pairs, leaving out empty ones. The created date is */
/* written the same way as in the note. (Remarks and the sub-pages list are written by each format.) */
export function detailRows(note: Note, parts: DetailParts) {
  const rows: { label: string; text: string }[] = [];
  const category = categoryName(note.category);
  if (parts.category && category) rows.push({ label: 'Category', text: category });
  if (parts.description && note.subtitle.trim()) rows.push({ label: 'Description', text: note.subtitle.trim() });
  if (parts.created && note.createdAt) {
    rows.push({ label: 'Created', text: new Date(note.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) });
  }
  return rows;
}

/* Remarks with something in them (they are stored as HTML, so an empty one may still hold tags). */
export function hasRemarks(note: Note) {
  const holder = document.createElement('template');
  holder.innerHTML = note.remarks;
  return Boolean(holder.content.textContent?.trim());
}


/* =========================
   Files
   ========================= */

/* A file name from the note's title, without characters that file systems do not allow. */
export function exportFileName(title: string, extension: string) {
  const name = title.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Untitled note';
  return `${name}.${extension}`;
}

export function downloadFile(name: string, file: Blob) {
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* A picture as a data address, so it can be kept inside an exported file. */
export function dataUrl(file: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/* A detached copy of stored HTML to change for an export. Comments are left out: only their */
/* highlight is in the text, and an export has no place for their words. */
export function contentCopy(html: string) {
  const root = document.createElement('div');
  root.innerHTML = html;
  root.querySelectorAll('.comment-mark').forEach(mark => mark.replaceWith(...Array.from(mark.childNodes)));
  root.querySelectorAll('[data-comment]').forEach(element => element.removeAttribute('data-comment'));
  return root;
}
