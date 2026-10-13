import { categoryNamed, createNote, getNote, UNTITLED_NOTE, updateNote } from '../store';
import { readHtml } from './importHtml';
import { readMarkdown } from './importMarkdown';
import { readPdf } from './pdf/importPdf';
import { readCsv, readText } from './importText';
import { fileTitle, ImportError, type IdOf, type ImportedNote } from './imported';


/* =========================
   Size Limits
   ========================= */

/* Files bigger than this would make the browser struggle (and notes this big are not useful). */
const MAX_FILE_BYTES = 30 * 1024 * 1024;

/* A note's text is cut off at this length when it is saved, so longer imports are shortened */
/* first at a whole line, with a line saying so. */
const MAX_CONTENT = 240000;

/* Shorten note HTML that is too long, dropping whole lines from the end. */
export function fitContent(html: string) {
  if (html.length <= MAX_CONTENT) return html;
  const holder = document.createElement('template');
  holder.innerHTML = html;
  let length = html.length;
  while (length > MAX_CONTENT - 200 && holder.content.lastChild) {
    const last = holder.content.lastChild;
    length -= last instanceof Element ? last.outerHTML.length : (last.textContent ?? '').length;
    last.remove();
  }
  return `${holder.innerHTML}<p><em>The rest of the file was too long for one note, so it was left out.</em></p>`;
}


/* =========================
   Reading Files
   ========================= */

/* What each kind of file is read with, by its extension. */
const READERS: Record<string, (file: File) => Promise<ImportedNote[]>> = {
  md: async file => readMarkdown(await file.text(), fileTitle(file.name)),
  markdown: async file => readMarkdown(await file.text(), fileTitle(file.name)),
  html: async file => readHtml(await file.text(), fileTitle(file.name)),
  htm: async file => readHtml(await file.text(), fileTitle(file.name)),
  txt: async file => readText(await file.text(), fileTitle(file.name)),
  csv: async file => readCsv(await file.text(), fileTitle(file.name)),
  pdf: async file => readPdf(new Uint8Array(await file.arrayBuffer()), fileTitle(file.name))
};

/* The file types the Import button offers. */
export const IMPORT_ACCEPT = Object.keys(READERS).map(extension => `.${extension}`).join(',');

/* Make new notes from what a file holds: the first is the main note and the others become its */
/* sub-notes. Nothing already in Starjot is changed. Returns the main note's id. */
async function createNotes(imported: ImportedNote[]) {
  const [main, ...others] = imported;
  const mainNote = createNote(categoryNamed(main.category ?? ''));
  const ids = new Map([[main.key, mainNote.id]]);
  others.forEach(note => ids.set(note.key, createNote(categoryNamed(note.category ?? '') || mainNote.category, mainNote.id).id));

  /* A link to a note the file does not hold still works when that note is in this browser. */
  const idOf: IdOf = key => ids.get(key) ?? (getNote(key) ? key : undefined);
  for (const note of imported) {
    updateNote(ids.get(note.key) as string, {
      title: note.title.slice(0, 160) || UNTITLED_NOTE,
      icon: note.icon ?? '',
      subtitle: note.description ?? '',
      remarks: note.remarks ?? '',
      content: fitContent(await note.content(idOf))
    });
  }
  return mainNote.id;
}

/* Import one file as new notes, returning the main note's id. */
export async function importFile(file: File) {
  const reader = READERS[file.name.split('.').pop()?.toLowerCase() ?? ''];
  if (!reader) throw new ImportError('Starjot can import Markdown, HTML, PDF, CSV and plain text files.');
  if (file.size > MAX_FILE_BYTES) throw new ImportError('This file is too big to import (over 30 MB).');
  const notes = await reader(file);
  if (!notes.length) throw new ImportError('Nothing was found in this file to import.');
  return createNotes(notes);
}

export type ImportResult = {
  /* The main note of each file imported, in the order the files were given. */
  created: string[];
  failed: { name: string; reason: string }[];
};

/* Import several files, each as its own new note. A file that cannot be read is reported and the */
/* others are still imported. */
export async function importFiles(files: File[]): Promise<ImportResult> {
  const result: ImportResult = { created: [], failed: [] };
  for (const file of files) {
    try {
      result.created.push(await importFile(file));
    } catch (error) {
      const reason = error instanceof ImportError ? error.message : 'The file could not be read.';
      result.failed.push({ name: file.name, reason });
    }
  }
  return result;
}
