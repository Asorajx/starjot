import { keepDamagedCopy } from './damagedCopies';


/* =========================
   Categories Storage
   ========================= */

/* Categories used to be saved under their own key. They are now saved with the notes (see */
/* notesStorage.ts), and this older key is only read when a save from before then has none. */
const STORAGE_KEY = 'starjot-categories-v1';

/* Returns the saved list, or null when categories were never saved here (or could not be read: */
/* those are copied aside first, see damagedCopies.ts). */
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
  keepDamagedCopy(STORAGE_KEY, 'Categories', raw);
  return null;
}
