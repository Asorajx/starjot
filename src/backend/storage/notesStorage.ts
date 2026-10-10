import type { Note } from '../../shared/types/note';


/* =========================
   Notes Storage
   ========================= */

/* The backend's job is keeping data; the frontend only calls these functions. */
/* Today the data lives in the browser's localStorage. A Windows app or a server can later */
/* replace this file without changing any screens. */
/* The key keeps the app's earlier name (Strata) so notes saved before the rename still load. */
const STORAGE_KEY = 'strata-notespace-v1';

/* What is saved: every note, plus the ids of deleted sample notes so they are not re-added. */
export type StoredNotes = {
  notes: unknown[];
  deleted: string[];
};

/* Returns the saved notes, or null when nothing has been saved yet. */
/* Throws when storage cannot be read, so the frontend can warn that notes will not be kept. */
export function readNotes(): StoredNotes | null {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return null;
  const parsed = JSON.parse(saved);
  if (!Array.isArray(parsed.notes)) return null;
  return {
    notes: parsed.notes,
    deleted: Array.isArray(parsed.deleted) ? parsed.deleted.map(String) : []
  };
}

/* Throws when storage is full or unavailable. */
export function writeNotes(notes: Note[], deleted: string[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, notes, deleted }));
}
