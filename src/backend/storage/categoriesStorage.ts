import type { Category } from '../../shared/types/note';
import { keepDamagedCopy } from './damagedCopies';


/* =========================
   Categories Storage
   ========================= */

/* Categories are saved separately from notes, in this browser's localStorage. */
const STORAGE_KEY = 'starjot-categories-v1';

/* Set when saved categories could not be read and could not be copied aside either, so */
/* saving must not write over them. */
let blocked = false;

/* Returns the saved list, or null when categories have never been saved (or could not be */
/* read: those are copied aside first, see damagedCopies.ts). */
export function readCategories(): unknown[] | null {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return null;
    const saved = JSON.parse(raw);
    if (Array.isArray(saved)) return saved;
  } catch {
    if (raw === null) return null;
  }
  blocked = !keepDamagedCopy(STORAGE_KEY, 'Categories', raw);
  return null;
}

/* Throws when storage is full or unavailable. Does nothing while damaged categories could not */
/* be kept aside. */
export function writeCategories(categories: Category[]) {
  if (blocked) return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(categories));
}
