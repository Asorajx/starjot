import type { Category } from '../../shared/types/note';


/* =========================
   Categories Storage
   ========================= */

/* Categories are saved separately from notes, in this browser's localStorage. */
const STORAGE_KEY = 'starjot-categories-v1';

/* Returns the saved list, or null when categories have never been saved. */
export function readCategories(): unknown[] | null {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    return Array.isArray(saved) ? saved : null;
  } catch {
    return null;
  }
}

/* Throws when storage is full or unavailable. */
export function writeCategories(categories: Category[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(categories));
}
