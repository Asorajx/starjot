import type { Category } from '../../shared/types/note';


/* =========================
   Default Categories
   ========================= */

/* The categories Starjot starts with. They can be renamed or removed. */
export const DEFAULT_CATEGORIES: Category[] = [
  { id: 'personal', name: 'Personal' },
  { id: 'work', name: 'Work' },
  { id: 'school', name: 'School' }
];

/* The most categories there can be, including the defaults. */
export const MAX_CATEGORIES = 5;
