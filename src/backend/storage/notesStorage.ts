import type { Category, Note, TrashEntry } from '../../shared/types/note';
import { keepDamagedCopy } from './damagedCopies';


/* =========================
   Notes Storage
   ========================= */

/* The backend's job is keeping data; the frontend only calls these functions. */
/* Today the data lives in the browser's localStorage. A Windows app or a server can later */
/* replace this file without changing any screens. */
const STORAGE_KEY = 'starjot-notespace-v1';

/* What is saved: every note, the ids of deleted sample notes so they are not re-added, the notes */
/* in Trash and the categories, all in one record, so a change is one write that either happens */
/* or not (never notes saved but categories not). `categories` is null in saves from before they */
/* moved here (see categoriesStorage.ts). */
export type StoredNotes = {
  notes: unknown[];
  deleted: string[];
  trash: unknown[];
  categories: unknown[] | null;
};

/* What reading found: nothing saved yet, the saved notes, or saved data that could not be read. */
/* Damaged data is copied aside first (see damagedCopies.ts); `canSave` is false when even */
/* that failed, and the original must then not be written over. */
export type NotesRead =
  | { status: 'empty' }
  | { status: 'ok'; saved: StoredNotes }
  | { status: 'damaged'; canSave: boolean };

/* Throws when storage cannot be read at all, so the frontend can warn that notes will not be kept. */
export function readNotes(): NotesRead {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return { status: 'empty' };
  let parsed: { notes?: unknown; deleted?: unknown; trash?: unknown; categories?: unknown } | null = null;
  try {
    parsed = JSON.parse(saved);
  } catch {
    parsed = null;
  }
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.notes)) {
    return { status: 'damaged', canSave: keepDamagedCopy(STORAGE_KEY, 'Notes', saved) };
  }
  return {
    status: 'ok',
    saved: {
      notes: parsed.notes,
      deleted: Array.isArray(parsed.deleted) ? parsed.deleted.map(String) : [],
      trash: Array.isArray(parsed.trash) ? parsed.trash : [],
      categories: Array.isArray(parsed.categories) ? parsed.categories : null
    }
  };
}

/* Throws when storage is full or unavailable. */
export function writeNotes(notes: Note[], deleted: string[], trash: TrashEntry[], categories: Category[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, notes, deleted, trash, categories }));
}

/* Call changed when another tab or window of Starjot saves notes (the browser tells every other */
/* tab of the same site). Returns a function that stops listening. */
export function onNotesSavedElsewhere(changed: () => void) {
  const listen = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) changed();
  };
  window.addEventListener('storage', listen);
  return () => window.removeEventListener('storage', listen);
}
