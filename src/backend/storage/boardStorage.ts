import { keepDamagedCopy } from './damagedCopies';


/* =========================
   Boardspace
   ========================= */

/* The Boardspace project: sprints, work items and team members. The key is the one the earlier */
/* Gantt timeline used, so a project made there still opens. The frontend checks the data */
/* (boardspace/board.ts). */
const STORAGE_KEY = 'gantt-studio-saas-v1';

/* Set when the saved project could not be read and could not be copied aside either, so */
/* saving must not write over it. */
let blocked = false;

/* The saved project as parsed JSON, or null when none is saved. Broken JSON is copied aside */
/* first (see damagedCopies.ts) and also gives null. */
export function readBoard(): unknown {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    if (raw) markBoardDamaged(raw);
    return null;
  }
}

/* Saved JSON that is not a project at all (see cleanProject) is copied aside the same way. */
export function markBoardDamaged(raw = '') {
  let text = raw;
  try {
    text = text || (localStorage.getItem(STORAGE_KEY) ?? '');
  } catch {
    text = '';
  }
  if (text) blocked = !keepDamagedCopy(STORAGE_KEY, 'Boardspace', text);
}

/* Returns false when saving failed (for example in private browsing). */
export function writeBoard(project: unknown) {
  if (blocked) return false;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
    return true;
  } catch {
    return false;
  }
}
